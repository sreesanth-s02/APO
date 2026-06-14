print("TRAINING SCRIPT STARTED 🚀")

import pandas as pd
from datasets import Dataset
from transformers import (
    DistilBertTokenizerFast,
    DistilBertForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding
)
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score
import numpy as np

# =========================
# LOAD DATASET
# =========================

df = pd.read_csv("prompt_intent_dataset.csv")

print("\nDataset Loaded:")
print(df.head())

# =========================
# FIXED LABEL ORDER
# =========================

labels = [
    "coding",
    "debugging",
    "learning",
    "email",
    "story_writing",
    "script_writing",
    "image_generation",
    "summarization",
    "rewriting",
    "translation",
    "general"
]

# =========================
# LABEL ENCODING
# =========================

# Remove completely empty rows (common at the end of CSVs)
initial_count = len(df)
df = df.dropna(subset=["text", "label"], how="any")
if len(df) < initial_count:
    print(f"ℹ️ Dropped {initial_count - len(df)} rows with missing text or label fields.")

# Clean the text to ensure no empty strings are being trained
df["text"] = df["text"].astype(str).str.strip()
pre_strip_count = len(df)
df = df[df["text"] != ""]
if len(df) < pre_strip_count:
    print(f"ℹ️ Dropped {pre_strip_count - len(df)} rows where text was empty after cleaning.")

label2id = {
    label: idx for idx, label in enumerate(labels)
}

id2label = {
    idx: label for label, idx in label2id.items()
}

# Clean the labels in the dataframe (remove accidental spaces)
df["label"] = df["label"].astype(str).str.strip()
df["label"] = df["label"].str.replace(" ", "_")

# Map sub-labels or legacy labels to the final set
label_fixes = {"url_debugging": "debugging"}
df["label"] = df["label"].replace(label_fixes)

# Convert labels to IDs
df["label_id"] = df["label"].map(label2id)

# Identify rows that will be dropped
invalid_rows = df[df["label_id"].isna()]
if not invalid_rows.empty:
    print("\n⚠️ Found rows with invalid labels (these will be dropped):")
    print(invalid_rows["label"].unique())

# Remove rows with invalid labels
df = df.dropna(subset=["label_id"])

# Convert to int
df["label_id"] = df["label_id"].astype(int)

print("\nLabel Mapping:")
print(label2id)

print("\nDataset Size:", len(df))

# =========================
# SPLIT-SAFE LABEL PREP
# =========================

label_counts = df["label_id"].value_counts()
eligible_labels = label_counts[label_counts >= 2].index
singleton_mask = ~df["label_id"].isin(eligible_labels)

singleton_df = df[singleton_mask].copy()
split_df = df[~singleton_mask].copy()

if len(singleton_df) > 0:
    print("\nLabels with only one example will be kept in the training set:")
    print(singleton_df[["text", "label"]].drop_duplicates(subset=["label"]))

# =========================
# TRAIN TEST SPLIT
# =========================

if len(split_df) > 0:
    train_df, test_df = train_test_split(
        split_df,
        test_size=0.2,
        random_state=42,
        stratify=split_df["label_id"]
    )
else:
    train_df = pd.DataFrame(columns=df.columns)
    test_df = pd.DataFrame(columns=df.columns)

if len(singleton_df) > 0:
    train_df = pd.concat([train_df, singleton_df], ignore_index=True)

if len(test_df) == 0:
    raise ValueError(
        "Not enough split-eligible data to create a test set. "
        "Add more examples for labels with at least two rows."
    )

print("\nTrain Size:", len(train_df))
print("Test Size:", len(test_df))

# =========================
# CONVERT TO HF DATASET
# =========================

train_dataset = Dataset.from_pandas(train_df)
test_dataset = Dataset.from_pandas(test_df)

# =========================
# LOAD TOKENIZER
# =========================

tokenizer = DistilBertTokenizerFast.from_pretrained(
    "distilbert-base-uncased"
)

# =========================
# TOKENIZATION FUNCTION
# =========================

def tokenize(batch):

    return tokenizer(
        batch["text"],
        truncation=True,
        max_length=64
    )

train_dataset = train_dataset.map(tokenize, batched=True)
test_dataset = test_dataset.map(tokenize, batched=True)

# =========================
# FORMAT DATASETS
# =========================

train_dataset = train_dataset.rename_column(
    "label_id",
    "labels"
)

test_dataset = test_dataset.rename_column(
    "label_id",
    "labels"
)

train_dataset.set_format(
    type="torch",
    columns=[
        "input_ids",
        "attention_mask",
        "labels"
    ]
)

test_dataset.set_format(
    type="torch",
    columns=[
        "input_ids",
        "attention_mask",
        "labels"
    ]
)

# =========================
# LOAD MODEL
# =========================

model = DistilBertForSequenceClassification.from_pretrained(
    "distilbert-base-uncased",
    num_labels=len(labels),
    id2label=id2label,
    label2id=label2id
)

# =========================
# METRICS
# =========================

def compute_metrics(eval_pred):

    logits, labels = eval_pred

    predictions = np.argmax(logits, axis=-1)

    accuracy = accuracy_score(labels, predictions)

    f1 = f1_score(
        labels,
        predictions,
        average="weighted"
    )

    return {
        "accuracy": accuracy,
        "f1": f1
    }

# =========================
# TRAINING ARGUMENTS
# =========================

training_args = TrainingArguments(
    output_dir="./results",

    eval_strategy="epoch",
    save_strategy="epoch",

    learning_rate=2e-5,

    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,

    num_train_epochs=3,

    weight_decay=0.01,

    logging_dir="./logs",

    logging_steps=10,

    load_best_model_at_end=True,

    metric_for_best_model="f1",

    save_total_limit=2
)

# =========================
# TRAINER
# =========================

data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

trainer = Trainer(
    model=model,

    args=training_args,

    train_dataset=train_dataset,
    eval_dataset=test_dataset,

    data_collator=data_collator,

    compute_metrics=compute_metrics
)

# =========================
# TRAIN MODEL
# =========================

print("\nTraining Started 🔥\n")

trainer.train()

# =========================
# EVALUATE MODEL
# =========================

results = trainer.evaluate()

print("\nEvaluation Results 📊")
print(results)

# =========================
# SAVE MODEL
# =========================

model.save_pretrained("./intent_model")
tokenizer.save_pretrained("./intent_model")

print("\nModel saved to ./intent_model ✅")