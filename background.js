// background.js
// Coordinator: receives a transcript from the popup, loops with the content
// script + Gemini until the task is done or a step cap is hit.
 
const MAX_STEPS = 8;
const DEFAULT_MODEL = "gemini-2.0-flash-lite";
 
// Actions that don't touch page content, so they run straight from the
// background worker via chrome.tabs — no content script required. This is
// what lets commands work on chrome://newtab and other internal pages where
// content scripts can't be injected at all.
const BROWSER_ACTION_TYPES = new Set(["new_tab", "close_tab", "go_back", "go_forward", "navigate"]);
 
async function getSettings() {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  return { apiKey, model: model || DEFAULT_MODEL };
}
 
function buildSystemPrompt() {
  return `You control a web browser on behalf of a user, using ONLY the elements given to you.
You will receive:
- The user's original spoken command
- A history of actions already taken this turn (may be empty)
- A snapshot of the CURRENT page: url, title, and a list of interactive elements with "id", "tag", "type", "label", "role"
  - If the page has "unscriptable": true, it means this is a browser-internal page (New Tab page, chrome:// settings, Chrome Web Store, etc). Its "elements" list will be empty — you CANNOT click/type/scroll on it. Only browser-level actions work here.
 
Reply with STRICT JSON ONLY, no markdown fences, no commentary, matching this shape:
{
  "actions": [
    { "type": "click", "target_id": "3" },
    { "type": "type", "target_id": "5", "value": "text to type" },
    { "type": "select", "target_id": "2", "value": "option value" },
    { "type": "scroll", "direction": "down" },
    { "type": "submit", "target_id": "5" },
    { "type": "speak", "value": "short thing to say back to the user" },
    { "type": "new_tab", "value": "https://example.com (optional — omit for a blank new tab)" },
    { "type": "close_tab" },
    { "type": "go_back" },
    { "type": "go_forward" },
    { "type": "navigate", "value": "https://example.com" }
  ],
  "done": false,
  "message": "short human-readable status"
}
 
Action categories:
- Page-level (click, type, select, scroll, submit): only valid when the page snapshot has real elements. target_id must match an id from the CURRENT snapshot.
- Browser-level (new_tab, close_tab, go_back, go_forward, navigate, speak): always available, even on an "unscriptable" page. Use "navigate" to go straight to a URL instead of hunting for a link to click.
 
Rules:
- Only reference target_id values that appear in the CURRENT page snapshot.
- Prefer as few actions as possible per turn — if the page will change after an action (navigation, opening a modal, submitting a form, new_tab, close_tab), stop your action list there so you can re-check the new page.
- Set "done": true only when the user's full request has been completed or you need to ask the user something (in which case add a "speak" action asking the question).
- If you cannot find a relevant element and no browser-level action fits, set "done": true and explain in "message".`;
}
 
async function callGemini({ apiKey, model, transcript, history, pageMap }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
 
  const userContent = JSON.stringify(
    {
      command: transcript,
      history,
      page: pageMap
    },
    null,
    2
  );
 
  const body = {
    system_instruction: { parts: [{ text: buildSystemPrompt() }] },
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  };
 
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
 
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
  }
 
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content.");
 
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Gemini did not return valid JSON: ${text.slice(0, 300)}`);
  }
}
 
// Try to scan the page via content script. If there's no content script
// there (browser-internal page like chrome://newtab), fall back to a
// minimal "unscriptable" snapshot instead of throwing — that way Gemini
// still gets a valid turn and can fall back to browser-level actions.
async function scanTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "SCAN_PAGE" });
  } catch {
    const tab = await chrome.tabs.get(tabId);
    return {
      url: tab.url || "unknown",
      title: tab.title || "",
      elements: [],
      unscriptable: true
    };
  }
}
 
async function executeOnTab(tabId, actions) {
  return chrome.tabs.sendMessage(tabId, { type: "EXECUTE_ACTIONS", actions });
}
 
// Browser-level actions run directly via chrome.tabs, no content script
// needed. Returns the tabId that should be used for the NEXT step (it can
// change — e.g. new_tab opens a different tab than the one we started on).
async function executeBrowserAction(action, tabId) {
  switch (action.type) {
    case "new_tab": {
      const created = await chrome.tabs.create({ url: action.value || undefined });
      return created.id;
    }
    case "close_tab": {
      await chrome.tabs.remove(tabId);
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      return active ? active.id : tabId;
    }
    case "go_back":
      await chrome.tabs.goBack(tabId);
      return tabId;
    case "go_forward":
      await chrome.tabs.goForward(tabId);
      return tabId;
    case "navigate":
      await chrome.tabs.update(tabId, { url: action.value });
      return tabId;
    default:
      throw new Error(`Unknown browser action type: ${action.type}`);
  }
}
 
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
 
async function handleVoiceCommand(transcript, startTabId) {
  const { apiKey, model } = await getSettings();
  if (!apiKey) {
    return { ok: false, message: "No Gemini API key set. Add one in the popup settings." };
  }
 
  const history = [];
  let tabId = startTabId;
 
  for (let step = 0; step < MAX_STEPS; step++) {
    const pageMap = await scanTab(tabId);
    const result = await callGemini({ apiKey, model, transcript, history, pageMap });
 
    if (result.actions?.length) {
      const pageActions = result.actions.filter(a => !BROWSER_ACTION_TYPES.has(a.type));
      const browserActions = result.actions.filter(a => BROWSER_ACTION_TYPES.has(a.type));
      const execResults = [];
 
      // Run page-level actions first (against the page we just scanned)...
      if (pageActions.length) {
        const res = await executeOnTab(tabId, pageActions);
        execResults.push(...(res?.results || []));
      }
 
      // ...then browser-level actions, which may change which tab we're on.
      for (const action of browserActions) {
        try {
          tabId = await executeBrowserAction(action, tabId);
          execResults.push({ action, ok: true });
        } catch (err) {
          execResults.push({ action, ok: false, error: String(err.message || err) });
        }
      }
 
      history.push({ step, actions: result.actions, execResult: execResults });
      await wait(600); // let the page settle before re-scanning
    }
 
    if (result.done) {
      return { ok: true, message: result.message || "Done." };
    }
  }
 
  return { ok: false, message: "Stopped after reaching the step limit — task may be incomplete." };
}
 
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "VOICE_COMMAND") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) throw new Error("No active tab found.");
        const outcome = await handleVoiceCommand(msg.transcript, tab.id);
        sendResponse(outcome);
      } catch (err) {
        sendResponse({ ok: false, message: String(err.message || err) });
      }
    })();
    return true; // keep the message channel open for the async response
  }
});
