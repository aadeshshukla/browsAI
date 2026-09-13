# VoiceBrowser — Setup Guide

No build step, no npm install — this is a plain Manifest V3 extension, so
Chrome runs the files as-is.

## 1. Open the project in VS Code

1. Unzip / place the `voice-browser-extension` folder wherever you keep projects
2. `code voice-browser-extension` (or File → Open Folder in VS Code)

Files you'll be editing going forward:
- `manifest.json` — permissions, entry points
- `background.js` — the Gemini call + action loop
- `content.js` — page scanning + executing actions on the page
- `popup.html` / `popup.js` / `popup.css` — the mic UI

## 2. Get a free Gemini API key

1. Go to https://aistudio.google.com/apikey
2. Sign in, click "Create API key"
3. Copy it — you'll paste it into the extension's settings, not into any file

## 3. Load the extension in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select the `voice-browser-extension` folder
5. The VoiceBrowser icon should appear in your toolbar (pin it for easy access). Click it to open the persistent side panel.

## 4. Add your API key

1. Click the VoiceBrowser icon to open its side panel
2. Open **Settings** at the bottom of the panel
3. Paste your Gemini API key, leave the model field as `gemini-2.0-flash-lite`
   (or change it later if Google renames/deprecates it — check
   https://ai.google.dev/gemini-api/docs/models for current model IDs)
4. Click **Save**

## 5. Try it

1. Go to any normal webpage (not `chrome://` pages — extensions can't run there)
2. Click the VoiceBrowser icon, click **Start conversation**, then say a command like:
   - "scroll down"
   - "click the search button"
   - "type hello world into the search box"
3. Release/let it finish — it sends the transcript to the background worker,
   which loops with Gemini and the page until the task is done

## Reloading after you edit code

Every time you change `background.js`, `content.js`, or the side-panel files:
1. Go to `chrome://extensions`
2. Click the reload icon on the VoiceBrowser card
3. **Refresh the webpage** you're testing on too (content scripts only
   re-inject on a fresh page load)

`popup.html/js/css` changes just need the popup reopened — no reload needed.

## Debugging

- **Background worker logs**: `chrome://extensions` → click "service worker"
  link under VoiceBrowser → opens DevTools for background.js
- **Content script logs**: open normal DevTools (F12) on the page you're
  testing — content.js logs appear in that page's console
- **Popup logs**: right-click the popup while it's open → Inspect

## Known limitations in this v1 (worth knowing before you extend it)

- `chrome://` pages (New Tab, settings, extensions, Chrome Web Store) still
  can't be clicked/typed/scrolled on — that's a hard Chrome restriction, not
  fixable. But **browser-level commands** ("open a new tab", "go back", "go
  to youtube.com") now work from any page, including those, since they run
  through `chrome.tabs` directly instead of needing a content script.
- The popup closes if it loses focus, which can cut off a listening session —
  fine for short commands, annoying for long ones. A future upgrade is moving
  the mic into a `chrome.sidePanel` (persists while browsing) or an injected
  floating widget on the page itself.
- `content_scripts` can't run on `chrome://`, the Chrome Web Store, or some
  other browser-internal pages — that's a Chrome restriction, not fixable
  from the extension side.
- The page-element scan caps at 150 elements to keep the Gemini prompt small;
  very dense pages (huge tables, infinite-scroll feeds) may need smarter
  filtering later.
- No conversation memory across separate voice commands yet — each mic press
  starts a fresh task. Multi-turn context ("now click submit" as a follow-up
  to a previous command) isn't implemented yet.
