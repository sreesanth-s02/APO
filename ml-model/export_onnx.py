from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer
import os
import shutil

model_path = "./intent_model"
output_path = "../models/intent_model_onnx"

print("Exporting model to ONNX... 🚀")

# Load and convert
model = ORTModelForSequenceClassification.from_pretrained(model_path, export=True)
tokenizer = AutoTokenizer.from_pretrained(model_path)

# Save the ONNX model and tokenizer
model.save_pretrained(output_path)
tokenizer.save_pretrained(output_path)

# Transformers.js v2 requirement: ONNX weights must be in an 'onnx' subfolder
onnx_folder = os.path.join(output_path, "onnx")
os.makedirs(onnx_folder, exist_ok=True)

# Move the model file
shutil.move(os.path.join(output_path, "model.onnx"), os.path.join(onnx_folder, "model.onnx"))

print(f"Model exported successfully to {output_path} ✅")