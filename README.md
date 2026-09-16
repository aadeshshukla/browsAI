# VoiceBrowser

VoiceBrowser is an experimental Chrome extension that lets you operate webpages with natural voice commands. It combines Chrome's built-in speech recognition with Google's Gemini API to understand a request, inspect the current page's interactive controls, and carry out the required browser actions.

For example, you can say:

- “Search for noise-cancelling headphones”
- “Scroll down and open the first result”
- “Fill in my name and email”
- “Go back” or “open a new tab”
- “Read the page until you find the pricing section”

The aim is hands-free browsing for ordinary multi-step tasks—not just voice search.

> **Project status:** work in progress / early prototype. Expect rough edges on complex websites and test carefully before relying on it for important work.

## How it works

1. Open VoiceBrowser from the Chrome toolbar to show its side panel.
2. Start a conversation and speak a request.
3. Chrome converts your speech to text.
4. VoiceBrowser sends the request plus a simplified map of the active page's visible, interactive elements to Gemini.
5. Gemini returns a structured plan. The extension validates it, then clicks, types, selects, scrolls, submits, navigates, or performs another supported action.
6. For tasks that need multiple steps, it re-scans the page and continues until the task is complete or it reaches its safety limit.

The side panel retains a small amount of task context for the current tab, so follow-up instructions can refer to the work already done. Select **New task** to clear that context.

## Features

- Continuous voice sessions from a persistent Chrome side panel
- Natural-language control of links, buttons, inputs, text areas, selects, and content-editable fields
- Browser actions: new tab, close tab, back, forward, and navigation to a URL
- Page actions: click, type, select, submit, scroll, drag, and draw on supported page surfaces
- Multi-step planning with page re-scans after actions
- Built-in guards against invalid element targets, repeated actions, and runaway task loops
- Short spoken or on-screen status responses
- Configurable Gemini model; defaults to `gemini-2.0-flash-lite`

## Requirements

- Google Chrome (or another Chromium browser that supports Manifest V3 side panels)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
- A microphone and browser speech-recognition support

There is no build process and no `npm install`: this project consists of plain HTML, CSS, and JavaScript files that Chrome loads directly.

## Install locally

1. Download or clone this repository.
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose this project folder (`browsAI`).
6. Pin the VoiceBrowser extension, then click its toolbar icon to open the side panel.
7. In **Settings**, paste your Gemini API key and select a model if you do not want the default.
8. Open a normal website, choose **Start conversation**, and speak your request.

After editing extension files, reload the extension on `chrome://extensions` and refresh the webpage you are testing. This ensures Chrome reinjects the page script.

## Using VoiceBrowser

Start with clear, outcome-focused commands. You do not need to name every click:

| Goal | Example command |
| --- | --- |
| Find information | “Search this site for laptop backpacks.” |
| Fill a form | “Enter Jane Doe in the name field and jane@example.com in email.” |
| Move around a page | “Scroll until you find customer reviews.” |
| Navigate Chrome | “Open youtube.com in a new tab.” |
| Continue a task | “Now choose the second option.” |
| Finish listening | “Stop listening” or “end session.” |

VoiceBrowser will ask a short question when the command is ambiguous, such as “click” without saying what to click.

## Privacy and safety notes

- Your spoken command, a compact description of the current page's interactive elements, and recent task context are sent to the Gemini API to plan actions. Review Google's terms and privacy practices before using it on sensitive pages.
- Your Gemini API key and chosen model are saved in Chrome extension local storage. Do not share your browser profile with untrusted people.
- The extension is designed to ask before irreversible deletion, purchases, payments, passwords, or one-time codes. Still, review actions and avoid using the prototype for sensitive or irreversible tasks.
- Chrome prevents extensions from controlling `chrome://` pages, the Chrome Web Store, and some browser-internal pages. Browser-level navigation commands can still work where Chrome permits them.

## Known limitations

- Speech recognition depends on the browser and may not be available in every environment or language configuration.
- The extension maps up to 150 visible interactive elements per page scan. Very dense, highly dynamic, or custom-built web apps may be difficult to control.
- It does not have long-term conversation memory; session context is scoped to the current tab and is cleared with **New task**.
- Some sites may block synthetic interactions or require actions the extension cannot safely reproduce.
- The default speech-recognition language is English (US).

## Project structure

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension metadata, permissions, and entry points |
| `sidepanel.html`, `sidepanel.js`, `sidepanel.css` | Persistent voice-session interface and settings |
| `background.js` | Gemini integration, action planning loop, validation, browser actions, and session storage |
| `content.js` | Page scanning and execution of approved page-level actions |
| `popup.html`, `popup.js`, `popup.css` | Lightweight popup interface kept alongside the side-panel experience |
| `SETUP.md` | Additional setup, reloading, debugging, and limitation notes |

## Development and debugging

- **Background service worker:** `chrome://extensions` → VoiceBrowser → **service worker**
- **Page script:** open DevTools on the webpage being controlled; logs from `content.js` appear in that page console
- **Side panel:** inspect the side panel from Chrome DevTools when troubleshooting the interface

For a more detailed checklist, see [SETUP.md](SETUP.md).

## Contributing

Contributions are welcome while the project is evolving. Please keep changes focused, test them by loading the unpacked extension in Chrome, and describe the website/workflow used for testing in your change notes.
