// selectors.js — every DOM anchor LinkedBlock relies on, in one place.
//
// LinkedIn's CSS classes are hashed and change on every deploy, so we only
// anchor on stable, semantic attributes (data-testid, role, componentkey,
// aria-label) and module headings as a fallback. If LinkedIn changes their
// markup, this is the only file you should need to touch.
var LF = window.__LinkedBlock || (window.__LinkedBlock = {});

LF.SELECTORS = {
  // The lazy/virtualized list that holds the invitation cards.
  container: '[data-testid="lazy-column"]',
  // Each received-invitation card.
  card: '[role="listitem"][componentkey^="urn:li:invitation:"]',
  // LinkedIn module headings are semantic even when classes are hashed.
  heading: 'h1, h2, h3, h4, [role="heading"]',
  // The bottom spinner shown while more cards are loading on scroll.
  loader: '[data-testid="loader"]',
  // Messaging rows are Ember-managed divs, not links. Use LinkedIn's semantic
  // messaging component names and avoid dynamic ember ids.
  messageThread: [
    'li.msg-conversation-listitem',
    'li[class*="msg-conversation-listitem"]',
    'li[class*="msg-conversations-container__convo-item"]',
    '[id^="conversation-card-"]'
  ].join(','),
  messageOpenTarget: [
    '.msg-conversation-listitem__link[tabindex]',
    '[class*="msg-conversation-listitem__link"][tabindex]',
    '[class*="convo-item-link"][tabindex]'
  ].join(','),
  messageList: [
    '.msg-conversations-container__conversations-list',
    '[class*="msg-conversations-container__conversations-list"]',
    '[class*="msg-conversations-container"] ul',
    'ul[class*="msg-conversations-container"]',
    '[role="list"]'
  ].join(','),
  messageUnreadMarker: [
    '.msg-conversation-card__convo-item-container--unread',
    '[class*="msg-conversation-card__convo-item-container--unread"]',
    '.msg-conversation-card__message-snippet--unread',
    '[class*="msg-conversation-card__message-snippet--unread"]',
    '.msg-conversation-card__unread-count',
    '[class*="msg-conversation-card__unread-count"]',
    '.msg-conversation-card__participant-names.t-bold',
    '[class*="participant-names"].t-bold',
    '.msg-conversation-card__time-stamp.t-bold',
    '[class*="time-stamp"].t-bold',
    '.artdeco-notification-badge--new',
    '.notification-badge--show',
    '[data-test-notification-a11y]'
  ].join(',')
};

function lfIsVisible(el) {
  return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
}

// The list container, or null if we're not on the right page yet.
LF.getContainer = function () {
  var containers = document.querySelectorAll(LF.SELECTORS.container);

  for (var i = 0; i < containers.length; i++) {
    if (LF.getCards(containers[i]).length) return containers[i];
  }

  if (containers.length === 1) return containers[0];

  var card = LF.getCards(document)[0];
  if (!card) return null;

  return card.closest('[role="list"], ul, ol') || card.parentElement;
};

// All invitation cards currently rendered in the DOM.
LF.getCards = function (root) {
  return Array.prototype.slice.call(
    (root || document).querySelectorAll(LF.SELECTORS.card)
  );
};

// The block the control panel should sit above.
LF.getPanelAnchor = function () {
  var card = LF.getCards(document)[0];
  if (card) {
    var section = card.closest('section');
    return section || card.closest('[role="list"], ul, ol') || card.parentElement;
  }

  var headings = document.querySelectorAll(LF.SELECTORS.heading);

  for (var i = 0; i < headings.length; i++) {
    if (/^\s*invitations\b/i.test(headings[i].textContent || '')) {
      var headingSection = headings[i].closest('section');
      if (headingSection) return headingSection;
    }
  }

  return LF.getContainer();
};

// All messaging conversation rows currently rendered in the DOM.
LF.getMessageThreads = function (root) {
  var nodes = Array.prototype.slice.call(
    (root || document).querySelectorAll(LF.SELECTORS.messageThread)
  );
  var threads = [];
  var seen = {};

  for (var i = 0; i < nodes.length; i++) {
    var thread = nodes[i].matches('li')
      ? nodes[i]
      : nodes[i].closest('li') || nodes[i];
    var key = LF.messageThreadKey(thread) || String(i);

    if (seen[key] || !lfIsVisible(thread)) continue;

    seen[key] = true;
    threads.push(thread);
  }

  return threads;
};

// Every conversation row in the DOM, including ones LinkedBlock has hidden
// (display:none). `getMessageThreads` skips invisible rows, so filtration uses
// this variant — otherwise a hidden row could never be un-hidden again.
LF.getMessageThreadRows = function (root) {
  var nodes = (root || document).querySelectorAll(LF.SELECTORS.messageThread);
  var rows = [];
  var seen = [];

  for (var i = 0; i < nodes.length; i++) {
    var li = nodes[i].matches('li') ? nodes[i] : (nodes[i].closest('li') || nodes[i]);
    if (seen.indexOf(li) !== -1) continue;
    seen.push(li);
    rows.push(li);
  }

  return rows;
};

// The messaging conversation list, or null if it has not rendered yet. Uses
// the all-rows query so it still resolves when filtration has hidden rows.
LF.getMessageContainer = function () {
  var threads = LF.getMessageThreadRows(document);
  if (!threads.length) return null;

  var candidates = document.querySelectorAll(LF.SELECTORS.messageList);
  var best = null;
  var bestCount = 0;

  for (var i = 0; i < candidates.length; i++) {
    var count = 0;
    for (var j = 0; j < threads.length; j++) {
      if (candidates[i].contains(threads[j])) count++;
    }
    if (count > bestCount) {
      best = candidates[i];
      bestCount = count;
    }
  }

  return best || threads[0].closest('[role="list"], ul, ol') || threads[0].parentElement;
};

// The top bar that holds LinkedIn's own search/filter controls. LinkedBlock's
// messaging panel mounts immediately below it, at the top of the inbox column.
LF.getMessagingTopAnchor = function () {
  return document.querySelector(
    '.msg-cross-pillar-inbox-top-bar-wrapper__container, ' +
    '[data-test-msg-cross-pillar-inbox-top-bar-wrapper]'
  );
};

// The block the control panel should sit above on LinkedIn Messaging.
LF.getMessagingPanelAnchor = function () {
  var container = LF.getMessageContainer();
  if (container) return container;

  var headings = document.querySelectorAll(LF.SELECTORS.heading);
  for (var i = 0; i < headings.length; i++) {
    if (/^\s*messaging\b/i.test(headings[i].textContent || '')) {
      return headings[i].closest('section') || headings[i].parentElement;
    }
  }

  return null;
};

LF.findMessageThreadLink = function (thread) {
  return LF.findMessageOpenTarget(thread);
};

LF.findMessageOpenTarget = function (thread) {
  if (!thread) return null;

  if (thread.matches && thread.matches(LF.SELECTORS.messageOpenTarget)) return thread;

  return thread.querySelector(LF.SELECTORS.messageOpenTarget) ||
    thread.querySelector('[tabindex="0"]:not(button):not(input):not(a)') ||
    thread;
};

LF.messageThreadKey = function (thread) {
  if (!thread) return '';

  var card = thread.querySelector('[id^="conversation-card-"]');
  var label = thread.querySelector('[aria-label^="Select conversation with" i]');
  var participant = thread.querySelector(
    '.msg-conversation-listitem__participant-names, [class*="participant-names"]'
  );
  var time = thread.querySelector('time');

  return thread.id ||
    (card && card.id) ||
    (label && label.getAttribute('aria-label')) ||
    [
      participant ? participant.textContent : '',
      time ? time.textContent : ''
    ].join('|').replace(/\s+/g, ' ').trim() ||
    (thread.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
};

LF.isUnreadMessageThread = function (thread) {
  if (!thread) return false;
  if (thread.querySelector(LF.SELECTORS.messageUnreadMarker)) return true;

  var card = thread.querySelector('[class*="msg-conversation-card"]') || thread;
  if (/\bunread\b/i.test(card.className || '')) return true;

  var labelled = thread.querySelectorAll('[aria-label]');
  for (var i = 0; i < labelled.length; i++) {
    var label = labelled[i].getAttribute('aria-label') || '';
    if (/\b\d+\s+unread messages?\b|\bunread messages?\b|\b\d+\s+new notifications?\b/i.test(label)) {
      return true;
    }
  }

  var hiddenStatus = thread.querySelector('[data-test-notification-a11y]');
  if (hiddenStatus && /\bnew notification\b/i.test(hiddenStatus.textContent || '')) {
    return true;
  }

  return false;
};

// Pill text shown inside a conversation row's snippet ("Sponsored", "InMail").
LF.messageThreadPill = function (thread) {
  if (!thread) return '';
  var pills = thread.querySelectorAll('.msg-conversation-card__pill, [class*="msg-conversation-card__pill"]');
  for (var i = 0; i < pills.length; i++) {
    var text = (pills[i].textContent || '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  return '';
};

LF.isSponsoredMessageThread = function (thread) {
  if (!thread) return false;
  if (/^\s*sponsored\s*$/i.test(LF.messageThreadPill(thread))) return true;
  // Sponsored rows hang a hoverable trigger off the avatar even when the pill
  // text is localized or missing.
  if (thread.querySelector('[data-js-sponsored-conversation-hoverable-trigger]')) return true;

  return false;
};

LF.isInMailMessageThread = function (thread) {
  return /^\s*inmail\s*$/i.test(LF.messageThreadPill(thread));
};

// 1st-degree connections render a presence indicator (online/offline dot) that
// LinkedIn only shows for your network; out-of-network rows use a plain
// facepile with no presence entity. That wrapper — not the online state — is
// the in-network signal.
LF.isConnectionMessageThread = function (thread) {
  return !!(thread && thread.querySelector('.presence-entity, [class*="presence-entity"]'));
};

// Coarse category for targeting/filtration, computed from the list row alone
// (no need to open the conversation):
//   'sponsored' | 'inmail' | 'connection' | 'out-of-network'
LF.getThreadCategory = function (thread) {
  if (LF.isSponsoredMessageThread(thread)) return 'sponsored';
  if (LF.isInMailMessageThread(thread)) return 'inmail';
  if (LF.isConnectionMessageThread(thread)) return 'connection';
  return 'out-of-network';
};

// Stable, reload-surviving key for a conversation row. List rows only carry
// regenerated ember ids, so we anchor on the participant signature from the
// select-conversation label. Falls back to the overflow button's a11y text
// (also participant-based) and finally to participant names + snippet.
LF.conversationKey = function (thread) {
  if (!thread) return '';

  var selectLabel = thread.querySelector('[aria-label^="Select conversation with" i]');
  if (selectLabel) {
    var sel = (selectLabel.getAttribute('aria-label') || '')
      .replace(/^select conversation with\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (sel) return 'names:' + sel.toLowerCase();
  }

  var overflow = thread.querySelector('.msg-thread-actions__control .visually-hidden, .msg-thread-actions__control + * .visually-hidden');
  var overflowText = overflow ? (overflow.textContent || '') : '';
  var m = /your conversation with\s+(.+)$/i.exec(overflowText.replace(/\s+/g, ' ').trim());
  if (m && m[1]) return 'names:' + m[1].toLowerCase();

  var participant = thread.querySelector(
    '.msg-conversation-listitem__participant-names, [class*="participant-names"]'
  );
  var name = participant ? (participant.textContent || '').replace(/\s+/g, ' ').trim() : '';
  if (name) return 'names:' + name.toLowerCase();

  // The avatar's alt text is the participant's name and is set in the row markup
  // even before the text nodes paint.
  var avatar = thread.querySelector('img[alt]');
  var alt = avatar ? (avatar.getAttribute('alt') || '').replace(/\s+/g, ' ').trim() : '';
  if (alt) return 'names:' + alt.toLowerCase();

  // No stable identifier yet — the row is still hydrating. Return empty so
  // callers wait, rather than keying the cache by a volatile Ember id (which
  // changes every load and would defeat the cache entirely).
  return '';
};

// Latest-message snippet text (used for cache invalidation and the "You:"
// shortcut that tells us the user replied last).
LF.messageSnippet = function (thread) {
  if (!thread) return '';
  var snippet = thread.querySelector(
    '.msg-conversation-card__message-snippet, [class*="message-snippet"]'
  );
  return snippet ? (snippet.textContent || '').replace(/\s+/g, ' ').trim() : '';
};

// Row timestamp text (e.g. "May 20", "1:57 AM"). Combined with the snippet it
// is enough to detect that a cached conversation gained new messages.
LF.messageTimestamp = function (thread) {
  if (!thread) return '';
  var time = thread.querySelector('time');
  return time ? (time.textContent || '').replace(/\s+/g, ' ').trim() : '';
};

// True when the latest message in the row was sent by the user. LinkedIn
// prefixes the snippet with "You:" in that case.
LF.userRepliedLast = function (thread) {
  return /^you:\s*/i.test(LF.messageSnippet(thread));
};

// --- Open-conversation (reading pane) readers ------------------------------

// The currently open conversation's message events. Each event is one message;
// the other party's carry the "--other" modifier, the user's do not. The base
// class `.msg-s-event-listitem` matches only the message items, never their
// BEM children (`msg-s-event-listitem__body`, `…__link`, …).
LF.getOpenThreadEvents = function () {
  var list = document.querySelector('.msg-s-message-list-content');
  var root = list || document;
  return Array.prototype.slice.call(root.querySelectorAll('.msg-s-event-listitem'));
};

// Count incoming vs. user messages in the open conversation.
//   { otherCount, userReplied }
LF.countThreadSides = function () {
  var events = LF.getOpenThreadEvents();
  var otherCount = 0;
  var userReplied = false;

  for (var i = 0; i < events.length; i++) {
    var cls = events[i].getAttribute('class') || '';
    if (/msg-s-event-listitem--other\b/.test(cls)) {
      otherCount++;
    } else {
      userReplied = true;
    }
  }

  return { otherCount: otherCount, userReplied: userReplied };
};

// The other participant's profile URN for the open conversation, e.g.
// "ACoAAAM7ikkB...". Stable across reloads; stored as a secondary cache id.
LF.getOpenThreadProfileUrn = function () {
  var link = document.querySelector('.msg-thread__link-to-profile, [class*="msg-thread__link-to-profile"]');
  var href = link ? link.getAttribute('href') || '' : '';
  var m = /\/in\/([^/?#]+)/.exec(href);
  return m ? m[1] : '';
};

// --- Per-row overflow actions ----------------------------------------------

// The "…" overflow trigger on a conversation list row (inbox shortcuts).
LF.getRowOverflowButton = function (thread) {
  if (!thread) return null;
  return thread.querySelector(
    '.msg-conversation-card__inbox-shortcuts .msg-thread-actions__control, ' +
    '.msg-conversation-card__inbox-shortcuts [class*="msg-thread-actions__control"]'
  );
};

// Find an option button by visible text inside an open thread-actions dropdown.
LF.findThreadActionOption = function (re) {
  var menus = document.querySelectorAll(
    '.msg-thread-actions__dropdown-options--inbox-shortcuts, ' +
    '[class*="msg-thread-actions__dropdown-options"]'
  );
  for (var i = 0; i < menus.length; i++) {
    var options = menus[i].querySelectorAll('[role="button"], [role="link"], .artdeco-dropdown__item');
    for (var j = 0; j < options.length; j++) {
      if (re.test((options[j].textContent || '').replace(/\s+/g, ' ').trim())) {
        return options[j];
      }
    }
  }
  return null;
};

// Find the Accept or Ignore button inside a single card.
//   action: 'accept' | 'ignore'
// Primary match is the aria-label prefix ("Accept …" / "Ignore …"); we fall
// back to the button's visible text so a label wording tweak won't break us.
LF.findActionButton = function (card, action) {
  var labelRe = action === 'accept' ? /^accept/i : /^ignore/i;
  var wantText = action === 'accept' ? 'accept' : 'ignore';
  var buttons = card.querySelectorAll('button');

  for (var i = 0; i < buttons.length; i++) {
    var label = (buttons[i].getAttribute('aria-label') || '').trim();
    if (labelRe.test(label)) return buttons[i];
  }
  for (var j = 0; j < buttons.length; j++) {
    if ((buttons[j].textContent || '').trim().toLowerCase() === wantText) {
      return buttons[j];
    }
  }
  return null;
};

// Is the "loading more" spinner present and visible?
LF.hasLoader = function () {
  var el = document.querySelector(LF.SELECTORS.loader);
  return !!el && el.offsetParent !== null;
};

// Stable per-card id (the invitation URN) used to avoid double-processing.
LF.cardKey = function (card) {
  return card.getAttribute('componentkey') || '';
};
