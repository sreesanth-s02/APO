const EXTENSION_ROOT_ID = "apo-root";
const MIN_CHARS_TO_SHOW = 8;
const PAUSE_MS = 350;
const HIGH_CONFIDENCE = 0.70; // Trust the ML result if above this
const CLARIFICATION_THRESHOLD = 0.75; // Ask follow-up questions if below this

const DEFAULT_SETTINGS = {
    mode: "simple",
    prefersBullets: true,
    verbosity: "medium"
};

const clarificationMap = {
    learning: {
        question: "Do you want a simple explanation or interview prep?",
        options: ["simple explanation", "interview prep"]
    },
    coding: {
        question: "Do you want code only or code with a short explanation?",
        options: ["code only", "code with explanation"]
    },
    debugging: {
        question: "Is this a logic bug or a syntax/error message?",
        options: ["logic bug", "syntax/runtime error"]
    },
    story_writing: {
        question: "Do you want it more engaging or more clear?",
        options: ["more engaging", "more clear"]
    },
    general: {
        question: "Do you want a short answer or a detailed answer?",
        options: ["short answer", "detailed answer"]
    }
};

const sharedState = {
    settings: { ...DEFAULT_SETTINGS },
    textarea: null,
    root: null,
    button: null,
    revertBtn: null,
    cancelBtn: null,
    panel: null,
    meta: null,
    debounceId: null,
    observer: null,
    lastOptimizedInput: "",
    lastOptimizedOutput: "",
    isInterrupted: false
};