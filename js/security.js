/* ============================================================
   security.js
   Miss Math — Client-Side Security Layer
   فاز ۶ — نسخه کامل v1.0.0

   ═══════════════════════════════════════════════════════════
   IMPORTANT — WHAT THIS CAN AND CANNOT DO
   ═══════════════════════════════════════════════════════════
   This is a CLIENT-SIDE script running on GitHub Pages.
   It CANNOT replace real server-side security (headers,
   CSP via HTTP, WAF, rate limiting at the origin, etc.)

   What it DOES provide:
     • Clickjacking defense (frame-busting + visual warning)
     • Console warning banner
     • Input sanitization helpers (used by form.js)
     • URL validation utilities
     • External link hardening
     • Hash navigation sanitization
     • Client-side rate limiting (per action, per session)
     • Basic behavioral bot detection
     • Tab visibility / focus tracking
     • localStorage integrity checks
     • Origin/referrer awareness
     • Optional devtools detection (very light)
     • Security event bus for cross-module use

   What it CANNOT provide (do at the server/CDN):
     • HTTP security headers (HSTS, X-Frame-Options, CSP via HTTP)
     • Server-side validation and sanitization
     • Server-side rate limiting
     • Real bot mitigation
     • Real DDoS protection
     • Encrypted data at rest

   ═══════════════════════════════════════════════════════════
   ARCHITECTURE (25 LAYERS)
   ═══════════════════════════════════════════════════════════
   L01  Guards & Version
   L02  Config
   L03  Environment Detection
   L04  Logger
   L05  State
   L06  Event Bus
   L07  Metrics
   L08  Cryptography Utilities (FNV hash, base64, random)
   L09  String Utilities
   L10  Safe Storage (with integrity checks)
   L11  Clickjacking Protection
   L12  Console Warning Banner
   L13  Form Rate Limiter
   L14  Input Sanitizer (public helper)
   L15  URL Validator (public helper)
   L16  External Link Hardening
   L17  Hash Navigation Sanitizer
   L18  Bot Detection (behavioral)
   L19  Tab Visibility Tracker
   L20  Focus/Blur Awareness
   L21  DevTools Detector (light)
   L22  CSP Meta Injection (best-effort)
   L23  Public API
   L24  Boot
   L25  Cleanup

   ═══════════════════════════════════════════════════════════
   PUBLIC API (window.MissMathSecurity)
   ═══════════════════════════════════════════════════════════
   MissMathSecurity.version
   MissMathSecurity.sanitize(input, options)
   MissMathSecurity.escapeHtml(input)
   MissMathSecurity.escapeAttr(input)
   MissMathSecurity.validateUrl(url, options)
   MissMathSecurity.validatePhone(digits)
   MissMathSecurity.validateEmail(email)
   MissMathSecurity.rateLimit(key, options)
   MissMathSecurity.isBot()
   MissMathSecurity.getStats()
   MissMathSecurity.getEvents()
   MissMathSecurity.on(event, handler)
   MissMathSecurity.off(event, handler)
   MissMathSecurity.selfTest()
   ============================================================ */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     L01 — GUARDS & VERSION
     ═══════════════════════════════════════════════════════════ */

  if (typeof window === 'undefined') return;
  if (typeof document === 'undefined') return;
  if (window.__MissMathSecurityLoaded) return;
  window.__MissMathSecurityLoaded = true;

  const VERSION = '1.0.0';
  const BUILD = '1403.07';


  /* ═══════════════════════════════════════════════════════════
     L02 — CONFIG
     ═══════════════════════════════════════════════════════════ */

  const CONFIG = {

    VERSION: VERSION,
    BUILD: BUILD,
    DEBUG: false,

    /* ─── Clickjacking ─── */
    CLICKJACKING: {
      ENABLED: true,
      ALLOW_IFRAMES: false,           /* set true only if you embed this site */
      SHOW_WARNING: true,
      BLOCK_INTERACTION: true,
      BREAK_FRAME: true,               /* try top.location = self.location */
    },

    /* ─── Console banner ─── */
    CONSOLE: {
      ENABLED: true,
      SHOW_ONCE_PER_SESSION: true,
      STORAGE_KEY: 'miss-math:sec-console:v1',
    },

    /* ─── Rate limiting ─── */
    RATE_LIMIT: {
      ENABLED: true,
      STORAGE_KEY: 'miss-math:sec-rl:v1',
      DEFAULT: {
        MAX_ATTEMPTS: 5,
        WINDOW_MS: 60000,             /* 1 minute */
        LOCKOUT_MS: 120000,           /* 2 minutes */
      },
      PRESETS: {
        'form-submit': { MAX_ATTEMPTS: 3, WINDOW_MS: 60000, LOCKOUT_MS: 180000 },
        'modal-open':  { MAX_ATTEMPTS: 20, WINDOW_MS: 60000, LOCKOUT_MS: 30000 },
        'link-click':  { MAX_ATTEMPTS: 30, WINDOW_MS: 60000, LOCKOUT_MS: 30000 },
      },
    },

    /* ─── Input sanitization ─── */
    SANITIZE: {
      MAX_LENGTH: 5000,
      STRIP_CONTROL_CHARS: true,
      STRIP_ZERO_WIDTH: true,
      NORMALIZE_UNICODE: true,
      TRIM: true,
    },

    /* ─── URL validation ─── */
    URL: {
      ALLOWED_PROTOCOLS: [
        'http:',
        'https:',
        'tel:',
        'mailto:',
        'sms:',
        'whatsapp:',
      ],
      BLOCKED_PROTOCOLS: [
        'javascript:',
        'data:',
        'vbscript:',
        'file:',
        'blob:',
      ],
      ALLOW_EXTERNAL: true,
      FORCE_NOOPENER: true,
    },

    /* ─── External links ─── */
    EXTERNAL_LINKS: {
      HARDEN: true,
      SCAN_ON_MUTATION: true,
    },

    /* ─── Hash sanitization ─── */
    HASH: {
      SANITIZE: true,
      MAX_LENGTH: 200,
      ALLOWED_PATTERN: /^#[a-zA-Z0-9_\-:.]{1,200}$/,
    },

    /* ─── Bot detection ─── */
    BOT: {
      ENABLED: true,
      /* Behavioral signals */
      MIN_INTERACTION_DELAY_MS: 400,
      MIN_MOUSE_MOVES: 3,
      MIN_SCROLL_EVENTS: 1,
      /* Storage */
      STORAGE_KEY: 'miss-math:sec-bot:v1',
      /* Score threshold (>= this = bot) */
      BOT_THRESHOLD: 5,
    },

    /* ─── Tab visibility ─── */
    VISIBILITY: {
      TRACK: true,
      EMIT_EVENTS: true,
    },

    /* ─── DevTools detection ─── */
    DEVTOOLS: {
      ENABLED: false,                /* disabled by default — noisy */
      THRESHOLD_PX: 160,
      CHECK_INTERVAL_MS: 2000,
    },

    /* ─── CSP meta (best-effort) ─── */
    CSP: {
      INJECT: false,                 /* inject a CSP meta tag */
      POLICY: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "font-src 'self' https://cdn.jsdelivr.net data:",
        "img-src 'self' data: https:",
        "connect-src 'self' https://wa.me",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self' https://wa.me",
      ].join('; '),
    },

    /* ─── Storage integrity ─── */
    STORAGE: {
      VERIFY: true,
      KEY_PREFIX: 'miss-math:',
    },

    /* ─── Events ─── */
    EVENTS: {
      READY:              'security:ready',
      CLICKJACKING:       'security:clickjacking',
      RATE_LIMITED:       'security:rate-limited',
      BOT_DETECTED:       'security:bot-detected',
      INVALID_INPUT:      'security:invalid-input',
      INVALID_URL:        'security:invalid-url',
      TAB_HIDDEN:         'security:tab-hidden',
      TAB_VISIBLE:        'security:tab-visible',
      WINDOW_BLUR:        'security:window-blur',
      WINDOW_FOCUS:       'security:window-focus',
      DEVTOOLS_OPEN:      'security:devtools-open',
      ERROR:              'security:error',
    },

    /* ─── Feature flags ─── */
    FEATURES: {
      CLICKJACKING:       true,
      CONSOLE_BANNER:     true,
      RATE_LIMIT:         true,
      INPUT_SANITIZE:     true,
      URL_VALIDATE:       true,
      EXTERNAL_LINKS:     true,
      HASH_SANITIZE:      true,
      BOT_DETECT:         true,
      VISIBILITY:         true,
      FOCUS_TRACK:        true,
      DEVTOOLS:           false,
      CSP_META:           false,
      STORAGE_VERIFY:     true,
      SELF_TEST:          true,
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

    const isFramed = (function () {
      try { return window.top !== window.self; } catch (e) { return true; }
    })();

    const isSecure = (function () {
      try { return window.location.protocol === 'https:'; } catch (e) { return false; }
    })();

    return {
      /* Motion */
      reducedMotion: mq('(prefers-reduced-motion: reduce)'),

      /* Device */
      isTouch: mq('(hover: none) and (pointer: coarse)'),
      isMobile: mq('(max-width: 640px)'),

      /* Framing */
      isFramed: isFramed,
      isSecure: isSecure,

      /* Capabilities */
      supportsCrypto: typeof window.crypto !== 'undefined',
      supportsRandomValues: !!(window.crypto && window.crypto.getRandomValues),
      supportsStorage: (function () {
        try {
          const k = '__mm_sec_test__';
          window.localStorage.setItem(k, k);
          window.localStorage.removeItem(k);
          return true;
        } catch (e) { return false; }
      })(),
      supportsMutationObserver: typeof MutationObserver !== 'undefined',
      supportsVisibility: typeof document.visibilityState !== 'undefined',

      /* Environment */
      language: nav.language || 'fa',
      platform: nav.platform || '',
      online: nav.onLine !== false,
      hardwareConcurrency: nav.hardwareConcurrency || 0,
      deviceMemory: nav.deviceMemory || 0,
      maxTouchPoints: nav.maxTouchPoints || 0,

      /* User agent signals */
      isHeadless: /\b(headlesschrome|phantom|headless)\b/i.test(nav.userAgent || ''),
      isCrawler: /\b(bot|crawler|spider|scraper)\b/i.test(nav.userAgent || ''),
      isLighthouse: /Lighthouse|Chrome-Lighthouse/i.test(nav.userAgent || ''),
      isWebDriver: !!nav.webdriver,

      /* Referrer */
      referrer: (function () {
        try { return document.referrer || ''; } catch (e) { return ''; }
      })(),

      /* Origin */
      origin: (function () {
        try { return window.location.origin; } catch (e) { return ''; }
      })(),
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L04 — LOGGER
     ═══════════════════════════════════════════════════════════ */

  const log = (function () {
    const prefix = '[security]';

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

    /* Fingerprint */
    fingerprint: null,

    /* Bot detection */
    bot: {
      mouseMoves: 0,
      scrollEvents: 0,
      touchEvents: 0,
      keyPresses: 0,
      clicks: 0,
      firstInteractionAt: 0,
      lastInteractionAt: 0,
      suspiciousSignals: [],
      score: 0,
      verdict: 'unknown',
    },

    /* Visibility */
    visibility: {
      state: 'visible',
      hiddenAt: 0,
      totalHiddenMs: 0,
      hiddenCount: 0,
    },

    /* Focus */
    focus: {
      hasFocus: true,
      blurCount: 0,
    },

    /* Devtools */
    devtools: {
      isOpen: false,
      checkInterval: null,
    },

    /* Metrics */
    metrics: {
      bootMs: 0,
      sanitizations: 0,
      urlValidations: 0,
      rateLimitHits: 0,
      externalLinksHardened: 0,
      hashSanitized: 0,
      eventsEmitted: 0,
      errors: 0,
    },

    /* Event log */
    events: [],
    MAX_EVENTS: 100,
  };


  /* ═══════════════════════════════════════════════════════════
     L06 — EVENT BUS
     ═══════════════════════════════════════════════════════════ */

  const Bus = (function () {

    const listeners = new Map();

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
      state.metrics.eventsEmitted++;

      /* Record in event log */
      try {
        state.events.push({
          t: Date.now(),
          name: name,
          detail: detail || {},
        });
        if (state.events.length > state.MAX_EVENTS) {
          state.events.shift();
        }
      } catch (e) { }

      /* Local listeners */
      const arr = listeners.get(name);
      if (arr && arr.length) {
        arr.slice().forEach(function (fn) {
          try { fn(detail || {}); } catch (err) {
            state.metrics.errors++;
            log.error('Listener failed for', name, err);
          }
        });
      }

      /* DOM event */
      try {
        document.dispatchEvent(new CustomEvent(name, {
          detail: detail || {},
          bubbles: false,
          cancelable: false,
        }));
      } catch (e) { }
    }

    function clear() {
      listeners.clear();
    }

    return { on: on, emit: emit, clear: clear };
  })();


  /* ═══════════════════════════════════════════════════════════
     L07 — METRICS
     ═══════════════════════════════════════════════════════════ */

  const Metrics = (function () {
    function increment(key, by) {
      if (typeof state.metrics[key] !== 'number') state.metrics[key] = 0;
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
     L08 — CRYPTO UTILITIES
     ═══════════════════════════════════════════════════════════ */

  function fnv1aHash(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function randomHex(bytes) {
    bytes = bytes || 8;
    if (ENV.supportsRandomValues) {
      const arr = new Uint8Array(bytes);
      window.crypto.getRandomValues(arr);
      return Array.prototype.map.call(arr, function (b) {
        return ('00' + b.toString(16)).slice(-2);
      }).join('');
    }
    /* Fallback: Math.random (less secure) */
    let out = '';
    for (let i = 0; i < bytes; i++) {
      out += ('00' + Math.floor(Math.random() * 256).toString(16)).slice(-2);
    }
    return out;
  }

  function randomId(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + randomHex(4);
  }

  function buildFingerprint() {
    const parts = [
      ENV.language || '',
      ENV.platform || '',
      ENV.hardwareConcurrency || 0,
      ENV.maxTouchPoints || 0,
      screen.width + 'x' + screen.height,
      screen.colorDepth || 0,
      new Date().getTimezoneOffset(),
      navigator.userAgent || '',
    ];
    return fnv1aHash(parts.join('|'));
  }


  /* ═══════════════════════════════════════════════════════════
     L09 — STRING UTILITIES
     ═══════════════════════════════════════════════════════════ */

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isString(v) {
    return typeof v === 'string';
  }

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function safeString(input) {
    if (input === null || input === undefined) return '';
    return String(input);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Object.isFrozen(obj)) return obj;
    Object.getOwnPropertyNames(obj).forEach(function (k) {
      deepFreeze(obj[k]);
    });
    return Object.freeze(obj);
  }


  /* ═══════════════════════════════════════════════════════════
     L10 — SAFE STORAGE (with integrity)
     ═══════════════════════════════════════════════════════════ */

  const Storage = (function () {

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

    function getJSON(key) {
      const raw = get(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function setJSON(key, value) {
      try { return set(key, JSON.stringify(value)); } catch (e) { return false; }
    }

    function setWithIntegrity(key, value) {
      if (!CONFIG.FEATURES.STORAGE_VERIFY) {
        return setJSON(key, value);
      }
      try {
        const payload = JSON.stringify(value);
        const signature = fnv1aHash(payload + '|' + getFingerprint());
        const wrapper = {
          v: payload,
          s: signature,
          t: Date.now(),
        };
        return setJSON(key, wrapper);
      } catch (e) {
        return false;
      }
    }

    function getWithIntegrity(key) {
      const wrapper = getJSON(key);
      if (!wrapper || !wrapper.v || !wrapper.s) return null;

      try {
        const expected = fnv1aHash(wrapper.v + '|' + getFingerprint());
        if (expected !== wrapper.s) {
          log.warn('Integrity check failed for', key);
          remove(key);
          return null;
        }
        return JSON.parse(wrapper.v);
      } catch (e) {
        return null;
      }
    }

    return {
      get: get,
      set: set,
      remove: remove,
      getJSON: getJSON,
      setJSON: setJSON,
      setWithIntegrity: setWithIntegrity,
      getWithIntegrity: getWithIntegrity,
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L11 — CLICKJACKING PROTECTION
     ═══════════════════════════════════════════════════════════ */

  const Clickjacking = (function () {

    function detect() {
      if (!ENV.isFramed) return false;
      return true;
    }

    function blockInteraction() {
      /* Add a class to body that freezes clicks */
      try {
        document.documentElement.classList.add('is-frame-blocked');
        document.body.classList.add('is-frame-blocked');

        /* Inject a full-screen blocker */
        const blocker = document.createElement('div');
        blocker.className = 'security-frame-blocker';
        blocker.setAttribute('aria-hidden', 'true');
        blocker.setAttribute('role', 'presentation');
        blocker.style.cssText =
          'position:fixed;inset:0;z-index:2147483647;' +
          'background:rgba(15,18,24,0.92);color:#FBF8F0;' +
          'display:flex;align-items:center;justify-content:center;' +
          'font-family:Tahoma,sans-serif;font-size:16px;text-align:center;' +
          'padding:24px;direction:rtl;line-height:1.8;';

        blocker.innerHTML =
          '<div>' +
          '<div style="font-size:24px;font-weight:900;margin-bottom:12px;">' +
          'دسترسی مسدود شد' +
          '</div>' +
          '<div style="max-width:420px;opacity:0.85;">' +
          'این صفحه در یک فریم ناشناس نمایش داده شده است. ' +
          'برای امنیت شما، از طریق دامنه اصلی سایت وارد شوید.' +
          '</div>' +
          '</div>';

        if (document.body) {
          document.body.appendChild(blocker);
        } else {
          document.addEventListener('DOMContentLoaded', function () {
            document.body.appendChild(blocker);
          }, { once: true });
        }
      } catch (e) { }
    }

    function breakFrame() {
      try {
        if (window.top && window.top !== window.self) {
          window.top.location = window.self.location.href;
        }
      } catch (e) {
        /* Cross-origin — can't break, rely on visual warning */
        log.debug('Frame break failed (cross-origin)');
      }
    }

    function handle() {
      if (!CONFIG.CLICKJACKING.ENABLED) return false;
      if (CONFIG.CLICKJACKING.ALLOW_IFRAMES) return false;
      if (!detect()) return false;

      Bus.emit(CONFIG.EVENTS.CLICKJACKING, {
        referrer: ENV.referrer,
        origin: ENV.origin,
      });

      if (CONFIG.CLICKJACKING.BREAK_FRAME) {
        breakFrame();
      }

      if (CONFIG.CLICKJACKING.SHOW_WARNING) {
        blockInteraction();
      }

      return true;
    }

    return { handle: handle, detect: detect };
  })();


  /* ═══════════════════════════════════════════════════════════
     L12 — CONSOLE WARNING BANNER
     ═══════════════════════════════════════════════════════════ */

  const ConsoleBanner = (function () {

    function alreadyShown() {
      if (!CONFIG.CONSOLE.SHOW_ONCE_PER_SESSION) return false;
      const flag = Storage.get(CONFIG.CONSOLE.STORAGE_KEY);
      return flag === '1';
    }

    function markShown() {
      Storage.set(CONFIG.CONSOLE.STORAGE_KEY, '1');
    }

    function show() {
      if (!CONFIG.CONSOLE.ENABLED) return;
      if (!window.console) return;
      if (alreadyShown()) return;

      markShown();

      const titleStyle = [
        'background: linear-gradient(90deg, #DDA83D, #C68B1E);',
        'color: #0A0E17;',
        'font-size: 20px;',
        'font-weight: 900;',
        'padding: 12px 24px;',
        'border-radius: 8px 8px 0 0;',
        'letter-spacing: -0.02em;',
        'display: block;',
      ].join('');

      const bodyStyle = [
        'background: #131823;',
        'color: #FBF8F0;',
        'font-size: 13px;',
        'padding: 16px 24px 20px;',
        'border-radius: 0 0 8px 8px;',
        'line-height: 1.9;',
        'direction: rtl;',
        'display: block;',
        'max-width: 560px;',
      ].join('');

      const warnStyle = [
        'background: #C25E3A;',
        'color: #FFFFFF;',
        'font-weight: 900;',
        'padding: 4px 10px;',
        'border-radius: 4px;',
        'font-size: 12px;',
      ].join('');

      try {
        console.log('%c🔒 خانم ریاضی — توجه امنیتی', titleStyle);
        console.log(
          '%c' +
          '⚠️ هشدار مهم:\n\n' +
          'اگر کسی از شما خواسته چیزی اینجا کپی یا پیست کنید، ' +
          'احتمالاً کلاهبردار است. این کار می‌تواند به حساب شما یا ' +
          'اطلاعاتتان آسیب بزند.\n\n' +
          'ما هیچ‌وقت از شما نمی‌خواهیم این کار را بکنید.\n\n' +
          'برای گزارش مشکوک: security@missmath.ir',
          bodyStyle
        );
        console.log('%c⚠️ هشدار', warnStyle);
      } catch (e) { }
    }

    return { show: show };
  })();


  /* ═══════════════════════════════════════════════════════════
     L13 — RATE LIMITER
     ═══════════════════════════════════════════════════════════ */

  const RateLimiter = (function () {

    let cache = null;

    function loadCache() {
      if (cache !== null) return cache;
      if (!CONFIG.RATE_LIMIT.ENABLED) { cache = {}; return cache; }

      try {
        const raw = Storage.get(CONFIG.RATE_LIMIT.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          /* Prune old entries (>1h) */
          const now = Date.now();
          Object.keys(parsed).forEach(function (k) {
            if (!parsed[k] || !parsed[k].ts || now - parsed[k].ts > 3600000) {
              delete parsed[k];
            }
          });
          cache = parsed;
        } else {
          cache = {};
        }
      } catch (e) {
        cache = {};
      }
      return cache;
    }

    function saveCache() {
      if (!cache) return;
      try {
        Storage.set(CONFIG.RATE_LIMIT.STORAGE_KEY, JSON.stringify(cache));
      } catch (e) { }
    }

    function getPreset(action) {
      if (hasOwn(CONFIG.RATE_LIMIT.PRESETS, action)) {
        return CONFIG.RATE_LIMIT.PRESETS[action];
      }
      return CONFIG.RATE_LIMIT.DEFAULT;
    }

    /**
     * Check rate limit for a given action key.
     * Returns: { allowed: bool, remaining: n, resetIn: ms }
     */
    function check(action, options) {
      options = options || {};

      if (!CONFIG.RATE_LIMIT.ENABLED) {
        return { allowed: true, remaining: 999, resetIn: 0 };
      }

      const preset = getPreset(action);
      const maxAttempts = options.maxAttempts || preset.MAX_ATTEMPTS;
      const windowMs = options.windowMs || preset.WINDOW_MS;
      const lockoutMs = options.lockoutMs || preset.LOCKOUT_MS;

      const cacheRef = loadCache();
      const now = Date.now();
      const entry = cacheRef[action] || { count: 0, ts: now, lockedUntil: 0 };

      /* Check lockout */
      if (entry.lockedUntil && now < entry.lockedUntil) {
        Metrics.increment('rateLimitHits');
        return {
          allowed: false,
          remaining: 0,
          resetIn: entry.lockedUntil - now,
          locked: true,
        };
      }

      /* Reset window */
      if (now - entry.ts > windowMs) {
        entry.count = 0;
        entry.ts = now;
        entry.lockedUntil = 0;
      }

      /* Check count */
      if (entry.count >= maxAttempts) {
        entry.lockedUntil = now + lockoutMs;
        cacheRef[action] = entry;
        saveCache();

        Metrics.increment('rateLimitHits');
        Bus.emit(CONFIG.EVENTS.RATE_LIMITED, {
          action: action,
          count: entry.count,
          lockedUntil: entry.lockedUntil,
        });

        return {
          allowed: false,
          remaining: 0,
          resetIn: lockoutMs,
          locked: true,
        };
      }

      /* Increment */
      entry.count++;
      cacheRef[action] = entry;
      saveCache();

      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - entry.count),
        resetIn: windowMs - (now - entry.ts),
      };
    }

    function reset(action) {
      const cacheRef = loadCache();
      if (action) {
        delete cacheRef[action];
      } else {
        cache = {};
      }
      saveCache();
      return true;
    }

    return { check: check, reset: reset };
  })();


  /* ═══════════════════════════════════════════════════════════
     L14 — INPUT SANITIZER
     ═══════════════════════════════════════════════════════════ */

  const Sanitizer = (function () {

    function stripControlChars(str) {
      return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    }

    function stripZeroWidth(str) {
      /* ZWSP, ZWNJ, ZWJ, BOM, word-joiner */
      return str.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
    }

    function stripBidi(str) {
      /* Bidi override chars — used in spoofing */
      return str.replace(/[\u202A-\u202E\u2066-\u2069]/g, '');
    }

    function stripTags(str) {
      return str.replace(/<[^>]*>/g, '');
    }

    function normalizeWhitespace(str) {
      return str.replace(/\s+/g, ' ').trim();
    }

    function normalizeUnicode(str) {
      try {
        return str.normalize('NFC');
      } catch (e) {
        return str;
      }
    }

    function normalizePersian(str) {
      return str
        .replace(/ي/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/ۀ/g, 'ه')
        .replace(/ة/g, 'ه')
        .replace(/[٠-٩]/g, function (d) {
          return String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48);
        })
        .replace(/[۰-۹]/g, function (d) {
          return String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48);
        });
    }

    /**
     * Main sanitize function.
     * @param {string} input
     * @param {object} options
     * @returns {string}
     */
    function sanitize(input, options) {
      options = options || {};
      Metrics.increment('sanitizations');

      if (input === null || input === undefined) return '';
      if (typeof input !== 'string') input = String(input);

      let out = input;

      /* Max length (before other ops) */
      const maxLen = options.maxLength || CONFIG.SANITIZE.MAX_LENGTH;
      if (out.length > maxLen * 2) {
        out = out.slice(0, maxLen * 2);
      }

      /* Normalize Unicode */
      if (CONFIG.SANITIZE.NORMALIZE_UNICODE) {
        out = normalizeUnicode(out);
      }

      /* Persian normalization */
      if (options.normalizePersian !== false) {
        out = normalizePersian(out);
      }

      /* Strip control chars */
      if (CONFIG.SANITIZE.STRIP_CONTROL_CHARS) {
        out = stripControlChars(out);
      }

      /* Strip zero-width (unless explicitly kept) */
      if (CONFIG.SANITIZE.STRIP_ZERO_WIDTH && !options.keepZeroWidth) {
        out = stripZeroWidth(out);
      }

      /* Strip bidi overrides */
      out = stripBidi(out);

      /* Strip tags (optional) */
      if (options.stripTags !== false) {
        out = stripTags(out);
      }

      /* Whitespace normalize */
      if (options.normalizeWhitespace !== false) {
        out = normalizeWhitespace(out);
      }

      /* Final max length */
      if (out.length > maxLen) {
        out = out.slice(0, maxLen);
      }

      /* Trim */
      if (CONFIG.SANITIZE.TRIM && options.trim !== false) {
        out = out.trim();
      }

      return out;
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;')
        .replace(/=/g, '&#61;');
    }

    function escapeAttr(str) {
      return escapeHtml(str);
    }

    function escapeCss(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[^a-zA-Z0-9\-_]/g, function (c) {
        return '\\' + c.charCodeAt(0).toString(16) + ' ';
      });
    }

    return {
      sanitize: sanitize,
      escapeHtml: escapeHtml,
      escapeAttr: escapeAttr,
      escapeCss: escapeCss,
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L15 — URL VALIDATOR
     ═══════════════════════════════════════════════════════════ */

  const UrlValidator = (function () {

    function validate(url, options) {
      options = options || {};
      Metrics.increment('urlValidations');

      if (url === null || url === undefined) {
        return { valid: false, reason: 'empty' };
      }

      if (typeof url !== 'string') {
        return { valid: false, reason: 'not-string' };
      }

      const trimmed = url.trim();

      if (!trimmed) {
        return { valid: false, reason: 'empty' };
      }

      /* Check blocked protocols first (aggressive) */
      const lower = trimmed.toLowerCase();

      for (let i = 0; i < CONFIG.URL.BLOCKED_PROTOCOLS.length; i++) {
        const protocol = CONFIG.URL.BLOCKED_PROTOCOLS[i];
        if (lower.indexOf(protocol) === 0) {
          Bus.emit(CONFIG.EVENTS.INVALID_URL, {
            url: trimmed.slice(0, 100),
            reason: 'blocked-protocol',
            protocol: protocol,
          });
          return { valid: false, reason: 'blocked-protocol', protocol: protocol };
        }
      }

      /* Check allowed protocols */
      const allowed = CONFIG.URL.ALLOWED_PROTOCOLS;
      let protocolMatch = null;

      for (let j = 0; j < allowed.length; j++) {
        if (lower.indexOf(allowed[j]) === 0) {
          protocolMatch = allowed[j];
          break;
        }
      }

      /* Relative URLs (start with / or ./ or ../ or # or ?) */
      if (!protocolMatch) {
        if (trimmed.charAt(0) === '/' || trimmed.charAt(0) === '#' || trimmed.charAt(0) === '?') {
          protocolMatch = 'relative';
        } else if (trimmed.indexOf('./') === 0 || trimmed.indexOf('../') === 0) {
          protocolMatch = 'relative';
        }
      }

      if (!protocolMatch) {
        Bus.emit(CONFIG.EVENTS.INVALID_URL, {
          url: trimmed.slice(0, 100),
          reason: 'unallowed-protocol',
        });
        return { valid: false, reason: 'unallowed-protocol' };
      }

      return {
        valid: true,
        url: trimmed,
        protocol: protocolMatch,
      };
    }

    function isExternal(url) {
      try {
        if (!url) return false;
        if (url.charAt(0) === '/' || url.charAt(0) === '#' || url.charAt(0) === '?') {
          return false;
        }
        const a = document.createElement('a');
        a.href = url;
        return a.host !== window.location.host;
      } catch (e) {
        return false;
      }
    }

    function validatePhone(digits) {
      if (!digits || typeof digits !== 'string') return false;
      const d = digits.replace(/\D/g, '');
      if (d.length < 8 || d.length > 15) return false;
      return /^\d+$/.test(d);
    }

    function validateEmail(email) {
      if (!email || typeof email !== 'string') return false;
      if (email.length > 254) return false;
      return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
    }

    return {
      validate: validate,
      isExternal: isExternal,
      validatePhone: validatePhone,
      validateEmail: validateEmail,
    };
  })();


  /* ═══════════════════════════════════════════════════════════
     L16 — EXTERNAL LINK HARDENING
     ═══════════════════════════════════════════════════════════ */

  const ExternalLinks = (function () {

    function hardenAll() {
      if (!CONFIG.FEATURES.EXTERNAL_LINKS) return 0;
      if (!CONFIG.EXTERNAL_LINKS.HARDEN) return 0;

      const links = document.querySelectorAll('a[href]');
      let count = 0;

      links.forEach(function (a) {
        const href = a.getAttribute('href');
        if (!href) return;

        if (UrlValidator.isExternal(href)) {
          /* Force target=_blank security */
          if (!a.hasAttribute('rel')) {
            a.setAttribute('rel', 'noopener noreferrer');
          } else {
            const rel = a.getAttribute('rel') || '';
            if (rel.indexOf('noopener') === -1) {
              a.setAttribute('rel', rel + ' noopener');
            }
            if (rel.indexOf('noreferrer') === -1) {
              a.setAttribute('rel', (a.getAttribute('rel') || '') + ' noreferrer');
            }
          }

          /* Force target=_blank for external */
          if (!a.hasAttribute('target')) {
            a.setAttribute('target', '_blank');
          }

          count++;
        }
      });

      Metrics.increment('externalLinksHardened', count);
      return count;
    }

    function startObserver() {
      if (!ENV.supportsMutationObserver) return;
      if (!CONFIG.EXTERNAL_LINKS.SCAN_ON_MUTATION) return;

      const observer = new MutationObserver(function (mutations) {
        let shouldRescan = false;
        mutations.forEach(function (m) {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType !== 1) return;
            if (n.tagName === 'A' || (n.querySelector && n.querySelector('a[href]'))) {
              shouldRescan = true;
            }
          });
        });
        if (shouldRescan) {
          setTimeout(hardenAll, 60);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      log.debug('External links observer started');
    }

    return { hardenAll: hardenAll, startObserver: startObserver };
  })();


  /* ═══════════════════════════════════════════════════════════
     L17 — HASH SANITIZER
     ═══════════════════════════════════════════════════════════ */

  const HashSanitizer = (function () {

    function sanitize() {
      if (!CONFIG.FEATURES.HASH_SANITIZE) return false;
      if (!CONFIG.HASH.SANITIZE) return false;

      try {
        const hash = window.location.hash;
        if (!hash) return false;
        if (hash === '#') return false;

        if (!CONFIG.HASH.ALLOWED_PATTERN.test(hash)) {
          /* Bad hash — strip it */
          const cleanUrl = window.location.pathname + window.location.search;
          history.replaceState(null, '', cleanUrl);
          Metrics.increment('hashSanitized');
          return true;
        }

        if (hash.length > CONFIG.HASH.MAX_LENGTH) {
          const cleanUrl = window.location.pathname + window.location.search;
          history.replaceState(null, '', cleanUrl);
          Metrics.increment('hashSanitized');
          return true;
        }

        return false;
      } catch (e) {
        return false;
      }
    }

    function watch() {
      window.addEventListener('hashchange', function () {
        sanitize();
      }, false);
    }

    return { sanitize: sanitize, watch: watch };
  })();


  /* ═══════════════════════════════════════════════════════════
     L18 — BOT DETECTION (behavioral)
     ═══════════════════════════════════════════════════════════ */

  const BotDetector = (function () {

    function addSignal(name, weight) {
      if (!CONFIG.FEATURES.BOT_DETECT) return;
      state.bot.suspiciousSignals.push({
        name: name,
        weight: weight || 1,
        at: Date.now(),
      });
      state.bot.score += (weight || 1);
    }

    function recordInteraction() {
      const now = Date.now();
      if (!state.bot.firstInteractionAt) {
        state.bot.firstInteractionAt = now;
      }
      state.bot.lastInteractionAt = now;
    }

    function evaluate() {
      if (!CONFIG.FEATURES.BOT_DETECT) return 'human';

      const b = state.bot;
      let score = 0;

      /* Signal 1: no mouse movement (desktop only) */
      if (!ENV.isTouch) {
        if (b.mouseMoves === 0) score += 3;
        else if (b.mouseMoves < CONFIG.BOT.MIN_MOUSE_MOVES) score += 1;
      }

      /* Signal 2: no scroll */
      if (b.scrollEvents === 0) score += 2;
      else if (b.scrollEvents < CONFIG.BOT.MIN_SCROLL_EVENTS) score += 1;

      /* Signal 3: instant first interaction */
      if (b.firstInteractionAt > 0) {
        const delay = b.firstInteractionAt - (state.bootedAt || Date.now());
        if (delay < CONFIG.BOT.MIN_INTERACTION_DELAY_MS) score += 2;
      }

      /* Signal 4: webdriver flag */
      if (ENV.isWebDriver) score += 5;

      /* Signal 5: headless UA */
      if (ENV.isHeadless) score += 5;

      /* Signal 6: crawler UA */
      if (ENV.isCrawler) score += 3;

      /* Signal 7: suspicious viewport */
      if (window.outerWidth === 0 || window.outerHeight === 0) score += 1;

      /* Signal 8: bad UA */
      if (!navigator.userAgent || navigator.userAgent.length < 20) score += 2;

      /* Signal 9: no plugins (older bots) */
      if (!ENV.isTouch && navigator.plugins && navigator.plugins.length === 0) {
        /* Modern Chrome has few plugins — do not penalize heavily */
        score += 0;
      }

      b.score = score;
      b.verdict = score >= CONFIG.BOT.BOT_THRESHOLD ? 'bot' : 'human';

      if (b.verdict === 'bot') {
        Bus.emit(CONFIG.EVENTS.BOT_DETECTED, {
          score: score,
          signals: b.suspiciousSignals.slice(),
          userAgent: navigator.userAgent,
        });
      }

      return b.verdict;
    }

    function bind() {
      if (!CONFIG.FEATURES.BOT_DETECT) return;

      document.addEventListener('mousemove', function () {
        state.bot.mouseMoves++;
        recordInteraction();
      }, { passive: true });

      document.addEventListener('scroll', function () {
        state.bot.scrollEvents++;
        recordInteraction();
      }, { passive: true });

      document.addEventListener('touchstart', function () {
        state.bot.touchEvents++;
        recordInteraction();
      }, { passive: true });

      document.addEventListener('keydown', function () {
        state.bot.keyPresses++;
        recordInteraction();
      }, false);

      document.addEventListener('click', function () {
        state.bot.clicks++;
        recordInteraction();
      }, false);

      /* Re-evaluate on visibility change */
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) evaluate();
      }, false);

      /* Store on unload */
      window.addEventListener('pagehide', function () {
        try {
          Storage.setJSON(CONFIG.BOT.STORAGE_KEY, {
            score: state.bot.score,
            verdict: state.bot.verdict,
            at: Date.now(),
          });
        } catch (e) { }
      }, { once: true });
    }

    function isBot() {
      return state.bot.verdict === 'bot';
    }

    return { bind: bind, evaluate: evaluate, isBot: isBot, addSignal: addSignal };
  })();


  /* ═══════════════════════════════════════════════════════════
     L19 — TAB VISIBILITY TRACKER
     ═══════════════════════════════════════════════════════════ */

  function initVisibility() {
    if (!CONFIG.FEATURES.VISIBILITY) return;
    if (!ENV.supportsVisibility) return;

    function update() {
      const hidden = document.hidden;
      const now = Date.now();

      if (hidden) {
        state.visibility.hiddenAt = now;
        state.visibility.hiddenCount++;
        state.visibility.state = 'hidden';

        Bus.emit(CONFIG.EVENTS.TAB_HIDDEN, {
          hiddenCount: state.visibility.hiddenCount,
        });
      } else {
        if (state.visibility.hiddenAt > 0) {
          state.visibility.totalHiddenMs += now - state.visibility.hiddenAt;
          state.visibility.hiddenAt = 0;
        }
        state.visibility.state = 'visible';

        Bus.emit(CONFIG.EVENTS.TAB_VISIBLE, {
          totalHiddenMs: state.visibility.totalHiddenMs,
        });
      }
    }

    document.addEventListener('visibilitychange', update, false);
    update();
  }


  /* ═══════════════════════════════════════════════════════════
     L20 — FOCUS / BLUR AWARENESS
     ═══════════════════════════════════════════════════════════ */

  function initFocusTracking() {
    if (!CONFIG.FEATURES.FOCUS_TRACK) return;

    window.addEventListener('blur', function () {
      state.focus.hasFocus = false;
      state.focus.blurCount++;
      Bus.emit(CONFIG.EVENTS.WINDOW_BLUR, {
        blurCount: state.focus.blurCount,
      });
    }, false);

    window.addEventListener('focus', function () {
      state.focus.hasFocus = true;
      Bus.emit(CONFIG.EVENTS.WINDOW_FOCUS, {
        blurCount: state.focus.blurCount,
      });
    }, false);
  }


  /* ═══════════════════════════════════════════════════════════
     L21 — DEVTOOLS DETECTOR (light)
     ═══════════════════════════════════════════════════════════ */

  const DevTools = (function () {

    function check() {
      if (!CONFIG.FEATURES.DEVTOOLS) return false;

      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      const isOpen = widthDiff > CONFIG.DEVTOOLS.THRESHOLD_PX ||
                     heightDiff > CONFIG.DEVTOOLS.THRESHOLD_PX;

      if (isOpen && !state.devtools.isOpen) {
        state.devtools.isOpen = true;
        Bus.emit(CONFIG.EVENTS.DEVTOOLS_OPEN, {
          widthDiff: widthDiff,
          heightDiff: heightDiff,
        });
      } else if (!isOpen) {
        state.devtools.isOpen = false;
      }

      return isOpen;
    }

    function start() {
      if (!CONFIG.FEATURES.DEVTOOLS) return;
      state.devtools.checkInterval = setInterval(check, CONFIG.DEVTOOLS.CHECK_INTERVAL_MS);
    }

    function stop() {
      if (state.devtools.checkInterval) {
        clearInterval(state.devtools.checkInterval);
        state.devtools.checkInterval = null;
      }
    }

    return { start: start, stop: stop, check: check };
  })();


  /* ═══════════════════════════════════════════════════════════
     L22 — CSP META INJECTION (best-effort)
     ═══════════════════════════════════════════════════════════ */

  function injectCspMeta() {
    if (!CONFIG.FEATURES.CSP_META) return false;

    try {
      /* Check if a CSP meta already exists */
      const existing = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (existing) return false;

      const meta = document.createElement('meta');
      meta.setAttribute('http-equiv', 'Content-Security-Policy');
      meta.setAttribute('content', CONFIG.CSP.POLICY);

      /* Insert into head as first child */
      const head = document.head || document.getElementsByTagName('head')[0];
      if (head && head.firstChild) {
        head.insertBefore(meta, head.firstChild);
      } else if (head) {
        head.appendChild(meta);
      }

      log.debug('CSP meta injected');
      return true;
    } catch (e) {
      return false;
    }
  }


  /* ═══════════════════════════════════════════════════════════
     L23 — FINGERPRINT CACHE
     ═══════════════════════════════════════════════════════════ */

  function getFingerprint() {
    if (!state.fingerprint) {
      try {
        state.fingerprint = buildFingerprint();
      } catch (e) {
        state.fingerprint = 'unknown';
      }
    }
    return state.fingerprint;
  }


  /* ═══════════════════════════════════════════════════════════
     SELF TEST — for diagnostics
     ═══════════════════════════════════════════════════════════ */

  function selfTest() {
    const results = {
      version: VERSION,
      fingerprint: getFingerprint(),
      tests: {},
    };

    /* Sanitize test */
    try {
      const out = Sanitizer.sanitize('<script>alert(1)</script>hello');
      results.tests.sanitize = out.indexOf('<script>') === -1 ? 'pass' : 'fail';
    } catch (e) {
      results.tests.sanitize = 'error: ' + e.message;
    }

    /* EscapeHtml test */
    try {
      const out = Sanitizer.escapeHtml('<a href="x">');
      results.tests.escapeHtml = out.indexOf('<') === -1 ? 'pass' : 'fail';
    } catch (e) {
      results.tests.escapeHtml = 'error: ' + e.message;
    }

    /* URL validate test */
    try {
      const bad = UrlValidator.validate('javascript:alert(1)');
      const good = UrlValidator.validate('https://example.com');
      results.tests.urlValidator = (!bad.valid && good.valid) ? 'pass' : 'fail';
    } catch (e) {
      results.tests.urlValidator = 'error: ' + e.message;
    }

    /* Rate limit test */
    try {
      const res = RateLimiter.check('__selftest__', {
        maxAttempts: 1,
        windowMs: 1000,
        lockoutMs: 1000,
      });
      results.tests.rateLimit = (res.allowed === true) ? 'pass' : 'fail';
      RateLimiter.reset('__selftest__');
    } catch (e) {
      results.tests.rateLimit = 'error: ' + e.message;
    }

    /* Clickjacking detector */
    try {
      results.tests.clickjacking = (typeof Clickjacking.detect() === 'boolean') ? 'pass' : 'fail';
    } catch (e) {
      results.tests.clickjacking = 'error: ' + e.message;
    }

    return results;
  }


  /* ═══════════════════════════════════════════════════════════
     L24 — INIT
     ═══════════════════════════════════════════════════════════ */

  function init() {
    if (state.initialised) return;
    state.initialised = true;

    const bootStart = Date.now();

    log.group('BOOT', function () {

      log.debug('Initializing v' + VERSION);

      state.bootedAt = Date.now();
      state.fingerprint = getFingerprint();

      log.debug('Fingerprint:', state.fingerprint);

      /* Phase 1 — clickjacking protection (highest priority) */
      safeRun('clickjacking', function () {
        Clickjacking.handle();
      });

      /* Phase 2 — CSP meta (best-effort, before other things) */
      safeRun('csp', function () {
        injectCspMeta();
      });

      /* Phase 3 — hash sanitization */
      safeRun('hash', function () {
        HashSanitizer.sanitize();
        HashSanitizer.watch();
      });

      /* Phase 4 — external link hardening */
      safeRun('externalLinks', function () {
        ExternalLinks.hardenAll();
        ExternalLinks.startObserver();
      });

      /* Phase 5 — visibility & focus tracking */
      safeRun('visibility', function () {
        initVisibility();
      });
      safeRun('focus', function () {
        initFocusTracking();
      });

      /* Phase 6 — bot detection */
      safeRun('botDetect', function () {
        BotDetector.bind();
      });

      /* Phase 7 — devtools (optional) */
      safeRun('devtools', function () {
        DevTools.start();
      });

      /* Phase 8 — console banner (last, after other setup) */
      setTimeout(function () {
        safeRun('console', function () {
          ConsoleBanner.show();
        });
      }, 200);

      /* Emit ready */
      Bus.emit(CONFIG.EVENTS.READY, {
        version: VERSION,
        fingerprint: state.fingerprint,
        isFramed: ENV.isFramed,
        isSecure: ENV.isSecure,
        reducedMotion: ENV.reducedMotion,
      });

      /* Mark body */
      try {
        document.body.setAttribute('data-security-version', VERSION);
      } catch (e) { }

      Metrics.set('bootMs', Date.now() - bootStart);

      log.debug('Boot complete in', Metrics.get().bootMs + 'ms');
    });
  }


  function safeRun(label, fn) {
    try {
      fn();
    } catch (err) {
      state.metrics.errors++;
      log.warn('Phase "' + label + '" failed:', err);
      Bus.emit(CONFIG.EVENTS.ERROR, {
        phase: label,
        message: err && err.message,
      });
    }
  }


  /* ═══════════════════════════════════════════════════════════
     L25 — PUBLIC API
     ═══════════════════════════════════════════════════════════ */

  function getStats() {
    return {
      version: VERSION,
      build: BUILD,
      initialised: state.initialised,
      bootedAt: state.bootedAt,

      fingerprint: state.fingerprint,

      env: {
        isFramed: ENV.isFramed,
        isSecure: ENV.isSecure,
        isTouch: ENV.isTouch,
        isMobile: ENV.isMobile,
        reducedMotion: ENV.reducedMotion,
        supportsStorage: ENV.supportsStorage,
        supportsMutationObserver: ENV.supportsMutationObserver,
        supportsCrypto: ENV.supportsCrypto,
        isWebDriver: ENV.isWebDriver,
        isHeadless: ENV.isHeadless,
        isCrawler: ENV.isCrawler,
        online: ENV.online,
        language: ENV.language,
      },

      bot: {
        score: state.bot.score,
        verdict: state.bot.verdict,
        mouseMoves: state.bot.mouseMoves,
        scrollEvents: state.bot.scrollEvents,
        touchEvents: state.bot.touchEvents,
        keyPresses: state.bot.keyPresses,
        clicks: state.bot.clicks,
        signals: state.bot.suspiciousSignals.length,
      },

      visibility: Object.assign({}, state.visibility),
      focus: Object.assign({}, state.focus),
      devtools: { isOpen: state.devtools.isOpen },

      metrics: Metrics.get(),
      events: state.events.slice(-20),
    };
  }

  function getEvents() {
    return state.events.slice();
  }

  function clearEvents() {
    state.events = [];
    return true;
  }

  function resetRateLimits() {
    RateLimiter.reset();
    return true;
  }

  function reset() {
    try {
      Storage.remove(CONFIG.RATE_LIMIT.STORAGE_KEY);
      Storage.remove(CONFIG.CONSOLE.STORAGE_KEY);
      Storage.remove(CONFIG.BOT.STORAGE_KEY);
    } catch (e) { }

    RateLimiter.reset();
    clearEvents();
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

    /* Sanitization (for form.js to use) */
    sanitize: Sanitizer.sanitize,
    escapeHtml: Sanitizer.escapeHtml,
    escapeAttr: Sanitizer.escapeAttr,
    escapeCss: Sanitizer.escapeCss,

    /* Validation (for form.js to use) */
    validateUrl: UrlValidator.validate,
    isExternalUrl: UrlValidator.isExternal,
    validatePhone: UrlValidator.validatePhone,
    validateEmail: UrlValidator.validateEmail,

    /* Rate limiting */
    rateLimit: RateLimiter.check,
    resetRateLimit: RateLimiter.reset,

    /* Bot detection */
    isBot: BotDetector.isBot,
    addBotSignal: BotDetector.addSignal,

    /* Inspection */
    getStats: getStats,
    getEvents: getEvents,
    clearEvents: clearEvents,
    resetRateLimits: resetRateLimits,
    selfTest: selfTest,

    /* Events */
    on: Bus.on,
    off: Bus.on,
    emit: Bus.emit,

    /* Config (read-only) */
    config: deepFreeze(Object.assign({}, CONFIG)),
  };

  try {
    Object.defineProperty(window, 'MissMathSecurity', {
      value: deepFreeze(API),
      writable: false,
      configurable: false,
      enumerable: false,
    });
  } catch (e) {
    window.MissMathSecurity = API;
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
      DevTools.stop();
      Bus.clear();
    } catch (e) { }
  }, { once: true });


  /* ═══════════════════════════════════════════════════════════
     END
     ═══════════════════════════════════════════════════════════ */

})();  