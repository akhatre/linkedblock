// store.js — persisted settings and the per-conversation analysis cache. The
// single source of truth for user preferences; every other module reads
// LF.Store.settings() rather than keeping its own copy.
(function () {
  var LF = window.__LinkedBlock || (window.__LinkedBlock = {});

  var SETTINGS_KEY = 'LinkedBlock.settings';
  var CACHE_KEY = 'LinkedBlock.convCache';

  // Defaults: mark-read targets sponsored / InMail / out-of-network senders
  // (never your own connections); filtering on, hiding sponsored and InMail.
  // `oneSided` is OFF by default and opt-in: unlike the sponsored/InMail filters
  // (pure, local row-hiding), detecting one-sided spam opens each suspect
  // conversation to read its history — which marks it read on the server — so it
  // is not a purely-local action and shouldn't run on a fresh install unasked.
  var DEFAULTS = {
    target: { sponsored: true, inmail: true, outOfNetwork: true, connection: false },
    filter: { enabled: true, sponsored: true, inmail: true, oneSided: false }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Merge persisted values onto the defaults, accepting only known boolean keys
  // so an old/garbage payload can never introduce unexpected shape.
  function merge(base, override) {
    var out = clone(base);
    if (override && typeof override === 'object') {
      ['target', 'filter'].forEach(function (group) {
        if (override[group] && typeof override[group] === 'object') {
          Object.keys(out[group]).forEach(function (key) {
            if (typeof override[group][key] === 'boolean') out[group][key] = override[group][key];
          });
        }
      });
    }
    return out;
  }

  // chrome.storage is usable only while the extension context is alive. After an
  // extension reload an orphaned content script still runs but every chrome.*
  // call throws "Extension context invalidated", so we gate on chrome.runtime.id
  // and swallow failures rather than spamming the console.
  function hasStorage() {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id &&
        chrome.storage && chrome.storage.local;
    } catch (e) { return false; }
  }

  var settings = clone(DEFAULTS);
  var cache = {};
  var loaded = false;

  LF.Store = {
    settings: function () { return settings; },
    cache: function () { return cache; },
    isLoaded: function () { return loaded; },

    load: function (done) {
      if (!hasStorage()) { loaded = true; if (done) done(); return; }
      try {
        chrome.storage.local.get([SETTINGS_KEY, CACHE_KEY], function (data) {
          if (data && data[SETTINGS_KEY]) settings = merge(DEFAULTS, data[SETTINGS_KEY]);
          if (data && data[CACHE_KEY] && typeof data[CACHE_KEY] === 'object') cache = data[CACHE_KEY];
          loaded = true;
          if (done) done();
        });
      } catch (e) { loaded = true; if (done) done(); }
    },

    saveSettings: function () {
      if (!hasStorage()) return;
      try { var p = {}; p[SETTINGS_KEY] = settings; chrome.storage.local.set(p); } catch (e) {}
    },

    saveCache: function () {
      if (!hasStorage()) return;
      try { var p = {}; p[CACHE_KEY] = cache; chrome.storage.local.set(p); } catch (e) {}
    }
  };
})();
