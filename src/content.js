// content.js — injects the floating control panel and runs the bulk loop.
(function () {
  var LF = window.__LinkFilter;
  if (!LF) return;
  if (document.getElementById('lf-panel')) return; // never inject twice

  var VERIFIED_FRAGMENT = 'FROM_VERIFIED_MEMBER';
  var VERIFIED_URL =
    'https://www.linkedin.com/mynetwork/invitation-manager/received/FROM_VERIFIED_MEMBER/';

  var state = { running: false, stop: false, processed: 0 };

  // ---------------------------------------------------------------- panel ----
  var panel = document.createElement('div');
  panel.id = 'lf-panel';
  panel.innerHTML = [
    '<div class="lf-title">LinkFilter</div>',
    '<div class="lf-row">',
    '  <label class="lf-limit">Limit',
    '    <input id="lf-limit" type="number" min="0" value="5">',
    '  </label>',
    '  <span class="lf-hint">0 = all</span>',
    '</div>',
    '<div class="lf-row">',
    '  <button id="lf-accept" class="lf-btn lf-accept">Accept all</button>',
    '  <button id="lf-ignore" class="lf-btn lf-ignore">Ignore all</button>',
    '</div>',
    '<div class="lf-row">',
    '  <button id="lf-verified" class="lf-btn">Accept verified only</button>',
    '</div>',
    '<div class="lf-row">',
    '  <button id="lf-stop" class="lf-btn lf-stop" disabled>Stop</button>',
    '</div>',
    '<div id="lf-status" class="lf-status">Idle</div>'
  ].join('');
  document.body.appendChild(panel);

  var $ = function (sel) { return panel.querySelector(sel); };
  var limitInput = $('#lf-limit');
  var statusEl = $('#lf-status');

  function setStatus(t) { statusEl.textContent = t; }

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
  function randomDelay() { return delay(800 + Math.floor(Math.random() * 1200)); }

  function scrollToLoadMore(container) {
    var cards = LF.getCards(container);
    if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'end' });
    window.scrollTo(0, document.body.scrollHeight);
  }

  // ----------------------------------------------------------- main loop ----
  async function processAll(action) {
    var container = LF.getContainer();
    if (!container) {
      setStatus('List not found — open the invitation manager page first.');
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
    // on it, switch there first (the panel re-injects after navigation).
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
})();
