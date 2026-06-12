// content.js — mounts the control panel and runs the bulk loop.
(function () {
  var LF = window.__LinkFilter;
  if (!LF) return;
  if (window.__LinkFilterPanelController) return;
  window.__LinkFilterPanelController = true;

  var VERIFIED_FRAGMENT = 'FROM_VERIFIED_MEMBER';
  var GROW_PATH = '/mynetwork/grow';
  var RECEIVED_PATH = '/mynetwork/invitation-manager/received';
  var RECEIVED_URL =
    'https://www.linkedin.com/mynetwork/invitation-manager/received/';
  var VERIFIED_URL =
    'https://www.linkedin.com/mynetwork/invitation-manager/received/FROM_VERIFIED_MEMBER/';
  var PENDING_ACTION_KEY = 'LinkFilter.pendingAction';

  var state = { running: false, stop: false, processed: 0 };
  var currentHref = location.href;
  var syncTimer = null;
  var mountRetriesLeft = 40;

  function injectStyles() {
    if (document.getElementById('lf-panel-style')) return;

    var style = document.createElement('style');
    style.id = 'lf-panel-style';
    style.textContent = [
      '#lf-panel {',
      '  position: relative;',
      '  z-index: 1;',
      '  width: 100%;',
      '  max-width: 100%;',
      '  margin: 0 0 12px;',
      '  padding: 12px;',
      '  box-sizing: border-box;',
      '  background: #fff;',
      '  color: #1d2226;',
      '  border: 1px solid #d0d5da;',
      '  border-radius: 10px;',
      '  font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;',
      '  font-size: 13px;',
      '  line-height: 1.3;',
      '}',
      '#lf-panel .lf-header {',
      '  display: flex;',
      '  align-items: flex-start;',
      '  justify-content: space-between;',
      '  gap: 12px;',
      '  margin-bottom: 10px;',
      '}',
      '#lf-panel .lf-title {',
      '  font-weight: 700;',
      '  font-size: 14px;',
      '}',
      '#lf-panel .lf-row {',
      '  display: flex;',
      '  align-items: center;',
      '  flex-wrap: wrap;',
      '  gap: 6px;',
      '  margin-bottom: 8px;',
      '}',
      '#lf-panel .lf-btn {',
      '  flex: 1 1 auto;',
      '  min-width: 0;',
      '  padding: 5px 8px;',
      '  border-radius: 16px;',
      '  border: 1px solid #0a66c2;',
      '  background: #fff;',
      '  color: #0a66c2;',
      '  font-weight: 600;',
      '  font-size: 12px;',
      '  line-height: 1.2;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  white-space: nowrap;',
      '  cursor: pointer;',
      '}',
      '#lf-panel .lf-btn:hover:not(:disabled) { background: #eaf3fb; }',
      '#lf-panel .lf-btn:disabled { opacity: 0.5; cursor: default; }',
      '#lf-panel .lf-accept { background: #0a66c2; color: #fff; }',
      '#lf-panel .lf-accept:hover:not(:disabled) { background: #004182; }',
      '#lf-panel .lf-ignore { border-color: #b24020; color: #b24020; }',
      '#lf-panel .lf-ignore:hover:not(:disabled) { background: #fbece8; }',
      '#lf-panel .lf-stop { border-color: #666; color: #666; }',
      '#lf-panel .lf-stop:hover:not(:disabled) { background: #f0f0f0; }',
      '#lf-panel .lf-limit { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }',
      '#lf-panel .lf-limit input {',
      '  width: 52px;',
      '  padding: 4px;',
      '  border: 1px solid #d0d5da;',
      '  border-radius: 4px;',
      '  font-size: 13px;',
      '}',
      '#lf-panel .lf-hint { font-size: 11px; color: #8a949c; }',
      '#lf-panel .lf-actions {',
      '  flex-wrap: nowrap;',
      '  margin-bottom: 0;',
      '}',
      '#lf-panel .lf-status {',
      '  flex: 0 1 auto;',
      '  margin-left: auto;',
      '  font-size: 12px;',
      '  color: #56687a;',
      '  min-height: 16px;',
      '  max-width: 70%;',
      '  text-align: right;',
      '}',
      'body[data-color-scheme="dark"] #lf-panel {',
      '  background: #1b1f23;',
      '  color: #e9e5df;',
      '  border-color: #38434f;',
      '}',
      'body[data-color-scheme="dark"] #lf-panel .lf-btn { background: #1b1f23; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-accept { background: #0a66c2; color: #fff; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-status { color: #a9b0b7; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-limit input {',
      '  background: #38434f;',
      '  color: #e9e5df;',
      '  border-color: #56687a;',
      '}'
    ].join('\n');

    (document.head || document.documentElement).appendChild(style);
  }

  injectStyles();

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
    '    <input id="lf-limit" type="number" min="0" value="100">',
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

  function isGrowPage() {
    return cleanPath(location.pathname) === GROW_PATH;
  }

  function unmountPanel() {
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    if (state.running) state.stop = true;
  }

  function retryMount() {
    mountRetriesLeft = 40;
    scheduleSync();
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
    mountRetriesLeft = 0;
    consumePendingAction();
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
    if (!isTargetPage()) {
      state.stop = true;
      unmountPanel();
      return;
    }
    retryMount();
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

  function queueActionOnReceivedPage(action) {
    sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({
      action: action,
      limit: getLimit()
    }));
    setStatus('Opening invitation manager…');
    location.href = RECEIVED_URL;
  }

  function consumePendingAction() {
    if (state.running || isGrowPage()) return;

    var raw = sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return;
    if (cleanPath(location.pathname) !== RECEIVED_PATH) return;
    if (!LF.getContainer()) return;

    var pending;
    try {
      pending = JSON.parse(raw);
    } catch (e) {
      sessionStorage.removeItem(PENDING_ACTION_KEY);
      return;
    }

    if (!pending || (pending.action !== 'accept' && pending.action !== 'ignore')) {
      sessionStorage.removeItem(PENDING_ACTION_KEY);
      return;
    }

    sessionStorage.removeItem(PENDING_ACTION_KEY);
    if (typeof pending.limit === 'number') limitInput.value = String(pending.limit);
    setTimeout(function () { processAll(pending.action); }, 100);
  }

  // ----------------------------------------------------------- main loop ----
  async function processAll(action) {
    if (isGrowPage()) {
      queueActionOnReceivedPage(action);
      return;
    }

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

  // LinkedIn is an SPA. Polling covers pushState changes that content scripts
  // cannot observe reliably from the isolated world and catches late lists.
  window.addEventListener('popstate', retryMount);

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    if (typeof original !== 'function') return;

    history[name] = function () {
      var result = original.apply(this, arguments);
      checkLocation();
      if (isTargetPage()) retryMount();
      return result;
    };
  });

  setInterval(function () {
    checkLocation();

    if (isTargetPage() && !panel.isConnected && mountRetriesLeft > 0) {
      mountRetriesLeft--;
      syncPanel();
    }
    if (panel.isConnected) consumePendingAction();
  }, 500);

  retryMount();
})();
