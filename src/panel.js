// panel.js — the LinkedBlock control panel: styles, markup, and a small API the
// orchestrator drives. It renders state and emits user intents through the
// handlers passed to init(); it knows nothing about LinkedIn's DOM, routing, or
// the bulk/filter logic.
(function () {
  var LF = window.__LinkedBlock || (window.__LinkedBlock = {});

  var STYLE_ID = 'lf-panel-style';

  // Inline icons (currentColor so they inherit the button's text colour).
  var ICON_POWER =
    '<svg class="lf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round"><path d="M12 3v8"/>' +
    '<path d="M6.4 7.2a8 8 0 1 0 11.2 0"/></svg>';
  var ICON_MAIL =
    '<svg class="lf-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>';

  // checkbox id -> [settings group, key]
  var CHECKBOXES = [
    ['lf-tgt-sponsored', 'target', 'sponsored'],
    ['lf-tgt-inmail', 'target', 'inmail'],
    ['lf-tgt-outnet', 'target', 'outOfNetwork'],
    ['lf-tgt-conn', 'target', 'connection'],
    ['lf-flt-sponsored', 'filter', 'sponsored'],
    ['lf-flt-inmail', 'filter', 'inmail'],
    ['lf-flt-onesided', 'filter', 'oneSided']
  ];

  var panel = null;
  var handlers = {};

  function settings() { return LF.Store.settings(); }
  function $(sel) { return panel.querySelector(sel); }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#lf-panel {',
      '  position: relative;', // no z-index: a stacking context here would trap the popover
      '  width: 100%;',
      '  max-width: 100%;',
      '  margin: 0 0 8px;',
      '  padding: 8px 10px;',
      '  box-sizing: border-box;',
      '  background: #fff;',
      '  color: #1d2226;',
      '  border: 1px solid #d0d5da;',
      '  border-radius: 8px;',
      '  font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;',
      '  font-size: 13px;',
      '  line-height: 1.3;',
      '}',
      // One wrapping flex row — two lines at most.
      '#lf-panel .lf-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; }',
      '#lf-panel .lf-group { display: inline-flex; align-items: center; gap: 6px; }',
      '#lf-panel .lf-btn {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  padding: 5px 12px;',
      '  border-radius: 16px;',
      '  border: 1px solid #0a66c2;',
      '  background: #fff;',
      '  color: #0a66c2;',
      '  font-weight: 600;',
      '  font-size: 12px;',
      '  line-height: 1.2;',
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
      '#lf-panel .lf-ico { width: 14px; height: 14px; display: block; flex: 0 0 auto; }',
      // Filter on/off toggle pill.
      '#lf-panel .lf-pill {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  padding: 5px 14px;',
      '  border-radius: 16px;',
      '  border: 1px solid transparent;',
      '  font-weight: 600;',
      '  font-size: 12px;',
      '  line-height: 1.2;',
      '  white-space: nowrap;',
      '  cursor: pointer;',
      '}',
      '#lf-panel .lf-pill--on { background: #057642; border-color: #057642; color: #fff; }',
      '#lf-panel .lf-pill--on:hover { background: #04582f; }',
      '#lf-panel .lf-pill--off { background: #fff; border-color: #c4ccd3; color: #56687a; }',
      '#lf-panel .lf-pill--off:hover { background: #f0f0f0; }',
      // Round icon button (settings gear).
      '#lf-panel .lf-icon {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 28px;',
      '  height: 28px;',
      '  padding: 0;',
      '  border-radius: 50%;',
      '  border: 1px solid #d0d5da;',
      '  background: #fff;',
      '  color: #56687a;',
      '  font-size: 15px;',
      '  line-height: 1;',
      '  cursor: pointer;',
      '}',
      '#lf-panel .lf-icon:hover { background: #f0f0f0; }',
      '#lf-panel .lf-icon.lf-icon--active { background: #eaf3fb; border-color: #0a66c2; color: #0a66c2; }',
      '#lf-panel .lf-limit {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: space-between;',
      '  gap: 8px;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '}',
      '#lf-panel .lf-hint { font-weight: 400; color: #8a949c; }',
      '#lf-panel .lf-limit input {',
      '  width: 56px;',
      '  padding: 4px 6px;',
      '  border: 1px solid #d0d5da;',
      '  border-radius: 4px;',
      '  font-size: 13px;',
      '}',
      '#lf-panel .lf-hidden { display: none !important; }',
      '#lf-panel .lf-status {',
      '  margin-left: auto;',
      '  font-size: 12px;',
      '  color: #56687a;',
      '  text-align: right;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  max-width: 45%;',
      '}',
      // Advanced settings live in a popover under the gear. It is position:fixed
      // (placed via JS on open) so LinkedIn's overflow-clipped messaging column
      // can never cut off the lower half (the checkboxes).
      '#lf-panel .lf-pop {',
      '  position: fixed;',
      '  z-index: 2147483647;',
      '  width: 260px;',
      '  max-width: calc(100vw - 32px);',
      '  padding: 12px;',
      '  box-sizing: border-box;',
      '  background: #fff;',
      '  border: 1px solid #d0d5da;',
      '  border-radius: 8px;',
      '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);',
      '}',
      '#lf-panel .lf-pop .lf-section + .lf-section { margin-top: 12px; }',
      '#lf-panel .lf-section-title {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  font-weight: 700;',
      '  font-size: 11px;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.04em;',
      '  color: #56687a;',
      '  margin-bottom: 8px;',
      '}',
      '#lf-panel .lf-checks { display: flex; flex-direction: column; gap: 7px; }',
      '#lf-panel .lf-check { display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }',
      // LinkedIn globally hides native checkboxes (it uses custom ones); force
      // ours back to a real, visible, clickable checkbox.
      '#lf-panel .lf-check input[type="checkbox"] {',
      '  -webkit-appearance: checkbox !important;',
      '  appearance: auto !important;',
      '  width: 14px !important;',
      '  height: 14px !important;',
      '  min-width: 14px !important;',
      '  min-height: 14px !important;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  position: static !important;',
      '  opacity: 1 !important;',
      '  visibility: visible !important;',
      '  clip: auto !important;',
      '  clip-path: none !important;',
      '  overflow: visible !important;',
      '  pointer-events: auto !important;',
      '  flex: 0 0 auto !important;',
      '  box-sizing: border-box !important;',
      '  accent-color: #0a66c2;',
      '  cursor: pointer;',
      '}',
      '#lf-panel .lf-check.lf-check--disabled { opacity: 0.45; cursor: default; }',
      'body[data-color-scheme="dark"] #lf-panel {',
      '  background: #1b1f23;',
      '  color: #e9e5df;',
      '  border-color: #38434f;',
      '}',
      'body[data-color-scheme="dark"] #lf-panel .lf-btn { background: #1b1f23; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-accept { background: #0a66c2; color: #fff; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-icon { background: #1b1f23; border-color: #38434f; color: #a9b0b7; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-status { color: #a9b0b7; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-limit input {',
      '  background: #38434f;',
      '  color: #e9e5df;',
      '  border-color: #56687a;',
      '}',
      'body[data-color-scheme="dark"] #lf-panel .lf-pop { background: #1b1f23; border-color: #38434f; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-section-title { color: #a9b0b7; }',
      'body[data-color-scheme="dark"] #lf-panel .lf-pill--off {',
      '  background: #1b1f23;',
      '  border-color: #56687a;',
      '  color: #a9b0b7;',
      '}',
      '.lf-row-hidden { display: none !important; }'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function build() {
    panel = document.getElementById('lf-panel') || document.createElement('div');
    panel.id = 'lf-panel';
    panel.innerHTML = [
      '<div class="lf-bar">',
      '  <span class="lf-group lf-invitation-action">',
      '    <button id="lf-accept" class="lf-btn lf-accept">Accept all</button>',
      '    <button id="lf-ignore" class="lf-btn lf-ignore">Ignore all</button>',
      '    <button id="lf-verified" class="lf-btn">Verified only</button>',
      '  </span>',
      '  <span class="lf-group lf-message-action">',
      '    <button id="lf-filter-toggle" class="lf-pill" type="button" aria-pressed="true" ',
      '      title="Toggle inbox filtering">' + ICON_POWER +
      '      <span class="lf-pill-label">Filter On</span></button>',
      '    <button id="lf-mark-read" class="lf-btn lf-accept" ',
      '      title="Mark targeted unread conversations as read">' + ICON_MAIL +
      '      Mark all as read</button>',
      '  </span>',
      '  <button id="lf-settings" class="lf-icon" type="button" title="Settings" ',
      '    aria-label="Settings" aria-expanded="false">⚙</button>',
      '  <button id="lf-stop" class="lf-btn lf-stop lf-hidden" disabled>Stop</button>',
      '  <span id="lf-status" class="lf-status">Idle</span>',
      '</div>',
      '<div id="lf-pop" class="lf-pop lf-hidden">',
      '  <div class="lf-section">',
      '    <label class="lf-limit">Limit <span class="lf-hint">(0 = all)</span>',
      '      <input id="lf-limit" type="number" min="0" value="100"></label>',
      '  </div>',
      '  <div class="lf-section lf-message-action">',
      '    <div class="lf-section-title">Mark read — target</div>',
      '    <div class="lf-checks">',
      '      <label class="lf-check"><input type="checkbox" id="lf-tgt-sponsored">Sponsored</label>',
      '      <label class="lf-check"><input type="checkbox" id="lf-tgt-inmail">InMail</label>',
      '      <label class="lf-check"><input type="checkbox" id="lf-tgt-outnet">Out of network</label>',
      '      <label class="lf-check"><input type="checkbox" id="lf-tgt-conn">From connections</label>',
      '    </div>',
      '  </div>',
      '  <div class="lf-section lf-message-action">',
      '    <div class="lf-section-title">Filter out</div>',
      '    <div class="lf-checks">',
      '      <label class="lf-check"><input type="checkbox" id="lf-flt-sponsored">Sponsored</label>',
      '      <label class="lf-check"><input type="checkbox" id="lf-flt-inmail">InMail</label>',
      '      <label class="lf-check"><input type="checkbox" id="lf-flt-onesided">3+ one-sided messages</label>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
  }

  function updatePill() {
    var btn = $('#lf-filter-toggle');
    if (!btn) return;
    var on = !!settings().filter.enabled;
    btn.classList.toggle('lf-pill--on', on);
    btn.classList.toggle('lf-pill--off', !on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var label = btn.querySelector('.lf-pill-label');
    if (label) label.textContent = on ? 'Filter On' : 'Filter Off';
  }

  // Grey out the per-category filter checkboxes while the master toggle is off.
  function reflectFilterEnabled() {
    var on = settings().filter.enabled;
    ['lf-flt-sponsored', 'lf-flt-inmail', 'lf-flt-onesided'].forEach(function (id) {
      var el = $('#' + id);
      if (!el) return;
      el.disabled = !on;
      var label = el.closest('.lf-check');
      if (label) label.classList.toggle('lf-check--disabled', !on);
    });
  }

  function reflectSettings() {
    CHECKBOXES.forEach(function (c) {
      var el = $('#' + c[0]);
      if (el) el.checked = !!settings()[c[1]][c[2]];
    });
    updatePill();
    reflectFilterEnabled();
  }

  // Place the fixed-position popover just under the gear, right-aligned to it
  // and clamped to the viewport.
  function positionPopover() {
    var pop = $('#lf-pop');
    var rect = $('#lf-settings').getBoundingClientRect();
    var width = Math.min(260, window.innerWidth - 16);
    var left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    pop.style.width = width + 'px';
    pop.style.left = left + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';
  }

  function toggleSettings(open) {
    var pop = $('#lf-pop');
    var gear = $('#lf-settings');
    var show = typeof open === 'boolean' ? open : pop.classList.contains('lf-hidden');
    if (show) positionPopover();
    pop.classList.toggle('lf-hidden', !show);
    gear.classList.toggle('lf-icon--active', show);
    gear.setAttribute('aria-expanded', show ? 'true' : 'false');
  }

  function call(name, arg) { if (handlers[name]) handlers[name](arg); }

  function wire() {
    $('#lf-accept').addEventListener('click', function () { call('onAccept'); });
    $('#lf-ignore').addEventListener('click', function () { call('onIgnore'); });
    $('#lf-verified').addEventListener('click', function () { call('onVerified'); });
    $('#lf-mark-read').addEventListener('click', function () { call('onMarkRead'); });
    $('#lf-stop').addEventListener('click', function () { call('onStop'); });

    $('#lf-filter-toggle').addEventListener('click', function () {
      var s = settings();
      s.filter.enabled = !s.filter.enabled;
      LF.Store.saveSettings();
      reflectSettings();
      call('onToggleFilter', s.filter.enabled);
    });

    CHECKBOXES.forEach(function (c) {
      var el = $('#' + c[0]);
      if (!el) return;
      el.addEventListener('change', function () {
        settings()[c[1]][c[2]] = el.checked;
        LF.Store.saveSettings();
        reflectFilterEnabled();
        call('onChangeSetting');
      });
    });

    $('#lf-settings').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleSettings();
    });
    document.addEventListener('click', function (e) {
      if (!panel || $('#lf-pop').classList.contains('lf-hidden')) return;
      if (panel.contains(e.target)) return;
      toggleSettings(false);
    });
  }

  LF.Panel = {
    el: null,

    init: function (h) {
      handlers = h || {};
      injectStyles();
      build();
      wire();
      reflectSettings();
      LF.Panel.el = panel;
    },

    setStatus: function (text) { $('#lf-status').textContent = text; },

    // Disable action buttons and reveal Stop while a long task runs.
    setBusy: function (on) {
      ['#lf-accept', '#lf-ignore', '#lf-verified', '#lf-mark-read'].forEach(function (sel) {
        var el = $(sel); if (el) el.disabled = on;
      });
      var stop = $('#lf-stop');
      stop.disabled = !on;
      stop.classList.toggle('lf-hidden', !on);
    },

    // 'messaging' | 'invitations' — show the controls relevant to the page.
    setMode: function (mode) {
      var messaging = mode === 'messaging';
      panel.querySelectorAll('.lf-invitation-action').forEach(function (el) {
        el.classList.toggle('lf-hidden', messaging);
      });
      panel.querySelectorAll('.lf-message-action').forEach(function (el) {
        el.classList.toggle('lf-hidden', !messaging);
      });
    },

    reflectSettings: reflectSettings,
    closeSettings: function () { toggleSettings(false); },

    getLimit: function () {
      var n = parseInt($('#lf-limit').value, 10);
      return isNaN(n) || n < 0 ? 0 : n;
    },
    setLimit: function (n) { $('#lf-limit').value = String(n); }
  };
})();
