// content.js — mounts the control panel and runs the bulk loop.
(function () {
  var LF = window.__LinkFilter;
  if (!LF) return;
  if (window.__LinkFilterPanelController) return;
  window.__LinkFilterPanelController = true;

  var VERIFIED_FRAGMENT = 'FROM_VERIFIED_MEMBER';
  var GROW_PATH = '/mynetwork/grow';
  var RECEIVED_PATH = '/mynetwork/invitation-manager/received';
  var MESSAGING_PATH = '/messaging';
  var RECEIVED_URL =
    'https://www.linkedin.com/mynetwork/invitation-manager/received/';
  var VERIFIED_URL =
    'https://www.linkedin.com/mynetwork/invitation-manager/received/FROM_VERIFIED_MEMBER/';
  var PENDING_ACTION_KEY = 'LinkFilter.pendingAction';
  var SETTINGS_KEY = 'LinkFilter.settings';
  var CACHE_KEY = 'LinkFilter.convCache';
  var MIN_VISIBLE_ROWS = 12; // keep the inbox at least this full after hiding

  var state = { running: false, stop: false, processed: 0 };
  var currentHref = location.href;
  var syncTimer = null;
  var mountRetriesLeft = 40;

  // Persisted UI state (#6). Defaults: target everything except your own
  // connections; filtering on, hiding sponsored/InMail and 3+ one-sided spam.
  var DEFAULT_SETTINGS = {
    target: { sponsored: true, inmail: true, outOfNetwork: true, connection: false },
    filter: { enabled: true, sponsored: true, inmail: true, oneSided: true }
  };
  var settings = cloneSettings(DEFAULT_SETTINGS);
  // Per-conversation analysis cache keyed by LF.conversationKey (#5).
  var convCache = {};
  var settingsLoaded = false;

  // Filtration lifecycle state.
  var filtrationActive = false;
  var analysisInProgress = false;
  var analysisTimer = null;
  var filterStop = false;
  var listObserver = null;
  var scrollTarget = null;
  var scrollHandler = null;

  function cloneSettings(s) { return JSON.parse(JSON.stringify(s)); }

  function mergeSettings(base, override) {
    var out = cloneSettings(base);
    if (override && typeof override === 'object') {
      ['target', 'filter'].forEach(function (group) {
        if (override[group] && typeof override[group] === 'object') {
          Object.keys(out[group]).forEach(function (key) {
            if (typeof override[group][key] === 'boolean') {
              out[group][key] = override[group][key];
            }
          });
        }
      });
    }
    return out;
  }

  function hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function loadPersisted(done) {
    if (!hasStorage()) { settingsLoaded = true; done(); return; }
    chrome.storage.local.get([SETTINGS_KEY, CACHE_KEY], function (data) {
      if (data && data[SETTINGS_KEY]) settings = mergeSettings(DEFAULT_SETTINGS, data[SETTINGS_KEY]);
      if (data && data[CACHE_KEY] && typeof data[CACHE_KEY] === 'object') convCache = data[CACHE_KEY];
      settingsLoaded = true;
      done();
    });
  }

  function saveSettings() {
    if (!hasStorage()) return;
    var payload = {};
    payload[SETTINGS_KEY] = settings;
    chrome.storage.local.set(payload);
  }

  function saveCache() {
    if (!hasStorage()) return;
    var payload = {};
    payload[CACHE_KEY] = convCache;
    chrome.storage.local.set(payload);
  }

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
      '#lf-panel.lf-panel--floating {',
      '  position: fixed;',
      '  top: 76px;',
      '  right: 24px;',
      '  z-index: 2147483647;',
      '  width: 360px;',
      '  max-width: calc(100vw - 32px);',
      '  margin: 0;',
      '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);',
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
      '#lf-panel .lf-hidden { display: none !important; }',
      '#lf-panel .lf-status {',
      '  flex: 0 1 auto;',
      '  margin-left: auto;',
      '  font-size: 12px;',
      '  color: #56687a;',
      '  min-height: 16px;',
      '  max-width: 70%;',
      '  text-align: right;',
      '}',
      '@media (max-width: 600px) {',
      '  #lf-panel.lf-panel--floating {',
      '    top: 64px;',
      '    right: 8px;',
      '    left: 8px;',
      '    width: auto;',
      '    max-width: none;',
      '  }',
      '  #lf-panel.lf-panel--floating .lf-actions { flex-wrap: wrap; }',
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
      '}',
      '#lf-panel .lf-section {',
      '  border-top: 1px solid #e3e7eb;',
      '  margin-top: 8px;',
      '  padding-top: 8px;',
      '}',
      '#lf-panel .lf-section-title {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  font-weight: 700;',
      '  font-size: 12px;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.04em;',
      '  color: #56687a;',
      '  margin-bottom: 6px;',
      '}',
      '#lf-panel .lf-checks {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 4px 14px;',
      '  margin-bottom: 8px;',
      '}',
      '#lf-panel .lf-check {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 5px;',
      '  font-size: 12px;',
      '  cursor: pointer;',
      '  white-space: nowrap;',
      '}',
      '#lf-panel .lf-check input { margin: 0; cursor: pointer; }',
      '#lf-panel .lf-check.lf-check--disabled { opacity: 0.45; cursor: default; }',
      '#lf-panel .lf-toggle { margin-left: auto; text-transform: none; letter-spacing: 0; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-section { border-top-color: #38434f; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-section-title { color: #a9b0b7; }',
      '.lf-row-hidden { display: none !important; }'
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
    '<div class="lf-row lf-actions lf-invitation-action">',
    '  <button id="lf-accept" class="lf-btn lf-accept">Accept all</button>',
    '  <button id="lf-ignore" class="lf-btn lf-ignore">Ignore all</button>',
    '  <button id="lf-verified" class="lf-btn">Accept verified only</button>',
    '</div>',
    '<div class="lf-section lf-message-action">',
    '  <div class="lf-section-title">Mark read — target</div>',
    '  <div class="lf-checks">',
    '    <label class="lf-check"><input type="checkbox" id="lf-tgt-sponsored">Sponsored</label>',
    '    <label class="lf-check"><input type="checkbox" id="lf-tgt-inmail">InMail</label>',
    '    <label class="lf-check"><input type="checkbox" id="lf-tgt-outnet">Out of network</label>',
    '    <label class="lf-check"><input type="checkbox" id="lf-tgt-conn">From connections</label>',
    '  </div>',
    '  <div class="lf-row lf-actions">',
    '    <button id="lf-mark-read" class="lf-btn lf-accept">Mark messages read</button>',
    '  </div>',
    '</div>',
    '<div class="lf-section lf-message-action">',
    '  <div class="lf-section-title">Filter',
    '    <label class="lf-check lf-toggle"><input type="checkbox" id="lf-flt-enabled">On</label>',
    '  </div>',
    '  <div class="lf-checks">',
    '    <label class="lf-check"><input type="checkbox" id="lf-flt-sponsored">Hide sponsored</label>',
    '    <label class="lf-check"><input type="checkbox" id="lf-flt-inmail">Hide InMail</label>',
    '    <label class="lf-check"><input type="checkbox" id="lf-flt-onesided">Hide 3+ one-sided</label>',
    '  </div>',
    '</div>',
    '<div class="lf-row lf-actions">',
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

  function isInvitationPage() {
    var path = cleanPath(location.pathname);

    return path === GROW_PATH ||
      path === RECEIVED_PATH ||
      path === RECEIVED_PATH + '/' + VERIFIED_FRAGMENT;
  }

  function isMessagingPage() {
    var path = cleanPath(location.pathname);
    return path === MESSAGING_PATH || path.indexOf(MESSAGING_PATH + '/') === 0;
  }

  function isTargetPage() {
    return isInvitationPage() || isMessagingPage();
  }

  function isGrowPage() {
    return cleanPath(location.pathname) === GROW_PATH;
  }

  function getPanelAnchor() {
    if (isMessagingPage() && LF.getMessagingPanelAnchor) {
      return LF.getMessagingPanelAnchor();
    }

    return LF.getPanelAnchor ? LF.getPanelAnchor() : LF.getContainer();
  }

  function toggleControls(selector, hidden) {
    var controls = panel.querySelectorAll(selector);
    for (var i = 0; i < controls.length; i++) {
      controls[i].classList.toggle('lf-hidden', hidden);
    }
  }

  function syncPanelMode() {
    var messaging = isMessagingPage();
    toggleControls('.lf-invitation-action', messaging);
    toggleControls('.lf-message-action', !messaging);
  }

  function unmountPanel() {
    stopFiltration();
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    panel.classList.remove('lf-panel--floating');
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

    syncPanelMode();
    if (isMessagingPage()) {
      var topBar = LF.getMessagingTopAnchor && LF.getMessagingTopAnchor();
      if (topBar && topBar.parentNode) {
        panel.classList.remove('lf-panel--floating');
        if (topBar.nextSibling !== panel) {
          topBar.parentNode.insertBefore(panel, topBar.nextSibling);
        }
        mountRetriesLeft = 0;
        startFiltration();
        return;
      }
      // Top bar not rendered yet — float for now and keep re-checking so we
      // can re-anchor below LinkedIn's filters once it appears.
      panel.classList.add('lf-panel--floating');
      if (panel.parentNode !== document.body) document.body.appendChild(panel);
      return;
    }

    panel.classList.remove('lf-panel--floating');
    var anchor = getPanelAnchor();
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
    $('#lf-mark-read').disabled = on;
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

  function randomMessageDelay() {
    return delay(900 + Math.floor(Math.random() * 700));
  }

  function scrollToLoadMore(container) {
    var cards = LF.getCards(container);
    if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'end' });
    window.scrollTo(0, document.body.scrollHeight);
  }

  function getScrollableParent(el) {
    var node = el;
    while (node && node !== document.body) {
      var overflowY = window.getComputedStyle(node).overflowY;
      if (node.scrollHeight > node.clientHeight && /auto|scroll|overlay/.test(overflowY)) {
        return node;
      }
      node = node.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  }

  function scrollMessagesToLoadMore(container) {
    var threads = LF.getMessageThreads ? LF.getMessageThreads(container) : [];
    var lastThread = threads[threads.length - 1];
    if (lastThread) lastThread.scrollIntoView({ block: 'end' });

    var scroller = getScrollableParent(lastThread || container);
    if (scroller === document.scrollingElement || scroller === document.documentElement) {
      window.scrollBy(0, window.innerHeight);
      return;
    }

    scroller.scrollTop += scroller.clientHeight || 400;
  }

  function dispatchActivationEvent(target, type) {
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  function dispatchEnterEvent(target, type) {
    target.dispatchEvent(new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13
    }));
  }

  function activateMessageThread(thread) {
    var target = LF.findMessageOpenTarget ? LF.findMessageOpenTarget(thread) : null;
    if (!target) return false;

    target.scrollIntoView({ block: 'center' });
    if (target.focus) {
      try {
        target.focus({ preventScroll: true });
      } catch (e) {
        target.focus();
      }
    }

    dispatchActivationEvent(target, 'mousedown');
    dispatchActivationEvent(target, 'mouseup');
    if (target.click) {
      target.click();
    } else {
      dispatchActivationEvent(target, 'click');
    }
    dispatchEnterEvent(target, 'keydown');
    dispatchEnterEvent(target, 'keyup');
    return true;
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

  async function markMessagesRead() {
    var limit = getLimit();
    var seen = {};
    var stagnant = 0;
    var lastVisibleKey = '';
    var failed = false;

    state.processed = 0;
    state.stop = false;
    setRunning(true);
    setStatus('Working...');

    while (!state.stop && (limit === 0 || state.processed < limit)) {
      var container = LF.getMessageContainer ? LF.getMessageContainer() : null;
      if (!container) {
        failed = true;
        setStatus('Message list not found - open LinkedIn Messaging first.');
        break;
      }

      var threads = LF.getMessageThreads(container);
      var unread = threads.filter(function (thread) {
        var key = LF.messageThreadKey(thread);
        if (!key || seen[key] || !LF.isUnreadMessageThread(thread)) return false;
        return isCategoryTargeted(LF.getThreadCategory(thread));
      });

      if (unread.length === 0) {
        var visibleKey = threads.length
          ? LF.messageThreadKey(threads[threads.length - 1])
          : '';
        stagnant = visibleKey === lastVisibleKey ? stagnant + 1 : 0;
        lastVisibleKey = visibleKey;

        if (stagnant >= 6) break;
        scrollMessagesToLoadMore(container);
        await delay(1200);
        continue;
      }
      stagnant = 0;
      lastVisibleKey = '';

      for (var i = 0; i < unread.length; i++) {
        if (state.stop) break;
        if (limit !== 0 && state.processed >= limit) break;

        var thread = unread[i];
        var key = LF.messageThreadKey(thread);
        if (!key || seen[key]) continue;

        if (!activateMessageThread(thread)) continue;

        seen[key] = true;
        state.processed++;
        setStatus('Marked read ' + state.processed + '...');
        await randomMessageDelay();
      }
    }

    setRunning(false);
    if (failed) return;

    setStatus(
      state.stop
        ? 'Stopped at ' + state.processed + '.'
        : 'Done. Marked read ' + state.processed + '.'
    );
  }

  // ------------------------------------------------------ settings + UI ----
  var SETTING_CONTROLS = [
    ['#lf-tgt-sponsored', 'target', 'sponsored'],
    ['#lf-tgt-inmail', 'target', 'inmail'],
    ['#lf-tgt-outnet', 'target', 'outOfNetwork'],
    ['#lf-tgt-conn', 'target', 'connection'],
    ['#lf-flt-enabled', 'filter', 'enabled'],
    ['#lf-flt-sponsored', 'filter', 'sponsored'],
    ['#lf-flt-inmail', 'filter', 'inmail'],
    ['#lf-flt-onesided', 'filter', 'oneSided']
  ];

  function applySettingsToUI() {
    SETTING_CONTROLS.forEach(function (c) {
      var el = $(c[0]);
      if (el) el.checked = !!settings[c[1]][c[2]];
    });
    reflectFilterEnabled();
  }

  // Grey out the per-category filter checkboxes while the master toggle is off.
  function reflectFilterEnabled() {
    var on = settings.filter.enabled;
    ['#lf-flt-sponsored', '#lf-flt-inmail', '#lf-flt-onesided'].forEach(function (sel) {
      var el = $(sel);
      if (!el) return;
      el.disabled = !on;
      var label = el.closest('.lf-check');
      if (label) label.classList.toggle('lf-check--disabled', !on);
    });
  }

  function bindSettingControls() {
    SETTING_CONTROLS.forEach(function (c) {
      var el = $(c[0]);
      if (!el || el.__lfBound) return;
      el.__lfBound = true;
      el.addEventListener('change', function () {
        settings[c[1]][c[2]] = el.checked;
        saveSettings();
        onSettingsChanged();
      });
    });
  }

  function onSettingsChanged() {
    reflectFilterEnabled();
    if (!isMessagingPage()) return;
    applyFilters();
    if (settings.filter.enabled) {
      scheduleAnalysis();
      fillViewport();
    }
  }

  function isCategoryTargeted(category) {
    if (category === 'sponsored') return !!settings.target.sponsored;
    if (category === 'inmail') return !!settings.target.inmail;
    if (category === 'connection') return !!settings.target.connection;
    return !!settings.target.outOfNetwork; // out-of-network
  }

  // ------------------------------------------------------------ filtration ----
  function debounce(fn, ms) {
    var t = null;
    return function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn(); }, ms);
    };
  }

  function cacheRecord(thread) {
    var key = LF.conversationKey(thread);
    return key ? convCache[key] : null;
  }

  // A cached verdict is only trusted while the row's snippet + timestamp match;
  // a new message changes those, so we re-analyze (handles old threads that
  // gain replies).
  function isRecordFresh(rec, thread) {
    return !!rec &&
      rec.snippet === LF.messageSnippet(thread) &&
      rec.timestamp === LF.messageTimestamp(thread);
  }

  function getFreshCacheRecord(thread) {
    var rec = cacheRecord(thread);
    return isRecordFresh(rec, thread) ? rec : null;
  }

  function shouldHideThread(thread) {
    if (!settings.filter.enabled) return false;
    var category = LF.getThreadCategory(thread);
    if (category === 'sponsored' && settings.filter.sponsored) return true;
    if (category === 'inmail' && settings.filter.inmail) return true;
    if (settings.filter.oneSided) {
      var rec = getFreshCacheRecord(thread);
      if (rec && rec.isSpam) return true;
    }
    return false;
  }

  // Hide/un-hide every loaded row. Cheap and synchronous: category checks read
  // the list row only; the one-sided verdict comes from the cache.
  function applyFilters() {
    var container = LF.getMessageContainer();
    if (!container) return { hidden: 0, visible: 0, total: 0 };

    var rows = LF.getMessageThreadRows(container);
    var hidden = 0;
    for (var i = 0; i < rows.length; i++) {
      var hide = shouldHideThread(rows[i]);
      rows[i].classList.toggle('lf-row-hidden', hide);
      if (hide) hidden++;
    }
    return { hidden: hidden, visible: rows.length - hidden, total: rows.length };
  }

  function isOneSidedCandidate(thread) {
    if (thread.classList.contains('lf-row-hidden')) return false; // already hidden
    if (LF.userRepliedLast(thread)) return false;                 // user replied last
    if (LF.getThreadCategory(thread) === 'connection') return false; // skip your network
    if (getFreshCacheRecord(thread)) return false;                // already analyzed
    return true;
  }

  // Wait for the opened conversation's messages to render and settle.
  async function waitForThreadPane() {
    var last = -1;
    for (var i = 0; i < 24; i++) {
      await delay(150);
      var c = LF.getOpenThreadEvents().length;
      if (c > 0 && c === last) return c;
      last = c;
    }
    return last;
  }

  // Restore a false positive (a non-spam thread we opened) to unread via the
  // row's overflow menu → "Mark as unread".
  async function markThreadUnread(thread) {
    var btn = LF.getRowOverflowButton(thread);
    if (!btn) return;
    btn.click();
    await delay(250);
    var option = LF.findThreadActionOption(/^mark as unread$/i);
    if (option) {
      option.click();
      await delay(200);
    } else {
      btn.click(); // couldn't find it — close the menu we opened
    }
  }

  async function analyzeThread(thread) {
    var key = LF.conversationKey(thread);
    if (!key) return;

    var wasUnread = LF.isUnreadMessageThread(thread);
    if (!activateMessageThread(thread)) return;
    await waitForThreadPane();

    var sides = LF.countThreadSides();
    var isSpam = sides.otherCount >= 3 && !sides.userReplied;
    convCache[key] = {
      profileUrn: LF.getOpenThreadProfileUrn(),
      snippet: LF.messageSnippet(thread),
      timestamp: LF.messageTimestamp(thread),
      otherCount: sides.otherCount,
      userReplied: sides.userReplied,
      isSpam: isSpam,
      analyzedAt: Date.now()
    };
    saveCache();

    // Opening marked the thread read; undo that for non-spam threads.
    if (!isSpam && wasUnread) await markThreadUnread(thread);
  }

  // Background pass: open uncached candidates, cache the verdict, hide spam.
  // Throttled and stoppable; cached results make later passes effectively free.
  async function analyzeOneSided() {
    if (analysisInProgress || state.running) return;
    if (!settings.filter.enabled || !settings.filter.oneSided) return;

    var container = LF.getMessageContainer();
    if (!container) return;

    analysisInProgress = true;
    filterStop = false;
    var analyzed = 0;
    try {
      var rows = LF.getMessageThreadRows(container);
      for (var i = 0; i < rows.length; i++) {
        if (filterStop || state.stop || state.running) break;
        var thread = rows[i];
        if (!document.contains(thread) || !isOneSidedCandidate(thread)) continue;

        setStatus('Scanning for one-sided senders…');
        await analyzeThread(thread);
        applyFilters();
        analyzed++;
        await randomMessageDelay();
      }
    } finally {
      analysisInProgress = false;
    }

    if (analyzed > 0) setStatus('Filtered. Scanned ' + analyzed + ' conversation(s).');
  }

  function scheduleAnalysis() {
    if (!settings.filter.enabled || !settings.filter.oneSided) return;
    if (analysisTimer || analysisInProgress) return;
    analysisTimer = setTimeout(function () {
      analysisTimer = null;
      analyzeOneSided();
    }, 600);
  }

  // After hiding, the visible list can look sparse. Pull in more rows (which
  // LinkedIn lazy-loads on scroll) and re-filter until the viewport is full or
  // nothing new loads — repeated a bounded number of times (#5).
  async function fillViewport() {
    if (!settings.filter.enabled) return;
    var container = LF.getMessageContainer();
    if (!container) return;

    for (var pass = 0; pass < 8; pass++) {
      if (filterStop || state.stop) break;
      var res = applyFilters();
      if (res.visible >= MIN_VISIBLE_ROWS) break;

      var before = res.total;
      scrollMessagesToLoadMore(container);
      await delay(1000);
      if (LF.getMessageThreadRows(container).length === before) break; // no new rows
    }
    applyFilters();
  }

  function attachObservers() {
    var container = LF.getMessageContainer();
    if (!container) return;

    var refilter = debounce(function () {
      // Only childList changes (new rows) reach us — our class toggles are
      // attribute mutations, so this can't loop on its own hiding.
      applyFilters();
      scheduleAnalysis();
    }, 250);

    if (listObserver) listObserver.disconnect();
    listObserver = new MutationObserver(refilter);
    listObserver.observe(container, { childList: true, subtree: true });

    detachScroll();
    scrollTarget = getScrollableParent(container);
    scrollHandler = refilter;
    (scrollTarget || window).addEventListener('scroll', scrollHandler, true);
  }

  function detachScroll() {
    if (scrollHandler) {
      (scrollTarget || window).removeEventListener('scroll', scrollHandler, true);
    }
    scrollHandler = null;
    scrollTarget = null;
  }

  function startFiltration() {
    if (!settingsLoaded) return; // load callback re-triggers a sync
    if (filtrationActive) { applyFilters(); return; }
    filtrationActive = true;
    filterStop = false;
    attachObservers();
    applyFilters();
    fillViewport();
    scheduleAnalysis();
  }

  function stopFiltration() {
    if (!filtrationActive && !listObserver) return;
    filtrationActive = false;
    filterStop = true;
    if (analysisTimer) { clearTimeout(analysisTimer); analysisTimer = null; }
    if (listObserver) { listObserver.disconnect(); listObserver = null; }
    detachScroll();
  }

  // --------------------------------------------------------------- wiring ----
  bindSettingControls();

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
  $('#lf-mark-read').addEventListener('click', function () {
    if (!state.running) markMessagesRead();
  });
  $('#lf-stop').addEventListener('click', function () {
    state.stop = true;
    filterStop = true;
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
    // While floating on messaging, keep trying to re-anchor below the top bar.
    if (isMessagingPage() && panel.classList.contains('lf-panel--floating')) {
      syncPanel();
    }
    if (panel.isConnected) consumePendingAction();
  }, 500);

  // Hydrate persisted settings (#6), reflect them into the panel, then mount.
  loadPersisted(function () {
    applySettingsToUI();
    retryMount();
  });
})();
