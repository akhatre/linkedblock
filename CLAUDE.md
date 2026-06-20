# CLAUDE.md

Guidance for AI assistants working in this repo.

## What this is

LinkedBlock is a Chrome (Manifest V3) extension that filters spam and ads from the LinkedIn inbox and does bulk cleanup of invitations and unread messages. It is a content script only - no background worker, no popup, no options page. End-user docs are in `README.md`; deeper architecture is in `DEVELOPMENT.md`.

## Stack and conventions

- **Vanilla JS, no build step, no dependencies.** Do not introduce a bundler, framework, TypeScript, or npm packages. Files are plain scripts loaded in order by `manifest.json`.
- Each `src/*.js` file is an IIFE that attaches to the shared `window.__LinkedBlock` namespace (aliased `LF`). Keep that pattern.
- Older/conservative JS style (`var`, function declarations, no optional chaining). Match the surrounding file.
- Comments explain *why*, not *what*. The existing files are well-commented - keep that bar.

## Module map

`selectors.js` (all DOM anchors and readers) → `util.js` (timing + DOM primitives) → `store.js` (settings + cache via `chrome.storage.local`) → `panel.js` (toolbar UI) → `invitations.js` (accept/ignore) → `messaging.js` (mark-read + filter) → `app.js` (routing, SPA handling, orchestration). Full table in `DEVELOPMENT.md`.

## Cardinal rules

1. **Never anchor on LinkedIn's hashed CSS classes** - they change every deploy. Use stable semantic attributes (`data-testid`, `role`, `aria-label`, `componentkey`, semantic `msg-conversation-*` substrings). All selectors live in `src/selectors.js`; that is the only file to change if LinkedIn's markup moves.
2. **Messaging can render inside a `/preload/` iframe.** On click-through (SPA) navigation LinkedIn renders the inbox into a pre-warmed `<iframe src="/preload/">`, not the top document. The extension uses `all_frames: true` and detects pages by DOM presence, not URL. Do not reintroduce URL-based messaging routing - it silently breaks click-through navigation. See `DEVELOPMENT.md`.
3. **Single-instance ownership** via a generation counter in `app.js`. Do not add competing mount logic.
4. **The filters differ in side effects.** Sponsored/InMail hiding is purely local (row hiding only). The one-sided filter opens conversations (marks them read, then restores unread), so it is off by default. Preserve that distinction and keep it opt-in.
5. **Account safety:** keep the human-like delays, per-run limit, and Stop control on every bulk action. Do not remove the throttling.

## Loading and testing

No automated tests. Load unpacked (`chrome://extensions` → Developer mode → Load unpacked → repo root) and test on real LinkedIn pages. For messaging, test both direct navigation and click-through navigation (the preload-iframe path). Note: stable Chrome 137+ disables the `--load-extension` command-line switch - to load under automation, use the Load unpacked UI or Chrome for Testing.

## Prose

README, store listing, and other prose should be plain, practical, and honest about caveats, with British spelling and no marketing fluff. Match the existing `README.md` / `PRIVACY.md` tone.
