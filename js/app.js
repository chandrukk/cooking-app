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
  const HALVABLE = /onion|tomato|potato|carrot|bell pepper|eggplant|drumstick/i;

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
      const row = { ...ing, a, text: ingText(ing, a) };
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
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  };

  // ---------- views ----------

  function render() {
    voice.stop();
    const r = route();
    if (r.view !== 'cook') keepAwake(false);
    const dish = r.dishId && findDish(r.dishId);
    if (r.view === 'home' || !dish) return renderHome();
    if (r.view === 'setup') return renderSetup(dish);
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

  // Home: search + dish list
  function renderHome() {
    const q = sessionStorage.getItem('q') || '';
    setPage(`
      <header class="home-head">
        <h1>Kitchen Steps</h1>
        <p class="sub">Exact recipes, one step at a time.</p>
      </header>
      <label class="search">
        ${ICON.search}
        <input id="q" type="search" placeholder="What do you want to cook?" autocomplete="off" value="${esc(q)}" aria-label="Search dishes">
      </label>
      <div id="results"></div>
      <div id="requests"></div>
    `);
    const input = document.getElementById('q');
    const draw = () => {
      const val = input.value.trim();
      try { sessionStorage.setItem('q', input.value); } catch (e) { /* ignore */ }
      const res = search(val);
      const strong = res.filter((r) => r.score >= 0.75);
      let html = '';
      if (val && !res.length) {
        html += `<div class="notfound"><p><b>${esc(val)}</b> is not in the recipe library yet.</p>
          <button class="btn secondary" data-request="${esc(val)}">Ask for it to be added</button></div>`;
      } else {
        if (val && !strong.length) html += `<p class="hint">No exact match for “${esc(val)}”. Closest dishes:</p>`;
        html += '<ul class="dishes">' + res.map(({ d }) => `
          <li><a class="dish" href="#/d/${d.id}">
            <span class="dish-name">${esc(d.name)}</span>
            <span class="dish-blurb">${esc(d.blurb)}</span>
            <span class="dish-styles">${d.styles.map((s) => esc(s.name)).join(' · ')}</span>
          </a></li>`).join('') + '</ul>';
        if (val && !strong.length) html += `<p class="hint">Not what you want? <button class="linkbtn" data-request="${esc(val)}">Ask for “${esc(val)}” to be added</button></p>`;
      }
      document.getElementById('results').innerHTML = html;
    };
    const drawRequests = () => {
      const list = store.get('requests', []);
      document.getElementById('requests').innerHTML = list.length
        ? `<section class="requests"><h2>Dishes you asked for</h2><p class="hint">Saved on this device. Share this list to get them added.</p><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`
        : '';
    };
    input.addEventListener('input', draw);
    app.addEventListener('click', onRequestClick);
    function onRequestClick(e) {
      const b = e.target.closest('[data-request]');
      if (!b) return;
      const name = b.getAttribute('data-request');
      const list = store.get('requests', []);
      if (!list.some((x) => x.toLowerCase() === name.toLowerCase())) list.push(name);
      store.set('requests', list);
      b.outerHTML = '<span class="noted">' + ICON.check + ' Noted</span>';
      drawRequests();
    }
    // remove the listener when leaving home
    window.addEventListener('hashchange', () => app.removeEventListener('click', onRequestClick), { once: true });
    draw();
    drawRequests();
  }

  // Setup: style, spice, servings, method
  function renderSetup(dish) {
    const saved = store.get('opts:' + dish.id, {});
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
          <h2>${dish.id === 'chicken-tikka-masala' ? 'How will you cook the tikka?' : dish.id === 'sambar' ? 'How will you cook the dal?' : 'How will you cook the mutton?'}</h2>
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
    const spice = SPICES.find((s) => s.id === rc.opts.spice).name;
    return [rc.style.name, spice, rc.opts.serves + (rc.opts.serves === 1 ? ' person' : ' people'), rc.method && rc.method.name].filter(Boolean).map(esc).join(' · ');
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
      <nav class="tabs" role="tablist">
        <a role="tab" href="${base}&tab=start" class="${tab !== 'full' ? 'on' : ''}" aria-selected="${tab !== 'full'}">Before you start</a>
        <a role="tab" href="${base}&tab=full" class="${tab === 'full' ? 'on' : ''}" aria-selected="${tab === 'full'}">Full recipe</a>
      </nav>
      <div class="tabbody">${tab === 'full' ? fullTab : startTab}</div>
      <div class="bottom">
        <a class="btn primary big" href="#/c/${rc.dish.id}/${rc.style.id}?${qsFor(rc.opts, { step: 0 })}">Start cooking · ${rc.steps.length} steps</a>
      </div>
    `, rc.dish.name);

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

  // Cook mode: one step at a time
  function renderCook(rc, idx) {
    const total = rc.steps.length;
    idx = Math.min(Math.max(0, idx), total - 1);
    const s = rc.steps[idx];
    const last = idx === total - 1;
    const pct = Math.round(((idx + 1) / total) * 100);
    const recipeHref = `#/r/${rc.dish.id}/${rc.style.id}?${qsFor(rc.opts)}`;

    setPage(`
      <div class="cook">
        <header class="cook-head">
          <a class="iconbtn" href="${recipeHref}" aria-label="Leave cooking mode">${ICON.close}</a>
          <div class="cook-count">Step ${idx + 1} of ${total}</div>
          <span class="iconbtn ghost"></span>
        </header>
        <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <main class="cook-body">
          <p class="cook-dish">${esc(rc.dish.name)} · ${esc(rc.style.name)}</p>
          <p class="cook-text">${s.html}</p>
          ${s.list ? miniList(s.list) : ''}
          ${chips(s)}
          ${voice.supported ? `<button class="btn secondary read" id="read">${ICON.speaker}<span>Read aloud</span></button>` : ''}
        </main>
        <nav class="cook-nav">
          <button class="btn secondary" id="prev" ${idx === 0 ? 'disabled' : ''}>${ICON.back}<span>Back</span></button>
          ${last ? `<a class="btn primary" href="${recipeHref}">Done</a>` : `<button class="btn primary" id="next"><span>Next</span>${ICON.next}</button>`}
        </nav>
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
    app.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'prev') go(idx - 1);
      else if (b.id === 'next') go(idx + 1);
      else if (b.id === 'read') {
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

  // keyboard arrows in cook mode (handy on a laptop)
  document.addEventListener('keydown', (e) => {
    if (route().view !== 'cook') return;
    if (e.key === 'ArrowRight') { const n = document.getElementById('next'); if (n) n.click(); }
    if (e.key === 'ArrowLeft') { const p = document.getElementById('prev'); if (p && !p.disabled) p.click(); }
  });

  window.addEventListener('hashchange', () => { app.onclick = null; app.onchange = null; render(); });
  render();

  // expose for testing
  window.__kitchen = { build, search, tidy, fmtNum, scaleAmount };
})();
