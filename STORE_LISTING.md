# Chrome Web Store listing

Copy for the CWS listing. Paste the fields into the developer dashboard.

## Name (manifest `name`, max 75 chars)

LinkedBlock - block spam, clear connections

## Summary (max 132 chars)

Block sponsored messages, InMail and inbox spam on LinkedIn, plus bulk accept/ignore connection requests. All local, nothing sent.

## Category

Social & Communication (recommended). See the note at the end for alternatives.

## Detailed description

LinkedBlock cleans up the noise in your LinkedIn inbox. Sponsored messages, InMail blasts, the cold sales sequences that message you three times and never get a reply - it hides them, so your inbox is just the conversations you actually care about.

It works like an ad blocker. The filtering happens right in your browser, on the page you are already looking at. Nothing about your account, your messages, or your contacts is sent to us or to anyone else. There is no server, no sign-in, no tracking - the whole thing is a small script running on the page.

### What it hides

- **Sponsored messages** - the paid ones LinkedIn drops into your inbox.
- **InMail** - cold outreach from people outside your network.
- **3+ one-sided senders** (optional) - people who messaged you three or more times with no reply from you. Off by default - see the note below.

The filter is reversible. Toggle it off and everything comes back - nothing is ever deleted.

### Bulk cleanup (the extras)

Beyond blocking, there are a couple of one-click actions for when things have piled up:

- **Mark all as read** - clears the unread badge on the conversations you choose.
- **Accept all / Ignore all** - for the invitation requests you have been putting off. Ignore-all is handy for clearing out connection spam.

These act on your own account - that is the point - so they are under your control, capped per run, and spaced with small human-like pauses.

### Being straight about what it does

The sponsored and InMail filters are purely local: they only hide rows, nothing is opened or changed. The optional "3+ one-sided" check is different - to tell a one-sided thread apart it has to open the conversation to read it, which marks it read (it then puts it back to unread). That is why it is off by default. Turn it on only if you want it.

It also will not catch everything. LinkedIn changes its markup often, and some spam does not look like spam. It is a filter, not magic.

One more thing: automating actions on LinkedIn is not something LinkedIn loves, so keep the bulk batches modest and use the limit. Your call.

## Privacy

- Single purpose: hide unwanted messages and ads in the LinkedIn inbox.
- Data collected: none leaves the device. See PRIVACY.md (host this at a public URL and link it in the dashboard).
- Permission justifications:
  - `storage` - saves your settings and a small local analysis cache on your machine.
  - Host access to `www.linkedin.com` - the extension only runs on LinkedIn, to read the inbox/invitation pages it filters.
  - Remote code: none. All code ships in the package.

## Category - notes

You picked **Tools**, which is a safe, generic fit. A couple of options that match more closely:

- **Social & Communication** (my pick) - the extension acts on LinkedIn messages and connections, which is squarely what this category is for. Most on-target for what users are actually doing.
- **Privacy & Security** - where most ad/spam blockers live, and it plays to the "local, nothing sent" angle. Reasonable if you want to lean on the blocker/privacy identity.
- **Tools** / **Workflow & Planning** - both fine as generic fallbacks; less specific than the two above.

Any of these will pass review. I would go Social & Communication first, Privacy & Security second.
