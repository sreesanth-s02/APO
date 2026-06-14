const DEFAULTS = {
	mode: "simple",
	prefersBullets: true,
	verbosity: "medium"
};

const modeEl = document.getElementById("mode");
const prefersBulletsEl = document.getElementById("prefersBullets");
const verbosityEl = document.getElementById("verbosity");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("status");

function setStatus(text) {
	statusEl.textContent = text;
	window.setTimeout(() => {
		if (statusEl.textContent === text) {
			statusEl.textContent = "";
		}
	}, 1800);
}

function loadSettings() {
	chrome.storage.sync.get(DEFAULTS, (items) => {
		modeEl.value = items.mode;
		prefersBulletsEl.checked = !!items.prefersBullets;
		verbosityEl.value = items.verbosity;
	});
}

function saveSettings() {
	const payload = {
		mode: modeEl.value,
		prefersBullets: prefersBulletsEl.checked,
		verbosity: verbosityEl.value
	};

	chrome.storage.sync.set(payload, () => {
		setStatus("Settings saved");
	});
}

saveBtn.addEventListener("click", saveSettings);

loadSettings();
