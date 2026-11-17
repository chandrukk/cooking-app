/* Cooking app: everything runs in the browser, no server, no paid services. */
(function () {
  'use strict';

  const RECIPES = window.RECIPES || [];
  const app = document.getElementById('app');
  const SPICES = [
    { id: 'mild', name: 'Mild' },
    { id: 'medium', name: 'Medium' },
    { id: 'hot', name: 'Hot' },
  ];
  const SHOP_GROUPS = [
    ['meat', 'Meat & seafood'],
    ['veg', 'Vegetables & herbs'],
    ['dairy', 'Dairy & eggs'],
    ['spice', 'Spices & salt'],
    ['pantry', 'Rice, dal, oils & sauces'],
  ];

  // ---------- small helpers ----------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode etc. */ }
    },
  };
  const findDish = (id) => RECIPES.find((d) => d.id === id);
  const sessionGet = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const sessionSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } };

  // ---------- quantities ----------

  const FRAC = { 0.125: '⅛', 0.25: '¼', 0.5: '½', 0.75: '¾' };
  function fmtNum(v) {
    const whole = Math.floor(v + 1e-9);
    const frac = Math.round((v - whole) * 1000) / 1000;
    const f = FRAC[frac] || (frac ? String(frac).slice(1) : '');
    if (!whole) return f || '0';
    return whole + f;
  }
  const roundTo = (v, step) => Math.round(v / step) * step;

  // Turn a raw scaled amount into a sensible kitchen amount and unit.
  function tidy(v, u) {
    if (u === 'cup') {
      if (v < 0.25 - 1e-9) return tidy(v * 16, 'tbsp');
      return { v: Math.max(0.25, roundTo(v, 0.25)), u: 'cup' };
    }
    if (u === 'tbsp') {
      if (v >= 8) return tidy(v / 16, 'cup');
      if (v < 1 - 1e-9) return tidy(v * 3, 'tsp');
      return { v: roundTo(v, 0.5), u: 'tbsp' };
    }
    if (u === 'tsp') {
      if (v >= 3) return tidy(v / 3, 'tbsp');
      if (v < 0.25 - 1e-9) return { v: Math.max(0.125, roundTo(v, 0.125)), u: 'tsp' };
      return { v: roundTo(v, 0.25), u: 'tsp' };
    }
    if (u === 'lb') return { v: Math.max(0.25, roundTo(v, 0.25)), u: 'lb' };
    if (u === 'inch') return { v: Math.max(0.5, roundTo(v, 0.5)), u: 'inch' };
    // counts and sprigs: whole numbers, never below 1
    return { v: Math.max(1, Math.round(v)), u };
  }

  // Counted produce (onions, tomatoes, potatoes...) may be halved; spices, eggs and chillies may not.
  const HALVABLE = /onion|tomato|potato|carrot|bell pepper|eggplant|drumstick|cauliflower/i;

  function scaleAmount(ing, ctx) {
    let q = ing.q;
    if (q && typeof q === 'object') q = q[ctx.spice] ?? q.medium;
    if (!q) return null;
    const ratio = ctx.serves / ctx.base;
    let v;
    if (ing.sc === 'fixed') v = q;
    else if (ing.sc === 'whole') v = q * Math.pow(ratio, 0.7); // whole spices grow more slowly
    else v = q * ratio;
    if (ing.u === 'count' && HALVABLE.test(ing.n) && !ing.sc) {
      return { v: Math.max(0.5, roundTo(v, 0.5)), u: 'count' };
    }
    return tidy(v, ing.u);
  }

  function amountText(a) {
    const n = fmtNum(a.v);
    switch (a.u) {
      case 'count': return n;
      case 'inch': return n + '-inch piece';
      case 'sprig': return n + (a.v > 1 ? ' sprigs' : ' sprig');
      case 'cup': return n + (a.v > 1 ? ' cups' : ' cup');
      default: return n + ' ' + a.u;
    }
  }

  function ingName(ing, a) {
    if (a && a.u === 'count' && a.v <= 1 && ing.one) return ing.one;
    return ing.n;
  }

  function ingText(ing, a) {
    return amountText(a) + ' ' + ingName(ing, a);
  }

  // ---------- build a recipe for the chosen options ----------

  function build(dish, style, opts) {
    const ctx = { spice: opts.spice, serves: opts.serves, base: style.serves || 4 };
    const method = style.methods ? (style.methods.find((m) => m.id === opts.method) || style.methods[0]) : null;
    const forMethod = (x) => !x.m || (method && x.m.includes(method.id));

    const ings = [];
    const byKey = {};
    style.ingredients.forEach((ing) => {
      if (!forMethod(ing)) return;
      const a = scaleAmount(ing, ctx);
      if (!a) return;
      const row = { ...ing, s: ing.s || 'Ingredients', a, text: ingText(ing, a) };
      ings.push(row);
      byKey[ing.k] = row;
    });

    const pick = (val) => (val && typeof val === 'object' ? (method && val[method.id]) || Object.values(val)[0] : val);

    const steps = style.steps
      .filter((s) => forMethod(s) && (!s.sp || s.sp.includes(opts.spice)))
      .map((s) => {
        let html = esc(s.t);
        html = html.replace(/\{@(\w+)\}/g, (_, k) => esc(method ? method[k] || '' : ''));
        html = html.replace(/\{(\w+)\}/g, (_, k) => {
          const r = byKey[k];
          return r ? '<b>' + esc(r.text) + '</b>' : '';
        });
        const list = s.list ? ings.filter((i) => i.s === s.list) : null;
        return { html, plain: html.replace(/<[^>]+>/g, ''), heat: pick(s.h), time: pick(s.d), list };
      });

    const sections = [];
    ings.forEach((i) => {
      let sec = sections.find((x) => x.name === i.s);
      if (!sec) { sec = { name: i.s, items: [] }; sections.push(sec); }
      sec.items.push(i);
    });

    const equipment = (style.equipment || []).filter((e) => typeof e === 'string' || forMethod(e)).map((e) => (typeof e === 'string' ? e : e.t));

    return { dish, style, method, opts, ings, sections, steps, equipment, shop: shoppingList(ings) };
  }

  // Merge repeated items (e.g. cardamom used twice) for the "before you start" list.
  const TO_TSP = { tsp: 1, tbsp: 3, cup: 48 };
  function shoppingList(ings) {
    const merged = [];
    ings.filter((i) => i.c && i.c !== 'none').forEach((i) => {
      const vol = TO_TSP[i.a.u];
      const family = vol ? 'vol' : i.a.u;
      const key = i.n.toLowerCase() + '|' + family;
      const existing = merged.find((m) => m.key === key);
      if (existing) {
        if (vol) existing.tsp += i.a.v * vol; else existing.v += i.a.v;
      } else {
        merged.push({ key, ing: i, c: i.c, family, tsp: vol ? i.a.v * vol : 0, v: vol ? 0 : i.a.v, u: i.a.u, note: i.note });
      }
    });
    merged.forEach((m) => {
      const a = m.family === 'vol' ? tidy(m.tsp / TO_TSP[m.u], m.u) : { v: m.v, u: m.u };
      m.text = ingText(m.ing, a);
      // notes like "for the eggs" don't belong on a shopping list
      if (m.note && /^(for |used )/.test(m.note)) m.note = '';
    });
    return SHOP_GROUPS.map(([id, name]) => ({ id, name, items: merged.filter((m) => m.c === id) })).filter((g) => g.items.length);
  }

  // ---------- search ----------

  function norm(s) { return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return dp[a.length][b.length];
  }
  function tokenScore(q, words) {
    let best = 0;
    for (const w of words) {
      if (w === q) return 1;
      if (q.length >= 2 && w.startsWith(q)) best = Math.max(best, 0.95);
      else if (q.length >= 4 && w.includes(q)) best = Math.max(best, 0.85);
      else if (q.length >= 4) {
        const d = lev(q, w);
        if (d === 1) best = Math.max(best, 0.8);
        else if (d === 2 && q.length >= 6) best = Math.max(best, 0.6);
      }
    }
    return best;
  }
  function search(query) {
    const qt = norm(query).split(' ').filter(Boolean);
    if (!qt.length) return RECIPES.map((d) => ({ d, score: 1 }));
    return RECIPES.map((d) => {
      const words = norm([d.name, ...(d.aliases || []), ...d.styles.map((s) => s.name)].join(' ')).split(' ');
      const score = qt.reduce((sum, t) => sum + tokenScore(t, words), 0) / qt.length;
      return { d, score };
    }).filter((r) => r.score >= 0.3).sort((a, b) => b.score - a.score);
  }

  // ---------- voice (free, built into the phone or browser) ----------

  const voice = {
    chosen: null,
    supported: 'speechSynthesis' in window,
    pick() {
      if (!this.supported) return null;
      const voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
      if (!voices.length) return null;
      const female = /female|woman|zira|aria|jenny|samantha|victoria|karen|moira|tessa|fiona|veena|heera|neerja|kalpana|susan|hazel|libby|sonia|serena|ava|allison|emma|natasha|kate|catherine|google us english|google uk english female/i;
      const male = /\bmale\b|daniel|alex|fred|rishi|david|mark|george|guy|ryan|thomas|oliver|arthur|aaron|gordon/i;
      const score = (v) => (female.test(v.name) ? 10 : 0) - (male.test(v.name) && !/female/i.test(v.name) ? 10 : 0) +
        (/en-IN/i.test(v.lang) ? 3 : /en-(US|GB)/i.test(v.lang) ? 2 : 0) + (v.localService ? 1 : 0);
      this.chosen = voices.sort((a, b) => score(b) - score(a))[0];
      return this.chosen;
    },
    spokenForm(text) {
      return text
        .replace(/(\d+)½/g, '$1 and a half').replace(/(\d+)¼/g, '$1 and a quarter').replace(/(\d+)¾/g, '$1 and three quarters')
        .replace(/⅛/g, 'one eighth').replace(/½/g, 'half').replace(/¼/g, 'a quarter').replace(/¾/g, 'three quarters')
        .replace(/\btsp\b/g, 'teaspoon').replace(/\btbsp\b/g, 'tablespoon')
        .replace(/(\d)\s*lb\b/g, '$1 pound').replace(/\blb\b/g, 'pound')
        .replace(/°F/g, ' degrees Fahrenheit').replace(/(\d)\s*–\s*(\d)/g, '$1 to $2').replace(/\bmin\b/g, 'minutes')
        .replace(/\bhr\b/g, 'hour');
    },
    speak(text, onEnd) {
      if (!this.supported) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(this.spokenForm(text));
      const v = this.chosen || this.pick();
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 0.95;
      u.onend = u.onerror = () => onEnd && onEnd();
      speechSynthesis.speak(u);
    },
    stop() { if (this.supported) speechSynthesis.cancel(); },
  };
  if (voice.supported) speechSynthesis.onvoiceschanged = () => voice.pick();

  // ---------- keep the screen awake while cooking ----------

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release(); wakeLock = null;
      }
    } catch (e) { /* not supported or not allowed: fine */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && route().view === 'cook') keepAwake(true);
  });

  // ---------- routing ----------

  function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(qs || '');
    const views = { d: 'setup', r: 'recipe', c: 'cook' };
    return { view: views[parts[0]] || 'home', dishId: parts[1], styleId: parts[2], params };
  }
  function optsFrom(params, dish, style) {
    const saved = store.get('opts:' + dish.id, {});
    const serves = parseInt(params.get('serves') || saved.serves || 4, 10);
    return {
      spice: params.get('spice') || saved.spice || 'medium',
      serves: Math.min(8, Math.max(1, isNaN(serves) ? 4 : serves)),
      method: params.get('method') || saved.method || (style.methods ? style.methods[0].id : ''),
    };
  }
  function qsFor(o, extra) {
    const p = new URLSearchParams({ spice: o.spice, serves: o.serves });
    if (o.method) p.set('method', o.method);
    Object.entries(extra || {}).forEach(([k, v]) => p.set(k, v));
    return p.toString();
  }

  // ---------- icons ----------

  const ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="17.5" r="1"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  // ---------- views ----------

  function render() {
    voice.stop();
    const r = route();
    if (r.view !== 'cook') keepAwake(false);
    const dish = r.dishId && findDish(r.dishId);
    if (r.view === 'home' || !dish) return renderHome();
    if (r.view === 'setup') return renderSetup(dish, r.params.get('style'));
    const style = dish.styles.find((s) => s.id === r.styleId) || dish.styles[0];
    const opts = optsFrom(r.params, dish, style);
    const recipe = build(dish, style, opts);
    if (r.view === 'recipe') return renderRecipe(recipe, r.params.get('tab') || 'start');
    return renderCook(recipe, parseInt(r.params.get('step') || '0', 10) || 0);
  }

  function setPage(html, title) {
    app.innerHTML = html;
    document.title = title ? title + ' · Kitchen Steps' : 'Kitchen Steps';
    window.scrollTo(0, 0);
  }

  // Home: resume banner, search, cuisine filter, dish list
  const CUISINES = ['All', 'South Indian', 'North Indian', 'Starters', 'Breakfast & sides', 'Chinese-style'];
  function renderHome() {
    const q = sessionGet('q') || '';
    let cuisine = sessionGet('cuisine') || 'All';
    const resume = store.get('resume', null);
    const fresh = resume && Date.now() - resume.at < 12 * 3600 * 1000;
    setPage(`
      <header class="home-head">
        <h1>Kitchen Steps</h1>
        <p class="sub">Exact recipes, one step at a time.</p>
      </header>
      ${fresh ? `
      <div class="resume">
        <a class="resume-link" href="${esc(resume.hash)}">
          <span class="resume-label">Continue cooking</span>
          <span class="resume-what">${esc(resume.dish)} · step ${resume.step + 1} of ${resume.total}</span>
        </a>
        <button class="iconbtn ghost" id="resume-x" aria-label="Dismiss">${ICON.close}</button>
      </div>` : ''}
      <label class="search">
        ${ICON.search}
        <input id="q" type="search" placeholder="What do you want to cook?" autocomplete="off" value="${esc(q)}" aria-label="Search dishes">
      </label>
      <div class="filters" id="filters" role="group" aria-label="Filter dishes"></div>
      <div id="results"></div>
      <div id="requests"></div>
    `);
    const input = document.getElementById('q');
    const drawFilters = () => {
      const counts = (c) => (c === 'All' ? RECIPES.length : RECIPES.filter((d) => (d.cuisine || []).includes(c)).length);
      document.getElementById('filters').innerHTML = input.value.trim() ? '' : CUISINES.filter((c) => counts(c)).map((c) =>
        `<button class="filter ${c === cuisine ? 'on' : ''}" data-cuisine="${esc(c)}" aria-pressed="${c === cuisine}">${esc(c)}</button>`).join('');
    };
    const draw = () => {
      const val = input.value.trim();
      sessionSet('q', input.value);
      let res = search(val);
      if (!val && cuisine !== 'All') res = res.filter((r) => (r.d.cuisine || []).includes(cuisine));
      if (!val) res.sort((a, b) => a.d.name.localeCompare(b.d.name));
      const strong = res.filter((r) => r.score >= 0.75);
      let html = '';
      if (val && !res.length) {
        html += `<div class="notfound"><p><b>${esc(val)}</b> is not in the recipe library yet.</p>
          <button class="btn secondary" data-request="${esc(val)}">Ask for it to be added</button></div>`;
      } else {
        if (val && !strong.length) html += `<p class="hint">No exact match for “${esc(val)}”. Closest dishes:</p>`;
        const qWords = norm(val).split(' ').filter(Boolean);
        const styleFor = (d) => {
          if (!qWords.length) return '';
          const st = d.styles.find((s) => { const w = norm(s.name).split(' '); return qWords.filter((q) => w.some((x) => x.startsWith(q))).length >= Math.min(2, qWords.length) && d.styles.length > 1; });
          return st ? '?style=' + st.id : '';
        };
        html += '<ul class="dishes">' + res.map(({ d }) => `
          <li><a class="dish" href="#/d/${d.id}${styleFor(d)}">
            <span class="dish-name">${esc(d.name)}</span>
            <span class="dish-blurb">${esc(d.blurb)}</span>
            <span class="dish-styles">${d.styles.map((s) => esc(s.name)).join(' · ')}</span>
          </a></li>`).join('') + '</ul>';
        if (val && !strong.length) html += `<p class="hint">Not what you want? <button class="linkbtn" data-request="${esc(val)}">Ask for “${esc(val)}” to be added</button></p>`;
      }
      drawFilters();
      document.getElementById('results').innerHTML = html;
    };
    const drawRequests = () => {
      const list = store.get('requests', []);
      document.getElementById('requests').innerHTML = list.length
        ? `<section class="requests"><h2>Dishes you asked for</h2><p class="hint">Saved on this device. Copy the list and send it to get them added.</p><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
           <button class="btn secondary small" id="copy-req">Copy list</button></section>`
        : '';
    };
    input.addEventListener('input', draw);
    app.onclick = (e) => {
      const f = e.target.closest('[data-cuisine]');
      if (f) { cuisine = f.dataset.cuisine; sessionSet('cuisine', cuisine); draw(); return; }
      if (e.target.closest('#resume-x')) { store.set('resume', null); const r = document.querySelector('.resume'); if (r) r.remove(); return; }
      if (e.target.closest('#copy-req')) {
        const btn = e.target.closest('#copy-req');
        const text = 'Dishes to add to Kitchen Steps: ' + store.get('requests', []).join(', ');
        const done = () => { btn.textContent = 'Copied'; };
        try { navigator.clipboard.writeText(text).then(done, () => { window.prompt('Copy this:', text); }); } catch (err) { /* ignore */ }
        return;
      }
      const b = e.target.closest('[data-request]');
      if (!b) return;
      const name = b.getAttribute('data-request');
      const list = store.get('requests', []);
      if (!list.some((x) => x.toLowerCase() === name.toLowerCase())) list.push(name);
      store.set('requests', list);
      b.outerHTML = '<span class="noted">' + ICON.check + ' Noted</span>';
      drawRequests();
    };
    draw();
    drawRequests();
  }

  // Setup: style, spice, servings, method
  function renderSetup(dish, wantStyle) {
    const saved = store.get('opts:' + dish.id, {});
    if (wantStyle && dish.styles.some((s) => s.id === wantStyle)) saved.style = wantStyle;
    const state = {
      style: dish.styles.find((s) => s.id === saved.style) ? saved.style : dish.styles[0].id,
      spice: saved.spice || 'medium',
      serves: saved.serves || 4,
      method: saved.method || '',
    };
    const draw = () => {
      const style = dish.styles.find((s) => s.id === state.style);
      if (style.methods && !style.methods.some((m) => m.id === state.method)) state.method = style.methods[0].id;
      setPage(`
        <header class="bar">
          <a class="iconbtn" href="#/" aria-label="Back to dishes">${ICON.back}</a>
          <h1 class="bar-title">${esc(dish.name)}</h1>
        </header>
        <section class="q">
          <h2>Which style?</h2>
          <div class="cards">
            ${dish.styles.map((s) => `
              <button class="card ${s.id === state.style ? 'on' : ''}" data-style="${s.id}" aria-pressed="${s.id === state.style}">
                <span class="card-title">${esc(s.name)}</span>
                <span class="card-text">${esc(s.blurb)}</span>
                <span class="card-meta">${esc(s.time)}</span>
              </button>`).join('')}
          </div>
        </section>
        <section class="q">
          <h2>How spicy?</h2>
          <div class="seg" role="group" aria-label="Spice level">
            ${SPICES.map((s) => `<button class="${s.id === state.spice ? 'on' : ''}" data-spice="${s.id}" aria-pressed="${s.id === state.spice}">${s.name}</button>`).join('')}
          </div>
        </section>
        <section class="q">
          <h2>How many people?</h2>
          <div class="stepper">
            <button class="iconbtn round" data-serves="-1" aria-label="Fewer" ${state.serves <= 1 ? 'disabled' : ''}>${ICON.minus}</button>
            <span class="serves"><b>${state.serves}</b> ${state.serves === 1 ? 'person' : 'people'}</span>
            <button class="iconbtn round" data-serves="1" aria-label="More" ${state.serves >= 8 ? 'disabled' : ''}>${ICON.plus}</button>
          </div>
        </section>
        ${style.methods ? `
        <section class="q">
          <h2>${esc(dish.methodQ || 'How will you cook it?')}</h2>
          <div class="cards compact">
            ${style.methods.map((m) => `
              <button class="card ${m.id === state.method ? 'on' : ''}" data-method="${m.id}" aria-pressed="${m.id === state.method}">
                <span class="card-title">${esc(m.name)}</span>
                <span class="card-text">${esc(m.blurb)}</span>
              </button>`).join('')}
          </div>
        </section>` : ''}
        <div class="bottom">
          <button class="btn primary big" id="go">Show my recipe</button>
        </div>
      `, dish.name);
    };
    draw();
    app.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.style) state.style = b.dataset.style;
      else if (b.dataset.spice) state.spice = b.dataset.spice;
      else if (b.dataset.serves) state.serves = Math.min(8, Math.max(1, state.serves + parseInt(b.dataset.serves, 10)));
      else if (b.dataset.method) state.method = b.dataset.method;
      else if (b.id === 'go') {
        store.set('opts:' + dish.id, state);
        app.onclick = null;
        location.hash = `#/r/${dish.id}/${state.style}?${qsFor(state)}`;
        return;
      } else return;
      const y = window.scrollY;
      draw();
      window.scrollTo(0, y);
    };
  }

  function summaryLine(rc) {
    return [rc.style.name, rc.method && rc.method.name].filter(Boolean).map(esc).join(' · ');
  }

  // Recipe overview: "before you start" checklist and full recipe
  function renderRecipe(rc, tab) {
    const base = `#/r/${rc.dish.id}/${rc.style.id}?${qsFor(rc.opts)}`;
    const tickKey = 'ticks:' + rc.dish.id + ':' + rc.style.id;
    const ticks = store.get(tickKey, {});

    const startTab = `
      ${rc.style.notes && rc.style.notes.length ? `<div class="notes">${rc.style.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
      <p class="hint">Tick what you already have.</p>
      ${rc.shop.map((g) => `
        <section class="group">
          <h3>${esc(g.name)}</h3>
          <ul class="checks">
            ${g.items.map((it) => `
              <li><label class="check">
                <input type="checkbox" data-tick="${esc(it.key)}" ${ticks[it.key] ? 'checked' : ''}>
                <span class="box">${ICON.check}</span>
                <span class="check-text">${esc(it.text)}${it.note ? ` <span class="muted">(${esc(it.note)})</span>` : ''}</span>
              </label></li>`).join('')}
          </ul>
        </section>`).join('')}
      <section class="group">
        <h3>Equipment</h3>
        <ul class="plain">${rc.equipment.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      </section>`;

    const fullTab = `
      <p class="muted">${esc(rc.style.time)}</p>
      ${rc.sections.map((sec) => `
        <section class="group">
          <h3>${esc(sec.name)}</h3>
          <ul class="ings">${sec.items.map((i) => `<li><span class="amt">${esc(amountText(i.a))}</span> <span>${esc(ingName(i, i.a))}${i.note ? `<span class="muted">, ${esc(i.note)}</span>` : ''}</span></li>`).join('')}</ul>
        </section>`).join('')}
      <section class="group">
        <h3>Steps</h3>
        <ol class="steps">
          ${rc.steps.map((s) => `<li><p>${s.html}</p>${chips(s)}${s.list ? miniList(s.list) : ''}</li>`).join('')}
        </ol>
      </section>`;

    setPage(`
      <header class="bar">
        <a class="iconbtn" href="#/d/${rc.dish.id}" aria-label="Change options">${ICON.back}</a>
        <div class="bar-title">
          <h1>${esc(rc.dish.name)}</h1>
          <p class="sub">${summaryLine(rc)}</p>
        </div>
      </header>
      <div class="adjust">
        <div class="seg small" role="group" aria-label="Spice level">
          ${SPICES.map((sp) => `<button class="${sp.id === rc.opts.spice ? 'on' : ''}" data-adj-spice="${sp.id}" aria-pressed="${sp.id === rc.opts.spice}">${sp.name}</button>`).join('')}
        </div>
        <div class="stepper small">
          <button class="iconbtn round" data-adj-serves="-1" aria-label="Fewer people" ${rc.opts.serves <= 1 ? 'disabled' : ''}>${ICON.minus}</button>
          <span class="serves"><b>${rc.opts.serves}</b> ${rc.opts.serves === 1 ? 'person' : 'people'}</span>
          <button class="iconbtn round" data-adj-serves="1" aria-label="More people" ${rc.opts.serves >= 8 ? 'disabled' : ''}>${ICON.plus}</button>
        </div>
      </div>
      <nav class="tabs" role="tablist">
        <a role="tab" href="${base}&tab=start" class="${tab !== 'full' ? 'on' : ''}" aria-selected="${tab !== 'full'}">Before you start</a>
        <a role="tab" href="${base}&tab=full" class="${tab === 'full' ? 'on' : ''}" aria-selected="${tab === 'full'}">Full recipe</a>
      </nav>
      <div class="tabbody">${tab === 'full' ? fullTab : startTab}</div>
      <div class="bottom">
        <a class="btn primary big" href="#/c/${rc.dish.id}/${rc.style.id}?${qsFor(rc.opts, { step: 0 })}">Start cooking · ${rc.steps.length} steps</a>
      </div>
    `, rc.dish.name);

    app.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || !(b.dataset.adjSpice || b.dataset.adjServes)) return;
      const o = { ...rc.opts };
      if (b.dataset.adjSpice) o.spice = b.dataset.adjSpice;
      else o.serves = Math.min(8, Math.max(1, o.serves + parseInt(b.dataset.adjServes, 10)));
      store.set('opts:' + rc.dish.id, { ...store.get('opts:' + rc.dish.id, {}), ...o, style: rc.style.id });
      const y = window.scrollY;
      history.replaceState(null, '', `#/r/${rc.dish.id}/${rc.style.id}?${qsFor(o, { tab })}`);
      render();
      window.scrollTo(0, y);
    };
    app.onchange = (e) => {
      const k = e.target.getAttribute('data-tick');
      if (!k) return;
      ticks[k] = e.target.checked;
      store.set(tickKey, ticks);
    };
  }

  function chips(s) {
    if (!s.heat && !s.time) return '';
    return `<div class="chips">${s.heat ? `<span class="chip heat">${ICON.flame}${esc(s.heat)}</span>` : ''}${s.time ? `<span class="chip">${ICON.clock}${esc(s.time)}</span>` : ''}</div>`;
  }
  function miniList(items) {
    return `<ul class="mini">${items.map((i) => `<li>${esc(i.text)}${i.note ? `<span class="muted">, ${esc(i.note)}</span>` : ''}</li>`).join('')}</ul>`;
  }

  // ---------- step timers ----------
  // Timers keep their end time in storage, so they survive moving between steps or reloading.

  function parseMinutes(text) {
    if (!text) return 0;
    const m = String(text).match(/(\d+)(?:\s*[–-]\s*\d+)?\s*(min|hour|hr|second)/i);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit.startsWith('second')) return n >= 60 ? n / 60 : 0;
    if (unit === 'hour' || unit === 'hr') return n * 60;
    return n;
  }

  const timers = {
    list: store.get('timers', []),
    tick: null,
    save() { store.set('timers', this.list); },
    add(label, minutes) {
      this.list.push({ id: Date.now(), label, end: Date.now() + minutes * 60000, mins: minutes, done: false });
      this.save();
      sound.prime();
      this.draw();
    },
    remove(id) { this.list = this.list.filter((t) => t.id !== id); this.save(); this.draw(); },
    addMinute(id) {
      const t = this.list.find((x) => x.id === id);
      if (!t) return;
      t.end = Math.max(t.end, Date.now()) + 60000; t.done = false; this.save(); this.draw();
    },
    draw() {
      const el = document.getElementById('timers');
      if (!el) return;
      const now = Date.now();
      let ringing = false;
      el.innerHTML = this.list.map((t) => {
        const left = Math.max(0, Math.round((t.end - now) / 1000));
        if (left === 0 && !t.done) { t.done = true; this.save(); this.ring(t); }
        if (t.done) ringing = true;
        const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
        return `<div class="timer ${t.done ? 'done' : ''}">
          ${ICON.clock}
          <span class="timer-label">${esc(t.label)}</span>
          <span class="timer-time">${t.done ? 'Done' : mm + ':' + ss}</span>
          <button class="timer-btn" data-timer-plus="${t.id}" aria-label="Add 1 minute">+1</button>
          <button class="timer-btn" data-timer-x="${t.id}" aria-label="${t.done ? 'Dismiss' : 'Cancel'} timer">${ICON.close}</button>
        </div>`;
      }).join('');
      document.body.classList.toggle('has-timers', this.list.length > 0);
      el.classList.toggle('ringing', ringing);
      if (this.list.length && !this.tick) this.tick = setInterval(() => this.draw(), 1000);
      if (!this.list.length && this.tick) { clearInterval(this.tick); this.tick = null; }
    },
    ring(t) {
      sound.beep();
      try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) { /* ignore */ }
      voice.speak('Timer done. ' + t.label);
    },
  };

  // A short beep made in the browser (no sound files needed)
  const sound = {
    ctx: null,
    prime() {
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { /* no audio */ }
    },
    beep() {
      if (!this.ctx) return;
      [0, 0.5, 1].forEach((t) => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(this.ctx.destination);
        const at = this.ctx.currentTime + t;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.4, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
        o.start(at); o.stop(at + 0.4);
      });
    },
  };

  document.getElementById('timers').addEventListener('click', (e) => {
    const plus = e.target.closest('[data-timer-plus]');
    const x = e.target.closest('[data-timer-x]');
    if (plus) timers.addMinute(Number(plus.dataset.timerPlus));
    if (x) { voice.stop(); timers.remove(Number(x.dataset.timerX)); }
  });

  // Cook mode: one step at a time
  function renderCook(rc, idx) {
    const total = rc.steps.length;
    idx = Math.min(Math.max(0, idx), total - 1);
    const s = rc.steps[idx];
    const last = idx === total - 1;
    const pct = Math.round(((idx + 1) / total) * 100);
    const recipeHref = `#/r/${rc.dish.id}/${rc.style.id}?${qsFor(rc.opts)}`;
    const mins = parseMinutes(s.time);

    // remember where we are, for "Continue cooking" on the home screen
    store.set('resume', { hash: location.hash, dish: rc.dish.name, step: idx, total, at: Date.now() });

    setPage(`
      <div class="cook">
        <header class="cook-head">
          <a class="iconbtn" href="${recipeHref}" aria-label="Leave cooking mode">${ICON.close}</a>
          <div class="cook-count">Step ${idx + 1} of ${total}</div>
          <button class="iconbtn" id="peek" aria-label="Show all ingredients">${ICON.list}</button>
        </header>
        <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <main class="cook-body">
          <p class="cook-dish">${esc(rc.dish.name)} · ${esc(rc.style.name)}</p>
          <p class="cook-text">${s.html}</p>
          ${s.list ? miniList(s.list) : ''}
          ${chips(s)}
          <div class="cook-actions">
            ${voice.supported ? `<button class="btn secondary read" id="read">${ICON.speaker}<span>Read aloud</span></button>` : ''}
            ${mins >= 1 ? `<button class="btn secondary" id="timer">${ICON.clock}<span>Start ${fmtMins(mins)} timer</span></button>` : ''}
          </div>
        </main>
        <nav class="cook-nav">
          <button class="btn secondary" id="prev" ${idx === 0 ? 'disabled' : ''}>${ICON.back}<span>Back</span></button>
          ${last ? `<a class="btn primary" href="${recipeHref}" id="done">Done</a>` : `<button class="btn primary" id="next"><span>Next</span>${ICON.next}</button>`}
        </nav>
      </div>
      <div class="sheet" id="sheet" hidden>
        <div class="sheet-panel" role="dialog" aria-modal="true" aria-label="All ingredients">
          <div class="sheet-head">
            <h2>All ingredients</h2>
            <button class="iconbtn" id="sheet-x" aria-label="Close">${ICON.close}</button>
          </div>
          <p class="muted">${esc(rc.opts.serves + (rc.opts.serves === 1 ? ' person' : ' people'))}</p>
          ${rc.sections.map((sec) => `
            <section class="group">
              <h3>${esc(sec.name)}</h3>
              <ul class="ings">${sec.items.map((i) => `<li><span class="amt">${esc(amountText(i.a))}</span> <span>${esc(ingName(i, i.a))}${i.note ? `<span class="muted">, ${esc(i.note)}</span>` : ''}</span></li>`).join('')}</ul>
            </section>`).join('')}
        </div>
      </div>
    `, rc.dish.name);

    keepAwake(true);
    const go = (i) => {
      history.replaceState(null, '', `#/c/${rc.dish.id}/${rc.style.id}?${qsFor(rc.opts, { step: i })}`);
      render();
    };
    const readBtn = document.getElementById('read');
    const setReading = (on) => {
      if (!readBtn) return;
      readBtn.innerHTML = on ? `${ICON.stop}<span>Stop</span>` : `${ICON.speaker}<span>Read aloud</span>`;
      readBtn.classList.toggle('on', on);
    };
    const sheet = document.getElementById('sheet');
    app.onclick = (e) => {
      if (e.target === sheet || e.target.closest('#sheet-x')) { sheet.hidden = true; return; }
      if (e.target.closest('#done')) { store.set('resume', null); return; }
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'prev') go(idx - 1);
      else if (b.id === 'next') go(idx + 1);
      else if (b.id === 'peek') sheet.hidden = false;
      else if (b.id === 'timer') {
        timers.add('Step ' + (idx + 1) + ', ' + rc.dish.name, mins);
        b.innerHTML = `${ICON.check}<span>Timer started</span>`;
        b.disabled = true;
      } else if (b.id === 'read') {
        if (b.classList.contains('on')) { voice.stop(); setReading(false); return; }
        let text = 'Step ' + (idx + 1) + '. ' + s.plain;
        if (s.list) text += ' ' + s.list.map((i) => i.text).join(', ') + '.';
        if (s.heat) text += ' ' + s.heat + '.';
        if (s.time) text += ' Time: ' + s.time + '.';
        setReading(true);
        voice.speak(text, () => setReading(false));
      }
    };
  }
  function fmtMins(m) {
    if (m >= 60) { const h = Math.floor(m / 60), r = m % 60; return h + ' hr' + (r ? ' ' + r + ' min' : ''); }
    return Math.round(m) + ' min';
  }

  // keyboard arrows in cook mode (handy on a laptop)
  document.addEventListener('keydown', (e) => {
    if (route().view !== 'cook') return;
    if (e.key === 'ArrowRight') { const n = document.getElementById('next'); if (n) n.click(); }
    if (e.key === 'Escape') { const sh = document.getElementById('sheet'); if (sh) sh.hidden = true; }
    if (e.key === 'ArrowLeft') { const p = document.getElementById('prev'); if (p && !p.disabled) p.click(); }
  });

  window.addEventListener('hashchange', () => { app.onclick = null; app.onchange = null; render(); });
  render();
  timers.draw();

  // Offline support: cache the app after the first visit
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  // expose for testing
  window.__kitchen = { build, search, tidy, fmtNum, scaleAmount, parseMinutes };
})();
