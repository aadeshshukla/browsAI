// content.js
// Runs inside every page. Two jobs:
//   1. SCAN_PAGE   -> build a simplified map of clickable/typeable elements
//   2. EXECUTE_ACTIONS -> perform the actions Gemini decided on

const VOICE_ATTR = "data-voice-id";

// Elements we consider "interactive enough to act on"
const INTERACTIVE_SELECTOR = [
  "a[href]", "button", "input", "textarea", "select",
  "[role='button']", "[role='link']", "[role='textbox']",
  "[contenteditable='true']", "[onclick]", "canvas", "[role='application']"
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
  const rect = el.getBoundingClientRect();
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
    role: el.getAttribute("role") || null,
    // Coordinates for draw/drag actions are normalized (0 to 1) within this box.
    bounds: { width: Math.round(rect.width), height: Math.round(rect.height) }
  };
}

function canScrollVertically(el) {
  return Boolean(el) && el.scrollHeight - el.clientHeight > 2;
}

function closestScrollable(start) {
  for (let el = start; el && el !== document.documentElement; el = el.parentElement) {
    const style = window.getComputedStyle(el);
    if (canScrollVertically(el) && /auto|scroll|overlay/.test(style.overflowY)) return el;
  }
  return null;
}

function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

// Modern web apps often keep the document fixed and scroll a conversation,
// feed, or results pane instead. Prefer the focused/central pane, then fall
// back to the document and finally the largest visible scrollable region.
function getScrollTarget() {
  const focusedTarget = closestScrollable(document.activeElement);
  if (focusedTarget && isInViewport(focusedTarget)) return focusedTarget;

  const centralElement = document.elementFromPoint(window.innerWidth * 0.6, window.innerHeight * 0.5);
  const centralTarget = closestScrollable(centralElement);
  if (centralTarget && isInViewport(centralTarget)) return centralTarget;

  const root = document.scrollingElement || document.documentElement;
  if (canScrollVertically(root)) return root;

  const candidates = Array.from(document.querySelectorAll("*")).filter(el => {
    if (!isInViewport(el) || !canScrollVertically(el)) return false;
    return /auto|scroll|overlay/.test(window.getComputedStyle(el).overflowY);
  });
  return candidates.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0] || root;
}

function describeScrollTarget() {
  const target = getScrollTarget();
  const top = Math.round(target.scrollTop || 0);
  const viewportHeight = Math.round(target.clientHeight || window.innerHeight);
  const documentHeight = Math.round(target.scrollHeight || viewportHeight);
  const maxTop = Math.max(0, documentHeight - viewportHeight);
  return {
    top,
    viewportHeight,
    documentHeight,
    remaining: Math.max(0, maxTop - top),
    atTop: top <= 1,
    atBottom: top >= maxTop - 1,
    container: target === (document.scrollingElement || document.documentElement) ? "document" : "active content panel"
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
    scroll: describeScrollTarget(),
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

function pointInElement(el, point) {
  const rect = el.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, Number(point?.x))) * rect.width + rect.left;
  const y = Math.max(0, Math.min(1, Number(point?.y))) * rect.height + rect.top;
  return { x, y };
}

function dispatchPointer(el, type, point, buttons) {
  const init = { bubbles: true, cancelable: true, composed: true, clientX: point.x, clientY: point.y, button: 0, buttons, pointerId: 1, pointerType: "mouse", isPrimary: true };
  if (window.PointerEvent) el.dispatchEvent(new PointerEvent(type, init));
  const mouseType = type.replace("pointer", "mouse");
  el.dispatchEvent(new MouseEvent(mouseType, init));
}

function drawPath(el, points) {
  if (!Array.isArray(points) || points.length < 2) throw new Error("Draw needs at least two normalized points");
  const path = points.map(point => pointInElement(el, point));
  el.scrollIntoView({ block: "center", behavior: "instant" });
  dispatchPointer(el, "pointerdown", path[0], 1);
  for (const point of path.slice(1)) dispatchPointer(el, "pointermove", point, 1);
  dispatchPointer(el, "pointerup", path[path.length - 1], 0);
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
      // Amount is expressed in viewport heights. This keeps the movement natural
      // across displays while still letting the planner choose a larger jump.
      const viewportMultiplier = Number.isFinite(Number(action.amount))
        ? Math.max(0.15, Math.min(3, Number(action.amount)))
        : 0.85;
      const target = getScrollTarget();
      const amount = (direction === "up" ? -1 : 1) * (target.clientHeight || window.innerHeight) * viewportMultiplier;
      target.scrollBy({ top: amount, behavior: "instant" });
      break;
    }
    case "drag": {
      const el = findByVoiceId(target_id);
      if (!el) throw new Error(`No element with id ${target_id}`);
      drawPath(el, [action.start, action.end]);
      break;
    }
    case "draw": {
      const el = findByVoiceId(target_id);
      if (!el) throw new Error(`No drawing surface with id ${target_id}`);
      drawPath(el, action.points);
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
