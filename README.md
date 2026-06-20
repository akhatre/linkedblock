# LinkedBlock

A small Chrome (Manifest V3) extension that makes LinkedIn less tedious. It adds
an in-page panel to LinkedIn's invitations and messaging pages so you can bulk
**accept** or **ignore** connection requests and mark unread messages as read.

> Phase 1: connection requests.
> Phase 2: mark all messages as read.
> Phase 3: filter and target the messaging inbox.

## The panel

A single compact toolbar (two rows at most) that embeds inline into the page —
no floating overlay. It shows the controls relevant to the current page and
tucks advanced options behind a **⚙ settings** popover.

- **Invitations** (`/mynetwork/...`): **Accept all** · **Ignore all** ·
  **Verified only** · ⚙ · status.
- **Messaging** (`/messaging/...`): a **Filter** on/off pill · **Mark all as
  read** · ⚙ · status.
- The ⚙ popover holds **Limit** plus the messaging checkboxes (see below).
- **Stop** appears only while a task is running.

## Features

- **Accept all** / **Ignore all** pending received invitations.
- **Verified only** — switches to LinkedIn's "Verified" tab, then accepts.
- **Mark all as read** — opens each unread conversation so LinkedIn marks it
  read. Restricted to the categories you **target** (see below).
- **Target** (⚙ → *Mark read — target*) — checkboxes choosing which
  conversations Mark-read acts on: Sponsored, InMail, Out of network, From
  connections. Defaults to everything **except** your own connections.
- **Filter** (the on/off pill, on by default) — visually hides unwanted
  conversations from the inbox. Reversible — toggle off to show them again.
  Categories chosen in ⚙ → *Filter out*:
  - **Sponsored** / **InMail** — cheap, list-row only.
  - **3+ one-sided messages** — hides spammy senders who messaged you 3+ times
    with no reply from you. Detecting this opens the conversation to read its
    history (which LinkedIn marks as read); LinkedBlock records the verdict in a
    local cache so it's only done once per conversation, and **restores unread
    state** on false positives. Connections are never opened.
- **First-50 scan, then stop** — the one-sided scan only ever looks at the first
  ~50 conversations and runs **once per page visit**. It does not re-scan when
  you scroll, and a reload with no new messages does nothing.
- **Persistence** — your settings and the per-conversation analysis cache are
  stored in `chrome.storage.local`, keyed by a stable participant signature so
  they survive reloads and LinkedIn's hashed-class deploys. A conversation is
  re-analyzed only when it gains a new message (detected by a changed snippet).
- **Limit** (⚙) — cap how many items to process per run. Defaults to `100`;
  `0` (or empty) means no limit.
- **Stop** button to halt mid-run.
- Human-like randomized delays (0.3-0.8s) between actions to stay gentle on
  LinkedIn's anti-automation systems.
- On `/mynetwork/grow/`, bulk actions hand off to the received invitations page
  before running to avoid LinkedIn's grow-page scroll jitter.

## Install (development)

1. Clone/open this folder.
2. Go to `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. **Load unpacked** → select this folder.
5. Open <https://www.linkedin.com/mynetwork/grow/> or
   <https://www.linkedin.com/mynetwork/invitation-manager/received/> for
   invitations, or <https://www.linkedin.com/messaging/> for messages. The
   **LinkedBlock** panel appears above the matching LinkedIn block.

`make build` prints the same instructions; `make pack` produces `linkedblock.zip`
for drag-and-drop install.

## Usage / testing

For invitations, start small:

1. Open **⚙** and set **Limit** to `5`.
2. Click **Accept all** (or **Ignore all**).
3. Watch the status line count up; the list shrinks as cards are actioned.
4. Use **Stop** any time.

For messages, open <https://www.linkedin.com/messaging/>, set **Limit** (in ⚙)
to a small number, then click **Mark all as read**. Set Limit back to `0` to
clear the whole backlog. The **Filter** pill hides spam independently of
Mark-read.

## Architecture

The content script is split into focused modules, loaded in this order (see
`manifest.json`). Each attaches to a shared `window.__LinkedBlock` namespace.

| File | Responsibility |
|------|----------------|
| [`src/selectors.js`](src/selectors.js) | Every DOM anchor and reader. The one file to touch if LinkedIn changes its markup. |
| [`src/util.js`](src/util.js) | Timing + DOM-action primitives (delays, scrolling, opening a conversation row). |
| [`src/store.js`](src/store.js) | Persisted settings + the analysis cache; the single source of truth (`LF.Store`). |
| [`src/panel.js`](src/panel.js) | The toolbar UI — styles, markup, and a small API. Emits user intents via handlers; knows nothing about LinkedIn's DOM. |
| [`src/invitations.js`](src/invitations.js) | Bulk Accept / Ignore. |
| [`src/messaging.js`](src/messaging.js) | Mark-all-read and the inbox Filter controller. |
| [`src/app.js`](src/app.js) | Orchestrator: routing, SPA-navigation handling, single-instance ownership, and wiring the panel to the other modules. |

**Single-instance ownership.** Each load bumps a generation counter and claims
ownership; older instances detect they've been superseded and tear themselves
down (remove their panel, stop their timers). On startup the new instance also
clears any stray panel left behind, so the extension can never show two panels.

## How it works

- Targets only stable, semantic attributes — never LinkedIn's hashed CSS classes.
  - List container: `[data-testid="lazy-column"]`
  - Card: `[role="listitem"][componentkey^="urn:li:invitation:"]`
  - Buttons: matched by `aria-label` prefix (`Accept …` / `Ignore …`), with a
    visible-text fallback.
- The invitations list is lazy-loaded; the loop scrolls to pull in the next
  chunk until the loader is gone or your limit is reached.
- Cards are de-duped by invitation URN so none is processed twice.
- On messaging pages, conversations are matched by LinkedIn's hydrated
  conversation-list rows. Unread state is detected from semantic unread-count,
  notification-badge, and bold title/time markers. Opening an unread
  conversation marks it read in LinkedIn.
- Category is read from the list row: the *Sponsored*/*InMail* snippet pills,
  and a presence indicator (shown only for your connections) to tell in-network
  from out-of-network.
- Filtration is a **one-shot pass per page visit**: it hides the categories you
  chose immediately, then scroll-loads up to the first ~50 conversations and
  analyzes the uncached ones for the one-sided check, and stops. A
  `MutationObserver` keeps rows hidden through LinkedIn's re-renders and catches
  genuinely new messages (a changed snippet re-opens that conversation), but it
  deliberately ignores scroll — scrolling further down never starts a new scan.
  The panel mounts inline and re-asserts itself if LinkedIn's re-render removes
  it, so it shows up whether you land on messaging directly or navigate in from
  another page.

## A note on account safety

Bulk-automating actions can trip LinkedIn's automated-activity detection and
technically pushes against their User Agreement. Mitigations baked in: randomized
human-like delays, a per-run limit, and a Stop control. Use modest batches and
keep the tab in the foreground.

The **3+ one-sided** filter is the heaviest: on a cold cache it opens each
uncached out-of-network conversation (throttled, human-like) to read its
history, so the first scan flips through conversations on screen. It is capped
to the first ~50 conversations and runs once per page visit, then stops — it
won't keep going as you scroll. Subsequent loads are fast (or do nothing)
because verdicts are cached. Hit **Stop** any time to halt the scan.
