function normalizeText(input) {
    return (input || "")
        .replace(/\s+/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
}

function estimateTokens(text) {
    const words = normalizeText(text).split(" ").filter(Boolean).length;
    return Math.ceil(words * 1.33);
}

function tokenEfficiencyCleanup(text) {
    return normalizeText(text)
        .replace(/\b(act as|pretend to be|you are an expert in)\b/gi, "")
        .replace(/\bplease\s+please\b/gi, "please")
        .replace(/\s{2,}/g, " ")
        .trim();
}