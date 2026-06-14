(function () {
    function start() {
        if (typeof initializePromptOptimizer === "function") {
            initializePromptOptimizer();
            return;
        }

        window.setTimeout(start, 50);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();