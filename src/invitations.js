// invitations.js — bulk Accept / Ignore on the received-invitations page.
// The orchestrator decides *when* to call run() (and handles the grow-page
// redirect); this module only walks the list and clicks.
(function () {
  var LF = window.__LinkedBlock || (window.__LinkedBlock = {});
  var util = LF.util;

  LF.Invitations = {
    // action: 'accept' | 'ignore'. Reads limit/stop/status via LF.ctx.
    // Returns the number of invitations processed.
    run: async function (action) {
      var ctx = LF.ctx;
      var container = LF.getContainer();
      if (!container) {
        ctx.setStatus('List not found — open the invitations page first.');
        return 0;
      }

      var limit = ctx.getLimit();
      var seen = {};
      var stagnant = 0; // consecutive scrolls that revealed nothing new
      var processed = 0;
      ctx.setStatus('Working…');

      while (!ctx.isStopped() && (limit === 0 || processed < limit)) {
        var cards = LF.getCards(container).filter(function (c) {
          return !seen[LF.cardKey(c)] && LF.findActionButton(c, action);
        });

        if (cards.length === 0) {
          if (LF.hasLoader() && stagnant < 15) {
            util.scrollInvitationsToLoadMore(container);
            stagnant++;
            await util.delay(1200);
            continue;
          }
          break; // truly done (or gave up scrolling)
        }
        stagnant = 0;

        for (var i = 0; i < cards.length; i++) {
          if (ctx.isStopped()) break;
          if (limit !== 0 && processed >= limit) break;

          var card = cards[i];
          var key = LF.cardKey(card);
          if (seen[key]) continue;
          seen[key] = true;

          var btn = LF.findActionButton(card, action);
          if (!btn) continue;

          btn.click();
          processed++;
          ctx.setStatus((action === 'ignore' ? 'Ignored ' : 'Accepted ') + processed + '…');
          await util.randomDelay();
        }
      }

      var verb = action === 'ignore' ? 'Ignored' : 'Accepted';
      ctx.setStatus(ctx.isStopped()
        ? 'Stopped at ' + processed + '.'
        : 'Done. ' + verb + ' ' + processed + '.');
      return processed;
    }
  };
})();
