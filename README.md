# Adaptive Prompt Optimizer

A high-performance Chrome extension for ChatGPT alone now that uses client-side Machine Learning to transform simple user requests into high-quality, structured prompts. By identifying intent—such as coding, learning, or summarization—it applies expert-level templates locally in your browser.

## 🌟 Overview

The Adaptive Prompt Optimizer bridges the gap between vague user inputs and the structured prompts required to get the best out of Large Language Models. Unlike other tools, this extension performs **all inference locally** using a DistilBERT model via Transformers.js, ensuring your data never leaves your browser.

### Key Features
- **Local Intent Classification:** Real-time intent detection (Coding, Debugging, Storytelling, etc.) using DistilBERT.
- **Recursive Noise Filtering:** Intelligent regex-based filters prevent prompt "stacking" and remove repetitive phrases when re-optimizing.
- **Clarification System:** Dynamically asks follow-up questions when the AI detects ambiguous intent or low confidence.
- **Hardware Accelerated UI:** Optimized with GPU-composited animations for a zero-lag experience on ChatGPT.
- **Revert & Cancel:** One-click restoration to your original input if you want to make manual tweaks.

## 📸 Screenshots

### Optimized Output
*The extension transforms simple requests into structured prompts with constraints and expected output formats.*

![Optimized Prompt Output](https://via.placeholder.com/800x400?text=Screenshot+of+Optimized+Java+Inheritance+Prompt)

Before Optimization

<img width="1590" height="757" alt="image" src="https://github.com/user-attachments/assets/da8f2042-c448-419a-a5a7-5d74297fac77" />

After Optimization

<img width="1592" height="755" alt="image" src="https://github.com/user-attachments/assets/f1009e20-3b62-4de7-b376-c7fccf0b22d3" />



### Quantifiable Performance (Lighthouse)
*High scores achieved through aggressive main-thread management and layout thrashing elimination.*

![Lighthouse Performance](https://via.placeholder.com/800x200?text=Lighthouse+Performance+Score+Table)

<img width="613" height="185" alt="Screenshot 2026-06-14 214408" src="https://github.com/user-attachments/assets/59916eba-40b5-4b53-85b2-3680f4c484f8" />

## 🛠️ Tech Stack

- **Inference:** Transformers.js
- **Runtime:** ONNX Runtime Web (WASM)
- **Model:** DistilBERT (Base Uncased)
- **Frontend:** Vanilla JavaScript, CSS3 (Hardware Accelerated), HTML5
- **Training:** Python, PyTorch, Hugging Face `transformers` & `optimum`

## ⚙️ Project Structure

- `/ml-model`: Python scripts for training (`train.py`) and exporting (`export_onnx.py`) the intent classifier.
- `/models`: The exported ONNX model files used by the extension.
- `/lib`: Local distribution of Transformers.js library.
- `apo-intent.js`: The ML logic and rule-based fallback system.
- `apo-ui.js`: High-performance UI management and positioning logic.
- `apo-templates.js`: Prompt engineering logic and recursive noise removal.

## 📥 Installation & Setup

### 1. Model Preparation (Optional)
The extension comes with a pre-trained model. If you wish to retrain it:
```bash
pip install pandas datasets transformers optimum[onnxruntime] scikit-learn
cd ml-model
python train.py
python export_onnx.py
```

### 2. Loading the Extension
1.  Open Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** (toggle in the top right).
3.  Click **Load unpacked**.
4.  Select the root directory of this project.

## 💡 Usage

1.  Go to ChatGPT.
2.  Start typing a request (e.g., *"Write a Java class for inheritance"*).
3.  Click the **Optimize** button that appears near the text area (or press `Ctrl+Shift+O`).
4.  The ML model will classify your intent and replace your text with an optimized template.
5.  If the result isn't what you wanted, click **Revert**.

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request for any performance improvements or new intent templates.


