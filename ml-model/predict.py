from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import torch.nn.functional as F
import sys

# Load saved model
model_path = "./intent_model"

try:
    print("Loading Intent Predictor... ⏳")
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForSequenceClassification.from_pretrained(model_path)
    
    # Use GPU if available
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()
    
    # Use the labels defined in the model configuration
    id2label = model.config.id2label
except Exception as e:
    print(f"Error loading model from {model_path}: {e}")
    sys.exit(1)

print(f"Intent Predictor Ready 🚀 [Device: {device}]")
print("Type 'exit' or press Ctrl+C to quit.\n")

try:
    while True:
        text = input("Enter Prompt: ").strip()

        if not text:
            continue

        if text.lower() == "exit":
            break

        # Tokenize input
        inputs = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            padding=True
        ).to(device)

        # Prediction
        with torch.no_grad():
            outputs = model(**inputs)
            # Calculate probabilities using Softmax
            probs = F.softmax(outputs.logits, dim=1)
            confidence, predicted_idx = torch.max(probs, dim=1)

        predicted_class = int(predicted_idx.item())
        conf_score = confidence.item()

        if predicted_class in id2label:
            print(f"\nPredicted Intent: {id2label[predicted_class]} ({conf_score:.2%} confidence)\n")
        else:
            print(f"\nWarning: Predicted class {predicted_class} not found in model config.\n")

except KeyboardInterrupt:
    print("\nExiting... 👋")