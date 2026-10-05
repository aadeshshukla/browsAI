# VoiceBrowser

Version: 2.1.0

VoiceBrowser is a Chrome extension that acts like an AI browser copilot. It listens to natural speech, inspects the current page, understands the user’s goal, and safely performs common browser tasks using Gemini-powered planning.

It is built to feel less like a rigid automation script and more like a practical, careful assistant that can work through real web flows while asking for confirmation when the situation is risky or ambiguous.

## What it can do

- Understand natural voice commands
- Search, navigate, click, type, fill forms, scroll, submit, and open links
- Work across multiple browser steps in a single task
- Protect risky operations with confirmation gates
- Detect and stop on repeated, non-progressing actions instead of looping
- Stop when the task is ambiguous instead of guessing
- Keep short task memory for the current tab session

## Example requests

- “Search for noise-cancelling headphones”
- “Open the first result”
- “Fill in my name and email”
- “Compare the top two options and tell me which is better”
- “Go back and open the pricing section”
- “Read the page and summarize the key points”
- “Stop listening”

## How it works

1. The user opens the side panel and begins a session.
2. Chrome speech recognition converts spoken input into text.
3. VoiceBrowser gathers a compact interactive map of the page and sends it to Gemini along with recent task context.
4. Gemini returns a structured action plan.
5. The extension validates the plan against the current page and safety rules.
6. It runs the allowed actions, re-scans the page, and stops if it detects the same action repeating without progress.
7. If the site is ambiguous, it asks a clarifying question. If a step is sensitive (purchase, payment, deletion, password/code entry), it pauses for confirmation according to the automation mode.

## Current features

- Persistent side-panel conversation UI
- Microphone-based speech capture and transcript display
- Safe, Assist, and Full automation modes (selectable in Settings)
- Repeated-action detection to avoid infinite loops
- Risk-based confirmation prompts for sensitive actions
- Browser actions: new tab, close tab, back, forward, navigate
- Page actions: click, type, select, submit, scroll, drag, and draw
- Task memory scoped to the current tab
- Short spoken and on-screen status responses
- Configurable Gemini model and API key settings

## Automation modes

The extension supports three safety levels, chosen in Settings:

- **Safe**: never runs sensitive steps. Purchases, payments, deletions, and password/one-time-code entry are blocked with an explanation.
- **Assist** (default): runs ordinary actions freely, but pauses and shows a confirmation dialog in the side panel before any sensitive step.
- **Full**: same confirmation prompt for genuinely sensitive steps (money, credentials, irreversible deletions). Chrome still blocks extension control of browser-internal pages.

A step is treated as sensitive when it targets a password field, types credential/OTP/card data, or activates a control whose label or page context indicates buying, paying, deleting, or confirming.

## Requirements

- Google Chrome or a Chromium browser that supports Manifest V3 side panels
- A Google Gemini API key from Google AI Studio
- A working microphone and browser speech-recognition support

## Local setup

1. Clone or download this repository.
2. Open chrome://extensions in Chrome.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the project folder.
6. Open the extension from the toolbar and click the side panel.
7. Go to Settings and add your Gemini API key.
8. Choose the model if needed and save.
9. Open any normal webpage, start the session, and speak your request.

After file changes, reload the extension in chrome://extensions and refresh the page under test.

## Usage tips

- Give clear goals such as “compare the options” or “fill out the form”.
- Use short follow-up commands like “continue”, “choose the second option”, or “go back”.
- If the action is unclear, the assistant will ask a clarifying question.
- When the site requires a risky step, the assistant will pause for confirmation.

## Safety and privacy

- The extension sends your command text, the current page structure, and recent task context to Gemini for planning.
- API keys are stored in Chrome extension storage.
- The tool is intentionally conservative around purchases, payments, passwords, personal data entry, and irreversible operations.
- It stops when the page fails to show the expected state instead of blindly retrying.
- Chrome blocks extension control over browser-internal pages such as chrome:// and the Chrome Web Store.

## Known limitations

- Speech recognition depends on browser support and may vary by environment.
- Some sites are hard to automate because of dynamic UI or custom components.
- Complex websites or page layouts may require more clarification or safer stopping points.
- Session memory is intentionally scoped to the current tab and can be reset with New task.
- The agent is safer than a fully autonomous browser agent, so it may ask for confirmation instead of acting immediately.

## Project structure

- manifest.json — extension metadata and permissions
- background.js — orchestration, Gemini calls, task state, risk classification, automation modes, and confirmation gating
- content.js — page scanning and in-page action execution
- sidepanel.html / sidepanel.js / sidepanel.css — voice session UI, settings, and confirmation dialog
- popup.html / popup.js / popup.css — compact popup interface (legacy)
- icons/ — 16, 48, and 128 px extension icons
- PRIVACY.md — privacy policy (host it publicly and link it in the store listing)
- STORE_LISTING.md — Chrome Web Store listing copy and permission justifications
- SETUP.md — local setup and debugging notes

## Development notes

- Background service worker: chrome://extensions → VoiceBrowser → Service worker
- Side panel: inspect the panel directly from DevTools to debug UI state
- Page script: open DevTools on the page being controlled for content script debugging

## Contributing

Contributions are welcome as the project evolves. Keep changes focused, validate in Chrome with the unpacked extension, and document the site or workflow used during testing.

## Status

The project is in a practical local prototype stage: it is usable for real testing in Chrome and already includes strong safety and workflow-aware behavior, but it should still be treated carefully on sensitive or irreversible sites.
