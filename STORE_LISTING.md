# VoiceBrowser — Chrome Web Store listing copy

Everything below is written to be pasted into the store dashboard. Field limits
are noted where the store enforces them.

## Name
VoiceBrowser — Voice Browser Copilot

## Short description (≤132 characters)
Control any website by voice: search, click, type, scroll, and complete
multi-step tasks hands-free with Gemini, plus confirmation on risky steps.

## Category
Productivity

## Language
English (US)

## Detailed description

VoiceBrowser is a hands-free copilot for the web. Open the side panel, start a
session, and speak naturally — "search for noise-cancelling headphones", "open
the first result", "fill in my name and email", "scroll down", "read this page
and summarize it". VoiceBrowser inspects the current page, plans the next step
with Google Gemini, and carries it out.

**What it does**
- Understands natural voice commands and short follow-ups.
- Clicks, types, selects, submits, scrolls, drags, and draws on the page.
- Runs browser-level commands: new tab, close tab, back, forward, navigate.
- Works through multi-step tasks in a single request.
- Keeps short task memory for the current tab so follow-ups make sense.
- Speaks brief status replies and shows a live transcript.

**Built to be careful**
- Three automation modes: Safe (blocks sensitive steps), Assist (confirms them),
  and Full (still confirms money, credentials, and deletions).
- Pauses with an on-screen confirmation before purchases, payments, deletions,
  or entering passwords and one-time codes.
- Stops on ambiguous requests and asks a clarifying question instead of
  guessing.
- Detects repeated, non-progressing actions and stops rather than looping.

**Requirements**
- Your own Google Gemini API key (free from Google AI Studio). The key is stored
  only on your device.
- A microphone and a Chromium browser that supports side panels.

**Privacy**
Your command text, a compact structural map of the current page, and recent task
context are sent to the Google Gemini API to plan actions. Nothing else is
transmitted, and there are no analytics or ads. See the privacy policy for
details.

## Single purpose

VoiceBrowser has a single purpose: **let the user control the current browser
tab and perform web tasks using voice commands, with AI-generated action plans
and safety confirmations.** Every permission and feature serves this one
purpose.

## Permission justifications

- **activeTab / scripting / host permission `<all_urls>`**: The user directs the
  extension by voice on whatever site they are currently using. The extension
  must be able to read a structural map of, and execute actions on, the active
  page on any site the user chooses. It does not run in the background on pages
  the user is not actively commanding.
- **tabs**: Required for browser-level voice commands (new tab, close tab, back,
  forward, navigate to a URL).
- **sidePanel**: Provides the persistent conversation and microphone UI that
  stays open while the user browses.
- **storage**: Stores the user's own API key and settings locally, plus
  short-lived, tab-scoped task memory.

## Remote code

The extension does not execute remote code. It calls the Google Gemini API to
receive a **structured JSON action plan**, which is validated against the live
page and the extension's own allow-list of action types before any step runs.
All execution logic ships in the packaged `background.js` / `content.js`.

## Limited use disclosure

Data sent to Gemini (command text, page structure, recent task context) is used
**solely** to generate the next action for the user's current request. It is not
sold, not used for advertising, not used to build user profiles, and not
transferred to any other party. The API key belongs to the user and never leaves
their device except in direct calls the extension makes to Google on the user's
behalf.

## Notes before submitting
- Host PRIVACY.md at a public URL and paste it into the Privacy policy field
  (required for extensions requesting broad host permissions). A GitHub Pages or
  raw gist link works.
- Provide a 128x128 icon and at least one 1280x800 or 640x400 screenshot.
- Set the default language and confirm the store name matches the manifest name.
