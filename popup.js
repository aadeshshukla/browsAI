// popup.js

const micBtn = document.getElementById("micBtn");
const micLabel = document.getElementById("micLabel");
const transcriptEl = document.getElementById("transcript");
const statusEl = document.getElementById("status");

const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const saveBtn = document.getElementById("saveBtn");
const saveStatus = document.getElementById("saveStatus");

// --- Settings: load + save -------------------------------------------------

async function loadSettings() {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  if (apiKey) apiKeyInput.value = apiKey;
  if (model) modelInput.value = model;
}

saveBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim() || "gemini-2.0-flash-lite"
  });
  saveStatus.textContent = "Saved.";
  setTimeout(() => (saveStatus.textContent = ""), 1500);
});

loadSettings();

// --- Speech recognition -----------------------------------------------------

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add("listening");
    micLabel.textContent = "Listening…";
  };

  recognition.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i++) {
      text += event.results[i][0].transcript;
    }
    transcriptEl.textContent = text;
  };

  recognition.onerror = (event) => {
    statusEl.textContent = `Mic error: ${event.error}`;
  };

  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove("listening");
    micLabel.textContent = "Hold to speak";
    const finalText = transcriptEl.textContent.trim();
    if (finalText) sendCommand(finalText);
  };
} else {
  micLabel.textContent = "Speech API unsupported";
  micBtn.disabled = true;
}

micBtn.addEventListener("click", () => {
  if (!recognition) return;
  if (listening) {
    recognition.stop();
  } else {
    transcriptEl.textContent = "";
    statusEl.textContent = "";
    recognition.start();
  }
});

// --- Send transcript to background, show result -----------------------------

function sendCommand(transcript) {
  statusEl.textContent = "Thinking…";
  chrome.runtime.sendMessage({ type: "VOICE_COMMAND", transcript }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
      return;
    }
    if (!response) {
      statusEl.textContent = "No response from background worker.";
      return;
    }
    statusEl.textContent = response.ok ? `✓ ${response.message}` : `✗ ${response.message}`;
  });
}
