const $ = id => document.getElementById(id);
const micBtn = $("micBtn"), micLabel = $("micLabel"), stopBtn = $("stopBtn"), transcriptEl = $("transcript"), statusEl = $("status"), stateEl = $("sessionState"), conversationEl = $("conversation");
const apiKeyInput = $("apiKey"), modelInput = $("model"), modeInput = $("mode"), saveStatus = $("saveStatus");
const confirmOverlay = $("confirmOverlay"), confirmContext = $("confirmContext"), confirmList = $("confirmList"), confirmApprove = $("confirmApprove"), confirmDeny = $("confirmDeny");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition, sessionActive = false, listening = false, processing = false, autoListen = false, finalText = "";
function addTurn(kind, text) { const empty = conversationEl.querySelector(".empty"); if (empty) empty.remove(); const p = document.createElement("p"); p.className = kind; p.textContent = `${kind === "user" ? "You" : "VoiceBrowser"}: ${text}`; conversationEl.append(p); conversationEl.scrollTop = conversationEl.scrollHeight; }
function setSessionUi(active) { sessionActive = active; stopBtn.disabled = !active; micBtn.classList.toggle("listening", listening); stateEl.textContent = active ? (processing ? "Working…" : listening ? "Listening…" : "Conversation active") : "Session paused"; micLabel.textContent = active ? (listening ? "Listening — tap to pause" : "Resume listening") : "Start conversation"; }
async function activeTab() { return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]; }
async function send(type, extra = {}) { return chrome.runtime.sendMessage({ type, ...extra }); }
async function loadSettings() { const { apiKey, model, mode } = await chrome.storage.local.get(["apiKey", "model", "mode"]); apiKeyInput.value = apiKey || ""; modelInput.value = model || "gemini-2.0-flash-lite"; modeInput.value = ["safe", "assist", "full"].includes(mode) ? mode : "assist"; }
$("saveBtn").addEventListener("click", async () => { await chrome.storage.local.set({ apiKey: apiKeyInput.value.trim(), model: modelInput.value.trim() || "gemini-2.0-flash-lite", mode: modeInput.value }); saveStatus.textContent = "Saved."; setTimeout(() => (saveStatus.textContent = ""), 1500); });

// Confirmation gate: the background worker pauses here before any risky step.
let confirmResolve = null;
function closeConfirm(approved) { confirmOverlay.hidden = true; confirmList.innerHTML = ""; if (confirmResolve) { confirmResolve(approved); confirmResolve = null; } }
confirmApprove.addEventListener("click", () => closeConfirm(true));
confirmDeny.addEventListener("click", () => closeConfirm(false));
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "CONFIRM_ACTION") return;
  const d = msg.detail || {};
  confirmContext.textContent = `${d.title || "This page"} — ${d.url || ""}`;
  (d.items || []).forEach(item => { const li = document.createElement("li"); li.textContent = `${item.type}: ${item.reason}`; confirmList.append(li); });
  confirmOverlay.hidden = false;
  if (confirmResolve) confirmResolve(false);
  confirmResolve = approved => sendResponse({ approved: !!approved });
  return true;
});
function beginRecognition() { if (!recognition || !sessionActive || !autoListen || processing || listening) return; finalText = ""; transcriptEl.textContent = ""; try { recognition.start(); } catch {} }
async function processTranscript(text) {
  if (/^(stop listening|end session|goodbye)$/i.test(text.trim())) {
    sessionActive = false; autoListen = false;
    const tab = await activeTab();
    await send("STOP_SESSION", { tabId: tab.id });
    addTurn("user", text); addTurn("assistant", "Session ended.");
    statusEl.textContent = "Session ended. Task memory remains until New task.";
    setSessionUi(false);
    return;
  }
  processing = true; setSessionUi(true); addTurn("user", text); statusEl.textContent = "Thinking…";
  const response = await send("VOICE_COMMAND", { transcript: text });
  processing = false;
  let resumeAfterSpeech = false;
  if (!response?.ok) { statusEl.textContent = `Could not complete that: ${response?.message || "no response"}`; addTurn("assistant", response?.message || "I lost the connection."); }
  else {
    statusEl.textContent = response.message; addTurn("assistant", response.message);
    if (response.speak) {
      resumeAfterSpeech = true;
      const utterance = new SpeechSynthesisUtterance(response.speak);
      utterance.onend = () => { if (sessionActive && autoListen) setTimeout(beginRecognition, 200); };
      window.speechSynthesis.speak(utterance);
    }
  }
  setSessionUi(sessionActive);
  if (sessionActive && autoListen && !resumeAfterSpeech) setTimeout(beginRecognition, 350);
}
if (!SpeechRecognition) { micBtn.disabled = true; micLabel.textContent = "Speech recognition unsupported"; } else { recognition = new SpeechRecognition(); recognition.continuous = false; recognition.interimResults = true; recognition.lang = "en-US"; recognition.onstart = () => { listening = true; setSessionUi(true); }; recognition.onresult = event => { let text = ""; for (let i = event.resultIndex; i < event.results.length; i++) { text += event.results[i][0].transcript; if (event.results[i].isFinal) finalText += event.results[i][0].transcript; } transcriptEl.textContent = text || finalText; }; recognition.onerror = event => { if (event.error !== "aborted" && event.error !== "no-speech") statusEl.textContent = `Mic error: ${event.error}`; }; recognition.onend = () => { listening = false; setSessionUi(sessionActive); const text = finalText.trim(); if (text && sessionActive && !processing && autoListen) processTranscript(text); else if (sessionActive && !processing && autoListen) setTimeout(beginRecognition, 500); }; }
micBtn.addEventListener("click", async () => { if (!recognition) return; if (!sessionActive) { const tab = await activeTab(); await send("START_SESSION", { tabId: tab.id }); autoListen = true; setSessionUi(true); beginRecognition(); } else if (listening) { autoListen = false; recognition.stop(); setSessionUi(true); statusEl.textContent = "Listening paused."; } else { autoListen = true; setSessionUi(true); beginRecognition(); } });
stopBtn.addEventListener("click", async () => { sessionActive = false; autoListen = false; if (listening) recognition.abort(); const tab = await activeTab(); await send("STOP_SESSION", { tabId: tab.id }); setSessionUi(false); statusEl.textContent = "Session ended. Task memory remains until New task."; });
$("newTaskBtn").addEventListener("click", async () => { const tab = await activeTab(); await send("CLEAR_SESSION", { tabId: tab.id }); conversationEl.innerHTML = '<p class="empty">New task ready. Tell me what you would like to do.</p>'; statusEl.textContent = "Task memory cleared."; });
loadSettings(); setSessionUi(false);
