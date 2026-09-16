// A task can legitimately need several screens of traversal. Progress and a
// hard ceiling, rather than a tiny fixed allowance, keep this autonomous.
const MAX_STEPS = 48;
const DEFAULT_MODEL = "gemini-2.0-flash-lite";
const BROWSER_ACTION_TYPES = new Set(["new_tab", "close_tab", "go_back", "go_forward", "navigate"]);
const PAGE_ACTION_TYPES = new Set(["click", "type", "select", "scroll", "submit", "drag", "draw", "speak"]);
const SESSION_PREFIX = "voice-session:";

chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error));

async function getSettings() {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  return { apiKey, model: model || DEFAULT_MODEL };
}
function sessionKey(tabId) { return `${SESSION_PREFIX}${tabId}`; }
async function getSession(tabId) {
  const data = await chrome.storage.session.get(sessionKey(tabId));
  return data[sessionKey(tabId)] || { active: false, goal: "", summary: "No prior task.", recentTurns: [], actionHistory: [] };
}
async function saveSession(tabId, session) { await chrome.storage.session.set({ [sessionKey(tabId)]: session }); }
function remember(session, role, text) { session.recentTurns = [...session.recentTurns, { role, text, at: Date.now() }].slice(-8); }
function updateSummary(session, transcript, message) {
  session.goal ||= transcript;
  session.summary = `Goal: ${session.goal}. Latest user request: ${transcript}. Latest outcome: ${message}`.slice(0, 900);
}

function buildSystemPrompt() {
  return `You are a careful persistent browser voice assistant. Reply with STRICT JSON only, never prose or markdown.
The exact response shape is: {"actions":[],"done":true,"message":"short status","speak":"optional short spoken reply"}.
Every action MUST be an object in one of these exact forms:
- {"type":"click","target_id":"id from current page"}
- {"type":"type","target_id":"id from current page","value":"text"}
- {"type":"select","target_id":"id from current page","value":"option value"}
- {"type":"scroll","direction":"up" or "down","amount":0.15..3 (optional viewport heights; default 0.85)}
- {"type":"submit","target_id":"id from current page"}
- {"type":"drag","target_id":"id from current page","start":{"x":0..1,"y":0..1},"end":{"x":0..1,"y":0..1}}
- {"type":"draw","target_id":"canvas/application id from current page","points":[{"x":0..1,"y":0..1},{"x":0..1,"y":0..1},...]}
- {"type":"speak","value":"short response"}
- {"type":"new_tab","value":"optional URL"}, {"type":"close_tab"}, {"type":"go_back"}, {"type":"go_forward"}, or {"type":"navigate","value":"URL"}.
Use only ids in the current page. Never invent action types, property names, or ids. The page includes a scroll object with current position, remaining distance, and bottom/top flags. You may repeat scrolling while the page position changes; choose its amount based on the task and remaining distance. Do not scroll farther in a direction when already at that edge. A scroll is progress, not completion: for requests to reach the end, find something farther down, or read a page, keep done:false and re-scan after each scroll until the goal is met or the relevant edge is reached. For drag and draw, x/y are normalized within the target box: 0 is left/top and 1 is right/bottom. If the user says to manually draw after selecting a pencil/pen/brush, use draw with a multi-point path on the visible canvas or application surface; never replace drawing with a click. If the user says to move a selected pencil, use draw or drag, not click. If the request is vague (for example, just "click"), ask what to click with actions:[{"type":"speak","value":"..."}] and done:true. Never repeat an action listed as failed in history. Prefer one page-changing action then stop to re-scan. If information is missing, ask one concise question using speak and done:true. Carry out ordinary authoring work on websites, including creating or editing GitHub files, issues, comments, and pull requests. Ask for confirmation only before irreversible deletion, purchases, payment, or entering passwords or one-time codes.`;
}
async function callGemini({ apiKey, model, transcript, history, pageMap, session }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const prompt = { command: transcript, session: { goal: session.goal, summary: session.summary, recentTurns: session.recentTurns, actionHistory: session.actionHistory.slice(-8) }, history, page: pageMap };
  const body = { system_instruction: { parts: [{ text: buildSystemPrompt() }] }, contents: [{ role: "user", parts: [{ text: JSON.stringify(prompt) }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const text = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");
  try { return JSON.parse(text); } catch { throw new Error("Gemini returned invalid JSON."); }
}

async function scanTab(tabId) {
  try { return await chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE" }); }
  catch { const tab = await chrome.tabs.get(tabId); return { url: tab.url || "unknown", title: tab.title || "", elements: [], unscriptable: true }; }
}
async function executeOnTab(tabId, actions) { return chrome.tabs.sendMessage(tabId, { type: "EXECUTE_ACTIONS", actions }); }
async function executeBrowserAction(action, tabId) {
  switch (action.type) {
    case "new_tab": return (await chrome.tabs.create({ url: action.value || undefined })).id;
    case "close_tab": await chrome.tabs.remove(tabId); return (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id || tabId;
    case "go_back": await chrome.tabs.goBack(tabId); return tabId;
    case "go_forward": await chrome.tabs.goForward(tabId); return tabId;
    case "navigate": await chrome.tabs.update(tabId, { url: action.value }); return tabId;
    default: throw new Error(`Unknown browser action ${action.type}`);
  }
}
function validateActions(actions, page) {
  if (!Array.isArray(actions)) return "actions must be an array";
  const ids = new Set(page.elements.map(el => String(el.id)));
  for (const action of actions) {
    if (!action || (!PAGE_ACTION_TYPES.has(action.type) && !BROWSER_ACTION_TYPES.has(action.type))) return "unknown action";
    if (["click", "type", "select", "submit", "drag", "draw"].includes(action.type) && !ids.has(String(action.target_id))) return `invalid target id for ${action.type}`;
    if (action.type === "navigate" && !action.value) return "navigate requires a URL";
    if (action.type === "scroll" && action.amount != null && (!Number.isFinite(Number(action.amount)) || Number(action.amount) < 0.15 || Number(action.amount) > 3)) return "scroll amount must be between 0.15 and 3 viewport heights";
    if (action.type === "drag" && (!action.start || !action.end)) return "drag requires start and end points";
    if (action.type === "draw" && (!Array.isArray(action.points) || action.points.length < 2)) return "draw requires at least two points";
    const points = action.type === "drag" ? [action.start, action.end] : action.type === "draw" ? action.points : [];
    if (points.some(point => !Number.isFinite(Number(point?.x)) || !Number.isFinite(Number(point?.y)))) return `${action.type} has invalid coordinates`;
  }
  return null;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function immediateVoiceResponse(transcript) {
  const request = transcript.trim();
  if (/^(click|press|select)[.!?]*$/i.test(request)) return "What should I click? You can say the button or link name.";
  return null;
}

async function handleVoiceCommand(transcript, startTabId) {
  const { apiKey, model } = await getSettings();
  if (!apiKey) return { ok: false, message: "No Gemini API key set. Add one in Settings." };
  const session = await getSession(startTabId);
  session.active = true;
  remember(session, "user", transcript);
  const immediateResponse = immediateVoiceResponse(transcript);
  if (immediateResponse) {
    updateSummary(session, transcript, immediateResponse);
    remember(session, "assistant", immediateResponse);
    await saveSession(startTabId, session);
    return { ok: true, message: immediateResponse, speak: immediateResponse };
  }
  const history = [];
  let tabId = startTabId;
  let lastSignature = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const pageMap = await scanTab(tabId);
    let result = await callGemini({ apiKey, model, transcript, history, pageMap, session });
    let validationError = validateActions(result.actions || [], pageMap);
    if (validationError) {
      result = await callGemini({
        apiKey, model, transcript,
        history: [...history, { step, plannerError: `Your previous response was rejected: ${validationError}. Return corrected strict JSON using only current page ids.` }],
        pageMap, session
      });
      validationError = validateActions(result.actions || [], pageMap);
    }
    if (validationError) return { ok: false, message: `I stopped because the plan was unsafe: ${validationError}.` };
    if (!result.actions?.length && !result.done) return { ok: false, message: "I stopped because the assistant produced no next action." };
    // Identical scroll instructions are expected while traversing a long page.
    // They are only a loop if the page has not moved since the prior decision.
    const scrollState = pageMap.scroll ? `${pageMap.url}:${pageMap.scroll.top}:${pageMap.scroll.documentHeight}` : pageMap.url;
    const signature = `${scrollState}|${JSON.stringify(result.actions)}`;
    if (signature === lastSignature) return { ok: false, message: "I stopped to avoid repeating the same action." };
    lastSignature = signature;
    const pageActions = result.actions.filter(action => PAGE_ACTION_TYPES.has(action.type) && action.type !== "speak");
    const browserActions = result.actions.filter(action => BROWSER_ACTION_TYPES.has(action.type));
    const execResults = [];
    if (pageActions.length) {
      try { const res = await executeOnTab(tabId, pageActions); execResults.push(...(res?.results || [])); }
      catch (err) { execResults.push({ ok: false, error: String(err.message || err) }); }
    }
    for (const action of browserActions) {
      try { tabId = await executeBrowserAction(action, tabId); execResults.push({ action, ok: true }); }
      catch (err) { execResults.push({ action, ok: false, error: String(err.message || err) }); }
    }
    history.push({ step, actions: result.actions, execResults });
    session.actionHistory = [...session.actionHistory, { actions: result.actions, execResults, at: Date.now() }].slice(-12);
    if (execResults.some(item => !item.ok)) {
      const message = result.message || "An action failed; I stopped rather than retrying blindly.";
      updateSummary(session, transcript, message); remember(session, "assistant", message); await saveSession(startTabId, session);
      return { ok: false, message, speak: result.speak };
    }
    if (result.done) {
      const message = result.message || "Done.";
      updateSummary(session, transcript, message); remember(session, "assistant", message); await saveSession(startTabId, session);
      return { ok: true, message, speak: result.speak };
    }
    await wait(700);
  }
  const message = `I stopped after ${MAX_STEPS} steps so I do not keep acting without progress.`;
  updateSummary(session, transcript, message); remember(session, "assistant", message); await saveSession(startTabId, session);
  return { ok: false, message };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "START_SESSION") { const s = await getSession(msg.tabId); s.active = true; await saveSession(msg.tabId, s); sendResponse({ ok: true }); return; }
      if (msg.type === "STOP_SESSION") { const s = await getSession(msg.tabId); s.active = false; await saveSession(msg.tabId, s); sendResponse({ ok: true }); return; }
      if (msg.type === "CLEAR_SESSION") { await chrome.storage.session.remove(sessionKey(msg.tabId)); sendResponse({ ok: true }); return; }
      if (msg.type === "VOICE_COMMAND") { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab) throw new Error("No active tab found."); sendResponse(await handleVoiceCommand(msg.transcript, tab.id)); return; }
    } catch (err) { sendResponse({ ok: false, message: String(err.message || err) }); }
  })();
  return true;
});
