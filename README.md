# LinkFilter

A small Chrome (Manifest V3) extension that makes LinkedIn less tedious. It adds
an in-page panel to LinkedIn's invitations and messaging pages so you can bulk
**accept** or **ignore** connection requests and mark unread messages as read.

> Phase 1: connection requests.
> Phase 2: mark all messages as read.

## Features

- **Accept all** / **Ignore all** pending received invitations.
- **Accept verified only** — switches to LinkedIn's "Verified" tab, then accepts.
- **Mark messages read** — opens each unread conversation so LinkedIn marks it
  as read.
- **Limit** — cap how many requests to process per run. Defaults to `100`;
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
   **LinkFilter** panel appears above the matching LinkedIn block.

`make build` prints the same instructions; `make pack` produces `linkfilter.zip`
for drag-and-drop install.

## Usage / testing

For invitations, start small:

1. Set **Limit** to `5`.
2. Click **Accept all** (or **Ignore all**).
3. Watch the status line count up; the list shrinks as cards are actioned.
4. Use **Stop** any time.

For messages, open <https://www.linkedin.com/messaging/>, set **Limit** to a
small number, then click **Mark messages read**. Set Limit back to `0` to clear
the whole backlog.

## How it works

- Targets only stable, semantic attributes — never LinkedIn's hashed CSS classes.
  All selectors live in [`src/selectors.js`](src/selectors.js), so that's the one
  file to update if LinkedIn changes their markup.
  - List container: `[data-testid="lazy-column"]`
  - Card: `[role="listitem"][componentkey^="urn:li:invitation:"]`
  - Buttons: matched by `aria-label` prefix (`Accept …` / `Ignore …`), with a
    visible-text fallback.
- The list is lazy-loaded; the loop scrolls to pull in the next chunk until the
  loader is gone or your limit is reached.
- Cards are de-duped by invitation URN so none is processed twice.
- On messaging pages, conversations are matched by LinkedIn's hydrated
  conversation-list rows. Unread state is detected from semantic unread-count,
  notification-badge, and bold title/time markers. Opening an unread
  conversation marks it read in LinkedIn.

## A note on account safety

Bulk-automating actions can trip LinkedIn's automated-activity detection and
technically pushes against their User Agreement. Mitigations baked in: randomized
human-like delays, a per-run limit, and a Stop control. Use modest batches and
keep the tab in the foreground.
