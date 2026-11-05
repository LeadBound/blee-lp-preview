/* BLEE landing pages: per-lead tracking + the small runtime every option shares.
 * The link carries ?t=<opaque token> (never a name or an email).
 * A visit counts only after a human signal (scroll, pointer, touch, key, or 8 s visible), because mail
 * scanners open every link within seconds and run no interaction.
 * Events: visit, scroll_30, scroll_50, scroll_90, video_play:<id>, callback_left.
 * ENDPOINT stays null until the n8n webhook exists; until then events only go to the console.
 */
(function () {
  var ENDPOINT = 'https://bennivbee.app.n8n.cloud/webhook/blee-landing'; // n8n: LB - Landing Page <> Blee
  var LIVE = { callback_left: 1 }; // only the form leaves the page for now; per-lead tracking comes with lp_link
  var q = new URLSearchParams(location.search);
  var token = (q.get('t') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || null;
  var page = document.documentElement.getAttribute('data-page') || 'unknown';
  var sent = {}, human = false, queue = [];

  function send(name, extra) {
    if (sent[name]) return;
    sent[name] = true;
    var body = { event: name, t: token, page: page, at: new Date().toISOString(), extra: extra || null };
    if (!human && name !== 'visit') { queue.push(body); return; }
    if (!ENDPOINT || !LIVE[name]) { console.info('[blee-track]', body); return; }
    try { navigator.sendBeacon(ENDPOINT, new URLSearchParams({ d: JSON.stringify(body) })); } catch (e) { /* never breaks the page */ }
  }
  function becameHuman() {
    if (human) return;
    human = true;
    send('visit');
    queue.splice(0).forEach(function (b) { sent[b.event] = false; send(b.event, b.extra); });
  }
  ['scroll', 'pointerdown', 'pointermove', 'touchstart', 'keydown'].forEach(function (ev) {
    addEventListener(ev, becameHuman, { once: true, passive: true });
  });
  setTimeout(function () { if (document.visibilityState === 'visible') becameHuman(); }, 8000);

  addEventListener('scroll', function () {
    var h = document.documentElement;
    var p = (h.scrollTop + innerHeight) / h.scrollHeight;
    if (p > 0.3) send('scroll_30');
    if (p > 0.5) send('scroll_50');
    if (p > 0.9) send('scroll_90');
  }, { passive: true });

  // Lite YouTube: a thumbnail until the click, so the page stays light.
  document.querySelectorAll('[data-yt]').forEach(function (el) {
    el.addEventListener('click', function () {
      var id = el.getAttribute('data-yt');
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.title = el.getAttribute('aria-label') || 'video';
      el.innerHTML = '';
      el.appendChild(f);
      el.classList.add('playing');
      send('video_play:' + id);
    }, { once: true });
  });

  // Reveal on scroll (reduced motion: everything is visible from the start).
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = document.querySelectorAll('.rv');
  if (reduce || !('IntersectionObserver' in window)) items.forEach(function (x) { x.classList.add('in'); });
  else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (x) { io.observe(x); });
  }

  // Call-back form: no backend yet, so it only records the event and thanks the visitor.
  document.querySelectorAll('form[data-callback]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var tel = (f.querySelector('input[type=tel]') || {}).value || '';
      var nm = ((f.querySelector('input[name=name]') || {}).value || '').trim();
      var nameOk = !f.querySelector('input[name=name]') || nm.length >= 2;
      if (!nameOk || !/\d{9,}/.test(tel.replace(/\D/g, ''))) { f.classList.add('bad'); return; }
      becameHuman();
      var co = ((f.querySelector('input[name=company]') || {}).value || '').trim();
      send('callback_left', { tel: tel.replace(/[^\d+]/g, ''), name: nm.slice(0, 80), company: co.slice(0, 80) });
      f.innerHTML = '<p class="thanks">תודה. דביר יחזור אליכם.</p>';
    });
  });

  window.BLEE = { send: send, reduce: reduce };
})();
