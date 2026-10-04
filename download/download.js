/* ============================================================
   download.js
   Miss Math — Download Page Interactions
   فاز ۴ — نسخه جامع v2.0.0

   ═══════════════════════════════════════════════════════════
   OVERVIEW
   ═══════════════════════════════════════════════════════════
   Complete interaction layer for the download page.

   ═══════════════════════════════════════════════════════════
   ARCHITECTURE (25 LAYERS)
   ═══════════════════════════════════════════════════════════
   L01  Guards & Version
   L02  Config (expanded)
   L03  Environment Detection
   L04  Logger
   L05  State
   L06  Event Bus (pub/sub)
   L07  Utilities
   L08  Persian Number Helpers
   L09  Date Helpers
   L10  Announcer (aria-live)
   L11  Metrics Collector
   L12  Footer Year
   L13  Stats Counter (advanced)
   L14  Hero Phone Parallax
   L15  Floating Symbols
   L16  Scroll Reveal
   L17  Smooth Scroll
   L18  Download Buttons (with PWA stub)
   L19  Visibility Awareness
   L20  Scroll Hint
   L21  Keyboard Navigation
   L22  Viewport Height Manager
   L23  Idle Detection
   L24  Error Boundary
   L25  Public API + Boot

   ═══════════════════════════════════════════════════════════
   KEY FEATURES
   ═══════════════════════════════════════════════════════════
   • Full pub/sub event system for cross-module communication
   • Stats counter with easing, stagger, and re-run support
   • Phone parallax with smooth ease-back to base rotation
   • Scroll reveal with IntersectionObserver + stagger delays
   • Smooth scroll with header offset and focus management
   • Download button feedback with PWA install prompt stub
   • Idle detection for deferred work
   • Visibility awareness (pause animations on hidden tab)
   • Error boundary (never crashes the page)
   • Full a11y (aria-live, focus management, keyboard)
   • Respects prefers-reduced-motion, saveData, prefers-contrast

   ═══════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════
   MissMathDownload.version
   MissMathDownload.getState()
   MissMathDownload.getMetrics()
   MissMathDownload.recount()
   MissMathDownload.scrollToTop()
   MissMathDownload.on(event, handler)
   MissMathDownload.off(event, handler)
   MissMathDownload.emit(event, detail)
   ============================================================ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     L01 — GUARDS & VERSION
     ═══════════════════════════════════════════════════════════ */

  if (typeof window === 'undefined') return;
  if (typeof document === 'undefined') return;
  if (window.__MissMathDownloadLoaded) return;
  window.__MissMathDownloadLoaded = true;

  const VERSION = '2.0.0';
  const BUILD = '1403.07';


  /* ═══════════════════════════════════════════════════════════
     L02 — CONFIG (EXPANDED)
     ═══════════════════════════════════════════════════════════ */

  const CONFIG = {

    VERSION: VERSION,
    BUILD: BUILD,
    DEBUG: false,

    /* ─── Timing ─── */
    TIMING: {
      COUNTER_DURATION:     2000,
      COUNTER_STAGGER:      180,
      COUNTER_DECIMAL:      1,
      REVEAL_DELAY_BASE:    0,
      REVEAL_DELAY_STEP:    60,
      REVEAL_THRESHOLD:     0.15,
      REVEAL_ROOT_MARGIN:   '0px 0px -40px 0px',
      PARALLAX_THROTTLE:    16,
      PARALLAX_IDLE_BACK:   1200,
      PARALLAX_BACK_SPEED:  0.06,
      BUTTON_FEEDBACK_MS:   180,
      SCROLL_HINT_THRESHOLD: 200,
      SMOOTH_SCROLL_MS:     600,
      HEADER_OFFSET:        80,
      IDLE_TIMEOUT_MS:      1500,
      ANNOUNCE_DELAY:       30,
    },

    /* ─── Selectors ─── */
    SELECTORS: {
      STATS:          '.dl-hero__stat-num[data-count]',
      PHONE:          '#hero-phone',
      PHONE_WRAPPER:  '#hero-visual',
      FLOATING:       '.dl-float',
      FOOTER_YEAR:    '#dl-year',
      REVEAL_TARGETS: '.dl-feature, .dl-step, .dl-faq__item, .dl-shot, .dl-trust__item',
      DOWNLOAD_BTNS:  '[id^="download-btn"]',
      SCROLL_LINKS:   'a[href^="#"]',
      SCROLL_HINT:    '.dl-hero__scroll',
      FAQ_ITEMS:      '.dl-faq__item',
      CTA_CARD:       '.dl-cta__card',
    },

    /* ─── Parallax ─── */
    PARALLAX: {
      ENABLED:          true,
      BASE_ROTATE_Y:    -14,
      BASE_ROTATE_X:    6,
      MAX_ROTATE_Y:     22,
      MAX_ROTATE_X:     12,
      EASE_FACTOR:      0.08,
    },

    /* ─── Persistence ─── */
    STORAGE: {
      VISITED_KEY:    'miss-math:download-visited:v1',
      INSTALL_KEY:    'miss-math:download-installed:v1',
    },

    /* ─── A11Y ─── */
    A11Y: {
      LIVE_ID: 'download-live-region',
      MESSAGES: {
        DOWNLOADING:   'در حال آماده‌سازی دانلود...',
        SCROLL_TO_TOP: 'بازگشت به بالای صفحه',
        INSTALLED:     'اپلیکیشن با موفقیت نصب شد',
      },
    },

    /* ─── Persian digits ─── */
    PERSIAN_DIGITS: ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'],

    /* ─── Analytics events (listened by parent site if present) ─── */
    EVENTS: {
      PAGE_VIEW:       'download:page-view',
      STATS_START:     'download:stats-start',
      STATS_DONE:      'download:stats-done',
      BTN_CLICK:       'download:btn-click',
      BTN_INSTALLED:   'download:btn-installed',
      SCROLL_REVEAL:   'download:scroll-reveal',
      PARALLAX_INIT:   'download:parallax-init',
      SMOOTH_SCROLL:   'download:smooth-scroll',
      TAB_HIDDEN:      'download:tab-hidden',
      TAB_VISIBLE:     'download:tab-visible',
      ERROR:           'download:error',
    },

    /* ─── Feature flags ─── */
    FEATURES: {
      STATS_COUNTER:    true,
      PHONE_PARALLAX:   true,
      SCROLL_REVEAL:    true,
      SMOOTH_SCROLL:    true,
      FLOATING_ANIM:    true,
      SCROLL_HINT_FADE: true,
      KEYBOARD_ESC:     true,
      VIEWPORT_FIX:     true,
      IDLE_DETECTION:   true,
      ERROR_BOUNDARY:   true,
      VISIBILITY_AWARE: true,
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

    const reducedMotion = mq('(prefers-reduced-motion: reduce)');
    const highContrast = mq('(prefers-contrast: more)');
    const isTouch = mq('(hover: none) and (pointer: coarse)');
    const isDesktop = mq('(min-width: 960px)');
    const isMobile = mq('(max-width: 640px)');
    const isTablet = mq('(min-width: 641px) and (max-width: 959px)');
    const isLandscape = mq('(orientation: landscape)');

    return {
      /* Motion */
      reducedMotion: reducedMotion,
      highContrast: highContrast,

      /* Device */
      isTouch: isTouch,
      isDesktop: isDesktop,
      isMobile: isMobile,
      isTablet: isTablet,
      isLandscape: isLandscape,

      /* RTL / Language */
      isRTL: document.documentElement.getAttribute('dir') === 'rtl',
      language: document.documentElement.getAttribute('lang') || 'fa',

      /* Network */
      saveData: (nav.connection && nav.connection.saveData) || false,
      effectiveType: (nav.connection && nav.connection.effectiveType) || 'unknown',
      online: nav.onLine !== false,

      /* Capabilities */
      supportsRAF: typeof window.requestAnimationFrame === 'function',
      supportsCAF: typeof window.cancelAnimationFrame === 'function',
      supportsIO: 'IntersectionObserver' in window,
      supportsPerf: typeof performance !== 'undefined' && typeof performance.now === 'function',
      supportsPointer: 'PointerEvent' in window,
      supportsIdle: 'requestIdleCallback' in window,
      supportsStorage: (function () {
        try {
          const k = '__mm_dl_test__';
          window.localStorage.setItem(k, k);
          window.localStorage.removeItem(k);
          return true;
        } catch (e) { return false; }
      })(),
      supportsPWA: 'serviceWorker' in navigator,

      /* Hardware */
      hardwareConcurrency: nav.hardwareConcurrency || 0,
      deviceMemory: nav.deviceMemory || 0,
      maxTouchPoints: nav.maxTouchPoints || 0,
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L04 — LOGGER
     ═══════════════════════════════════════════════════════════ */

  const log = (function () {
    const prefix = '[download]';

    const safe = function (method) {
      if (!window.console || typeof window.console[method] !== 'function') {
        return function () {};
      }
      return function () {
        const args = Array.prototype.slice.call(arguments);
        args.unshift(prefix);
        try { window.console[method].apply(window.console, args); } catch (e) {}
      };
    };

    return {
      debug: CONFIG.DEBUG ? safe('log') : function () {},
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
    /* Boot */
    initialised: false,
    bootedAt: null,

    /* Refs */
    refs: {
      phoneEl: null,
      wrapperEl: null,
      scrollHintEl: null,
      footerYearEl: null,
    },

    /* Stats */
    stats: {
      items: [],
      started: false,
      completedCount: 0,
    },

    /* Parallax */
    parallax: {
      rafId: null,
      active: false,
      targetY: -14,
      targetX: 6,
      currentY: -14,
      currentX: 6,
      lastMoveAt: 0,
    },

    /* Reveal */
    reveal: {
      observer: null,
      targets: [],
      revealedCount: 0,
    },

    /* Scroll hint */
    scrollHint: {
      visible: true,
    },

    /* Metrics */
    metrics: {
      bootMs: 0,
      statAnims: 0,
      parallaxFrames: 0,
      revealsCount: 0,
      btnClicks: 0,
      errors: 0,
    },

    /* Storage */
    visited: false,
    alreadyInstalled: false,
  };


  /* ═══════════════════════════════════════════════════════════
     L06 — EVENT BUS (internal pub/sub)
     ═══════════════════════════════════════════════════════════ */

  const Bus = (function () {

    const listeners = new Map();
    let emitCount = 0;

    function on(name, fn) {
      if (typeof fn !== 'function') return function () {};
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

      /* Local listeners */
      const arr = listeners.get(name);
      if (arr && arr.length) {
        arr.slice().forEach(function (fn) {
          try { fn(detail || {}); } catch (err) {
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
      } catch (e) {}

      /* Forward to parent site if present */
      try {
        if (window.parent && window.parent !== window && window.parent.MissMathMain) {
          window.parent.MissMathMain.emit(name, detail);
        }
      } catch (e) {}
    }

    function getCount() { return emitCount; }
    function clear() { listeners.clear(); emitCount = 0; }

    return { on: on, emit: emit, getCount: getCount, clear: clear };
  })();


  /* ═══════════════════════════════════════════════════════════
     L07 — UTILITIES
     ═══════════════════════════════════════════════════════════ */

  const util = {

    rafThrottle: function (fn) {
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
    },

    debounce: function (fn, wait) {
      let timer = null;
      return function debounced() {
        const args = arguments;
        const ctx = this;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
          fn.apply(ctx, args);
        }, wait);
      };
    },

    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },

    clamp: function (v, min, max) {
      return Math.max(min, Math.min(max, v));
    },

    now: function () {
      return ENV.supportsPerf ? performance.now() : Date.now();
    },

    easeOutCubic: function (t) {
      return 1 - Math.pow(1 - t, 3);
    },

    easeInOutCubic: function (t) {
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    requestIdle: function (fn, timeout) {
      if (ENV.supportsIdle) {
        return window.requestIdleCallback(fn, { timeout: timeout || 500 });
      }
      return setTimeout(fn, 1);
    },

    safeStorage: {
      get: function (key) {
        if (!ENV.supportsStorage) return null;
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
      },
      set: function (key, val) {
        if (!ENV.supportsStorage) return false;
        try { window.localStorage.setItem(key, val); return true; } catch (e) { return false; }
      },
      remove: function (key) {
        if (!ENV.supportsStorage) return false;
        try { window.localStorage.removeItem(key); return true; } catch (e) { return false; }
      },
    },

    safeCall: function (fn, args, ctx) {
      if (typeof fn !== 'function') return null;
      try { return fn.apply(ctx || null, args || []); } catch (err) {
        state.metrics.errors++;
        log.error('safeCall failed', err);
        return null;
      }
    },
  };


  /* ═══════════════════════════════════════════════════════════
     L08 — PERSIAN NUMBER HELPERS
     ═══════════════════════════════════════════════════════════ */

  function toPersian(input) {
    if (input === null || input === undefined) return '';
    return String(input).replace(/[0-9]/g, function (d) {
      return CONFIG.PERSIAN_DIGITS[Number(d)] || d;
    });
  }

  function formatStat(value, decimal) {
    if (decimal > 0) {
      const fixed = value.toFixed(decimal);
      const withSep = fixed.replace('.', '٫');
      return toPersian(withSep);
    }
    return toPersian(Math.round(value));
  }

  function formatThousands(num) {
    try {
      return new Intl.NumberFormat('fa-IR').format(num);
    } catch (e) {
      const parts = String(num).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
      return toPersian(parts.join('.'));
    }
  }


  /* ═══════════════════════════════════════════════════════════
     L09 — DATE HELPERS
     ═══════════════════════════════════════════════════════════ */

  function getJalaliYear() {
    try {
      const gregorian = new Date().getFullYear();
      return gregorian - 621;
    } catch (e) {
      return 1403;
    }
  }


  /* ═══════════════════════════════════════════════════════════
     L10 — ANNOUNCER (aria-live)
     ═══════════════════════════════════════════════════════════ */

  const Announcer = (function () {

    let regionEl = null;

    function ensure() {
      if (regionEl && document.contains(regionEl)) return regionEl;

      regionEl = document.getElementById(CONFIG.A11Y.LIVE_ID);
      if (regionEl) return regionEl;

      regionEl = document.createElement('div');
      regionEl.id = CONFIG.A11Y.LIVE_ID;
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
      setTimeout(function () {
        el.textContent = String(message);
      }, CONFIG.TIMING.ANNOUNCE_DELAY);
    }

    return { announce: announce };
  })();


  /* ═══════════════════════════════════════════════════════════
     L11 — METRICS COLLECTOR
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
     L12 — FOOTER YEAR
     ═══════════════════════════════════════════════════════════ */

  function initFooterYear() {
    const el = document.querySelector(CONFIG.SELECTORS.FOOTER_YEAR);
    if (!el) {
      log.debug('Footer year element not found');
      return false;
    }

    state.refs.footerYearEl = el;

    try {
      const jalali = getJalaliYear();
      el.textContent = toPersian(jalali);
      log.debug('Footer year set to', jalali);
      return true;
    } catch (e) {
      log.warn('Footer year set failed', e);
      return false;
    }
  }


  /* ═══════════════════════════════════════════════════════════
     L13 — STATS COUNTER (ADVANCED)
     ═══════════════════════════════════════════════════════════ */

  const StatsCounter = (function () {

    function collect() {
      state.stats.items = [];
      const nodes = document.querySelectorAll(CONFIG.SELECTORS.STATS);

      nodes.forEach(function (node, index) {
        const target = parseFloat(node.getAttribute('data-count') || '0');
        const decimal = parseInt(node.getAttribute('data-decimal') || '0', 10);
        const suffix = node.getAttribute('data-suffix') || '';
        const prefix = node.getAttribute('data-prefix') || '';

        state.stats.items.push({
          el: node,
          target: target,
          decimal: decimal,
          suffix: suffix,
          prefix: prefix,
          index: index,
          delay: index * CONFIG.TIMING.COUNTER_STAGGER,
        });
      });

      log.debug('Collected', state.stats.items.length, 'stats');
    }

    function animateOne(item) {
      const startTime = util.now();
      const duration = CONFIG.TIMING.COUNTER_DURATION;

      function tick() {
        const elapsed = util.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = util.easeOutCubic(progress);
        const current = item.target * eased;

        item.el.textContent =
          item.prefix + formatStat(current, item.decimal) + item.suffix;

        if (progress < 1) {
          window.requestAnimationFrame(tick);
        } else {
          item.el.textContent =
            item.prefix + formatStat(item.target, item.decimal) + item.suffix;
          state.stats.completedCount++;
          Metrics.increment('statAnims');

          /* Emit completion when all done */
          if (state.stats.completedCount === state.stats.items.length) {
            Bus.emit(CONFIG.EVENTS.STATS_DONE, {
              count: state.stats.items.length,
            });
          }
        }
      }

      window.requestAnimationFrame(tick);
    }

    function start() {
      if (state.stats.started) return;
      state.stats.started = true;

      Bus.emit(CONFIG.EVENTS.STATS_START, {
        count: state.stats.items.length,
      });

      /* Reduced motion → instant */
      if (ENV.reducedMotion) {
        state.stats.items.forEach(function (item) {
          item.el.textContent =
            item.prefix + formatStat(item.target, item.decimal) + item.suffix;
        });
        state.stats.completedCount = state.stats.items.length;
        return;
      }

      /* Animate with stagger */
      state.stats.items.forEach(function (item) {
        setTimeout(function () {
          animateOne(item);
        }, item.delay);
      });
    }

    function reset() {
      state.stats.started = false;
      state.stats.completedCount = 0;
      state.stats.items.forEach(function (item) {
        item.el.textContent = item.prefix + '۰' + item.suffix;
      });
    }

    function init() {
      if (!CONFIG.FEATURES.STATS_COUNTER) return;
      collect();
      if (!state.stats.items.length) return;

      /* If IO not supported, start immediately */
      if (!ENV.supportsIO) {
        start();
        return;
      }

      /* Wait until visible */
      const firstEl = state.stats.items[0].el;
      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              start();
              observer.disconnect();
            }
          });
        },
        { threshold: 0.3 }
      );
      observer.observe(firstEl);
    }

    return { init: init, start: start, reset: reset };
  })();


  /* ═══════════════════════════════════════════════════════════
     L14 — HERO PHONE PARALLAX
     ═══════════════════════════════════════════════════════════ */

  const PhoneParallax = (function () {

    let rafId = null;

    function startLoop() {
      if (rafId !== null) return;

      function loop() {
        const elapsed = util.now() - state.parallax.lastMoveAt;
        const target = state.parallax.targetY;
        const targetX = state.parallax.targetX;

        /* Ease toward targets */
        state.parallax.currentY = util.lerp(
          state.parallax.currentY,
          target,
          CONFIG.PARALLAX.EASE_FACTOR
        );
        state.parallax.currentX = util.lerp(
          state.parallax.currentX,
          targetX,
          CONFIG.PARALLAX.EASE_FACTOR
        );

        /* Idle → ease back to base */
        if (elapsed > CONFIG.TIMING.PARALLAX_IDLE_BACK) {
          state.parallax.targetY = util.lerp(
            state.parallax.targetY,
            CONFIG.PARALLAX.BASE_ROTATE_Y,
            CONFIG.TIMING.PARALLAX_BACK_SPEED
          );
          state.parallax.targetX = util.lerp(
            state.parallax.targetX,
            CONFIG.PARALLAX.BASE_ROTATE_X,
            CONFIG.TIMING.PARALLAX_BACK_SPEED
          );
        }

        if (state.refs.phoneEl) {
          state.refs.phoneEl.style.transform =
            'rotateY(' + state.parallax.currentY.toFixed(3) + 'deg) ' +
            'rotateX(' + state.parallax.currentX.toFixed(3) + 'deg)';
        }

        Metrics.increment('parallaxFrames');

        /* Continue while active OR easing */
        if (state.parallax.active || elapsed < 800) {
          rafId = window.requestAnimationFrame(loop);
        } else {
          rafId = null;
        }
      }

      rafId = window.requestAnimationFrame(loop);
    }

    function onPointerMove(e) {
      if (!state.parallax.active) return;
      if (!state.refs.phoneEl || !state.refs.wrapperEl) return;

      state.parallax.lastMoveAt = util.now();

      const rect = state.refs.wrapperEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = (e.clientX - centerX) / rect.width;
      const dy = (e.clientY - centerY) / rect.height;
      const factor = ENV.isRTL ? -1 : 1;

      state.parallax.targetY = util.clamp(
        CONFIG.PARALLAX.BASE_ROTATE_Y + dx * CONFIG.PARALLAX.MAX_ROTATE_Y * factor,
        CONFIG.PARALLAX.BASE_ROTATE_Y - CONFIG.PARALLAX.MAX_ROTATE_Y,
        CONFIG.PARALLAX.BASE_ROTATE_Y + CONFIG.PARALLAX.MAX_ROTATE_Y
      );

      state.parallax.targetX = util.clamp(
        CONFIG.PARALLAX.BASE_ROTATE_X - dy * CONFIG.PARALLAX.MAX_ROTATE_X,
        CONFIG.PARALLAX.BASE_ROTATE_X - CONFIG.PARALLAX.MAX_ROTATE_X,
        CONFIG.PARALLAX.BASE_ROTATE_X + CONFIG.PARALLAX.MAX_ROTATE_X
      );

      startLoop();
    }

    function onEnter() {
      state.parallax.active = true;
      state.parallax.lastMoveAt = util.now();
      startLoop();
    }

    function onLeave() {
      state.parallax.active = false;
      state.parallax.targetY = CONFIG.PARALLAX.BASE_ROTATE_Y;
      state.parallax.targetX = CONFIG.PARALLAX.BASE_ROTATE_X;
      startLoop();
    }

    function init() {
      if (!CONFIG.FEATURES.PHONE_PARALLAX) return;
      if (!CONFIG.PARALLAX.ENABLED) return;
      if (ENV.reducedMotion) return;
      if (ENV.isTouch) return;
      if (!ENV.isDesktop) return;
      if (ENV.saveData) return;

      state.refs.phoneEl = document.querySelector(CONFIG.SELECTORS.PHONE);
      state.refs.wrapperEl = document.querySelector(CONFIG.SELECTORS.PHONE_WRAPPER);

      if (!state.refs.phoneEl || !state.refs.wrapperEl) {
        log.debug('Phone or wrapper not found — skipping parallax');
        return;
      }

      /* Cancel CSS entry animation and let JS own the transform */
      state.refs.phoneEl.style.animation = 'none';
      state.refs.phoneEl.style.transform =
        'rotateY(' + CONFIG.PARALLAX.BASE_ROTATE_Y + 'deg) ' +
        'rotateX(' + CONFIG.PARALLAX.BASE_ROTATE_X + 'deg)';

      const moveHandler = util.rafThrottle(onPointerMove);
      document.addEventListener('mousemove', moveHandler, { passive: true });
      state.refs.wrapperEl.addEventListener('mouseenter', onEnter, { passive: true });
      state.refs.wrapperEl.addEventListener('mouseleave', onLeave, { passive: true });

      log.debug('Parallax ready');
      Bus.emit(CONFIG.EVENTS.PARALLAX_INIT, {});
    }

    function destroy() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    return { init: init, destroy: destroy };
  })();


  /* ═══════════════════════════════════════════════════════════
     L15 — FLOATING SYMBOLS
     ═══════════════════════════════════════════════════════════ */

  function initFloatingSymbols() {
    if (!CONFIG.FEATURES.FLOATING_ANIM) return;
    if (ENV.reducedMotion) return;

    const symbols = document.querySelectorAll(CONFIG.SELECTORS.FLOATING);
    if (!symbols.length) return;

    symbols.forEach(function (symbol, i) {
      const delay = (i * 0.4).toFixed(2);
      const duration = (7 + i * 1.3).toFixed(1);
      symbol.style.animationDelay = '-' + delay + 's';
      symbol.style.animationDuration = duration + 's';
    });

    log.debug('Floating symbols initialized:', symbols.length);
  }


  /* ═══════════════════════════════════════════════════════════
     L16 — SCROLL REVEAL
     ═══════════════════════════════════════════════════════════ */

  const ScrollReveal = (function () {

    function reveal(el) {
      el.classList.add('is-revealed');
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      state.reveal.revealedCount++;
      Metrics.increment('revealsCount');
      Bus.emit(CONFIG.EVENTS.SCROLL_REVEAL, { count: state.reveal.revealedCount });
    }

    function init() {
      if (!CONFIG.FEATURES.SCROLL_REVEAL) return;

      const all = document.querySelectorAll(CONFIG.SELECTORS.REVEAL_TARGETS);
      if (!all.length) return;

      /* Reduced motion OR no IO → show all instantly */
      if (ENV.reducedMotion || !ENV.supportsIO) {
        all.forEach(reveal);
        return;
      }

      state.reveal.targets = Array.prototype.slice.call(all);

      /* Set initial hidden state with stagger */
      state.reveal.targets.forEach(function (el, i) {
        const delay = CONFIG.TIMING.REVEAL_DELAY_BASE +
                      i * CONFIG.TIMING.REVEAL_DELAY_STEP;

        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition =
          'opacity 700ms cubic-bezier(0.16, 1, 0.3, 1) ' + delay + 'ms, ' +
          'transform 700ms cubic-bezier(0.16, 1, 0.3, 1) ' + delay + 'ms';
      });

      /* Observe */
      state.reveal.observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            reveal(entry.target);
            state.reveal.observer.unobserve(entry.target);
          });
        },
        {
          threshold: CONFIG.TIMING.REVEAL_THRESHOLD,
          rootMargin: CONFIG.TIMING.REVEAL_ROOT_MARGIN,
        }
      );

      state.reveal.targets.forEach(function (el) {
        state.reveal.observer.observe(el);
      });

      log.debug('Reveal observer watching', state.reveal.targets.length, 'elements');
    }

    function destroy() {
      if (state.reveal.observer) {
        state.reveal.observer.disconnect();
        state.reveal.observer = null;
      }
    }

    return { init: init, destroy: destroy };
  })();


  /* ═══════════════════════════════════════════════════════════
     L17 — SMOOTH SCROLL
     ═══════════════════════════════════════════════════════════ */

  function initSmoothScroll() {
    if (!CONFIG.FEATURES.SMOOTH_SCROLL) return;

    const links = document.querySelectorAll(CONFIG.SELECTORS.SCROLL_LINKS);
    if (!links.length) return;

    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        const href = link.getAttribute('href');
        if (!href || href === '#') return;

        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();

        const offsetTop = target.getBoundingClientRect().top + window.pageYOffset;
        const finalY = Math.max(0, offsetTop - CONFIG.TIMING.HEADER_OFFSET);

        if (ENV.reducedMotion) {
          window.scrollTo(0, finalY);
        } else {
          window.scrollTo({ top: finalY, behavior: 'smooth' });
        }

        /* Update URL without jumping */
        try { history.replaceState(null, '', href); } catch (err) {}

        /* Move focus for a11y */
        setTimeout(function () {
          if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '-1');
          }
          try { target.focus({ preventScroll: true }); } catch (err) {}
        }, 400);

        Bus.emit(CONFIG.EVENTS.SMOOTH_SCROLL, { href: href });
      });
    });

    log.debug('Smooth scroll bound to', links.length, 'links');
  }


  /* ═══════════════════════════════════════════════════════════
     L18 — DOWNLOAD BUTTONS
     ─── Visual feedback + PWA install prompt stub
     ═══════════════════════════════════════════════════════════ */

  function initDownloadButtons() {
    const buttons = document.querySelectorAll(CONFIG.SELECTORS.DOWNLOAD_BTNS);
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        Metrics.increment('btnClicks');
        Bus.emit(CONFIG.EVENTS.BTN_CLICK, { id: btn.id });

        /* Visual press feedback */
        btn.style.transform = 'translate(3px, 3px) scale(0.98)';
        setTimeout(function () {
          btn.style.transform = '';
        }, CONFIG.TIMING.BUTTON_FEEDBACK_MS);

        /* Announce */
        Announcer.announce(CONFIG.A11Y.MESSAGES.DOWNLOADING);

        /* ──────────────────────────────────────────────────
           ⚠️ YOUR PWA INSTALL LOGIC GOES HERE
           ──────────────────────────────────────────────────
           Example:
             if (window.deferredPrompt) {
               window.deferredPrompt.prompt();
               window.deferredPrompt.userChoice.then(function (choice) {
                 if (choice.outcome === 'accepted') {
                   util.safeStorage.set(CONFIG.STORAGE.INSTALL_KEY, '1');
                   Bus.emit(CONFIG.EVENTS.BTN_INSTALLED, {});
                 }
                 window.deferredPrompt = null;
               });
             }
           ────────────────────────────────────────────────── */

        log.debug('Download button clicked:', btn.id);
      });
    });

    log.debug('Bound download buttons:', buttons.length);
  }


  /* ═══════════════════════════════════════════════════════════
     L19 — VISIBILITY AWARENESS
     ═══════════════════════════════════════════════════════════ */

  function initVisibility() {
    if (!CONFIG.FEATURES.VISIBILITY_AWARE) return;

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        PhoneParallax.destroy();
        Bus.emit(CONFIG.EVENTS.TAB_HIDDEN, {});
        log.debug('Tab hidden — paused animations');
      } else {
        Bus.emit(CONFIG.EVENTS.TAB_VISIBLE, {});
        log.debug('Tab visible');
      }
    });
  }


  /* ═══════════════════════════════════════════════════════════
     L20 — SCROLL HINT FADE
     ═══════════════════════════════════════════════════════════ */

  function initScrollHint() {
    if (!CONFIG.FEATURES.SCROLL_HINT_FADE) return;

    const el = document.querySelector(CONFIG.SELECTORS.SCROLL_HINT);
    if (!el) return;

    state.refs.scrollHintEl = el;
    el.style.transition = 'opacity 400ms cubic-bezier(0.16, 1, 0.3, 1)';

    const update = util.rafThrottle(function () {
      const y = window.pageYOffset || document.documentElement.scrollTop;
      const shouldHide = y > CONFIG.TIMING.SCROLL_HINT_THRESHOLD;

      if (shouldHide === state.scrollHint.visible) return;
      state.scrollHint.visible = !shouldHide;

      el.style.opacity = shouldHide ? '0' : '1';
      el.style.pointerEvents = shouldHide ? 'none' : 'auto';
    });

    window.addEventListener('scroll', update, { passive: true });
    update();
  }


  /* ═══════════════════════════════════════════════════════════
     L21 — KEYBOARD NAVIGATION
     ═══════════════════════════════════════════════════════════ */

  function initKeyboard() {
    if (!CONFIG.FEATURES.KEYBOARD_ESC) return;

    document.addEventListener('keydown', function (e) {
      /* Escape → scroll to top */
      if (e.key === 'Escape') {
        const y = window.pageYOffset || 0;
        if (y > 400) {
          if (ENV.reducedMotion) {
            window.scrollTo(0, 0);
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          Announcer.announce(CONFIG.A11Y.MESSAGES.SCROLL_TO_TOP);
        }
      }
    });
  }


  /* ═══════════════════════════════════════════════════════════
     L22 — VIEWPORT HEIGHT MANAGER
     ─── Fix for 100vh on mobile browsers
     ═══════════════════════════════════════════════════════════ */

  function initViewportHeight() {
    if (!CONFIG.FEATURES.VIEWPORT_FIX) return;

    function setVH() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
    }

    setVH();
    window.addEventListener('resize', util.rafThrottle(setVH), { passive: true });
    window.addEventListener('orientationchange', function () {
      setTimeout(setVH, 100);
    });
  }


  /* ═══════════════════════════════════════════════════════════
     L23 — IDLE DETECTION
     ═══════════════════════════════════════════════════════════ */

  function initIdleDetection() {
    if (!CONFIG.FEATURES.IDLE_DETECTION) return;

    util.requestIdle(function () {
      log.debug('Idle callback fired — deferred work can run here');
    }, CONFIG.TIMING.IDLE_TIMEOUT_MS);
  }


  /* ═══════════════════════════════════════════════════════════
     L24 — ERROR BOUNDARY
     ═══════════════════════════════════════════════════════════ */

  function initErrorBoundary() {
    if (!CONFIG.FEATURES.ERROR_BOUNDARY) return;

    window.addEventListener('error', function (e) {
      if (e && e.message && e.message.indexOf('Script error') !== -1) return;

      state.metrics.errors++;
      log.warn('Runtime error:', e && e.message);

      Bus.emit(CONFIG.EVENTS.ERROR, {
        message: e && e.message,
        file: e && e.filename,
        line: e && e.lineno,
      });
    });

    window.addEventListener('unhandledrejection', function (e) {
      state.metrics.errors++;
      const reason = e && e.reason
        ? (e.reason.message || String(e.reason))
        : 'unknown';
      log.warn('Unhandled promise:', reason);

      Bus.emit(CONFIG.EVENTS.ERROR, {
        message: reason,
        type: 'unhandledrejection',
      });
    });
  }


  /* ═══════════════════════════════════════════════════════════
     L25 — PUBLIC API + BOOT
     ═══════════════════════════════════════════════════════════ */

  function getState() {
    return {
      version: VERSION,
      build: BUILD,
      initialised: state.initialised,
      bootedAt: state.bootedAt,

      env: {
        reducedMotion: ENV.reducedMotion,
        highContrast: ENV.highContrast,
        isTouch: ENV.isTouch,
        isDesktop: ENV.isDesktop,
        isMobile: ENV.isMobile,
        isRTL: ENV.isRTL,
        saveData: ENV.saveData,
        online: ENV.online,
        supportsIO: ENV.supportsIO,
        supportsPWA: ENV.supportsPWA,
      },

      refs: {
        phone: !!state.refs.phoneEl,
        wrapper: !!state.refs.wrapperEl,
        scrollHint: !!state.refs.scrollHintEl,
        footerYear: !!state.refs.footerYearEl,
      },

      stats: {
        count: state.stats.items.length,
        started: state.stats.started,
        completed: state.stats.completedCount,
      },

      parallax: {
        active: state.parallax.active,
        rafActive: state.parallax.rafId !== null,
      },

      reveal: {
        targets: state.reveal.targets.length,
        revealed: state.reveal.revealedCount,
        observerActive: !!state.reveal.observer,
      },

      metrics: Metrics.get(),
      busEvents: Bus.getCount(),

      storage: {
        available: ENV.supportsStorage,
        visited: state.visited,
        alreadyInstalled: state.alreadyInstalled,
      },
    };
  }

  function getMetrics() {
    return Metrics.get();
  }

  function recount() {
    StatsCounter.reset();
    StatsCounter.start();
    return true;
  }

  function scrollToTop() {
    if (ENV.reducedMotion) {
      window.scrollTo(0, 0);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    Announcer.announce(CONFIG.A11Y.MESSAGES.SCROLL_TO_TOP);
  }

  function init() {
    if (state.initialised) return;
    state.initialised = true;

    const bootStart = util.now();

    log.group('BOOT', function () {
      log.debug('Initializing v' + VERSION);

      /* Track visit */
      state.visited = util.safeStorage.get(CONFIG.STORAGE.VISITED_KEY) === '1';
      state.alreadyInstalled = util.safeStorage.get(CONFIG.STORAGE.INSTALL_KEY) === '1';
      util.safeStorage.set(CONFIG.STORAGE.VISITED_KEY, '1');

      /* Phase 1 — synchronous, no dependencies */
      util.safeCall(initFooterYear);
      util.safeCall(initFloatingSymbols);
      util.safeCall(initViewportHeight);
      util.safeCall(initErrorBoundary);

      /* Emit page-view */
      Bus.emit(CONFIG.EVENTS.PAGE_VIEW, {
        visited: state.visited,
        installed: state.alreadyInstalled,
      });

      /* Phase 2 — after paint */
      setTimeout(function () {
        util.safeCall(StatsCounter.init);
        util.safeCall(ScrollReveal.init);
        util.safeCall(initSmoothScroll);
        util.safeCall(initDownloadButtons);
        util.safeCall(initScrollHint);
        util.safeCall(initKeyboard);
        util.safeCall(initVisibility);
      }, 60);

      /* Phase 3 — heavy, deferred */
      setTimeout(function () {
        util.safeCall(PhoneParallax.init);
        util.safeCall(initIdleDetection);
      }, 300);

      /* Mark ready */
      document.body.classList.add('download-ready');
      document.body.setAttribute('data-download-version', VERSION);

      state.bootedAt = Date.now();
      Metrics.set('bootMs', Math.round(util.now() - bootStart));

      log.debug('Boot complete in', Metrics.get().bootMs + 'ms');
    });
  }

  const API = {
    version: VERSION,
    build: BUILD,

    /* Lifecycle */
    init: init,

    /* Inspection */
    getState: getState,
    getMetrics: getMetrics,

    /* Actions */
    recount: recount,
    scrollToTop: scrollToTop,

    /* Events */
    on: Bus.on,
    off: Bus.on,
    emit: Bus.emit,

    /* Config (read-only) */
    config: Object.freeze(Object.assign({}, CONFIG)),
  };

  try {
    Object.defineProperty(window, 'MissMathDownload', {
      value: Object.freeze(API),
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch (e) {
    window.MissMathDownload = API;
  }

  /* Boot */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    setTimeout(init, 0);
  }

  /* Cleanup */
  window.addEventListener('pagehide', function () {
    try {
      PhoneParallax.destroy();
      ScrollReveal.destroy();
      Bus.clear();
    } catch (e) {}
  }, { once: true });

})();