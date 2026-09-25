/* ==========================================================================
   Truebourne — page behaviour
   ========================================================================== */
(function () {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const simpleHero = root.classList.contains('simple-hero');   // phones: no intro, no scroll effects
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  /* ------------------------------------------------------------------------
     Hero: four black holes; the mark is where their horizons meet
     ------------------------------------------------------------------------ */
  const hero = $('[data-hero]');
  const nav = $('[data-nav]');
  const canvas = $('.hero-canvas', hero);
  const heroContent = $('.hero-content', hero);
  let horizon = null;
  let layout = { cx: innerWidth / 2, cy: innerHeight / 2, size: 300 };
  let heroP = -1;

  // Ticker beside the headline.
  let tickerTimer = null;
  function startTicker() {
    if (tickerTimer) return;
    const items = $$('.ticker-item', hero);
    let i = 0;
    tickerTimer = setInterval(() => {
      if (document.hidden || heroP > 0.4) return;
      const prev = items[i];
      prev.classList.remove('is-on');
      prev.classList.add('is-off');
      setTimeout(() => prev.classList.remove('is-off'), 700);
      i = (i + 1) % items.length;
      items[i].classList.add('is-on');
    }, 3200);
  }

  // Declared before the renderer exists: reduced motion and the no-WebGL path call this synchronously.
  function formed() { hero.classList.add('is-formed'); startTicker(); }

  // Where the horizons meet. Off-centre on wide screens so the copy sits in the shadows of the
  // two lower black holes; on narrower screens the lower half is darkened behind the copy instead.
  function computeLayout() {
    const w = hero.clientWidth || innerWidth, h = hero.clientHeight || innerHeight;
    const gutter = parseFloat(getComputedStyle(heroContent).paddingLeft) || 24;
    const half = (window.TBHorizon && window.TBHorizon.channelHalf) || 0.2;
    let cx, cy, size, fade;
    if (w >= 1100) {
      // Wide screens: the headline sits in the lower-left shadow and the signup in the lower-right,
      // so place the lower channel just past the headline's actual width.
      size = Math.min(h * 0.56, w * 0.4); cy = h * 0.42; fade = [0.2, 0.5];
      const fontPx = parseFloat(getComputedStyle($('.hero-title', hero)).fontSize) || 56;
      cx = Math.min(w * 0.66, Math.max(w * 0.58, gutter + fontPx * 12.6 + size * half + 40));
    } else if (w >= 700) { size = Math.min(h * 0.4, w * 0.5); cx = w * 0.62; cy = h * 0.32; fade = [0.88, 0.62]; }
    else { size = Math.min(w * 0.8, h * 0.34); cx = w * 0.56; cy = h * 0.28; fade = [0.94, 0.64]; }
    layout = { cx, cy, size };
    // On wide screens keep the copy clear of the lower channel;
    // narrower layouts darken the lower screen instead, so the copy can take the full width.
    const clear = size * half + 40;
    hero.style.setProperty('--lead-w', w >= 1100 ? Math.max(300, cx - clear - gutter) + 'px' : '100%');
    hero.style.setProperty('--side-w', Math.max(300, Math.min(380, w - gutter - (cx + clear))) + 'px');
    hero.style.setProperty('--mark-x', ((cx / w) * 100).toFixed(1) + '%');
    hero.style.setProperty('--mark-y', ((cy / h) * 100).toFixed(1) + '%');
    if (horizon) horizon.setLayout(cx, cy, size, fade);
    else drawFallback();
  }

  // Without WebGL the four horizons are drawn once, still.
  function drawFallback() {
    const svg = $('[data-hero-fallback]', hero);
    if (!svg || !window.TBHorizon) return;
    const pt = ([x, y]) => (layout.cx + x * layout.size).toFixed(1) + ' ' + (layout.cy - y * layout.size).toFixed(1);
    const d = window.TBHorizon.horizons(400).map((line) => 'M' + line.map(pt).join('L')).join('');
    svg.setAttribute('viewBox', `0 0 ${hero.clientWidth} ${hero.clientHeight}`);
    svg.innerHTML = `<path class="fb-glow" d="${d}"/>`;
  }

  if (window.TBHorizon && window.TBHorizon.supported()) {
    try {
      horizon = window.TBHorizon.create(canvas, { reducedMotion: reduced, skipIntro: simpleHero, onFormed: formed });
    } catch (err) {
      console.warn('[horizon] falling back to still horizons:', err);
      horizon = null;
    }
  }
  if (!horizon) { root.classList.add('no-webgl'); formed(); }
  computeLayout();
  requestAnimationFrame(() => nav.classList.add('is-in'));

  // The hero drifts up slower than the page, the camera pushes in, and it all fades away.
  // On phones it simply scrolls with the page: main-thread scroll effects stutter there.
  let heroKey = '';
  function updateHero() {
    const h = hero.clientHeight || innerHeight;
    const y = Math.max(0, scrollY);
    const p = clamp01(y / h);
    // On touch screens the keyboard scrolls the page up to a focused field; while typing in the
    // hero, hold its copy still and visible rather than fading and shifting it out from under the field.
    const typing = !finePointer && hero.contains(document.activeElement);
    nav.classList.toggle('is-solid', y > h * 0.7);
    const key = p + (typing ? ':typing' : '');
    if (key === heroKey) return;
    heroKey = key;
    heroP = p;
    if (!simpleHero) {
      hero.style.setProperty('--hero-shift', (typing ? 0 : y * 0.22).toFixed(1) + 'px');
      hero.style.setProperty('--hero-o', (typing ? 1 : 1 - smoothstep(0, 0.45, p)).toFixed(3));
      hero.classList.toggle('is-away', !typing && p > 0.3);
    }
    if (horizon) {
      if (!simpleHero) horizon.setScroll(p, y);
      steer();   // the page moved under a still pointer
      if (p >= 1 || document.hidden) horizon.stop();
      else horizon.start();
    }
  }

  // The scene leans toward the pointer, but only while the pointer is over the hero.
  let pointerAt = null;
  function steer() {
    if (!horizon || !pointerAt) return;
    const y = pointerAt.y + Math.max(0, scrollY);
    horizon.pointer(pointerAt.x, y, y < (hero.clientHeight || innerHeight));
  }
  if (horizon && finePointer) {
    addEventListener('pointermove', (e) => { pointerAt = { x: e.clientX, y: e.clientY }; steer(); }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { pointerAt = null; horizon.pointer(0, 0, false); });
  }

  hero.addEventListener('focusin', () => requestFrame());
  hero.addEventListener('focusout', () => requestFrame());

  document.addEventListener('visibilitychange', () => {
    if (!horizon) return;
    if (document.hidden) horizon.stop();
    else if (heroP < 1) horizon.start();
  });

  /* ------------------------------------------------------------------------
     Reveal on scroll
     ------------------------------------------------------------------------ */
  $$('[data-reveal-group]').forEach((g) => $$('[data-reveal]', g).forEach((el, i) => el.style.setProperty('--i', i)));
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      revealIO.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  $$('[data-reveal]').forEach((el) => revealIO.observe(el));

  /* ------------------------------------------------------------------------
     Statement: words light up as it scrolls through
     ------------------------------------------------------------------------ */
  const statement = $('[data-words]');
  function wrapWords(node) {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const s = document.createElement('span');
          s.className = 'w';
          s.textContent = part;
          frag.appendChild(s);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) {
        wrapWords(child);
      }
    });
  }
  wrapWords(statement);
  const words = $$('.w', statement);
  function updateWords() {
    if (reduced) { words.forEach((w) => w.classList.add('on')); return; }
    const r = statement.getBoundingClientRect();
    const vh = innerHeight;
    const p = clamp01((vh * 0.9 - r.top) / (r.height + vh * 0.42));
    const n = Math.round(p * words.length * 1.12);
    words.forEach((w, i) => w.classList.toggle('on', i < n));
  }

  /* ------------------------------------------------------------------------
     Bands of light: close-ups of the hero's bands behind the agent cards,
     the Begin panel and inside the footer lockup
     ------------------------------------------------------------------------ */
  const bandCanvases = $$('canvas[data-band]');
  const bandOf = new Map();
  if (window.TBBands && window.TBBands.supported()) {
    root.classList.add('has-bands');
    const lockup = { paths: $$('#tb-lockup path').map((p) => p.getAttribute('d')), viewBox: [96, 104, 1317, 198] };
    const lightUp = (cv) => {
      if (bandOf.has(cv)) return;
      const name = cv.getAttribute('data-band');
      try {
        bandOf.set(cv, window.TBBands.attach(cv, name, name === 'lockup' ? lockup : null));
      } catch (err) {
        console.warn('[bands] falling back to CSS light:', err);
        bandOf.set(cv, null);
        cv.parentElement.classList.add('band-lost');
      }
    };
    // Each band gets its context shortly before it scrolls into view…
    const nearIO = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      nearIO.unobserve(en.target);
      lightUp(en.target);
    }), { rootMargin: '150% 0px' });
    bandCanvases.forEach((cv) => nearIO.observe(cv));
    // …or, one at a time in idle moments, once the hero intro has played.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 60));
    setTimeout(function next() {
      const cv = bandCanvases.find((c) => !bandOf.has(c));
      if (!cv) return;
      idle(() => { lightUp(cv); setTimeout(next, 120); });
    }, 4500);
  }
  const bandIn = (el) => { const cv = $('canvas[data-band]', el); return cv ? bandOf.get(cv) : null; };

  /* ------------------------------------------------------------------------
     Platform deck: sticky, stacked cards (Lassie-style), one agent at a time
     ------------------------------------------------------------------------ */
  const deck = $('[data-deck]');
  const cards = $$('[data-card]', deck);
  const steps = $$('[data-step]', deck);
  const stacked = matchMedia('(max-width: 860px)');
  let activeCard = -1;
  const cardTimers = cards.map(() => []);

  function later(k, fn, ms) { cardTimers[k].push(setTimeout(fn, reduced ? 0 : ms)); }

  function resetCard(k) {
    cardTimers[k].forEach(clearTimeout);
    cardTimers[k] = [];
    const c = cards[k];
    if (k === 0) {
      $$('.variant', c).forEach((v) => v.classList.remove('on', 'gen'));
      const tick = $('[data-tick]', c);
      tick.textContent = '0';
      const tasks = $$('.task', c);
      tasks[1].className = 'task run';
      tasks[2].className = 'task wait';
      $('em', tasks[2]).textContent = 'Queued';
    } else if (k === 1) {
      $('.typed', c).textContent = '';
      c.classList.remove('answered');
    } else if (k === 2) {
      $$('.msg', c).forEach((m) => m.classList.remove('on'));
    }
  }

  function playCard(k) {
    resetCard(k);
    const c = cards[k];
    if (k === 0) {
      const tick = $('[data-tick]', c);
      const variants = $$('.variant', c);
      const tasks = $$('.task', c);
      const per = 12 / variants.length;   // twelve variants generated; every few, one resolves on screen
      later(k, () => variants[0].classList.add('gen'), 300);
      for (let i = 1; i <= 12; i++) {
        later(k, () => {
          tick.textContent = String(i);
          if (i % per) return;
          const n = i / per;
          variants[n - 1].classList.remove('gen');
          variants[n - 1].classList.add('on');
          if (variants[n]) variants[n].classList.add('gen');
        }, 350 + i * 260);
      }
      later(k, () => {
        tasks[1].className = 'task done';
        tasks[2].className = 'task run';
        $('em', tasks[2]).textContent = 'Running';
      }, 350 + 13 * 260);
    } else if (k === 1) {
      const el = $('.typed', c);
      const text = el.getAttribute('data-type');
      if (reduced) { el.textContent = text; c.classList.add('answered'); return; }
      for (let i = 1; i <= text.length; i++) later(k, () => { el.textContent = text.slice(0, i); }, 300 + i * 38);
      later(k, () => c.classList.add('answered'), 300 + text.length * 38 + 450);
    } else if (k === 2) {
      $$('.msg', c).forEach((m, i) => later(k, () => m.classList.add('on'), 250 + i * 900));
    }
  }

  function setActive(k) {
    if (k === activeCard) return;
    activeCard = k;
    steps.forEach((s, i) => s.classList.toggle('is-active', i === k));
    cards.forEach((c, i) => c.classList.toggle('is-active', i === k));
    playCard(k);
  }

  function updateDeck() {
    if (stacked.matches) {
      cards.forEach((c) => {
        c.style.transform = ''; c.style.opacity = ''; c.style.zIndex = '';
        const b = bandIn(c);
        if (b) b.setActive(true);
      });
      return;
    }
    const r = deck.getBoundingClientRect();
    const total = Math.max(1, r.height - innerHeight);
    const f = clamp01(-r.top / total) * cards.length;
    const n = cards.length;
    const idx = Math.min(n - 1, Math.floor(f));
    const stackPos = idx + (idx < n - 1 ? smoothstep(0.7, 1, f - idx) : 0);
    cards.forEach((c, k) => {
      const d = k - stackPos;
      let ty, sc, op, shade;
      if (d < 0) {
        const e = Math.min(1, -d);
        ty = -e * 14; sc = 1 + e * 0.03; op = 1 - e; shade = 0;
        c.style.transform = `translate3d(0, ${ty}%, 0) scale(${sc})`;
      } else {
        ty = d * 24; sc = 1 - d * 0.055; op = d > 2.4 ? 0 : 1; shade = Math.min(0.7, d * 0.38);
        c.style.transform = `translate3d(0, ${ty}px, 0) scale(${sc})`;
      }
      c.style.opacity = op.toFixed(3);
      c.style.zIndex = String(10 - k);
      const b = bandIn(c);
      if (b) b.setActive(op > 0.01);
      c.style.setProperty('--shade', shade.toFixed(3));
    });
    setActive(Math.min(n - 1, Math.round(stackPos)));
  }

  // On narrow screens the cards simply stack; play each one as it arrives.
  const stackIO = new IntersectionObserver((entries) => {
    if (!stacked.matches) return;
    entries.forEach((en) => { if (en.isIntersecting) playCard(cards.indexOf(en.target)); });
  }, { threshold: 0.5 });
  cards.forEach((c) => stackIO.observe(c));

  /* ------------------------------------------------------------------------
     Metrics: count-up
     ------------------------------------------------------------------------ */
  const counters = $$('[data-count]');
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      countIO.unobserve(en.target);
      const el = en.target;
      const to = Number(el.getAttribute('data-count'));
      if (reduced) { el.textContent = to.toLocaleString('en-US'); return; }
      const t0 = performance.now(), dur = 1800;
      (function step(now) {
        const p = clamp01((now - t0) / dur);
        const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        el.textContent = Math.round(to * e).toLocaleString('en-US');
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    });
  }, { threshold: 0.6 });
  counters.forEach((c) => countIO.observe(c));

  /* ------------------------------------------------------------------------
     Approach: each phase lights in turn as the list scrolls into view
     ------------------------------------------------------------------------ */
  const phasesEl = $('[data-phases]');
  const phases = $$('.phase', phasesEl);
  function updatePhases() {
    const vh = innerHeight;
    const base = phasesEl.getBoundingClientRect().top;
    let rowTop = null, col = 0;
    phases.forEach((ph) => {
      const top = base + ph.offsetTop;   // layout position, ignoring the reveal's slide
      col = rowTop !== null && Math.abs(top - rowTop) < 2 ? col + 1 : 0;   // side by side: light left to right
      rowTop = top;
      const q = reduced ? 1 : clamp01((vh * 0.8 - top) / (vh * 0.55));
      ph.classList.toggle('lit', q >= 0.1 + col * 0.2);
    });
  }

  /* ------------------------------------------------------------------------
     FAQ
     ------------------------------------------------------------------------ */
  $$('.qa .q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const qa = btn.closest('.qa');
      const open = !qa.classList.contains('open');
      qa.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });

  /* ------------------------------------------------------------------------
     Copy the email address, and say so
     ------------------------------------------------------------------------ */
  // execCommand fallback for insecure contexts (file://, plain http). Inside a modal dialog the
  // textarea has to live in the dialog, since everything outside it is inert.
  function legacyCopy(text, host) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:12pt;';   // 12pt: no iOS zoom
    const prev = document.activeElement;
    host.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);   // iOS ignores select() alone
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (prev && prev.focus) prev.focus({ preventScroll: true });
    return ok;
  }
  function copyText(text, host) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => {
        if (!legacyCopy(text, host)) throw new Error('copy failed');
      });
    }
    return legacyCopy(text, host) ? Promise.resolve() : Promise.reject(new Error('copy failed'));
  }
  $$('[data-copy]').forEach((btn) => {
    let timer = 0;
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy');
      const dlg = btn.closest('dialog');
      const status = $('[data-copy-status]', dlg || document);
      copyText(text, dlg || document.body).then(() => {
        btn.classList.add('is-copied');
        if (status) {
          status.textContent = '';
          setTimeout(() => { status.textContent = text + ' copied to clipboard'; }, 30);
        }
        clearTimeout(timer);
        timer = setTimeout(() => btn.classList.remove('is-copied'), 2200);
      }, () => {
        // Clipboard unavailable: fall back to the mail client.
        location.href = 'mailto:' + text;
      });
    });
  });

  /* ------------------------------------------------------------------------
     Contact
     ------------------------------------------------------------------------ */
  const dialog = $('[data-contact]');
  const contactForm = $('[data-contact-form]');
  const stateForm = $('[data-state="form"]', dialog);
  const stateDone = $('[data-state="done"]', dialog);
  const contactError = $('[data-contact-error]', dialog);

  function openContact(email) {
    stateForm.hidden = false;
    stateDone.hidden = true;
    contactError.hidden = true;
    if (email) $('[data-contact-email]', dialog).value = email;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const first = $$('input, textarea', stateForm).find((el) => !el.value);
    (first || $('button[type="submit"]', stateForm)).focus();
  }
  function closeContact() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }
  $$('[data-open-contact]').forEach((b) => b.addEventListener('click', () => openContact()));
  $$('[data-capture]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    openContact(f.elements.email.value.trim());
  }));
  $$('[data-close-contact]').forEach((b) => b.addEventListener('click', closeContact));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeContact(); });
  // Enquiries go to Formspree (the form's action), as on the previous site.
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!contactForm.reportValidity()) return;
    const send = $('button[type="submit"]', stateForm);
    const label = send.textContent;
    send.disabled = true;
    send.textContent = 'Sending…';
    contactError.hidden = true;
    try {
      const res = await fetch(contactForm.action, { method: 'POST', body: new FormData(contactForm), headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.errors || []).map((x) => x.message).join(', ') || 'Something went wrong.');
      }
      contactForm.reset();
      stateForm.hidden = true;
      stateDone.hidden = false;
      $('button', stateDone).focus();
    } catch (err) {
      const reason = err instanceof TypeError ? 'Network error.' : err.message;   // fetch rejects with TypeError offline
      contactError.textContent = reason.replace(/[.!?]?$/, '.') + ' Please try again, or email hello@truebourne.ai.';
      contactError.hidden = false;
    } finally {
      send.disabled = false;
      send.textContent = label;
    }
  });

  /* ------------------------------------------------------------------------
     Scroll / resize loop
     ------------------------------------------------------------------------ */
  let ticking = false;
  function frame() {
    ticking = false;
    updateHero();
    updateWords();
    updateDeck();
    updatePhases();
  }
  function requestFrame() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }
  addEventListener('scroll', requestFrame, { passive: true });

  let lastW = innerWidth, lastH = innerHeight, resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Ignore mobile URL-bar height jitter; it would reallocate every render target.
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 120 && !finePointer) return;
      lastW = innerWidth; lastH = innerHeight;
      computeLayout();
      heroKey = '';
      frame();
    }, 120);
  });

  frame();
  if (horizon && reduced) formed();
})();
