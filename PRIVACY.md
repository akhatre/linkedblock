# Privacy policy

**Short version: LinkedBlock does not collect, transmit, or sell any of your data. Everything it does happens locally in your browser.**

Last updated: 2026-06-21

## What it reads

LinkedBlock runs only on `www.linkedin.com`. To do its job it reads the messaging and invitation pages you are already viewing - the conversation rows, sender categories, and message snippets - so it can decide what to hide. This reading happens in your browser, and the content is never sent anywhere.

## What it stores

It saves two things in your browser's local storage (`chrome.storage.local`), on your machine only:

- **Your settings** - which filters are on, and your per-run limit.
- **An analysis cache** - a small per-conversation record (a participant signature, the last message snippet, and the spam verdict) so the optional one-sided check does not have to open the same conversation twice.

Both stay on your device. There is no account to sign into and nothing is synced to us. Removing the extension removes them.

## What it sends

Nothing. There is no LinkedBlock server. No analytics, no telemetry, no third-party requests. The extension makes no network calls of its own.

## Permissions, and why

- **`storage`** - to save your settings and the local cache described above.
- **Access to `www.linkedin.com`** - so the extension can run on LinkedIn pages, and nowhere else.

## Changes

If this ever changes - say a future feature needs a server - this policy will be updated before that ships, and the change will be called out in the release notes.

## Contact

Questions: github.com/akhatre/linkedblock
