/* ============================================================
   main.js
   Miss Math — Application Bootstrap
   فاز ۳ — نسخه جامع v2.0.0

   ─── OVERVIEW ─────────────────────────────────────────────
   The orchestrator. Wires all subsystems together, monitors
   runtime health, and exposes a single debug surface.

   ─── MODULES ──────────────────────────────────────────────
   1.  Guards
   2.  Config (expanded)
   3.  Environment Detection (deep)
   4.  Logger
   5.  EventBus (internal pub/sub)
   6.  Utilities
   7.  DeviceCapability
   8.  Analytics Collector
   9.  Session Tracking
   10. Dependency Loader
   11. Boot Phase Manager
   12. Announcement Bar
   13. Header State
   14. Footer Year
   15. Stats Counter
   16. Hero Parallax
   17. Scroll Progress Bar
   18. Scroll Depth Tracker
   19. Reveal Fallback
   20. Scroll Fallback
   21. Prefetch on Hover
   22. Lazy Images
   23. Font Loading Detection
   24. Connection Awareness
   25. Visibility Awareness
   26. Idle Detection
   27. Long Task Observer
   28. Toast Queue
   29. Haptic Feedback
   30. Error Boundary
   31. Console Branding
   32. Public API

   ─── PRINCIPLES ───────────────────────────────────────────
   • Idempotent — safe to reload
   • Progressive — works without JS
   • Non-blocking — all heavy work deferred
   • Fail-safe — never break the page
   • Observable — every event logged & metrics kept
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     1. GUARDS
     ============================================================ */

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (window.__MissMathMainLoaded) return;
  window.__MissMathMainLoaded = true;


  /* ============================================================
     2. VERSION
     ============================================================ */

  const VERSION = '2.0.0';
  const BUILD   = '1403.07';


  /* ============================================================
     3. CONFIG
     ============================================================ */

  const CONFIG = {

    VERSION: VERSION,
    BUILD:   BUILD,

    /* Debug */
    DEBUG: false,

    /* ─── Dependency Loader ─────────────────────────────── */
    DEPS: {
      REQUIRED: [
        'MissMathData',
        'MissMathRender',
      ],
      OPTIONAL: [
        'MissMathModal',
        'MissMathUIExtra',
        'MissMathPrize',
      ],
      TIMEOUT_MS:     5000,
      CHECK_INTERVAL: 60,
      MAX_RETRIES:    3,
      RETRY_DELAY:    180,
    },

    /* ─── Boot Phases ───────────────────────────────────── */
    BOOT: {
      /* Phase 1: immediate, no deps */
      PHASE_1_DELAY: 0,
      /* Phase 2: after deps loaded */
      PHASE_2_DELAY: 20,
      /* Phase 3: after first paint */
      PHASE_3_DELAY: 120,
      /* Phase 4: idle callback */
      PHASE_4_DELAY: 800,
    },

    /* ─── Announcement Bar ──────────────────────────────── */
    ANNOUNCE: {
      STORAGE_KEY: 'miss-math:announce-dismissed:v2',
      SLIDE_MS:    320,
    },

    /* ─── Header ────────────────────────────────────────── */
    HEADER: {
      SCROLL_THRESHOLD: 12,
      DIRECTION_DELTA:  8,
    },

    /* ─── Stats Counter ─────────────────────────────────── */
    COUNTER: {
      DURATION_MS: 1800,
      STAGGER_MS:  180,
      MIN_VISIBLE: 0.35,
    },

    /* ─── Hero Parallax ─────────────────────────────────── */
    PARALLAX: {
      MAX_SCROLL:   900,
      INTENSITY:    0.15,
      LAYER_FACTOR: 0.35,
    },

    /* ─── Scroll Progress ───────────────────────────────── */
    PROGRESS: {
      ENABLED:  true,
      MIN_H:    200,
    },

    /* ─── Scroll Depth ──────────────────────────────────── */
    SCROLL_DEPTH: {
      MILESTONES: [25, 50, 75, 90, 100],
      THROTTLE_MS: 300,
    },

    /* ─── Reveal Fallback ───────────────────────────────── */
    REVEAL: {
      TIMEOUT_MS:   3500,
      MAX_HIDDEN:   12,
    },

    /* ─── Prefetch ──────────────────────────────────────── */
    PREFETCH: {
      ENABLED:      true,
      HOVER_DELAY:  120,
      SELECTOR:     'a[href^="#"]',
    },

    /* ─── Lazy Images ───────────────────────────────────── */
    LAZY: {
      ROOT_MARGIN: '200px 0px',
      THRESHOLD:   0.01,
    },

    /* ─── Font Loading ──────────────────────────────────── */
    FONTS: {
      TIMEOUT_MS: 3000,
    },

    /* ─── Connection ────────────────────────────────────── */
    CONNECTION: {
      SLOW_TYPES: ['slow-2g', '2g', '3g'],
      OFFLINE_TOAST_MS: 3200,
      ONLINE_TOAST_MS:  2400,
    },

    /* ─── Idle ──────────────────────────────────────────── */
    IDLE: {
      TIMEOUT_MS: 400,
      ENABLED:    true,
    },

    /* ─── Long Task ─────────────────────────────────────── */
    LONGTASK: {
      THRESHOLD_MS: 80,
      ENABLED:      true,
    },

    /* ─── Toast Queue ───────────────────────────────────── */
    TOAST: {
      DURATION_MS:   4000,
      MAX_QUEUE:     4,
      STACK_OFFSET:  10,
    },

    /* ─── Haptics ───────────────────────────────────────── */
    HAPTICS: {
      ENABLED:        true,
      TAP_MS:         8,
      SUCCESS_PATTERN:[12, 40, 12],
      ERROR_PATTERN:  [30, 60, 30],
    },

    /* ─── Session ───────────────────────────────────────── */
    SESSION: {
      STORAGE_KEY: 'miss-math:session:v1',
      REFERRER_KEY:'miss-math:referrer:v1',
      UTM_KEY:     'miss-math:utm:v1',
    },

    /* ─── Analytics ─────────────────────────────────────── */
    ANALYTICS: {
      ENABLED:     true,
      MAX_EVENTS:  200,
      FLUSH_EVERY: 30000,
    },
  };


  /* ============================================================
     4. ENVIRONMENT DETECTION (DEEP)
     ============================================================ */

  const ENV = (function () {

    const mq = function (q) {
      if (!window.matchMedia) return false;
      try { return window.matchMedia(q).matches; } catch (e) { return false; }
    };

    const nav = navigator || {};

    return {
      /* Motion */
      reducedMotion:    mq('(prefers-reduced-motion: reduce)'),
      reducedData:      mq('(prefers-reduced-data: reduce)'),
      highContrast:     mq('(prefers-contrast: more)'),

      /* Device */
      isTouch:          mq('(hover: none) and (pointer: coarse)'),
      isMobile:         mq('(max-width: 640px)'),
      isTablet:         mq('(min-width: 641px) and (max-width: 1023px)'),
      isDesktop:        mq('(min-width: 1024px)'),
      orientation:      mq('(orientation: landscape)') ? 'landscape' : 'portrait',

      /* User agent */
      ua:               nav.userAgent || '',
      platform:         nav.platform || '',
      vendor:           nav.vendor || '',
      language:         nav.language || 'fa',
      languages:        (nav.languages || []).slice(),
      online:           nav.onLine !== false,

      /* Capabilities */
      supportsRAF:      typeof window.requestAnimationFrame === 'function',
      supportsCAF:      typeof window.cancelAnimationFrame === 'function',
      supportsIO:       'IntersectionObserver' in window,
      supportsRO:       'ResizeObserver' in window,
      supportsMO:       'MutationObserver' in window,
      supportsPerf:     typeof performance !== 'undefined' &&
                        typeof performance.now === 'function',
      supportsPerfObs:  'PerformanceObserver' in window,
      supportsInert:    'inert' in HTMLElement.prototype,
      supportsWAAPI:    typeof Element.prototype.animate === 'function',
      supportsIdle:     'requestIdleCallback' in window,
      supportsVibrate:  typeof nav.vibrate === 'function',
      supportsStorage:  (function () {
        try {
          const k = '__mm_main_test__';
          window.localStorage.setItem(k, k);
          window.localStorage.removeItem(k);
          return true;
        } catch (e) { return false; }
      })(),
      supportsSW:       'serviceWorker' in nav,
      supportsShare:    typeof nav.share === 'function',

      /* Hardware */
      hardwareConcurrency: nav.hardwareConcurrency || 0,
      deviceMemory:        nav.deviceMemory || 0,
      maxTouchPoints:      nav.maxTouchPoints || 0,

      /* Network */
      connection:       nav.connection || nav.mozConnection || nav.webkitConnection || null,
      effectiveType:    (nav.connection && nav.connection.effectiveType) || 'unknown',
      saveData:         (nav.connection && nav.connection.saveData) || false,

      /* Battery */
      battery:          null, /* populated async later */
    };
  })();


  /* ============================================================
     5. LOGGER
     ============================================================ */

  const log = (function () {

    const prefix = '[main]';

    const safeConsole = function (method) {
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
      debug: CONFIG.DEBUG ? safeConsole('log') : function () {},
      info:  safeConsole('info'),
      warn:  safeConsole('warn'),
      error: safeConsole('error'),
      group: function (label, fn) {
        if (CONFIG.DEBUG && window.console && console.group) {
          console.group(prefix + ' ' + label);
          try { fn(); } finally { console.groupEnd(); }
        } else {
          fn();
        }
      },
    };
  })();


  /* ============================================================
     6. EVENT BUS (internal pub/sub)
     ============================================================ */

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
      const arr = listeners.get(name);
      if (arr && arr.length) {
        arr.slice().forEach(function (fn) {
          try { fn(detail || {}); } catch (err) {
            log.error('Listener failed for', name, err);
          }
        });
      }
      /* Also dispatch as DOM event for cross-module communication */
      try {
        document.dispatchEvent(new CustomEvent('main:' + name, {
          detail: detail || {},
          bubbles: false,
        }));
      } catch (e) {}
    }

    function getCount() {
      return emitCount;
    }

    function clear() {
      listeners.clear();
      emitCount = 0;
    }

    return { on: on, emit: emit, getCount: getCount, clear: clear };
  })();


  /* ============================================================
     7. UTILITIES
     ============================================================ */

  const PERSIAN_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

  const util = {

    toPersian: function (input) {
      return String(input).replace(/[0-9]/g, function (d) {
        return PERSIAN_DIGITS[Number(d)];
      });
    },

    now: function () {
      return ENV.supportsPerf ? performance.now() : Date.now();
    },

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

    clamp: function (n, min, max) {
      return Math.max(min, Math.min(max, n));
    },

    easeOutCubic: function (t) {
      return 1 - Math.pow(1 - t, 3);
    },

    easeInOutCubic: function (t) {
      return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },

    safeGet: function (key) {
      if (!ENV.supportsStorage) return null;
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },

    safeSet: function (key, val) {
      if (!ENV.supportsStorage) return false;
      try { window.localStorage.setItem(key, val); return true; } catch (e) { return false; }
    },

    safeRemove: function (key) {
      if (!ENV.supportsStorage) return false;
      try { window.localStorage.removeItem(key); return true; } catch (e) { return false; }
    },

    requestIdle: function (fn, timeout) {
      if (ENV.supportsIdle) {
        return window.requestIdleCallback(fn, { timeout: timeout || 500 });
      }
      return setTimeout(fn, 1);
    },

    formatMs: function (ms) {
      if (ms < 1000) return Math.round(ms) + 'ms';
      return (Math.round(ms / 100) / 10) + 's';
    },

    formatBytes: function (bytes) {
      if (bytes < 1024) return bytes + 'B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
      return (bytes / 1024 / 1024).toFixed(1) + 'MB';
    },

    nextFrame: function () {
      return new Promise(function (resolve) {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(resolve);
        });
      });
    },

    /* Very rough Jalali year from Gregorian */
    toJalaliYear: function (gregorianYear) {
      return gregorianYear - 621;
    },
  };


  /* ============================================================
     8. DEVICE CAPABILITY
     ─── Derives a "tier" from hardware info
     ============================================================ */

  const DeviceCapability = (function () {

    let tier = 'unknown';

    function compute() {
      const cores = ENV.hardwareConcurrency || 0;
      const mem = ENV.deviceMemory || 0;

      /* Tier determination */
      if (cores >= 8 && mem >= 8) tier = 'high';
      else if (cores >= 4 && mem >= 4) tier = 'medium';
      else if (cores >= 2 && mem >= 2) tier = 'low';
      else if (cores === 0 && mem === 0) tier = 'unknown';
      else tier = 'low';

      /* Override if connection is slow */
      if (ENV.saveData || CONFIG.CONNECTION.SLOW_TYPES.indexOf(ENV.effectiveType) !== -1) {
        tier = 'low';
      }

      /* Override if reduced data */
      if (ENV.reducedData) tier = 'low';

      log.debug('Device tier:', tier, {
        cores: cores, mem: mem, conn: ENV.effectiveType,
      });

      return tier;
    }

    function isLow() { return tier === 'low'; }
    function isHigh() { return tier === 'high'; }
    function getTier() { return tier; }

    function init() {
      compute();

      /* Battery API */
      if (navigator.getBattery) {
        navigator.getBattery().then(function (battery) {
          ENV.battery = {
            level: Math.round(battery.level * 100),
            charging: battery.charging,
          };
          log.debug('Battery:', ENV.battery);

          battery.addEventListener('levelchange', function () {
            ENV.battery.level = Math.round(battery.level * 100);
            Bus.emit('battery:change', ENV.battery);
          });
        }).catch(function () {});
      }

      /* Connection changes */
      if (ENV.connection && typeof ENV.connection.addEventListener === 'function') {
        ENV.connection.addEventListener('change', function () {
          ENV.effectiveType = ENV.connection.effectiveType || 'unknown';
          ENV.saveData = ENV.connection.saveData || false;
          compute();
          Bus.emit('connection:change', {
            effectiveType: ENV.effectiveType,
            saveData: ENV.saveData,
          });
        });
      }
    }

    return {
      init: init,
      isLow: isLow,
      isHigh: isHigh,
      getTier: getTier,
    };
  })();


  /* ============================================================
     9. ANALYTICS COLLECTOR
     ─── Collects events in memory, no external calls
     ============================================================ */

  const Analytics = (function () {

    const events = [];
    const counters = {};
    let flushTimer = null;

    function track(name, detail) {
      if (!CONFIG.ANALYTICS.ENABLED) return;

      const event = {
        t:      Date.now(),
        name:   String(name),
        detail: detail || {},
      };

      events.push(event);

      /* Trim */
      if (events.length > CONFIG.ANALYTICS.MAX_EVENTS) {
        events.shift();
      }

      /* Count */
      counters[name] = (counters[name] || 0) + 1;

      /* Auto-flush */
      if (!flushTimer) {
        flushTimer = setTimeout(function () {
          flushTimer = null;
          flush();
        }, CONFIG.ANALYTICS.FLUSH_EVERY);
      }
    }

    function flush() {
      /* Placeholder — could POST to backend in future */
      log.debug('Analytics flush:', events.length, 'events');
    }

    function getCounters() {
      return Object.assign({}, counters);
    }

    function getEvents() {
      return events.slice();
    }

    function getLast(n) {
      return events.slice(-n);
    }

    function reset() {
      events.length = 0;
      Object.keys(counters).forEach(function (k) { delete counters[k]; });
    }

    return {
      track:       track,
      flush:       flush,
      getCounters: getCounters,
      getEvents:   getEvents,
      getLast:     getLast,
      reset:       reset,
    };
  })();


  /* ============================================================
     10. SESSION TRACKING
     ─── Pageview count, referrer, UTM params
     ============================================================ */

  const Session = (function () {

    let session = null;
    let startTime = util.now();

    function load() {
      const raw = util.safeGet(CONFIG.SESSION.STORAGE_KEY);
      if (raw) {
        try { session = JSON.parse(raw); } catch (e) { session = null; }
      }

      if (!session || typeof session !== 'object') {
        session = {
          firstSeen:   Date.now(),
          pageviews:   0,
          lastVisit:   null,
          visits:      0,
        };
      }

      session.pageviews++;
      session.visits++;
      session.lastVisit = Date.now();

      save();
      return session;
    }

    function save() {
      try {
        util.safeSet(CONFIG.SESSION.STORAGE_KEY, JSON.stringify(session));
      } catch (e) {}
    }

    function captureReferrer() {
      const ref = document.referrer || '';
      if (ref && ref.indexOf(location.host) === -1) {
        util.safeSet(CONFIG.SESSION.REFERRER_KEY, ref);
        Analytics.track('referrer', { url: ref });
      }
    }

    function captureUTM() {
      try {
        const params = new URLSearchParams(location.search);
        const utm = {};
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
          .forEach(function (k) {
            const v = params.get(k);
            if (v) utm[k] = v;
          });
        if (Object.keys(utm).length) {
          util.safeSet(CONFIG.SESSION.UTM_KEY, JSON.stringify(utm));
          Analytics.track('utm', utm);
        }
      } catch (e) {}
    }

    function getTimeOnPage() {
      return Math.round(util.now() - startTime);
    }

    function getSession() {
      return session ? Object.assign({}, session) : null;
    }

    function init() {
      load();
      captureReferrer();
      captureUTM();

      /* Emit time-on-page periodically */
      setInterval(function () {
        Bus.emit('session:time', { ms: getTimeOnPage() });
      }, 30000);
    }

    return {
      init:          init,
      getSession:    getSession,
      getTimeOnPage: getTimeOnPage,
    };
  })();


  /* ============================================================
     11. DEPENDENCY LOADER
     ─── Waits for globals with retry + timeout
     ============================================================ */

  const Deps = (function () {

    function waitFor(names, callback, retries) {
      retries = retries || 0;
      const startTime = Date.now();

      function check() {
        const ready = names.every(function (n) {
          return typeof window[n] !== 'undefined';
        });

        if (ready) {
          log.debug('Deps ready:', names.join(', '), 'after', util.formatMs(Date.now() - startTime));
          return callback(true, null);
        }

        const elapsed = Date.now() - startTime;

        if (elapsed > CONFIG.DEPS.TIMEOUT_MS) {
          const missing = names.filter(function (n) {
            return typeof window[n] === 'undefined';
          });

          if (retries < CONFIG.DEPS.MAX_RETRIES) {
            log.warn('Deps timeout, retry', retries + 1, 'Missing:', missing.join(','));
            setTimeout(function () {
              waitFor(names, callback, retries + 1);
            }, CONFIG.DEPS.RETRY_DELAY);
          } else {
            log.error('Deps failed after', retries + 1, 'attempts. Missing:', missing.join(','));
            callback(false, missing);
          }
          return;
        }

        setTimeout(check, CONFIG.DEPS.CHECK_INTERVAL);
      }

      check();
    }

    return { waitFor: waitFor };
  })();


  /* ============================================================
     12. BOOT PHASE MANAGER
     ============================================================ */

  const Boot = (function () {

    const phases = [];
    let currentPhase = 0;
    let completed = false;

    function register(name, fn) {
      phases.push({ name: name, fn: fn });
    }

    async function run() {
      log.debug('Boot starting —', phases.length, 'phases');

      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        currentPhase = i;

        try {
          log.debug('Phase', i + 1, ':', phase.name);
          await phase.fn();
        } catch (err) {
          log.error('Phase failed:', phase.name, err);
          Analytics.track('phase-error', { phase: phase.name, error: String(err) });
          /* Continue to next phase */
        }
      }

      completed = true;
      document.body.classList.add('main-ready');
      document.body.setAttribute('data-main-version', VERSION);

      log.debug('Boot complete');
      Bus.emit('boot:complete', {});
      Analytics.track('boot-complete', { totalPhases: phases.length });
    }

    function isComplete() { return completed; }
    function getPhase() { return currentPhase; }

    return {
      register:  register,
      run:       run,
      isComplete: isComplete,
      getPhase:  getPhase,
    };
  })();


  /* ============================================================
     13. ANNOUNCEMENT BAR
     ============================================================ */

  function initAnnouncementBar() {
    const bar = document.getElementById('announce-bar');
    if (!bar) return;

    if (util.safeGet(CONFIG.ANNOUNCE.STORAGE_KEY) === '1') {
      bar.classList.add('is-hidden');
      return;
    }

    const closeBtn = bar.querySelector('[data-dismiss="announce"]');
    if (!closeBtn) return;

    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      bar.classList.add('is-hidden');
      util.safeSet(CONFIG.ANNOUNCE.STORAGE_KEY, '1');
      Analytics.track('announce-dismiss', {});
      log.debug('Announcement dismissed');
    });
  }


  /* ============================================================
     14. HEADER STATE
     ─── Toggles is-scrolled class, tracks scroll direction
     ============================================================ */

  function initHeaderState() {
    const header = document.getElementById('site-header');
    if (!header) return;

    let lastY = 0;
    let wasScrolled = false;
    let direction = 'down';

    const update = util.rafThrottle(function () {
      const y = window.pageYOffset || document.documentElement.scrollTop || 0;

      /* Direction */
      const delta = y - lastY;
      if (Math.abs(delta) > CONFIG.HEADER.DIRECTION_DELTA) {
        direction = delta > 0 ? 'down' : 'up';
        lastY = y;
      }

      /* Scrolled */
      const isScrolled = y > CONFIG.HEADER.SCROLL_THRESHOLD;
      if (isScrolled !== wasScrolled) {
        wasScrolled = isScrolled;
        header.classList.toggle('is-scrolled', isScrolled);
      }

      header.setAttribute('data-scroll-direction', direction);
    });

    window.addEventListener('scroll', update, { passive: true });
    update();
  }


  /* ============================================================
     15. FOOTER YEAR
     ============================================================ */

  function initFooterYear() {
    const yearEl = document.getElementById('footer-year');
    if (!yearEl) return;

    try {
      const g = new Date().getFullYear();
      const j = util.toJalaliYear(g);
      yearEl.textContent = util.toPersian(j);
      Analytics.track('footer-year-set', { value: j });
    } catch (e) {
      log.warn('Footer year set failed', e);
    }
  }


  /* ============================================================
     16. STATS COUNTER
     ─── Animate hero stats from 0 to target
     ============================================================ */

  function initStatsCounter() {
    const stats = document.querySelectorAll('.hero__stat-num[data-count]');
    if (!stats.length) return;

    if (ENV.reducedMotion) {
      stats.forEach(function (el) {
        const target = parseFloat(el.getAttribute('data-count'));
        const dec = parseInt(el.getAttribute('data-decimal') || '0', 10);
        el.textContent = formatStat(target, dec);
      });
      return;
    }

    if (!ENV.supportsIO) {
      stats.forEach(function (el) { runStat(el); });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = parseInt(el.getAttribute('data-stagger') || '0', 10);
          setTimeout(function () { runStat(el); }, delay);
          observer.unobserve(el);
        });
      },
      {
        threshold: CONFIG.COUNTER.MIN_VISIBLE,
        rootMargin: '0px 0px -40px 0px',
      }
    );

    stats.forEach(function (el, i) {
      el.setAttribute('data-stagger', String(i * CONFIG.COUNTER.STAGGER_MS));
      observer.observe(el);
    });
  }

  function runStat(el) {
    const target = parseFloat(el.getAttribute('data-count') || '0');
    const dec = parseInt(el.getAttribute('data-decimal') || '0', 10);
    const duration = CONFIG.COUNTER.DURATION_MS;
    const start = util.now();

    function tick() {
      const elapsed = util.now() - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = util.easeOutCubic(progress);
      el.textContent = formatStat(target * eased, dec);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = formatStat(target, dec);
      }
    }

    requestAnimationFrame(tick);
  }

  function formatStat(value, decimal) {
    if (decimal > 0) {
      const fixed = value.toFixed(decimal);
      return util.toPersian(fixed.replace('.', '٫'));
    }
    return util.toPersian(Math.round(value));
  }


  /* ============================================================
     17. HERO PARALLAX
     ============================================================ */

  function initHeroParallax() {
    if (ENV.reducedMotion) return;
    if (DeviceCapability.isLow()) return;

    const visual = document.querySelector('.hero__visual');
    if (!visual) return;

    const decos = visual.querySelectorAll('.hero__deco');
    if (!decos.length) return;

    const update = util.rafThrottle(function () {
      const y = window.pageYOffset || 0;
      if (y > CONFIG.PARALLAX.MAX_SCROLL) return;

      const offset = y * CONFIG.PARALLAX.INTENSITY;

      decos.forEach(function (deco, i) {
        const factor = (i + 1) * CONFIG.PARALLAX.LAYER_FACTOR;
        deco.style.setProperty('--scroll-y', (-offset * factor) + 'px');
      });
    });

    window.addEventListener('scroll', update, { passive: true });
    update();
  }


  /* ============================================================
     18. SCROLL PROGRESS BAR
     ─── Thin bar at top showing reading progress
     ============================================================ */

  function initScrollProgress() {
    if (!CONFIG.PROGRESS.ENABLED) return;
    if (ENV.reducedMotion) return;

    const docH = document.documentElement.scrollHeight;
    if (docH < CONFIG.PROGRESS.MIN_H) return;

    /* Create element */
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    bar.style.cssText =
      'position:fixed;top:0;left:0;height:3px;width:0;' +
      'background:linear-gradient(90deg,#DDA83D,#C68B1E,#C25E3A);' +
      'z-index:9999;pointer-events:none;' +
      'transition:width 80ms linear;' +
      'box-shadow:0 0 8px rgba(198,139,30,0.5);';
    document.body.appendChild(bar);

    let rafScheduled = false;

    const update = function () {
      rafScheduled = false;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? util.clamp(scrollTop / max, 0, 1) : 0;
      bar.style.width = (progress * 100) + '%';
    };

    const onScroll = function () {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', util.debounce(update, 200), { passive: true });
    update();
  }


  /* ============================================================
     19. SCROLL DEPTH TRACKER
     ─── Emits events when user reaches milestones
     ============================================================ */

  function initScrollDepth() {
    const milestones = CONFIG.SCROLL_DEPTH.MILESTONES.slice();
    const reached = {};

    const check = util.rafThrottle(function () {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;

      const percent = Math.round((scrollTop / max) * 100);

      milestones.forEach(function (m) {
        if (percent >= m && !reached[m]) {
          reached[m] = true;
          Analytics.track('scroll-depth', { percent: m });
          Bus.emit('scroll:depth', { percent: m });
          log.debug('Scroll depth:', m + '%');
        }
      });
    });

    window.addEventListener('scroll', check, { passive: true });
    check();
  }


  /* ============================================================
     20. REVEAL FALLBACK
     ─── If IO doesn't fire or JS late, ensure content visible
     ============================================================ */

  function initRevealFallback() {
    setTimeout(function () {
      const hidden = document.querySelectorAll(
        '.reveal:not(.is-visible), ' +
        '.class-card:not(.is-revealed), ' +
        '.testimonial-card:not(.is-revealed)'
      );

      if (hidden.length > CONFIG.REVEAL.MAX_HIDDEN) {
        log.warn('Reveal fallback triggered:', hidden.length, 'elements');
        Analytics.track('reveal-fallback', { count: hidden.length });
        hidden.forEach(function (el) {
          el.classList.add('is-visible', 'is-revealed');
        });
      }
    }, CONFIG.REVEAL.TIMEOUT_MS);
  }


  /* ============================================================
     21. SCROLL FALLBACK
     ─── If ui-extra failed, provide basic data-scroll
     ============================================================ */

  function initScrollFallback() {
    if (window.MissMathUIExtra) return;

    document.addEventListener('click', function (e) {
      const link = e.target.closest('a[data-scroll][href^="#"]');
      if (!link) return;
      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      const target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    log.debug('Scroll fallback active (ui-extra missing)');
  }


  /* ============================================================
     22. PREFETCH ON HOVER
     ─── Warm up nav targets for snappier navigation
     ============================================================ */

  function initPrefetch() {
    if (!CONFIG.PREFETCH.ENABLED) return;
    if (ENV.saveData) return;
    if (DeviceCapability.isLow()) return;

    const links = document.querySelectorAll(CONFIG.PREFETCH.SELECTOR);
    if (!links.length) return;

    links.forEach(function (link) {
      let timer = null;

      const onEnter = function () {
        timer = setTimeout(function () {
          const hash = link.getAttribute('href');
          if (!hash || hash === '#') return;
          const target = document.querySelector(hash);
          if (target) {
            /* Warm it — force layout, add hint */
            target.getBoundingClientRect();
            target.classList.add('is-prefetched');
          }
        }, CONFIG.PREFETCH.HOVER_DELAY);
      };

      const onLeave = function () {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      link.addEventListener('mouseenter', onEnter, { passive: true });
      link.addEventListener('mouseleave', onLeave, { passive: true });
    });
  }


  /* ============================================================
     23. LAZY IMAGES
     ─── Native lazy + JS fallback
     ============================================================ */

  function initLazyImages() {
    const imgs = document.querySelectorAll('img[loading="lazy"]');
    if (!imgs.length) return;

    if (!ENV.supportsIO) {
      /* Fallback — force load all */
      imgs.forEach(function (img) {
        img.loading = 'eager';
      });
      return;
    }

    /* Track load errors for broken images */
    imgs.forEach(function (img) {
      img.addEventListener('error', function () {
        log.warn('Image failed:', img.src);
        Analytics.track('image-error', { src: img.src });
        img.classList.add('is-broken');
      });
      img.addEventListener('load', function () {
        img.classList.add('is-loaded');
      });
    });
  }


  /* ============================================================
     24. FONT LOADING DETECTION
     ─── Detects FOUT/FOIT timing
     ============================================================ */

  function initFontLoading() {
    if (!document.fonts || typeof document.fonts.ready === 'undefined') return;

    const start = util.now();

    Promise.race([
      document.fonts.ready,
      new Promise(function (resolve) {
        setTimeout(resolve, CONFIG.FONTS.TIMEOUT_MS);
      }),
    ]).then(function () {
      const elapsed = Math.round(util.now() - start);
      const loaded = document.fonts.status === 'loaded';
      document.body.classList.add(loaded ? 'fonts-loaded' : 'fonts-timeout');
      Analytics.track('fonts', { status: document.fonts.status, ms: elapsed });
      log.debug('Fonts:', document.fonts.status, 'in', util.formatMs(elapsed));
    });
  }


  /* ============================================================
     25. CONNECTION AWARENESS
     ─── Handle online/offline transitions
     ============================================================ */

  function initConnectionAwareness() {
    window.addEventListener('offline', function () {
      log.info('Connection lost');
      Analytics.track('offline', {});
      Bus.emit('connection:offline', {});
      Toast.show('اتصال اینترنت قطع شد', {
        variant: 'error',
        duration: CONFIG.CONNECTION.OFFLINE_TOAST_MS,
      });
    });

    window.addEventListener('online', function () {
      log.info('Connection restored');
      Analytics.track('online', {});
      Bus.emit('connection:online', {});
      Toast.show('اتصال اینترنت برگشت', {
        variant: 'success',
        duration: CONFIG.CONNECTION.ONLINE_TOAST_MS,
      });
    });
  }


  /* ============================================================
     26. VISIBILITY AWARENESS
     ─── Pause/resume when tab hidden/visible
     ============================================================ */

  function initVisibilityAwareness() {
    let hiddenAt = 0;
    let totalHidden = 0;

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        hiddenAt = Date.now();
        Bus.emit('visibility:hidden', {});
        Analytics.track('tab-hidden', {});
      } else {
        const hiddenMs = hiddenAt ? Date.now() - hiddenAt : 0;
        totalHidden += hiddenMs;
        hiddenAt = 0;
        Bus.emit('visibility:visible', { hiddenMs: hiddenMs });
        Analytics.track('tab-visible', { hiddenMs: hiddenMs });
      }
    });
  }


  /* ============================================================
     27. IDLE DETECTION
     ─── Run deferred work when browser is idle
     ============================================================ */

  function initIdleDetection() {
    if (!CONFIG.IDLE.ENABLED) return;

    /* Warm up scroll progress element (pre-create) */
    util.requestIdle(function () {
      log.debug('Idle callback fired');
      Analytics.track('idle', {});
    }, 1000);
  }


  /* ============================================================
     28. LONG TASK OBSERVER
     ─── Detects performance bottlenecks
     ============================================================ */

  function initLongTaskObserver() {
    if (!CONFIG.LONGTASK.ENABLED) return;
    if (!ENV.supportsPerfObs) return;

    try {
      const observer = new PerformanceObserver(function (list) {
        const entries = list.getEntries();
        entries.forEach(function (entry) {
          if (entry.duration > CONFIG.LONGTASK.THRESHOLD_MS) {
            log.warn('Long task:', Math.round(entry.duration) + 'ms');
            Analytics.track('long-task', {
              duration: Math.round(entry.duration),
              name: entry.name,
            });
          }
        });
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      /* Not supported — silently skip */
    }
  }


  /* ============================================================
     29. TOAST QUEUE
     ─── Centralized toast system with queue
     ============================================================ */

  const Toast = (function () {

    const queue = [];
    let activeToasts = [];
    let toastRoot = null;

    function ensureRoot() {
      if (toastRoot && document.contains(toastRoot)) return toastRoot;

      toastRoot = document.getElementById('toast');
      if (toastRoot) return toastRoot;

      toastRoot = document.createElement('div');
      toastRoot.id = 'toast';
      toastRoot.className = 'toast';
      toastRoot.setAttribute('role', 'status');
      toastRoot.setAttribute('aria-live', 'polite');
      toastRoot.hidden = true;
      document.body.appendChild(toastRoot);
      return toastRoot;
    }

    function show(message, options) {
      if (!message) return;

      options = options || {};

      /* Queue if too many active */
      if (activeToasts.length >= CONFIG.TOAST.MAX_QUEUE) {
        queue.push({ message: message, options: options });
        return;
      }

      const el = ensureRoot();
      const duration = options.duration || CONFIG.TOAST.DURATION_MS;
      const variant = options.variant || 'info';

      /* Clear content */
      while (el.firstChild) el.removeChild(el.firstChild);

      /* Text node — SAFE (textContent) */
      const span = document.createElement('span');
      span.textContent = message;
      el.appendChild(span);

      /* Variant */
      el.setAttribute('data-variant', variant);

      /* Show */
      el.hidden = false;
      void el.offsetWidth;
      el.classList.add('is-visible');

      const toastObj = {
        el: el,
        message: message,
        timeout: setTimeout(function () {
          hide(el, toastObj);
        }, duration),
      };

      activeToasts.push(toastObj);

      Analytics.track('toast-shown', { variant: variant });
    }

    function hide(el, toastObj) {
      el.classList.remove('is-visible');
      setTimeout(function () {
        if (!el.classList.contains('is-visible')) {
          el.hidden = true;
        }
        const i = activeToasts.indexOf(toastObj);
        if (i !== -1) activeToasts.splice(i, 1);

        /* Next in queue */
        if (queue.length) {
          const next = queue.shift();
          show(next.message, next.options);
        }
      }, 320);
    }

    function clearAll() {
      queue.length = 0;
      activeToasts.forEach(function (t) {
        clearTimeout(t.timeout);
        t.el.classList.remove('is-visible');
        t.el.hidden = true;
      });
      activeToasts = [];
    }

    return {
      show:     show,
      clearAll: clearAll,
      getQueue: function () { return queue.slice(); },
    };
  })();


  /* ============================================================
     30. HAPTIC FEEDBACK
     ─── Vibrate on supported devices
     ============================================================ */

  function initHaptics() {
    if (!CONFIG.HAPTICS.ENABLED) return;
    if (!ENV.supportsVibrate) return;

    document.addEventListener('click', function (e) {
      const target = e.target;
      if (!target || !target.closest) return;

      const cta = target.closest('.btn--primary, .float-cta');
      if (cta) {
        try { navigator.vibrate(CONFIG.HAPTICS.TAP_MS); } catch (err) {}
      }
    });

    /* Listen for success/error events from other modules */
    document.addEventListener('main:feedback:success', function () {
      try { navigator.vibrate(CONFIG.HAPTICS.SUCCESS_PATTERN); } catch (e) {}
    });
    document.addEventListener('main:feedback:error', function () {
      try { navigator.vibrate(CONFIG.HAPTICS.ERROR_PATTERN); } catch (e) {}
    });
  }


  /* ============================================================
     31. ERROR BOUNDARY
     ─── Global handlers — never crash the page
     ============================================================ */

  function initErrorBoundary() {
    window.addEventListener('error', function (e) {
      /* Skip cross-origin script errors */
      if (e && e.message && e.message.indexOf('Script error') !== -1) return;
      log.warn('Runtime error:', e && e.message, e && e.filename, e && e.lineno);
      Analytics.track('runtime-error', {
        message: e && e.message,
        file: e && e.filename,
        line: e && e.lineno,
      });
    });

    window.addEventListener('unhandledrejection', function (e) {
      const reason = e && e.reason
        ? (e.reason.message || String(e.reason))
        : 'unknown';
      log.warn('Unhandled promise:', reason);
      Analytics.track('unhandled-promise', { reason: reason });
    });
  }


  /* ============================================================
     32. CONSOLE BRANDING
     ─── Nice message for developers inspecting the site
     ============================================================ */

  function initConsoleBranding() {
    if (!window.console || !console.log) return;
    if (!CONFIG.DEBUG) return;

    try {
      const styles = [
        'background: linear-gradient(90deg,#DDA83D,#C68B1E);',
        'color: #131823;',
        'font-size: 16px;',
        'font-weight: 900;',
        'padding: 8px 16px;',
        'border-radius: 6px;',
        'letter-spacing: -0.02em;',
      ].join('');

      console.log('%cخانم ریاضی — v' + VERSION, styles);
      console.log(
        '%cساخته شده با ❤ — برای دیباگ: MissMathMain.getState()',
        'color:#6A7791;font-size:12px;'
      );
    } catch (e) {}
  }


  /* ============================================================
     33. RENDER DYNAMIC SECTIONS
     ============================================================ */

  function renderDynamicSections() {
    try {
      if (window.MissMathRender && typeof window.MissMathRender.renderAll === 'function') {
        window.MissMathRender.renderAll();
        Analytics.track('sections-rendered', {});
        log.debug('Sections rendered');
        return true;
      }
      log.warn('MissMathRender not available');
      return false;
    } catch (err) {
      log.error('Render failed:', err);
      Analytics.track('render-error', { error: String(err) });
      return false;
    }
  }


  /* ============================================================
     34. BOOT SEQUENCE
     ============================================================ */

  function boot() {
    log.debug('Booting v' + VERSION + ' (' + BUILD + ')');
    Analytics.track('boot-start', { version: VERSION });

    /* ─── Phase 1: synchronous UI (no deps) ─── */
    Boot.register('phase-1-ui', function () {
      DeviceCapability.init();
      Session.init();
      initAnnouncementBar();
      initHeaderState();
      initFooterYear();
      initScrollFallback();
      initErrorBoundary();
      initConsoleBranding();
    });

    /* ─── Phase 2: dynamic content (needs data + render) ─── */
    Boot.register('phase-2-render', function () {
      return new Promise(function (resolve) {
        Deps.waitFor(CONFIG.DEPS.REQUIRED, function (ready) {
          if (ready) {
            renderDynamicSections();
          }
          setTimeout(resolve, CONFIG.BOOT.PHASE_2_DELAY);
        });
      });
    });

    /* ─── Phase 3: post-render enhancements ─── */
    Boot.register('phase-3-enhance', function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          initStatsCounter();
          initHeroParallax();
          initScrollProgress();
          initScrollDepth();
          initRevealFallback();
          initLazyImages();
          initFontLoading();
          resolve();
        }, CONFIG.BOOT.PHASE_3_DELAY);
      });
    });

    /* ─── Phase 4: deferred (idle) work ─── */
    Boot.register('phase-4-deferred', function () {
      return new Promise(function (resolve) {
        util.requestIdle(function () {
          initPrefetch();
          initIdleDetection();
          initLongTaskObserver();
          resolve();
        }, CONFIG.BOOT.PHASE_4_DELAY);
      });
    });

    /* ─── Phase 5: event listeners ─── */
    Boot.register('phase-5-listeners', function () {
      initConnectionAwareness();
      initVisibilityAwareness();
      initHaptics();
    });

    /* Run all phases */
    Boot.run();
  }


  /* ============================================================
     35. PUBLIC API
     ============================================================ */

  function getState() {
    return {
      version:        VERSION,
      build:          BUILD,
      bootComplete:   Boot.isComplete(),
      bootPhase:      Boot.getPhase(),

      /* Environment */
      env: {
        reducedMotion: ENV.reducedMotion,
        isTouch:       ENV.isTouch,
        isMobile:      ENV.isMobile,
        online:        ENV.online,
        effectiveType: ENV.effectiveType,
        saveData:      ENV.saveData,
        language:      ENV.language,
        deviceTier:    DeviceCapability.getTier(),
        battery:       ENV.battery,
      },

      /* Analytics */
      analytics: {
        eventCount: Analytics.getCounters(),
        totalEvents: Analytics.getEvents().length,
      },

      /* Session */
      session: Session.getSession(),
      timeOnPage: Session.getTimeOnPage(),

      /* Deps */
      deps: {
        data:    typeof MissMathData,
        render:  typeof MissMathRender,
        modal:   typeof MissMathModal,
        uiExtra: typeof MissMathUIExtra,
        prize:   typeof MissMathPrize,
      },

      /* DOM state */
      dom: {
        classCards:        document.querySelectorAll('.class-card:not(.class-card--skeleton)').length,
        testimonialCards:  document.querySelectorAll('.testimonial-card').length,
        faqItems:          document.querySelectorAll('.faq-item').length,
      },

      /* Bus */
      busEvents: Bus.getCount(),
    };
  }

  const API = {
    version:    VERSION,
    build:      BUILD,

    /* Boot */
    boot:       boot,
    rerender:   renderDynamicSections,
    getState:   getState,

    /* Toast */
    toast:      Toast.show,
    clearToasts: Toast.clearAll,

    /* Bus */
    on:         Bus.on,
    emit:       Bus.emit,

    /* Analytics */
    getAnalytics: Analytics.getCounters,
    getEvents:    Analytics.getEvents,
    getLastEvents: Analytics.getLast,

    /* Session */
    getSession:   Session.getSession,

    /* Device */
    getDeviceTier: DeviceCapability.getTier,

    /* Config */
    config:     Object.freeze(Object.assign({}, CONFIG)),
  };

  Object.defineProperty(window, 'MissMathMain', {
    value: Object.freeze(API),
    writable: false,
    configurable: false,
    enumerable: false,
  });


  /* ============================================================
     36. START
     ============================================================ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    setTimeout(boot, 0);
  }


  /* ============================================================
     37. CLEANUP
     ============================================================ */

  window.addEventListener('pagehide', function () {
    try {
      Analytics.flush();
      Toast.clearAll();
    } catch (e) {}
  }, { once: true });


  /* ============================================================
     38. END
     ============================================================ */

})();

/* ============================================================
   faq-accordion.js
   Miss Math — Single-Open FAQ Accordion
   فاز ۵ — نسخه v1.0.0

   ─── WHAT THIS DOES ───────────────────────────────────────
   When a user opens an FAQ item, all other open items
   close automatically. Classic accordion behavior.

   ─── HOW IT WORKS ─────────────────────────────────────────
   1. Listen for the native `toggle` event on each <details>
   2. When one opens, close all others (with smooth animation)
   3. Do NOT close if the user clicked the same one
   4. Respect prefers-reduced-motion

   ─── WHY THIS FILE ────────────────────────────────────────
   Native <details> elements are independent by default.
   This script adds accordion coordination without breaking
   native behavior (keyboard nav, screen readers, etc.)
   ============================================================ */

(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__MissMathFaqAccordionLoaded) return;
  window.__MissMathFaqAccordionLoaded = true;

  const VERSION = '1.0.0';


  /* ═══════════════════════════════════════════════════════════
     CONFIG
     ═══════════════════════════════════════════════════════════ */

  const CONFIG = {
    VERSION: VERSION,
    DEBUG: false,

    /* Selector for FAQ groups — each group acts as one accordion */
    GROUPS: [
      '#faq-list',                    /* Main FAQ section */
      '.detail-faq',                  /* Class detail FAQ */
    ],

    /* Timing */
    ANIMATION_MS: 280,
    DEBOUNCE_MS: 60,
  };


  /* ═══════════════════════════════════════════════════════════
     ENV
     ═══════════════════════════════════════════════════════════ */

  const ENV = {
    reducedMotion: window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  };


  /* ═══════════════════════════════════════════════════════════
     LOGGER
     ═══════════════════════════════════════════════════════════ */

  const log = (function () {
    const prefix = '[faq]';
    const noop = function () { };
    return {
      debug: CONFIG.DEBUG ? console.log.bind(console, prefix) : noop,
      warn: console.warn ? console.warn.bind(console, prefix) : noop,
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     CORE — Single open behavior
     ═══════════════════════════════════════════════════════════ */

  function closeOthers(currentDetails, group) {
    if (!group) return;

    const allDetails = group.querySelectorAll('details[open]');

    allDetails.forEach(function (other) {
      if (other === currentDetails) return;

      /* Native close is instant — add a tiny fade for smoothness */
      if (ENV.reducedMotion) {
        other.open = false;
        return;
      }

      /* Set a closing class for CSS animation */
      other.classList.add('is-closing');

      /* Close after animation ends */
      const timeout = setTimeout(function () {
        other.open = false;
        other.classList.remove('is-closing');
      }, CONFIG.ANIMATION_MS);

      /* If user re-opens quickly, cancel the close */
      const cancelHandler = function () {
        clearTimeout(timeout);
        other.classList.remove('is-closing');
        other.removeEventListener('toggle', cancelHandler);
      };
      other.addEventListener('toggle', cancelHandler, { once: true });
    });
  }


  /* ═══════════════════════════════════════════════════════════
     BINDING — Attach to a single group
     ═══════════════════════════════════════════════════════════ */

  function bindGroup(group) {
    if (!group || group.dataset.faqAccordionBound === 'true') return 0;

    const details = group.querySelectorAll('details');

    if (!details.length) return 0;

    let count = 0;
    details.forEach(function (el) {
      el.addEventListener('toggle', function () {
        if (!el.open) return;
        closeOthers(el, group);
      });
      count++;
    });

    group.dataset.faqAccordionBound = 'true';
    return count;
  }


  /* ═══════════════════════════════════════════════════════════
     AUTO-BIND — Find and bind all groups
     ═══════════════════════════════════════════════════════════ */

  function bindAll() {
    let totalDetails = 0;
    let totalGroups = 0;

    CONFIG.GROUPS.forEach(function (selector) {
      const groups = document.querySelectorAll(selector);

      groups.forEach(function (group) {
        const count = bindGroup(group);
        if (count > 0) {
          totalDetails += count;
          totalGroups++;
        }
      });
    });

    log.debug('Bound', totalDetails, 'details in', totalGroups, 'groups');
    return { totalDetails: totalDetails, totalGroups: totalGroups };
  }


  /* ═══════════════════════════════════════════════════════════
     MUTATION OBSERVER — Auto-bind new FAQ items
     ─── FAQ items are rendered by render.js dynamically.
         This watches for new elements and binds them.
     ═══════════════════════════════════════════════════════════ */

  function startMutationObserver() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(function (mutations) {
      let shouldRebind = false;

      mutations.forEach(function (mutation) {
        if (mutation.type !== 'childList') return;
        if (mutation.addedNodes.length === 0) return;

        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'DETAILS' ||
              (node.querySelector && node.querySelector('details'))) {
            shouldRebind = true;
          }
        });
      });

      if (shouldRebind) {
        /* Debounce to avoid thrashing */
        setTimeout(bindAll, CONFIG.DEBOUNCE_MS);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    log.debug('Mutation observer started');
  }


  /* ═══════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════ */

  function init() {
    log.debug('Initializing v' + VERSION);

    bindAll();
    startMutationObserver();

    document.body.setAttribute('data-faq-accordion', VERSION);
  }


  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════ */

  Object.defineProperty(window, 'MissMathFaq', {
    value: Object.freeze({
      version: VERSION,
      bindAll: bindAll,
      closeAll: function () {
        document.querySelectorAll('details[open]').forEach(function (el) {
          el.open = false;
        });
        return true;
      },
      openFirst: function (selector) {
        const group = document.querySelector(selector || '#faq-list');
        if (!group) return false;
        const first = group.querySelector('details');
        if (!first) return false;
        first.open = true;
        closeOthers(first, group);
        return true;
      },
    }),
    writable: false,
    configurable: false,
    enumerable: false,
  });


  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    setTimeout(init, 0);
  }

})();