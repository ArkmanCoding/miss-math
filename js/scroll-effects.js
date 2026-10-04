/* ============================================================
   scroll-effects.js
   Miss Math — Smooth Scroll & Reveal Engine
   فاز ۵ — نسخه جامع v2.0.0

   ═══════════════════════════════════════════════════════════
   OVERVIEW
   ═══════════════════════════════════════════════════════════
   Complete scrolling experience layer for the landing page.

   Every element enters the viewport with a gentle, cinematic
   reveal. Smooth anchor scrolling. Progress indicator. Header
   state awareness. Everything respects user preferences.

   ═══════════════════════════════════════════════════════════
   ARCHITECTURE (20 LAYERS)
   ═══════════════════════════════════════════════════════════
   L01  Guards & Version
   L02  Config (expanded with 30+ options)
   L03  Environment Detection
   L04  Logger
   L05  State
   L06  Event Bus
   L07  Metrics Collector
   L08  Math Utilities (easing, lerp, clamp)
   L09  Timing Utilities (rafThrottle, debounce, nextFrame)
   L10  Storage (safe wrapper)
   L11  DOM Utilities
   L12  Reveal Engine (prepare, trigger, observe)
   L13  Auto-Tagging System
   L14  Observer Manager
   L15  Smooth Scroll (rAF-based with cancel)
   L16  Anchor Handler
   L17  Header State Manager
   L18  Progress Bar
   L19  Session Persistence
   L20  Public API + Boot

   ═══════════════════════════════════════════════════════════
   KEY FEATURES
   ═══════════════════════════════════════════════════════════
   • IntersectionObserver-based reveals (fast, no scroll listeners)
   • Custom rAF smooth scroll with cubic-bezier easing
   • Stagger support for groups (cards, faq, nav items)
   • 5 reveal animation types: fade-up, fade-scale, fade-in,
     slide-from-right, slide-from-left, rotate
   • Configurable per-selector reveal mapping
   • Scroll progress bar with gradient + glow
   • Header scrolled state
   • Session-based skip (respects "user saw this already")
   • Reduced motion respect (instant reveal)
   • Safety fallback if JS fails (2s timer)
   • Re-scan API for dynamic content
   • Full metrics for debugging
   • Complete a11y (focus management, aria-live)

   ═══════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════
   MissMathScroll.version              → '2.0.0'
   MissMathScroll.getStats()           → full state snapshot
   MissMathScroll.getMetrics()         → metrics only
   MissMathScroll.refresh()            → re-scan for elements
   MissMathScroll.revealAll()          → force reveal all
   MissMathScroll.revealElement(el)    → reveal specific
   MissMathScroll.scrollTo(hash|el)    → smooth scroll
   MissMathScroll.scrollToTop()        → back to top
   MissMathScroll.on(event, handler)   → subscribe
   MissMathScroll.off(event, handler)  → unsubscribe
   MissMathScroll.reset()              → reset state
   ============================================================ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     L01 — GUARDS & VERSION
     ═══════════════════════════════════════════════════════════ */

  if (typeof window === 'undefined') return;
  if (typeof document === 'undefined') return;
  if (window.__MissMathScrollLoaded) return;
  window.__MissMathScrollLoaded = true;

  const VERSION = '2.0.0';
  const BUILD = '1403.07';


  /* ═══════════════════════════════════════════════════════════
     L02 — CONFIG
     ═══════════════════════════════════════════════════════════ */

  const CONFIG = {

    VERSION: VERSION,
    BUILD: BUILD,
    DEBUG: false,

    /* ─── Timing ─── */
    TIMING: {
      REVEAL_DURATION: 750,
      REVEAL_STAGGER: 90,
      REVEAL_STAGGER_CAP: 6,
      REVEAL_THRESHOLD: 0.12,
      REVEAL_ROOT_MARGIN: '0px 0px -60px 0px',
      REVEAL_CLEANUP_MS: 950,
      SCROLL_DURATION: 900,
      SCROLL_OFFSET: 76,
      SCROLL_MIN_DISTANCE: 4,
      SCROLL_CANCEL_BUFFER: 100,
      HEADER_SCROLL_THRESHOLD: 20,
      RESIZE_DEBOUNCE: 200,
      REFRESH_DEBOUNCE: 150,
      SAFETY_TIMEOUT: 2000,
    },

    /* ─── Reveal mapping ─── */
    REVEAL_MAP: [
      /* ═══ Hero ═══ */
      { selector: '.hero__badge',       type: 'fade-up',   delay: 0 },
      { selector: '.hero__title',       type: 'fade-up',   delay: 100 },
      { selector: '.hero__lead',        type: 'fade-up',   delay: 220 },
      { selector: '.hero__actions',     type: 'fade-up',   delay: 340 },
      { selector: '.hero__stats',       type: 'fade-up',   delay: 460 },
      { selector: '.hero__visual',      type: 'fade-scale', delay: 200 },

      /* ═══ Trust Bar ═══ */
      { selector: '.trust-item',        type: 'fade-up',   stagger: true, delay: 0 },

      /* ═══ Section headers ═══ */
      { selector: '.section-head > .section-eyebrow', type: 'fade-up', delay: 0 },
      { selector: '.section-head > .section-title',   type: 'fade-up', delay: 80 },
      { selector: '.section-head > .section-lead',    type: 'fade-up', delay: 160 },

      /* ═══ About ═══ */
      { selector: '.about__visual',                  type: 'slide-from-right' },
      { selector: '.about__content > .section-eyebrow', type: 'fade-up', delay: 0 },
      { selector: '.about__content > .section-title',   type: 'fade-up', delay: 100 },
      { selector: '.about__bio',                        type: 'fade-up', delay: 200 },
      { selector: '.about__credentials li',             type: 'fade-up', stagger: true, delay: 250 },

      /* ═══ Classes ═══ */
      { selector: '.classes__grid .class-card',      type: 'fade-up', stagger: true, delay: 0 },
      { selector: '.classes__more',                  type: 'fade-up', delay: 200 },

      /* ═══ Process ═══ */
      { selector: '.process__step',                  type: 'fade-up', stagger: true, delay: 0 },

      /* ═══ Testimonials ═══ */
      { selector: '.testimonials__grid .testimonial-card', type: 'fade-up', stagger: true, delay: 0 },
      { selector: '.testimonials__dots',             type: 'fade-in', delay: 300 },

      /* ═══ FAQ ═══ */
      { selector: '.faq-item',                       type: 'fade-up', stagger: true, delay: 0 },
      { selector: '.faq__cta',                       type: 'fade-up', delay: 200 },

      /* ═══ Location ═══ */
      { selector: '.location__card',                 type: 'slide-from-right', stagger: true, delay: 0 },
      { selector: '.location__map',                  type: 'fade-scale', delay: 200 },

      /* ═══ Footer ═══ */
      { selector: '.site-footer__brand',             type: 'fade-up', delay: 0 },
      { selector: '.site-footer__nav',               type: 'fade-up', delay: 100 },
      { selector: '.site-footer__contact',           type: 'fade-up', delay: 200 },
      { selector: '.site-footer__copy',              type: 'fade-in',  delay: 300 },
    ],

    /* ─── Progress bar ─── */
    PROGRESS: {
      ENABLED: true,
      HEIGHT: 3,
      Z_INDEX: 9998,
      GRADIENT: 'linear-gradient(90deg, #EDC77A 0%, #DDA83D 35%, #C68B1E 70%, #A06E14 100%)',
    },

    /* ─── Smooth scroll ─── */
    SMOOTH_SCROLL: {
      ENABLED: true,
      EXCLUDE_HASHES: ['#', '#main'],
      EXCLUDE_CLASSES: ['no-smooth-scroll', 'drawer__nav-link', 'site-nav__link'],
      FOCUS_AFTER_SCROLL: true,
    },

    /* ─── Session storage ─── */
    STORAGE: {
      HERO_SEEN_KEY: 'miss-math:hero-seen:v1',
      SKIP_HERO_ON_REPEAT: false,
    },

    /* ─── Events ─── */
    EVENTS: {
      READY:             'scroll:ready',
      REVEAL:            'scroll:reveal',
      REVEAL_ALL:        'scroll:reveal-all',
      SMOOTH_SCROLL:     'scroll:smooth',
      HEADER_SCROLLED:   'scroll:header-scrolled',
      PROGRESS_UPDATE:   'scroll:progress',
      REFRESH:           'scroll:refresh',
      ERROR:             'scroll:error',
    },

    /* ─── Feature flags ─── */
    FEATURES: {
      REVEAL_ENGINE:      true,
      AUTO_TAGGING:       true,
      SMOOTH_SCROLL:      true,
      HEADER_STATE:       true,
      PROGRESS_BAR:       true,
      SESSION_MEMORY:     true,
      SAFETY_FALLBACK:    true,
      FOCUS_MANAGEMENT:   true,
      METRICS:            true,
    },
  };


  /* ═══════════════════════════════════════════════════════════
     L03 — ENVIRONMENT DETECTION
     ═══════════════════════════════════════════════════════════ */

  const ENV = (function () {

    const mq = function (q) {
      if (!window.matchMedia) return false;
      try { return window.matchMedia(q).matches; } catch (e) { return false; }
    };

    const nav = navigator || {};

    return {
      /* Motion */
      reducedMotion: mq('(prefers-reduced-motion: reduce)'),

      /* Device */
      isTouch: mq('(hover: none) and (pointer: coarse)'),
      isMobile: mq('(max-width: 640px)'),
      isTablet: mq('(min-width: 641px) and (max-width: 959px)'),
      isDesktop: mq('(min-width: 960px)'),

      /* Capabilities */
      supportsIO: 'IntersectionObserver' in window,
      supportsRAF: typeof window.requestAnimationFrame === 'function',
      supportsCAF: typeof window.cancelAnimationFrame === 'function',
      supportsPerf: typeof performance !== 'undefined' && typeof performance.now === 'function',
      supportsStorage: (function () {
        try {
          const k = '__mm_scroll_test__';
          window.localStorage.setItem(k, k);
          window.localStorage.removeItem(k);
          return true;
        } catch (e) { return false; }
      })(),
      supportsFocusOpts: (function () {
        let supported = false;
        try {
          const el = document.createElement('div');
          el.focus({
            get preventScroll() { supported = true; return false; },
          });
        } catch (e) { }
        return supported;
      })(),

      /* Network */
      saveData: (nav.connection && nav.connection.saveData) || false,
      online: nav.onLine !== false,
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L04 — LOGGER
     ═══════════════════════════════════════════════════════════ */

  const log = (function () {
    const prefix = '[scroll]';

    const safe = function (method) {
      if (!window.console || typeof window.console[method] !== 'function') {
        return function () { };
      }
      return function () {
        const args = Array.prototype.slice.call(arguments);
        args.unshift(prefix);
        try { window.console[method].apply(window.console, args); } catch (e) { }
      };
    };

    return {
      debug: CONFIG.DEBUG ? safe('log') : function () { },
      info: safe('info'),
      warn: safe('warn'),
      error: safe('error'),
      group: function (label, fn) {
        if (CONFIG.DEBUG && window.console && window.console.group) {
          window.console.group(prefix + ' ' + label);
          try { fn(); } finally { window.console.groupEnd(); }
        } else {
          fn();
        }
      },
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L05 — STATE
     ═══════════════════════════════════════════════════════════ */

  const state = {
    initialised: false,
    bootedAt: null,

    /* DOM refs */
    refs: {
      headerEl: null,
      progressBar: null,
      progressFill: null,
    },

    /* Reveal */
    reveal: {
      observer: null,
      revealed: new Set(),
      total: 0,
      byType: {
        'fade-up': 0,
        'fade-scale': 0,
        'fade-in': 0,
        'slide-from-right': 0,
        'slide-from-left': 0,
        'rotate': 0,
      },
    },

    /* Smooth scroll */
    scroll: {
      cancelled: false,
      isAnimating: false,
      lastTarget: null,
    },

    /* Header */
    header: {
      wasScrolled: false,
    },

    /* Progress */
    progress: {
      lastValue: 0,
    },

    /* Session */
    session: {
      heroSeen: false,
      shouldSkipHero: false,
    },

    /* Metrics */
    metrics: {
      bootMs: 0,
      totalRevealed: 0,
      scrollAnimations: 0,
      headerStateChanges: 0,
      progressUpdates: 0,
      errors: 0,
    },
  };


  /* ═══════════════════════════════════════════════════════════
     L06 — EVENT BUS
     ═══════════════════════════════════════════════════════════ */

  const Bus = (function () {

    const listeners = new Map();
    let emitCount = 0;

    function on(name, fn) {
      if (typeof fn !== 'function') return function () { };
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return function off() {
        const arr = listeners.get(name) || [];
        const i = arr.indexOf(fn);
        if (i !== -1) arr.splice(i, 1);
      };
    }

    function emit(name, detail) {
      emitCount++;

      const arr = listeners.get(name);
      if (arr && arr.length) {
        arr.slice().forEach(function (fn) {
          try { fn(detail || {}); } catch (err) {
            state.metrics.errors++;
            log.error('Listener failed for', name, err);
          }
        });
      }

      /* DOM event for cross-module communication */
      try {
        document.dispatchEvent(new CustomEvent(name, {
          detail: detail || {},
          bubbles: false,
          cancelable: false,
        }));
      } catch (e) { }
    }

    function getCount() { return emitCount; }
    function clear() { listeners.clear(); emitCount = 0; }

    return { on: on, emit: emit, getCount: getCount, clear: clear };
  })();


  /* ═══════════════════════════════════════════════════════════
     L07 — METRICS COLLECTOR
     ═══════════════════════════════════════════════════════════ */

  const Metrics = (function () {

    function increment(key, by) {
      if (typeof state.metrics[key] !== 'number') {
        state.metrics[key] = 0;
      }
      state.metrics[key] += (by || 1);
    }

    function set(key, value) {
      state.metrics[key] = value;
    }

    function get() {
      return Object.assign({}, state.metrics);
    }

    function reset() {
      Object.keys(state.metrics).forEach(function (k) {
        state.metrics[k] = 0;
      });
    }

    return { increment: increment, set: set, get: get, reset: reset };
  })();


  /* ═══════════════════════════════════════════════════════════
     L08 — MATH UTILITIES
     ═══════════════════════════════════════════════════════════ */

  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeOutQuint(t) {
    return 1 - Math.pow(1 - t, 5);
  }

  function easeInOutQuad(t) {
    return t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function distance(a, b) {
    return Math.abs(b - a);
  }


  /* ═══════════════════════════════════════════════════════════
     L09 — TIMING UTILITIES
     ═══════════════════════════════════════════════════════════ */

  function now() {
    return ENV.supportsPerf ? performance.now() : Date.now();
  }

  function rafThrottle(fn) {
    let scheduled = false;
    let lastArgs = null;
    return function throttled() {
      lastArgs = arguments;
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        fn.apply(null, lastArgs);
      });
    };
  }

  function debounce(fn, wait) {
    let timer = null;
    return function debounced() {
      const args = arguments;
      const ctx = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  function safeCall(fn, args, ctx) {
    if (typeof fn !== 'function') return null;
    try {
      return fn.apply(ctx || null, args || []);
    } catch (err) {
      state.metrics.errors++;
      log.error('safeCall failed', err);
      return null;
    }
  }


  /* ═══════════════════════════════════════════════════════════
     L10 — SAFE STORAGE
     ═══════════════════════════════════════════════════════════ */

  const storage = (function () {
    function get(key) {
      if (!ENV.supportsStorage) return null;
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    function set(key, value) {
      if (!ENV.supportsStorage) return false;
      try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }

    function remove(key) {
      if (!ENV.supportsStorage) return false;
      try { window.localStorage.removeItem(key); return true; } catch (e) { return false; }
    }

    function isSet(key) {
      return get(key) === '1';
    }

    function setFlag(key) {
      return set(key, '1');
    }

    return { get: get, set: set, remove: remove, isSet: isSet, setFlag: setFlag };
  })();


  /* ═══════════════════════════════════════════════════════════
     L11 — DOM UTILITIES
     ═══════════════════════════════════════════════════════════ */

  function addClass(el, cls) {
    if (!el || !cls) return;
    el.classList.add(cls);
  }

  function removeClass(el, cls) {
    if (!el || !cls) return;
    el.classList.remove(cls);
  }

  function toggleClass(el, cls, force) {
    if (!el || !cls) return;
    el.classList.toggle(cls, force);
  }

  function hasClass(el, cls) {
    return el && el.classList.contains(cls);
  }

  function setCSSVar(el, name, value) {
    if (!el) return;
    try { el.style.setProperty(name, value); } catch (e) { }
  }

  function getPageY() {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function getDocumentHeight() {
    return Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.body.clientHeight,
      document.documentElement.clientHeight
    );
  }

  function getViewportHeight() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }


  /* ═══════════════════════════════════════════════════════════
     L12 — REVEAL ENGINE
     ═══════════════════════════════════════════════════════════ */

  const RevealEngine = (function () {

    /**
     * Prepare an element for reveal.
     * Adds base class + animation type class + delay CSS var.
     */
    function prepare(el, type, delay) {
      if (!el) return false;
      if (hasClass(el, 'reveal-element')) return false;

      addClass(el, 'reveal-element');
      addClass(el, 'reveal-' + type);

      if (typeof delay === 'number' && delay > 0) {
        setCSSVar(el, '--reveal-delay', delay + 'ms');
      }

      return true;
    }

    /**
     * Trigger reveal on an element.
     */
    function reveal(el) {
      if (!el) return false;
      if (state.reveal.revealed.has(el)) return false;

      state.reveal.revealed.add(el);
      state.reveal.total++;
      Metrics.increment('totalRevealed');

      /* Track by type */
      const typeClass = Array.prototype.find.call(
        el.classList,
        function (c) { return c.indexOf('reveal-') === 0 && c !== 'reveal-element' && c !== 'reveal-visible'; }
      );
      if (typeClass) {
        const type = typeClass.replace('reveal-', '');
        if (state.reveal.byType[type] !== undefined) {
          state.reveal.byType[type]++;
        }
      }

      addClass(el, 'reveal-visible');

      /* Emit */
      Bus.emit(CONFIG.EVENTS.REVEAL, {
        element: el,
        totalRevealed: state.reveal.total,
      });

      /* Clean up will-change */
      setTimeout(function () {
        try { el.style.willChange = 'auto'; } catch (e) { }
      }, CONFIG.TIMING.REVEAL_CLEANUP_MS);

      return true;
    }

    /**
     * Reveal all elements immediately.
     */
    function revealAll() {
      const all = document.querySelectorAll('.reveal-element:not(.reveal-visible)');
      let count = 0;
      all.forEach(function (el) {
        if (reveal(el)) count++;
      });

      Bus.emit(CONFIG.EVENTS.REVEAL_ALL, {
        count: count,
        total: state.reveal.total,
      });

      log.debug('Revealed all', count, 'elements');
      return count;
    }

    return {
      prepare: prepare,
      reveal: reveal,
      revealAll: revealAll,
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L13 — AUTO-TAGGING SYSTEM
     ═══════════════════════════════════════════════════════════ */

  const AutoTagger = (function () {

    function tagRule(rule) {
      if (!rule || !rule.selector) return 0;

      const elements = document.querySelectorAll(rule.selector);
      if (!elements.length) return 0;

      let tagged = 0;

      if (rule.stagger) {
        elements.forEach(function (el, index) {
          const cappedIndex = Math.min(index, CONFIG.TIMING.REVEAL_STAGGER_CAP);
          const finalDelay = (rule.delay || 0) +
            (cappedIndex * CONFIG.TIMING.REVEAL_STAGGER);

          if (RevealEngine.prepare(el, rule.type, finalDelay)) tagged++;
        });
      } else {
        elements.forEach(function (el) {
          if (RevealEngine.prepare(el, rule.type, rule.delay || 0)) tagged++;
        });
      }

      return tagged;
    }

    function tagAll() {
      if (!CONFIG.FEATURES.AUTO_TAGGING) return 0;

      let total = 0;
      CONFIG.REVEAL_MAP.forEach(function (rule) {
        total += safeCall(tagRule, [rule]);
      });

      log.debug('Auto-tagged', total, 'new elements');
      return total;
    }

    return { tagAll: tagAll, tagRule: tagRule };
  })();


  /* ═══════════════════════════════════════════════════════════
     L14 — OBSERVER MANAGER
     ═══════════════════════════════════════════════════════════ */

  const Observer = (function () {

    function create() {
      if (!ENV.supportsIO) return null;

      return new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;

            RevealEngine.reveal(entry.target);

            if (state.reveal.observer) {
              try { state.reveal.observer.unobserve(entry.target); } catch (e) { }
            }
          });
        },
        {
          threshold: CONFIG.TIMING.REVEAL_THRESHOLD,
          rootMargin: CONFIG.TIMING.REVEAL_ROOT_MARGIN,
        }
      );
    }

    function observeAll() {
      if (!state.reveal.observer) return 0;

      const all = document.querySelectorAll('.reveal-element:not(.reveal-visible)');
      let count = 0;

      all.forEach(function (el) {
        try {
          state.reveal.observer.observe(el);
          count++;
        } catch (e) { }
      });

      return count;
    }

    function start() {
      /* If reduced motion or no IO support → reveal all instantly */
      if (ENV.reducedMotion || !ENV.supportsIO) {
        RevealEngine.revealAll();
        return false;
      }

      if (!CONFIG.FEATURES.REVEAL_ENGINE) return false;

      state.reveal.observer = create();
      if (!state.reveal.observer) {
        RevealEngine.revealAll();
        return false;
      }

      const count = observeAll();
      log.debug('Observer watching', count, 'elements');
      return true;
    }

    function refresh() {
      AutoTagger.tagAll();

      if (!state.reveal.observer) return 0;
      return observeAll();
    }

    function destroy() {
      if (state.reveal.observer) {
        try { state.reveal.observer.disconnect(); } catch (e) { }
        state.reveal.observer = null;
      }
    }

    return { start: start, refresh: refresh, destroy: destroy };
  })();


  /* ═══════════════════════════════════════════════════════════
     L15 — SMOOTH SCROLL
     ═══════════════════════════════════════════════════════════ */

  const SmoothScroll = (function () {

    function cancel() {
      state.scroll.cancelled = true;
      state.scroll.isAnimating = false;
    }

    function scrollToY(targetY, duration) {
      if (ENV.reducedMotion) {
        window.scrollTo(0, targetY);
        return;
      }

      if (!CONFIG.FEATURES.SMOOTH_SCROLL) {
        window.scrollTo(0, targetY);
        return;
      }

      const startY = getPageY();
      const dist = targetY - startY;

      /* Distance too small → just jump */
      if (distance(startY, targetY) < CONFIG.TIMING.SCROLL_MIN_DISTANCE) {
        window.scrollTo(0, targetY);
        return;
      }

      state.scroll.cancelled = false;
      state.scroll.isAnimating = true;
      Metrics.increment('scrollAnimations');

      const startTime = now();
      const finalDuration = duration || CONFIG.TIMING.SCROLL_DURATION;

      /* Cancel on manual scroll */
      const cancelHandler = function () { cancel(); };
      window.addEventListener('wheel', cancelHandler, { passive: true, once: true });
      window.addEventListener('touchstart', cancelHandler, { passive: true, once: true });

      function step() {
        if (state.scroll.cancelled) {
          state.scroll.isAnimating = false;
          return;
        }

        const elapsed = now() - startTime;
        const progress = clamp(elapsed / finalDuration, 0, 1);
        const eased = easeInOutCubic(progress);
        const currentY = startY + dist * eased;

        window.scrollTo(0, currentY);

        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          state.scroll.isAnimating = false;
        }
      }

      window.requestAnimationFrame(step);
    }

    function getHeaderHeight() {
      if (state.refs.headerEl) {
        const h = state.refs.headerEl.offsetHeight;
        if (h > 20) return h;
      }

      try {
        const cs = window.getComputedStyle(document.documentElement);
        const h = cs.getPropertyValue('--header-h');
        if (h) {
          const num = parseFloat(h);
          if (isFinite(num) && num > 20) return num;
        }
      } catch (e) { }

      return 72;
    }

    function getTargetY(el) {
      if (!el) return 0;

      const rect = el.getBoundingClientRect();
      const currentY = getPageY();
      const headerH = getHeaderHeight();
      const offset = headerH + CONFIG.TIMING.SCROLL_OFFSET - 40;

      return Math.max(0, rect.top + currentY - offset);
    }

    function scrollToElement(el) {
      if (!el) return false;

      const y = getTargetY(el);
      scrollToY(y, CONFIG.TIMING.SCROLL_DURATION);

      Bus.emit(CONFIG.EVENTS.SMOOTH_SCROLL, {
        element: el,
        targetY: y,
      });

      return true;
    }

    return {
      scrollToY: scrollToY,
      scrollToElement: scrollToElement,
      getTargetY: getTargetY,
      cancel: cancel,
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L16 — ANCHOR HANDLER
     ═══════════════════════════════════════════════════════════ */

  const AnchorHandler = (function () {

    function isExcluded(link, href) {
      if (!href) return true;

      /* Check excluded hashes */
      if (CONFIG.SMOOTH_SCROLL.EXCLUDE_HASHES.indexOf(href) !== -1) {
        return true;
      }

      /* Check excluded classes */
      const excludedClasses = CONFIG.SMOOTH_SCROLL.EXCLUDE_CLASSES;
      for (let i = 0; i < excludedClasses.length; i++) {
        if (hasClass(link, excludedClasses[i])) return true;
      }

      /* Check data attributes */
      if (link.hasAttribute('data-no-smooth')) return true;

      return false;
    }

    function handleClick(e) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const link = e.target.closest('a[href^="#"]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (isExcluded(link, href)) return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();

      SmoothScroll.scrollToElement(target);

      /* Update URL */
      try {
        history.replaceState(null, '', href);
      } catch (err) { }

      /* Focus management for a11y */
      if (CONFIG.SMOOTH_SCROLL.FOCUS_AFTER_SCROLL) {
        setTimeout(function () {
          if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '-1');
          }
          try {
            if (ENV.supportsFocusOpts) {
              target.focus({ preventScroll: true });
            } else {
              target.focus();
            }
          } catch (err) { }
        }, CONFIG.TIMING.SCROLL_DURATION + 50);
      }
    }

    function bind() {
      if (!CONFIG.FEATURES.SMOOTH_SCROLL) return;
      document.addEventListener('click', handleClick, false);
      log.debug('Anchor handler bound');
    }

    return { bind: bind };
  })();


  /* ═══════════════════════════════════════════════════════════
     L17 — HEADER STATE MANAGER
     ═══════════════════════════════════════════════════════════ */

  const HeaderState = (function () {

    function init() {
      if (!CONFIG.FEATURES.HEADER_STATE) return;

      state.refs.headerEl = document.getElementById('site-header');
      if (!state.refs.headerEl) {
        log.debug('Header not found');
        return;
      }

      const update = rafThrottle(function () {
        const y = getPageY();
        const isScrolled = y > CONFIG.TIMING.HEADER_SCROLL_THRESHOLD;

        if (isScrolled === state.header.wasScrolled) return;

        state.header.wasScrolled = isScrolled;
        toggleClass(state.refs.headerEl, 'is-scrolled', isScrolled);
        Metrics.increment('headerStateChanges');

        Bus.emit(CONFIG.EVENTS.HEADER_SCROLLED, {
          scrolled: isScrolled,
          y: y,
        });
      });

      window.addEventListener('scroll', update, { passive: true });
      update();

      log.debug('Header state manager ready');
    }

    return { init: init };
  })();


  /* ═══════════════════════════════════════════════════════════
     L18 — PROGRESS BAR
     ═══════════════════════════════════════════════════════════ */

  const ProgressBar = (function () {

    function create() {
      const bar = document.createElement('div');
      bar.className = 'scroll-progress-bar';
      bar.setAttribute('aria-hidden', 'true');
      bar.setAttribute('role', 'presentation');

      const fill = document.createElement('span');
      fill.className = 'scroll-progress-bar__fill';
      bar.appendChild(fill);

      document.body.appendChild(bar);

      state.refs.progressBar = bar;
      state.refs.progressFill = fill;

      return bar;
    }

    function update() {
      if (!state.refs.progressFill) return;

      const y = getPageY();
      const docHeight = getDocumentHeight();
      const viewportH = getViewportHeight();
      const max = docHeight - viewportH;

      if (max <= 0) {
        state.refs.progressFill.style.transform = 'scaleX(0)';
        return;
      }

      const progress = clamp(y / max, 0, 1);

      /* Skip if changed less than 0.5% */
      if (Math.abs(progress - state.progress.lastValue) < 0.005) return;

      state.progress.lastValue = progress;
      state.refs.progressFill.style.transform = 'scaleX(' + progress + ')';

      Metrics.increment('progressUpdates');

      Bus.emit(CONFIG.EVENTS.PROGRESS_UPDATE, {
        value: progress,
        percent: Math.round(progress * 100),
      });
    }

    function init() {
      if (!CONFIG.FEATURES.PROGRESS_BAR) return;
      if (ENV.reducedMotion) return;
      if (ENV.saveData) return;

      create();

      const throttledUpdate = rafThrottle(update);
      const debouncedUpdate = debounce(update, CONFIG.TIMING.RESIZE_DEBOUNCE);

      window.addEventListener('scroll', throttledUpdate, { passive: true });
      window.addEventListener('resize', debouncedUpdate, { passive: true });

      update();

      log.debug('Progress bar ready');
    }

    return { init: init, update: update };
  })();


  /* ═══════════════════════════════════════════════════════════
     L19 — SESSION PERSISTENCE
     ═══════════════════════════════════════════════════════════ */

  const Session = (function () {

    function load() {
      if (!CONFIG.FEATURES.SESSION_MEMORY) return;

      state.session.heroSeen = storage.isSet(CONFIG.STORAGE.HERO_SEEN_KEY);
      state.session.shouldSkipHero = CONFIG.STORAGE.SKIP_HERO_ON_REPEAT && state.session.heroSeen;

      log.debug('Session loaded:', state.session);
    }

    function markHeroSeen() {
      if (!CONFIG.FEATURES.SESSION_MEMORY) return;
      storage.setFlag(CONFIG.STORAGE.HERO_SEEN_KEY);
      state.session.heroSeen = true;
    }

    function reset() {
      storage.remove(CONFIG.STORAGE.HERO_SEEN_KEY);
      state.session.heroSeen = false;
      state.session.shouldSkipHero = false;
      log.debug('Session reset');
    }

    return { load: load, markHeroSeen: markHeroSeen, reset: reset };
  })();


  /* ═══════════════════════════════════════════════════════════
     L20 — INIT & BOOT
     ═══════════════════════════════════════════════════════════ */

  function init() {
    if (state.initialised) return;
    state.initialised = true;

    const bootStart = now();

    log.group('BOOT', function () {

      log.debug('Initializing v' + VERSION);

      /* Session */
      Session.load();

      /* Phase 1 — Header & Progress (sync, fast) */
      HeaderState.init();
      ProgressBar.init();

      /* Phase 2 — Reveal engine (next frame for layout stability) */
      window.requestAnimationFrame(function () {
        AutoTagger.tagAll();

        setTimeout(function () {
          Observer.start();

          /* Mark hero seen after first paint */
          setTimeout(function () {
            Session.markHeroSeen();
          }, 300);
        }, 60);
      });

      /* Phase 3 — Smooth scroll bind */
      AnchorHandler.bind();

      /* Phase 4 — Safety fallback (in case JS partially fails) */
      if (CONFIG.FEATURES.SAFETY_FALLBACK) {
        setTimeout(function () {
          const hidden = document.querySelectorAll(
            '.reveal-element:not(.reveal-visible)'
          );
          if (hidden.length > 0) {
            log.warn('Safety reveal triggered for', hidden.length, 'elements');
            /* Only reveal if above the fold or very long delay */
            hidden.forEach(function (el) {
              const rect = el.getBoundingClientRect();
              if (rect.top < window.innerHeight * 1.2) {
                RevealEngine.reveal(el);
              }
            });
          }
        }, CONFIG.TIMING.SAFETY_TIMEOUT);
      }

      /* Listen for dynamic content render */
      document.addEventListener('missmath:content-rendered', function () {
        setTimeout(function () {
          Observer.refresh();
        }, 100);
      });

      /* Emit ready */
      Bus.emit(CONFIG.EVENTS.READY, {
        version: VERSION,
        reducedMotion: ENV.reducedMotion,
      });

      /* Mark body ready */
      document.body.classList.add('scroll-effects-ready');
      document.body.setAttribute('data-scroll-version', VERSION);

      state.bootedAt = Date.now();
      Metrics.set('bootMs', Math.round(now() - bootStart));

      log.debug('Boot complete in', Metrics.get().bootMs + 'ms');
    });
  }


  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════ */

  function getStats() {
    return {
      version: VERSION,
      build: BUILD,
      initialised: state.initialised,
      bootedAt: state.bootedAt,

      env: {
        reducedMotion: ENV.reducedMotion,
        isTouch: ENV.isTouch,
        isMobile: ENV.isMobile,
        isDesktop: ENV.isDesktop,
        supportsIO: ENV.supportsIO,
        supportsRAF: ENV.supportsRAF,
        saveData: ENV.saveData,
      },

      reveal: {
        total: state.reveal.total,
        byType: Object.assign({}, state.reveal.byType),
        observerActive: !!state.reveal.observer,
      },

      scroll: {
        isAnimating: state.scroll.isAnimating,
        cancelled: state.scroll.cancelled,
      },

      header: {
        scrolled: state.header.wasScrolled,
      },

      progress: {
        lastValue: state.progress.lastValue,
      },

      session: {
        heroSeen: state.session.heroSeen,
        shouldSkipHero: state.session.shouldSkipHero,
      },

      metrics: Metrics.get(),
      busEvents: Bus.getCount(),
    };
  }

  function getMetrics() {
    return Metrics.get();
  }

  function refresh() {
    const tagged = AutoTagger.tagAll();
    const observed = Observer.refresh();

    Bus.emit(CONFIG.EVENTS.REFRESH, {
      tagged: tagged,
      observed: observed,
    });

    return { tagged: tagged, observed: observed };
  }

  function revealAll() {
    return RevealEngine.revealAll();
  }

  function revealElement(el) {
    if (typeof el === 'string') {
      el = document.querySelector(el);
    }
    return RevealEngine.reveal(el);
  }

  function scrollTo(target) {
    let el;
    if (typeof target === 'string') {
      el = document.querySelector(target);
    } else {
      el = target;
    }
    return SmoothScroll.scrollToElement(el);
  }

  function scrollToTop() {
    SmoothScroll.scrollToY(0, CONFIG.TIMING.SCROLL_DURATION);
    return true;
  }

  function reset() {
    Session.reset();
    state.reveal.revealed.clear();
    state.reveal.total = 0;
    Object.keys(state.reveal.byType).forEach(function (k) {
      state.reveal.byType[k] = 0;
    });
    Metrics.reset();
    log.debug('Reset complete');
    return true;
  }

  const API = {
    version: VERSION,
    build: BUILD,

    /* Lifecycle */
    init: init,
    reset: reset,

    /* Reveal control */
    refresh: refresh,
    revealAll: revealAll,
    revealElement: revealElement,

    /* Scroll control */
    scrollTo: scrollTo,
    scrollToTop: scrollToTop,
    cancelScroll: SmoothScroll.cancel,

    /* Inspection */
    getStats: getStats,
    getMetrics: getMetrics,

    /* Events */
    on: Bus.on,
    off: Bus.on,
    emit: Bus.emit,

    /* Config */
    config: Object.freeze(Object.assign({}, CONFIG)),
  };

  try {
    Object.defineProperty(window, 'MissMathScroll', {
      value: Object.freeze(API),
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch (e) {
    window.MissMathScroll = API;
  }


  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    setTimeout(init, 0);
  }


  /* ═══════════════════════════════════════════════════════════
     CLEANUP
     ═══════════════════════════════════════════════════════════ */

  window.addEventListener('pagehide', function () {
    try {
      Observer.destroy();
      Bus.clear();
    } catch (e) { }
  }, { once: true });


  /* ═══════════════════════════════════════════════════════════
     END
     ═══════════════════════════════════════════════════════════ */

})();