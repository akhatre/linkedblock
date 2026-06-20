# Development

LinkedBlock is a vanilla-JS Manifest V3 content script. No build step, no dependencies, no framework.

## Install from source

1. Clone this repo.
2. Go to `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. **Load unpacked** and select the repo root.
5. Open LinkedIn messages or invitations - the toolbar appears.

`make build` just prints these instructions. `make pack` produces `linkedblock.zip` for distribution or drag-and-drop install.

## Architecture

The content script is split into focused modules, loaded in this order (see `manifest.json`). Each is an IIFE that attaches to a shared `window.__LinkedBlock` namespace (aliased `LF`).

| File | Responsibility |
|------|----------------|
| [`src/selectors.js`](src/selectors.js) | Every DOM anchor and reader. The one file to touch if LinkedIn changes its markup. |
| [`src/util.js`](src/util.js) | Timing and DOM-action primitives (delays, scrolling, opening a conversation row). |
| [`src/store.js`](src/store.js) | Persisted settings and the analysis cache; the single source of truth (`LF.Store`). |
| [`src/panel.js`](src/panel.js) | The toolbar UI - styles, markup, and a small API. Emits user intents via handlers; knows nothing about LinkedIn's DOM. |
| [`src/invitations.js`](src/invitations.js) | Bulk Accept / Ignore. |
| [`src/messaging.js`](src/messaging.js) | Mark-all-read and the inbox Filter controller. |
| [`src/app.js`](src/app.js) | Orchestrator: routing, SPA-navigation handling, single-instance ownership, and wiring the panel to the other modules. |

**Single-instance ownership.** Each load bumps a generation counter and claims ownership; older instances detect they have been superseded and tear themselves down (remove their panel, stop their timers). On startup the new instance also clears any stray panel left behind, so the extension can never show two panels.

## The selector strategy

LinkedIn ships hashed CSS classes that change on every deploy, so the code never anchors on them. It targets stable, semantic attributes only:

- List container: `[data-testid="lazy-column"]`
- Invitation card: `[role="listitem"][componentkey^="urn:li:invitation:"]`
- Buttons: matched by `aria-label` prefix (`Accept …` / `Ignore …`), with a visible-text fallback.
- Messaging rows: LinkedIn's semantic `msg-conversation-*` component-name substrings, never ember ids.

All of it lives in [`src/selectors.js`](src/selectors.js). If LinkedIn changes its markup, that is the one file to touch.

## The /preload iframe (important)

LinkedIn navigation is not what it looks like. On a direct load of `/messaging/...` the inbox renders in the top document. But when you reach messaging by clicking the nav link (SPA navigation), LinkedIn renders the entire messaging app into a pre-warmed `<iframe src="/preload/?_bprMode=vanilla">` and only updates the top frame's URL - the top document stays empty.

Two consequences for this extension:

- The content script runs in every frame (`all_frames: true` in the manifest), so it is present inside that preload iframe.
- Page detection is by DOM presence, not URL. The iframe's own location is `/preload/`, so any URL-based routing would miss it. `app.js` decides it is the messaging page when the messaging DOM is actually there, which matches the iframe on SPA navigation and the top frame on direct loads.

This is the single most fragile thing to keep in mind when changing routing or mounting. Do not reintroduce URL-based messaging routing.

## How it works

- The invitations list is lazy-loaded; the loop scrolls to pull in the next chunk until the loader is gone or your limit is reached. Cards are de-duped by invitation URN so none is processed twice.
- On messaging pages, conversations are matched by LinkedIn's hydrated conversation-list rows. Unread state is read from semantic unread-count, notification-badge, and bold title/time markers. Opening an unread conversation is what marks it read in LinkedIn.
- Category is read from the list row: the *Sponsored* / *InMail* snippet pills, and a presence indicator (shown only for your connections) to tell in-network from out-of-network.
- Filtering is a one-shot pass per page visit: it hides the categories you chose immediately, then for the opt-in one-sided check it scroll-loads up to the first ~50 conversations and analyses the uncached ones, then stops. A `MutationObserver` keeps rows hidden through LinkedIn's re-renders and catches genuinely new messages (a changed snippet re-opens that conversation), but it deliberately ignores scroll - scrolling further down never starts a new scan.
- Persistence: settings and the per-conversation analysis cache are stored in `chrome.storage.local`, keyed by a stable participant signature so they survive reloads and LinkedIn's hashed-class deploys. A conversation is re-analysed only when it gains a new message (detected by a changed snippet).

## Account safety (implementation)

Bulk-automating actions can trip LinkedIn's automated-activity detection and pushes against their User Agreement. The mitigations baked in: randomised human-like delays (0.3-0.8s between actions), a per-run limit, and a Stop control. On `/mynetwork/grow/`, bulk actions hand off to the received-invitations page before running, to avoid LinkedIn's grow-page scroll jitter.

The one-sided filter is the heaviest action by far: on a cold cache it opens each uncached out-of-network conversation (throttled) to read its history, so the first scan flips through conversations on screen. It is capped to the first ~50 conversations and runs once per page visit, then stops. Subsequent loads are fast (or do nothing) because verdicts are cached. This is why it ships off by default.

## Testing

There are no automated tests. To verify behaviour, load unpacked and exercise both pages. For messaging, test **both** direct navigation (paste a `/messaging/...` URL) and click-through navigation from another page - the latter is the preload-iframe case and the one most likely to regress.

A Chrome DevTools (remote-debugging / MCP) setup is handy for driving navigation and inspecting frames. Note that stable Chrome 137+ disables the `--load-extension` command-line switch, so to load the extension under automation use the "Load unpacked" UI or Chrome for Testing rather than the flag.
