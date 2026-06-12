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
  loader: '[data-testid="loader"]'
};

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
