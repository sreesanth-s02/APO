function inferFallbackIntent(text) {
    const lower = normalizeText(text).toLowerCase();

    if (/\b(yes|done|ok|okay|sure|next|what to do next|what next|help me|idk|not sure)\b/.test(lower)) {
        return "general";
    }

    if (/\b(email|subject line|follow up|reply|formal message)\b/.test(lower)) {
        return "email";
    }

    if (/\b(bug|error|debug|crash|stacktrace|exception|nullpointer|runtime|failing)\b/.test(lower)) {
        return "debugging";
    }

    if (/\b(4k|8k|photorealistic|hyperrealistic|vibrant|render|digital art|oil painting|landscape art)\b/.test(lower)) {
        return "image_generation";
    }

    if (/\b(summary|summarize|shorten|tldr|key points|in short)\b/.test(lower)) {
        return "summarization";
    }

    if (/\b(explain|understand|learn|teach|simple words|beginner|what is|what's|how do i|how can i|how to|why is|why are|where can i|where should i|who is|who are|interview|exam|test|placement)\b/.test(lower)) {
        return "learning";
    }

    if (/\b(code|program|python|javascript|java|function|class|algorithm|api|implementation|optimize|refactor|complexity)\b/.test(lower)) {
        return "coding";
    }

    if (/\b(rewrite|rephrase|polish|professional|concise|improve writing)\b/.test(lower)) {
        return "rewriting";
    }

    if (/\b(script|screenplay|dialogue|scene|stage direction)\b/.test(lower)) {
        return "script_writing";
    }

    if (/\b(poem|story|fiction|creative|novel|plot|character)\b/.test(lower)) {
        return "story_writing";
    }

    return "general";
}

function isAmbiguousPrompt(text) {
    const lower = normalizeText(text).toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);

    return (
        words.length <= 7 ||
        /\b(yes|done|ok|okay|sure|next|help me|what to do next|what next|not sure|idk|maybe)\b/.test(lower) ||
        /\b(what|how|why|where|who|when|which)\b/.test(lower) && !/\b(explain|learn|debug|code|write|summarize|email)\b/.test(lower)
    );
}

let pipeline, env;
let classifier = null;

async function initTransformers() {
    if (pipeline) return;
    const module = await import(chrome.runtime.getURL('lib/transformers/transformers.js'));
    pipeline = module.pipeline;
    env = module.env;

    // Configure environment
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.useBrowserCache = false;
    env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('lib/transformers/');
    env.localModelPath = chrome.runtime.getURL('models/'); // Set base path for local models
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.webgl = false; // Disable WebGL to avoid CSP 'eval' warnings
}

async function getClassifier() {
    await initTransformers();
    if (!classifier) {
        // Since env.localModelPath is set to the absolute URL of the 'models/' folder,
        // we only need to provide the relative name of the model directory here.
        const modelID = 'intent_model_onnx';
        classifier = await pipeline('text-classification', modelID, {
            local_files_only: true,
            quantized: false
        });
    }
    return classifier;
}

async function classifyIntentML(text) {
    const model = await getClassifier();
    const results = await model(text);
    
    // Transformers.js returns [{label: 'coding', score: 0.98}]
    return {
        intent: results[0].label,
        confidence: results[0].score
    };
}

async function classifyIntent(text) {
    const lower = text.toLowerCase();

    // 1. Technical "Fast-Path" (Hard Overrides)
    // If we see specific technical keywords, we can be confident even without ML
    if (/\b(python|javascript|java|cpp|rust|sql|api)\b/i.test(lower)) {
        if (/\b(fix|bug|error|crash|debug)\b/i.test(lower)) {
            return { intent: "debugging", confidence: 0.95 };
        }
        if (/\b(write|create|implement|code|function)\b/i.test(lower)) {
            return { intent: "coding", confidence: 0.95 };
        }
    }

    // 2. ML Classification
    try {
        const mlResult = await classifyIntentML(text);
        // If ML is very confident, use it immediately
        if (mlResult.confidence > HIGH_CONFIDENCE) {
            return mlResult;
        }
        
        // If ML is somewhat confident, combine it with a quick keyword check
        const fallbackIntent = inferFallbackIntent(text);
        if (mlResult.intent === fallbackIntent) {
            return { intent: mlResult.intent, confidence: Math.min(0.98, mlResult.confidence + 0.1) };
        }

        return mlResult;
    } catch (e) {
        console.error("ML Classifier Error:", e);
        console.warn("Using rule-based fallback.");
        return { 
            intent: inferFallbackIntent(text), 
            confidence: isAmbiguousPrompt(text) ? 0.35 : 0.55 
        };
    }
}