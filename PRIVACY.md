# VoiceBrowser — Privacy Policy

_Last updated: 2026-10-04_

VoiceBrowser is a Chrome extension that turns spoken commands into browser
actions using the Google Gemini API. This policy explains what data the
extension touches, where it goes, and how it is stored.

## What data is processed

When you use VoiceBrowser, the following may be processed:

- **Your voice command**, converted to text by your browser's built-in speech
  recognition (Chrome Web Speech API). Audio is handled by Chrome, not stored by
  this extension.
- **A structural map of the current page**: the page URL, title, and a capped
  list (up to 150) of interactive elements with their tag, type, visible label,
  and size. Page text is not scraped wholesale; only element metadata needed to
  act is included.
- **Short task context** for the current tab (your recent commands and the
  actions taken), used to keep multi-step tasks coherent.
- **Your Gemini API key**, which you provide yourself.

## Where data goes

- Your command text, the page map, and recent task context are sent to the
  **Google Gemini API** (`generativelanguage.googleapis.com`) to produce an
  action plan. This is the core function of the extension. Use of that data by
  Google is governed by the
  [Google Gemini API terms](https://ai.google.dev/gemini-api/terms) and
  [Google's privacy policy](https://policies.google.com/privacy).
- No data is sent to any other third party, and no analytics or advertising
  trackers are included.

## How data is stored

- Your **API key and settings** are stored locally in Chrome extension storage
  (`chrome.storage.local`) on your device only.
- **Task memory** is stored in `chrome.storage.session` and is scoped to the
  current tab. It is cleared when you press "New task" or close the session.
- The developer does not operate a server that collects, stores, or receives
  your data.

## Permissions and why they are needed

- `activeTab`, `scripting`, `<all_urls>` — to read the structure of, and perform
  actions on, the page you are currently working on, on any site you choose.
- `tabs` — for browser-level commands such as new tab, close tab, back, forward,
  and navigate.
- `sidePanel` — to provide the persistent voice conversation UI.
- `storage` — to save your settings and short-lived task memory locally.

## Safety

VoiceBrowser is intentionally conservative. In **Safe** mode it refuses
sensitive steps. In **Assist** and **Full** modes it pauses and asks you to
confirm before any purchase, payment, deletion, or password/one-time-code entry.
Chrome itself prevents any extension from controlling internal pages
(`chrome://`, the Chrome Web Store, etc.).

## Your control

- You supply and can remove your API key at any time in Settings.
- You can end a session or clear task memory at any time.
- Uninstalling the extension removes all locally stored data.

## Contact

Questions about this policy: open an issue on the project repository or contact
the maintainer through the store listing.
