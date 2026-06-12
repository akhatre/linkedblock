// content.js — mounts the control panel and runs the bulk loop.
(function () {
  var LF = window.__LinkFilter;
  if (!LF) return;
  if (window.__LinkFilterPanelController) return;
  window.__LinkFilterPanelController = true;

  var VERIFIED_FRAGMENT = 'FROM_VERIFIED_MEMBER';
  var GROW_PATH = '/mynetwork/grow';
  var RECEIVED_PATH = '/mynetwork/invitation-manager/received';
  var VERIFIED_URL =
    'https://www.linkedin.com/mynetwork/invitation-manager/received/FROM_VERIFIED_MEMBER/';

  var state = { running: false, stop: false, processed: 0 };
  var currentHref = location.href;
  var syncTimer = null;

  // ---------------------------------------------------------------- panel ----
  var panel = document.getElementById('lf-panel') || document.createElement('div');
  panel.id = 'lf-panel';
  panel.innerHTML = [
    '<div class="lf-header">',
    '  <div class="lf-title">LinkFilter</div>',
    '  <div id="lf-status" class="lf-status">Idle</div>',
    '</div>',
    '<div class="lf-row">',
    '  <label class="lf-limit">Limit',
    '    <input id="lf-limit" type="number" min="0" value="5">',
    '  </label>',
    '  <span class="lf-hint">0 = all</span>',
    '</div>',
    '<div class="lf-row lf-actions">',
    '  <button id="lf-accept" class="lf-btn lf-accept">Accept all</button>',
    '  <button id="lf-ignore" class="lf-btn lf-ignore">Ignore all</button>',
    '  <button id="lf-verified" class="lf-btn">Accept verified only</button>',
    '  <button id="lf-stop" class="lf-btn lf-stop" disabled>Stop</button>',
    '</div>'
  ].join('');

  var $ = function (sel) { return panel.querySelector(sel); };
  var limitInput = $('#lf-limit');
  var statusEl = $('#lf-status');

  function setStatus(t) { statusEl.textContent = t; }

  function cleanPath(path) {
    return path.replace(/\/+$/, '');
  }

  function isTargetPage() {
    var path = cleanPath(location.pathname);

    return path === GROW_PATH ||
      path === RECEIVED_PATH ||
      path === RECEIVED_PATH + '/' + VERIFIED_FRAGMENT;
  }

  function unmountPanel() {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    if (state.running) state.stop = true;
  }

  function syncPanel() {
    if (!isTargetPage()) {
      unmountPanel();
      return;
    }

    var anchor = LF.getPanelAnchor ? LF.getPanelAnchor() : LF.getContainer();
    if (!anchor || !anchor.parentNode || anchor === panel || panel.contains(anchor)) {
      unmountPanel();
      return;
    }

    if (panel.parentNode !== anchor.parentNode || panel.nextSibling !== anchor) {
      anchor.parentNode.insertBefore(panel, anchor);
    }
  }

  function scheduleSync() {
    if (syncTimer) return;

    syncTimer = setTimeout(function () {
      syncTimer = null;
      syncPanel();
    }, 100);
  }

  function checkLocation() {
    if (location.href === currentHref) return;

    currentHref = location.href;
    if (!isTargetPage()) state.stop = true;
    scheduleSync();
  }

  function setRunning(on) {
    state.running = on;
    $('#lf-accept').disabled = on;
    $('#lf-ignore').disabled = on;
    $('#lf-verified').disabled = on;
    $('#lf-stop').disabled = !on;
  }

  function getLimit() {
    var n = parseInt(limitInput.value, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }

  // -------------------------------------------------------------- helpers ----
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Human-like pause between actions so we don't look like a bot.
  function randomDelay() { return delay(300 + Math.floor(Math.random() * 500)); }

  function scrollToLoadMore(container) {
    var cards = LF.getCards(container);
    if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'end' });
    window.scrollTo(0, document.body.scrollHeight);
  }

  // ----------------------------------------------------------- main loop ----
  async function processAll(action) {
    var container = LF.getContainer();
    if (!container) {
      setStatus('List not found — open the invitations page first.');
      return;
    }

    var limit = getLimit();
    var seen = {};
    var stagnant = 0; // consecutive scroll attempts that found nothing new

    state.processed = 0;
    state.stop = false;
    setRunning(true);
    setStatus('Working…');

    while (!state.stop && (limit === 0 || state.processed < limit)) {
      var cards = LF.getCards(container).filter(function (c) {
        return !seen[LF.cardKey(c)] && LF.findActionButton(c, action);
      });

      if (cards.length === 0) {
        // Nothing actionable on screen — try to load the next chunk.
        if (LF.hasLoader() && stagnant < 15) {
          scrollToLoadMore(container);
          stagnant++;
          await delay(1200);
          continue;
        }
        break; // truly done (or gave up scrolling)
      }
      stagnant = 0;

      for (var i = 0; i < cards.length; i++) {
        if (state.stop) break;
        if (limit !== 0 && state.processed >= limit) break;

        var card = cards[i];
        var key = LF.cardKey(card);
        if (seen[key]) continue;
        seen[key] = true;

        var btn = LF.findActionButton(card, action);
        if (!btn) continue;

        btn.click();
        state.processed++;
        setStatus(
          (action === 'ignore' ? 'Ignored ' : 'Accepted ') + state.processed + '…'
        );
        await randomDelay();
      }
    }

    setRunning(false);
    var verb = action === 'ignore' ? 'Ignored' : 'Accepted';
    setStatus(
      state.stop
        ? 'Stopped at ' + state.processed + '.'
        : 'Done. ' + verb + ' ' + state.processed + '.'
    );
  }

  // --------------------------------------------------------------- wiring ----
  $('#lf-accept').addEventListener('click', function () {
    if (!state.running) processAll('accept');
  });
  $('#lf-ignore').addEventListener('click', function () {
    if (!state.running) processAll('ignore');
  });
  $('#lf-verified').addEventListener('click', function () {
    if (state.running) return;
    // "Verified only" reuses LinkedIn's own tab filter. If we're not already
    // on it, switch there first (the panel remounts after navigation).
    if (location.href.indexOf(VERIFIED_FRAGMENT) === -1) {
      setStatus('Switching to Verified tab — click again when it loads.');
      location.href = VERIFIED_URL;
      return;
    }
    processAll('accept');
  });
  $('#lf-stop').addEventListener('click', function () {
    state.stop = true;
    setStatus('Stopping…');
  });

  // LinkedIn is an SPA, so URL and DOM changes can happen without a full page
  // load. Polling covers pushState changes that content scripts cannot observe
  // reliably from the isolated world; the observer catches late-rendered lists.
  window.addEventListener('popstate', scheduleSync);

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;

    history[name] = function () {
      var result = original.apply(this, arguments);
      checkLocation();
      scheduleSync();
      return result;
    };
  });

  setInterval(checkLocation, 500);

  new MutationObserver(function () {
    checkLocation();
    scheduleSync();
  }).observe(document.documentElement, { childList: true, subtree: true });

  syncPanel();
})();
