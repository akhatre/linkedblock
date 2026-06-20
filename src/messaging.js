// messaging.js — everything specific to LinkedIn Messaging:
//   • markRead()  — bulk-open targeted unread conversations to clear them.
//   • Filter      — hide spam from the inbox and run the one-shot scan.
//
// markRead() and the manual Stop use LF.ctx (the shared run context). The Filter
// runs in the background and has its own halt() that the Stop button calls.
(function () {
  var LF = window.__LinkedBlock || (window.__LinkedBlock = {});
  var util = LF.util;

  var MAX_ANALYZE_ROWS = 50; // only ever auto-scan the first N conversations

  function S() { return LF.Store.settings(); }
  function cache() { return LF.Store.cache(); }

  // Which list-row categories the "Mark read" action should touch.
  function isCategoryTargeted(category) {
    var t = S().target;
    if (category === 'sponsored') return !!t.sponsored;
    if (category === 'inmail') return !!t.inmail;
    if (category === 'connection') return !!t.connection;
    return !!t.outOfNetwork; // out-of-network
  }

  // ---------------------------------------------------------------- mark read --
  async function markRead() {
    var ctx = LF.ctx;
    var limit = ctx.getLimit();
    var seen = {};
    var stagnant = 0;
    var lastVisibleKey = '';
    var processed = 0;
    var failed = false;
    ctx.setStatus('Working…');

    while (!ctx.isStopped() && (limit === 0 || processed < limit)) {
      var container = LF.getMessageContainer ? LF.getMessageContainer() : null;
      if (!container) {
        failed = true;
        ctx.setStatus('Message list not found — open LinkedIn Messaging first.');
        break;
      }

      var threads = LF.getMessageThreads(container);
      var unread = threads.filter(function (thread) {
        var key = LF.messageThreadKey(thread);
        if (!key || seen[key] || !LF.isUnreadMessageThread(thread)) return false;
        return isCategoryTargeted(LF.getThreadCategory(thread));
      });

      if (unread.length === 0) {
        var visibleKey = threads.length ? LF.messageThreadKey(threads[threads.length - 1]) : '';
        stagnant = visibleKey === lastVisibleKey ? stagnant + 1 : 0;
        lastVisibleKey = visibleKey;
        if (stagnant >= 6) break;
        util.scrollMessagesToLoadMore(container);
        await util.delay(1200);
        continue;
      }
      stagnant = 0;
      lastVisibleKey = '';

      for (var i = 0; i < unread.length; i++) {
        if (ctx.isStopped()) break;
        if (limit !== 0 && processed >= limit) break;

        var thread = unread[i];
        var key = LF.messageThreadKey(thread);
        if (!key || seen[key]) continue;
        if (!util.activateMessageThread(thread)) continue;

        seen[key] = true;
        processed++;
        ctx.setStatus('Marked read ' + processed + '…');
        await util.randomMessageDelay();
      }
    }

    if (!failed) {
      ctx.setStatus(ctx.isStopped()
        ? 'Stopped at ' + processed + '.'
        : 'Done. Marked read ' + processed + '.');
    }
    return processed;
  }

  // ---------------------------------------------------------------- filtration --
  var Filter = (function () {
    var active = false;
    var inProgress = false;     // an analyze() pass is running
    var timer = null;           // debounced scheduleAnalyze handle
    var halted = false;         // Stop / unmount requested
    var observer = null;
    var observedContainer = null; // the list element `observer` is watching
    var initialDone = false;    // one-shot pass guard, per page visit

    // A cached verdict is trusted while the row's snippet is unchanged. A new
    // message always changes the snippet — that's our "new message vs. cache"
    // signal. We ignore the timestamp because LinkedIn renders relative times
    // ("2m" → "3m") that tick on their own and would force pointless rescans.
    function freshRecord(thread) {
      var key = LF.conversationKey(thread);
      var rec = key ? cache()[key] : null;
      if (!rec) return null;
      var cur = LF.messageSnippet(thread);
      // If the snippet hasn't painted yet, trust the cache rather than treating
      // the row as changed (which would cause a needless re-scan on every load).
      if (!cur) return rec;
      return cur === rec.snippet ? rec : null;
    }

    function shouldHide(thread) {
      var f = S().filter;
      if (!f.enabled) return false;
      var category = LF.getThreadCategory(thread);
      if (category === 'sponsored' && f.sponsored) return true;
      if (category === 'inmail' && f.inmail) return true;
      if (f.oneSided) {
        var rec = freshRecord(thread);
        if (rec && rec.isSpam) return true;
      }
      return false;
    }

    // Hide/un-hide every loaded row. Cheap, synchronous: category from the row,
    // one-sided verdict from the cache.
    function applyFilters() {
      var container = LF.getMessageContainer();
      if (!container) return { hidden: 0, visible: 0, total: 0 };
      var rows = LF.getMessageThreadRows(container);
      var hidden = 0;
      for (var i = 0; i < rows.length; i++) {
        var hide = shouldHide(rows[i]);
        rows[i].classList.toggle('lf-row-hidden', hide);
        if (hide) hidden++;
      }
      return { hidden: hidden, visible: rows.length - hidden, total: rows.length };
    }

    function isCandidate(thread) {
      if (thread.classList.contains('lf-row-hidden')) return false; // already hidden
      if (!LF.conversationKey(thread)) return false;                // still hydrating — wait
      if (LF.userRepliedLast(thread)) return false;                 // user replied last
      if (LF.getThreadCategory(thread) === 'connection') return false; // skip your network
      if (freshRecord(thread)) return false;                        // already analyzed
      return true;
    }

    // Temporary diagnostic: explains why the scan (re)runs by reporting cache
    // size and, for the first few candidates, whether they're uncached or a
    // stale key/snippet mismatch.
    function logScanState(container) {
      try {
        var rows = LF.getMessageThreadRows(container).slice(0, MAX_ANALYZE_ROWS);
        var keys = Object.keys(cache());
        var samples = [];
        for (var i = 0; i < rows.length && samples.length < 6; i++) {
          if (!isCandidate(rows[i])) continue;
          var k = LF.conversationKey(rows[i]);
          var rec = k ? cache()[k] : null;
          samples.push({
            key: k,
            cached: !!rec,
            cachedSnip: rec && rec.snippet ? rec.snippet.slice(0, 40) : null,
            curSnip: LF.messageSnippet(rows[i]).slice(0, 40)
          });
        }
        console.info('[LinkedBlock] scan: rows=' + rows.length + ' cacheEntries=' + keys.length +
          ' candidates=' + rows.filter(isCandidate).length);
        if (samples.length) console.info('[LinkedBlock] candidate samples:', JSON.stringify(samples, null, 1));
      } catch (e) {}
    }

    // Wait for the opened conversation's messages to render and settle.
    async function waitForPane() {
      var last = -1;
      for (var i = 0; i < 24; i++) {
        await util.delay(150);
        var c = LF.getOpenThreadEvents().length;
        if (c > 0 && c === last) return c;
        last = c;
      }
      return last;
    }

    // Restore a non-spam thread we opened back to unread via its row overflow
    // menu → "Mark as unread".
    async function markUnread(thread) {
      var btn = LF.getRowOverflowButton(thread);
      if (!btn) return;
      btn.click();
      await util.delay(250);
      var option = LF.findThreadActionOption(/^mark as unread$/i);
      if (option) { option.click(); await util.delay(200); } else { btn.click(); }
    }

    async function analyzeThread(thread) {
      var key = LF.conversationKey(thread);
      if (!key) return;

      var wasUnread = LF.isUnreadMessageThread(thread);
      if (!util.activateMessageThread(thread)) return;
      await waitForPane();

      var sides = LF.countThreadSides();
      var isSpam = sides.otherCount >= 3 && !sides.userReplied;
      cache()[key] = {
        profileUrn: LF.getOpenThreadProfileUrn(),
        snippet: LF.messageSnippet(thread),
        timestamp: LF.messageTimestamp(thread),
        otherCount: sides.otherCount,
        userReplied: sides.userReplied,
        isSpam: isSpam,
        analyzedAt: Date.now()
      };
      LF.Store.saveCache();

      // Opening marked it read; undo that for non-spam threads.
      if (!isSpam && wasUnread) await markUnread(thread);
    }

    // Open every uncached candidate in the first MAX_ANALYZE_ROWS rows, cache the
    // verdict, hide spam. Skipped while a manual task (mark read) is running.
    async function analyze() {
      var ctx = LF.ctx;
      if (inProgress || ctx.isBusy()) return;
      var f = S().filter;
      if (!f.enabled || !f.oneSided) return;
      var container = LF.getMessageContainer();
      if (!container) return;

      inProgress = true;
      var analyzed = 0;
      try {
        var rows = LF.getMessageThreadRows(container).slice(0, MAX_ANALYZE_ROWS);
        for (var i = 0; i < rows.length; i++) {
          if (halted || ctx.isBusy()) break;
          var thread = rows[i];
          if (!document.contains(thread) || !isCandidate(thread)) continue;
          ctx.setStatus('Scanning for one-sided senders…');
          await analyzeThread(thread);
          applyFilters();
          analyzed++;
          await util.randomMessageDelay();
        }
      } finally {
        inProgress = false;
      }
      if (analyzed > 0) ctx.setStatus('Filtered. Scanned ' + analyzed + ' conversation(s).');
    }

    function scheduleAnalyze() {
      var f = S().filter;
      if (!f.enabled || !f.oneSided) return;
      if (timer || inProgress) return;
      timer = setTimeout(function () { timer = null; analyze(); }, 600);
    }

    // One-shot per page visit: scroll-load up to MAX_ANALYZE_ROWS conversations
    // and analyze the uncached ones, then stop. Only keeps scrolling while a pass
    // actually found new conversations — so a warm cache (reload with no new
    // messages) does nothing and never scrolls. Later genuinely-new messages are
    // still caught by the observer (their cache record is missing/stale).
    async function initialPass() {
      if (initialDone) return;
      initialDone = true;

      applyFilters(); // hide already-known spam in whatever is loaded
      var f = S().filter;
      if (!f.enabled || !f.oneSided) return;

      var ctx = LF.ctx;
      var container = LF.getMessageContainer();
      if (!container) return;

      logScanState(container); // one-time diagnostic for the rescan investigation

      // Capture the scroller that actually moves when we open conversations
      // (the one holding the rows, not necessarily the list container) so we can
      // put it back where the user had it afterwards.
      var firstRow = LF.getMessageThreadRows(container)[0];
      var scroller = util.getScrollableParent(firstRow || container);
      var startTop = scroller ? scroller.scrollTop : 0;
      var startWin = window.scrollY;

      for (var pass = 0; pass < 14; pass++) {
        if (halted || ctx.isBusy()) break;
        container = LF.getMessageContainer();
        if (!container) break;

        var rows = LF.getMessageThreadRows(container).slice(0, MAX_ANALYZE_ROWS);
        if (!rows.some(isCandidate)) break; // nothing new in the loaded window

        await analyze();

        var total = LF.getMessageThreadRows(container).length;
        if (total >= MAX_ANALYZE_ROWS) break;

        util.scrollMessagesToLoadMore(container);
        await util.delay(900);
        applyFilters();
        if (LF.getMessageThreadRows(container).length === total) break; // no new rows
      }

      // Return the inbox to where the user started rather than parked mid-list.
      // Always restore (even on stop), and reset both the list scroller and the
      // window since either may have moved while opening conversations.
      if (scroller) { try { scroller.scrollTop = startTop; } catch (e) {} }
      try { window.scrollTo(0, startWin); } catch (e) {}
      applyFilters();
    }

    function attachObserver(container) {
      // Re-hide on re-render and re-check the top rows when a new message bumps a
      // conversation up. The analyzer only touches the first MAX_ANALYZE_ROWS, so
      // scrolling (which appends older rows below) never triggers analysis. We do
      // not listen for scroll events on purpose.
      var refilter = util.debounce(function () { applyFilters(); scheduleAnalyze(); }, 300);
      if (observer) observer.disconnect();
      observer = new MutationObserver(refilter);
      observer.observe(container, { childList: true, subtree: true });
      observedContainer = container;
    }

    return {
      // Safe to call on every tick: only does real work when there's no live
      // observer on the current conversation list (first mount, or after
      // LinkedIn swaps the inbox subtree on navigation).
      start: function () {
        if (!LF.Store.isLoaded()) return; // load callback re-triggers a sync
        halted = false;
        active = true;
        var container = LF.getMessageContainer();
        if (!container) return;
        if (observer && observedContainer === container && container.isConnected) return;
        attachObserver(container);
        applyFilters();
        initialPass();    // guarded by initialDone: the heavy pass runs once
      },
      halt: function (resetPass) {
        if (!active && !observer) {
          if (resetPass) initialDone = false;
          return;
        }
        active = false;
        halted = true;
        if (resetPass) initialDone = false; // re-run the one-shot pass next visit
        if (timer) { clearTimeout(timer); timer = null; }
        if (observer) { observer.disconnect(); observer = null; }
        observedContainer = null;
      },
      // Settings changed: re-hide and analyze what's loaded, but never scroll.
      onSettingsChanged: function () {
        applyFilters();
        if (S().filter.enabled) scheduleAnalyze();
      },
      // Explicitly (re)run the full first-50 pass — used when the user turns the
      // filter on, where loading is expected.
      reRunInitialPass: function () { initialDone = false; halted = false; initialPass(); }
    };
  })();

  LF.Messaging = { markRead: markRead, Filter: Filter };
})();
