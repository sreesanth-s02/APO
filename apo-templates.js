function stripOptimizationNoise(text) {
    return normalizeText(text)
        .replace(/^focus:\s*[^.]+\.\s*/i, "")
        .replace(/^user request:\s*/i, "")
        // Strip common AI names and conversational filler
        .replace(/\b(help me|i have|i need|i want|can you|please|urgent|asap|tomorrow|today|gpt|ai|chatgpt|assistant|and|to|the|a|an|now|just|tell|me|about|thanks?|hey|hi|hello|yo|bro|this)\b/gi, "")
        // Strip context markers that we've already captured in the Tone/Focus logic
        .replace(/\b(study|prepare|preparing|for|with)\s+(interview|exam|test|placement|job prep|presentation)\b/gi, "")
        // NEW: Strip previously applied template structures (to prevent duplication on re-optimization)
        .replace(/\b(Structure|Tone|Expected output|Constraints|Focus|Requirements|Formatting|Details|Audience|Format):\s*([\s\S]*)$/gi, "")

        // NEW: Aggressively remove introductory template phrases to prevent them from leaking into the topic on re-optimization
        .replace(/\b(Write a clean and efficient ([\w+ ]+ )?solution for|Solve this programming task|Debug this ([\w+ ]+ )?code|Debug this code|Explain .+ for a beginner|Summarize|Write a story about|Create a script for|Generate an image prompt for|Translate the following accurately|Rewrite the following text|Write a professional email about|Answer this (directly|with a clear explanation)|Help with|Identify who|List the best|Explain why|Recommend|Show how to)\b\s*[:.]?\s*/gi, "")

        .replace(/^(explain|write|create|summarize|improve|fix|rewrite|draft|make|help)\s+(\1\s+)+/i, "$1 ")
        .replace(/\bkeep the response (clear and balanced in detail|concise|detailed but structured|short but structured)\.?/gi, "")
        .replace(/\bprovide a (detailed|short|concise) but structured response\.?/gi, "")
        .replace(/\bprovide a short but structured response\.?/gi, "")
        .replace(/\bimprove this prompt for clarity and usefulness\.?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function sentenceCase(text) {
    const clean = normalizeText(text);
    if (!clean) {
        return "";
    }

    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function toQuestion(text) {
    const clean = normalizeText(text).replace(/[?.!]+$/, "");
    if (!clean) {
        return "";
    }

    return `${clean.charAt(0).toUpperCase() + clean.slice(1)}?`;
}

function toStatement(text) {
    const clean = normalizeText(text).replace(/[?.!]+$/, "");
    if (!clean) {
        return "";
    }

    return `${clean.charAt(0).toUpperCase() + clean.slice(1)}.`;
}

function extractTopic(text) {
    let topic = normalizeText(text).replace(/[?.!]+$/, "");
    
    // Command Focus: Find the core instruction and discard noise before it.
    // We use a greedy match (.*) to find the LAST occurrence of a command word.
    // This handles "I want you to explain..." -> "explain..." and effectively removes preambles.
    const commandWords = "teach|explain|summarize|write|create|make|show|list|recommend|suggest|how|what|why|where|who|when|which|debug|fix|improve|identify";
    const commandRegex = new RegExp(`.*\\b(${commandWords})\\b`, "i");
    topic = topic.replace(commandRegex, "$1");

    // Remove repeated words at the start
    topic = topic.replace(/^(\w+)(\s+\1\b)+/i, "$1");

    // Remove multiple common prefixes like "Please can you explain teach me..."
    const prefixRegex = /^(and\s+|to\s+|please\s+|can you\s+|could you\s+|would you\s+|should i\s+|how do i\s+|how can i\s+|how to\s+|what are\s+|what is\s+|what's\s+|why is\s+|why are\s+|where can i\s+|where should i\s+|tell me about\s+|give me\s+|list\s+|recommend\s+|suggest\s+|explain\s+|summarize\s+|write\s+|create\s+|make\s+|draft\s+|fix\s+|improve\s+|rewrite\s+|help me\s+|teach\s+|teach me\s+|(a\s+)?clean\s+and\s+efficient\s+([\w+]+\s+)?solution\s+for\s*[:]?\s*|clean\s+efficient\s+([\w+]+\s+)?solution\s+for\s*[:]?\s*)+/i;
    topic = topic.replace(prefixRegex, "").replace(/^[:\s-]+/, "");

    // Remove common suffixes the template might add back
    const suffixRegex = /\b(for\s+(a\s+)?beginner|in\s+simple\s+(terms|words)|clearly|with\s+explanation|briefly|step\s+by\s+step)\b/gi;
    topic = topic.replace(suffixRegex, "");

    return topic.trim();
}

function compressRepeatedWords(text) {
    const words = normalizeText(text).split(" ").filter(Boolean);
    const result = [];

    for (const word of words) {
        if (result[result.length - 1]?.toLowerCase() === word.toLowerCase()) {
            continue;
        }

        result.push(word);
    }

    return result.join(" ").replace(/\s+([?.!,;:])/g, "$1");
}

function rewriteQuestionPrompt(promptText, contextHint) {
    const clean = compressRepeatedWords(normalizeText(promptText)).replace(/[?.!]+$/, "");
    const topic = extractTopic(clean) || clean;
    const lower = clean.toLowerCase();

    if (/^what are\b/.test(lower)) {
        return `List the best ${topic} and briefly explain why each one stands out.`;
    }

    if (/^what is\b/.test(lower) || /^what's\b/.test(lower)) {
        return `Explain ${topic} in simple words.`;
    }

    if (/^how do i\b/.test(lower) || /^how can i\b/.test(lower) || /^how to\b/.test(lower)) {
        return `Show how to ${topic}.`;
    }

    if (/^why is\b/.test(lower) || /^why are\b/.test(lower) || /^why\b/.test(lower)) {
        return `Explain why ${topic}.`;
    }

    if (/^where can i\b/.test(lower) || /^where should i\b/.test(lower) || /^where\b/.test(lower)) {
        return `Recommend ${topic} and briefly explain why each option is useful.`;
    }

    if (/^who\b/.test(lower)) {
        return `Identify who ${topic} and explain why they matter.`;
    }

    if (contextHint === "short answer") {
        return `Answer this clearly: ${clean}.`;
    }

    if (contextHint === "detailed answer") {
        return `Answer this clearly with a helpful explanation: ${clean}.`;
    }

    return `Answer this clearly: ${clean}.`;
}

function rewriteImperativePrompt(promptText, contextHint) {
    const clean = compressRepeatedWords(normalizeText(promptText)).replace(/[?.!]+$/, "");
    const topic = extractTopic(clean) || clean;
    const lower = clean.toLowerCase();

    if (/^explain\b/.test(lower)) {
        return `Explain ${topic} in simple words.`;
    }

    if (/^summarize\b/.test(lower) || /^summary\b/.test(lower)) {
        return `Summarize ${topic} and highlight the main points.`;
    }

    if (/^write\b/.test(lower) || /^create\b/.test(lower) || /^draft\b/.test(lower) || /^make\b/.test(lower)) {
        return `Write ${topic}.`;
    }

    if (/^compare\b/.test(lower) || /^analyze\b/.test(lower)) {
        return `Compare ${topic} and explain the key differences.`;
    }

    if (/^fix\b/.test(lower) || /^debug\b/.test(lower) || /^improve\b/.test(lower) || /^rewrite\b/.test(lower)) {
        return `Improve ${topic} so it is clearer and more useful.`;
    }

    if (/^help me\b/.test(lower)) {
        return `Help with ${topic || clean}.`;
    }

    return toStatement(topic || clean);
}

function formatPrompt(taskLine, sections) {
    const lines = [taskLine.trim()];

    for (const section of sections) {
        if (!section || !section.title || !section.items || section.items.length === 0) {
            continue;
        }

        lines.push("");
        lines.push(`${section.title}:`);
        for (const item of section.items) {
            lines.push(`- ${item}`);
        }
    }

    return lines.join("\n");
}

function detectToneFromPrompt(text) {
    const lower = normalizeText(text).toLowerCase();

    if (/\b(energetic|fun|friendly|casual|playful|exciting)\b/.test(lower)) {
        return "energetic";
    }

    if (/\b(professional|formal|polite|business)\b/.test(lower)) {
        return "professional";
    }

    if (/\b(clear|simple|plain|easy to understand|beginner)\b/.test(lower)) {
        return "clear and simple";
    }

    return "appropriate";
}

function detectAudienceFromPrompt(text) {
    const lower = normalizeText(text).toLowerCase();

    if (/\b(children|kids|students|beginners|new users)\b/.test(lower)) {
        return "beginners";
    }

    if (/\b(developers|programmers|engineers|technical users)\b/.test(lower)) {
        return "technical users";
    }

    if (/\b(clients|customers|audience|readers|followers)\b/.test(lower)) {
        return "the target audience";
    }

    return "the target audience";
}

function detectProgrammingLanguage(text) {
    const lower = text.toLowerCase();
    if (/\bpython\b/.test(lower)) return "Python";
    if (/\b(javascript|js|node)\b/.test(lower)) return "JavaScript";
    if (/\b(java)\b/.test(lower) && !/\bjavascript\b/.test(lower)) return "Java";
    if (/\b(c\+\+|cpp)\b/.test(lower)) return "C++";
    if (/\b(sql|database|mysql|postgres)\b/.test(lower)) return "SQL";
    if (/\b(html|css)\b/.test(lower)) return "Web Development (HTML/CSS)";
    return "";
}

function detectErrorType(text) {
    const lower = text.toLowerCase();
    if (/\b(null pointer|nullpointerexception)\b/.test(lower)) return "Null Pointer Exception";
    if (/\b(syntax error|syntaxissue)\b/.test(lower)) return "Syntax Error";
    if (/\b(index out of bounds|indexerror)\b/.test(lower)) return "Index Out of Bounds Error";
    if (/\b(infinite loop|looping infinitely)\b/.test(lower)) return "Infinite Loop";
    if (/\b(memory leak|memoryissue)\b/.test(lower)) return "Memory Leak";
    if (/\b(segmentation fault|segfault)\b/.test(lower)) return "Segmentation Fault";
    if (/\b(type error|typeissue)\b/.test(lower)) return "Type Error";
    if (/\b(api error|api issue|500 error|404 error)\b/.test(lower)) return "API Error";
    return "";
}

function detectLearningStyle(text) {
    const lower = text.toLowerCase();
    if (/\b(simple|beginner|easy|explain like i'm five)\b/.test(lower)) return "simple explanation";
    if (/\b(detailed|in depth|advanced|thorough)\b/.test(lower)) return "detailed explanation";
    if (/\b(example|examples|show me)\b/.test(lower)) return "with examples";
    if (/\b(interview|job prep|placement)\b/.test(lower)) return "for interview preparation";
    return "";
}

function buildTemplate(intent, userPrompt, contextHint) {
    const cleanedPrompt = compressRepeatedWords(stripOptimizationNoise(userPrompt));
    const basePrompt = cleanedPrompt || normalizeText(userPrompt);
    const topic = extractTopic(basePrompt) || basePrompt;
    const targetStyle = contextHint === "short answer" ? "short" : contextHint === "detailed answer" ? "detailed" : "normal";

    switch (intent) {
        case "coding":
            const lang = detectProgrammingLanguage(basePrompt);
            const taskPrefix = lang ? `Write a clean and efficient ${lang} solution for: ` : "Solve this programming task: ";
            
            return formatPrompt(`${taskPrefix}${topic}.`, [
                {
                    title: "Constraints",
                    items: [
                        "Use clean and readable code",
                        "Keep the solution efficient",
                        "Avoid unnecessary steps"
                    ]
                },
                {
                    title: "Expected output",
                    items: [
                        "Working code",
                        "Short explanation of the approach"
                    ]
                }
            ]);
        case "debugging":
            const debugLang = detectProgrammingLanguage(basePrompt);
            const errorType = detectErrorType(basePrompt);
            const debugPrefix = debugLang ? `Debug this ${debugLang} code: ` : "Debug this code: ";
            const errorDetail = errorType ? `Focus on resolving the ${errorType}.` : "Identify and resolve the root cause of the issue.";

            return formatPrompt(`${debugPrefix}${topic}.`, [
                {
                    title: "Focus",
                    items: [
                        "Isolate the error",
                        errorDetail,
                        "Provide a clear and concise fix"
                    ]
                },
                {
                    title: "Expected output",
                    items: [
                        "Corrected version",
                        "Explanation of what was wrong and how it was fixed"
                    ]
                },
                {
                    title: "Constraints",
                    items: ["Keep the explanation easy to understand."]
                }
            ]);
        case "learning":
            // Avoid adding "for a beginner" if the topic already ends with it 
            // or if the learning style is detected.
            const learningPrefix = topic.toLowerCase().includes("beginner") ? `Explain ${topic}` : `Explain ${topic} for a beginner.`;
            return formatPrompt(sentenceCase(learningPrefix), [
                {
                    title: "Structure",
                    items: [
                        "Start with a simple explanation",
                        "Use a real example",
                        "End with a short summary"
                    ]
                },
                {
                    title: "Tone",
                    items: [detectLearningStyle(basePrompt) || "simple explanation"]
                },
                {
                    title: "Expected output",
                    items: [
                        "Easy-to-follow answer",
                        "At least one example"
                    ]
                }
            ]);
        case "summarization":
            return formatPrompt(`Summarize ${topic}.`, [
                {
                    title: "Structure",
                    items: [
                        "Main points",
                        "Important details",
                        "Short conclusion"
                    ]
                }
            ]);
        case "story_writing":
            return formatPrompt(`Write a story about: ${topic}.`, [
                {
                    title: "Tone",
                    items: [detectToneFromPrompt(basePrompt)]
                },
                {
                    title: "Audience",
                    items: [detectAudienceFromPrompt(basePrompt)]
                }
            ]);
        case "script_writing":
            return formatPrompt(`Create a script for: ${topic}.`, [
                {
                    title: "Format",
                    items: ["Standard script layout", "Include dialogue and scene descriptions"]
                }
            ]);
        case "image_generation":
            return formatPrompt(`Generate an image prompt for: ${topic}.`, [
                {
                    title: "Details",
                    items: [
                        "High resolution and cinematic lighting",
                        "Specify artistic style (e.g., photorealistic, digital art)",
                        "Focus on composition and subject clarity"
                    ]
                }
            ]);
        case "translation":
            return formatPrompt(`Translate the following accurately: ${topic}.`, [
                {
                    title: "Requirements",
                    items: [
                        "Maintain the original tone and context",
                        "Ensure natural flow in the target language"
                    ]
                }
            ]);
        case "rewriting":
            return formatPrompt(`Rewrite the following text: ${topic}.`, [
                {
                    title: "Focus",
                    items: ["Improve clarity and grammar", "Make the tone more professional"]
                }
            ]);
        case "email":
            return formatPrompt(`Write a professional email about ${topic}.`, [
                {
                    title: "Formatting",
                    items: [
                        "Subject line",
                        "Clear body",
                        "Polite closing"
                    ]
                }
            ]);
        default:
            if (/\?$/.test(normalizeText(topic)) || /^what\b|^how\b|^why\b|^where\b|^who\b|^when\b|^which\b/i.test(normalizeText(topic))) {
                return rewriteQuestionPrompt(topic, contextHint);
            }

            if (targetStyle === "short") {
                return `Answer this directly: ${topic}.`;
            }

            if (targetStyle === "detailed") {
                return `Answer this with a clear explanation: ${topic}.`;
            }

            return rewriteImperativePrompt(topic, contextHint);
    }
}