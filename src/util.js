// util.js — shared timing + DOM-interaction helpers. No business logic and no
// knowledge of which page we're on; just primitives the other modules reuse.
(function () {
  var LF = window.__LinkedBlock || (window.__LinkedBlock = {});
  var util = (LF.util = LF.util || {});

  util.delay = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  // Human-like pauses so a burst of actions doesn't look like a bot.
  util.randomDelay = function () {
    return util.delay(300 + Math.floor(Math.random() * 500));
  };
  util.randomMessageDelay = function () {
    return util.delay(900 + Math.floor(Math.random() * 700));
  };

  util.debounce = function (fn, ms) {
    var t = null;
    return function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn(); }, ms);
    };
  };

  // The nearest ancestor that actually scrolls, or the document scroller.
  util.getScrollableParent = function (el) {
    var node = el;
    while (node && node !== document.body) {
      var overflowY = window.getComputedStyle(node).overflowY;
      if (node.scrollHeight > node.clientHeight && /auto|scroll|overlay/.test(overflowY)) {
        return node;
      }
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  // Nudge the invitations list to lazy-load its next chunk.
  util.scrollInvitationsToLoadMore = function (container) {
    var cards = LF.getCards(container);
    if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'end' });
    window.scrollTo(0, document.body.scrollHeight);
  };

  // Nudge the messaging list to lazy-load its next chunk.
  util.scrollMessagesToLoadMore = function (container) {
    var threads = LF.getMessageThreads ? LF.getMessageThreads(container) : [];
    var last = threads[threads.length - 1];
    if (last) last.scrollIntoView({ block: 'end' });

    var scroller = util.getScrollableParent(last || container);
    if (scroller === document.scrollingElement || scroller === document.documentElement) {
      window.scrollBy(0, window.innerHeight);
      return;
    }
    scroller.scrollTop += scroller.clientHeight || 400;
  };

  function dispatchMouse(target, type) {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  function dispatchEnter(target, type) {
    target.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13
    }));
  }

  // Open a conversation row. LinkedIn rows are Ember divs, not links, so we
  // synthesize the full mouse+keyboard activation it expects.
  util.activateMessageThread = function (thread) {
    var target = LF.findMessageOpenTarget ? LF.findMessageOpenTarget(thread) : null;
    if (!target) return false;

    target.scrollIntoView({ block: 'center' });
    if (target.focus) {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }

    dispatchMouse(target, 'mousedown');
    dispatchMouse(target, 'mouseup');
    if (target.click) target.click(); else dispatchMouse(target, 'click');
    dispatchEnter(target, 'keydown');
    dispatchEnter(target, 'keyup');
    return true;
  };
})();
