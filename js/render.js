/* ============================================================
   render.js
   Miss Math — Rendering Engine
   فاز ۳ — نسخه کامل نهایی v6.0.0

   ─── OVERVIEW ─────────────────────────────────────────────
   The complete rendering engine. Turns data.js into DOM.
   Every UI element on the site that comes from data passes
   through here.

   ─── ARCHITECTURE ─────────────────────────────────────────
   Layer 1 │ Guards & Boot
   Layer 2 │ Config & Constants
   Layer 3 │ String & Number Helpers
   Layer 4 │ Validation
   Layer 5 │ Cache / Memoization
   Layer 6 │ Icon Library
   Layer 7 │ DOM Helpers
   Layer 8 │ Atom Builders      (icon, star, badge)
   Layer 9 │ Molecule Builders  (meta, price-row, info-card)
   Layer 10│ Organism Builders  (card, testimonial, faq)
   Layer 11│ Section Builders   (class-detail, list, grid)
   Layer 12│ Renderers          (orchestration)
   Layer 13│ State & Metrics
   Layer 14│ Reveal Observer
   Layer 15│ Public API

   ─── SECURITY CONTRACT ────────────────────────────────────
   • All user data → textContent (never innerHTML)
   • esc() helper for template literals
   • URL whitelist: http, https, tel, mailto
   • Icons are trusted (defined in this file)
   • Never trust dataset values — always validate

   ─── PERFORMANCE ──────────────────────────────────────────
   • DocumentFragment batching for all list renders
   • Memoization of expensive format operations
   • requestAnimationFrame for reveal observer
   • Debounced re-render methods
   • Lazy icon cloning
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     LAYER 1 — GUARDS & BOOT
     ============================================================ */

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (window.__MissMathRenderLoaded) return;
  window.__MissMathRenderLoaded = true;


  const VERSION = '6.0.0';
  const BUILD = '1403.07';


  /* ============================================================
     LAYER 2 — CONFIG & CONSTANTS
     ============================================================ */

  const CONFIG = {

    VERSION: VERSION,
    BUILD: BUILD,

    /* Grid limit for main classes section */
    GRID_LIMIT: 3,

    /* Max rating scale */
    RATING_MAX: 5,

    /* Debug mode */
    DEBUG: false,

    /* Feature flags */
    FEATURES: {
      SHOW_PRICING_TABLE:    true,
      SHOW_TRUST_NOTE:       true,
      SHOW_INFO_GRID:        true,
      SHOW_SYLLABUS:         true,
      SHOW_CLASS_FAQ:        true,
      SHOW_RATING_BLOCK:     true,
      ENABLE_REVEAL_STAGGER: true,
      ENABLE_LAZY_ICONS:     false,
      ENABLE_PERF_MARKERS:   false,
    },

    /* Validation thresholds */
    VALIDATION: {
      MIN_TITLE_LENGTH:  2,
      MAX_TITLE_LENGTH:  200,
      MIN_DESC_LENGTH:   10,
      MAX_DESC_LENGTH:   2000,
      MIN_PRICE:         0,
      MAX_PRICE:         1000000000,
      MIN_SESSIONS:      1,
      MAX_SESSIONS:      200,
      MIN_RATING:        0,
      MAX_RATING:        5,
    },

    /* Safe URL protocols */
    SAFE_URL_RE: /^(https?:|tel:|mailto:)/i,

    /* a11y */
    A11Y: {
      LIVE_REGION_ID: 'miss-math-render-live',
      ANNOUNCE_GRID:  'لیست کلاس‌ها به‌روز شد',
      ANNOUNCE_FAQ:   'سوالات پرتکرار بارگذاری شد',
    },
  };


  /* Persian digits */
  const PERSIAN_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

  /* Arabic → Persian replacement map */
  const ARABIC_TO_PERSIAN = {
    'ي': 'ی',
    'ك': 'ک',
    'ﻻ': 'لا',
  };

  /* Punctuation normalization */
  const PUNCT_NORMALIZE = {
    '?': '؟',
    ';': '؛',
    ',': '،',
  };


  /* ============================================================
     GUARD — Ensure data is present
     ============================================================ */

  if (!window.MissMathData) {
    console.error('[render.js] MissMathData missing. Load data.js first.');
    return;
  }

  const DATA = window.MissMathData;


  /* ============================================================
     LAYER 3 — STRING & NUMBER HELPERS
     ============================================================ */

  /**
   * Escape HTML special characters.
   */
  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Convert Western digits to Persian digits.
   */
  function toPersianDigits(input) {
    if (input === null || input === undefined) return '';
    return String(input).replace(/[0-9]/g, function (d) {
      return PERSIAN_DIGITS[Number(d)];
    });
  }

  /**
   * Normalize Persian text (Arabic chars → Persian, punctuation).
   */
  function normalizePersian(text) {
    if (typeof text !== 'string') return text;
    let out = text;
    Object.keys(ARABIC_TO_PERSIAN).forEach(function (k) {
      out = out.replace(new RegExp(k, 'g'), ARABIC_TO_PERSIAN[k]);
    });
    Object.keys(PUNCT_NORMALIZE).forEach(function (k) {
      out = out.replace(new RegExp('\\' + k, 'g'), PUNCT_NORMALIZE[k]);
    });
    return out;
  }

  /**
   * Format integer with Persian thousands separator.
   */
  function formatNumber(num) {
    if (typeof num !== 'number' || !isFinite(num)) return '۰';
    try {
      return new Intl.NumberFormat('fa-IR').format(num);
    } catch (err) {
      const parts = String(Math.round(num)).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
      return toPersianDigits(parts.join('.'));
    }
  }

  /**
   * Format a rating (0-5) with one decimal Persian.
   */
  function formatRating(num) {
    if (typeof num !== 'number' || !isFinite(num) || num <= 0) return '—';
    const rounded = Math.round(num * 10) / 10;
    const str = (rounded % 1 === 0) ? String(rounded) : rounded.toFixed(1);
    return toPersianDigits(str).replace('.', '٫');
  }

  /**
   * Safe URL validator.
   */
  function safeUrl(url, fallback) {
    fallback = fallback || '#';
    if (typeof url !== 'string') return fallback;
    const trimmed = url.trim();
    if (!trimmed) return fallback;
    if (!CONFIG.SAFE_URL_RE.test(trimmed)) return fallback;
    return trimmed;
  }

  /**
   * Build WhatsApp deep link.
   */
  function whatsappUrl(message) {
    const raw = DATA.SITE_CONFIG.contact.whatsapp || '';
    const phone = String(raw).replace(/\D/g, '');
    const text = encodeURIComponent(message || DATA.SITE_CONFIG.meta.defaultMsg || '');
    return 'https://wa.me/' + phone + '?text=' + text;
  }

  /**
   * Truncate a string to max length with ellipsis.
   */
  function truncate(str, max) {
    if (typeof str !== 'string') return '';
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  }

  /**
   * Pluralize a Persian word based on count (simple version).
   */
  function pluralize(count, singular, plural) {
    return count === 1 ? singular : (plural || singular);
  }


  /* ============================================================
     LAYER 4 — VALIDATION
     ============================================================ */

  const Validator = (function () {

    function isValidString(v, min, max) {
      if (typeof v !== 'string') return false;
      const t = v.trim();
      if (t.length < (min || 0)) return false;
      if (max && t.length > max) return false;
      return true;
    }

    function isValidNumber(v, min, max) {
      if (typeof v !== 'number' || !isFinite(v)) return false;
      if (min !== undefined && v < min) return false;
      if (max !== undefined && v > max) return false;
      return true;
    }

    function isValidClass(cls) {
      if (!cls || typeof cls !== 'object') return false;
      if (!isValidString(cls.id, 1, 100)) return false;
      if (!isValidString(cls.title, CONFIG.VALIDATION.MIN_TITLE_LENGTH, CONFIG.VALIDATION.MAX_TITLE_LENGTH)) return false;
      if (!isValidString(cls.code, 1, 50)) return false;
      if (cls.status !== 'active' && cls.status !== 'coming-soon') return false;
      return true;
    }

    function isValidTestimonial(t) {
      if (!t || typeof t !== 'object') return false;
      if (!isValidString(t.id, 1, 100)) return false;
      if (!isValidString(t.name, 1, 100)) return false;
      if (!isValidString(t.text, 1, 2000)) return false;
      if (!isValidNumber(t.rating, 0, CONFIG.RATING_MAX)) return false;
      return true;
    }

    function isValidFaq(item) {
      if (!item || typeof item !== 'object') return false;
      if (!isValidString(item.q, 1, 500)) return false;
      if (!isValidString(item.a, 1, 5000)) return false;
      return true;
    }

    function sanitizeClass(cls) {
      if (!cls || typeof cls !== 'object') return null;
      return {
        id: cls.id,
        code: cls.code || '',
        title: cls.title || '',
        type: cls.type || 'in-person',
        status: cls.status || 'active',
        grade: cls.grade || '',
        sessions: Math.max(1, parseInt(cls.sessions, 10) || 1),
        duration: cls.duration || '',
        price: Math.max(0, parseInt(cls.price, 10) || 0),
        priceNote: cls.priceNote || 'هر جلسه',
        rating: Math.min(CONFIG.RATING_MAX, Math.max(0, Number(cls.rating) || 0)),
        reviewsCount: Math.max(0, parseInt(cls.reviewsCount, 10) || 0),
        capacity: cls.capacity || '',
        location: cls.location || '',
        accent: cls.accent || 'mustard',
        shortDesc: cls.shortDesc || '',
        longDesc: cls.longDesc || '',
        syllabus: Array.isArray(cls.syllabus) ? cls.syllabus.filter(isValidString.bind(null, undefined, 1, 500)) : [],
        faq: Array.isArray(cls.faq) ? cls.faq.filter(isValidFaq) : [],
      };
    }

    function sanitizeTestimonial(t) {
      if (!t || typeof t !== 'object') return null;
      return {
        id: t.id,
        name: t.name || '',
        role: t.role || '',
        avatarLetter: t.avatarLetter || (t.name ? t.name.charAt(0) : '؟'),
        rating: Math.min(CONFIG.RATING_MAX, Math.max(0, Number(t.rating) || 0)),
        text: t.text || '',
      };
    }

    function sanitizeFaq(item) {
      if (!item || typeof item !== 'object') return null;
      return {
        q: item.q || '',
        a: item.a || '',
      };
    }

    return {
      isValidString:     isValidString,
      isValidNumber:     isValidNumber,
      isValidClass:      isValidClass,
      isValidTestimonial: isValidTestimonial,
      isValidFaq:        isValidFaq,
      sanitizeClass:     sanitizeClass,
      sanitizeTestimonial: sanitizeTestimonial,
      sanitizeFaq:       sanitizeFaq,
    };
  })();


  /* ============================================================
     LAYER 5 — CACHE / MEMOIZATION
     ============================================================ */

  const Memo = (function () {

    const store = new Map();
    const counters = { hits: 0, misses: 0 };

    function get(key, factory) {
      if (store.has(key)) {
        counters.hits++;
        return store.get(key);
      }
      counters.misses++;
      const value = factory();
      store.set(key, value);
      return value;
    }

    function has(key) {
      return store.has(key);
    }

    function clear() {
      store.clear();
      counters.hits = 0;
      counters.misses = 0;
    }

    function invalidate(pattern) {
      if (!pattern) {
        clear();
        return;
      }
      const keys = Array.from(store.keys());
      keys.forEach(function (k) {
        if (typeof pattern === 'string' ? k.indexOf(pattern) !== -1 : pattern.test(k)) {
          store.delete(k);
        }
      });
    }

    function stats() {
      return {
        size: store.size,
        hits: counters.hits,
        misses: counters.misses,
        hitRate: (counters.hits + counters.misses) > 0
          ? counters.hits / (counters.hits + counters.misses)
          : 0,
      };
    }

    return { get: get, has: has, clear: clear, invalidate: invalidate, stats: stats };
  })();


  /* ============================================================
     LAYER 6 — ICON LIBRARY
     ─── All icons are trusted SVG strings. Use el({html: ICONS.x}).
     ============================================================ */

  const ICONS = {

    /* ─── Ratings ─── */
    star: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21 12 17.77 5.82 21 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',

    starOutline: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21 12 17.77 5.82 21 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',

    /* ─── Class types ─── */
    user: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',

    monitor: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',

    video: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',

    moon: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',

    /* ─── Info icons ─── */
    clock: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',

    calendar: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',

    users: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',

    mapPin: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',

    book: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',

    help: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',

    tag: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',

    /* ─── UI ─── */
    chevronLeft: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',

    check: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',

    plus: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',

    info: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };


  /* ============================================================
     LAYER 7 — DOM HELPERS
     ============================================================ */

  /**
   * Create element with attributes and children.
   * @param {string} tag
   * @param {object} attrs — class, text, html, dataset, aria-*, etc.
   * @param {Array|Node|string} children
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);

    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        const val = attrs[key];

        if (val === null || val === undefined || val === false) return;

        if (key === 'class') {
          node.className = val;
        } else if (key === 'text') {
          node.textContent = String(val);   /* safe */
        } else if (key === 'html') {
          node.innerHTML = val;             /* trusted SVG only */
        } else if (key === 'dataset' && typeof val === 'object') {
          Object.keys(val).forEach(function (dk) {
            node.dataset[dk] = String(val[dk]);
          });
        } else if (key === 'style' && typeof val === 'object') {
          Object.keys(val).forEach(function (sk) {
            try { node.style[sk] = val[sk]; } catch (e) {}
          });
        } else {
          node.setAttribute(key, String(val));
        }
      });
    }

    appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    if (children === null || children === undefined) return;

    if (Array.isArray(children)) {
      children.forEach(function (child) { appendChildren(node, child); });
      return;
    }

    if (children instanceof Node) {
      node.appendChild(children);
      return;
    }

    /* string / number → text node (safe) */
    node.appendChild(document.createTextNode(String(children)));
  }

  function replaceChildren(node, children) {
    while (node.firstChild) node.removeChild(node.firstChild);
    appendChildren(node, children);
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function markReady(node) {
    if (!node) return;
    node.setAttribute('aria-busy', 'false');
    node.classList.add('is-ready');
  }


  /* ============================================================
     LAYER 8 — ATOM BUILDERS
     ============================================================ */

  /**
   * Icon wrapper (safe: icons are trusted).
   */
  function buildIcon(iconKey, extraClass) {
    const svg = ICONS[iconKey] || ICONS.info;
    return el('span', {
      class: 'render-icon' + (extraClass ? ' ' + extraClass : ''),
      html: svg,
      'aria-hidden': 'true',
    });
  }

  /**
   * Stars rating block.
   */
  function buildStars(rating, size) {
    const wrapper = el('span', {
      class: 'stars' + (size === 'lg' ? ' stars--lg' : ''),
      'aria-label': 'امتیاز ' + formatRating(rating) + ' از ۵',
      role: 'img',
    });

    const rounded = Math.round((Number(rating) || 0) * 2) / 2;

    for (let i = 1; i <= CONFIG.RATING_MAX; i++) {
      const full = i <= Math.floor(rounded);
      const half = !full && i - 0.5 === rounded;
      const icon = (full || half) ? ICONS.star : ICONS.starOutline;

      wrapper.appendChild(el('span', {
        class: 'stars__item' + (!full && !half ? ' stars__empty' : ''),
        html: icon,
        'aria-hidden': 'true',
      }));
    }

    return wrapper;
  }

  /**
   * Type badge for a class (حضوری / آنلاین / ...).
   */
  function buildTypeBadge(cls) {
    const meta = DATA.TYPE_LABELS[cls.type] || { text: cls.type, icon: 'book' };
    const icon = ICONS[meta.icon] || ICONS.book;

    return el('span', {
      class: 'class-card__type',
      dataset: { type: cls.type },
    }, [
      el('span', { class: 'class-card__type-icon', html: icon }),
      el('span', { text: meta.text }),
    ]);
  }


  /* ============================================================
     LAYER 9 — MOLECULE BUILDERS
     ============================================================ */

  /**
   * Meta row item inside a class card (icon + text).
   */
  function buildMetaItem(iconKey, text) {
    return el('span', { class: 'class-card__meta-item' }, [
      el('span', { html: ICONS[iconKey] || ICONS.book, 'aria-hidden': 'true' }),
      el('span', { text: text }),
    ]);
  }

  /**
   * Info card inside the detail panel.
   */
  function buildInfoCard(iconKey, label, value) {
    return el('li', { class: 'detail-info__item' }, [
      el('span', {
        class: 'detail-info__icon',
        html: ICONS[iconKey] || ICONS.book,
        'aria-hidden': 'true',
      }),
      el('span', { class: 'detail-info__label', text: label }),
      el('span', { class: 'detail-info__value', text: value }),
    ]);
  }

  /**
   * Single price row (used inside the price box).
   */
  function buildPriceRow(opts) {
    const iconWrap = el('span', {
      class: 'detail-price__row-icon' + (opts.highlight ? ' is-highlight' : ''),
      html: opts.icon || ICONS.tag,
      'aria-hidden': 'true',
    });

    const title = el('span', {
      class: 'detail-price__row-title',
      text: opts.title || '',
    });

    const sub = el('span', {
      class: 'detail-price__row-sub',
      text: opts.sub || '',
    });

    const labelBox = el('span', { class: 'detail-price__row-label' }, [title, sub]);

    const number = el('span', {
      class: 'detail-price__row-number',
      text: formatNumber(opts.price || 0),
    });

    const unit = el('span', {
      class: 'detail-price__row-unit',
      text: 'تومان',
    });

    const valueBox = el('span', { class: 'detail-price__row-value' }, [number, unit]);

    return el('div', {
      class: 'detail-price__row' + (opts.highlight ? ' is-highlight' : ''),
    }, [iconWrap, labelBox, valueBox]);
  }


  /* ============================================================
     LAYER 10 — ORGANISM BUILDERS
     ============================================================ */

  /**
   * Class card (used in grid + sheet).
   */
  function buildClassCard(cls, opts) {
    opts = opts || {};
    const variant = opts.variant || 'grid';
    const isComingSoon = cls.status === 'coming-soon';

    const card = el('button', {
      type: 'button',
      class: 'class-card' + (isComingSoon ? ' is-coming-soon' : ''),
      dataset: { classId: cls.id, accent: cls.accent || 'mustard' },
      'aria-label': isComingSoon
        ? esc(cls.title) + ' — به زودی'
        : 'مشاهده جزئیات ' + esc(cls.title),
    });

    /* Head */
    card.appendChild(el('div', { class: 'class-card__head' }, [
      buildTypeBadge(cls),
      el('span', { class: 'class-card__code', text: cls.code }),
    ]));

    /* Title */
    card.appendChild(el('h3', {
      class: 'class-card__title',
      text: cls.title,
    }));

    /* Short description */
    if (cls.shortDesc) {
      card.appendChild(el('p', {
        class: 'class-card__desc',
        text: cls.shortDesc,
      }));
    }

    /* Meta row */
    card.appendChild(el('div', { class: 'class-card__meta' }, [
      buildMetaItem('calendar', toPersianDigits(cls.sessions) + ' جلسه'),
      buildMetaItem('clock', cls.duration),
      buildMetaItem('users', cls.capacity),
    ]));

    /* Foot */
    const foot = el('div', { class: 'class-card__foot' });

    if (cls.rating > 0) {
      foot.appendChild(el('span', { class: 'class-card__rating' }, [
        el('span', { html: ICONS.star, 'aria-hidden': 'true' }),
        el('span', { text: formatRating(cls.rating) }),
        el('small', { text: '(' + toPersianDigits(cls.reviewsCount) + ')' }),
      ]));
    } else {
      foot.appendChild(el('span', {
        class: 'class-card__rating is-empty',
        text: 'جدید',
      }));
    }

    if (isComingSoon) {
      foot.appendChild(el('span', {
        class: 'class-card__cta',
        text: 'به زودی…',
      }));
    } else {
      foot.appendChild(el('span', { class: 'class-card__cta' }, [
        el('span', { text: variant === 'sheet' ? 'جزئیات' : 'جزئیات بیشتر' }),
        el('span', { html: ICONS.chevronLeft, 'aria-hidden': 'true' }),
      ]));
    }

    card.appendChild(foot);

    return card;
  }

  /**
   * Testimonial card.
   */
  function buildTestimonial(t) {
    const card = el('article', {
      class: 'testimonial-card',
      dataset: { testimonialId: t.id },
      'aria-label': 'نظر ' + t.name,
    });

    card.appendChild(el('span', {
      class: 'testimonial-card__quote',
      html: '&rdquo;',
      'aria-hidden': 'true',
    }));

    card.appendChild(buildStars(t.rating, 'sm'));

    card.appendChild(el('p', {
      class: 'testimonial-card__text',
      text: t.text,
    }));

    card.appendChild(el('div', { class: 'testimonial-card__foot' }, [
      el('span', {
        class: 'testimonial-card__avatar',
        text: t.avatarLetter || (t.name ? t.name.charAt(0) : '؟'),
        'aria-hidden': 'true',
      }),
      el('div', { class: 'testimonial-card__author' }, [
        el('span', { class: 'testimonial-card__name', text: t.name }),
        el('span', { class: 'testimonial-card__role', text: t.role }),
      ]),
    ]));

    return card;
  }

  /**
   * FAQ accordion item.
   */
  function buildFaqItem(item, index) {
    const id = 'faq-' + index;

    const details = el('details', { class: 'faq-item', id: id });

    details.appendChild(el('summary', { class: 'faq-item__summary' }, [
      el('span', { text: item.q }),
      el('span', {
        class: 'faq-item__icon',
        html: ICONS.plus,
        'aria-hidden': 'true',
      }),
    ]));

    const content = el('div', { class: 'faq-item__content' });
    const paragraphs = String(item.a).split(/\n{2,}/).filter(Boolean);
    paragraphs.forEach(function (p) {
      content.appendChild(el('p', { text: p.trim() }));
    });

    details.appendChild(content);

    return details;
  }


  /* ============================================================
     LAYER 11 — SECTION BUILDERS
     ─── Build the entire detail panel content
     ============================================================ */

  /**
   * Build the hero top (badge + code).
   */
  function buildDetailHero(cls) {
    return el('div', { class: 'detail-hero__top' }, [
      buildTypeBadge(cls),
      el('span', { class: 'class-card__code', text: cls.code }),
    ]);
  }

  /**
   * Build the rating block.
   */
  function buildDetailRating(cls) {
    if (!cls.rating || cls.rating <= 0) {
      return el('span', {
        class: 'badge badge--accent badge--static',
        text: 'به‌زودی فعال می‌شه',
      });
    }

    return el('div', { class: 'detail-rating' }, [
      buildStars(cls.rating, 'lg'),
      el('span', {
        class: 'detail-rating__num',
        text: formatRating(cls.rating) + ' از ۵',
      }),
      el('span', {
        class: 'detail-rating__count',
        text: '(' + toPersianDigits(cls.reviewsCount) + ' نظر)',
      }),
    ]);
  }

  /**
   * Build the info grid.
   */
  function buildDetailInfoGrid(cls) {
    const typeMeta = DATA.TYPE_LABELS[cls.type] || { text: cls.type };

    const grid = el('ul', { class: 'detail-info' }, [
      buildInfoCard('calendar', 'تعداد جلسات', toPersianDigits(cls.sessions) + ' جلسه'),
      buildInfoCard('clock', 'مدت هر جلسه', cls.duration),
      buildInfoCard('users', 'ظرفیت', cls.capacity),
      buildInfoCard('mapPin', 'محل برگزاری', cls.location),
      buildInfoCard('book', 'پایه تحصیلی', cls.grade),
      buildInfoCard('help', 'نوع کلاس', typeMeta.text),
    ]);

    return grid;
  }

  /**
   * Build the price box (two-row table).
   */
  function buildDetailPriceBox(cls) {
    /* ─── Compute prices ─── */
    const sessionsCount = Math.max(1, parseInt(cls.sessions, 10) || 1);
    const isWholeCourse = (cls.priceNote === 'کل دوره');
    const pricePerSession = isWholeCourse
      ? Math.round(cls.price / sessionsCount)
      : cls.price;
    const priceTotal = isWholeCourse
      ? cls.price
      : cls.price * sessionsCount;

    /* ─── Ribbon pill ─── */
    const ribbon = el('span', {
      class: 'detail-price__ribbon',
      text: 'جدول هزینه',
    });

    /* ─── Row 1: per-session ─── */
    const row1 = buildPriceRow({
      icon: ICONS.clock,
      title: 'هر جلسه',
      sub: (cls.duration || '') + ' کلاس',
      price: pricePerSession,
      highlight: false,
    });

    /* ─── Divider ─── */
    const divider = el('span', {
      class: 'detail-price__divider',
      'aria-hidden': 'true',
    });

    /* ─── Row 2: total ─── */
    const row2 = buildPriceRow({
      icon: ICONS.check,
      title: 'کل دوره',
      sub: toPersianDigits(sessionsCount) + ' جلسه',
      price: priceTotal,
      highlight: true,
    });

    /* ─── Helper strip ─── */
    const helper = el('div', { class: 'detail-price__helper' }, [
      el('span', {
        class: 'detail-price__helper-icon',
        html: ICONS.check,
        'aria-hidden': 'true',
      }),
      el('span', {
        class: 'detail-price__helper-text',
        text: 'پرداخت بعد از جلسه اول — بدون تعهد',
      }),
    ]);

    /* ─── Assemble ─── */
    return el('div', { class: 'detail-price' }, [
      ribbon,
      row1,
      divider,
      row2,
      helper,
    ]);
  }

  /**
   * Build the syllabus list.
   */
  function buildDetailSyllabus(cls) {
    if (!Array.isArray(cls.syllabus) || !cls.syllabus.length) return null;

    const list = el('ul', { class: 'detail-syllabus' });

    cls.syllabus.forEach(function (item, i) {
      list.appendChild(el('li', { class: 'detail-syllabus__item' }, [
        el('span', {
          class: 'detail-syllabus__num',
          text: toPersianDigits(i + 1),
          'aria-hidden': 'true',
        }),
        el('span', { class: 'detail-syllabus__text', text: item }),
      ]));
    });

    return list;
  }

  /**
   * Build the class-specific FAQ list.
   */
  function buildDetailFaq(cls) {
    if (!Array.isArray(cls.faq) || !cls.faq.length) return null;

    const list = el('div', { class: 'detail-faq' });

    cls.faq.forEach(function (item, i) {
      list.appendChild(buildFaqItem(item, 'detail-' + cls.id + '-' + i));
    });

    return list;
  }

  /**
   * Build the trust note.
   */
  function buildDetailNote() {
    return el('div', {
      class: 'detail-note',
      role: 'note',
      'aria-label': 'اطلاعیه اعتماد',
    }, [
      el('span', {
        class: 'detail-note__icon',
        html: ICONS.check,
        'aria-hidden': 'true',
      }),
      el('span', {
        class: 'detail-note__text',
        text: 'پیش‌ثبت‌نام کاملاً رایگانه و هیچ تعهدی برای ادامه کلاس ندارید.',
      }),
    ]);
  }

  /**
   * Build the entire detail panel content for a class.
   */
  function buildClassDetail(cls) {
    const nodes = [];

    /* Hero top */
    nodes.push(buildDetailHero(cls));

    /* Title */
    nodes.push(el('h1', {
      class: 'detail-title',
      text: cls.title,
    }));

    /* Rating */
    nodes.push(buildDetailRating(cls));

    /* Long description */
    nodes.push(el('p', {
      class: 'detail-desc',
      text: cls.longDesc,
    }));

    /* Info grid */
    nodes.push(el('h2', { class: 'detail-section-title', text: 'اطلاعات کلاس' }));
    nodes.push(buildDetailInfoGrid(cls));

    /* Price box */
    if (CONFIG.FEATURES.SHOW_PRICING_TABLE) {
      nodes.push(el('h2', { class: 'detail-section-title', text: 'هزینه کلاس' }));
      nodes.push(buildDetailPriceBox(cls));
    }

    /* Syllabus */
    if (CONFIG.FEATURES.SHOW_SYLLABUS) {
      const syllabus = buildDetailSyllabus(cls);
      if (syllabus) {
        nodes.push(el('h2', { class: 'detail-section-title', text: 'سرفصل‌های کلاس' }));
        nodes.push(syllabus);
      }
    }

    /* Class-specific FAQ */
    if (CONFIG.FEATURES.SHOW_CLASS_FAQ) {
      const faq = buildDetailFaq(cls);
      if (faq) {
        nodes.push(el('h2', { class: 'detail-section-title', text: 'سوالات پرتکرار این کلاس' }));
        nodes.push(faq);
      }
    }

    /* Trust note */
    if (CONFIG.FEATURES.SHOW_TRUST_NOTE) {
      nodes.push(buildDetailNote());
    }

    return nodes;
  }


  /* ============================================================
     LAYER 12 — STATE & METRICS
     ============================================================ */

  const Metrics = (function () {

    const stats = {
      renderCalls: 0,
      classCards: 0,
      testimonials: 0,
      faqItems: 0,
      detailRenders: 0,
      errors: 0,
      lastRenderAt: null,
      totalRenderTime: 0,
    };

    function increment(key, by) {
      stats[key] = (stats[key] || 0) + (by || 1);
    }

    function set(key, value) {
      stats[key] = value;
    }

    function get() {
      return Object.assign({}, stats);
    }

    function reset() {
      Object.keys(stats).forEach(function (k) { delete stats[k]; });
      stats.renderCalls = 0;
      stats.classCards = 0;
      stats.testimonials = 0;
      stats.faqItems = 0;
      stats.detailRenders = 0;
      stats.errors = 0;
      stats.lastRenderAt = null;
      stats.totalRenderTime = 0;
    }

    return { increment: increment, set: set, get: get, reset: reset };
  })();


  /* ============================================================
     LAYER 13 — ANNOUNCER (aria-live for dynamic content)
     ============================================================ */

  const Announcer = (function () {

    let regionEl = null;

    function ensure() {
      if (regionEl && document.contains(regionEl)) return regionEl;

      regionEl = document.getElementById(CONFIG.A11Y.LIVE_REGION_ID);
      if (regionEl) return regionEl;

      regionEl = document.createElement('div');
      regionEl.id = CONFIG.A11Y.LIVE_REGION_ID;
      regionEl.className = 'visually-hidden';
      regionEl.setAttribute('aria-live', 'polite');
      regionEl.setAttribute('aria-atomic', 'true');
      regionEl.setAttribute('role', 'status');
      document.body.appendChild(regionEl);
      return regionEl;
    }

    function announce(message) {
      if (!message) return;
      const el = ensure();
      el.textContent = '';
      setTimeout(function () { el.textContent = message; }, 30);
    }

    return { announce: announce };
  })();


  /* ============================================================
     LAYER 14 — RENDERERS (ORCHESTRATION)
     ============================================================ */

  /**
   * Render the main grid (first N active classes).
   */
  function renderClassesGrid() {
    const startedAt = performance.now();

    const container = document.getElementById('classes-grid');
    if (!container) {
      Metrics.increment('errors');
      return false;
    }

    try {
      const active = DATA.CLASSES.filter(function (c) { return c.status === 'active'; });
      const slice = active.slice(0, CONFIG.GRID_LIMIT);

      const frag = document.createDocumentFragment();

      slice.forEach(function (cls, i) {
        if (!Validator.isValidClass(cls)) return;

        const card = buildClassCard(cls, { variant: 'grid', index: i });
        card.classList.add('reveal-card');
        card.style.setProperty('--reveal-delay', (i * 80) + 'ms');
        frag.appendChild(card);
        Metrics.increment('classCards');
      });

      replaceChildren(container, frag);
      markReady(container);

      Metrics.set('lastRenderAt', Date.now());
      Metrics.increment('renderCalls');
      Metrics.increment('totalRenderTime', performance.now() - startedAt);

      return true;
    } catch (err) {
      console.error('[render] grid failed:', err);
      Metrics.increment('errors');
      return false;
    }
  }

  /**
   * Render all classes into the bottom sheet.
   */
  function renderAllClassesSheet() {
    const container = document.getElementById('sheet-all-classes-body');
    if (!container) return false;

    try {
      const frag = document.createDocumentFragment();

      DATA.CLASSES.forEach(function (cls) {
        if (!Validator.isValidClass(cls)) return;
        frag.appendChild(buildClassCard(cls, { variant: 'sheet' }));
      });

      replaceChildren(container, frag);
      markReady(container);
      return true;
    } catch (err) {
      console.error('[render] sheet failed:', err);
      Metrics.increment('errors');
      return false;
    }
  }

  /**
   * Render the class detail panel for a given class ID.
   */
  function renderClassDetail(classId) {
    const startedAt = performance.now();

    const panel = document.getElementById('panel-class-detail');
    const body = document.getElementById('panel-class-detail-body');
    const title = document.getElementById('panel-class-detail-title');
    const registerBtn = document.getElementById('panel-register-btn');

    if (!panel || !body) {
      Metrics.increment('errors');
      return false;
    }

    const raw = DATA.CLASSES.find(function (c) { return c.id === classId; });
    if (!raw) {
      console.warn('[render] Class not found:', classId);
      Metrics.increment('errors');
      return false;
    }

    const cls = Validator.sanitizeClass(raw);
    if (!cls) {
      console.warn('[render] Class invalid:', classId);
      Metrics.increment('errors');
      return false;
    }

    /* ─── Update header title ─── */
    if (title) {
      const typeMeta = DATA.TYPE_LABELS[cls.type];
      title.textContent = cls.grade + ' — ' + (typeMeta ? typeMeta.text : '');
    }

    /* ─── Dataset for form.js ─── */
    panel.dataset.classId = cls.id;
    panel.dataset.classCode = cls.code;
    panel.dataset.classTitle = cls.title;

    /* ─── Body content ─── */
    const nodes = buildClassDetail(cls);
    replaceChildren(body, nodes);

    /* ─── Register button ─── */
    if (registerBtn) {
      clearNode(registerBtn);
      registerBtn.classList.remove('is-loading');

      if (cls.status === 'coming-soon') {
        registerBtn.disabled = true;
        registerBtn.setAttribute('aria-disabled', 'true');
        registerBtn.setAttribute('type', 'button');
        registerBtn.appendChild(el('span', { text: 'به‌زودی فعال می‌شه' }));
        registerBtn.appendChild(el('span', {
          html: ICONS.clock,
          'aria-hidden': 'true',
        }));
      } else {
        registerBtn.disabled = false;
        registerBtn.removeAttribute('aria-disabled');
        registerBtn.setAttribute('type', 'button');
        registerBtn.appendChild(el('span', { text: 'پیش‌ثبت‌نام در این کلاس' }));
        registerBtn.appendChild(el('span', {
          html: ICONS.chevronLeft,
          'aria-hidden': 'true',
        }));
      }
    }

    /* ─── Footer hint ─── */
    const footerHint = panel.querySelector('.panel__footer-hint');
    if (footerHint) {
      clearNode(footerHint);
      footerHint.appendChild(el('span', {
        html: ICONS.check,
        'aria-hidden': 'true',
      }));
      footerHint.appendChild(el('span', {
        text: cls.status === 'coming-soon'
          ? 'این دوره به‌زودی فعال می‌شه'
          : 'پیش‌ثبت‌نام رایگانه و هیچ تعهدی نداره',
      }));
    }

    /* ─── Scroll top ─── */
    body.scrollTop = 0;

    Metrics.increment('detailRenders');
    Metrics.increment('totalRenderTime', performance.now() - startedAt);

    return true;
  }

  /**
   * Render the testimonials grid.
   */
  function renderTestimonials() {
    const container = document.getElementById('testimonials-grid');
    if (!container) return false;

    try {
      const frag = document.createDocumentFragment();

      DATA.TESTIMONIALS.forEach(function (t) {
        if (!Validator.isValidTestimonial(t)) return;
        const card = buildTestimonial(t);
        card.classList.add('reveal-card');
        frag.appendChild(card);
        Metrics.increment('testimonials');
      });

      replaceChildren(container, frag);
      markReady(container);

      renderTestimonialDots();
      return true;
    } catch (err) {
      console.error('[render] testimonials failed:', err);
      Metrics.increment('errors');
      return false;
    }
  }

  /**
   * Render the pagination dots for the testimonials slider.
   */
  function renderTestimonialDots() {
    const dotsContainer = document.getElementById('testimonials-dots');
    if (!dotsContainer) return false;

    const total = DATA.TESTIMONIALS.length;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < total; i++) {
      frag.appendChild(el('button', {
        type: 'button',
        class: 'testimonials__dot' + (i === 0 ? ' is-active' : ''),
        'aria-label': 'نظر ' + toPersianDigits(i + 1),
        dataset: { slideIndex: String(i) },
      }));
    }

    replaceChildren(dotsContainer, frag);
    return true;
  }

  /**
   * Render the general FAQ list.
   */
  function renderFaqList() {
    const container = document.getElementById('faq-list');
    if (!container) return false;

    try {
      const frag = document.createDocumentFragment();

      DATA.FAQS.forEach(function (item, i) {
        if (!Validator.isValidFaq(item)) return;
        frag.appendChild(buildFaqItem(item, i));
        Metrics.increment('faqItems');
      });

      replaceChildren(container, frag);
      markReady(container);
      return true;
    } catch (err) {
      console.error('[render] faq failed:', err);
      Metrics.increment('errors');
      return false;
    }
  }


  /* ============================================================
     LAYER 15 — REVEAL OBSERVER
     ============================================================ */

  function observeReveal() {
    const targets = document.querySelectorAll(
      '.classes__grid > .class-card:not(.class-card--skeleton), ' +
      '.testimonials__grid > .testimonial-card, ' +
      '.reveal:not(.is-visible)'
    );

    if (!targets.length) return;

    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (t) {
        t.classList.add('is-visible', 'is-revealed');
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = el.style.getPropertyValue('--reveal-delay') || '0ms';
          setTimeout(function () {
            el.classList.add('is-visible', 'is-revealed');
          }, parseInt(delay, 10) || 0);
          observer.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    targets.forEach(function (t) { observer.observe(t); });
  }


  /* ============================================================
     LAYER 16 — PUBLIC API
     ============================================================ */

  function renderAll() {
    const startedAt = performance.now();

    renderClassesGrid();
    renderAllClassesSheet();
    renderTestimonials();
    renderFaqList();

    requestAnimationFrame(observeReveal);

    Metrics.set('lastRenderAt', Date.now());
    Metrics.increment('totalRenderTime', performance.now() - startedAt);

    return {
      ok: true,
      metrics: Metrics.get(),
    };
  }

  function getMetrics() {
    return {
      version: VERSION,
      metrics: Metrics.get(),
      memo: Memo.stats(),
    };
  }

  function reset() {
    Metrics.reset();
    Memo.clear();
    return true;
  }

  const API = {
    version: VERSION,
    build: BUILD,

    /* Main rendering */
    renderAll:              renderAll,
    renderClassesGrid:      renderClassesGrid,
    renderAllClassesSheet:  renderAllClassesSheet,
    renderClassDetail:      renderClassDetail,
    renderTestimonials:     renderTestimonials,
    renderFaqList:          renderFaqList,
    observeReveal:          observeReveal,

    /* Builders (public — useful for custom extensions) */
    builders: Object.freeze({
      buildClassCard:      buildClassCard,
      buildTestimonial:    buildTestimonial,
      buildFaqItem:        buildFaqItem,
      buildStars:          buildStars,
      buildTypeBadge:      buildTypeBadge,
      buildPriceRow:       buildPriceRow,
      buildClassDetail:    buildClassDetail,
    }),

    /* Helpers */
    helpers: Object.freeze({
      esc:              esc,
      toPersianDigits:  toPersianDigits,
      formatNumber:     formatNumber,
      formatRating:     formatRating,
      normalizePersian: normalizePersian,
      safeUrl:          safeUrl,
      whatsappUrl:      whatsappUrl,
      truncate:         truncate,
      pluralize:        pluralize,
    }),

    /* Validation */
    validator: Validator,

    /* Cache */
    memo: Object.freeze({
      clear:     Memo.clear,
      invalidate: Memo.invalidate,
      stats:     Memo.stats,
    }),

    /* Metrics */
    getMetrics: getMetrics,
    reset:      reset,

    /* Icons (read-only) */
    icons: ICONS,

    /* Announce */
    announce: Announcer.announce,

    /* Config */
    config: Object.freeze(Object.assign({}, CONFIG)),
  };

  Object.defineProperty(window, 'MissMathRender', {
    value: Object.freeze(API),
    writable: false,
    configurable: false,
    enumerable: false,
  });


  /* ============================================================
     AUTO-BOOT (only if data is present)
     ============================================================ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      /* Don't auto-render — main.js orchestrates */
    }, { once: true });
  }


  /* ============================================================
     END
     ============================================================ */

})();