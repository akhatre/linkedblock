// app.js — orchestrator. Owns routing, SPA-navigation handling, single-instance
// ownership, and wiring the panel's buttons to the invitation / messaging
// modules. This is the only file that knows about the page lifecycle.
(function () {
  var VERSION = '0.5.0';
  function log() {
    try { console.info.apply(console, ['[LinkedBlock]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  // True only while our extension context is alive. After an extension reload an
  // orphaned content script keeps running but every chrome.* call fails — that's
  // what produces the `chrome-extension://invalid/` console spam. We detect it
  // and self-destruct so this instance never becomes a zombie.
  function contextAlive() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  var LF = window.__LinkedBlock;
  if (!LF || !LF.Panel || !LF.Store || !LF.Invitations || !LF.Messaging) {
    log('modules missing — load order problem', {
      LF: !!LF, Panel: !!(LF && LF.Panel), Store: !!(LF && LF.Store),
      Invitations: !!(LF && LF.Invitations), Messaging: !!(LF && LF.Messaging)
    });
    return;
  }

  // --- single-instance ownership --------------------------------------------
  // A fresh load supersedes any previous instance (e.g. after the extension is
  // reloaded in the same tab) so we never end up with two competing panels.
  LF.generation = (LF.generation || 0) + 1;
  var myGen = LF.generation;
  function superseded() { return LF.generation !== myGen; }
  log('ready — v' + VERSION + ', instance ' + myGen);

  // Drop any panels left behind by an older instance before we build ours.
  (function removeStrayPanels() {
    var nodes = document.querySelectorAll('#lf-panel');
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  })();

  // --- routing --------------------------------------------------------------
  var VERIFIED_FRAGMENT = 'FROM_VERIFIED_MEMBER';
  var GROW_PATH = '/mynetwork/grow';
  var RECEIVED_PATH = '/mynetwork/invitation-manager/received';
  var RECEIVED_URL = 'https://www.linkedin.com/mynetwork/invitation-manager/received/';
  var VERIFIED_URL = RECEIVED_URL + VERIFIED_FRAGMENT + '/';
  var PENDING_ACTION_KEY = 'LinkedBlock.pendingAction';

  function cleanPath(p) { return p.replace(/\/+$/, ''); }
  function isInvitationPage() {
    var p = cleanPath(location.pathname);
    return p === GROW_PATH || p === RECEIVED_PATH || p === RECEIVED_PATH + '/' + VERIFIED_FRAGMENT;
  }
  // Messaging is detected by the presence of its DOM, never by the URL. On
  // click-through SPA navigation LinkedIn renders the entire messaging app into a
  // pre-warmed `<iframe src="/preload/">` and only updates the *top* frame's URL
  // to /messaging/… — leaving the top document empty. The content script runs in
  // every frame (manifest `all_frames`), so the instance inside that iframe is
  // the one that must mount the panel; but the iframe's own location is /preload/,
  // so any URL check would miss it. Anchoring on the DOM matches the right frame
  // in both cases: the iframe on SPA navigation, the top frame on direct loads.
  function isMessagingPage() {
    return !!((LF.getMessagingTopAnchor && LF.getMessagingTopAnchor()) ||
              (LF.getMessageContainer && LF.getMessageContainer()));
  }
  function isTargetPage() { return isInvitationPage() || isMessagingPage(); }
  function isGrowPage() { return cleanPath(location.pathname) === GROW_PATH; }

  // --- shared run context (consumed by the modules) -------------------------
  LF.app = { busy: false, stop: false };
  LF.ctx = {
    setStatus: function (t) { LF.Panel.setStatus(t); },
    isBusy: function () { return LF.app.busy; },
    isStopped: function () { return LF.app.stop; },
    getLimit: function () { return LF.Panel.getLimit(); }
  };
  function setBusy(on) {
    LF.app.busy = on;
    if (on) LF.app.stop = false; // a fresh task clears any prior stop
    LF.Panel.setBusy(on);
  }

  // --- actions --------------------------------------------------------------
  async function startInvitation(action) {
    if (LF.app.busy) return;
    if (isGrowPage()) { queuePendingAction(action); return; } // jump to the real list first
    setBusy(true);
    try { await LF.Invitations.run(action); }
    finally { setBusy(false); }
  }

  function startVerified() {
    if (LF.app.busy) return;
    // Reuse LinkedIn's own "verified" tab filter; switch there first if needed.
    if (location.href.indexOf(VERIFIED_FRAGMENT) === -1) {
      LF.Panel.setStatus('Switching to Verified tab — click again when it loads.');
      location.href = VERIFIED_URL;
      return;
    }
    startInvitation('accept');
  }

  async function startMarkRead() {
    if (LF.app.busy) return;
    setBusy(true);
    try { await LF.Messaging.markRead(); }
    finally { setBusy(false); }
  }

  // The grow page has no actionable list, so stash the request and bounce to the
  // received-invitations page, where consumePendingAction picks it back up.
  function queuePendingAction(action) {
    sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify({ action: action, limit: LF.Panel.getLimit() }));
    LF.Panel.setStatus('Opening invitation manager…');
    location.href = RECEIVED_URL;
  }

  function consumePendingAction() {
    if (LF.app.busy || isGrowPage()) return;
    var raw = sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return;
    if (cleanPath(location.pathname) !== RECEIVED_PATH) return;
    if (!LF.getContainer()) return;

    var pending;
    try { pending = JSON.parse(raw); } catch (e) { sessionStorage.removeItem(PENDING_ACTION_KEY); return; }
    if (!pending || (pending.action !== 'accept' && pending.action !== 'ignore')) {
      sessionStorage.removeItem(PENDING_ACTION_KEY);
      return;
    }
    sessionStorage.removeItem(PENDING_ACTION_KEY);
    if (typeof pending.limit === 'number') LF.Panel.setLimit(pending.limit);
    setTimeout(function () { startInvitation(pending.action); }, 100);
  }

  // --- mounting (always inline; never floating) -----------------------------
  // Returns { parent, before } describing where the panel should sit, or null
  // if the page hasn't rendered its anchor yet (the interval will retry).
  function resolveMount() {
    if (isMessagingPage()) {
      var topBar = LF.getMessagingTopAnchor && LF.getMessagingTopAnchor();
      if (topBar && topBar.parentNode) return { parent: topBar.parentNode, before: topBar.nextSibling };
      var list = LF.getMessageContainer && LF.getMessageContainer();
      if (list && list.parentNode) return { parent: list.parentNode, before: list };
      return null;
    }
    var anchor = LF.getPanelAnchor ? LF.getPanelAnchor() : LF.getContainer();
    if (anchor && anchor.parentNode && anchor !== panel && !panel.contains(anchor)) {
      return { parent: anchor.parentNode, before: anchor };
    }
    return null;
  }

  var anchorWaitLogged = false;
  function syncPanel() {
    if (superseded()) { teardown(); return; }
    if (!isTargetPage()) { unmount(); return; }

    var mode = isMessagingPage() ? 'messaging' : 'invitations';
    LF.Panel.setMode(mode);

    // Only (re)insert when we're actually detached. Once mounted we leave the
    // node alone even as LinkedIn re-renders the surrounding list — chasing the
    // moving anchor every tick is what caused the panel to oscillate.
    if (!panel.isConnected) {
      var spot = resolveMount();
      if (!spot) {
        if (!anchorWaitLogged) {
          if (isMessagingPage()) {
            log('waiting for messaging anchor —',
              'topBar:', !!(LF.getMessagingTopAnchor && LF.getMessagingTopAnchor()),
              'list:', !!(LF.getMessageContainer && LF.getMessageContainer()),
              'rows:', LF.getMessageThreadRows ? LF.getMessageThreadRows(document).length : 'n/a');
          } else {
            log('waiting for invitations anchor to render…');
          }
          anchorWaitLogged = true;
        }
        return; // anchor not ready; retried on the interval
      }
      anchorWaitLogged = false;
      spot.parent.insertBefore(panel, spot.before);
      log('panel mounted (' + mode + ')');
    }

    if (isMessagingPage()) LF.Messaging.Filter.start();
    consumePendingAction();
  }

  function unmount() {
    LF.Messaging.Filter.halt(true); // reset the one-shot pass for next visit
    if (panel.parentNode) panel.parentNode.removeChild(panel);
    if (LF.app.busy) LF.app.stop = true;
  }

  var syncTimer = null;
  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = setTimeout(function () { syncTimer = null; syncPanel(); }, 100);
  }

  var currentHref = location.href;
  function checkLocation() {
    if (location.href === currentHref) return;
    currentHref = location.href;
    if (!isTargetPage()) { LF.app.stop = true; unmount(); return; }
    scheduleSync();
  }

  // --- build the panel ------------------------------------------------------
  LF.Panel.init({
    onAccept: function () { startInvitation('accept'); },
    onIgnore: function () { startInvitation('ignore'); },
    onVerified: startVerified,
    onMarkRead: startMarkRead,
    onToggleFilter: function (enabled) {
      LF.Messaging.Filter.onSettingsChanged();
      if (enabled && isMessagingPage()) LF.Messaging.Filter.reRunInitialPass();
    },
    onChangeSetting: function () {
      if (isMessagingPage()) LF.Messaging.Filter.onSettingsChanged();
    },
    onStop: function () {
      LF.app.stop = true;
      LF.Messaging.Filter.halt(false); // stop the scan, keep the one-shot guard
      LF.Panel.setStatus('Stopping…');
    }
  });
  var panel = LF.Panel.el;

  // --- navigation watch -----------------------------------------------------
  // LinkedIn is an SPA. Content scripts can't reliably observe the page's own
  // history calls from the isolated world, so we both patch history and poll.
  function active() { return contextAlive() && !superseded(); }
  window.addEventListener('popstate', function () { if (active()) scheduleSync(); });
  ['pushState', 'replaceState'].forEach(function (name) {
    var orig = history[name];
    if (typeof orig !== 'function') return;
    history[name] = function () {
      var result = orig.apply(this, arguments);
      if (active()) { checkLocation(); if (isTargetPage()) scheduleSync(); }
      return result;
    };
  });

  var intervalId = setInterval(function () {
    if (!contextAlive()) { log('context invalidated — tearing down zombie instance'); teardown(); return; }
    if (superseded()) { teardown(); return; }
    checkLocation();
    // Re-assert on every tick. syncPanel is idempotent — it moves the panel only
    // when its anchor changes, (re)starts the filter only when the inbox list was
    // swapped, and unmounts when this frame no longer shows a target page. We call
    // it unconditionally (rather than gating on isTargetPage) so the instance
    // inside the /preload/ iframe tears its panel down when LinkedIn swaps that
    // frame away from messaging: the iframe's URL never changes, so the vanishing
    // DOM is the only signal it gets.
    syncPanel();
  }, 500);

  function teardown() {
    try { LF.Messaging.Filter.halt(true); } catch (e) {}
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    clearInterval(intervalId);
  }

  // --- go -------------------------------------------------------------------
  LF.Store.load(function () {
    if (superseded()) return;
    LF.Panel.reflectSettings();
    scheduleSync();
  });
})();
