// content.js
// Runs inside every page. Two jobs:
//   1. SCAN_PAGE   -> build a simplified map of clickable/typeable elements
//   2. EXECUTE_ACTIONS -> perform the actions Gemini decided on

const VOICE_ATTR = "data-voice-id";

// Elements we consider "interactive enough to act on"
const INTERACTIVE_SELECTOR = [
  "a[href]", "button", "input", "textarea", "select",
  "[role='button']", "[role='link']", "[role='textbox']",
  "[contenteditable='true']", "[onclick]"
].join(",");

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
}

function describeElement(el) {
  const tag = el.tagName.toLowerCase();
  const label =
    el.getAttribute("aria-label") ||
    el.getAttribute("placeholder") ||
    el.getAttribute("name") ||
    el.innerText?.trim().slice(0, 80) ||
    el.value?.slice(0, 80) ||
    "";
  return {
    tag,
    type: el.type || null,
    label,
    role: el.getAttribute("role") || null
  };
}

function scanPage() {
  // Clear old ids so re-scans stay accurate after DOM changes
  document.querySelectorAll(`[${VOICE_ATTR}]`).forEach(el => el.removeAttribute(VOICE_ATTR));

  const elements = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR)).filter(isVisible);
  const map = [];

  elements.forEach((el, i) => {
    const id = String(i);
    el.setAttribute(VOICE_ATTR, id);
    map.push({ id, ...describeElement(el) });
  });

  return {
    url: location.href,
    title: document.title,
    elements: map.slice(0, 150) // cap so we don't blow the prompt up on huge pages
  };
}

function findByVoiceId(id) {
  return document.querySelector(`[${VOICE_ATTR}="${CSS.escape(String(id))}"]`);
}

function dispatchInputEvents(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function executeAction(action) {
  const { type, target_id, value, direction } = action;

  switch (type) {
    case "click": {
      const el = findByVoiceId(target_id);
      if (!el) throw new Error(`No element with id ${target_id}`);
      el.scrollIntoView({ block: "center", behavior: "instant" });
      el.click();
      break;
    }
    case "type": {
      const el = findByVoiceId(target_id);
      if (!el) throw new Error(`No element with id ${target_id}`);
      el.focus();
      if ("value" in el) {
        el.value = value ?? "";
      } else {
        el.textContent = value ?? "";
      }
      dispatchInputEvents(el);
      break;
    }
    case "select": {
      const el = findByVoiceId(target_id);
      if (!el || el.tagName.toLowerCase() !== "select") throw new Error(`No <select> with id ${target_id}`);
      el.value = value ?? "";
      dispatchInputEvents(el);
      break;
    }
    case "scroll": {
      const amount = direction === "up" ? -600 : 600;
      window.scrollBy({ top: amount, behavior: "smooth" });
      break;
    }
    case "submit": {
      const el = findByVoiceId(target_id);
      if (!el) throw new Error(`No element with id ${target_id}`);
      const form = el.closest("form");
      if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
      else el.click();
      break;
    }
    case "speak": {
      const utterance = new SpeechSynthesisUtterance(value || "");
      window.speechSynthesis.speak(utterance);
      break;
    }
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCAN_PAGE") {
    sendResponse(scanPage());
    return true;
  }

  if (msg.type === "EXECUTE_ACTIONS") {
    const results = [];
    for (const action of msg.actions) {
      try {
        executeAction(action);
        results.push({ action, ok: true });
      } catch (err) {
        results.push({ action, ok: false, error: String(err.message || err) });
      }
    }
    sendResponse({ results });
    return true;
  }
});
