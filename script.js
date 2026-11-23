/* ==========================================================================
   THIS IS FINE. — interactive disaster generator
   --------------------------------------------------------------------------
   Vanilla JS, no dependencies. One file, organised as small modules that only
   talk to each other through the Store (state) and a handful of explicit calls:

     01  Utilities
     02  Catalog & Store ........ options, custom text, persistence, share links
     03  Lettering .............. text slots: fitting, wrapping, redrawing in place
     04  Art: environments ...... seven illustrated SVG rooms
     05  Art: cast .............. characters, drinks, activities, furniture
     06  Scene .................. composes the two SVG layers
     07  FX ..................... canvas fire, embers, smoke, heat distortion
     08  Director ............... camera, parallax, lighting, quality governor
     09  Sound .................. synthesised ambience (Web Audio)
     10  Capture ................ PNG screenshot & share link
     11  UI ..................... studio panel, text editor, dock, speech bubble, toasts
     12  Easter eggs
     13  Boot
   ========================================================================== */

(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     01 — Utilities
     ------------------------------------------------------------------------ */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const TAU = Math.PI * 2;
  const DEG = 180 / Math.PI;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /** Frame-rate independent exponential smoothing. */
  const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

  /** Compact number for generated SVG markup. */
  const n = (value, digits = 1) => +value.toFixed(digits);

  /** Deterministic PRNG (mulberry32) — keeps procedural scenery identical between renders. */
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const hash = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  /** Smooth 1D value noise in [0, 1]. Every "randomised but organic" flicker comes from here. */
  function noise(x) {
    const i = Math.floor(x);
    const f = x - i;
    return lerp(hash(i), hash(i + 1), f * f * (3 - 2 * f));
  }

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersReducedMotion = () => motionQuery.matches;

  /* ------------------------------------------------------------------------
     02 — Catalog & Store
     ------------------------------------------------------------------------ */

  const CATALOG = {
    character: [
      { id: 'dog', name: 'Dog', noun: 'a dog' },
      { id: 'cat', name: 'Cat', noun: 'a cat' },
      { id: 'human', name: 'Humanoid', noun: 'an office worker' },
      { id: 'robot', name: 'Robot', noun: 'a robot' },
      { id: 'alien', name: 'Alien', noun: 'an alien' },
    ],
    drink: [
      { id: 'coffee', name: 'Coffee', noun: 'a mug of coffee' },
      { id: 'tea', name: 'Tea', noun: 'a cup of tea' },
      { id: 'cocoa', name: 'Hot Chocolate', short: 'Cocoa', noun: 'a hot chocolate' },
      { id: 'energy', name: 'Energy Drink', short: 'Energy', noun: 'an energy drink' },
      { id: 'wine', name: 'Wine', noun: 'a glass of wine' },
    ],
    activity: [
      { id: 'laptop', name: 'Working on Laptop', hint: 'Inbox zero. Building: also zero.', verb: 'working on a laptop' },
      { id: 'book', name: 'Reading a Book', hint: 'A real page-turner. Page-burner.', verb: 'reading a book' },
      { id: 'phone', name: 'Browsing Phone', hint: 'Doomscrolling, quite literally.', verb: 'browsing a phone' },
      { id: 'quiet', name: 'Sitting Quietly', hint: 'The classic. Just vibes.', verb: 'sitting quietly' },
      { id: 'gaming', name: 'Gaming', hint: 'You can’t pause an online game.', verb: 'gaming' },
    ],
    environment: [
      { id: 'classic', name: 'Original Meme Room', hint: 'Where it all began.', place: 'the original meme room', swatch: ['#f5c75e', '#a9662f'] },
      { id: 'office', name: 'Modern Office', hint: 'Per my last email…', place: 'a modern office', swatch: ['#c9d3db', '#56636f'] },
      { id: 'living', name: 'Living Room', hint: 'Home sweet inferno.', place: 'a living room', swatch: ['#6fa497', '#4a4a86'] },
      { id: 'street', name: 'City Street', hint: 'Outdoor seating available.', place: 'a city street', swatch: ['#3b1d55', '#1f4d57'] },
      { id: 'boardroom', name: 'Corporate Boardroom', hint: 'Synergy is up 400%.', place: 'a corporate boardroom', swatch: ['#5d3826', '#1c2440'] },
      { id: 'space', name: 'Space Station', hint: 'In space, no one can hear you cope.', place: 'a space station', swatch: ['#2a394d', '#050914'] },
      { id: 'cyberpunk', name: 'Cyberpunk Apartment', hint: 'High tech, low concern.', place: 'a cyberpunk apartment', swatch: ['#ff3d8b', '#23113f'] },
    ],
    chaos: [
      { id: 'mild', name: 'Mild Concern', temp: 58, adverb: 'mildly' },
      { id: 'serious', name: 'Serious Issue', temp: 240, adverb: 'seriously' },
      { id: 'catastrophic', name: 'Catastrophic', temp: 642, adverb: 'catastrophically' },
      { id: 'apocalyptic', name: 'Apocalyptic', temp: 1372, adverb: 'apocalyptically' },
    ],
  };

  const KEYS = Object.keys(CATALOG);
  const DEFAULTS = { character: 'dog', drink: 'coffee', activity: 'quiet', environment: 'classic', chaos: 'catastrophic' };

  const option = (key, id) => CATALOG[key].find((item) => item.id === id);
  const levelOf = (config) => CATALOG.chaos.findIndex((item) => item.id === config.chaos) + 1;

  /**
   * Every piece of lettering in the scene is a named slot the visitor can rewrite.
   * `base` is the original wording (a function where it is one of the random easter eggs),
   * `max` the longest custom text accepted, `hint` an optional note shown under the field.
   */
  const TEXT_SLOTS = {
    say: { group: 'Character', label: 'Speech bubble', max: 90, base: 'This is fine.' },

    mug: { group: 'On the table', label: 'Mug', max: 6, base: () => Eggs.mug },
    book: { group: 'On the table', label: 'Book title', max: 32, base: () => Eggs.book },
    mail1: { group: 'On the table', label: 'Notification 1', max: 12, base: 'URGENT' },
    mail2: { group: 'On the table', label: 'Notification 2', max: 12, base: 'RE: RE: RE:' },
    mail3: { group: 'On the table', label: 'Notification 3', max: 12, base: 'ASAP' },
    game1: { group: 'On the table', label: 'Game screen, top line', max: 12, base: 'HI 999999' },
    game2: { group: 'On the table', label: 'Game screen, second line', max: 12, base: 'LEVEL: FINE' },

    exit: { group: 'In the room', label: 'Exit sign', max: 9, base: 'EXIT' },
    board: { group: 'In the room', label: 'Whiteboard title', max: 16, base: 'Q4 GOALS' },
    notes: { group: 'In the room', label: 'Whiteboard notes', max: 48, base: 'synergy, pivot, don’t panic', hint: 'Up to three, separated by commas.' },
    bsod: { group: 'In the room', label: 'Crashed monitor', max: 6, base: ':(' },
    tv: { group: 'In the room', label: 'TV headline', max: 18, base: 'BREAKING NEWS' },
    ticker: { group: 'In the room', label: 'TV ticker', max: 160, base: 'LOCAL RESIDENT: “IT’S FINE” · EXPERTS: “IS IT, THOUGH?” · WEATHER: WARM, WITH A CHANCE OF EVERYTHING' },
    live: { group: 'In the room', label: 'TV badge', max: 5, base: 'LIVE' },
    shop: { group: 'In the room', label: 'Shop sign', max: 18, base: 'CAFÉ CALM' },
    door: { group: 'In the room', label: 'Door sign', max: 7, base: 'OPEN' },
    hours: { group: 'In the room', label: 'Door lettering', max: 14, base: 'till late' },
    menu: { group: 'In the room', label: 'Menu board', max: 40, base: 'TODAY hot drinks, hotter seats' },
    slide: { group: 'In the room', label: 'Slide title', max: 20, base: 'Q3 PERFORMANCE' },
    outlook: { group: 'In the room', label: 'Slide caption', max: 10, base: 'Outlook:' },
    verdict: { group: 'In the room', label: 'Slide verdict', max: 8, base: 'FINE' },
    brass: { group: 'In the room', label: 'Wall lettering', max: 16, base: 'FINE & CO.' },
    hull: { group: 'In the room', label: 'Console, line 1', max: 12, base: 'HULL: FINE' },
    oxygen: { group: 'In the room', label: 'Console, line 2', max: 12, base: 'O2: 12%' },
    holo: { group: 'In the room', label: 'Hologram', max: 6, base: 'FINE' },
    neon: { group: 'In the room', label: 'Neon sign', max: 14, base: 'it’s fine' },
    poster: { group: 'In the room', label: 'Poster', max: 6, base: '2099' },

    sticky: { group: 'Hidden extras', label: 'Sticky note', max: 30, base: 'TO DO: panic (later)' },
    chirp: { group: 'Hidden extras', label: 'Smoke detector', max: 8, base: 'chirp!' },
    tank: { group: 'Hidden extras', label: 'Extinguisher label', max: 6, base: 'EMPTY' },
  };

  /**
   * Single source of truth. `config` is what the scene shows, `texts` any lettering the
   * visitor rewrote; `saved` says whether they have made it their own (which is what gets
   * restored on the next visit).
   */
  const Store = (() => {
    const STORAGE_KEY = 'this-is-fine:v1';
    const TEXT_PARAM = 't.'; // custom lettering travels in share links as t.<slot>=…
    const listeners = new Set();
    const textListeners = new Set();
    const state = { config: { ...DEFAULTS }, texts: {}, saved: false, shared: false, sound: false };

    const sanitize = (raw) => {
      const clean = {};
      if (raw && typeof raw === 'object') {
        for (const key of KEYS) {
          if (option(key, raw[key])) clean[key] = raw[key];
        }
      }
      return clean;
    };

    /**
     * Custom lettering is untrusted (it arrives through share links): plain text, one line, bounded.
     * Control characters and stray surrogates go; the limit counts whole characters, so an emoji is never cut in half.
     */
    const cleanText = (id, value) => Array.from(String(value)
      .replace(/[\u0000-\u001f\u007f\u2028\u2029\ud800-\udfff]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim())
      .slice(0, TEXT_SLOTS[id].max)
      .join('')
      .trim();

    const sanitizeTexts = (raw) => {
      const clean = {};
      if (raw && typeof raw === 'object') {
        for (const id of Object.keys(TEXT_SLOTS)) {
          const value = typeof raw[id] === 'string' ? cleanText(id, raw[id]) : '';
          if (value) clean[id] = value;
        }
      }
      return clean;
    };

    /** ?character=dog&drink=coffee&activity=laptop&environment=office&chaos=apocalyptic&t.say=Hello */
    function fromQuery(search = window.location.search) {
      const params = new URLSearchParams(search);
      const raw = {};
      const rawTexts = {};
      for (const key of KEYS) {
        const value = params.get(key);
        if (value) raw[key] = value.toLowerCase();
      }
      for (const [key, value] of params) {
        if (key.startsWith(TEXT_PARAM)) rawTexts[key.slice(TEXT_PARAM.length)] = value;
      }
      const config = sanitize(raw);
      const texts = sanitizeTexts(rawTexts);
      return Object.keys(config).length || Object.keys(texts).length ? { config, texts } : null;
    }

    const toQuery = () => new URLSearchParams([
      ...KEYS.map((key) => [key, state.config[key]]),
      ...Object.entries(state.texts).map(([id, value]) => [TEXT_PARAM + id, value]),
    ]).toString();

    function persist() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          config: state.saved ? state.config : null,
          texts: state.saved ? state.texts : {},
          sound: state.sound,
        }));
      } catch {
        /* Storage can be unavailable (private mode, quota). The site still works, it just forgets. */
      }
    }

    function load() {
      let stored = null;
      try {
        stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      } catch {
        stored = null;
      }
      if (stored && typeof stored === 'object') {
        state.sound = Boolean(stored.sound);
        const config = sanitize(stored.config);
        if (Object.keys(config).length) {
          state.config = { ...DEFAULTS, ...config };
          state.texts = sanitizeTexts(stored.texts);
          state.saved = true;
        }
      }
      // A shared link always wins over what was saved, but does not overwrite it until edited.
      const shared = fromQuery();
      if (shared) {
        state.config = { ...DEFAULTS, ...shared.config };
        state.texts = shared.texts;
        state.shared = true;
      }
      return state;
    }

    const emit = (previous, changed) => listeners.forEach((listener) => listener(state.config, previous, changed));
    const emitText = (id) => textListeners.forEach((listener) => listener(id));

    /** Any edit makes the creation "theirs": saved, restored next time, no longer a shared link. */
    function adopt() {
      state.saved = true;
      if (state.shared) {
        state.shared = false;
        window.history.replaceState(null, '', window.location.pathname);
      }
      persist();
    }

    /** Apply a partial config. */
    function set(patch) {
      const next = { ...state.config, ...sanitize(patch) };
      const changed = KEYS.filter((key) => next[key] !== state.config[key]);
      if (!changed.length) return false;
      const previous = state.config;
      state.config = next;
      adopt();
      emit(previous, changed);
      return true;
    }

    /** Rewrite one piece of lettering; an empty value restores the original wording. */
    function setText(id, value) {
      const next = cleanText(id, value);
      if (next === (state.texts[id] || '')) return;
      if (next) state.texts[id] = next;
      else delete state.texts[id];
      adopt();
      emitText(id);
    }

    /** Restore the original wording everywhere. */
    function clearTexts() {
      state.texts = {};
      adopt();
      emitText(null);
    }

    /** Back to the untouched original. */
    function reset() {
      const previous = state.config;
      state.config = { ...DEFAULTS };
      state.texts = {};
      state.saved = false;
      state.shared = false;
      window.history.replaceState(null, '', window.location.pathname);
      persist();
      emitText(null);
      emit(previous, KEYS.filter((key) => previous[key] !== DEFAULTS[key]));
    }

    function setSound(on) {
      state.sound = on;
      persist();
    }

    /** The original wording of a slot. */
    const baseText = (id) => {
      const { base } = TEXT_SLOTS[id];
      return typeof base === 'function' ? base() : base;
    };

    return {
      load,
      set,
      setText,
      clearTexts,
      /** Adopt whatever is on screen as the visitor's creation, even if they changed nothing. */
      keep: adopt,
      reset,
      setSound,
      toQuery,
      baseText,
      /** What a slot says right now: the visitor's wording, or the original. */
      text: (id) => state.texts[id] || baseText(id),
      /** The visitor's own wording for a slot ('' if they have not touched it). */
      customText: (id) => state.texts[id] || '',
      subscribe: (listener) => listeners.add(listener),
      /** Called with the slot id whose wording changed, or null when all of it did. */
      onText: (listener) => textListeners.add(listener),
      get config() { return state.config; },
      get level() { return levelOf(state.config); },
      get hasTexts() { return Object.keys(state.texts).length > 0; },
      get hasCreation() { return state.saved || state.shared; },
    };
  })();

  /* ------------------------------------------------------------------------
     03 — Lettering
     The art never hard-codes its wording. It asks for a text slot through
     `slot()`, which also remembers how that slot is drawn — so when the
     visitor rewrites it, only that one piece of lettering is redrawn.
     ------------------------------------------------------------------------ */

  // System fonts only: SVG that is rasterised for the PNG export cannot load web fonts.
  const FONTS = {
    sans: 'Arial, Helvetica, sans-serif',
    serif: "Georgia, 'Times New Roman', serif",
    mono: "'Courier New', Courier, monospace",
    comic: "'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive",
    black: "'Arial Black', Arial, sans-serif",
    script: "'Brush Script MT', 'Segoe Script', 'Snell Roundhand', cursive",
  };

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Visitor text goes into SVG markup: escape it, always. */
  const esc = (text) => String(text).replace(/[&<>"']/g, (char) => ESCAPES[char]);

  const measurer = document.createElement('canvas').getContext('2d');

  const textWidth = (text, { size, font = 'sans', weight = 400, italic = false, spacing = 0 }) => {
    measurer.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONTS[font]}`;
    return measurer.measureText(text).width + spacing * text.length;
  };

  /** The largest size, up to the designed one, at which `text` fits in `width`. */
  const fittedSize = (text, options) =>
    options.size * clamp(options.width / Math.max(textWidth(text, options), 1), 0.4, 1);

  /**
   * One line of scene lettering that always fits its sign: long wording gets a smaller font
   * (kept centred on the original line) and, as a last resort, is squeezed to the exact width.
   * Pass `fitted` to set several lines in one shared size; the caller then places each baseline.
   */
  function fitText(text, options) {
    const { x, y, size, width, font = 'sans', weight = 400, italic = false, spacing = 0, anchor = 'start', fill, extra = '' } = options;
    const solo = options.fitted === undefined;
    const fitted = solo ? fittedSize(text, options) : options.fitted;
    const scale = fitted / size;
    const squeezed = textWidth(text, { ...options, size: fitted, spacing: spacing * scale }) > width + 0.5;
    return `<text x="${x}" y="${n(solo ? y - (size - fitted) * 0.35 : y, 2)}" font-family="${FONTS[font]}" font-weight="${weight}" font-size="${n(fitted, 2)}"` +
      `${italic ? ' font-style="italic"' : ''}${spacing ? ` letter-spacing="${n(spacing * scale, 2)}"` : ''}` +
      `${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}${squeezed ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : ''}` +
      `${fill ? ` fill="${fill}"` : ''}${extra ? ` ${extra}` : ''}>${esc(text)}</text>`;
  }

  /**
   * Several lines set in one shared size. `baseline(i, scale)` places each line, where `scale`
   * says how far the lettering had to shrink (1 = as designed); `each(line, i)` may add
   * attributes to a single line.
   */
  function fitLines(lines, { baseline, each, ...options }) {
    const fitted = Math.min(options.size, ...lines.map((line) => fittedSize(line, options)));
    return lines.map((line, i) => fitText(line, {
      ...options,
      fitted,
      y: baseline(i, fitted / options.size),
      extra: each ? each(line, i) : options.extra,
    })).join('');
  }

  /** Baselines for `count` lines of the given size and leading, centred as a block on `cy`. */
  const centred = (cy, size, leading, count) => (i, scale) =>
    cy + (size * 0.35 + (i - (count - 1) / 2) * leading) * scale;

  /** Greedy word wrap into at most `maxLines` lines; they only grow past `perLine` characters when they must. */
  function wrapWords(text, perLine, maxLines) {
    const words = text.split(' ').filter(Boolean);
    for (let limit = perLine; ; limit++) {
      const lines = [];
      for (const word of words) {
        const last = lines.length - 1;
        if (last >= 0 && lines[last].length + 1 + word.length <= limit) lines[last] += ` ${word}`;
        else lines.push(word);
      }
      if (lines.length <= maxLines) return lines;
    }
  }

  /** "a, b, c, d" → at most `max` items; whatever is left over stays in the last one. */
  function splitList(text, max) {
    const parts = text.split(',');
    return [...parts.slice(0, max - 1), parts.slice(max - 1).join(',')]
      .map((item) => item.trim())
      .filter(Boolean);
  }

  const Lettering = (() => {
    const renderers = new Map();

    /** Slot elements in the scene, ignoring a room that is fading out. */
    const nodes = (id) => $$(id ? `#scene [data-slot="${id}"]` : '#scene [data-slot]')
      .filter((node) => !node.closest('.is-leaving'));

    /** Draw a text slot. `render(wording)` returns its SVG; the wrapper lets it be redrawn in place. */
    function slot(id, render) {
      renderers.set(id, render);
      return `<g data-slot="${id}">${render(Store.text(id))}</g>`;
    }

    /** Redraw one slot (or, with no id, every slot) after its wording changed. */
    function refresh(id) {
      for (const node of nodes(id)) node.innerHTML = renderers.get(node.dataset.slot)(Store.text(node.dataset.slot));
    }

    /** The slots that are part of the scene right now, in catalogue order. */
    function present() {
      const live = new Set(nodes().map((node) => node.dataset.slot));
      return Object.keys(TEXT_SLOTS).filter((id) => id === 'say' || live.has(id));
    }

    /** Light up the lettering whose field is being edited, so it is easy to find. Returns it (null: none). */
    function highlight(id) {
      $$('#scene .is-editing').forEach((node) => node.classList.remove('is-editing'));
      const lit = id ? nodes(id) : [];
      lit.forEach((node) => node.classList.add('is-editing'));
      return lit[0] || null;
    }

    return { slot, refresh, present, highlight };
  })();

  const { slot } = Lettering;

  /* ------------------------------------------------------------------------
     04 — Art: environments
     Every room is drawn in a 1600 × 1400 "world". The wall meets the floor at
     y = 900 and the cast sits around the centre, so one illustration crops
     gracefully to anything from an ultrawide monitor to a tall phone.
     ------------------------------------------------------------------------ */

  const WORLD = { w: 1600, h: 1400, floor: 900 };

  /** Teardrop flame silhouette with its base centred on the origin. */
  const flamePath = (w, h) =>
    `M${n(-w / 2)} 0C${n(-w * 0.62)} ${n(-h * 0.3)} ${n(-w * 0.3)} ${n(-h * 0.55)} ${n(-w * 0.08)} ${n(-h * 0.8)}` +
    `Q0 ${n(-h * 0.93)} ${n(w * 0.05)} ${n(-h)}Q${n(w * 0.12)} ${n(-h * 0.8)} ${n(w * 0.24)} ${n(-h * 0.62)}` +
    `C${n(w * 0.48)} ${n(-h * 0.42)} ${n(w * 0.62)} ${n(-h * 0.2)} ${n(w / 2)} 0Z`;

  /**
   * Small CSS-animated flames that live inside the illustration (behind windows,
   * on screens, on props). The big fire is drawn on canvas — see FX.
   * @param {string} p gradient id prefix: 'e' for the environment layer, 'c' for the cast layer
   */
  function sceneFlames(x, y, width, height, count, seed, cls = '', p = 'e') {
    const r = seeded(seed);
    const step = width / count;
    let out = '';
    for (let i = 0; i < count; i++) {
      const fx = x + step * (i + 0.5) + (r() - 0.5) * step * 0.4;
      const fh = height * (0.55 + r() * 0.45);
      const fw = step * (1.15 + r() * 0.5);
      out += `<g transform="translate(${n(fx)} ${y})"><g class="sflame" style="--t:${n(0.6 + r() * 0.7, 2)}s;--d:${n(-r() * 2, 2)}s">` +
        `<path d="${flamePath(fw, fh)}" fill="url(#${p}-fo)"/><path d="${flamePath(fw * 0.5, fh * 0.55)}" fill="url(#${p}-fi)"/></g></g>`;
    }
    return `<g class="${cls}">${out}</g>`;
  }

  /** A row of buildings with randomly lit windows. */
  function skyline({ seed, x0, x1, base, min, max, fill, lit = '#ffd27a', chance = 0.25, win = [10, 14], gap = [14, 18] }) {
    const r = seeded(seed);
    let out = '';
    let lights = '';
    for (let x = x0; x < x1;) {
      const w = 50 + r() * 70;
      const h = min + r() * (max - min);
      const top = base - h;
      out += `<rect x="${n(x)}" y="${n(top)}" width="${n(w + 1)}" height="${n(h)}"/>`;
      for (let wy = top + 16; wy < base - 20; wy += win[1] + gap[1]) {
        for (let wx = x + 9; wx < x + w - win[0] - 5; wx += win[0] + gap[0]) {
          if (r() < chance) lights += `<rect x="${n(wx)}" y="${n(wy)}" width="${win[0]}" height="${win[1]}" opacity="${n(0.35 + r() * 0.6, 2)}"/>`;
        }
      }
      x += w;
    }
    return `<g fill="${fill}">${out}</g><g fill="${lit}">${lights}</g>`;
  }

  function stars(seed, count, x, y, w, h) {
    const r = seeded(seed);
    let out = '';
    for (let i = 0; i < count; i++) {
      const timing = r() < 0.25 ? `--t:${n(1.5 + r() * 3)}s;--d:${n(-r() * 4)}s` : '';
      const at = `cx="${n(x + r() * w)}" cy="${n(y + r() * h)}" r="${n(0.8 + r() * 1.6)}"`;
      const glow = n(0.35 + r() * 0.6, 2);
      out += timing ? `<circle ${at} class="twinkle" style="${timing};--o:${glow}"/>` : `<circle ${at} opacity="${glow}"/>`;
    }
    return `<g fill="#fff">${out}</g>`;
  }

  /** Floorboards / pavers: horizontal seams that spread out towards the viewer, with staggered joints. */
  function planks(seed, color, rows = [900, 934, 976, 1028, 1092, 1170, 1264, 1400]) {
    const r = seeded(seed);
    let d = '';
    for (let i = 1; i < rows.length - 1; i++) d += `M0 ${rows[i]}H1600`;
    for (let i = 0; i < rows.length - 1; i++) {
      for (let x = r() * 220; x < 1600; x += 200 + r() * 180) d += `M${n(x)} ${rows[i]}V${rows[i + 1]}`;
    }
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" opacity=".42"/>`;
  }

  /** Tiled floor in one-point perspective. */
  function floorGrid(color, opacity = 0.4) {
    let d = 'M0 946H1600M0 1006H1600M0 1084H1600M0 1186H1600M0 1316H1600';
    for (let k = -9; k <= 9; k++) d += `M${800 + k * 130} 900L${800 + k * 455} 1400`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" opacity="${opacity}"/>`;
  }

  /** Gradients shared by every environment. */
  const ENV_DEFS = `
    <linearGradient id="e-fo" x2="0" y2="1"><stop offset="0" stop-color="#e2330f"/><stop offset=".5" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ffc24a"/></linearGradient>
    <linearGradient id="e-fi" x2="0" y2="1"><stop offset="0" stop-color="#ffc23d"/><stop offset="1" stop-color="#fff3b0"/></linearGradient>
    <linearGradient id="e-glow" x2="0" y2="1"><stop offset="0" stop-color="#ff8a1f" stop-opacity="0"/><stop offset="1" stop-color="#ff8a1f" stop-opacity=".66"/></linearGradient>
    <linearGradient id="e-soot" x2="0" y2="1"><stop offset="0" stop-color="#120705" stop-opacity=".86"/><stop offset="1" stop-color="#120705" stop-opacity="0"/></linearGradient>
    <radialGradient id="e-scorch"><stop offset="0" stop-color="#120604" stop-opacity=".85"/><stop offset=".6" stop-color="#120604" stop-opacity=".35"/><stop offset="1" stop-color="#120604" stop-opacity="0"/></radialGradient>
    <radialGradient id="e-halo"><stop offset="0" stop-color="#fff2c4" stop-opacity=".95"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`;

  /** Firelight on the walls, soot under the ceiling, scorch marks and cracks. */
  const damage = ({ soot = true, cracks = true } = {}) => `
    <rect y="380" width="1600" height="520" fill="url(#e-glow)" class="heat-o"/>
    ${soot ? '<rect width="1600" height="560" fill="url(#e-soot)" class="heat-o"/>' : ''}
    <g class="lv-3"><ellipse cx="60" cy="640" rx="220" ry="310" fill="url(#e-scorch)"/><ellipse cx="1545" cy="620" rx="230" ry="330" fill="url(#e-scorch)"/><ellipse cx="430" cy="830" rx="170" ry="110" fill="url(#e-scorch)"/><ellipse cx="1190" cy="836" rx="190" ry="104" fill="url(#e-scorch)"/></g>
    ${cracks ? '<g class="lv-4" fill="none" stroke="#1a0a06" stroke-width="5" stroke-linejoin="round" opacity=".7"><path d="M690 178l14 46-20 34 26 50-10 44"/><path d="M1052 178l-10 38 18 30-14 40"/><path d="M330 178l8 30-14 28"/></g>' : ''}`;

  const ENVIRONMENTS = {
    /* — The original: mustard walls, a window, a door, a clock that gives up — */
    classic: {
      chair: 'wood', table: 'round', reflect: 0.22, palette: 'ember',
      eggs: { wall: [1036, 296], floor: [1236, 1012] },
      art: () => `
        <defs>
          <linearGradient id="cl-wall" x2="0" y2="1"><stop offset="0" stop-color="#a66824"/><stop offset=".42" stop-color="#e1a543"/><stop offset="1" stop-color="#f6c95f"/></linearGradient>
          <linearGradient id="cl-floor" x2="0" y2="1"><stop offset="0" stop-color="#aa672f"/><stop offset="1" stop-color="#45200d"/></linearGradient>
          <linearGradient id="cl-sky" x2="0" y2="1"><stop offset="0" stop-color="#3b2a5c"/><stop offset=".62" stop-color="#d9603a"/><stop offset="1" stop-color="#ffb24d"/></linearGradient>
          <pattern id="cl-paper" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="40" height="80" fill="#fff" opacity=".055"/></pattern>
          <clipPath id="cl-glass"><rect x="140" y="380" width="260" height="330"/></clipPath>
        </defs>
        <rect width="1600" height="900" fill="url(#cl-wall)"/>
        <rect y="176" width="1600" height="700" fill="url(#cl-paper)"/>
        <rect width="1600" height="152" fill="#8a5820"/><rect y="150" width="1600" height="26" fill="#6a4118"/>

        <path d="M90 346H450" stroke="#5b3212" stroke-width="10" stroke-linecap="round"/>
        <rect x="122" y="362" width="296" height="366" rx="6" fill="#6b3a17"/>
        <rect x="140" y="380" width="260" height="330" fill="url(#cl-sky)"/>
        <g clip-path="url(#cl-glass)">
          <circle cx="336" cy="446" r="26" fill="#ffe9b0" opacity=".85"/>
          <path d="M140 646l52-42 46 30 70-52 92 62v70H140z" fill="#3a1c2e" opacity=".85"/>
          ${sceneFlames(140, 712, 260, 220, 4, 11, 'lv-2')}
        </g>
        <path d="M270 380v330M140 545h260" stroke="#6b3a17" stroke-width="12"/>
        <path d="M150 390h70l-62 92z" fill="#fff" opacity=".12"/>
        <path d="M106 346c22 120-12 250 20 394h54c-20-122 12-262 0-394z" fill="#b83d27"/>
        <path d="M434 346c-22 120 12 250-20 394h-54c20-122-12-262 0-394z" fill="#b83d27"/>
        <path d="M130 346c10 130-10 260 8 394M156 346c8 140-6 270 6 394M410 346c-10 130 10 260-8 394M384 346c-8 140 6 270-6 394" fill="none" stroke="#8a2a1b" stroke-width="4" opacity=".6"/>
        <rect x="104" y="724" width="332" height="20" rx="4" fill="#7b4a20"/>

        <g class="crooked" style="--dir:-1">
          <rect x="462" y="350" width="120" height="96" rx="4" fill="#7a4a1c"/>
          <rect x="472" y="360" width="100" height="76" fill="#8fc7d6"/>
          <path d="M472 416l28-24 22 16 26-28 24 24v32H472z" fill="#5c9a5a"/>
          <circle cx="546" cy="380" r="9" fill="#ffe08a"/>
        </g>

        <g class="crooked" style="--dir:.6">
          <circle cx="1185" cy="366" r="54" fill="#6b3a17"/><circle cx="1185" cy="366" r="45" fill="#fff3d6"/>
          <path d="M1185 327v8M1185 397v8M1146 366h8M1216 366h8" stroke="#6b3a17" stroke-width="4" stroke-linecap="round"/>
          <g transform="translate(1185 366)">
            <path class="spin spin--slow" d="M0 4V-22" stroke="#3b200c" stroke-width="5" stroke-linecap="round"/>
            <path class="spin" d="M0 6V-34" stroke="#c0392b" stroke-width="3" stroke-linecap="round"/>
            <circle r="4" fill="#3b200c"/>
          </g>
        </g>

        <rect x="1296" y="404" width="228" height="496" fill="#5b3212"/>
        <rect x="1310" y="418" width="200" height="482" fill="#8b4f22"/>
        <rect x="1330" y="440" width="160" height="180" rx="4" fill="#7a431b"/><rect x="1330" y="650" width="160" height="220" rx="4" fill="#7a431b"/>
        <circle cx="1338" cy="640" r="11" fill="#e8b84a"/>
        <g class="lv-2"><rect x="1310" y="884" width="200" height="16" fill="#ffb347" class="flick"/></g>
        <g class="lv-3"><path d="M1303 900V411h214v489" fill="none" stroke="#ffc266" stroke-width="5" class="flick"/></g>

        <g class="lean" style="--dir:1">
          <rect x="1211" y="566" width="8" height="336" fill="#4a2a12"/><ellipse cx="1215" cy="900" rx="44" ry="10" fill="#4a2a12"/>
          <ellipse cx="1215" cy="540" rx="80" ry="66" fill="url(#e-halo)" opacity=".5"/>
          <path d="M1176 568l18-78h42l18 78z" fill="#fff0c9"/>
        </g>

        <rect y="868" width="1600" height="32" fill="#7b4a20"/><rect y="868" width="1600" height="5" fill="#a36a35"/>
        <rect y="900" width="1600" height="500" fill="url(#cl-floor)"/>
        ${planks(12, '#2e1407')}
        ${damage()}`,
    },

    /* — Open-plan optimism: strip lights, a whiteboard and a printer that started it — */
    office: {
      chair: 'office', table: 'desk', reflect: 0.08, palette: 'ember',
      eggs: { wall: [800, 296], floor: [1236, 1012] },
      art: () => `
        <defs>
          <linearGradient id="of-wall" x2="0" y2="1"><stop offset="0" stop-color="#8a97a3"/><stop offset="1" stop-color="#d2dadf"/></linearGradient>
          <linearGradient id="of-floor" x2="0" y2="1"><stop offset="0" stop-color="#5b6975"/><stop offset="1" stop-color="#1f262d"/></linearGradient>
          <linearGradient id="of-sky" x2="0" y2="1"><stop offset="0" stop-color="#5e8fc4"/><stop offset="1" stop-color="#ffd9a0"/></linearGradient>
          <clipPath id="of-glass"><rect x="90" y="340" width="600" height="380"/></clipPath>
        </defs>
        <rect width="1600" height="900" fill="url(#of-wall)"/>
        <rect width="1600" height="172" fill="#7c8894"/>
        <path d="M0 172h1600M0 86h1600M200 0v172M600 0v172M1000 0v172M1400 0v172" stroke="#69757f" stroke-width="3"/>
        <g class="flick" fill="#f4fbff"><rect x="260" y="104" width="280" height="38" rx="6"/><rect x="1060" y="104" width="280" height="38" rx="6"/></g>
        <rect x="660" y="104" width="280" height="38" rx="6" fill="#f4fbff" class="lv-calm"/>

        <rect x="76" y="326" width="628" height="408" rx="6" fill="#4d5863"/>
        <rect x="90" y="340" width="600" height="380" fill="url(#of-sky)"/>
        <g clip-path="url(#of-glass)">
          ${skyline({ seed: 21, x0: 80, x1: 700, base: 722, min: 110, max: 310, fill: '#7d97b1', lit: '#fff1c2', chance: 0.2 })}
          ${skyline({ seed: 22, x0: 60, x1: 700, base: 722, min: 40, max: 180, fill: '#4b6480', chance: 0.28 })}
          <rect x="90" y="340" width="600" height="380" fill="#ff6a1a" opacity=".38" class="lv-3"/>
          ${sceneFlames(90, 724, 600, 250, 7, 23, 'lv-3')}
        </g>
        <path d="M290 340v380M490 340v380" stroke="#4d5863" stroke-width="14"/>
        <g class="crooked" style="--dir:.45" fill="#eef2f5" opacity=".92">
          <rect x="90" y="340" width="200" height="9"/><rect x="90" y="358" width="200" height="9"/><rect x="90" y="376" width="200" height="9"/><rect x="90" y="394" width="200" height="9"/><rect x="90" y="412" width="200" height="9"/><rect x="90" y="430" width="200" height="9"/>
        </g>
        <path d="M506 352h96l-84 130z" fill="#fff" opacity=".12"/>

        <g class="crooked" style="--dir:1.4">
          <path d="M1012 172v132M1078 172v132" stroke="#4d5863" stroke-width="3"/>
          <rect x="996" y="302" width="98" height="40" rx="5" fill="#1d7a3e"/>
          ${slot('exit', (text) => fitText(text, { x: 1045, y: 331, size: 24, weight: 700, spacing: 2, width: 84, anchor: 'middle', fill: '#eafff0' }))}
          <rect x="996" y="302" width="98" height="40" rx="5" fill="#7dffb0" class="flick" style="--o:.25"/>
        </g>

        <g class="crooked" style="--dir:-.35">
          <rect x="1140" y="344" width="360" height="266" rx="8" fill="#8b959e"/><rect x="1152" y="356" width="336" height="242" fill="#fbfdff"/>
          ${slot('board', (text) => fitText(text, { x: 1172, y: 394, size: 24, weight: 700, width: 296, fill: '#26323d' }))}
          <path d="M1172 404h112" stroke="#e2330f" stroke-width="4"/>
          <path d="M1176 440v120h184" fill="none" stroke="#26323d" stroke-width="4" stroke-linecap="round"/>
          <path d="M1186 540l34-22 30 8 34-46 28 12 32 66" fill="none" stroke="#e2330f" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
          ${slot('notes', (text) => fitLines(splitList(text, 3).map((item) => `• ${item}`), { x: 1384, size: 15, width: 98, fill: '#26323d', baseline: (i) => 446 + i * 26 }))}
          <rect x="1392" y="518" width="56" height="52" fill="#ffe36b" transform="rotate(-6 1420 544)"/>
          <rect x="1152" y="598" width="336" height="10" fill="#6f7982"/>
        </g>

        <rect x="96" y="772" width="300" height="128" rx="6" fill="#dfe5e9"/>
        <path d="M196 772v128M296 772v128" stroke="#b9c2c9" stroke-width="3"/>
        <path d="M130 800h32M230 800h32M330 800h32M130 850h32M230 850h32M330 850h32" stroke="#8b959e" stroke-width="6" stroke-linecap="round"/>
        <rect x="146" y="708" width="88" height="20" rx="3" fill="#fbfdff"/>
        <rect x="128" y="724" width="124" height="48" rx="8" fill="#39424a"/><rect x="140" y="752" width="100" height="8" rx="3" fill="#20262c"/>
        <circle cx="238" cy="738" r="4" fill="#ff5a3c" class="blink-led"/>
        ${sceneFlames(132, 728, 116, 104, 2, 29, 'lv-2')}
        <g class="lv-2" fill="#fff">
          <rect class="float" x="276" y="640" width="34" height="44" style="--t:5s;--fx:30px;--fy:-50px"/>
          <rect class="float" x="336" y="684" width="34" height="44" style="--t:7s;--d:-3s;--fx:-24px;--fy:-36px"/>
        </g>

        <rect x="396" y="694" width="740" height="206" rx="6" fill="#7f909d"/><rect x="396" y="694" width="740" height="12" rx="6" fill="#56626d"/>
        <path d="M640 706v194M890 706v194" stroke="#6c7c89" stroke-width="4"/>
        <rect x="430" y="730" width="50" height="50" fill="#ffe36b" transform="rotate(-5 455 755)"/>
        <rect x="930" y="736" width="64" height="46" fill="#fff" transform="rotate(4 962 759)"/>
        <rect x="1020" y="728" width="46" height="46" fill="#ff9aa2" transform="rotate(-3 1043 751)"/>

        <rect x="1166" y="786" width="370" height="16" rx="4" fill="#e7ecef"/><rect x="1186" y="802" width="14" height="98" fill="#aab4bc"/><rect x="1500" y="802" width="14" height="98" fill="#aab4bc"/>
        <rect x="1280" y="662" width="170" height="108" rx="8" fill="#20262c"/><rect x="1290" y="672" width="150" height="88" fill="#2757d6"/>
        ${slot('bsod', (text) => fitText(text, { x: 1304, y: 716, size: 34, weight: 700, width: 124, fill: '#fff' }))}
        <path d="M1304 734h90M1304 746h60" stroke="#fff" stroke-width="4" opacity=".8"/>
        <rect x="1354" y="770" width="22" height="16" fill="#20262c"/>
        <path d="M1208 786l-6-28h40l-6 28z" fill="#c8623a"/>
        <path d="M1222 758c-18-26-8-46 0-54 8 8 18 28 0 54zM1222 758c-26-8-36-26-34-40 14 0 30 12 34 40zM1222 758c26-8 36-26 34-40-14 0-30 12-34 40z" fill="#4f9a5a"/>

        <rect y="880" width="1600" height="20" fill="#6f7b86"/>
        <rect y="900" width="1600" height="500" fill="url(#of-floor)"/>
        ${floorGrid('#141a20')}
        ${damage()}`,
    },

    /* — Home sweet inferno: sofa, rug and a television that is weirdly on topic — */
    living: {
      chair: 'wood', table: 'round', reflect: 0.2, palette: 'ember',
      eggs: { wall: [712, 296], floor: [1236, 1012] },
      art: () => `
        <defs>
          <linearGradient id="lv-wall" x2="0" y2="1"><stop offset="0" stop-color="#2b5550"/><stop offset="1" stop-color="#78ad9f"/></linearGradient>
          <linearGradient id="lv-floor" x2="0" y2="1"><stop offset="0" stop-color="#b98253"/><stop offset="1" stop-color="#4f2d15"/></linearGradient>
          <linearGradient id="lv-night" x2="0" y2="1"><stop offset="0" stop-color="#101a3a"/><stop offset="1" stop-color="#3f4486"/></linearGradient>
          <pattern id="lv-paper" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M28 6l10 22-10 22-10-22z" fill="#fff" opacity=".05"/></pattern>
          <clipPath id="lv-glass"><rect x="170" y="330" width="250" height="290"/></clipPath>
          <clipPath id="lv-tv"><rect x="1202" y="592" width="286" height="176"/></clipPath>
        </defs>
        <rect width="1600" height="900" fill="url(#lv-wall)"/>
        <rect y="176" width="1600" height="700" fill="url(#lv-paper)"/>
        <rect width="1600" height="152" fill="#e9dfc8"/><rect y="150" width="1600" height="26" fill="#c9bb9a"/>

        <path d="M120 300H470" stroke="#3a2a1a" stroke-width="9" stroke-linecap="round"/>
        <rect x="156" y="316" width="278" height="318" rx="6" fill="#efe6d2"/>
        <rect x="170" y="330" width="250" height="290" fill="url(#lv-night)"/>
        <g clip-path="url(#lv-glass)">
          ${stars(31, 14, 170, 330, 250, 170)}
          <circle cx="372" cy="388" r="26" fill="#fff6d8"/><circle cx="362" cy="380" r="26" fill="#18224a" opacity=".55"/>
          <rect x="170" y="330" width="250" height="290" fill="#ff6a1a" opacity=".4" class="lv-3"/>
          ${sceneFlames(170, 622, 250, 200, 4, 32, 'lv-3')}
        </g>
        <path d="M295 330v290M170 475h250" stroke="#efe6d2" stroke-width="10"/>
        <path d="M134 300c20 130-10 270 16 410h58c-18-136 10-280 0-410zM456 300c-20 130 10 270-16 410h-58c18-136-10-280 0-410z" fill="#e7c56b"/>
        <path d="M160 300c8 140-8 280 6 410M430 300c-8 140 8 280-6 410" fill="none" stroke="#c49f45" stroke-width="4" opacity=".7"/>

        <rect x="64" y="652" width="500" height="200" rx="56" fill="#45457f"/>
        <rect x="150" y="700" width="96" height="88" rx="20" fill="#e2a23b" transform="rotate(-10 198 744)"/>
        <rect x="396" y="704" width="90" height="84" rx="20" fill="#d9697f" transform="rotate(8 441 746)"/>
        <rect x="108" y="772" width="420" height="100" rx="30" fill="#5757a0"/>
        <path d="M318 776v92" stroke="#3a3a70" stroke-width="4"/>
        <rect x="42" y="716" width="100" height="174" rx="42" fill="#3a3a70"/><rect x="498" y="716" width="100" height="174" rx="42" fill="#3a3a70"/>
        <rect x="88" y="884" width="14" height="18" fill="#22140c"/><rect x="538" y="884" width="14" height="18" fill="#22140c"/>

        <g class="crooked" style="--dir:-.8"><rect x="876" y="300" width="70" height="86" rx="3" fill="#efe6d2"/><rect x="884" y="308" width="54" height="70" fill="#d9697f"/><circle cx="911" cy="336" r="12" fill="#ffe3c2"/><path d="M892 378c2-18 12-24 19-24s17 6 19 24z" fill="#45457f"/></g>
        <g class="crooked" style="--dir:1.2"><rect x="966" y="312" width="96" height="66" rx="3" fill="#6b4226"/><rect x="974" y="320" width="80" height="50" fill="#8fc7d6"/><path d="M974 356l22-18 18 12 20-22 20 20v22h-80z" fill="#4f9a5a"/></g>
        <g class="crooked" style="--dir:-.5"><rect x="1082" y="296" width="62" height="78" rx="3" fill="#e2a23b"/><rect x="1090" y="304" width="46" height="62" fill="#fff6e0"/><path d="M1103 348c0-13 20-13 20 0" fill="none" stroke="#45457f" stroke-width="4" stroke-linecap="round"/><circle cx="1106" cy="326" r="3" fill="#45457f"/><circle cx="1120" cy="326" r="3" fill="#45457f"/></g>

        <rect x="1196" y="486" width="300" height="12" rx="3" fill="#6b4226"/>
        <rect x="1212" y="430" width="16" height="56" fill="#c8553d"/><rect x="1230" y="438" width="14" height="48" fill="#e2a23b"/><rect x="1246" y="426" width="18" height="60" fill="#2b5550"/><rect x="1266" y="442" width="12" height="44" fill="#efe6d2"/>
        <rect x="1284" y="434" width="16" height="52" fill="#45457f" transform="rotate(14 1292 486)"/>
        <path d="M1420 486l-6-30h44l-6 30z" fill="#c8623a"/>
        <path d="M1436 456c-20-30-10-52 0-60 10 8 20 30 0 60zM1436 456c-30-10-40-30-38-44 16 0 34 14 38 44zM1436 456c30-10 40-30 38-44-16 0-34 14-38 44z" fill="#4f9a5a"/>

        <rect x="1160" y="804" width="370" height="96" rx="6" fill="#6b4226"/>
        <path d="M1284 816v72M1408 816v72" stroke="#55331c" stroke-width="4"/>
        <g fill="#d9b36a"><circle cx="1270" cy="852" r="5"/><circle cx="1298" cy="852" r="5"/><circle cx="1394" cy="852" r="5"/><circle cx="1422" cy="852" r="5"/></g>
        <rect x="1330" y="778" width="30" height="26" fill="#14161b"/>
        <rect x="1190" y="580" width="310" height="200" rx="10" fill="#14161b"/>
        <g clip-path="url(#lv-tv)">
          <rect x="1202" y="592" width="286" height="176" fill="#1b3b5e"/>
          <circle cx="1268" cy="660" r="21" fill="#f1c7a3"/><path d="M1232 732c4-32 20-46 36-46s32 14 36 46z" fill="#2c3e66"/>
          <rect x="1330" y="610" width="146" height="90" rx="4" fill="#ff8a2a"/>
          ${sceneFlames(1332, 700, 142, 76, 4, 33)}
          <rect x="1418" y="616" width="52" height="22" rx="4" fill="#d21f1f"/>
          ${slot('live', (text) => fitText(text, { x: 1444, y: 632, size: 13, weight: 700, width: 44, anchor: 'middle', fill: '#fff' }))}
          <rect x="1202" y="712" width="286" height="30" fill="#d21f1f"/>
          ${slot('tv', (text) => fitText(text, { x: 1212, y: 733, size: 17, weight: 700, width: 266, fill: '#fff' }))}
          <rect x="1202" y="742" width="286" height="26" fill="#f4f4f4"/>
          ${slot('ticker', (text) => {
            // Repeated until it fills the screen, then scrolled by exactly one repeat: a seamless loop.
            const unit = `${text} · `;
            const width = textWidth(unit, { size: 15, weight: 700 });
            return `<text class="marquee" style="--w:${n(-width)}px;--t:${n(width / 44)}s" x="1212" y="761" font-family="${FONTS.sans}" font-weight="700" font-size="15" fill="#14161b">${esc(unit.repeat(Math.ceil(286 / width) + 1))}</text>`;
          })}
        </g>
        <rect x="1202" y="592" width="286" height="176" fill="#9fd4ff" class="flick" style="--o:.1"/>

        <path d="M1112 900l-8-46h52l-8 46z" fill="#c8623a"/>
        <path d="M1130 854c-6-70 0-130 4-190M1130 800c-30-20-44-50-40-80M1132 760c28-16 44-44 44-76M1132 700c-22-18-30-44-26-66" fill="none" stroke="#3c7d49" stroke-width="7" stroke-linecap="round"/>
        <g fill="#4f9a5a"><ellipse cx="1088" cy="712" rx="20" ry="34" transform="rotate(-24 1088 712)"/><ellipse cx="1178" cy="676" rx="20" ry="34" transform="rotate(26 1178 676)"/><ellipse cx="1104" cy="626" rx="18" ry="30" transform="rotate(-18 1104 626)"/><ellipse cx="1136" cy="640" rx="18" ry="34"/></g>

        <rect y="872" width="1600" height="28" fill="#efe6d2"/>
        <rect y="900" width="1600" height="500" fill="url(#lv-floor)"/>
        ${planks(34, '#2e1708')}
        <ellipse cx="830" cy="1052" rx="500" ry="96" fill="#b5533c"/>
        <ellipse cx="830" cy="1052" rx="440" ry="80" fill="none" stroke="#efd9a8" stroke-width="8"/>
        <ellipse cx="830" cy="1052" rx="340" ry="58" fill="none" stroke="#efd9a8" stroke-width="3" stroke-dasharray="14 12"/>
        ${damage()}`,
    },

    /* — Al fresco: a café terrace under a skyline that has seen better evenings — */
    street: {
      chair: 'metal', table: 'bistro', reflect: 0.45, palette: 'ember',
      eggs: { wall: null, floor: [470, 1012] },
      art: () => {
        const stripes = 20;
        const top = 840 / stripes;
        const bottom = 888 / stripes;
        let awning = '<path d="M400 524H1240L1264 594H376Z" fill="#c8372f"/>';
        for (let i = 0; i < stripes; i++) {
          const colour = i % 2 ? '#c8372f' : '#f6e7c1';
          if (i % 2 === 0) awning += `<path d="M${n(400 + top * i)} 524h${n(top)}L${n(376 + bottom * (i + 1))} 594h${n(-bottom)}Z" fill="${colour}"/>`;
          awning += `<path d="M${n(376 + bottom * i)} 593q${n(bottom / 2)} 26 ${n(bottom)} 0z" fill="${colour}"/>`;
        }
        const block = (x, y, cols, rows, seed) => {
          const r = seeded(seed);
          let out = '';
          for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
              const wx = x + i * 108;
              const wy = y + j * 134;
              const lit = r() < 0.4;
              out += `<rect x="${wx}" y="${wy}" width="62" height="86" rx="3" fill="${lit ? '#ffc766' : '#170d28'}" opacity="${lit ? 0.85 : 1}"/>`;
              if (r() < 0.3) out += sceneFlames(wx - 4, wy + 86, 70, 120, 1, seed + i * 7 + j, 'lv-3');
            }
          }
          return out;
        };
        return `
        <defs>
          <linearGradient id="st-sky" x2="0" y2="1"><stop offset="0" stop-color="#120a2a"/><stop offset=".45" stop-color="#3d1b57"/><stop offset=".8" stop-color="#c24a3a"/><stop offset="1" stop-color="#ffab4f"/></linearGradient>
          <linearGradient id="st-walk" x2="0" y2="1"><stop offset="0" stop-color="#7f7c8c"/><stop offset="1" stop-color="#4a4857"/></linearGradient>
          <linearGradient id="st-road" x2="0" y2="1"><stop offset="0" stop-color="#2d2a36"/><stop offset="1" stop-color="#121018"/></linearGradient>
          <linearGradient id="st-shop" x2="0" y2="1"><stop offset="0" stop-color="#ffd98f"/><stop offset="1" stop-color="#e0792f"/></linearGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#st-sky)"/>
        ${stars(41, 70, 0, 0, 1600, 430)}
        <circle cx="1330" cy="170" r="96" fill="url(#e-halo)" opacity=".35"/><circle cx="1330" cy="170" r="48" fill="#fff1cf" opacity=".92"/>
        ${skyline({ seed: 42, x0: -20, x1: 1620, base: 900, min: 400, max: 720, fill: '#24143f', lit: '#ffcf70', chance: 0.14, win: [9, 13], gap: [15, 19] })}
        ${sceneFlames(560, 346, 240, 170, 3, 44, 'lv-3')}
        ${skyline({ seed: 43, x0: -20, x1: 1620, base: 900, min: 270, max: 480, fill: '#33204f', lit: '#ffd98a', chance: 0.2, win: [10, 14], gap: [16, 20] })}

        <rect x="-10" y="250" width="390" height="650" fill="#3a2146"/><rect x="-10" y="250" width="390" height="16" fill="#2b1736"/>
        ${block(36, 300, 3, 3, 46)}
        <rect x="30" y="716" width="320" height="184" fill="#241230"/>
        <path d="M30 746h320M30 776h320M30 806h320M30 836h320M30 866h320" stroke="#3a2146" stroke-width="4"/>
        <rect x="1260" y="300" width="350" height="600" fill="#2f1c40"/><rect x="1260" y="300" width="350" height="16" fill="#22122f"/>
        ${block(1296, 350, 3, 4, 47)}

        <rect x="380" y="346" width="880" height="554" fill="#1f4d57"/><rect x="380" y="346" width="880" height="14" fill="#173a42"/>
        <rect x="420" y="372" width="800" height="62" rx="6" fill="#12313a"/>
        ${slot('shop', (text) => fitText(text, { x: 820, y: 416, size: 38, font: 'serif', weight: 700, spacing: 10, width: 760, anchor: 'middle', fill: '#f6e7c1' }))}
        <path d="M380 452h880" stroke="#173a42" stroke-width="5"/>
        <g fill="#173a42"><rect x="470" y="462" width="16" height="50" rx="3"/><rect x="812" y="462" width="16" height="50" rx="3"/><rect x="1154" y="462" width="16" height="50" rx="3"/></g>
        ${awning}
        <rect x="440" y="622" width="470" height="240" rx="6" fill="#efe6d2"/><rect x="452" y="634" width="446" height="216" fill="url(#st-shop)"/>
        <path d="M540 634v40M800 634v40" stroke="#5b3212" stroke-width="3"/>
        <circle cx="540" cy="686" r="34" fill="url(#e-halo)"/><circle cx="800" cy="686" r="34" fill="url(#e-halo)"/>
        <path d="M526 674h28l-6 16h-16zM786 674h28l-6 16h-16z" fill="#5b3212"/>
        <rect x="452" y="792" width="446" height="58" fill="#7a3f1a" opacity=".75"/>
        <path d="M590 792v-44h64v44zM600 748v-12h44v12" fill="#4a2410" opacity=".8"/>
        <path d="M675 634v216" stroke="#efe6d2" stroke-width="10"/>
        <rect x="960" y="606" width="196" height="294" rx="6" fill="#efe6d2"/><rect x="974" y="620" width="168" height="280" fill="#173a42"/>
        <rect x="990" y="636" width="136" height="150" rx="4" fill="url(#st-shop)" opacity=".85"/>
        <circle cx="1128" cy="806" r="8" fill="#e8b84a"/>
        ${slot('hours', (text) => fitText(text, { x: 1058, y: 724, size: 21, font: 'serif', italic: true, width: 116, anchor: 'middle', fill: '#5b3212' }))}
        <g class="crooked" style="--dir:1.6">
          <path d="M1040 652l18-18 18 18" fill="none" stroke="#2a120b" stroke-width="2"/>
          <rect x="1018" y="650" width="80" height="40" rx="5" fill="#c8372f"/>
          ${slot('door', (text) => fitText(text, { x: 1058, y: 678, size: 22, weight: 700, width: 68, anchor: 'middle', fill: '#fff8e6' }))}
        </g>

        <rect x="312" y="560" width="12" height="340" fill="#1a1422"/><rect x="290" y="430" width="56" height="140" rx="12" fill="#1a1422"/>
        <circle cx="318" cy="460" r="15" fill="#ff3b30" class="blink-led" style="--t:.9s"/>
        <circle cx="318" cy="500" r="15" fill="#ffb020" class="blink-led" style="--t:.7s;--d:-.3s"/>
        <circle cx="318" cy="540" r="15" fill="#3ddc6a" class="blink-led" style="--t:1.1s;--d:-.6s"/>
        <path d="M1466 900V410q0-36-44-36h-36" fill="none" stroke="#1a1422" stroke-width="12" stroke-linecap="round"/>
        <rect x="1352" y="364" width="56" height="18" rx="7" fill="#1a1422"/>
        <ellipse cx="1380" cy="398" rx="78" ry="44" fill="url(#e-halo)" class="flick"/>

        <rect y="900" width="1600" height="190" fill="url(#st-walk)"/>
        ${planks(48, '#2c2a36', [900, 940, 992, 1086])}
        <rect y="1086" width="1600" height="18" fill="#9a97a8"/>
        <rect y="1104" width="1600" height="296" fill="url(#st-road)"/>
        <path d="M0 1244h1600" stroke="#e8c85a" stroke-width="10" stroke-dasharray="110 90" opacity=".8"/>
        <ellipse cx="420" cy="1172" rx="70" ry="16" fill="#1c1a24" stroke="#3a3746" stroke-width="4"/>

        <path d="M1166 952l24-152h44l24 152z" fill="#2b2b33"/>
        <rect x="1186" y="816" width="52" height="104" rx="3" fill="#1c1c22" stroke="#8a5a2b" stroke-width="5"/>
        ${slot('menu', (text) => fitLines(wrapWords(text, 7, 5), { x: 1212, size: 12, weight: 700, width: 46, anchor: 'middle', fill: '#fff8e6', baseline: (i) => (i ? 844 + i * 16 : 840) }))}
        <rect x="1284" y="932" width="44" height="80" rx="8" fill="#d2301f"/><path d="M1284 934q22-30 44 0z" fill="#e2482f"/>
        <rect x="1276" y="952" width="60" height="16" rx="6" fill="#b02416"/><rect x="1278" y="1004" width="56" height="12" rx="4" fill="#b02416"/>
        <circle cx="1306" cy="982" r="7" fill="#f6d27a"/>
        <path class="dash" d="M1338 960q52-42 84 34" fill="none" stroke="#9fe0ff" stroke-width="5" stroke-linecap="round" stroke-dasharray="6 12"/>
        ${damage({ soot: false, cracks: false })}`;
      },
    },

    /* — Walnut panels, brass letters and a slide deck in freefall — */
    boardroom: {
      chair: 'office', table: 'board', reflect: 0.3, palette: 'ember',
      eggs: { wall: [1040, 296], floor: [470, 1012] },
      art: () => {
        let seams = '';
        for (let x = 160; x < 1600; x += 160) seams += `M${x} 176V872`;
        let spots = '';
        for (const x of [260, 620, 980, 1340]) {
          spots += `<path d="M${x - 26} 176L${x - 110} 640H${x + 110}L${x + 26} 176Z" fill="url(#bd-cone)"/><ellipse cx="${x}" cy="174" rx="28" ry="7" fill="#fff3d6"/>`;
        }
        return `
        <defs>
          <linearGradient id="bd-wall" x2="0" y2="1"><stop offset="0" stop-color="#2c1a12"/><stop offset="1" stop-color="#6d432a"/></linearGradient>
          <linearGradient id="bd-floor" x2="0" y2="1"><stop offset="0" stop-color="#252e52"/><stop offset="1" stop-color="#0a0e1c"/></linearGradient>
          <linearGradient id="bd-night" x2="0" y2="1"><stop offset="0" stop-color="#0b1330"/><stop offset="1" stop-color="#3f5494"/></linearGradient>
          <linearGradient id="bd-cone" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b8" stop-opacity=".42"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></linearGradient>
          <clipPath id="bd-glass"><rect x="1190" y="300" width="340" height="580"/></clipPath>
        </defs>
        <rect width="1600" height="900" fill="url(#bd-wall)"/>
        <path d="${seams}" stroke="#20120b" stroke-width="5" opacity=".75"/>
        <path d="${seams}" stroke="#9a6a45" stroke-width="2" opacity=".28" transform="translate(5 0)"/>
        <rect y="640" width="1600" height="6" fill="#c9a25a" opacity=".7"/>
        <rect width="1600" height="176" fill="#1a100b"/>
        ${spots}

        <rect x="100" y="320" width="450" height="290" rx="10" fill="#0c0c10"/><rect x="114" y="334" width="422" height="262" fill="#f7f4ee"/>
        ${slot('slide', (text) => fitText(text, { x: 136, y: 376, size: 26, weight: 700, width: 380, fill: '#1c2440' }))}
        <path d="M136 388h150" stroke="#e2330f" stroke-width="4"/>
        <g fill="#2c4a8a"><rect x="150" y="420" width="40" height="150"/><rect x="212" y="450" width="40" height="120"/><rect x="274" y="476" width="40" height="94"/><rect x="336" y="512" width="40" height="58"/></g>
        <rect x="398" y="542" width="40" height="28" fill="#e2330f"/>
        <path d="M150 570h300" stroke="#1c2440" stroke-width="3"/>
        <path d="M160 404l230 116" fill="none" stroke="#e2330f" stroke-width="6" stroke-linecap="round"/><path d="M402 526l-28 0 12-22z" fill="#e2330f"/>
        ${sceneFlames(390, 544, 56, 64, 1, 51)}
        ${slot('outlook', (text) => fitText(text, { x: 452, y: 424, size: 15, width: 76, fill: '#1c2440' }))}
        ${slot('verdict', (text) => fitText(text, { x: 452, y: 450, size: 24, weight: 700, width: 76, fill: '#1d7a3e' }))}
        <rect x="114" y="334" width="422" height="262" fill="#fff" class="flick" style="--o:.1"/>

        ${slot('brass', (text) => fitText(text, { x: 830, y: 332, size: 34, font: 'serif', weight: 700, spacing: 8, width: 310, anchor: 'middle', fill: '#d9b36a' }))}
        <path d="M700 348h260" stroke="#d9b36a" stroke-width="3" opacity=".7"/>

        <rect x="1176" y="286" width="368" height="608" fill="#17100c"/>
        <rect x="1190" y="300" width="340" height="580" fill="url(#bd-night)"/>
        <g clip-path="url(#bd-glass)">
          ${stars(52, 18, 1190, 300, 340, 220)}
          ${skyline({ seed: 53, x0: 1180, x1: 1540, base: 882, min: 200, max: 470, fill: '#17244f', lit: '#ffd98a', chance: 0.28 })}
          ${skyline({ seed: 54, x0: 1170, x1: 1540, base: 882, min: 70, max: 250, fill: '#0e1736', lit: '#fff1c2', chance: 0.22 })}
          <rect x="1190" y="300" width="340" height="580" fill="#ff6a1a" opacity=".35" class="lv-3"/>
          ${sceneFlames(1190, 884, 340, 280, 4, 55, 'lv-3')}
        </g>
        <path d="M1360 300v580M1190 590h340" stroke="#17100c" stroke-width="12"/>
        <path d="M1204 314h80l-72 120z" fill="#fff" opacity=".1"/>

        <rect x="84" y="770" width="490" height="130" rx="6" fill="#3a2217"/>
        <path d="M247 782v106M410 782v106" stroke="#24140d" stroke-width="4"/>
        <path d="M150 836h36M312 836h36M474 836h36" stroke="#c9a25a" stroke-width="6" stroke-linecap="round"/>
        <path d="M150 770v-16h-14c-2-22 6-36 6-36h36s8 14 6 36h-14v16z" fill="#d9b36a"/>
        <path d="M470 770l-6-30h40l-6 30z" fill="#e9dfc8"/>
        <path d="M484 740c-4-40 6-60 20-74M484 716c-10-10-22-12-32-8" fill="none" stroke="#3c7d49" stroke-width="4" stroke-linecap="round"/>
        <g fill="#f3a6c8"><circle cx="506" cy="664" r="10"/><circle cx="490" cy="686" r="8"/><circle cx="450" cy="706" r="8"/></g>

        <g class="lean" style="--dir:-1.4"><rect x="1096" y="606" width="124" height="262" rx="36" fill="#131726"/><rect x="1110" y="620" width="96" height="124" rx="24" fill="#1f2538"/></g>
        <g class="lean" style="--dir:2.2"><rect x="1376" y="616" width="124" height="252" rx="36" fill="#131726"/><rect x="1390" y="630" width="96" height="124" rx="24" fill="#1f2538"/></g>

        <rect y="872" width="1600" height="28" fill="#20120b"/>
        <rect y="900" width="1600" height="500" fill="url(#bd-floor)"/>
        <rect y="900" width="1600" height="12" fill="#c9a25a" opacity=".3"/>
        ${floorGrid('#3b4a80', 0.22)}
        ${damage()}`;
      },
    },

    /* — Low orbit, high temperature: portholes, consoles and a very red alert — */
    space: {
      chair: 'stool', table: 'console', reflect: 0.4, palette: 'ember',
      eggs: { wall: [452, 372], floor: [1236, 1012] },
      art: () => {
        let ribs = '';
        let rivets = '';
        for (const x of [0, 400, 800, 1200, 1600]) {
          ribs += `<rect x="${x - 20}" width="40" height="900"/>`;
          for (let y = 30; y < 880; y += 70) rivets += `<circle cx="${x}" cy="${y}" r="4.5"/>`;
        }
        let bolts = '';
        for (let i = 0; i < 12; i++) bolts += `<circle cx="${n(1300 + Math.cos(i * TAU / 12) * 188)}" cy="${n(560 + Math.sin(i * TAU / 12) * 188)}" r="6"/>`;
        let buttons = '';
        const colours = ['#ff5a3c', '#f2c230', '#57f287', '#5ff2ff'];
        const r = seeded(63);
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 4; i++) {
            buttons += `<circle cx="${452 + i * 28}" cy="${738 + j * 30}" r="9" fill="${colours[Math.floor(r() * 4)]}" class="blink-led" style="--t:${n(0.5 + r() * 1.6)}s;--d:${n(-r() * 2)}s"/>`;
          }
        }
        return `
        <defs>
          <linearGradient id="sp-hull" x2="0" y2="1"><stop offset="0" stop-color="#141c28"/><stop offset="1" stop-color="#36485f"/></linearGradient>
          <linearGradient id="sp-floor" x2="0" y2="1"><stop offset="0" stop-color="#2e3a4a"/><stop offset="1" stop-color="#0b1016"/></linearGradient>
          <radialGradient id="sp-earth" cx=".32" cy=".28" r=".95"><stop offset="0" stop-color="#7ccbff"/><stop offset=".55" stop-color="#2468c9"/><stop offset="1" stop-color="#0a2459"/></radialGradient>
          <radialGradient id="sp-alarm"><stop offset="0" stop-color="#ff3b30" stop-opacity=".75"/><stop offset="1" stop-color="#ff3b30" stop-opacity="0"/></radialGradient>
          <pattern id="sp-hazard" width="44" height="28" patternUnits="userSpaceOnUse" patternTransform="skewX(-32)"><rect width="22" height="28" fill="#f2c230"/><rect x="22" width="22" height="28" fill="#17171a"/></pattern>
          <clipPath id="sp-port"><circle cx="1300" cy="560" r="168"/></clipPath>
          <clipPath id="sp-port2"><circle cx="250" cy="470" r="88"/></clipPath>
        </defs>
        <rect width="1600" height="900" fill="url(#sp-hull)"/>
        <path d="M0 250h1600M0 770h1600" stroke="#0f1620" stroke-width="4"/>
        <g fill="#0f1620">${ribs}</g><g fill="#56697f">${rivets}</g>
        <rect y="290" width="1600" height="18" fill="#50627a"/><rect y="290" width="1600" height="5" fill="#7d93ad"/><rect y="318" width="1600" height="10" fill="#3d4d62"/>

        <circle cx="1300" cy="560" r="198" fill="#56697f"/><circle cx="1300" cy="560" r="180" fill="#27343f"/><circle cx="1300" cy="560" r="168" fill="#04070f"/>
        <g clip-path="url(#sp-port)">
          ${stars(61, 44, 1130, 390, 340, 340)}
          <circle cx="1392" cy="704" r="198" fill="#9fd8ff" opacity=".28"/>
          <circle cx="1392" cy="704" r="190" fill="url(#sp-earth)"/>
          <path d="M1290 640c22-22 52-10 60 12s-10 40 12 58 40 12 50 42-32 50-62 40-38-42-68-52-22-70 8-100z" fill="#3fae6a" opacity=".85"/>
          <g fill="#fff" opacity=".5"><ellipse cx="1310" cy="604" rx="54" ry="10"/><ellipse cx="1420" cy="660" rx="60" ry="9"/><ellipse cx="1330" cy="724" rx="40" ry="8"/></g>
          <g class="lv-3" fill="#ff7a1a"><circle cx="1320" cy="690" r="13" class="pulse" style="--t:.8s"/><circle cx="1404" cy="644" r="9" class="pulse" style="--t:1.1s"/><circle cx="1366" cy="738" r="16" class="pulse" style="--t:.6s"/></g>
          <g class="lv-4" fill="none" stroke="#ffd98a" stroke-width="5" stroke-linecap="round"><path d="M1150 420l70 42" class="pulse" style="--t:.5s"/><path d="M1260 400l50 30" class="pulse" style="--t:.7s"/></g>
        </g>
        <g fill="#27343f">${bolts}</g>
        <path d="M1182 470a150 150 0 0 1 92-72" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".16"/>

        <circle cx="250" cy="470" r="110" fill="#56697f"/><circle cx="250" cy="470" r="98" fill="#27343f"/><circle cx="250" cy="470" r="88" fill="#04070f"/>
        <g clip-path="url(#sp-port2)">
          ${stars(62, 20, 162, 382, 176, 176)}
          <circle cx="286" cy="436" r="32" fill="#d9d4c7"/><circle cx="276" cy="428" r="7" fill="#b9b3a4"/><circle cx="298" cy="446" r="5" fill="#b9b3a4"/>
        </g>

        <rect x="776" y="328" width="48" height="14" fill="#3d4d62"/><path d="M780 342a20 24 0 0 0 40 0z" fill="#ff3b30"/>
        <g class="lv-2"><ellipse cx="800" cy="376" rx="170" ry="120" fill="url(#sp-alarm)" class="pulse" style="--t:.55s"/></g>

        <path d="M70 900V700l40-56h440l40 56v200z" fill="#33445b"/><path d="M110 644h440l40 56H70z" fill="#445a76"/>
        <rect x="100" y="722" width="150" height="96" rx="8" fill="#07101a"/><rect x="270" y="722" width="150" height="96" rx="8" fill="#07101a"/>
        ${slot('hull', (text) => fitText(text, { x: 112, y: 750, size: 16, font: 'mono', weight: 700, width: 128, fill: '#57f287' }))}
        ${slot('oxygen', (text) => fitText(text, { x: 112, y: 776, size: 16, font: 'mono', weight: 700, width: 128, fill: '#ff5a3c', extra: 'class="blink-led" style="--t:.9s"' }))}
        <path d="M112 798h126" stroke="#ff5a3c" stroke-width="8" opacity=".25"/><path d="M112 798h22" stroke="#ff5a3c" stroke-width="8"/>
        <path d="M280 770h14l8-26 12 50 10-36 8 12h20l8-30 10 52 8-22h32" fill="none" stroke="#5ff2ff" stroke-width="3" stroke-linejoin="round"/>
        ${buttons}
        <path d="M100 846h440M100 866h440" stroke="#27343f" stroke-width="6" stroke-linecap="round"/>

        <g class="float" style="--t:11s;--fx:26px;--fy:18px"><path d="M-30 -5h44a14 14 0 1 1 0 10h-44z" transform="translate(1010 372) rotate(-20)" fill="#aab8c8"/></g>
        <g class="float" style="--t:13s;--d:-4s;--fx:-18px;--fy:-26px;--r0:10deg;--r1:-30deg"><rect x="540" y="424" width="56" height="9" fill="#f2c230"/><path d="M596 424l12 4.5-12 4.5z" fill="#ffe3c2"/></g>
        <g class="float" style="--t:8s;--d:-2s;--fx:10px;--fy:-16px" fill="#9fe0ff" opacity=".75"><circle cx="930" cy="455" r="9"/><circle cx="952" cy="470" r="5"/><circle cx="916" cy="476" r="3.5"/></g>

        <rect y="872" width="1600" height="28" fill="url(#sp-hazard)"/>
        <rect y="900" width="1600" height="500" fill="url(#sp-floor)"/>
        ${floorGrid('#5ff2ff', 0.16)}
        <path d="M0 962h1600" stroke="#5ff2ff" stroke-width="4" class="pulse" style="--t:1.8s;--o:.55"/>
        ${damage({ cracks: false })}`;
      },
    },

    /* — Neon, rain and a skyline on fire: the future is bright. Very bright. — */
    cyberpunk: {
      chair: 'gamer', table: 'neon', reflect: 0.6, palette: 'neon',
      eggs: { wall: null, floor: [1236, 1012] },
      art: () => {
        const r = seeded(73);
        let rain = '';
        for (let c = 0; c < 14; c++) {
          const x = 440 + c * 84 + r() * 50;
          for (let row = -1; row < 5; row++) rain += `M${n(x - row * 36)} ${n(300 + row * 120 + (c % 3) * 34)}l-9 30`;
        }
        let leds = '';
        const colours = ['#5ff2ff', '#ff4fd8', '#b6ff3a'];
        for (let j = 0; j < 8; j++) {
          for (let i = 0; i < 5; i++) {
            leds += `<rect x="${98 + i * 24}" y="${642 + j * 30}" width="14" height="6" rx="2" fill="${colours[Math.floor(r() * 3)]}" class="blink-led" style="--t:${n(0.3 + r() * 1.4)}s;--d:${n(-r() * 2)}s"/>`;
          }
        }
        const car = (y, t, d, dx, colour) => `<g class="drift" style="--t:${t}s;--d:${d}s;--dx:${dx}px"><path d="M${dx > 0 ? 380 : 1560} ${y}h${dx > 0 ? -46 : 46}" stroke="${colour}" stroke-width="3" opacity=".7"/><ellipse cx="${dx > 0 ? 396 : 1544}" cy="${y}" rx="17" ry="5" fill="#0b0618"/><circle cx="${dx > 0 ? 412 : 1528}" cy="${y}" r="3" fill="#fff6c9"/></g>`;
        return `
        <defs>
          <linearGradient id="cy-wall" x2="0" y2="1"><stop offset="0" stop-color="#0d0720"/><stop offset="1" stop-color="#2c1356"/></linearGradient>
          <linearGradient id="cy-sky" x2="0" y2="1"><stop offset="0" stop-color="#12072e"/><stop offset=".55" stop-color="#5a1a78"/><stop offset=".85" stop-color="#ff3d8b"/><stop offset="1" stop-color="#ff9a4d"/></linearGradient>
          <linearGradient id="cy-floor" x2="0" y2="1"><stop offset="0" stop-color="#1c0e38"/><stop offset="1" stop-color="#05020c"/></linearGradient>
          <linearGradient id="cy-beam" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient>
          <filter id="cy-neon" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="7"/></filter>
          <clipPath id="cy-glass"><rect x="440" y="310" width="1070" height="470"/></clipPath>
        </defs>
        <rect width="1600" height="900" fill="url(#cy-wall)"/>
        <rect width="1600" height="272" fill="#090516"/>
        <path class="rgb rgb--line" d="M0 278h1600" stroke-width="16" opacity=".6" filter="url(#cy-neon)"/>
        <path class="rgb rgb--line" d="M0 278h1600" stroke-width="5"/>

        <rect x="424" y="294" width="1102" height="502" rx="8" fill="#07040f"/>
        <rect x="440" y="310" width="1070" height="470" fill="url(#cy-sky)"/>
        <g clip-path="url(#cy-glass)">
          <path d="M640 780l-70-430 46-8zM1330 780l90-440 40 12z" fill="url(#cy-beam)"/>
          ${skyline({ seed: 71, x0: 430, x1: 1520, base: 782, min: 210, max: 450, fill: '#2a1a5e', lit: '#5ff2ff', chance: 0.12, win: [6, 16], gap: [13, 13] })}
          <circle cx="1250" cy="424" r="64" fill="#ff4fd8" opacity=".18"/>
          <circle cx="1250" cy="424" r="64" fill="none" stroke="#5ff2ff" stroke-width="4" class="flick"/>
          ${slot('holo', (text) => fitText(text, { x: 1250, y: 437, size: 34, font: 'black', weight: 900, width: 106, anchor: 'middle', fill: '#5ff2ff', extra: 'class="flick"' }))}
          ${sceneFlames(520, 470, 200, 150, 3, 74, 'lv-2')}
          ${sceneFlames(980, 430, 180, 170, 3, 75, 'lv-3')}
          ${skyline({ seed: 72, x0: 430, x1: 1520, base: 782, min: 90, max: 300, fill: '#130a2e', lit: '#ff4fd8', chance: 0.13, win: [6, 14], gap: [14, 14] })}
          <rect x="716" y="520" width="12" height="150" fill="#ff4fd8" class="flick"/><rect x="1038" y="552" width="10" height="130" fill="#5ff2ff"/><rect x="1394" y="560" width="12" height="120" fill="#b6ff3a" class="pulse" style="--t:1.3s"/>
          ${sceneFlames(600, 640, 150, 130, 2, 76, 'lv-2')}
          ${sceneFlames(1160, 610, 190, 150, 3, 77, 'lv-2')}
          ${sceneFlames(440, 784, 1070, 190, 9, 78, 'lv-4')}
          ${car(380, 17, 0, 1240, '#ff4fd8')}${car(450, 23, -9, 1240, '#5ff2ff')}${car(350, 20, -5, -1240, '#ffb347')}
          <path class="rain" d="${rain}" stroke="#bfe9ff" stroke-width="2" opacity=".28"/>
        </g>
        <path d="M800 310v470M1160 310v470" stroke="#07040f" stroke-width="14"/>
        <path d="M456 326h120l-104 170z" fill="#fff" opacity=".07"/>

        <g transform="rotate(-6 236 440)" fill="none">
          ${slot('neon', (text) => {
            const tube = { x: 236, y: 456, size: 68, font: 'script', width: 360, anchor: 'middle' };
            return fitText(text, { ...tube, extra: 'stroke="#ff4fd8" stroke-width="10" opacity=".85" filter="url(#cy-neon)"' }) +
              fitText(text, { ...tube, extra: 'stroke="#ffd1f4" stroke-width="2.5" class="flick"' });
          })}
        </g>
        <rect x="70" y="560" width="330" height="10" fill="#3a1f6e"/>
        <rect x="96" y="520" width="44" height="40" rx="4" fill="#5ff2ff" class="pulse" style="--t:2.2s;--o:.7"/>
        <rect x="160" y="530" width="70" height="30" rx="4" fill="#1b0f3a" stroke="#ff4fd8" stroke-width="2"/>
        <path d="M330 560v-30M330 536c-18-4-28-16-28-28M330 540c16-6 26-16 28-30" fill="none" stroke="#3c7d49" stroke-width="5" stroke-linecap="round"/>
        <rect x="80" y="620" width="150" height="280" rx="8" fill="#0b0618" stroke="#3a1f6e" stroke-width="3"/>
        ${leds}
        <rect x="270" y="620" width="120" height="170" fill="#1b0f3a" stroke="#5ff2ff" stroke-width="2"/>
        <circle cx="330" cy="684" r="30" fill="none" stroke="#ff4fd8" stroke-width="4"/>
        ${slot('poster', (text) => fitText(text, { x: 330, y: 762, size: 24, font: 'black', weight: 900, width: 100, anchor: 'middle', fill: '#5ff2ff' }))}
        <g fill="none" stroke="#07040f" stroke-width="6" stroke-linecap="round"><path class="sway" d="M520 270c10 60-20 90 0 150"/><path class="sway" style="--t:4.6s;--d:-2s" d="M1548 270c-12 80 16 120-4 200"/></g>

        <rect y="900" width="1600" height="500" fill="url(#cy-floor)"/>
        <g opacity=".1"><rect x="560" y="900" width="70" height="460" fill="#ff4fd8"/><rect x="900" y="900" width="110" height="460" fill="#5ff2ff"/><rect x="1230" y="900" width="60" height="460" fill="#ff4fd8"/><rect x="180" y="900" width="90" height="460" fill="#ff4fd8"/></g>
        ${floorGrid('#ff4fd8', 0.14)}
        <path class="rgb rgb--line" d="M0 898h1600" stroke-width="5"/>
        ${damage({ cracks: false })}`;
      },
    },
  };

  /* ------------------------------------------------------------------------
     05 — Art: cast
     Everything here is drawn around the character's hip (0, 0): the seat is
     at y = 0, the floor at y = 125 and every table top at y = -78. One shared
     skeleton means every character can strike every pose with every prop.
     ------------------------------------------------------------------------ */

  const CAST = { x: 640, y: 872, scale: 1.1 };
  const FLOOR_Y = 125;
  const TABLE_Y = -78;
  const OL = '#2a120b';

  const ol = (width = 5) => `stroke="${OL}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;

  /** An outlined, round-ended tube along path `d` — legs, tails, chair legs. */
  const limb = (d, colour, width, outline = 5) =>
    `<path d="${d}" fill="none" stroke="${OL}" stroke-width="${width + outline * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

  const CHAIRS = {
    wood: () => `
      ${limb('M-56 14L-62 118M76 14L82 118', '#7a4a22', 12)}
      ${limb('M-82 -4L-102 -196', '#9c6230', 16)}
      <rect x="-116" y="-204" width="30" height="76" rx="10" fill="#b5763c" ${ol()} transform="rotate(-6 -101 -166)"/>
      ${limb('M-74 14L-84 120M60 14L66 120', '#9c6230', 14)}
      <rect x="-92" y="-4" width="176" height="20" rx="9" fill="#b5763c" ${ol()}/>`,
    office: () => `
      ${limb('M0 16V84', '#8b959e', 10)}
      ${limb('M0 86L-72 112M0 86L72 112M0 86V114', '#39424a', 10)}
      <g fill="#20262c" ${ol(4)}><circle cx="-74" cy="116" r="9"/><circle cx="74" cy="116" r="9"/><circle cx="0" cy="118" r="9"/></g>
      <g transform="rotate(-5 -99 -116)"><rect x="-116" y="-222" width="34" height="212" rx="16" fill="#39424a" ${ol()}/><rect x="-108" y="-208" width="10" height="150" rx="5" fill="#56626d"/></g>
      <rect x="-96" y="-8" width="184" height="26" rx="12" fill="#39424a" ${ol()}/>`,
    metal: () => `
      ${limb('M-52 12L-58 118M72 12L78 118', '#6f7682', 6, 4)}
      ${limb('M-80 -2C-96 -70 -96 -150 -78 -190', '#aab2bd', 8, 4)}
      <path d="M-91 -110h13M-92 -146h15" stroke="${OL}" stroke-width="5" stroke-linecap="round"/>
      ${limb('M-72 12L-82 120M58 12L64 120', '#aab2bd', 8, 4)}
      <rect x="-88" y="-4" width="170" height="16" rx="8" fill="#c8372f" ${ol()}/>`,
    stool: () => `
      <path d="M-26 14h52l10 96h-72z" fill="#50627a" ${ol()}/>
      <rect x="-58" y="108" width="116" height="16" rx="6" fill="#33445b" ${ol()}/>
      <path d="M-30 54h60" stroke="#5ff2ff" stroke-width="5" stroke-linecap="round" class="pulse"/>
      <rect x="-112" y="-150" width="26" height="150" rx="12" fill="#50627a" ${ol()} transform="rotate(-4 -99 -75)"/>
      <rect x="-92" y="-6" width="178" height="22" rx="10" fill="#7d93ad" ${ol()}/>`,
    gamer: () => `
      ${limb('M0 16V84', '#3a1f6e', 10)}
      ${limb('M0 86L-72 112M0 86L72 112M0 86V114', '#1b0f3a', 10)}
      <g fill="#0b0618" ${ol(4)}><circle cx="-74" cy="116" r="9"/><circle cx="74" cy="116" r="9"/><circle cx="0" cy="118" r="9"/></g>
      <path d="M-84 -6L-96 -150C-100 -196 -132 -236 -112 -250C-92 -262 -70 -236 -72 -200L-64 -6Z" fill="#1b0f3a" ${ol()}/>
      <path class="rgb rgb--line" d="M-92 -20L-104 -150C-108 -190 -124 -222 -112 -240" stroke-width="5" stroke-linecap="round"/>
      <rect x="-96" y="-8" width="184" height="26" rx="12" fill="#1b0f3a" ${ol()}/>
      <path class="rgb rgb--line" d="M-80 12h152" stroke-width="4" stroke-linecap="round"/>`,
  };

  const TABLES = {
    round: () => `
      <ellipse cx="270" cy="118" rx="76" ry="12" fill="#7a4a22" ${ol()}/>
      <rect x="258" y="-62" width="24" height="180" fill="#9c6230" ${ol()}/>
      <path d="M118 -78v12a152 20 0 0 0 304 0v-12z" fill="#9c6230" ${ol()}/>
      <ellipse cx="270" cy="-78" rx="152" ry="20" fill="#c98a4b" ${ol()}/>
      <ellipse cx="236" cy="-82" rx="80" ry="7" fill="#fff" opacity=".16"/>`,
    bistro: () => `
      <ellipse cx="270" cy="118" rx="70" ry="11" fill="#2b2b33" ${ol()}/>
      <rect x="262" y="-62" width="16" height="180" fill="#3a3a45" ${ol()}/>
      <path d="M130 -78v8a140 18 0 0 0 280 0v-8z" fill="#3a3a45" ${ol()}/>
      <ellipse cx="270" cy="-78" rx="140" ry="18" fill="#f1ece4" ${ol()}/>
      <ellipse cx="240" cy="-82" rx="70" ry="6" fill="#fff" opacity=".5"/>`,
    desk: () => `
      <rect x="384" y="-52" width="18" height="176" fill="#aab4bc" ${ol()}/>
      <rect x="296" y="-52" width="92" height="104" rx="4" fill="#dfe5e9" ${ol()}/>
      <path d="M316 -24h52M316 16h52" stroke="#8b959e" stroke-width="6" stroke-linecap="round"/>
      <path d="M106 -64h318v14H106z" fill="#c4ccd3" ${ol()}/>
      <path d="M136 -96h306l-18 32H106z" fill="#f4f7f9" ${ol()}/>`,
    board: () => `
      <path d="M250 -50h70l14 174h-98zM760 -50h70l14 174h-98z" fill="#24140d" ${ol()}/>
      <path d="M104 -64h1000v16H104z" fill="#2c1a12" ${ol()}/>
      <path d="M140 -98h1000l-36 34H104z" fill="#5a3524" ${ol()}/>
      <path d="M190 -90h420l-12 12H178zM650 -92h120l-8 8H642z" fill="#fff" opacity=".1"/>
      <path d="M520 -76l26-12 34 12-30 12z" fill="#1f2538" ${ol(4)}/><circle cx="550" cy="-76" r="4" fill="#57f287" class="blink-led"/>
      <path d="M690 -72l-6-30h30l-6 30z" fill="#eaf2f6" fill-opacity=".4" ${ol(3)}/>`,
    console: () => `
      <path d="M236 -52h68l22 176h-112z" fill="#33445b" ${ol()}/>
      <path d="M108 -66h316v16H108z" fill="#50627a" ${ol()}/>
      <path d="M120 -58h292" stroke="#5ff2ff" stroke-width="4" stroke-linecap="round" class="pulse" style="--t:1.4s"/>
      <path d="M138 -96h304l-18 30H108z" fill="#8fa3bb" ${ol()}/>
      <path d="M176 -90h150l-8 12H166z" fill="#fff" opacity=".2"/>`,
    neon: () => `
      ${limb('M150 -50L138 122M392 -50L404 122', '#1b0f3a', 8, 4)}
      <path d="M108 -66h316v12H108z" fill="#0b0618" ${ol()}/>
      <path class="rgb rgb--line" d="M116 -60h300" stroke-width="5" stroke-linecap="round"/>
      <path d="M138 -96h304l-18 30H108z" fill="#2a1a5e" ${ol()}/>
      <path d="M170 -90h180l-8 12H160z" fill="#ff4fd8" opacity=".24"/>`,
  };

  const steam = (y) => `<g class="steam" transform="translate(0 ${y})"><path d="M-12 0c-8-12 8-20 0-34"/><path d="M2 -4c-8-12 8-22 0-38" style="--d:-.9s"/><path d="M15 0c-8-12 8-20 0-34" style="--d:-1.7s"/></g>`;

  /** Drinks stand on their own origin. `grip` is where a hand holds them, relative to that origin. */
  const DRINKS = {
    coffee: {
      grip: [-25, -30],
      art: () => `
        ${limb('M24 -46C50 -50 52 -14 22 -16', '#fbf6ee', 6, 4.5)}
        <path d="M-27 -58L-24 -7Q-23 0 -16 0H16Q23 0 24 -7L27 -58Z" fill="#fbf6ee" ${ol()}/>
        <path d="M12 -54L10 -4Q20 -4 21 -10L24 -54Z" fill="#d9cdbd" opacity=".7"/>
        <ellipse cx="0" cy="-58" rx="27" ry="7" fill="#3b2415" ${ol(4)}/>
        <ellipse cx="-6" cy="-59" rx="10" ry="2.5" fill="#7a5233" opacity=".8"/>
        ${steam(-68)}`,
    },
    tea: {
      grip: [-29, -26],
      art: () => `
        <ellipse cx="0" cy="-4" rx="42" ry="8" fill="#f4efe6" ${ol()}/>
        ${limb('M27 -36C44 -38 44 -16 20 -16', '#f4efe6', 5, 4)}
        <path d="M-30 -42C-30 -16 -14 -6 0 -6C14 -6 30 -16 30 -42Z" fill="#f4efe6" ${ol()}/>
        <path d="M-27 -30C-18 -24 18 -24 27 -30" fill="none" stroke="#5c8fd6" stroke-width="4"/>
        <ellipse cx="0" cy="-42" rx="30" ry="6.5" fill="#b5651d" ${ol(4)}/>
        <g class="sway" style="--t:2.6s"><path d="M-16 -42C-30 -46 -36 -32 -36 -22" fill="none" stroke="#fbf6ee" stroke-width="2"/><rect x="-44" y="-22" width="16" height="16" fill="#ffe36b" ${ol(3)}/></g>
        ${steam(-52)}`,
    },
    cocoa: {
      grip: [-23, -32],
      art: () => `
        ${limb('M22 -50C48 -54 50 -16 20 -18', '#c0392b', 6, 4.5)}
        <path d="M-25 -62L-22 -7Q-21 0 -14 0H14Q21 0 22 -7L25 -62Z" fill="#c0392b" ${ol()}/>
        <path d="M-24 -40h48l-1 14h-46z" fill="#fbf6ee"/>
        <path d="M-10 -37l5 5 5-5 5 5 5-5" fill="none" stroke="#c0392b" stroke-width="2.5"/>
        <path d="M-27 -62C-30 -76 -14 -80 -10 -72C-8 -86 12 -86 12 -72C20 -80 32 -72 27 -62Z" fill="#fffaf2" ${ol(4)}/>
        <rect x="-12" y="-82" width="12" height="10" rx="3" fill="#ffd1dc" ${ol(3)} transform="rotate(-14 -6 -77)"/>
        <rect x="4" y="-80" width="12" height="10" rx="3" fill="#fff" ${ol(3)} transform="rotate(12 10 -75)"/>
        ${steam(-90)}`,
    },
    energy: {
      grip: [-13, -38],
      art: () => `
        <ellipse cx="0" cy="-40" rx="46" ry="56" fill="url(#c-volt)" class="pulse" style="--t:.9s"/>
        <rect x="-17" y="-78" width="34" height="78" rx="6" fill="#12161b" ${ol()}/>
        <path d="M-17 -60h34v8h-34zM-17 -14h34v6h-34z" fill="#b6ff3a"/>
        <path d="M4 -48l-12 16h8l-4 14 13-18h-8z" fill="#b6ff3a"/>
        <ellipse cx="0" cy="-78" rx="17" ry="4.5" fill="#c9d1d9" ${ol(4)}/>
        <ellipse cx="2" cy="-79" rx="6" ry="1.8" fill="#12161b"/>
        <g fill="#b6ff3a"><circle class="fizz" cx="-6" cy="-84" r="2.5"/><circle class="fizz" cx="6" cy="-86" r="2" style="--d:-.5s"/><circle class="fizz" cx="0" cy="-82" r="1.8" style="--d:-.9s"/></g>`,
    },
    wine: {
      grip: [-5, -26],
      art: () => `
        <ellipse cx="0" cy="-3" rx="22" ry="5" fill="#eaf2f6" ${ol(4)}/>
        ${limb('M0 -6V-44', '#eaf2f6', 3.5, 3.5)}
        <path d="M-25 -96C-27 -62 -12 -44 0 -44C12 -44 27 -62 25 -96Z" fill="#eaf2f6" fill-opacity=".34" ${ol(4)}/>
        <g class="slosh"><path d="M-24 -76C-21 -56 -10 -47 0 -47C10 -47 21 -56 24 -76Z" fill="#8e1b3a"/><ellipse cx="0" cy="-76" rx="24" ry="5" fill="#b52b52"/></g>
        <path d="M-16 -90C-18 -76 -14 -62 -8 -56" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
    },
  };

  const BOOK_TITLES = ['FIRE SAFETY BASICS', 'HOW TO STAY CALM', 'THE ART OF DENIAL', 'IGNORING THINGS VOL. 2', 'COOKING WITH FIRE', 'INNER PEACE 101'];

  const heart = 'M0 0c-6-8-16-2-12 6c2 5 8 8 12 12c4-4 10-7 12-12c4-8-6-14-12-6z';

  /** Timing for something that floats up and fades (`.rise`): `phase` (0–1) is where in the cycle it starts. */
  const rising = (seconds, phase, drift) => `--t:${seconds}s;--d:${n(-seconds * phase, 2)}s;--p:${phase};--rx:${drift}px`;

  /** A notification bubble, centred on `cx`, that grows with its label (up to a point). */
  const pill = (id, cx, y, min, fill, ink, style) => slot(id, (label) => {
    const type = { size: 11, weight: 700 };
    const w = clamp(textWidth(label, type) + 13, min, 100);
    return `<g class="rise" style="${style}"><rect x="${n(cx - w / 2)}" y="${y}" width="${n(w)}" height="20" rx="10" fill="${fill}" ${ol(3)}/>` +
      `${fitText(label, { ...type, x: cx, y: y + 14, width: w - 12, anchor: 'middle', fill: ink })}</g>`;
  });

  /** Activity props, each drawn around its own origin. */
  const PROPS = {
    laptop: () => `
      <path class="screen-glow" d="M56 -12L92 -108L-60 -150L-96 -40Z" fill="url(#c-screen)"/>
      <path d="M-70 -7H60L70 0H-76Z" fill="#c9d1d9" ${ol()}/>
      <path d="M-58 -7H50" stroke="#8b959e" stroke-width="3" stroke-dasharray="5 4"/>
      <path d="M58 -7H67L103 -108L94 -110Z" fill="#aeb8c2" ${ol()}/>
      ${pill('mail1', 47, -150, 58, '#e2330f', '#fff', rising(5, 0, -10))}
      ${pill('mail2', 12, -140, 76, '#fbfdff', '#26323d', rising(5, 0.34, 14))}
      ${pill('mail3', 53, -132, 46, '#f2c230', '#26323d', rising(5, 0.68, 2))}`,
    book: () => `
      <path d="M-45 -50h9v104h-9z" fill="#fbf6ee" ${ol(4)}/>
      <rect x="-38" y="-54" width="80" height="108" rx="5" fill="#2f6d5e" ${ol()}/>
      <path d="M-29 -52v104" stroke="#1f4d42" stroke-width="5"/>
      <rect x="-21" y="-42" width="56" height="48" rx="3" fill="none" stroke="#f6e7c1" stroke-width="2"/>
      ${slot('book', (title) => {
        const lines = wrapWords(title, 8, 3);
        return fitLines(lines, { x: 7, size: 10.5, font: 'serif', weight: 700, width: 50, anchor: 'middle', fill: '#f6e7c1', baseline: centred(-18, 10.5, 13, lines.length) });
      })}
      <path d="${flamePath(22, 30)}" transform="translate(7 44)" fill="#ff8a2a"/>`,
    phone: () => `
      <path class="screen-glow" d="M-16 -30L-92 -58L-98 46L-16 30Z" fill="url(#c-screen)"/>
      <rect x="-17" y="-34" width="34" height="68" rx="8" fill="#e2482f" ${ol()}/>
      <rect x="-10" y="-27" width="15" height="17" rx="4" fill="${OL}"/><circle cx="-5" cy="-22" r="2.5" fill="#6fc3ff"/><circle cx="0" cy="-16" r="2" fill="#6fc3ff"/>
      <g class="rise" style="${rising(3.6, 0, -12)}"><path d="${heart}" transform="translate(-6 -54) scale(.8)" fill="#ff4f7a" ${ol(3)}/></g>
      <g class="rise" style="${rising(3.6, 0.36, 10)}"><path d="${flamePath(18, 26)}" transform="translate(8 -44)" fill="#ff8a2a" ${ol(3)}/></g>
      <g class="rise" style="${rising(3.6, 0.67, -2)}"><path d="${heart}" transform="translate(2 -50) scale(.6)" fill="#ff4f7a" ${ol(3)}/></g>`,
    controller: () => `
      <g class="rumble">
        <path d="M-44 -14H44C58 -14 62 8 56 20C50 30 38 26 32 14H-32C-38 26 -50 30 -56 20C-62 8 -58 -14 -44 -14Z" fill="#2b2f3a" ${ol()}/>
        <path d="M-34 -4v12M-40 2h12" stroke="#c9d1d9" stroke-width="4" stroke-linecap="round"/>
        <circle cx="30" cy="-4" r="4" fill="#5ff2ff"/><circle cx="38" cy="4" r="4" fill="#ff4fd8"/><circle cx="22" cy="4" r="4" fill="#b6ff3a"/><circle cx="30" cy="12" r="4" fill="#f2c230"/>
        <path class="rgb rgb--line" d="M-12 -9h24" stroke-width="4" stroke-linecap="round"/>
      </g>`,
    /*
     * The monitor is turned towards the player on the left and seen three-quarters on from
     * slightly above, so its far (left) edge is the short one and both long edges fall away
     * to the right. The picture is laid out flat on a 160 × 104 screen and mapped onto that
     * slanted panel twice: once hung from the top edge (the HUD) and once standing on the
     * bottom edge (floor grid, flames, light strip). The clip path trims the difference.
     */
    monitor: () => `
      <defs><clipPath id="c-game"><path d="M-53 -146L33 -139V-35L-53 -50Z"/></clipPath></defs>
      <ellipse class="screen-glow" cx="-62" cy="2" rx="84" ry="10" fill="url(#c-spill)"/>
      <ellipse cx="8" cy="-2" rx="40" ry="7" fill="#20262c" ${ol(4)}/>
      <path d="M1 -4V-42H15V-4Z" fill="#20262c" ${ol(4)}/>
      <path class="screen-glow" d="M-58 -148L-196 -176L-210 -10L-58 -48Z" fill="url(#c-screen)"/>
      <path d="M38 -146L51 -148.5V-28L38 -24Z" fill="#0b0d11" ${ol()}/>
      <path d="M-58 -152L38 -146V-24L-58 -42Z" fill="#1b1f27" ${ol()}/>
      <path d="M-53 -146L33 -139V-35L-53 -50Z" fill="#12072e"/>
      <g clip-path="url(#c-game)">
        <g transform="matrix(.5375 .0938 0 1 -53 -50)">
          <path d="M0 -46h160M0 -31h160M0 -16h160M40 -46L0 0M80 -46V0M120 -46L160 0" stroke="#ff4fd8" stroke-width="1.5" opacity=".7"/>
          ${sceneFlames(0, 0, 160, 38, 6, 91, '', 'c')}
        </g>
        <g transform="matrix(.5375 .0438 0 1 -53 -146)">
          ${slot('game1', (text) => fitText(text, { x: 80, y: 29, size: 20, font: 'mono', weight: 700, width: 142, anchor: 'middle', fill: '#5ff2ff' }))}
          ${slot('game2', (text) => fitText(text, { x: 80, y: 49, size: 16, font: 'mono', weight: 700, width: 142, anchor: 'middle', fill: '#b6ff3a', extra: 'class="blink-led" style="--t:.8s"' }))}
        </g>
        <path d="M-53 -146L-18 -143L-53 -92Z" fill="#fff" opacity=".1"/>
      </g>
      <g transform="matrix(.5375 .0938 0 1 -53 -50)"><path class="rgb rgb--line" d="M4 4h152" stroke-width="3" stroke-linecap="round"/></g>`,
  };

  const SHOULDER = { near: [20, -150], far: [46, -146] };
  const ARM = { upper: 84, fore: 84 };
  const HEAD = [28, -262];

  const HANDS = {
    paw: (c) => `<circle r="19" fill="${c}" ${ol()}/><path d="M7 -9v9M14 -4v8" fill="none" ${ol(3)}/>`,
    hand: (c) => `<path d="M-6 -14q12 -10 15 3" fill="${c}" ${ol(4)}/><circle r="17" fill="${c}" ${ol()}/>`,
    claw: (c) => `${limb('M4 -9C24 -22 36 -8 27 -1M4 9C24 22 36 8 27 1', c, 5, 3.5)}<circle r="13" fill="${c}" ${ol(4)}/>`,
    tri: (c) => `<g fill="${c}" ${ol(4)}><ellipse cx="16" cy="-12" rx="11" ry="6.5" transform="rotate(-28 16 -12)"/><ellipse cx="20" cy="0" rx="11" ry="6.5"/><ellipse cx="16" cy="12" rx="11" ry="6.5" transform="rotate(28 16 12)"/><circle r="14"/></g>`,
  };

  /** A bead of sweat. `fly` sends it off the head instead of rolling down the face. */
  const sweat = (x, y, delay = 0, fly = false) =>
    `<g transform="translate(${x} ${y})"><path class="sweat${fly ? ' sweat--fly' : ''}" style="--d:${delay}s" d="M0 -9C7 2 9 8 0 13C-9 8 -7 2 0 -9Z" fill="#bfe9ff" ${ol(3)}/></g>`;

  const lensFire = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="lens-fire" d="${flamePath(14, 20)}" fill="#ff9a2e"/></g>`;

  /**
   * Characters share one skeleton; each supplies its own parts and colours.
   * `arm.near` / `arm.far` colour the two arms, `arm.hand` picks a hand style.
   */
  const CHARACTERS = {
    dog: {
      arm: { w: 32, hand: 'paw', near: ['#f3b541', '#f3b541', '#ffe2a0'], far: ['#d3922a', '#d3922a', '#eecb85'] },
      tail: () => `<g transform="translate(-52 -22)"><g class="wag">${limb('M0 0C-30 -6 -54 -30 -58 -62', '#f3b541', 20)}</g></g>`,
      legFar: () => `${limb('M22 -30L126 -34L134 84', '#d3922a', 40)}<ellipse cx="152" cy="104" rx="32" ry="17" fill="#eecb85" ${ol()}/>`,
      legNear: () => `${limb('M4 -24L112 -26L120 86', '#f3b541', 42)}<ellipse cx="140" cy="107" rx="34" ry="18" fill="#ffe2a0" ${ol()}/><path d="M152 100v10M164 102v8" fill="none" ${ol(3)}/>`,
      torso: () => `
        <path d="M-60 4C-76 -52 -66 -132 -36 -166C-14 -190 40 -190 58 -164C82 -128 84 -58 70 4Z" fill="#f3b541" ${ol()}/>
        <path d="M24 -168C62 -150 74 -70 60 0H18C36 -52 38 -110 24 -168Z" fill="#ffe2a0" opacity=".9"/>`,
      head: () => `
        <path d="M34 -66C60 -92 90 -70 82 -34C70 -46 52 -56 34 -66Z" fill="#a05a1c" ${ol()}/>
        <ellipse cx="0" cy="0" rx="82" ry="78" fill="#f3b541" ${ol()}/>
        <path d="M28 2C40 -22 98 -24 116 4C130 26 112 60 76 62C46 64 22 48 20 28C20 16 24 8 28 2Z" fill="#ffe2a0" ${ol()}/>
        <ellipse cx="111" cy="8" rx="14" ry="10.5" fill="${OL}"/><ellipse cx="107" cy="5" rx="4.5" ry="2.5" fill="#fff" opacity=".6"/>
        <path d="M62 40Q86 54 110 36" fill="none" ${ol(4)}/>
        <g class="eye"><ellipse cx="68" cy="-36" rx="18" ry="22" fill="#fff" ${ol(4)}/><circle cx="74" cy="-34" r="5.5" fill="${OL}"/></g>
        <g class="eye eye--near"><ellipse cx="24" cy="-32" rx="21" ry="25" fill="#fff" ${ol(4)}/><circle cx="32" cy="-30" r="6.5" fill="${OL}"/></g>
        <path class="ear" d="M-40 -62C-88 -66 -106 -6 -86 36C-72 50 -54 34 -52 4C-50 -22 -34 -40 -40 -62Z" fill="#a05a1c" ${ol()}/>
        <g class="hat"><g transform="rotate(-10)">
          <path d="M-40 -74C-42 -126 38 -130 40 -76Z" fill="#25242c" ${ol()}/>
          <ellipse cx="0" cy="-74" rx="60" ry="11" fill="#25242c" ${ol()}/>
          <path d="M-38 -86C-18 -79 20 -79 39 -88" fill="none" stroke="#c0392b" stroke-width="7"/>
        </g></g>
        ${sweat(-52, -40)}${sweat(98, -52, -1.4, true)}`,
    },

    cat: {
      arm: { w: 30, hand: 'paw', near: ['#9aa7bd', '#9aa7bd', '#f4f1ec'], far: ['#7d8aa3', '#7d8aa3', '#dcd8d2'] },
      tail: () => `<g transform="translate(-50 -16)"><g class="swish">
        ${limb('M0 0C-50 10 -92 -20 -84 -72C-80 -102 -100 -118 -118 -106', '#9aa7bd', 18)}
        <path d="M-68 -7L-59 -18M-91 -49L-77 -51M-97.5 -100L-88 -110" fill="none" stroke="#5f6b84" stroke-width="6" stroke-linecap="round"/></g></g>`,
      legFar: () => `${limb('M22 -30L126 -34L134 84', '#7d8aa3', 38)}<ellipse cx="150" cy="104" rx="30" ry="16" fill="#dcd8d2" ${ol()}/>`,
      legNear: () => `${limb('M4 -24L112 -26L120 86', '#9aa7bd', 40)}<ellipse cx="138" cy="107" rx="32" ry="17" fill="#f4f1ec" ${ol()}/><path d="M150 100v10M162 102v8" fill="none" ${ol(3)}/>`,
      torso: () => `
        <path d="M-58 4C-74 -52 -64 -132 -34 -166C-14 -188 38 -188 56 -164C78 -128 80 -58 68 4Z" fill="#9aa7bd" ${ol()}/>
        <path d="M24 -160C58 -144 68 -70 56 0H16C34 -52 36 -106 24 -160Z" fill="#f4f1ec" opacity=".92"/>
        ${limb('M-28 -166C-4 -152 34 -152 54 -166', '#d6453d', 9, 4)}
        <circle cx="18" cy="-146" r="9" fill="#f2c230" ${ol(4)}/><path d="M18 -146v6" ${ol(3)}/>`,
      head: () => `
        <path d="M28 -58L64 -124L86 -46Z" fill="#7d8aa3" ${ol()}/><path d="M48 -64L64 -102L74 -56Z" fill="#e98a98"/>
        <path d="M-66 -38L-52 -122L-4 -68Z" fill="#9aa7bd" ${ol()}/><path d="M-54 -52L-47 -100L-22 -70Z" fill="#e98a98"/>
        <path d="M-70 10l-28 22 30 8zM78 26l22 18-26 6z" fill="#9aa7bd" ${ol()}/>
        <ellipse cx="0" cy="0" rx="84" ry="72" fill="#9aa7bd" ${ol()}/>
        <path d="M-16 -68l4 20M4 -71l1 22M24 -69l-3 20" fill="none" stroke="#5f6b84" stroke-width="7" stroke-linecap="round"/>
        <path d="M40 6C52 -8 92 -8 104 8C112 24 100 44 72 44C48 44 34 26 40 6Z" fill="#f4f1ec" ${ol()}/>
        <path d="M84 4h16l-8 10z" fill="#e98a98" ${ol(3)}/>
        <path d="M92 14v7M92 21q-8 10-16 2M92 21q8 10 15 2" fill="none" ${ol(3)}/>
        <path d="M102 18l34-8M102 25l36 3M58 22l-42-8M58 29l-44 5" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/>
        <g class="eye"><ellipse cx="68" cy="-20" rx="16" ry="16" fill="#dfe88a" ${ol(4)}/><ellipse cx="71" cy="-20" rx="3.5" ry="11" fill="${OL}"/><path d="M50 -22C56 -42 82 -42 86 -22C78 -30 60 -30 50 -22Z" fill="#9aa7bd" ${ol(4)}/></g>
        <g class="eye eye--near"><ellipse cx="22" cy="-16" rx="21" ry="18" fill="#dfe88a" ${ol(4)}/><ellipse cx="26" cy="-16" rx="4.5" ry="13" fill="${OL}"/><path d="M-1 -18C6 -42 40 -42 46 -18C36 -28 10 -28 -1 -18Z" fill="#9aa7bd" ${ol(4)}/></g>
        ${sweat(-56, -34)}${sweat(100, -40, -1.4, true)}`,
    },

    human: {
      arm: { w: 30, hand: 'hand', near: ['#eef2f6', '#e3a57b', '#e3a57b'], far: ['#cfd6de', '#c98c64', '#c98c64'] },
      tail: () => '',
      legFar: () => `${limb('M22 -30L126 -34L134 84', '#232a44', 38)}<path d="M112 100q4-18 28-16l34 12q14 8 6 22H114z" fill="#2a1a14" ${ol()}/>`,
      legNear: () => `${limb('M4 -24L112 -26L120 86', '#2f3757', 40)}<path d="M98 104q4-20 30-18l36 12q16 8 8 24H100z" fill="#3a241b" ${ol()}/>`,
      torso: () => `
        <path d="M-58 4C-72 -52 -64 -132 -34 -166C-14 -188 38 -188 56 -164C78 -128 80 -58 68 4Z" fill="#eef2f6" ${ol()}/>
        <path d="M30 -176C64 -150 76 -70 62 0H40C56 -60 54 -120 30 -176Z" fill="#cfd6de" opacity=".8"/>
        <path d="M2 -182l22 26 20-24" fill="#fff" ${ol(4)}/>
        <g transform="rotate(7 24 -160)"><path d="M17 -160h14l-2 12h-10z" fill="#c8372f" ${ol(4)}/><path d="M19 -148h10l8 62-11 14-12-14z" fill="#c8372f" ${ol(4)}/></g>
        <rect x="-36" y="-108" width="34" height="44" rx="4" fill="#fbfdff" ${ol(3)}/><rect x="-30" y="-102" width="22" height="14" rx="2" fill="#e3a57b"/>
        <path d="M-30 -82h22M-30 -74h14" stroke="#8b959e" stroke-width="3" stroke-linecap="round"/>
        <path d="M-19 -108C-22 -140 -8 -170 6 -180" fill="none" stroke="#2c4a8a" stroke-width="3"/>`,
      head: () => `
        <path d="M-12 58L-8 96H36L32 58Z" fill="#e3a57b" ${ol()}/>
        <path d="M-74 -8C-78 -64 -30 -92 12 -88C56 -84 82 -52 80 -10C80 0 88 14 86 22C84 30 76 30 74 34C74 52 60 74 26 78C-14 82 -52 62 -66 30C-72 16 -74 4 -74 -8Z" fill="#e3a57b" ${ol()}/>
        <ellipse cx="-36" cy="8" rx="13" ry="18" fill="#e3a57b" ${ol()}/><path d="M-40 2q8 4 4 14" fill="none" ${ol(3)}/>
        <path d="M-78 -4C-90 -70 -34 -110 20 -100C66 -94 94 -60 82 -24C70 -48 40 -62 6 -58C-22 -56 -44 -40 -48 -12C-50 2 -56 10 -62 12C-72 12 -78 6 -78 -4Z" fill="#33241f" ${ol()}/>
        <path d="M-8 -100C-6 -122 20 -126 14 -104" fill="none" stroke="${OL}" stroke-width="15" stroke-linecap="round"/><path d="M-8 -100C-6 -122 20 -126 14 -104" fill="none" stroke="#33241f" stroke-width="7" stroke-linecap="round"/>
        <path d="M10 -42l30 -4M58 -46l26 4" fill="none" stroke="#33241f" stroke-width="5" stroke-linecap="round"/>
        <path d="M18 6q10 6 20 0M64 2q8 5 16 0" fill="none" stroke="#c98c64" stroke-width="3" stroke-linecap="round"/>
        <g class="eye"><circle cx="74" cy="-16" r="4.5" fill="${OL}"/></g>
        <g class="eye eye--near"><circle cx="30" cy="-12" r="5" fill="${OL}"/></g>
        <path d="M36 42Q54 54 72 40" fill="none" ${ol(4)}/>
        <circle cx="26" cy="-12" r="23" fill="#fff" fill-opacity=".2" stroke="#1d1d26" stroke-width="5"/>
        <circle cx="72" cy="-16" r="19" fill="#fff" fill-opacity=".2" stroke="#1d1d26" stroke-width="5"/>
        <path d="M49 -15q2 -6 4 -1M3 -14L-34 -2" fill="none" stroke="#1d1d26" stroke-width="5" stroke-linecap="round"/>
        ${lensFire(18, 6)}${lensFire(66, 0, 0.85)}
        ${sweat(-52, -36)}${sweat(96, -40, -1.4, true)}`,
    },

    robot: {
      arm: { w: 26, hand: 'claw', near: ['#8e9cab', '#c3ced8', '#c3ced8'], far: ['#6b7887', '#93a1af', '#93a1af'] },
      tail: () => '',
      legFar: () => `${limb('M22 -30L126 -34L134 84', '#6b7887', 32)}<rect x="116" y="88" width="70" height="34" rx="14" fill="#93a1af" ${ol()}/>`,
      legNear: () => `${limb('M4 -24L112 -26L120 86', '#8e9cab', 34)}<circle cx="112" cy="-26" r="10" fill="#c3ced8" ${ol(4)}/><rect x="102" y="90" width="74" height="35" rx="14" fill="#c3ced8" ${ol()}/>`,
      torso: () => `
        <rect x="10" y="-196" width="30" height="30" fill="#6b7887" ${ol()}/>
        <rect x="-64" y="-176" width="140" height="182" rx="30" fill="#c3ced8" ${ol()}/>
        <path d="M46 -172C70 -166 74 -150 74 -120V-20C74 -6 66 2 46 4Z" fill="#93a1af" opacity=".7"/>
        <rect x="-4" y="-140" width="64" height="76" rx="10" fill="#22303c" ${ol(4)}/>
        <circle cx="16" cy="-116" r="13" fill="#0f1c26" stroke="#5ff2ff" stroke-width="2.5"/>
        <g transform="translate(16 -116)"><path class="sway" style="--t:.5s" d="M0 0V10" stroke="#ff5a3c" stroke-width="3" stroke-linecap="round"/></g>
        <circle cx="42" cy="-124" r="5" fill="#57f287" class="blink-led" style="--t:1.6s"/><circle cx="42" cy="-108" r="5" fill="#f2c230" class="blink-led" style="--t:.9s"/><g class="lv-3"><circle cx="42" cy="-92" r="5" fill="#ff5a3c" class="blink-led" style="--t:.4s"/></g>
        <path d="M4 -82h22M4 -74h22" stroke="#5ff2ff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
        <path d="M-46 -140h24M-46 -126h24M-46 -112h24" stroke="#8e9cab" stroke-width="5" stroke-linecap="round"/>
        <g fill="#8e9cab"><circle cx="-50" cy="-160" r="4"/><circle cx="62" cy="-160" r="4"/><circle cx="-50" cy="-12" r="4"/><circle cx="62" cy="-12" r="4"/></g>`,
      head: () => `
        <path d="M0 -66V-104" fill="none" ${ol()}/><circle cx="0" cy="-110" r="10" fill="#ff5a3c" ${ol(4)}/><circle cx="0" cy="-110" r="10" fill="#fff" class="blink-led" style="--t:1s;--o:.5"/>
        <circle cx="-78" cy="-2" r="16" fill="#8e9cab" ${ol()}/>
        <rect x="-76" y="-68" width="164" height="132" rx="26" fill="#c3ced8" ${ol()}/>
        <path d="M-60 -56h132" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".5"/>
        <rect x="-22" y="-44" width="100" height="78" rx="16" fill="#0f1c26" ${ol(4)}/>
        <g class="glitch">
          <g class="eye"><rect x="42" y="-28" width="16" height="24" rx="6" fill="#5ff2ff"/></g>
          <g class="eye eye--near"><rect x="0" y="-28" width="16" height="24" rx="6" fill="#5ff2ff"/></g>
          <path d="M10 12Q30 24 50 12" fill="none" stroke="#5ff2ff" stroke-width="5" stroke-linecap="round"/>
        </g>
        <path d="M-16 -18h88M-16 -4h88M-16 10h88M-16 24h88" stroke="#5ff2ff" stroke-width="1" opacity=".16"/>
        <circle cx="72" cy="48" r="4" fill="#8e9cab"/><circle cx="-62" cy="48" r="4" fill="#8e9cab"/>
        <g class="lv-3" transform="translate(-58 -94)"><path class="blink-led" style="--t:.6s" d="M0 -16L16 12H-16Z" fill="#f2c230" ${ol(4)}/><path d="M0 -6v9M0 7v1" stroke="${OL}" stroke-width="3" stroke-linecap="round"/></g>`,
    },

    alien: {
      arm: { w: 24, hand: 'tri', near: ['#8fe0aa', '#8fe0aa', '#8fe0aa'], far: ['#6cc08b', '#6cc08b', '#6cc08b'] },
      tail: () => '',
      legFar: () => `${limb('M22 -30L126 -34L134 84', '#2f7388', 32)}<ellipse cx="152" cy="106" rx="30" ry="16" fill="#aeb8c2" ${ol()}/>`,
      legNear: () => `${limb('M4 -24L112 -26L120 86', '#3f8ea3', 34)}<ellipse cx="140" cy="108" rx="32" ry="17" fill="#d7dee6" ${ol()}/>`,
      torso: () => `
        <path d="M0 -200L4 -168H26L28 -200Z" fill="#8fe0aa" ${ol()}/>
        <path d="M-50 4C-62 -50 -54 -128 -30 -162C-12 -184 34 -184 50 -160C70 -128 72 -58 62 4Z" fill="#3f8ea3" ${ol()}/>
        <path d="M30 -170C58 -146 66 -70 54 0H34C48 -58 48 -116 30 -170Z" fill="#2f7388" opacity=".75"/>
        <ellipse cx="12" cy="-170" rx="40" ry="11" fill="#d7dee6" ${ol()}/>
        <circle cx="22" cy="-112" r="12" fill="#ffe66b" ${ol(4)}/><ellipse cx="22" cy="-112" rx="21" ry="6" fill="none" ${ol(3)} transform="rotate(-18 22 -112)"/>`,
      head: () => `
        ${limb('M-22 -92C-30 -118 -42 -128 -52 -134', '#6cc08b', 5, 3.5)}${limb('M32 -94C42 -120 56 -128 66 -132', '#6cc08b', 5, 3.5)}
        <circle cx="-54" cy="-136" r="9" fill="#ffe66b" ${ol(4)} class="pulse" style="--t:1.2s"/><circle cx="68" cy="-134" r="9" fill="#ffe66b" ${ol(4)} class="pulse" style="--t:1.2s;--d:-.6s"/>
        <path d="M0 -98C62 -100 100 -56 94 -8C88 36 54 72 22 76C-12 78 -62 46 -78 -4C-92 -58 -54 -98 0 -98Z" fill="#8fe0aa" ${ol()}/>
        <g fill="#6cc08b" opacity=".7"><ellipse cx="-36" cy="-58" rx="13" ry="8" transform="rotate(-30 -36 -58)"/><ellipse cx="-8" cy="-76" rx="8" ry="5"/><ellipse cx="-54" cy="-28" rx="6" ry="9"/></g>
        <g class="eye"><ellipse cx="72" cy="-10" rx="19" ry="28" transform="rotate(-10 72 -10)" fill="#10231f" ${ol(4)}/><ellipse cx="66" cy="-24" rx="5" ry="8" fill="#fff" opacity=".85"/>${lensFire(74, 8, 0.8)}</g>
        <g class="eye eye--near"><ellipse cx="20" cy="-6" rx="25" ry="33" transform="rotate(-16 20 -6)" fill="#10231f" ${ol(4)}/><ellipse cx="10" cy="-22" rx="7" ry="10" fill="#fff" opacity=".85"/>${lensFire(24, 16)}</g>
        <circle cx="58" cy="34" r="2" fill="${OL}" opacity=".6"/><circle cx="66" cy="34" r="2" fill="${OL}" opacity=".6"/>
        <path d="M44 50Q58 58 72 46" fill="none" ${ol(3.5)}/>
        ${sweat(-62, -30)}${sweat(100, -30, -1.4, true)}`,
    },
  };

  /* ------------------------------------------------------------------------
     06 — Scene
     Composes the two illustrated SVG layers from the current config.
     ------------------------------------------------------------------------ */

  /** Two-bone IK: where do shoulder and elbow have to point for the hand to reach `target`? */
  function solveArm([sx, sy], [tx, ty]) {
    const reach = ARM.upper + ARM.fore;
    const base = Math.atan2(ty - sy, tx - sx);
    const d = clamp(Math.hypot(tx - sx, ty - sy), 12, reach - 0.5);
    const bend = Math.acos(clamp((ARM.upper ** 2 + d * d - ARM.fore ** 2) / (2 * ARM.upper * d), -1, 1));
    const shoulder = base + bend; // the elbow hangs below the shoulder–hand line
    const ex = sx + Math.cos(shoulder) * ARM.upper;
    const ey = sy + Math.sin(shoulder) * ARM.upper;
    const fore = Math.atan2(sy + Math.sin(base) * d - ey, sx + Math.cos(base) * d - ex);
    return { shoulder: shoulder * DEG, elbow: (fore - shoulder) * DEG };
  }

  /**
   * One arm as two nested joints. It is drawn twice — an outline pass, then a fill pass —
   * so the outline never cuts across the elbow, and both passes animate in lockstep.
   * `held` is drawn in the hand, kept upright whatever the resting pose.
   */
  function armArt(character, side, target, held = '') {
    const { w, hand } = character.arm;
    const [upper, fore, palm] = character.arm[side];
    const pose = solveArm(SHOULDER[side], target);
    const joint = (name, angle, inner) => `<g class="joint joint--${name}" style="--r:${n(angle)}deg">${inner}</g>`;
    const bone = (length, colour, width) => `<path d="M0 0H${length}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`;
    const pass = (outline) => joint('shoulder', pose.shoulder,
      bone(ARM.upper, outline ? OL : upper, outline ? w + 10 : w) +
      `<g transform="translate(${ARM.upper} 0)">${joint('elbow', pose.elbow,
        bone(ARM.fore, outline ? OL : fore, outline ? w + 10 : w) +
        (outline ? '' : `<g transform="translate(${ARM.fore} 0)"><g transform="rotate(${n(-pose.shoulder - pose.elbow)})">${held}</g>${HANDS[hand](palm)}</g>`))}</g>`);
    return `<g class="arm arm--${side}" transform="translate(${SHOULDER[side].join(' ')})">${pass(true)}${pass(false)}</g>`;
  }

  /**
   * Where the hands go, where the drink stands and which props appear for each activity.
   * `spare` is a free spot on the table for easter-egg props (null: nothing fits).
   */
  const POSES = {
    quiet: { near: [146, -110], far: [198, -96], drink: 'held', spare: 330 },
    laptop: { near: [178, -96], far: [204, -99], drink: 376, spare: null },
    book: { near: [120, -116], far: [180, -120], drink: 300, spare: 388 },
    phone: { near: [140, -160], far: [181, -108], drink: 206, spare: 330 },
    gaming: { near: [112, -118], far: [172, -122], drink: 214, spare: null },
  };

  const Scene = (() => {
    const envSvg = $('#layer-env');
    const castSvg = $('#layer-cast');
    const sceneEl = $('#scene');

    const CAST_DEFS = `
      <defs>
        <linearGradient id="c-fo" x2="0" y2="1"><stop offset="0" stop-color="#e2330f"/><stop offset=".5" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ffc24a"/></linearGradient>
        <linearGradient id="c-fi" x2="0" y2="1"><stop offset="0" stop-color="#ffc23d"/><stop offset="1" stop-color="#fff3b0"/></linearGradient>
        <linearGradient id="c-screen" x1="1" x2="0"><stop offset="0" stop-color="#c6f6ff" stop-opacity=".8"/><stop offset="1" stop-color="#5fd0ff" stop-opacity="0"/></linearGradient>
        <radialGradient id="c-spill"><stop offset="0" stop-color="#9fe9ff" stop-opacity=".55"/><stop offset="1" stop-color="#5fd0ff" stop-opacity="0"/></radialGradient>
        <radialGradient id="c-volt"><stop offset="0" stop-color="#b6ff3a" stop-opacity=".7"/><stop offset="1" stop-color="#b6ff3a" stop-opacity="0"/></radialGradient>
        <radialGradient id="c-shadow"><stop offset="0" stop-color="#0a0302" stop-opacity=".75"/><stop offset="1" stop-color="#0a0302" stop-opacity="0"/></radialGradient>
        <linearGradient id="c-long" x2="0" y2="1"><stop offset="0" stop-color="#0a0302" stop-opacity=".5"/><stop offset="1" stop-color="#0a0302" stop-opacity="0"/></linearGradient>
        <!-- Firelight rim: wherever the silhouette is not covered by a shifted copy of itself, paint it warm -->
        <filter id="c-rim" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">
          <feOffset in="SourceAlpha" dx="5" dy="-2" result="shiftR"/>
          <feComposite in="SourceAlpha" in2="shiftR" operator="out" result="edgeL"/>
          <feOffset in="SourceAlpha" dx="-5" dy="-2" result="shiftL"/>
          <feComposite in="SourceAlpha" in2="shiftL" operator="out" result="edgeR"/>
          <feFlood flood-color="#ffc061" result="warm"/><feComposite in="warm" in2="edgeL" operator="in" result="rimL"/>
          <feFlood flood-color="#ff7d3a" result="hot"/><feComposite in="hot" in2="edgeR" operator="in" result="rimR"/>
          <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="rimL"/><feMergeNode in="rimR"/></feMerge>
        </filter>
      </defs>`;

    /** Easter-egg props that live in the environment layer (world coordinates). */
    function envEggs(env) {
      let out = '';
      const wall = env.eggs.wall;
      if (wall && Eggs.has('note')) {
        const [x, y] = wall;
        out += `<g class="crooked" style="--dir:.7"><rect x="${x}" y="${y}" width="80" height="76" fill="#ffe36b"/><path d="M${x + 80} ${y + 76}h-18l18 -18z" fill="#d9bb45"/>
          ${slot('sticky', (text) => fitLines(wrapWords(text, 7, 3), {
            x: x + 9, size: 14, font: 'comic', weight: 700, width: 62, fill: '#3b2a12',
            baseline: (i) => y + 23 + i * 19.5,
            // The original joke crosses out its own second line.
            each: (line, i) => (i === 1 && text === TEXT_SLOTS.sticky.base ? 'text-decoration="line-through"' : ''),
          }))}</g>`;
      } else if (wall && Eggs.has('detector')) {
        const [x, y] = [wall[0] + 40, wall[1] + 36];
        out += `<circle cx="${x}" cy="${y}" r="32" fill="#f4f1ec"/><circle cx="${x}" cy="${y}" r="32" fill="none" stroke="#b9b3a4" stroke-width="3"/>
          <path d="M${x - 16} ${y - 8}h32M${x - 18} ${y}h36M${x - 16} ${y + 8}h32" stroke="#b9b3a4" stroke-width="3" stroke-linecap="round"/>
          <circle cx="${x + 18}" cy="${y - 18}" r="4" fill="#ff3b30" class="blink-led" style="--t:2.4s"/>
          ${slot('chirp', (text) => fitText(text, { x: x + 40, y: y - 22, size: 20, font: 'comic', weight: 700, width: 60, fill: '#fff8e6', extra: 'class="beep"' }))}`;
      }
      if (Eggs.has('mouse')) {
        out += `<g class="scurry"><g transform="translate(1700 ${WORLD.floor - 4})">
          <path d="M18 -6q22 -10 30 6" fill="none" stroke="#8d8791" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="0" cy="-10" rx="20" ry="11" fill="#a39da8"/><circle cx="-16" cy="-14" r="8" fill="#a39da8"/><circle cx="-12" cy="-22" r="6" fill="#c9a9b4"/>
          <circle cx="-20" cy="-15" r="1.8" fill="#1b0d08"/><circle cx="-25" cy="-12" r="2" fill="#e98a98"/>
          <rect x="-34" y="-12" width="14" height="11" rx="2" fill="#8a5a2b"/><path d="M-31 -12v-4h8v4" fill="none" stroke="#5b3212" stroke-width="2"/>
          <path class="scurry__legs" d="M-8 0v5M8 0v5" stroke="#8d8791" stroke-width="3" stroke-linecap="round"/></g></g>`;
      }
      return out;
    }

    /** Easter-egg props around the cast. Everything is in cast-local coordinates. */
    function castEggs(env, pose) {
      let out = '';
      if (Eggs.has('duck')) {
        const [x, y] = pose.spare ? [pose.spare, TABLE_Y] : [462, FLOOR_Y];
        out += `<g transform="translate(${x} ${y - 1})"><ellipse cx="0" cy="-12" rx="22" ry="14" fill="#ffd93b" ${ol(4)}/><path d="M-19 -15q-11 -8 -6 -19q9 6 13 11z" fill="#ffd93b" ${ol(4)}/>
          <circle cx="14" cy="-30" r="12" fill="#ffd93b" ${ol(4)}/><path d="M24 -32l14 3-13 6z" fill="#ff8a2a" ${ol(3)}/><circle cx="17" cy="-32" r="2.5" fill="${OL}"/>
          <path d="M1 -37a13 11 0 0 1 26 0z" fill="#d2301f" ${ol(4)}/><path d="M-3 -37h34" ${ol(4)}/></g>`;
      }
      if (Eggs.has('extinguisher')) {
        const x = n((env.eggs.floor[0] - CAST.x) / CAST.scale);
        const y = n((env.eggs.floor[1] - CAST.y) / CAST.scale);
        out += `<g transform="translate(${x} ${y})">
          ${limb('M-8 -106h-20l-8 30', '#2b2b33', 4, 3)}
          <rect x="-20" y="-96" width="40" height="96" rx="12" fill="#d2301f" ${ol()}/>
          <rect x="-13" y="-68" width="26" height="28" rx="3" fill="#fbf6ee" ${ol(3)}/>
          ${slot('tank', (text) => fitText(text, { x: 0, y: -50, size: 7.5, weight: 700, width: 22, anchor: 'middle', fill: '#d2301f' }))}
          <rect x="-8" y="-112" width="16" height="18" rx="3" fill="#2b2b33" ${ol(4)}/><path d="M6 -110l22 -10" ${ol(5)}/>
          ${sceneFlames(-24, -112, 48, 56, 1, 97, 'lv-2', 'c')}</g>`;
      }
      return out;
    }

    function castArt(config, changed) {
      const env = ENVIRONMENTS[config.environment];
      const who = CHARACTERS[config.character];
      const pose = POSES[config.activity];
      const drink = DRINKS[config.drink];
      const pop = (keys, inner) => `<g class="${keys.some((key) => changed.includes(key)) ? 'pop-in' : ''}">${inner}</g>`;

      let cup = drink.art();
      if (config.drink === 'coffee') {
        // Slogan mug. When it is held, the lettering moves clear of the paw.
        const [x, width] = pose.drink === 'held' ? [9, 30] : [-1, 38];
        cup += slot('mug', (text) => (text ? fitText(text, { x, y: -24, size: text.length > 2 ? 10.5 : 16, weight: 700, width, anchor: 'middle', fill: '#c0392b' }) : ''));
      }
      const cupArt = pop(['drink'], cup);

      // What stands on the table, what is held between the hands, what sits in the near hand
      let onTable = '';
      let between = '';
      let inHand = '';
      if (pose.drink === 'held') {
        inHand = `<g transform="translate(${-drink.grip[0]} ${-drink.grip[1]})">${cupArt}</g>`;
      } else {
        onTable += `<g transform="translate(${pose.drink} ${TABLE_Y})">${cupArt}</g>`;
      }
      const prop = (name, x, y, rotate) => `<g transform="translate(${x} ${y}) rotate(${rotate})">${pop(['activity'], PROPS[name]())}</g>`;
      if (config.activity === 'laptop') onTable += prop('laptop', 232, TABLE_Y, 0);
      if (config.activity === 'gaming') {
        onTable += prop('monitor', 338, TABLE_Y, 0);
        between = prop('controller', 142, -124, 0);
      }
      if (config.activity === 'book') between = prop('book', 150, -166, -8);
      if (config.activity === 'phone') inHand = prop('phone', 4, -22, -12);

      const swap = changed.includes('character') || changed.includes('environment') ? ' is-swap' : '';
      return `${CAST_DEFS}
        <g transform="translate(${CAST.x} ${CAST.y}) scale(${CAST.scale})">
          <g class="shadows">
            <path id="shadow-l" d="M-96 126H150L40 330H-330Z" fill="url(#c-long)"/>
            <path id="shadow-r" d="M40 126H424L690 330H230Z" fill="url(#c-long)"/>
            <ellipse cx="20" cy="128" rx="176" ry="24" fill="url(#c-shadow)"/>
            <ellipse cx="270" cy="128" rx="176" ry="22" fill="url(#c-shadow)"/>
          </g>
          <g class="cast-root pose--${config.activity}${swap}" filter="url(#c-rim)">
            ${CHAIRS[env.chair]()}
            ${who.tail()}
            ${who.legFar()}
            ${TABLES[env.table]()}
            ${onTable}
            ${armArt(who, 'far', pose.far)}
            ${between}
            <g class="character">
              <g class="breathe">${who.torso()}</g>
              ${who.legNear()}
              <g transform="translate(${HEAD.join(' ')})"><g class="nod">${who.head()}</g></g>
              ${armArt(who, 'near', pose.near, inHand)}
            </g>
            ${castEggs(env, pose)}
          </g>
        </g>`;
    }

    function describe(config) {
      const level = option('chaos', config.chaos);
      return `${option('character', config.character).noun} ${option('activity', config.activity).verb} with ${option('drink', config.drink).noun} in ${option('environment', config.environment).place}, which is ${level.adverb} on fire.`
        .replace(/^./, (c) => c.toUpperCase());
    }

    /**
     * Render the scene. `changed` lists the config keys that differ from what is on screen
     * so only those parts animate in; pass every key for a first paint.
     */
    function render(config, changed = KEYS) {
      const root = document.documentElement;
      root.dataset.level = String(levelOf(config));
      root.dataset.env = config.environment;

      if (changed.includes('environment')) {
        const env = ENVIRONMENTS[config.environment];
        $$('.env-root', envSvg).forEach((old) => {
          old.classList.add('is-leaving');
          old.addEventListener('animationend', () => old.remove(), { once: true });
          window.setTimeout(() => old.remove(), 1200);
        });
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'env-root');
        group.innerHTML = `<defs>${ENV_DEFS}</defs>${env.art()}${envEggs(env)}`;
        envSvg.append(group);
      }
      if (changed.some((key) => key !== 'chaos')) {
        castSvg.innerHTML = castArt(config, changed.length === KEYS.length ? [] : changed);
      }
      sceneEl.setAttribute('aria-label', describe(config));
    }

    return {
      render,
      describe,
      /** Small portrait used on the character tiles. */
      avatar: (id) => `<svg viewBox="-120 -150 260 260" aria-hidden="true" focusable="false">${CHARACTERS[id].head()}</svg>`,
      drinkIcon: (id) => `<svg viewBox="-56 -106 112 116" aria-hidden="true" focusable="false">${DRINKS[id].art()}</svg>`,
      /** World position of a point given in cast-local coordinates. */
      castToWorld: (x, y) => [CAST.x + x * CAST.scale, CAST.y + y * CAST.scale],
    };
  })();

  /* ------------------------------------------------------------------------
     07 — FX
     All the fire lives on two canvases: one behind the cast, one in front.
       back  : firelight glow, floor reflections, back flames (heat-distorted)
       front : foreground flames, out-of-focus flames + smoke (low-res buffer),
               embers
     Flames are procedural bezier tongues driven by value noise, so no two
     frames — or two visits — ever flicker the same way.
     ------------------------------------------------------------------------ */

  const FX = (() => {
    const back = $('#fx-back');
    const front = $('#fx-front');
    const bctx = back.getContext('2d');
    const fctx = front.getContext('2d');
    const fireBuf = document.createElement('canvas'); // crisp back flames, before heat distortion
    const fireCtx = fireBuf.getContext('2d');
    const softBuf = document.createElement('canvas'); // quarter-res: anything in front that should look soft
    const softCtx = softBuf.getContext('2d');
    const hazeBuf = document.createElement('canvas'); // quarter-res: smoke rising behind the cast
    const hazeCtx = hazeBuf.getContext('2d');
    const SOFT = 0.25;

    const PALETTES = {
      ember: {
        outer: [[0, '#ffa62e'], [0.4, '#ff6418'], [0.8, '#e2260c'], [1, 'rgba(160,18,6,.9)']],
        mid: [[0, '#ffd75e'], [0.55, '#ffa52b'], [1, '#ff6a16']],
        core: [[0, '#fffbe6'], [0.5, '#ffe98a'], [1, '#ffc641']],
        glow: '255,120,30', spark: ['#fff6d0', '#ffc24a', '255,122,26'], smoke: '24,16,14',
      },
      neon: {
        outer: [[0, '#ff5fb0'], [0.45, '#e02fd0'], [0.85, '#7a1fd8'], [1, 'rgba(70,20,160,.9)']],
        mid: [[0, '#ffb86a'], [0.5, '#ff6a8a'], [1, '#ff3fa8']],
        core: [[0, '#e6ffff'], [0.5, '#8af2ff'], [1, '#43d8ff']],
        glow: '255,70,190', spark: ['#f2ffff', '#7af3ff', '255,79,216'], smoke: '20,10,34',
      },
    };

    // [layer, u, base, width, height, minLevel]
    //   u ....... 0–1 across the visible width
    //   base .... back row: world y of the flame's foot; front row: distance below the frame's bottom edge
    const SLOTS = [
      ['back', 0.03, 930, 250, 560, 1], ['back', 0.11, 946, 210, 430, 2], ['back', 0.185, 925, 190, 330, 1], ['back', 0.26, 940, 170, 250, 3], ['back', 0.325, 930, 150, 180, 4],
      ['back', 0.97, 930, 250, 580, 1], ['back', 0.89, 946, 210, 450, 2], ['back', 0.815, 925, 190, 340, 2], ['back', 0.74, 940, 170, 260, 3], ['back', 0.69, 930, 150, 200, 4],
      ['back', 0.4, 936, 150, 160, 3], ['back', 0.565, 940, 160, 180, 3], ['back', 0.485, 934, 140, 140, 4], ['back', 0.63, 936, 150, 170, 4],
      ['front', 0, 40, 300, 470, 2], ['front', 0.09, 70, 250, 360, 1], ['front', 0.19, 90, 210, 270, 3], ['front', 0.3, 110, 180, 220, 4],
      ['front', 1, 40, 300, 490, 2], ['front', 0.91, 70, 250, 370, 2], ['front', 0.81, 90, 210, 280, 3], ['front', 0.7, 110, 180, 230, 4],
      ['front', 0.44, 120, 170, 200, 4], ['front', 0.57, 120, 180, 210, 3],
    ];
    // Tall screens show a lot of floor: scatter a few extra fires across it. [u, worldY, width, height, minLevel]
    const FLOOR_SLOTS = [[0.1, 1180, 150, 190, 2], [0.9, 1200, 150, 200, 2], [0.3, 1262, 140, 170, 3], [0.72, 1250, 140, 180, 3], [0.5, 1210, 130, 150, 4]];
    // Out-of-focus flames glued to the bottom of the screen. [u, width, height, minLevel] in screen fractions
    const BOKEH_SLOTS = [[-0.02, 0.26, 0.6, 1], [1.02, 0.26, 0.62, 1], [0.14, 0.2, 0.34, 3], [0.87, 0.2, 0.36, 3], [0.5, 0.26, 0.2, 4], [0.32, 0.16, 0.24, 4], [0.68, 0.16, 0.25, 4]];

    const TONGUES = [
      { dx: -0.3, w: 0.62, h: 0.62, lean: -0.22, phase: 1.7 },
      { dx: 0.32, w: 0.58, h: 0.7, lean: 0.2, phase: 4.1 },
      { dx: 0, w: 1, h: 1, lean: 0, phase: 0 },
    ];
    const LAYERS = [['outer', 1, 1], ['mid', 0.66, 0.72], ['core', 0.36, 0.44]];
    // Out-of-focus flames sit in the vignetted corners, where a pale core would only turn muddy
    const SOFT_LAYERS = LAYERS.slice(0, 2);

    // Per disaster level (index 0 unused)
    const HEIGHT = [0, 0.5, 0.74, 1, 1.28];
    const EMBER_RATE = [0, 9, 26, 58, 120];
    const SMOKE_RATE = [0, 1.5, 4, 8, 13];
    const CEILING = [0, 0.3, 0.55, 0.82, 1];
    const HAZE = [0, 1, 1.8, 2.8, 4];

    let vw = 0;
    let vh = 0;
    let dpr = 1;
    let quality = 'high';
    let level = 3;
    let palette = PALETTES.ember;
    let paletteName = 'ember';
    let reflect = 0.2;
    let crown = [0, 0];
    let time = 0;
    let wind = 0;
    let emberDebt = 0;
    let smokeDebt = 0;
    let ceiling = 0.8;

    /** World → screen mapping at rest (camera adds zoom/offset on top). */
    const view = { k: 1, x: 0, y: 0 };
    const visible = { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
    let cam = { x: 0, y: 0, zoom: 1, px: 0, py: 0 };

    const flames = [];
    const bokehFlames = [];
    const headFlame = { layer: 'front', x: 0, y: 0, w: 56, h: 100, min: 4, seed: 77, speed: 1.4, grow: 0 };
    const embers = [];
    const puffs = [];
    const clouds = [];
    const sparking = []; // scratch lists, refilled every frame: fires tall enough to throw sparks…
    const smoking = []; // …and the ones allowed to smoke
    const light = { all: 0.8, left: 0.8, right: 0.8 };

    /* — Sprites & gradients — */

    function sprite(size, draw) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      draw(canvas.getContext('2d'), size);
      return canvas;
    }
    const radial = (ctx, x, y, r, stops) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      stops.forEach(([offset, colour]) => g.addColorStop(offset, colour));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };

    const sprites = {};
    const gradients = new Map(); // ctx → { paletteName → { outer, mid, core } }

    function buildSprites(name) {
      const p = PALETTES[name];
      sprites[name] = {
        glow: sprite(128, (ctx, s) => radial(ctx, s / 2, s / 2, s / 2, [[0, `rgba(${p.glow},.9)`], [0.35, `rgba(${p.glow},.34)`], [1, `rgba(${p.glow},0)`]])),
        spark: sprite(48, (ctx, s) => radial(ctx, s / 2, s / 2, s / 2, [[0, p.spark[0]], [0.18, p.spark[1]], [0.45, `rgba(${p.spark[2]},.5)`], [1, `rgba(${p.spark[2]},0)`]])),
        smoke: [1, 2, 3].map((seed) => sprite(160, (ctx, s) => {
          const r = seeded(seed * 17);
          for (let i = 0; i < 7; i++) {
            radial(ctx, s * (0.34 + r() * 0.32), s * (0.34 + r() * 0.32), s * (0.18 + r() * 0.14), [[0, `rgba(${p.smoke},.36)`], [1, `rgba(${p.smoke},0)`]]);
          }
        })),
      };
    }

    /** Unit-space gradients (foot at y = 0, tip at y = -1) so one gradient serves every flame size. */
    function gradientsFor(ctx) {
      if (!gradients.has(ctx)) gradients.set(ctx, {});
      const cache = gradients.get(ctx);
      if (!cache[paletteName]) {
        cache[paletteName] = {};
        for (const [name] of LAYERS) {
          const g = ctx.createLinearGradient(0, 0, 0, -1);
          palette[name].forEach(([offset, colour]) => g.addColorStop(offset, colour));
          cache[paletteName][name] = g;
        }
      }
      return cache[paletteName];
    }

    /* — Layout — */

    const smooth = (a, b, x) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };

    function layout() {
      view.k = Math.max(vw / WORLD.w, vh / WORLD.h);
      view.x = (vw - WORLD.w * view.k) / 2;
      view.y = (vh - WORLD.h * view.k) / 2;
      visible.x = -view.x / view.k;
      visible.y = -view.y / view.k;
      visible.w = vw / view.k;
      visible.h = vh / view.k;

      const narrow = clamp(visible.w / WORLD.w * 1.5, 0.6, 1);
      const old = new Map(flames.map((flame) => [flame.id, flame.grow]));
      flames.length = 0;
      const add = (id, layer, x, y, w, h, min) => {
        // Keep the fire behind the character's head low so the face always reads
        const cap = layer === 'back' ? 170 + 560 * smooth(120, 360, Math.abs(x - 690)) : Infinity;
        flames.push({ id, layer, x, y, w: w * narrow, h: Math.min(h, cap), min, seed: hash(id.length * 31 + x) * 100, speed: 0.8 + hash(x) * 0.6, grow: old.get(id) || 0 });
      };
      SLOTS.forEach(([layer, u, base, w, h, min], i) => {
        const x = visible.x + u * visible.w;
        add(`s${i}`, layer, x, layer === 'back' ? base : visible.y + visible.h + base, w, h, min);
      });
      if (visible.h > 1100) {
        FLOOR_SLOTS.forEach(([u, y, w, h, min], i) => add(`f${i}`, 'front', visible.x + u * visible.w, y, w, h, min));
      }

      const unit = Math.min(vw, vh * 1.4);
      const tall = vh > vw ? 0.62 : 1;
      bokehFlames.length = 0;
      BOKEH_SLOTS.forEach(([u, w, h, min], i) => {
        bokehFlames.push({ x: u * vw, y: vh * 1.05, w: w * unit * 1.1, h: h * vh * tall, min, seed: 40 + i * 13.7, speed: 0.7 + hash(i) * 0.4, grow: 0 });
      });

      clouds.length = 0;
      const count = Math.ceil(vw / 130) + 3;
      for (let i = 0; i < count; i++) {
        clouds.push({ x: (i / count) * (vw + 400) - 200, r: rand(150, 250) * clamp(vw / 1200, 0.6, 1.2), seed: rand(0, 100), speed: rand(6, 18), variant: i % 3 });
      }
    }

    function resize(width, height, tier) {
      vw = width;
      vh = height;
      quality = tier;
      const cap = tier === 'high' ? 2 : tier === 'medium' ? 1.5 : 1;
      dpr = Math.min(window.devicePixelRatio || 1, cap);
      while (dpr > 1 && vw * vh * dpr * dpr > 4.6e6) dpr -= 0.25; // keep fill-rate sane on huge displays
      for (const canvas of [back, front, fireBuf]) {
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
      }
      for (const canvas of [softBuf, hazeBuf]) {
        canvas.width = Math.ceil(vw * SOFT);
        canvas.height = Math.ceil(vh * SOFT);
      }
      layout();
    }

    function configure(options) {
      level = options.level;
      reflect = options.reflect;
      crown = options.crown;
      if (options.palette !== paletteName) {
        paletteName = options.palette;
        palette = PALETTES[paletteName];
        if (!sprites[paletteName]) buildSprites(paletteName);
      }
    }

    /* — Coordinate helpers — */

    const DEPTH = { back: 0.75, cast: 1, front: 1.35, bokeh: 2.4 };

    const toScreen = (wx, wy, depth = 1) => [
      (wx * view.k + view.x - vw / 2) * cam.zoom + vw / 2 + cam.x + cam.px * depth,
      (wy * view.k + view.y - vh / 2) * cam.zoom + vh / 2 + cam.y + cam.py * depth,
    ];

    /** Point a context at world space as seen by the camera, at a given parallax depth. */
    function setWorld(ctx, depth) {
      const k = view.k * cam.zoom * dpr;
      ctx.setTransform(k, 0, 0, k,
        ((view.x - vw / 2) * cam.zoom + vw / 2 + cam.x + cam.px * depth) * dpr,
        ((view.y - vh / 2) * cam.zoom + vh / 2 + cam.y + cam.py * depth) * dpr);
    }

    /* — Flames — */

    let heightNow = 1;

    /** A single flame tongue in unit space: foot from -0.5 to 0.5 on y = 0, tip at (lean, -1). */
    function tongue(ctx, lean, curl, wobble) {
      ctx.beginPath();
      ctx.moveTo(-0.5, 0);
      ctx.bezierCurveTo(-0.68, -0.3, -0.3 + lean * 0.35 + wobble, -0.58, lean * 0.82 - 0.07 + curl, -0.84);
      ctx.quadraticCurveTo(lean * 0.95 - 0.02 + curl * 0.6, -0.94, lean, -1);
      ctx.quadraticCurveTo(lean * 0.9 + 0.1 + curl * 0.3, -0.8, lean * 0.6 + 0.26 - wobble, -0.6);
      ctx.bezierCurveTo(0.52 + lean * 0.2, -0.42, 0.68, -0.2, 0.5, 0);
      ctx.quadraticCurveTo(0, 0.12, -0.5, 0);
      ctx.closePath();
    }

    /** One fire = three tongues × up to three nested colour layers, every control point wandering on noise. */
    function drawFire(ctx, fire, x, y, layers = LAYERS) {
      const g = fire.grow;
      if (g < 0.02) return;
      const grads = gradientsFor(ctx);
      const s = fire.seed;
      const t = time * fire.speed;
      const h = fire.h * g * heightNow * (0.84 + noise(t * 1.9 + s) * 0.32);
      const w = fire.w * (0.55 + 0.45 * g) * (0.92 + noise(t * 1.3 + s * 2.3) * 0.16);
      const sway = (noise(t * 0.9 + s * 5.1) - 0.5) * 0.9 + wind;
      for (const [name, lw, lh] of layers) {
        ctx.fillStyle = grads[name];
        for (const part of TONGUES) {
          const tt = t + part.phase + s;
          const lean = (sway * 0.7 + part.lean + (noise(tt * 1.6) - 0.5) * 0.5) * (lh / lw);
          ctx.save();
          ctx.translate(x + part.dx * w, y);
          ctx.scale(w * part.w * lw, h * part.h * lh * (0.9 + noise(tt * 2.7 + 2) * 0.2));
          tongue(ctx, lean, (noise(tt * 2.3 + 9) - 0.5) * 0.24, (noise(tt * 3.1 + 4) - 0.5) * 0.18);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    function drawGlow(ctx, fire, x, y, strength) {
      if (fire.grow < 0.02) return;
      const h = fire.h * fire.grow * heightNow;
      const r = Math.max(fire.w, h) * 1.05;
      ctx.globalAlpha = strength * fire.grow * (0.65 + light.all * 0.35);
      ctx.drawImage(sprites[paletteName].glow, x - r, y - h * 0.5 - r, r * 2, r * 2);
    }

    /** Squashed, flipped copy under the flame: the fire reflected in the floor. */
    function drawReflection(ctx, fire) {
      if (fire.grow < 0.05 || reflect <= 0) return;
      const grads = gradientsFor(ctx);
      ctx.save();
      ctx.translate(fire.x, fire.y + 6);
      ctx.scale(fire.w * 1.1, -fire.h * fire.grow * heightNow * 0.42);
      ctx.globalAlpha = reflect * 0.55 * (0.6 + light.all * 0.4);
      tongue(ctx, (noise(time * 1.2 + fire.seed) - 0.5) * 0.5, 0, 0);
      ctx.fillStyle = grads.outer;
      ctx.fill();
      ctx.scale(0.6, 0.7);
      tongue(ctx, 0, 0, 0);
      ctx.fillStyle = grads.mid;
      ctx.fill();
      ctx.restore();
    }

    /**
     * Heat distortion: copy the flame buffer to the screen in thin horizontal strips, each
     * nudged sideways along a rising wave — the classic shimmer of hot air.
     */
    function blitHeat(amount) {
      if (amount < 0.05) {
        bctx.drawImage(fireBuf, 0, 0);
        return;
      }
      const W = back.width;
      const H = back.height;
      const strip = Math.max(2, Math.round(3 * dpr));
      for (let y = 0; y < H; y += strip) {
        const cy = y / dpr;
        const rise = clamp(1.25 - cy / vh, 0.3, 1); // air shimmers more the higher it has risen
        const dx = (Math.sin(cy * 0.045 + time * 6.1) * 0.55 + Math.sin(cy * 0.021 - time * 3.7) * 0.45) * amount * rise * dpr;
        bctx.drawImage(fireBuf, 0, y, W, strip, dx, y, W, strip);
      }
    }

    function drawBack(motion) {
      const W = back.width;
      const H = back.height;
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, W, H);
      fireCtx.setTransform(1, 0, 0, 1, 0, 0);
      fireCtx.clearRect(0, 0, W, H);

      setWorld(bctx, DEPTH.back);
      bctx.globalCompositeOperation = 'lighter';
      for (const fire of flames) if (fire.layer === 'back') drawGlow(bctx, fire, fire.x, fire.y, 0.5);
      bctx.globalCompositeOperation = 'source-over';
      for (const fire of flames) if (fire.layer === 'back') drawReflection(bctx, fire);
      bctx.globalAlpha = 1;

      setWorld(fireCtx, DEPTH.back);
      for (const fire of flames) if (fire.layer === 'back') drawFire(fireCtx, fire, fire.x, fire.y);

      bctx.setTransform(1, 0, 0, 1, 0, 0);
      blitHeat(quality === 'low' ? 0 : HAZE[level] * motion);

      // Smoke from the back row rises behind the character, never across their face
      hazeCtx.setTransform(1, 0, 0, 1, 0, 0);
      hazeCtx.clearRect(0, 0, hazeBuf.width, hazeBuf.height);
      hazeCtx.setTransform(SOFT, 0, 0, SOFT, 0, 0);
      drawPuffs(hazeCtx, 'back');
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.drawImage(hazeBuf, 0, 0, vw, vh);
    }

    /* — Particles — */

    function spawnEmber(x, y, power = 1, angle = null) {
      if (embers.length > 460) return;
      const a = angle === null ? -Math.PI / 2 + rand(-0.5, 0.5) : angle;
      const speed = rand(50, 170) * power;
      embers.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0, ttl: rand(1.6, 4.6), size: rand(1, 3.3), seed: rand(0, 1000), big: false });
    }

    function emit(step, motion) {
      sparking.length = 0;
      smoking.length = 0;
      const centre = visible.x + visible.w / 2;
      for (const fire of flames) {
        if (fire.grow <= 0.4) continue;
        sparking.push(fire);
        // Foreground smoke only comes off the fires at the edges of the frame, so the cast stays clear
        if (fire.layer === 'back' || Math.abs(fire.x - centre) > visible.w * 0.3) smoking.push(fire);
      }
      if (!sparking.length) return;
      const area = clamp((vw * vh) / (1440 * 900), 0.45, 1.5);
      const thin = (quality === 'low' ? 0.5 : 1) * (motion < 1 ? 0.3 : 1);
      const tip = (fire, spread, lo, hi) => toScreen(
        fire.x + rand(-spread, spread) * fire.w,
        fire.y - fire.h * fire.grow * heightNow * rand(lo, hi),
        DEPTH[fire.layer]);

      emberDebt += EMBER_RATE[level] * area * thin * step;
      while (emberDebt >= 1) {
        emberDebt -= 1;
        const [x, y] = tip(pick(sparking), 0.35, 0.3, 0.95);
        spawnEmber(x, clamp(y, -20, vh + 20));
      }
      // The odd large, out-of-focus ember drifting right past the lens
      if (quality !== 'low' && motion === 1 && Math.random() < level * 0.5 * step) {
        embers.push({ x: rand(0, vw), y: vh + 30, vx: rand(-60, 60), vy: -rand(140, 300), life: 0, ttl: rand(2.5, 4.5), size: rand(9, 22), seed: rand(0, 1000), big: true });
      }

      smokeDebt = Math.min(smokeDebt + SMOKE_RATE[level] * area * thin * step, 4);
      while (smokeDebt >= 1 && smoking.length && puffs.length < 90) {
        smokeDebt -= 1;
        const fire = pick(smoking);
        const [x, y] = tip(fire, 0.2, 0.8, 1);
        puffs.push({ layer: fire.layer, x, y, vx: rand(-12, 12), vy: -rand(28, 64), r: rand(60, 120), swell: rand(20, 44), life: 0, ttl: rand(4, 8), alpha: rand(0.2, 0.44), variant: Math.floor(rand(0, 3)) });
      }
    }

    function updateParticles(step) {
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.life += step;
        if (e.life > e.ttl || e.y < -60) {
          // Sparks are drawn additively, so their order is irrelevant: fill the gap with the last one
          embers[i] = embers[embers.length - 1];
          embers.pop();
          continue;
        }
        e.vx += ((noise(e.seed + time * 0.7) - 0.5) * 280 + wind * 90) * step;
        e.vy -= 26 * step;
        e.vx *= 1 - 0.6 * step;
        e.x += e.vx * step;
        e.y += e.vy * step;
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life += step;
        if (p.life > p.ttl) {
          puffs.splice(i, 1);
          continue;
        }
        p.vx += wind * 30 * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
      }
      for (const cloud of clouds) {
        cloud.x += cloud.speed * step;
        if (cloud.x - cloud.r > vw + 60) cloud.x = -cloud.r - 60;
      }
    }

    /** Rising smoke puffs for one layer, drawn into a quarter-res buffer. */
    function drawPuffs(ctx, layer) {
      const smoke = sprites[paletteName].smoke;
      for (const p of puffs) {
        if (p.layer !== layer) continue;
        const r = p.r + p.swell * p.life;
        ctx.globalAlpha = p.alpha * Math.min(1, p.life / 1.1) * (1 - p.life / p.ttl);
        ctx.drawImage(smoke[p.variant], p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }

    /** Everything soft goes through a quarter-res buffer: cheap to fill, and upscaling blurs it for free. */
    function drawSoft() {
      const smoke = sprites[paletteName].smoke;
      softCtx.setTransform(1, 0, 0, 1, 0, 0);
      softCtx.clearRect(0, 0, softBuf.width, softBuf.height);
      softCtx.setTransform(SOFT, 0, 0, SOFT, 0, 0);

      const ox = cam.px * DEPTH.bokeh;
      const oy = cam.py * DEPTH.bokeh;
      softCtx.globalCompositeOperation = 'lighter';
      for (const fire of bokehFlames) drawGlow(softCtx, fire, fire.x + ox, fire.y + oy, 0.55);
      softCtx.globalCompositeOperation = 'source-over';
      softCtx.globalAlpha = 0.94;
      for (const fire of bokehFlames) drawFire(softCtx, fire, fire.x + ox, fire.y + oy, SOFT_LAYERS);
      drawPuffs(softCtx, 'front');

      // The smoke ceiling: a rolling bank that thickens and sinks as things get worse
      const sink = ceiling * vh * 0.17;
      const haze = softCtx.createLinearGradient(0, 0, 0, sink + vh * 0.16);
      haze.addColorStop(0, `rgba(${palette.smoke},${0.8 * ceiling})`);
      haze.addColorStop(1, `rgba(${palette.smoke},0)`);
      softCtx.globalAlpha = 1;
      softCtx.fillStyle = haze;
      softCtx.fillRect(0, 0, vw, sink + vh * 0.16);
      softCtx.globalAlpha = Math.min(1, ceiling * 1.1);
      for (const cloud of clouds) {
        const y = sink - cloud.r * 0.42 + Math.sin(time * 0.35 + cloud.seed) * 12;
        softCtx.drawImage(smoke[cloud.variant], cloud.x - cloud.r, y - cloud.r, cloud.r * 2, cloud.r * 2);
      }
      softCtx.globalAlpha = 1;
    }

    function drawFront() {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, front.width, front.height);

      setWorld(fctx, DEPTH.front);
      fctx.globalCompositeOperation = 'lighter';
      for (const fire of flames) if (fire.layer === 'front') drawGlow(fctx, fire, fire.x, fire.y, 0.4);
      fctx.globalCompositeOperation = 'source-over';
      fctx.globalAlpha = 1;
      for (const fire of flames) if (fire.layer === 'front') drawFire(fctx, fire, fire.x, fire.y);
      setWorld(fctx, DEPTH.cast);
      drawFire(fctx, headFlame, headFlame.x, headFlame.y);

      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawSoft();
      fctx.drawImage(softBuf, 0, 0, vw, vh);

      const { spark, glow } = sprites[paletteName];
      fctx.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        const age = e.life / e.ttl;
        const fade = Math.min(1, e.life * 4) * (1 - age * age);
        if (e.big) {
          fctx.globalAlpha = 0.3 * fade;
          fctx.drawImage(glow, e.x - e.size * 2, e.y - e.size * 2, e.size * 4, e.size * 4);
          continue;
        }
        const s = e.size * (1 - age * 0.5) * 4;
        fctx.globalAlpha = fade * (0.55 + 0.45 * noise(e.seed * 3 + time * 9));
        fctx.drawImage(spark, e.x - s, e.y - s, s * 2, s * 2);
      }
      fctx.globalAlpha = 1;
      fctx.globalCompositeOperation = 'source-over';
    }

    /* — Public API — */

    /**
     * Advance and draw one frame.
     * @param {number} dt seconds since the last frame
     * @param {{x:number,y:number,zoom:number,px:number,py:number}} camera
     * @param {number} motion 1 normally; a small fraction when the visitor prefers reduced motion
     */
    function frame(dt, camera, motion) {
      cam = camera;
      const step = dt * motion;
      time += step;
      heightNow = damp(heightNow, HEIGHT[level], 2.4, dt);
      ceiling = damp(ceiling, CEILING[level], 1.2, dt);
      wind = (noise(time * 0.23 + 11) - 0.5) * 0.5;
      light.all = 0.62 + 0.38 * (noise(time * 6.3) * 0.6 + noise(time * 14.7 + 5) * 0.4);
      light.left = noise(time * 4.1 + 30);
      light.right = noise(time * 4.6 + 60);

      for (const fire of flames) fire.grow = damp(fire.grow, level >= fire.min ? 1 : 0, 2.6, dt);
      for (const fire of bokehFlames) fire.grow = damp(fire.grow, level >= fire.min ? 1 : 0, 2.2, dt);
      headFlame.grow = damp(headFlame.grow, level >= 4 ? 1 : 0, 2, dt);
      [headFlame.x, headFlame.y] = crown;

      emit(step, motion);
      updateParticles(step);
      drawBack(motion);
      drawFront();
    }

    /** A burst of sparks at a screen position — used for scene swaps, clicks and explosions. */
    function burst(x, y, count = 40, power = 2) {
      for (let i = 0; i < count; i++) spawnEmber(x + rand(-14, 14), y + rand(-14, 14), power * rand(0.5, 1.6), rand(0, TAU));
    }

    buildSprites('ember');

    return { resize, configure, frame, burst, toScreen, light, canvases: { back, front } };
  })();

  /* ------------------------------------------------------------------------
     08 — Director
     Owns the render loop: camera framing per mode, pointer parallax, the
     flicker that ties DOM lighting to the canvas fire, screen shake, and a
     quality governor that sheds effects if the frame rate cannot keep up.
     ------------------------------------------------------------------------ */

  /** Per character, relative to the head centre: where a flame sits on top, where speech comes from. */
  const ANCHORS = {
    dog: { crown: [-8, -128], say: [100, -58] },
    cat: { crown: [4, -70], say: [98, -62] },
    human: { crown: [6, -108], say: [92, -66] },
    robot: { crown: [0, -120], say: [100, -64] },
    alien: { crown: [4, -98], say: [104, -62] },
  };

  const Director = (() => {
    const root = document.documentElement;
    const camEnv = $('#cam-env');
    const camCast = $('#cam-cast');
    const warm = $('#light-warm');
    const flash = $('#light-flash');
    const bubble = $('#bubble');
    const hudTemp = $('#hud-temp');
    const heatNoise = $('#heat-noise');
    const heatMap = $('#heat-map');
    const studio = $('#studio');
    const sheetQuery = window.matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)'); // stacked layout, see style.css
    const squatQuery = window.matchMedia('(max-height: 520px) and (orientation: landscape)');

    const WARMTH = [0, 0.38, 0.58, 0.82, 1];
    const HEAT_SCALE = [0, 5, 8, 12, 17];
    // World-space box the camera keeps in frame: the cast plus headroom for the speech bubble.
    // `who` is the character's own centre, `cast` the width of character + table without margins.
    const SUBJECT = { w: 660, h: 700, cx: 800, cy: 690, who: 690, cast: 620 };
    const heroTitle = $('#hero-title');
    const heroSub = $('.hero__sub');
    const bubbleBox = $('#bubble-btn');

    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let mode = 'hero';
    let level = 3;
    let quality = 'high';
    let forcedQuality = false;
    let last = 0;
    let clock = 0;
    let slow = 0;
    let grace = 2.5;
    let shake = 0;
    let flashLevel = 0;
    let nextBoom = 8;
    let lastHeat = 0;
    let lastHud = 0;
    let say = [0, 0];
    let bubbleSize = [0, 0];
    let bubbleLimit = vw;
    let interest = null; // world-space spot the camera should keep in view, see lookAt()
    let shadows = [];
    let onBoom = () => {};

    const cam = { x: 0, y: 0, zoom: 1.1, px: 0, py: 0 };
    const target = { x: 0, y: 0, zoom: 1.1 };
    const pointer = { x: 0, y: 0 };
    const frameCam = { x: 0, y: 0, zoom: 1, px: 0, py: 0 };

    const clampAbs = (value, limit) => Math.sign(value) * Math.min(Math.abs(value), Math.max(0, limit));

    /** Frame the cast inside whatever part of the screen the current mode leaves free. */
    function aim() {
      const k = Math.max(vw / WORLD.w, vh / WORLD.h);
      const sheet = sheetQuery.matches && !squatQuery.matches; // stacked layout: the studio is a bottom sheet
      // The part of the screen the cast may occupy; the speech bubble is kept inside it too
      let free = { x: 0, y: 0, w: vw, h: vh - 72 }; // view: everything above the dock
      let zoom = sheet ? 1.03 : 1.1;
      if (mode === 'hero') {
        if (sheet) {
          // Between the headline and the tagline (layout offsets, so entrance animations do not matter)
          const top = heroTitle.offsetTop + heroTitle.offsetHeight;
          free = { x: 0, y: top, w: vw, h: Math.max(140, heroSub.offsetTop - top - 8) };
        } else {
          free = { x: vw * 0.24, y: 0, w: vw * 0.76, h: vh };
        }
        zoom = sheet ? 0.94 : 1.26;
      } else if (mode === 'studio') {
        free = sheet
          ? { x: 0, y: 48, w: vw, h: Math.max(140, vh - studio.offsetHeight - 72) }
          : { x: 0, y: 0, w: vw - studio.offsetWidth - 36, h: vh };
        zoom = sheet ? 1 : 1.3;
      }
      bubbleLimit = free.x + free.w;
      zoom = Math.min(zoom, free.w / (SUBJECT.w * k), free.h / (SUBJECT.h * k));

      // Never look past the edge of the painting. On a phone the hero scrim and the sheet hide the
      // top/bottom, and with no pointer parallax a much smaller safety margin is enough.
      const margin = sheet ? 8 : 28;
      const covers = !sheet || mode === 'view';
      const centre = free.x + free.w / 2 - vw / 2;
      if (covers) zoom = Math.max(zoom, (vh + 2 * margin) / (WORLD.h * k));
      zoom = Math.min(
        Math.max(zoom, (vw + 2 * (Math.abs(centre) + margin)) / (WORLD.w * k)),
        Math.max(zoom, vh / (SUBJECT.h * k)),
      );

      // If the whole cast cannot fit in the free area, frame the character and let the table slide out
      const castWidth = SUBJECT.cast * k * zoom;
      const cramped = clamp((castWidth - free.w) / (castWidth * 0.25), 0, 1);
      let x = centre + cramped * (SUBJECT.cx - SUBJECT.who) * k * zoom;
      let y = free.y + free.h / 2 - vh / 2 - (SUBJECT.cy - WORLD.h / 2) * k * zoom;
      if (interest) {
        // Something off to the side needs a look: pan just far enough to bring it into the free area
        const px = vw / 2 + x + (interest[0] - WORLD.w / 2) * k * zoom;
        const py = vh / 2 + y + (interest[1] - WORLD.h / 2) * k * zoom;
        const padX = Math.min(120, free.w * 0.22);
        const padY = Math.min(90, free.h * 0.22);
        x += clamp(px, free.x + padX, free.x + free.w - padX) - px;
        y += clamp(py, free.y + padY, free.y + free.h - padY) - py;
      }
      // …and the studio panel hides the painting's right edge, so such a look may pan that much further
      const limit = Math.max(0, (WORLD.w * k * zoom - vw) / 2 - margin);
      x = clamp(x, -limit - (interest && mode === 'studio' && !sheet ? vw - bubbleLimit : 0), limit);
      if (covers) y = clampAbs(y, (WORLD.h * k * zoom - vh) / 2 - margin);
      Object.assign(target, { x, y, zoom });
    }

    /**
     * Keep a spot of the scene in view — `box` is where it is on screen right now — until
     * called again with null. Used while a piece of lettering is being edited.
     */
    function lookAt(box) {
      interest = null;
      if (box && (box.width || box.height)) {
        const scale = Math.max(vw / WORLD.w, vh / WORLD.h) * cam.zoom;
        interest = [
          WORLD.w / 2 + (box.left + box.width / 2 - vw / 2 - cam.x) / scale,
          WORLD.h / 2 + (box.top + box.height / 2 - vh / 2 - cam.y) / scale,
        ];
      }
      aim();
    }

    function measureBubble() {
      bubbleSize = [bubbleBox.offsetWidth, bubbleBox.offsetHeight];
    }

    function setQuality(tier) {
      quality = tier;
      root.dataset.quality = tier;
      FX.resize(vw, vh, tier);
    }

    function resize() {
      vw = window.innerWidth;
      vh = window.innerHeight;
      // The illustrated layers are the whole world, scaled to cover the screen (see .layer in style.css)
      const k = Math.max(vw / WORLD.w, vh / WORLD.h);
      root.style.setProperty('--world-w', `${n(WORLD.w * k, 2)}px`);
      root.style.setProperty('--world-h', `${n(WORLD.h * k, 2)}px`);
      FX.resize(vw, vh, quality);
      measureBubble();
      aim();
    }

    /** Called whenever the scene changes: refresh everything the loop reads from the config or the DOM. */
    function configure(config) {
      const env = ENVIRONMENTS[config.environment];
      const anchor = ANCHORS[config.character];
      level = levelOf(config);
      say = Scene.castToWorld(HEAD[0] + anchor.say[0], HEAD[1] + anchor.say[1]);
      shadows = [$('#shadow-l'), $('#shadow-r')];
      FX.configure({
        level,
        palette: env.palette,
        reflect: env.reflect,
        crown: Scene.castToWorld(HEAD[0] + anchor.crown[0], HEAD[1] + anchor.crown[1]),
      });
      nextBoom = Math.min(nextBoom, clock + rand(3, 7));
    }

    function setMode(next) {
      mode = next;
      aim();
    }

    /** Shake the camera and flash the frame; `side` (0–1) is where on screen it went off. */
    function boom(power = 1, side = Math.random()) {
      if (prefersReducedMotion()) return;
      shake = Math.max(shake, 9 * power);
      flashLevel = Math.max(flashLevel, 0.5 * power);
      flash.style.setProperty('--fx', `${Math.round(side * 100)}%`);
      FX.burst(side * vw, vh * rand(0.62, 0.86), Math.round(46 * power), 2.6);
      onBoom(power);
    }

    function tick(now) {
      window.requestAnimationFrame(tick);
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (document.hidden) return;
      clock += dt;
      const calm = prefersReducedMotion();
      const motion = calm ? 0.12 : 1;

      // Camera: ease towards the framing for the current mode (cut straight to it under reduced motion);
      // drift with the pointer for parallax
      const ease = calm ? 80 : 3.2;
      cam.x = damp(cam.x, target.x, ease, dt);
      cam.y = damp(cam.y, target.y, ease, dt);
      cam.zoom = damp(cam.zoom, target.zoom, ease, dt);
      const driftX = calm ? 0 : -pointer.x * 16 + Math.sin(clock * 0.21) * 5;
      const driftY = calm ? 0 : -pointer.y * 9 + Math.sin(clock * 0.17 + 2) * 3;
      cam.px = damp(cam.px, driftX, 4, dt);
      cam.py = damp(cam.py, driftY, 4, dt);

      // Catastrophes rumble; apocalypses go off every few seconds
      if (level >= 3 && clock > nextBoom) {
        boom(level === 4 ? 1 : 0.5);
        nextBoom = clock + (level === 4 ? rand(4, 9) : rand(11, 20));
      }
      shake = damp(shake, level === 4 && !calm ? 0.9 : 0, 5, dt);
      const sx = (noise(clock * 31) - 0.5) * 2 * shake;
      const sy = (noise(clock * 37 + 9) - 0.5) * 2 * shake;

      frameCam.x = cam.x + sx;
      frameCam.y = cam.y + sy;
      frameCam.zoom = cam.zoom;
      frameCam.px = cam.px;
      frameCam.py = cam.py;
      camEnv.style.transform = `translate3d(${n(frameCam.x + cam.px * 0.5, 2)}px,${n(frameCam.y + cam.py * 0.5, 2)}px,0) scale(${n(cam.zoom, 4)})`;
      camCast.style.transform = `translate3d(${n(frameCam.x + cam.px, 2)}px,${n(frameCam.y + cam.py, 2)}px,0) scale(${n(cam.zoom, 4)})`;

      FX.frame(dt, frameCam, motion);

      // Dynamic lighting: the same flicker that drives the canvas fire drives the DOM
      const flicker = calm ? 0.8 : FX.light.all;
      warm.style.opacity = n(WARMTH[level] * (0.62 + 0.38 * flicker), 3);
      if (shadows[0]) {
        shadows[0].style.opacity = n(calm ? 0.6 : 0.25 + 0.7 * FX.light.right, 2);
        shadows[1].style.opacity = n(calm ? 0.6 : 0.25 + 0.7 * FX.light.left, 2);
      }
      flashLevel = damp(flashLevel, 0, 5, dt);
      flash.style.opacity = flashLevel < 0.01 ? 0 : n(flashLevel, 3);

      // Speech bubble follows the character's head through every camera move, and stays on screen
      if (!bubble.hidden) {
        const [bx, by] = FX.toScreen(say[0], say[1], 1);
        const [width, height] = bubbleSize;
        const overflow = Math.min(0, bubbleLimit - 12 - (bx + 14 + width));
        const drop = clamp(height + 38 - by, 0, 36);
        bubble.style.transform = `translate3d(${n(bx)}px,${n(by + drop)}px,0)`;
        bubble.style.setProperty('--shift', `${Math.max(overflow, 44 - width)}px`);
      }

      // Real heat haze on the background (high quality only): wobble the turbulence a few times a second
      if (quality === 'high' && now - lastHeat > 66) {
        lastHeat = now;
        heatMap.setAttribute('scale', calm ? 0 : HEAT_SCALE[level]);
        heatNoise.setAttribute('baseFrequency', `${n(0.006 + Math.sin(clock * 0.9) * 0.0016, 5)} ${n(0.022 + Math.sin(clock * 1.3) * 0.006, 5)}`);
      }

      if (now - lastHud > 420) {
        lastHud = now;
        const base = CATALOG.chaos[level - 1].temp;
        hudTemp.textContent = `${Math.round(base * (1 + (noise(clock * 0.8) - 0.5) * 0.06)).toLocaleString('en-US')}°C`;
      }

      // Quality governor: sustained slow frames (under ~25 fps, so a 30 Hz display is left alone)
      // shed the most expensive effects, one tier at a time
      if (!forcedQuality && quality !== 'low') {
        if (grace > 0) {
          grace -= dt;
        } else {
          slow = Math.max(0, slow + (dt > 0.04 ? dt : -dt * 0.6));
          if (slow > 1.4) {
            slow = 0;
            grace = 3;
            setQuality(quality === 'high' ? 'medium' : 'low');
          }
        }
      }
    }

    function start() {
      const forced = new URLSearchParams(window.location.search).get('fx');
      forcedQuality = ['high', 'medium', 'low'].includes(forced);
      const modest = window.matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
      quality = forcedQuality ? forced : modest ? 'medium' : 'high';
      root.dataset.quality = quality;
      resize();
      Object.assign(cam, target);

      window.addEventListener('resize', resize);
      // Older engines without `overflow: clip` can still scroll the stage when focus moves inside it
      const stage = $('#stage');
      stage.addEventListener('scroll', () => stage.scrollTo(0, 0));
      window.addEventListener('pointermove', (event) => {
        if (event.pointerType === 'touch') return;
        pointer.x = (event.clientX / vw) * 2 - 1;
        pointer.y = (event.clientY / vh) * 2 - 1;
      }, { passive: true });
      document.addEventListener('visibilitychange', () => {
        last = performance.now();
        grace = Math.max(grace, 1.5);
      });
      // Web fonts change the size of the headline and the bubble: re-frame once they are in
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          measureBubble();
          aim();
        });
      }
      last = performance.now();
      window.requestAnimationFrame(tick);
    }

    return {
      start,
      configure,
      setMode,
      lookAt,
      boom,
      measureBubble,
      set onBoom(handler) { onBoom = handler; },
      get camera() { return frameCam; },
      get viewport() { return { vw, vh }; },
    };
  })();

  /* ------------------------------------------------------------------------
     09 — Sound
     Every sound is synthesised with Web Audio — no files to download. Nothing
     plays (and no AudioContext exists) until the visitor asks for it, which
     keeps us on the right side of browser autoplay policies.
     ------------------------------------------------------------------------ */

  const Sound = (() => {
    const LAYERS = [
      { id: 'fire', label: 'Fire', auto: () => true },
      { id: 'keys', label: 'Keys', auto: (c) => ['laptop', 'gaming', 'phone'].includes(c.activity) },
      { id: 'sirens', label: 'Sirens', auto: (c) => ['street', 'cyberpunk', 'space'].includes(c.environment) || levelOf(c) === 4 },
      { id: 'office', label: 'Office', auto: (c) => ['office', 'boardroom'].includes(c.environment) },
    ];
    const INTENSITY = [0, 0.35, 0.6, 0.85, 1.15];

    let ctx = null;
    let master = null;
    let white = null;
    let brown = null;
    let enabled = false;
    let nap = 0;
    let config = { ...DEFAULTS };
    const manual = {}; // layers the visitor switched by hand; everything else follows the scene
    const bus = {};
    const nodes = {};
    const tickers = [];

    const isOn = (id) => (id in manual ? manual[id] : LAYERS.find((layer) => layer.id === id).auto(config));
    const intensity = () => INTENSITY[levelOf(config)];

    /** Register a self-rescheduling timer; `fn` returns the delay to its next call in ms. See setAwake(). */
    function every(fn) {
      const ticker = {
        handle: 0,
        // The audio clock takes a moment to (re)start: idle until it is actually running
        run() { ticker.handle = window.setTimeout(ticker.run, ctx.state === 'running' ? fn() : 300); },
      };
      tickers.push(ticker);
    }

    /** The audio clock and the timers only run while there is something to hear. */
    function setAwake(awake, linger = 0) {
      window.clearTimeout(nap);
      for (const ticker of tickers) {
        window.clearTimeout(ticker.handle);
        if (awake) ticker.handle = window.setTimeout(ticker.run, 200);
      }
      if (awake) ctx.resume();
      else nap = window.setTimeout(() => ctx.suspend(), linger); // let a fade-out finish first
    }

    function noiseBuffer(seconds, colour) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < data.length; i++) {
        const sample = Math.random() * 2 - 1;
        if (colour === 'brown') {
          lastOut = (lastOut + 0.02 * sample) / 1.02;
          data[i] = lastOut * 3.5;
        } else {
          data[i] = sample;
        }
      }
      return buffer;
    }

    const gain = (value, to) => {
      const node = ctx.createGain();
      node.gain.value = value;
      if (to) node.connect(to);
      return node;
    };
    const filter = (type, frequency, q, to) => {
      const node = ctx.createBiquadFilter();
      node.type = type;
      node.frequency.value = frequency;
      node.Q.value = q;
      if (to) node.connect(to);
      return node;
    };
    const loop = (buffer, to) => {
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.connect(to);
      node.start();
      return node;
    };
    const osc = (type, frequency, to) => {
      const node = ctx.createOscillator();
      node.type = type;
      node.frequency.value = frequency;
      if (to) node.connect(to);
      node.start();
      return node;
    };

    /** A short burst of filtered noise with an exponential tail: crackles, key clicks. */
    function click(to, { frequency, q = 1, type = 'bandpass', level, decay, pan = 0 }) {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = white;
      source.playbackRate.value = rand(0.7, 1.6);
      const envelope = gain(0);
      envelope.gain.setValueAtTime(level, now);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1);
      if (panner.pan) panner.pan.value = pan;
      source.connect(filter(type, frequency, q, envelope));
      envelope.connect(panner).connect(to);
      source.start(now, rand(0, 1.5), decay + 0.05);
    }

    function buildFire() {
      nodes.rumble = gain(0.5, bus.fire);
      loop(brown, filter('lowpass', 380, 0.5, nodes.rumble));
      loop(white, filter('bandpass', 2600, 0.5, gain(0.03, bus.fire)));
      every(() => {
        const power = intensity();
        click(bus.fire, { frequency: rand(1600, 5200), q: 1.4, level: rand(0.05, 0.34) * power, decay: rand(0.02, 0.1), pan: rand(-0.8, 0.8) });
        return rand(25, 190) / power;
      });
    }

    function buildKeys() {
      let streak = 0;
      every(() => {
        if (!isOn('keys')) return 500;
        const phone = config.activity === 'phone';
        const gaming = config.activity === 'gaming';
        click(bus.keys, { type: 'highpass', frequency: phone ? 900 : rand(1400, 2400), level: phone ? 0.05 : rand(0.07, 0.14), decay: phone ? 0.05 : 0.03, pan: rand(-0.2, 0.3) });
        if (phone) return rand(500, 1500);
        streak = streak > 0 ? streak - 1 : Math.round(rand(4, 16));
        if (streak === 0) return rand(350, 1300);
        return gaming ? rand(45, 120) : rand(70, 190);
      });
    }

    function buildSirens() {
      const out = filter('lowpass', 1150, 0.7, gain(1, bus.sirens));
      const echo = ctx.createDelay(1);
      echo.delayTime.value = 0.31;
      out.connect(echo).connect(gain(0.32, out));
      nodes.sirenLevel = gain(0.02, out);
      nodes.sirenA = osc('sawtooth', 760, nodes.sirenLevel);
      nodes.sirenB = osc('sawtooth', 764, nodes.sirenLevel);
      nodes.wail = osc('sine', 0.22);
      nodes.wailDepth = gain(250);
      nodes.wail.connect(nodes.wailDepth);
      nodes.wailDepth.connect(nodes.sirenA.frequency);
      nodes.wailDepth.connect(nodes.sirenB.frequency);
      // A very slow swell so the siren seems to pass by, fade into the distance and come back
      osc('sine', 0.045, gain(0.018, nodes.sirenLevel.gain));
    }

    function buildOffice() {
      loop(brown, filter('lowpass', 170, 0.4, gain(0.3, bus.office)));
      osc('sine', 100, gain(0.008, bus.office));
      // Desk phone: a two-burst electronic trill nobody is going to answer
      every(() => {
        if (!isOn('office')) return 1500;
        const now = ctx.currentTime;
        const envelope = gain(0, filter('bandpass', 1300, 2, bus.office));
        const tone = osc('square', 980, envelope);
        const trill = osc('square', 22, gain(170, tone.frequency));
        for (const start of [0, 1]) {
          envelope.gain.setValueAtTime(0.022, now + start);
          envelope.gain.setValueAtTime(0, now + start + 0.7);
        }
        tone.stop(now + 2);
        trill.stop(now + 2);
        return rand(9000, 19000);
      });
      // Printer: still trying
      every(() => {
        if (!isOn('office')) return 2000;
        const now = ctx.currentTime;
        const source = ctx.createBufferSource();
        source.buffer = white;
        const band = filter('bandpass', 600, 3);
        band.frequency.linearRampToValueAtTime(1500, now + 1.6);
        const envelope = gain(0, bus.office);
        envelope.gain.linearRampToValueAtTime(0.03, now + 0.1);
        envelope.gain.setValueAtTime(0.03, now + 1.5);
        envelope.gain.linearRampToValueAtTime(0, now + 1.7);
        source.connect(band).connect(envelope);
        source.start(now, 0, 1.8);
        return rand(13000, 26000);
      });
    }

    function init() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      const limiter = ctx.createDynamicsCompressor();
      limiter.connect(ctx.destination);
      master = gain(0, limiter);
      white = noiseBuffer(2, 'white');
      brown = noiseBuffer(4, 'brown');
      for (const { id } of LAYERS) bus[id] = gain(0, master);
      buildFire();
      buildKeys();
      buildSirens();
      buildOffice();
      return true;
    }

    /** Push the current scene into the mix: layer levels, fire intensity, siren flavour. */
    function mix() {
      if (!ctx) return;
      const now = ctx.currentTime;
      const power = intensity();
      for (const { id } of LAYERS) bus[id].gain.setTargetAtTime(isOn(id) ? 1 : 0, now, 0.25);
      nodes.rumble.gain.setTargetAtTime(0.25 + 0.4 * power, now, 0.6);
      // Space stations get a two-tone klaxon; cities get the long wail
      const klaxon = config.environment === 'space';
      nodes.wail.type = klaxon ? 'square' : 'sine';
      nodes.wail.frequency.setTargetAtTime(klaxon ? 1.3 : 0.22, now, 0.1);
      nodes.wailDepth.gain.setTargetAtTime(klaxon ? 70 : 250, now, 0.1);
      for (const node of [nodes.sirenA, nodes.sirenB]) {
        node.type = klaxon ? 'square' : 'sawtooth';
        node.frequency.setTargetAtTime(klaxon ? 430 : 760, now, 0.1);
      }
    }

    function toggle(on = !enabled) {
      if (on && !ctx && !init()) return false;
      enabled = on;
      if (!ctx) return false;
      setAwake(on, 700);
      master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, on ? 0.4 : 0.12);
      mix();
      return enabled;
    }

    /** Low thump for explosions. */
    function boom(power = 1) {
      if (!enabled || !isOn('fire')) return;
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = brown;
      const low = filter('lowpass', 520, 0.8);
      low.frequency.exponentialRampToValueAtTime(50, now + 1.2);
      const envelope = gain(0, bus.fire);
      envelope.gain.setValueAtTime(0.9 * power, now);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      source.connect(low).connect(envelope);
      source.start(now, rand(0, 2), 1.6);
    }

    /** Tiny UI tick, only when sound is already on. */
    function blip(pitch = 1) {
      if (!enabled) return;
      const now = ctx.currentTime;
      const envelope = gain(0, master);
      envelope.gain.setValueAtTime(0.05, now);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      const tone = osc('sine', 720 * pitch, envelope);
      tone.frequency.exponentialRampToValueAtTime(480 * pitch, now + 0.09);
      tone.stop(now + 0.1);
    }

    document.addEventListener('visibilitychange', () => {
      if (ctx && enabled) setAwake(!document.hidden);
    });

    return {
      toggle,
      boom,
      blip,
      update(next) {
        config = next;
        mix();
      },
      setLayer(id, on) {
        manual[id] = on;
        mix();
      },
      layers: () => LAYERS.map(({ id, label }) => ({ id, label, on: isOn(id) })),
      get enabled() { return enabled; },
    };
  })();

  /* ------------------------------------------------------------------------
     10 — Capture
     PNG export and share links. The screenshot is a faithful re-composite of
     the live frame: each SVG layer is serialised with its *computed* styles
     (so every CSS animation is frozen exactly where it is), drawn through the
     current camera, and interleaved with the two FX canvases.
     ------------------------------------------------------------------------ */

  const Capture = (() => {
    const INLINE = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'transform-origin', 'transform-box', 'mix-blend-mode'];

    const loadImage = (src) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('A scene layer could not be rasterised'));
      image.src = src;
    });

    // Where in its cycle (ms) each lettering animation is easiest to read
    const LEGIBLE_AT = { rise: 450, beep: 2980, 'blink-led': 0, flick: 0 };

    /** A screenshot freezes every animation where it is; lettering should not be caught mid-blink or half faded. */
    function poseLettering() {
      for (const node of $$('#scene [data-slot]')) {
        if (!node.getAnimations) return;
        for (const animation of node.getAnimations({ subtree: true })) {
          if (animation.animationName in LEGIBLE_AT) animation.currentTime = LEGIBLE_AT[animation.animationName];
        }
      }
    }

    /** Standalone, style-inlined copy of a live SVG layer, rasterised to an <img>. */
    function rasterise(svg, resolution) {
      const clone = svg.cloneNode(true);
      const live = svg.querySelectorAll('*');
      const copy = clone.querySelectorAll('*');
      for (let i = 0; i < live.length; i++) {
        if (live[i].closest('defs')) continue;
        const computed = window.getComputedStyle(live[i]);
        let css = '';
        for (const property of INLINE) css += `${property}:${computed.getPropertyValue(property)};`;
        // Some engines serialise fragment references with the page URL; a standalone SVG needs them bare.
        copy[i].setAttribute('style', css.replace(/url\("?[^")]*#([^")]+)"?\)/g, 'url(#$1)'));
        copy[i].removeAttribute('class');
      }
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', Math.round(WORLD.w * resolution));
      clone.setAttribute('height', Math.round(WORLD.h * resolution));
      clone.removeAttribute('class');
      clone.removeAttribute('preserveAspectRatio');
      return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`);
    }

    /** Rounded rectangle as a sub-path (ctx.roundRect is still missing from some browsers in use). */
    function roundRect(ctx, x, y, w, h, r) {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    /**
     * A CSS-style elliptical radial gradient painted over the whole vw × vh frame. Centre and
     * radii are fractions of the frame, exactly as in `radial-gradient(rx ry at cx cy, …)`.
     */
    function ellipse(ctx, vw, vh, [cx, cy, rx, ry], stops) {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      for (const [offset, colour] of stops) gradient.addColorStop(offset, colour);
      ctx.save();
      ctx.translate(cx * vw, cy * vh);
      ctx.scale(rx * vw, ry * vh);
      ctx.fillStyle = gradient;
      ctx.fillRect(-cx / rx, -cy / ry, 1 / rx, 1 / ry);
      ctx.restore();
    }

    function drawBubble(ctx, scale) {
      const bubble = $('#bubble');
      if (bubble.hidden) return;
      const button = $('#bubble-btn');
      const box = button.getBoundingClientRect();
      const anchor = bubble.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      const size = parseFloat(style.fontSize);
      const radius = Math.min(28, box.height / 2);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.lineJoin = 'round';

      ctx.fillStyle = 'rgba(20,6,2,.5)';
      ctx.beginPath();
      roundRect(ctx, box.left + 7, box.top + 7, box.width, box.height, radius);
      ctx.fill();
      ctx.beginPath();
      roundRect(ctx, box.left, box.top, box.width, box.height, radius);
      ctx.moveTo(anchor.left, anchor.top);
      ctx.lineTo(anchor.left + 22, box.bottom - 2);
      ctx.lineTo(anchor.left + 50, box.bottom - 2);
      ctx.closePath();
      ctx.strokeStyle = '#1b0d08';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#fffdf5';
      ctx.fill();

      // Re-wrap the text the way the browser did
      ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
      ctx.fillStyle = '#1b0d08';
      ctx.textBaseline = 'middle';
      const padX = parseFloat(style.paddingLeft);
      const inner = box.width - padX - parseFloat(style.paddingRight) + 1;
      const fits = (text) => ctx.measureText(text).width <= inner;
      const lines = [];
      let line = '';
      for (let word of $('#bubble-text').textContent.split(/\s+/)) {
        if (line && !fits(`${line} ${word}`)) {
          lines.push(line);
          line = '';
        }
        // A word wider than the bubble breaks wherever it has to (overflow-wrap: anywhere)
        while (!line && word.length > 1 && !fits(word)) {
          let cut = word.length - 1;
          while (cut > 1 && !fits(word.slice(0, cut))) cut--;
          lines.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        line = line ? `${line} ${word}` : word;
      }
      lines.push(line);
      const lineHeight = size * 1.05;
      const top = box.top + box.height / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((text, i) => ctx.fillText(text, box.left + padX, top + i * lineHeight));
    }

    async function screenshot() {
      const { vw, vh } = Director.viewport;
      const cam = Director.camera;
      const scale = clamp(window.devicePixelRatio || 1, 1, 2);
      const k = Math.max(vw / WORLD.w, vh / WORLD.h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      const ctx = canvas.getContext('2d');
      const resolution = Math.min(2, k * cam.zoom * scale);
      poseLettering();
      const [env, cast] = await Promise.all([rasterise($('#layer-env'), resolution), rasterise($('#layer-cast'), resolution)]);

      const layer = (image, depth) => {
        const z = k * cam.zoom * scale;
        ctx.setTransform(z, 0, 0, z,
          (((vw - WORLD.w * k) / 2 - vw / 2) * cam.zoom + vw / 2 + cam.x + cam.px * depth) * scale,
          (((vh - WORLD.h * k) / 2 - vh / 2) * cam.zoom + vh / 2 + cam.y + cam.py * depth) * scale);
        ctx.drawImage(image, 0, 0, WORLD.w, WORLD.h);
      };
      const overlay = (source) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      };

      /** One of the DOM lighting overlays (see .light in style.css), at the strength it has on screen right now. */
      const light = (id, blend, paint) => {
        const style = window.getComputedStyle($(id));
        if (style.display === 'none') return;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.globalCompositeOperation = blend;
        ctx.globalAlpha = parseFloat(style.opacity);
        paint();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      };
      const linear = (x0, y0, x1, y1, stops) => {
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        for (const [offset, colour] of stops) gradient.addColorStop(offset, colour);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, vw, vh);
      };

      // Same stacking order as the page: room, back fire, cast, vignette, front fire, firelight, colour grade
      ctx.fillStyle = '#0b0503';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      layer(env, 0.5);
      overlay(FX.canvases.back);
      layer(cast, 1);
      light('#light-vignette', 'source-over', () => {
        ellipse(ctx, vw, vh, [0.5, 0.54, 0.78, 0.78], [[0, 'rgba(9,2,0,0)'], [0.52, 'rgba(9,2,0,0)'], [1, 'rgba(9,2,0,.62)']]);
        linear(0, 0, 0, vh * 0.22, [[0, 'rgba(8,3,2,.42)'], [1, 'rgba(8,3,2,0)']]);
      });
      overlay(FX.canvases.front);
      light('#light-warm', 'soft-light', () => {
        ellipse(ctx, vw, vh, [0.5, 1.12, 0.95, 0.7], [[0, 'rgba(255,160,60,.9)'], [0.44, 'rgba(255,96,20,.32)'], [0.74, 'rgba(255,96,20,0)']]);
        for (const cx of [-0.06, 1.06]) ellipse(ctx, vw, vh, [cx, 0.78, 0.55, 0.85], [[0, 'rgba(255,120,30,.6)'], [0.62, 'rgba(255,120,30,0)']]);
      });
      light('#light-grade', 'overlay', () => {
        linear(0, vh, 0, 0, [[0, 'rgba(255,98,16,.5)'], [0.46, 'rgba(196,44,8,.2)'], [1, 'rgba(34,4,0,.62)']]);
      });

      drawBubble(ctx, scale);

      // Signature
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      const mark = clamp(vw * 0.03, 18, 34);
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(0,0,0,.6)';
      ctx.shadowBlur = 14;
      ctx.font = `400 ${mark}px ${window.getComputedStyle($('#brand')).fontFamily}`;
      ctx.fillStyle = '#fff4e6';
      ctx.fillText('THIS IS FINE', mark, vh - mark);
      const width = ctx.measureText('THIS IS FINE').width;
      ctx.fillStyle = '#ff5a1f';
      ctx.fillText('.', mark + width, vh - mark);
      ctx.font = `500 ${Math.max(10, mark * 0.4)}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillStyle = 'rgba(255,233,210,.7)';
      ctx.textAlign = 'right';
      ctx.fillText(window.location.host || 'this is fine', vw - mark, vh - mark);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG encoding failed');
      const { character, environment } = Store.config;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `this-is-fine-${character}-${environment}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    }

    const shareUrl = () => `${window.location.origin}${window.location.pathname}?${Store.toQuery()}`;

    /** Native share sheet on touch devices, clipboard everywhere else. Resolves to what happened. */
    async function share() {
      const url = shareUrl();
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        try {
          await navigator.share({ title: 'This Is Fine.', text: Scene.describe(Store.config), url });
          return 'shared';
        } catch (error) {
          if (error.name === 'AbortError') return 'cancelled';
        }
      }
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        // Clipboard API needs a secure context; fall back to the classic hidden-field copy.
        const field = document.createElement('textarea');
        field.value = url;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(field);
        field.select();
        const ok = document.execCommand('copy');
        field.remove();
        if (!ok) return 'failed';
      }
      return 'copied';
    }

    return { screenshot, share, shareUrl };
  })();

  /* ------------------------------------------------------------------------
     11 — UI
     ------------------------------------------------------------------------ */

  /** Things the character says. One pool per option, so the commentary always fits the scene. */
  const QUIPS = {
    base: ['This is fine.', 'I’m okay with this.', 'Cozy.', 'Honestly? Could be worse.', 'It’s a dry heat.', 'Everything is under control.', 'No notes.', 'Smells like… productivity.', 'We’ll circle back on the fire.'],
    chaos: {
      mild: ['Is something burning? Nah.', 'Probably just the toaster.', 'Did someone light a candle?'],
      serious: ['Bit warm in here.', 'I’ll open a window. Later.', 'Someone should look into that.'],
      catastrophic: ['Things are heating up nicely.', 'I’ve seen worse. Not personally.', 'The vibes? Immaculate.'],
      apocalyptic: ['This is… still fine.', 'Ten out of ten. Would burn again.', 'Technically, fire is just fast oxidation.', 'New personal best.'],
    },
    character: {
      dog: ['Who’s a good boy? Me. I’m fine.', 'Sit. Stay. Fine.'],
      cat: ['I meant to do that.', 'I knocked the candle over. Worth it.', 'Finally, a sunbeam everywhere.'],
      human: ['Per my last email: fine.', 'I’ll expense the building.', 'This could have been an email.'],
      robot: ['TEMPERATURE: NOMINAL.', 'ERROR 200: OK.', 'FINE.EXE IS RESPONDING.', 'PANIC MODULE NOT FOUND.'],
      alien: ['Earth is… cozy.', 'So this is what you call “weather”.', 'We come in peace. You come in flames.'],
    },
    drink: {
      coffee: ['First coffee, then panic.', 'Still hot. Nice.'],
      tea: ['Keep calm and steep on.', 'Two sugars, no survivors.'],
      cocoa: ['Extra marshmallows. Pre-toasted.', 'It’s basically a campfire now.'],
      energy: ['Wings? I’ve got flames.', 'Sleep is for the unburnt.'],
      wine: ['A smoky vintage.', 'Notes of oak. And everything else.', 'Pairs well with doom.'],
    },
    activity: {
      laptop: ['Just circling back on this.', '“Hope this email finds you well.”', 'Deploying on a Friday.', 'Battery’s at 4%. That’s the real problem.'],
      book: ['Just one more chapter.', 'The plot is heating up.', 'Do not disturb.'],
      phone: ['Five more minutes.', 'Posting: “is this normal?”', 'Low battery. Now I’m worried.'],
      quiet: ['Inner peace. Outer inferno.', 'Breathe in. Breathe… carefully.', 'Namaste.'],
      gaming: ['One more level.', 'Can’t pause an online game.', 'Lag. Unbelievable.'],
    },
    environment: {
      classic: ['Just like the comic.', 'They don’t make rooms like this anymore.'],
      office: ['The fire has been escalated to management.', 'Let’s take this offline.', 'Great hustle, everyone.'],
      living: ['Home sweet home.', 'At least the heating bill is low.', 'Is the oven on? Whatever.'],
      street: ['Lovely evening for it.', 'Outdoor seating was a great idea.', 'Table for one, please.'],
      boardroom: ['Synergy.', 'Great quarter, team.', 'Let’s put a pin in the fire.'],
      space: ['Houston, we’re fine.', 'In space, no one can hear you cope.', 'One small step back from the flames.'],
      cyberpunk: ['High tech, low concern.', 'The future is bright. Very bright.', 'Rendering fire in real time. Impressive.'],
    },
  };

  const UI = (() => {
    const root = document.documentElement;
    const studio = $('#studio');
    const hero = $('#hero');
    const dock = $('#dock');
    const bubble = $('#bubble');
    const bubbleText = $('#bubble-text');
    const range = $('#chaos-range');
    const pages = { main: $('#page-main'), text: $('#page-text') };
    const textFields = $('#text-fields');
    const selects = {};
    let mode = 'hero';
    let page = 'main';
    let quipTimer = 0;
    let heldUntil = 0;
    let busy = false;

    /* — Toasts — */

    function toast(message, icon = 'flame') {
      const item = document.createElement('div');
      item.className = 'toast';
      item.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${icon}"/></svg><span></span>`;
      item.lastElementChild.textContent = message;
      $('#toasts').append(item);
      window.setTimeout(() => {
        item.classList.add('is-leaving');
        window.setTimeout(() => item.remove(), 400);
      }, 3200);
    }

    /* — Speech bubble — */

    /** Put a line in the bubble. `hold` (ms) keeps the banter from talking over it straight away. */
    function say(text, { pop = true, hold = 0 } = {}) {
      heldUntil = performance.now() + hold;
      bubbleText.textContent = text;
      bubble.hidden = false;
      if (pop) {
        bubble.classList.remove('is-pop');
        void bubble.offsetWidth; // restart the pop animation
        bubble.classList.add('is-pop');
      }
      Director.measureBubble();
    }

    /** Pick a line that fits the scene; `focus` biases it towards the option that just changed. */
    function quip(focus) {
      const wait = heldUntil - performance.now();
      if (wait > 0) {
        scheduleQuip(wait + 200);
        return;
      }
      const own = Store.customText('say');
      if (own) {
        // The visitor put words in the character's mouth: that is all it has to say
        window.clearTimeout(quipTimer);
        if (bubble.hidden || bubbleText.textContent !== own) say(own);
        return;
      }
      const config = Store.config;
      const now = new Date();
      let pool = focus ? QUIPS[focus][config[focus]] : [
        ...QUIPS.base,
        ...KEYS.flatMap((key) => QUIPS[key][config[key]]),
        ...(now.getHours() < 5 ? ['It’s the middle of the night. This is fine.'] : []),
        ...(now.getDay() === 1 ? ['Mondays, am I right?'] : []),
      ];
      pool = pool.filter((line) => line !== bubbleText.textContent && !(mode === 'hero' && line === 'This is fine.'));
      say(pick(pool));
      scheduleQuip();
    }

    function scheduleQuip(delay = rand(14000, 24000)) {
      window.clearTimeout(quipTimer);
      quipTimer = window.setTimeout(() => {
        if (document.hidden) scheduleQuip(4000);
        else quip();
      }, delay);
    }

    /* — Custom radio tiles — */

    function buildTiles(key, art) {
      const host = $(`#opt-${key}`);
      host.innerHTML = CATALOG[key].map((item) => `
        <label class="tile">
          <input class="sr-only" type="radio" name="${key}" value="${item.id}" aria-label="${item.name}">
          <span class="tile__art">${art(item.id)}</span>
          <span class="tile__name" aria-hidden="true">${item.short || item.name}</span>
        </label>`).join('');
      host.addEventListener('change', (event) => Store.set({ [key]: event.target.value }));
    }

    /* — Custom dropdown (ARIA select-only combobox) — */

    function buildSelect(key, iconFor) {
      const items = CATALOG[key];
      const host = $(`#select-${key}`);
      host.innerHTML = `
        <button class="select__trigger" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="list-${key}" aria-labelledby="name-${key} value-${key}">
          <span class="select__slot"></span>
          <span class="select__value" id="value-${key}"></span>
          <svg class="icon select__chev" aria-hidden="true"><use href="#i-chevron"/></svg>
        </button>`;
      const trigger = host.firstElementChild;
      const list = document.createElement('ul');
      list.className = 'select__list';
      list.id = `list-${key}`;
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-labelledby', `name-${key}`);
      list.innerHTML = items.map((item) => `
        <li class="select__option" role="option" id="option-${key}-${item.id}" data-value="${item.id}" aria-selected="false">
          ${iconFor(item)}
          <span class="select__option-text">${item.name}<small>${item.hint}</small></span>
          <svg class="icon icon--check" aria-hidden="true"><use href="#i-check"/></svg>
        </li>`).join('');
      $('#popovers').append(list);
      const options = $$('.select__option', list);
      let open = false;
      let active = 0;
      let typed = '';
      let typedAt = 0;

      function setActive(index, choose = false) {
        active = (index + items.length) % items.length;
        options.forEach((node, i) => node.classList.toggle('is-active', i === active));
        trigger.setAttribute('aria-activedescendant', options[active].id);
        options[active].scrollIntoView({ block: 'nearest' });
        if (choose) Store.set({ [key]: items[active].id }); // arrowing through the list previews live
      }

      /** The list lives outside the scrolling panel so it is never clipped; place it by hand. */
      function place() {
        const box = trigger.getBoundingClientRect();
        const { innerWidth: vw, innerHeight: vh } = window;
        const width = Math.min(Math.max(box.width, 304), vw - 24);
        // Size first, measure second: the width decides how the hints wrap, and so how tall the list is
        list.style.width = `${width}px`;
        list.style.maxHeight = 'none';
        const below = vh - box.bottom - 20;
        const above = box.top - 20;
        const wanted = list.scrollHeight;
        const up = below < wanted && above > below;
        const height = Math.min(wanted, up ? above : below);
        list.style.maxHeight = `${height}px`;
        list.style.left = `${clamp(box.left, 12, vw - width - 12)}px`;
        list.style.top = `${up ? box.top - 8 - height : box.bottom + 8}px`;
        list.style.setProperty('--origin', up ? 'bottom' : 'top');
      }

      function show() {
        open = true;
        place();
        list.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        setActive(items.findIndex((item) => item.id === Store.config[key]));
      }

      function hide() {
        if (!open) return;
        open = false;
        list.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-activedescendant');
      }

      function typeahead(char) {
        const now = performance.now();
        typed = now - typedAt > 700 ? char : typed + char;
        typedAt = now;
        const match = items.findIndex((item) => item.name.toLowerCase().startsWith(typed));
        if (match >= 0) setActive(match, true);
      }

      trigger.addEventListener('click', () => (open ? hide() : show()));
      trigger.addEventListener('keydown', (event) => {
        const { key: pressed } = event;
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (pressed.length === 1 && /\S/.test(pressed)) {
          event.preventDefault();
          if (!open) show();
          typeahead(pressed.toLowerCase());
          return;
        }
        if (!open) {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(pressed)) {
            event.preventDefault();
            show();
          }
          return;
        }
        const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: items.length - 1 };
        if (pressed in moves) {
          event.preventDefault();
          setActive(moves[pressed], true);
        } else if (pressed === 'Enter' || pressed === ' ') {
          event.preventDefault();
          Store.set({ [key]: items[active].id });
          hide();
        } else if (pressed === 'Escape') {
          event.preventDefault();
          event.stopPropagation(); // close the list, not the whole studio
          hide();
        } else if (pressed === 'Tab') {
          hide();
        }
      });
      trigger.addEventListener('blur', hide);
      list.addEventListener('pointerdown', (event) => event.preventDefault()); // keep focus on the trigger
      list.addEventListener('pointermove', (event) => {
        const node = event.target.closest('.select__option');
        if (node) setActive(options.indexOf(node));
      });
      list.addEventListener('click', (event) => {
        const node = event.target.closest('.select__option');
        if (!node) return;
        Store.set({ [key]: node.dataset.value });
        hide();
      });
      window.addEventListener('resize', hide);
      // Focusing the trigger can scroll the panel: follow it, and only give up once it has left the view
      const scroller = $('#studio-scroll');
      scroller.addEventListener('scroll', () => {
        if (!open) return;
        const box = trigger.getBoundingClientRect();
        const view = scroller.getBoundingClientRect();
        if (box.bottom < view.top || box.top > view.bottom) hide();
        else place();
      }, { passive: true });

      selects[key] = {
        hide,
        sync(value) {
          const item = option(key, value);
          $('.select__value', host).textContent = item.name;
          $('.select__slot', host).innerHTML = iconFor(item);
          options.forEach((node) => node.setAttribute('aria-selected', String(node.dataset.value === value)));
        },
      };
    }

    /* — Sound controls — */

    function syncSound() {
      const on = Sound.enabled;
      root.dataset.sound = on ? 'on' : 'off';
      $('#sound-switch').setAttribute('aria-checked', String(on));
      $('#sound-hint').textContent = on ? 'Mixed live to fit the scene' : 'Off until you say so';
      $('#dock-sound').setAttribute('aria-pressed', String(on));
      for (const layer of Sound.layers()) {
        $(`#sound-chips [data-layer="${layer.id}"]`).setAttribute('aria-pressed', String(layer.on));
      }
    }

    function setSound(on) {
      const result = Sound.toggle(on);
      if (on && !result) toast('This browser cannot play the ambience.', 'sound-off');
      Store.setSound(result);
      syncSound();
      // The layer mixer unfolds at the very bottom of the panel: bring it into view once it has
      if (result && mode === 'studio') {
        const scroller = $('#studio-scroll');
        window.setTimeout(() => scroller.scrollTo({ top: scroller.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }), 460);
      }
    }

    /** The visitor wanted sound last time: bring it back on their first interaction (autoplay rules). */
    function armSound() {
      const wake = () => {
        window.removeEventListener('pointerdown', wake);
        window.removeEventListener('keydown', wake);
        if (!Sound.enabled) setSound(true);
      };
      window.addEventListener('pointerdown', wake);
      window.addEventListener('keydown', wake);
    }

    /* — Customize text: one field for every piece of lettering in the scene — */

    /** Point out the lettering a field belongs to: light it up and pan it into view (null: stop). */
    function spotlight(id) {
      const node = Lettering.highlight(id);
      bubble.classList.toggle('is-editing', id === 'say');
      Director.lookAt(node ? node.getBoundingClientRect() : null);
    }

    /** Reflect the store in one field (or, with no id, all of them) and in the "edited" badge. */
    function syncText(id) {
      for (const field of $$(id ? `.text-field[data-slot="${id}"]` : '.text-field', textFields)) {
        const own = Store.customText(field.dataset.slot);
        const input = $('input', field);
        if (document.activeElement !== input) input.value = own; // never fight the visitor's typing
        field.classList.toggle('is-custom', Boolean(own));
      }
      const edited = Lettering.present().filter((slotId) => Store.customText(slotId)).length;
      const badge = $('#text-badge');
      badge.hidden = !edited;
      badge.textContent = `${edited} edited`;
      $('#text-reset').setAttribute('aria-disabled', String(!Store.hasTexts));
    }

    function buildTextFields() {
      spotlight(null);
      let group = '';
      let html = '';
      for (const id of Lettering.present()) {
        const spec = TEXT_SLOTS[id];
        if (spec.group !== group) {
          html += `${group ? '</div>' : ''}<div class="text-group" role="group" aria-label="${spec.group}"><p class="text-group__title" aria-hidden="true">${spec.group}</p>`;
          group = spec.group;
        }
        html += `
          <div class="text-field" data-slot="${id}">
            <label class="text-field__label" for="text-${id}">${spec.label}</label>
            <div class="text-field__box">
              <input class="text-field__input" id="text-${id}" type="text" maxlength="${spec.max}" autocomplete="off" spellcheck="false" enterkeyhint="done"${spec.hint ? ` aria-describedby="hint-${id}"` : ''}>
              <button class="text-field__undo" type="button" aria-label="${spec.label}: restore the original text"><svg class="icon" aria-hidden="true"><use href="#i-reset"/></svg></button>
            </div>
            ${spec.hint ? `<p class="text-field__hint" id="hint-${id}">${spec.hint}</p>` : ''}
          </div>`;
      }
      textFields.innerHTML = `${html}</div>`;
      // The original wording is the placeholder: it shows what an empty field falls back to
      for (const field of $$('.text-field', textFields)) $('input', field).placeholder = Store.baseText(field.dataset.slot) || 'Blank';
      syncText();
    }

    /** The studio has two pages: the generator ('main') and the lettering editor ('text'). */
    function showPage(next, { focus = true, animate = true } = {}) {
      const turned = next !== page;
      page = next;
      // Once the visitor starts paging, content slides in as a whole instead of re-running the staggered entrance
      studio.toggleAttribute('data-paged', animate);
      studio.style.setProperty('--page-from', next === 'text' ? '28px' : '-28px');
      for (const [name, node] of Object.entries(pages)) {
        node.hidden = name !== next;
        node.classList.toggle('is-entering', animate && turned && name === next);
      }
      Object.values(selects).forEach((select) => select.hide());
      spotlight(null);
      if (next === 'text') buildTextFields();
      if (focus) {
        // On touch screens focusing a field would throw the keyboard up uninvited
        const touch = window.matchMedia('(pointer: coarse)').matches;
        const node = next === 'text' ? $(touch ? '#text-back' : '.text-field__input', pages.text) : $('#btn-text');
        node.focus({ preventScroll: true });
      }
    }

    function initText() {
      const slotOf = (node) => node.closest('.text-field').dataset.slot;
      textFields.addEventListener('input', (event) => Store.setText(slotOf(event.target), event.target.value));
      // Leaving a field tidies it up to what was actually stored (trimmed, single spaces)
      textFields.addEventListener('change', (event) => { event.target.value = Store.customText(slotOf(event.target)); });
      textFields.addEventListener('focusin', (event) => {
        if (event.target.matches('input')) spotlight(slotOf(event.target));
      });
      textFields.addEventListener('focusout', () => spotlight(null));
      textFields.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.isComposing && event.target.matches('input')) event.target.blur();
      });
      textFields.addEventListener('click', (event) => {
        const undo = event.target.closest('.text-field__undo');
        if (!undo) return;
        Store.setText(slotOf(undo), '');
        $('input', undo.parentElement).focus();
      });

      Store.onText((id) => {
        Lettering.refresh(id);
        syncText(id);
        // The speech bubble is lettering too: a line of the visitor's own stays put, without one the banter resumes
        if ((id && id !== 'say') || mode === 'hero') return;
        say(Store.text('say'), { pop: false });
        if (Store.customText('say')) window.clearTimeout(quipTimer);
        else scheduleQuip();
      });
    }

    /* — Keep every control in step with the store — */

    function sync(config) {
      for (const key of ['character', 'drink']) {
        const input = $(`input[name="${key}"][value="${config[key]}"]`);
        if (input) input.checked = true;
      }
      selects.activity.sync(config.activity);
      selects.environment.sync(config.environment);

      const level = levelOf(config);
      const chaos = option('chaos', config.chaos);
      const name = $('#chaos-name');
      if (name.textContent !== chaos.name) {
        name.textContent = chaos.name;
        name.classList.remove('is-bump');
        void name.offsetWidth;
        name.classList.add('is-bump');
      }
      range.value = String(level);
      range.setAttribute('aria-valuetext', chaos.name);
      range.style.setProperty('--p', `calc(14px + (100% - 28px) * ${(level - 1) / 3})`);
      $('#chaos-index').textContent = `0${level}`;
      $$('.pip').forEach((pip, i) => {
        pip.classList.toggle('is-lit', i < level);
        pip.setAttribute('aria-checked', String(i === level - 1));
        pip.tabIndex = i === level - 1 ? 0 : -1;
      });
      syncSound();
    }

    /* — Modes: hero → studio → view — */

    function setMode(next, { focus = true } = {}) {
      mode = next;
      root.dataset.mode = next;
      studio.inert = next !== 'studio';
      hero.inert = next !== 'hero';
      dock.inert = next !== 'view';
      Object.values(selects).forEach((select) => select.hide());
      // The studio always opens on its first page; a page left open keeps showing while it slides away
      if (next === 'studio') showPage('main', { focus: false, animate: false });
      else spotlight(null);
      Director.setMode(next);

      if (next === 'hero') {
        // The headline already says it; let the character chime in a moment later with something else
        bubble.hidden = true;
        scheduleQuip(2600);
      } else if (bubble.hidden) {
        say(Store.text('say'));
        if (!Store.customText('say')) scheduleQuip();
      }
      if (focus) {
        const targets = { hero: '#cta-create', studio: 'input[name="character"]:checked', view: '#dock-edit' };
        const node = $(targets[next]);
        if (node) node.focus({ preventScroll: true });
      }
    }

    const closeStudio = () => setMode(Store.hasCreation ? 'view' : 'hero');

    /** Straight to the lettering editor, from wherever the visitor is. */
    function editText() {
      if (mode !== 'studio') setMode('studio', { focus: false });
      showPage('text');
    }

    /* — Actions — */

    function randomize() {
      const next = {};
      for (const key of KEYS) {
        next[key] = pick(CATALOG[key].filter((item) => item.id !== Store.config[key])).id;
      }
      Eggs.roll();
      Store.set(next);
      Director.boom(0.7, 0.5);
      if (mode === 'hero') setMode('view');
      toast(pick(['Chaos, generated.', 'Fate has spoken.', 'Sure. Why not.', 'A bold choice. Not yours, but bold.']), 'dice');
    }

    async function screenshot() {
      if (busy) return;
      busy = true;
      try {
        await Capture.screenshot();
        toast('Screenshot saved. Frame it.', 'camera');
      } catch (error) {
        console.error(error);
        toast('The screenshot went up in smoke. Try again?', 'camera');
      }
      busy = false;
    }

    async function share() {
      const result = await Capture.share();
      if (result === 'copied') toast('Link copied. Spread the calm.', 'link');
      if (result === 'failed') toast(Capture.shareUrl(), 'link');
    }

    function done() {
      Store.keep();
      setMode('view');
      toast('Saved. It’ll still be burning when you come back.', 'check');
    }

    function reset() {
      Store.reset();
      setMode('hero');
      toast('Back to the original. Still fine.', 'reset');
    }

    function resetText() {
      if (!Store.hasTexts) return;
      Store.clearTexts();
      toast('Original wording restored.', 'reset');
    }

    function setLevel(level) {
      Store.set({ chaos: CATALOG.chaos[clamp(level, 1, 4) - 1].id });
    }

    /* — Wiring — */

    function init() {
      buildTiles('character', Scene.avatar);
      buildTiles('drink', Scene.drinkIcon);
      buildSelect('activity', (item) => `<span class="select__icon" aria-hidden="true"><svg class="icon"><use href="#i-${item.id}"/></svg></span>`);
      buildSelect('environment', (item) => `<span class="select__icon select__icon--swatch" aria-hidden="true" style="--swatch:linear-gradient(160deg, ${item.swatch[0]}, ${item.swatch[1]})"></span>`);
      initText();

      // Disaster level in the dock: a radio group, so one tab stop and arrow keys to move through it
      const levels = $('#dock-levels');
      levels.innerHTML = CATALOG.chaos.map((item, i) =>
        `<button class="pip" type="button" role="radio" aria-checked="false" aria-label="${item.name}" tabindex="-1" style="--i:${i}"><i></i></button>`).join('');
      const pips = $$('.pip', levels);
      levels.addEventListener('click', (event) => {
        const pip = event.target.closest('.pip');
        if (pip) setLevel(pips.indexOf(pip) + 1);
      });
      levels.addEventListener('keydown', (event) => {
        const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
        const level = step ? clamp(Store.level + step, 1, 4) : { Home: 1, End: 4 }[event.key];
        if (!level) return;
        event.preventDefault();
        setLevel(level);
        pips[level - 1].focus();
      });

      $('#sound-chips').innerHTML = Sound.layers().map((layer) =>
        `<button class="chip" type="button" data-layer="${layer.id}" aria-pressed="false"><span class="chip__eq" aria-hidden="true"><i></i><i></i><i></i></span>${layer.label}</button>`).join('');
      $('#sound-chips').addEventListener('click', (event) => {
        const chip = event.target.closest('.chip');
        if (!chip) return;
        Sound.setLayer(chip.dataset.layer, chip.getAttribute('aria-pressed') !== 'true');
        if (Sound.enabled) syncSound();
        else setSound(true);
      });

      range.addEventListener('input', () => setLevel(Number(range.value)));
      const actions = {
        'cta-create': () => setMode('studio'),
        'cta-random': randomize,
        'dock-edit': () => setMode('studio'),
        'dock-random': randomize,
        'dock-shot': screenshot,
        'dock-share': share,
        'dock-sound': () => setSound(!Sound.enabled),
        'studio-close': closeStudio,
        'btn-text': () => showPage('text'),
        'btn-random': randomize,
        'btn-shot': screenshot,
        'btn-share': share,
        'btn-done': done,
        'btn-reset': reset,
        'text-back': () => showPage('main'),
        'text-reset': resetText,
        'text-done': done,
        'sound-switch': () => setSound(!Sound.enabled),
        'bubble-btn': () => {
          quip();
          Eggs.poke();
        },
      };
      for (const [id, handler] of Object.entries(actions)) $(`#${id}`).addEventListener('click', handler);

      // Keyboard shortcuts — never while a dropdown is taking type-ahead input or a text field is being typed in
      document.addEventListener('keydown', (event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.target.closest('[role="combobox"]')) return;
        const key = event.key.toLowerCase();
        if (key === 'escape' && mode === 'studio') {
          if (page === 'text') showPage('main');
          else closeStudio();
        } else if (event.target.matches('input[type="text"]')) return;
        else if (key === 'r') randomize();
        else if (key === 's') screenshot();
        else if (key === 'l') share();
        else if (key === 'm') setSound(!Sound.enabled);
        else if (key === 'c') setMode(mode === 'studio' ? (Store.hasCreation ? 'view' : 'hero') : 'studio');
        else if (key === 't') {
          if (mode === 'studio' && page === 'text') showPage('main');
          else editText();
        } else if (/^[1-4]$/.test(key) && event.target !== range) setLevel(Number(key));
        else return;
        event.preventDefault();
      });

      // Let the chrome melt away when the visitor is just watching
      let idleTimer = 0;
      const wake = () => {
        delete root.dataset.idle;
        window.clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => { root.dataset.idle = ''; }, 5000);
      };
      for (const type of ['pointermove', 'pointerdown', 'keydown', 'focusin']) window.addEventListener(type, wake, { passive: true });
      wake();

      Store.subscribe((config, previous, changed) => {
        Scene.render(config, changed);
        Director.configure(config);
        Sound.update(config);
        Sound.blip(1 + levelOf(config) * 0.08);
        sync(config);
        // A different scene has different lettering
        if (mode === 'studio' && page === 'text') buildTextFields();
        else syncText();
        if (changed.some((key) => key !== 'chaos')) {
          const [x, y] = FX.toScreen(...Scene.castToWorld(60, -140));
          FX.burst(x, y, 26, 1.5);
        }
        // Comment on whatever just changed — but stay quiet on the hero, where the headline does the talking
        if (mode !== 'hero') quip(changed.length === 1 ? changed[0] : null);
      });

      sync(Store.config);
      syncText();
    }

    return { init, setMode, toast, quip, say, armSound };
  })();

  /* ------------------------------------------------------------------------
     12 — Easter eggs
     ------------------------------------------------------------------------ */

  const Eggs = (() => {
    const PROPS = ['duck', 'extinguisher', 'note', 'detector', 'mouse'];
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    const active = new Set();
    const state = { book: BOOK_TITLES[0], mug: '' };
    let pokes = [];
    let progress = 0;

    /** Each visit (and each "random chaos") hides a different pair of props in the scene. */
    function roll() {
      const pool = [...PROPS];
      active.clear();
      while (active.size < 2) active.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      state.book = pick(BOOK_TITLES);
      state.mug = Math.random() < 0.45 ? pick(['#1', 'FINE', 'OK', 'MON']) : '';
    }

    /** Poke the character: a little hop. Keep at it and the hat has had enough. */
    function poke() {
      const cast = $('.cast-root');
      if (!cast) return;
      cast.classList.remove('is-poked');
      void cast.getBoundingClientRect();
      cast.classList.add('is-poked');
      const now = performance.now();
      pokes = pokes.filter((time) => now - time < 2600);
      pokes.push(now);
      if (pokes.length >= 6 && !cast.classList.contains('is-hatless')) {
        pokes = [];
        cast.classList.add('is-hatless');
        UI.say(cast.querySelector('.hat') ? 'Hey. My hat.' : 'Rude.', { hold: 2600 });
        window.setTimeout(() => cast.classList.remove('is-hatless'), 5200);
      }
    }

    function init() {
      $('#layer-cast').addEventListener('click', (event) => {
        if (!event.target.closest('.character')) return;
        FX.burst(event.clientX, event.clientY, 10, 1);
        UI.quip();
        poke();
      });

      // ↑ ↑ ↓ ↓ ← → ← → B A
      document.addEventListener('keydown', (event) => {
        if (event.target.matches('input[type="text"]')) return;
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        progress = key === KONAMI[progress] ? progress + 1 : key === KONAMI[0] ? 1 : 0;
        if (progress < KONAMI.length) return;
        progress = 0;
        Store.set({ chaos: 'apocalyptic' });
        [0, 260, 620].forEach((delay, i) => window.setTimeout(() => Director.boom(1.3, [0.2, 0.8, 0.5][i]), delay));
        UI.toast('Cheat code accepted. Everything is now extra fine.');
      });

      const title = document.title;
      document.addEventListener('visibilitychange', () => {
        document.title = document.hidden ? '🔥 It’s still fine in here…' : title;
      });

      console.log('%cTHIS IS FINE.', 'font: 400 30px Impact, sans-serif; color: #ff7a18; text-shadow: 0 0 14px #ff3d00;');
      console.log('%cNo errors down here either. Probably. (Psst: ↑ ↑ ↓ ↓ ← → ← → B A)', 'color: #ffb347;');
    }

    return {
      init,
      roll,
      poke,
      has: (name) => active.has(name),
      get book() { return state.book; },
      get mug() { return state.mug; },
    };
  })();

  /* ------------------------------------------------------------------------
     13 — Boot
     ------------------------------------------------------------------------ */

  function boot() {
    const state = Store.load();
    Eggs.roll();
    Scene.render(Store.config);
    UI.init();
    Eggs.init();
    Director.configure(Store.config);
    Director.onBoom = (power) => Sound.boom(power);
    Sound.update(Store.config);
    Director.start();
    // First visit: the untouched original behind the headline. Returning or shared: straight to the creation.
    UI.setMode(Store.hasCreation ? 'view' : 'hero', { focus: false });
    if (state.sound) UI.armSound();
    document.documentElement.dataset.ready = '';
  }

  boot();
})();
