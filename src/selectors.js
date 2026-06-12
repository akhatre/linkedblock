// selectors.js — every DOM anchor LinkFilter relies on, in one place.
//
// LinkedIn's CSS classes are hashed and change on every deploy, so we only
// anchor on stable, semantic attributes (data-testid, role, componentkey,
// aria-label) and module headings as a fallback. If LinkedIn changes their
// markup, this is the only file you should need to touch.
var LF = window.__LinkFilter || (window.__LinkFilter = {});

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

// The messaging conversation list, or null if it has not rendered yet.
LF.getMessageContainer = function () {
  var threads = LF.getMessageThreads(document);
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

LF.isSponsoredMessageThread = function (thread) {
  var pills = thread ? thread.querySelectorAll('.msg-conversation-card__pill') : [];
  for (var i = 0; i < pills.length; i++) {
    if (/^\s*sponsored\s*$/i.test(pills[i].textContent || '')) return true;
  }

  return !!(thread && /\bsponsored\b/i.test(thread.textContent || ''));
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
