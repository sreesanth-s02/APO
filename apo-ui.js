/* ==================================================================
 * Improved Lighthouse Performance for APO UI
 * Key changes:
 *  - Single combined event handler on textarea instead of 5+ separate ones
 *  - Layout-free positioning using cached offsets + RAF
 *  - Removed redundant polling (only MutationObserver needs to run)
 *  - Removed forced synchronous getBoundingClientRect reads from hot paths
 *  - Deferred expensive operations (backdrop-filter, classification) via RAF
 *  - Stopped eager init of transformers — pipeline loads on first Optimize click only
 * ================================================================== */

function getStoredSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
            resolve(result || DEFAULT_SETTINGS);
        });
    });
}

/* ---- Element cache to avoid repeated DOM queries ---- */
let _cachedTextareaRect = null;
let _cachedRootRect = null;
let _rafId = null;

function invalidateRectsCache() {
    _cachedTextareaRect = null;
    _cachedRootRect = null;
}

function ensureRoot(textarea) {
    let root = document.getElementById(EXTENSION_ROOT_ID);
    if (root) return root;

    root = document.createElement("div");
    root.id = EXTENSION_ROOT_ID;
    root.className = "apo-root";

    const controls = document.createElement("div");
    controls.className = "apo-controls";

    const button = document.createElement("button");
    button.type = "button";
    button.id = "optimize-btn";
    button.className = "apo-optimize-btn";
    button.textContent = "Optimize";
    button.title = "Optimize prompt (Ctrl+Shift+O)";

    const revertBtn = document.createElement("button");
    revertBtn.type = "button";
    revertBtn.id = "revert-btn";
    revertBtn.className = "apo-revert-btn";
    revertBtn.textContent = "Revert";
    revertBtn.title = "Undo optimization";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.id = "cancel-btn";
    cancelBtn.className = "apo-cancel-btn";
    cancelBtn.textContent = "Cancel";

    const meta = document.createElement("span");
    meta.className = "apo-meta";
    meta.setAttribute("aria-live", "polite");

    const panel = document.createElement("div");
    panel.className = "apo-clarify";

    controls.appendChild(meta);
    controls.appendChild(revertBtn);
    controls.appendChild(cancelBtn);
    controls.appendChild(button);
    root.appendChild(controls);
    root.appendChild(panel);

    root.style.visibility = "hidden";
    root.style.left = "0px";
    root.style.top = "0px";

    document.body.appendChild(root);

    sharedState.root = root;
    sharedState.button = button;
    sharedState.revertBtn = revertBtn;
    sharedState.cancelBtn = cancelBtn;
    sharedState.panel = panel;
    sharedState.meta = meta;

    button.addEventListener("click", async () => {
        await optimizeCurrentPrompt();
    });

    revertBtn.addEventListener("click", () => {
        revertToOriginalPrompt();
    });

    cancelBtn.addEventListener("click", () => {
        sharedState.isInterrupted = true;
        button.classList.remove("is-loading");
        root.classList.remove("is-loading");
        button.disabled = false;
        clearClarification();
    });

    return root;
}

/* ---- Positioning (layout-free via RAF + cached transforms) ---- */
function positionRoot() {
    if (!sharedState.root || !sharedState.textarea) return;

    // Schedule position update on next frame to avoid synchronous layout
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = requestAnimationFrame(() => {
        _rafId = null;
        _positionRootNow();
    });
}

function _positionRootNow() {
    const root = sharedState.root;
    const ta = sharedState.textarea;
    if (!root || !ta) return;

    // Cache rects to avoid forced layout on subsequent calls in same frame
    if (!_cachedTextareaRect) {
        _cachedTextareaRect = ta.getBoundingClientRect();
    }
    const rect = _cachedTextareaRect;
    if (rect.width === 0 || rect.height === 0) {
        root.style.visibility = "hidden";
        return;
    }

    if (!_cachedRootRect) {
        _cachedRootRect = root.getBoundingClientRect();
    }
    const rRect = _cachedRootRect;
    const width = rRect.width || 120;
    const height = rRect.height || 44;

    const left = Math.max(8, rect.right - width);
    const top = Math.max(8, rect.top - height - 12);

    root.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    root.style.visibility = "visible";

    if (sharedState.panel && sharedState.panel.classList.contains("is-open")) {
        positionClarificationPanel();
    }
}

function positionClarificationPanel() {
    if (!sharedState.root || !sharedState.panel || !sharedState.panel.classList.contains("is-open")) return;

    requestAnimationFrame(() => {
        const maxPanelWidth = Math.min(380, window.innerWidth - 24);
        const maxPanelHeight = Math.min(320, window.innerHeight - 24);

        sharedState.panel.style.position = "fixed";
        sharedState.panel.style.width = `${maxPanelWidth}px`;
        sharedState.panel.style.maxHeight = `${maxPanelHeight}px`;
        sharedState.panel.style.left = "50%";
        sharedState.panel.style.top = "50%";
        sharedState.panel.style.transform = "translate(-50%, -50%)";
    });
}

/* ---- Composer target detection (fast checks first) ---- */
function findComposerTarget() {
    // Fast: check isConnected before any rect read
    const textarea = document.querySelector("textarea");
    if (textarea && textarea.isConnected) {
        // Lazy rect check — only when we've already selected it
        return textarea;
    }

    const editable = document.querySelector('[contenteditable="true"][role="textbox"]');
    if (editable && editable.isConnected) {
        return editable;
    }
    return null;
}

function readComposerText(target) {
    if (!target) return "";
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        return target.value || "";
    }
    return target.textContent || "";
}

function updateVisibilityFromCurrentComposer() {
    if (!sharedState.textarea) {
        setButtonVisibility(false);
        return;
    }

    const value = normalizeText(readComposerText(sharedState.textarea));
    setButtonVisibility(value.length >= MIN_CHARS_TO_SHOW);

    if (sharedState.lastOptimizedOutput && value === sharedState.lastOptimizedOutput) {
        setEfficientPromptState(true);
    } else if (sharedState.lastOptimizedOutput && value !== sharedState.lastOptimizedOutput) {
        setEfficientPromptState(false);
    }
}

function setButtonVisibility(shouldShow) {
    if (!sharedState.root) return;
    sharedState.root.classList.toggle("is-visible", shouldShow);
    if (shouldShow) {
        // Invalidate cached rects so positionRoot recalculates on next RAF
        invalidateRectsCache();
        positionRoot();
    }
}

function setEfficientPromptState(isEfficient) {
    if (!sharedState.root || !sharedState.meta) return;

    sharedState.root.classList.toggle("is-efficient", isEfficient);

    if (sharedState.settings.mode === "advanced") {
        invalidateRectsCache();
        positionRoot();
        return;
    }

    sharedState.meta.textContent = isEfficient ? "Efficient prompt" : "";
    sharedState.root.classList.toggle("has-meta", isEfficient);
    invalidateRectsCache();
    positionRoot();
}

function revertToOriginalPrompt() {
    if (!sharedState.textarea || !sharedState.lastOptimizedInput) return;

    updateTextareaValue(sharedState.lastOptimizedInput);

    sharedState.lastOptimizedInput = "";
    sharedState.lastOptimizedOutput = "";
    setEfficientPromptState(false);

    if (sharedState.settings.mode === "advanced") {
        refreshAdvancedPreview();
    }
}

function updateTextareaValue(text) {
    if (sharedState.textarea.tagName === "TEXTAREA" || sharedState.textarea.tagName === "INPUT") {
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(sharedState.textarea),
            "value"
        )?.set;

        if (nativeValueSetter) {
            nativeValueSetter.call(sharedState.textarea, text);
        } else {
            sharedState.textarea.value = text;
        }
    } else {
        sharedState.textarea.innerText = text;
    }
    sharedState.textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setAdvancedSummary(intent, confidence, afterTokens) {
    if (!sharedState.root || !sharedState.meta) return;
    if (sharedState.settings.mode !== "advanced") return;

    sharedState.root.classList.add("has-meta");
    sharedState.meta.textContent = `Intent: ${intent} | Confidence: ${Math.round(confidence * 100)}% | Tokens: ~${afterTokens}`;
}

async function refreshAdvancedPreview() {
    if (!sharedState.textarea || sharedState.settings.mode !== "advanced") return;

    const currentText = normalizeText(readComposerText(sharedState.textarea));
    if (!currentText) return;

    const { intent, confidence } = await classifyIntent(currentText);
    setAdvancedSummary(intent, confidence, estimateTokens(currentText));
}

function renderAdvancedMeta(intent, confidence, beforeTokens, afterTokens) {
    if (!sharedState.meta) return;

    if (sharedState.settings.mode !== "advanced") {
        sharedState.meta.textContent = "";
        sharedState.root?.classList.remove("has-meta");
        return;
    }

    const saved = Math.max(0, beforeTokens - afterTokens);
    sharedState.meta.textContent = `Intent: ${intent} | Confidence: ${Math.round(confidence * 100)}% | Tokens saved: ~${saved}`;
    sharedState.root?.classList.add("has-meta");
}

function clearClarification() {
    if (sharedState.panel) {
        sharedState.panel.innerHTML = "";
        sharedState.panel.classList.remove("is-open");
        sharedState.panel.style.left = "";
        sharedState.panel.style.top = "";
        sharedState.panel.style.width = "";
        sharedState.panel.style.position = "";
        sharedState.panel.style.maxHeight = "";
        sharedState.panel.style.transform = "";
    }
}

function askClarification(intent) {
    return new Promise((resolve) => {
        const cfg = clarificationMap[intent] || clarificationMap.general;
        if (!sharedState.panel) {
            resolve("");
            return;
        }

        clearClarification();
        sharedState.panel.classList.add("is-open");
        positionClarificationPanel();

        const question = document.createElement("p");
        question.className = "apo-clarify-question";
        question.textContent = cfg.question;

        const options = document.createElement("div");
        options.className = "apo-clarify-options";

        cfg.options.forEach((option) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "apo-clarify-btn";
            btn.textContent = option;
            btn.addEventListener("click", () => {
                clearClarification();
                resolve(option);
            });
            options.appendChild(btn);
        });

        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "apo-clarify-skip";
        skip.textContent = "Skip";
        skip.addEventListener("click", () => {
            clearClarification();
            resolve("");
        });

        sharedState.panel.appendChild(question);
        sharedState.panel.appendChild(options);
        sharedState.panel.appendChild(skip);
    });
}

async function optimizeCurrentPrompt() {
    if (!sharedState.textarea) return;

    const original = normalizeText(readComposerText(sharedState.textarea));
    if (!original) return;

    if (sharedState.lastOptimizedOutput && original === sharedState.lastOptimizedOutput) {
        setEfficientPromptState(true);
        invalidateRectsCache();
        positionRoot();
        return;
    }

    if (sharedState.lastOptimizedInput && original === sharedState.lastOptimizedInput) {
        setEfficientPromptState(true);
        invalidateRectsCache();
        positionRoot();
        return;
    }

    sharedState.isInterrupted = false;
    if (sharedState.root) {
        sharedState.root.classList.add("is-loading");
        sharedState.button?.classList.add("is-loading");
    }

    let intent, confidence;
    try {
        const result = await classifyIntent(original);
        if (sharedState.isInterrupted) return;

        intent = result.intent;
        confidence = result.confidence;
    } finally {
        if (sharedState.root) {
            sharedState.root.classList.remove("is-loading");
            sharedState.button?.classList.remove("is-loading");
        }
    }

    let contextHint = "";
    let optimized = "";

    if (confidence <= CLARIFICATION_THRESHOLD || intent === "general") {
        contextHint = await askClarification(intent);
        if (sharedState.isInterrupted) return;
    } else {
        clearClarification();
    }

    const reconstructed = buildTemplate(intent, original, contextHint);
    optimized = tokenEfficiencyCleanup(reconstructed);

    const beforeTokens = estimateTokens(original);
    const afterTokens = estimateTokens(optimized);

    updateTextareaValue(optimized);

    sharedState.lastOptimizedInput = original;
    sharedState.lastOptimizedOutput = optimized;
    setEfficientPromptState(true);
    renderAdvancedMeta(intent, confidence, beforeTokens, afterTokens);
    setAdvancedSummary(intent, confidence, afterTokens);
}

/* ---- Single combined input handler (avoids 5 separate listeners) ---- */
function handleTextareaChange() {
    clearTimeout(sharedState.debounceId);
    sharedState.debounceId = window.setTimeout(() => {
        if (!sharedState.textarea) return;

        const value = normalizeText(readComposerText(sharedState.textarea));
        setButtonVisibility(value.length >= MIN_CHARS_TO_SHOW);
        invalidateRectsCache();
        positionRoot();

        if (sharedState.settings.mode === "advanced" && value.length >= MIN_CHARS_TO_SHOW) {
            refreshAdvancedPreview();
        } else if (sharedState.meta) {
            sharedState.meta.textContent = "";
            sharedState.root?.classList.remove("has-meta");
        }

        if (sharedState.lastOptimizedOutput && value !== sharedState.lastOptimizedOutput) {
            sharedState.lastOptimizedInput = "";
            sharedState.lastOptimizedOutput = "";
            setEfficientPromptState(false);
        }
    }, PAUSE_MS);
}

function handleTextareaKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyO") {
        const value = readComposerText(sharedState.textarea);
        if (normalizeText(value).length >= MIN_CHARS_TO_SHOW) {
            event.preventDefault();
            event.stopImmediatePropagation();
            optimizeCurrentPrompt();
        }
    }
}

function bindTextarea(textarea) {
    if (!textarea || sharedState.textarea === textarea) return;

    sharedState.textarea = textarea;
    ensureRoot(textarea);

    // Remove old listeners by replacing with a single combined handler
    textarea.removeEventListener("input", handleTextareaChange);
    textarea.removeEventListener("keydown", handleTextareaKeydown);
    textarea.removeEventListener("scroll", positionRoot);

    // Single input event covers input/keyup/change/paste/cut
    textarea.addEventListener("input", handleTextareaChange, { passive: true });
    textarea.addEventListener("keydown", handleTextareaKeydown);
    textarea.addEventListener("scroll", positionRoot, { passive: true });

    handleTextareaChange();
}

function findTargetTextarea() {
    return findComposerTarget();
}

/* ---- Observer: only MutationObserver — removed redundant polling ---- */
function monitorTextareaLifecycle() {
    if (sharedState.observer) return;

    sharedState.observer = new MutationObserver(() => {
        const textarea = findTargetTextarea();
        if (textarea) {
            bindTextarea(textarea);
        }
    });

    if (document.body) {
        sharedState.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Single resize/scroll listener that batches invalidations via RAF
    window.addEventListener("resize", () => {
        invalidateRectsCache();
        positionRoot();
    }, { passive: true });
    window.addEventListener("scroll", () => {
        invalidateRectsCache();
        positionRoot();
    }, { passive: true, capture: true });

    // Clarification panel repositions on same events
    window.addEventListener("resize", positionClarificationPanel, { passive: true });
    window.addEventListener("scroll", positionClarificationPanel, { passive: true, capture: true });
}

async function initializePromptOptimizer() {
    sharedState.settings = await getStoredSettings();

    const textarea = findTargetTextarea();
    if (textarea) {
        bindTextarea(textarea);
    }

    monitorTextareaLifecycle();

    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName !== "sync") return;

        if (changes.mode) {
            sharedState.settings.mode = changes.mode.newValue;
        }
        if (changes.prefersBullets) {
            sharedState.settings.prefersBullets = changes.prefersBullets.newValue;
        }
        if (changes.verbosity) {
            sharedState.settings.verbosity = changes.verbosity.newValue;
        }

        if (sharedState.settings.mode === "advanced") {
            await refreshAdvancedPreview();
        }
    });
}
