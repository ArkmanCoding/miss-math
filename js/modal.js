/* ============================================================
   modal.js
   Miss Math — Overlay Manager
   فاز ۳ — نسخه v3.3.0

   ─── CHANGELOG ────────────────────────────────────────────
   v3.3.0 — 1403/07
     • OPT-OUT now uses TTL (Time-To-Live)
     • Notice opt-out expires after 24 hours
     • Prize opt-out expires after 24 hours
     • Storage format: { ts: timestamp } instead of '1'
     • Auto-migration from old format
     • Added TTL to CONFIG

   v3.1.1 — forced reflow for sheet animation
   v3.1.0 — tel: support for support button
   v3.0.0 — welcome notice + prize flow
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     0. GUARDS
     ============================================================ */

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (window.__MissMathModalLoaded) return;
  window.__MissMathModalLoaded = true;


  /* ============================================================
     1. VERSION
     ============================================================ */

  const VERSION = '3.3.0';


  /* ============================================================
     2. CONFIG
     ============================================================ */

  const CONFIG = {

    VERSION: VERSION,

    /* Animation timings */
    ANIMATION: {
      OUT_DURATION: 260,
      OUT_EASING: 'cubic-bezier(0.4, 0, 1, 1)',
      SHEET_DURATION: 340,
      SHEET_EASING: 'cubic-bezier(0.4, 0, 1, 1)',
      SHEET_PANEL_MS: 560,
      PANEL_DURATION: 260,
      PANEL_EASING: 'cubic-bezier(0.4, 0, 1, 1)',
      MODAL_DURATION: 220,
      MODAL_EASING: 'cubic-bezier(0.4, 0, 1, 1)',
      DIALOG_SCALE: 0.96,
      DIALOG_OFFSET_Y: 12,
      PANEL_OFFSET_Y: 24,
    },

    /* Focus management */
    FOCUS: {
      DELAY_AFTER_OPEN: 120,
      TRAP_ON_TAB: true,
      RESTORE_ON_CLOSE: true,
    },

    /* Keyboard */
    KEYS: {
      ESCAPE: 'Escape',
      TAB: 'Tab',
    },

    /* Scroll lock */
    SCROLL_LOCK: {
      ENABLED: true,
      CLASS: 'is-locked',
    },

    /* Welcome notice configuration */
    NOTICE: {
      OPTOUT_KEY: 'miss-math:notice-optout:v2',
      SHOW_DELAY_MS: 1200,
      ENABLED: true,
      OPTOUT_SELECTOR: '[data-notice-optout]',
      /* ⚡ NEW: TTL — بعد از این مدت، opt-out خودکار ریست می‌شه */
      OPTOUT_TTL_MS: 24 * 60 * 60 * 1000, /* 24 ساعت */
    },

    /* Prize modal configuration */
    PRIZE: {
      OPTOUT_KEY: 'miss-math:prize-optout:v2',
      SHOW_DELAY_MS: 480,
      FALLBACK_DELAY_MS: 1800,
      ENABLED: true,
      OPTOUT_SELECTOR: '[data-prize-optout]',
      /* ⚡ NEW: TTL برای prize هم */
      OPTOUT_TTL_MS: 24 * 60 * 60 * 1000, /* 24 ساعت */
    },

    /* Behaviour toggles */
    BEHAVIOUR: {
      AUTO_CLOSE_SHEET_ON_PANEL_OPEN: true,
      KEEP_PANEL_ON_MODAL_OPEN: true,
      TRAP_TOP_ONLY: true,
      FORCE_REFLOW_ON_OPEN: true,
    },

    /* Overlays this module manages */
    ALLOWED_IDS: new Set([
      'sheet-all-classes',
      'panel-class-detail',
      'modal-register',
      'modal-notice',
      'modal-prize',
      'modal-creator',
    ]),

    /* Managed by other modules — skip close delegation */
    EXCLUDED_CLOSE_IDS: new Set(['drawer']),

    /* Toast timing */
    TOAST: {
      PHONE_DISPLAY_DURATION: 6000,
    },

    /* aria-live announcements */
    A11Y: {
      ANNOUNCE_OPEN: 'پنجره باز شد',
      ANNOUNCE_CLOSE: 'پنجره بسته شد',
      LIVE_ID: 'miss-math-live-region',
    },

    DEBUG: false,
  };


  /* ============================================================
     3. ENVIRONMENT DETECTION
     ============================================================ */

  const ENV = (function () {
    const mq = function (q) {
      if (!window.matchMedia) return false;
      try { return window.matchMedia(q).matches; } catch (e) { return false; }
    };

    return {
      reducedMotion: mq('(prefers-reduced-motion: reduce)'),
      isTouch: mq('(hover: none) and (pointer: coarse)'),
      isMobile: mq('(max-width: 640px)'),
      supportsInert: 'inert' in HTMLElement.prototype,
      supportsWAAPI: typeof Element.prototype.animate === 'function',
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
    };
  })();


  /* ============================================================
     4. LOGGER
     ============================================================ */

  const log = (function () {
    const prefix = '[modal.js]';
    const noop = function () { };
    return {
      debug: CONFIG.DEBUG ? console.log.bind(console, prefix) : noop,
      info: console.info ? console.info.bind(console, prefix) : noop,
      warn: console.warn ? console.warn.bind(console, prefix) : noop,
      error: console.error ? console.error.bind(console, prefix) : noop,
    };
  })();


  /* ============================================================
     5. STATE
     ============================================================ */

  const state = {
    overlays: new Map(),
    stack: [],
    initialised: false,
    isClosing: false,
    noticeTimer: null,
    prizeTimer: null,
    lastFocusedEl: null,
    openTimestamps: new Map(),
    stats: {
      totalOpened: 0,
      totalClosed: 0,
      errors: 0,
    },
  };


  /* ============================================================
     6. UTILITIES
     ============================================================ */

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

  function nextFrame() {
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(resolve);
      });
    });
  }

  function now() {
    return (window.performance && performance.now)
      ? performance.now()
      : Date.now();
  }

  function safeCall(fn, args, context) {
    if (typeof fn !== 'function') return null;
    try {
      return fn.apply(context || null, args || []);
    } catch (err) {
      state.stats.errors++;
      log.error('safeCall failed:', err);
      return null;
    }
  }

  function getFocusable(root) {
    if (!root) return [];
    const selector = [
      'a[href]:not([tabindex="-1"])',
      'area[href]',
      'button:not([disabled]):not([aria-disabled="true"])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'iframe',
      'object',
      'embed',
      'audio[controls]',
      'video[controls]',
      '[contenteditable="true"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    return Array.prototype.filter.call(
      root.querySelectorAll(selector),
      function (el) {
        if (el.hasAttribute('hidden')) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        if (el.closest('[inert]')) return false;
        if (el.closest('[hidden]')) return false;

        const cs = window.getComputedStyle(el);
        if (cs.display === 'none') return false;
        if (cs.visibility === 'hidden') return false;
        if (parseFloat(cs.opacity) === 0) return false;

        if (el.offsetParent === null && cs.position !== 'fixed') return false;

        return true;
      }
    );
  }

  function detectType(root) {
    if (!root) return 'unknown';
    if (root.classList.contains('sheet')) return 'sheet';
    if (root.classList.contains('panel')) return 'panel';
    if (root.classList.contains('modal')) return 'modal';
    return 'overlay';
  }

  function getContentEl(root, type) {
    if (!root) return null;
    if (type === 'sheet') return root.querySelector('.sheet__panel') || root;
    if (type === 'modal') return root.querySelector('.modal__dialog') || root;
    return root;
  }

  function isElementInDom(el) {
    if (!el) return false;
    return document.contains(el);
  }

  function forceReflow(el) {
    if (!el) return;
    void el.offsetWidth;
  }


  /* ============================================================
     7. SAFE STORAGE — with TTL support
     ============================================================ */

  const storage = (function () {
    let available = false;

    try {
      const k = '__mm_modal_test__';
      window.localStorage.setItem(k, k);
      window.localStorage.removeItem(k);
      available = true;
    } catch (e) {
      available = false;
    }

    function get(key) {
      if (!available) return null;
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }

    function set(key, value) {
      if (!available) return false;
      try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
    }

    function remove(key) {
      if (!available) return false;
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

    /**
     * ⚡ NEW: Set flag with timestamp for TTL support
     * Format: { ts: <timestamp> }
     */
    function setFlagWithTTL(key) {
      const payload = {
        ts: Date.now(),
        v: VERSION,
      };
      return setJSON(key, payload);
    }

    /**
     * ⚡ NEW: Check if flag is set AND still valid (within TTL)
     * @param {string} key
     * @param {number} ttlMs - Time-To-Live in milliseconds
     * @returns {boolean} — true if still valid, false if expired or not set
     */
    function isFlagValid(key, ttlMs) {
      const data = getJSON(key);
      if (!data || typeof data !== 'object') {
        /* Legacy format (plain '1') — migrate */
        const legacy = get(key);
        if (legacy === '1') {
          /* Old format: treat as just-now set (valid) */
          setFlagWithTTL(key);
          return true;
        }
        return false;
      }

      if (typeof data.ts !== 'number') return false;

      const age = Date.now() - data.ts;
      const ttl = typeof ttlMs === 'number' ? ttlMs : 24 * 60 * 60 * 1000;

      if (age < 0) return false; /* Clock skew — invalid */
      if (age > ttl) {
        /* Expired — remove and return false */
        remove(key);
        log.debug('Flag expired (TTL):', key, 'age:', Math.round(age / 1000) + 's');
        return false;
      }

      return true;
    }

    /**
     * Get remaining TTL in ms (for debugging)
     */
    function getRemainingTTL(key) {
      const data = getJSON(key);
      if (!data || typeof data.ts !== 'number') return 0;
      const age = Date.now() - data.ts;
      return Math.max(0, 24 * 60 * 60 * 1000 - age);
    }

    return {
      available: available,
      get: get,
      set: set,
      remove: remove,
      getJSON: getJSON,
      setJSON: setJSON,
      setFlagWithTTL: setFlagWithTTL,
      isFlagValid: isFlagValid,
      getRemainingTTL: getRemainingTTL,
    };
  })();


  /* ============================================================
     8. SCROLL LOCK
     ============================================================ */

  const ScrollLock = (function () {
    let count = 0;
    let savedPadding = '';
    let touchedPadding = false;

    function lock() {
      count++;
      if (count > 1) return;

      const body = document.body;
      if (body.classList.contains(CONFIG.SCROLL_LOCK.CLASS)) return;

      const sbw = window.innerWidth - document.documentElement.clientWidth;
      savedPadding = body.style.paddingInlineEnd || '';
      touchedPadding = true;

      if (sbw > 0) {
        body.style.setProperty('--scrollbar-width', sbw + 'px');
        body.style.paddingInlineEnd = sbw + 'px';
      }

      body.classList.add(CONFIG.SCROLL_LOCK.CLASS);
    }

    function unlock() {
      count = Math.max(0, count - 1);
      if (count > 0) return;

      const body = document.body;

      if (touchedPadding) {
        body.style.paddingInlineEnd = savedPadding;
        body.style.removeProperty('--scrollbar-width');
        touchedPadding = false;
      }

      body.classList.remove(CONFIG.SCROLL_LOCK.CLASS);
    }

    function reset() {
      count = 0;
      unlock();
    }

    return { lock: lock, unlock: unlock, reset: reset };
  })();


  /* ============================================================
     9. ARIA LIVE ANNOUNCER
     ============================================================ */

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
      window.setTimeout(function () {
        el.textContent = String(message);
      }, 30);
    }

    return { announce: announce };
  })();


  /* ============================================================
     10. OVERLAY REGISTRY
     ============================================================ */

  function registerOverlay(root) {
    if (!root || !root.id) return null;
    if (!CONFIG.ALLOWED_IDS.has(root.id)) return null;
    if (state.overlays.has(root.id)) return state.overlays.get(root.id);

    const type = detectType(root);

    const record = {
      id: root.id,
      root: root,
      type: type,
      contentEl: getContentEl(root, type),
      isOpen: false,
      isAnimating: false,
      lastFocused: null,
      options: {},
      onBeforeOpen: null,
      onAfterOpen: null,
      onBeforeClose: null,
      onAfterClose: null,
      activeAnimations: [],
    };

    state.overlays.set(root.id, record);
    log.debug('Registered overlay:', root.id, '(' + type + ')');
    return record;
  }


  /* ============================================================
     11. ANIMATION MANAGER
     ============================================================ */

  const AnimationManager = (function () {

    function cancel(record) {
      if (!record) return;

      if (record.activeAnimations && record.activeAnimations.length) {
        record.activeAnimations.forEach(function (anim) {
          try { anim.cancel(); } catch (e) { }
        });
        record.activeAnimations = [];
      }

      if (record.root && typeof record.root.getAnimations === 'function') {
        try {
          record.root.getAnimations().forEach(function (a) {
            try { a.cancel(); } catch (e) { }
          });
        } catch (e) { }
      }
    }

    function buildExitAnimations(record) {
      const animations = [];
      const { root, type } = record;
      const content = record.contentEl;

      animations.push(
        root.animate(
          [{ opacity: 1 }, { opacity: 0 }],
          {
            duration: CONFIG.ANIMATION.OUT_DURATION,
            easing: CONFIG.ANIMATION.OUT_EASING,
            fill: 'forwards',
          }
        )
      );

      if (type === 'modal' && content !== root) {
        animations.push(
          content.animate(
            [
              { transform: 'translateY(0) scale(1)' },
              {
                transform: 'translateY(' + CONFIG.ANIMATION.DIALOG_OFFSET_Y + 'px) scale(' + CONFIG.ANIMATION.DIALOG_SCALE + ')',
              },
            ],
            {
              duration: CONFIG.ANIMATION.MODAL_DURATION,
              easing: CONFIG.ANIMATION.MODAL_EASING,
              fill: 'forwards',
            }
          )
        );
      } else if (type === 'panel') {
        animations.push(
          root.animate(
            [
              { transform: 'translateY(0)' },
              { transform: 'translateY(' + CONFIG.ANIMATION.PANEL_OFFSET_Y + 'px)' },
            ],
            {
              duration: CONFIG.ANIMATION.PANEL_DURATION,
              easing: CONFIG.ANIMATION.PANEL_EASING,
              fill: 'forwards',
            }
          )
        );
      }

      return animations;
    }

    function animateOut(record) {
      return new Promise(function (resolve) {
        if (ENV.reducedMotion || !ENV.supportsWAAPI) {
          return resolve();
        }

        cancel(record);

        let animations;
        try {
          animations = buildExitAnimations(record);
        } catch (err) {
          log.warn('Animation build failed', err);
          return resolve();
        }

        record.activeAnimations = animations;
        record.isAnimating = true;

        Promise.all(
          animations.map(function (a) {
            return a.finished.catch(function () { return null; });
          })
        ).then(function () {
          record.isAnimating = false;
          record.activeAnimations = [];
          resolve();
        });
      });
    }

    function resetStyles(record) {
      if (!record || !record.root) return;
      record.root.style.removeProperty('opacity');
      if (record.contentEl && record.contentEl !== record.root) {
        record.contentEl.style.removeProperty('opacity');
        record.contentEl.style.removeProperty('transform');
      }
    }

    return {
      cancel: cancel,
      animateOut: animateOut,
      resetStyles: resetStyles,
    };
  })();


  /* ============================================================
     12. FOCUS MANAGEMENT
     ============================================================ */

  const FocusManager = (function () {

    function getFocusablesFor(record) {
      if (!record || !record.root) return [];
      return getFocusable(record.root);
    }

    function focusFirst(record) {
      if (!record || !record.root) return;

      const preferred =
        record.root.querySelector('[data-autofocus]') ||
        record.root.querySelector('[autofocus]');

      const focusables = getFocusablesFor(record);
      const target = preferred || focusables[0] || record.root;

      if (target === record.root && !target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }

      try {
        if (ENV.supportsFocusOpts) {
          target.focus({ preventScroll: true });
        } else {
          target.focus();
        }
      } catch (e) {
        log.warn('focus() failed for', record.id, e);
      }
    }

    function restore(record) {
      if (!CONFIG.FOCUS.RESTORE_ON_CLOSE) return;
      if (!record) return;

      const target = record.lastFocused || state.lastFocusedEl;
      record.lastFocused = null;

      if (target && isElementInDom(target) && typeof target.focus === 'function') {
        try {
          if (ENV.supportsFocusOpts) {
            target.focus({ preventScroll: true });
          } else {
            target.focus();
          }
        } catch (e) {
          log.debug('Focus restore failed', e);
        }
      }
    }

    function trap(record, event) {
      if (!record) return;

      const focusables = getFocusablesFor(record);
      if (!focusables.length) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (!record.root.contains(active)) {
        event.preventDefault();
        focusFirst(record);
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    return {
      getFocusablesFor: getFocusablesFor,
      focusFirst: focusFirst,
      restore: restore,
      trap: trap,
    };
  })();


  /* ============================================================
     13. INERT MANAGEMENT
     ============================================================ */

  const InertManager = (function () {

    function applyInert(el, shouldBeInert) {
      if (!el) return;

      if (shouldBeInert) {
        if (ENV.supportsInert) {
          el.setAttribute('inert', '');
        } else {
          el.setAttribute('aria-hidden', 'true');
          el.setAttribute('data-inert-fallback', 'true');
        }
      } else {
        if (ENV.supportsInert) {
          el.removeAttribute('inert');
        } else {
          if (el.getAttribute('data-inert-fallback') === 'true') {
            el.removeAttribute('aria-hidden');
            el.removeAttribute('data-inert-fallback');
          }
        }
      }
    }

    function update() {
      if (state.stack.length === 0) return;

      const openRecords = state.stack
        .map(function (id) { return state.overlays.get(id); })
        .filter(Boolean);

      if (!openRecords.length) return;

      const top = openRecords[openRecords.length - 1];

      openRecords.forEach(function (rec) {
        applyInert(rec.root, rec !== top);
      });
    }

    function clear() {
      state.overlays.forEach(function (rec) {
        applyInert(rec.root, false);
      });
    }

    return { update: update, clear: clear };
  })();


  /* ============================================================
     14. EVENT DISPATCH
     ============================================================ */

  function dispatchOverlayEvent(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, {
        detail: detail,
        bubbles: false,
        cancelable: false,
      }));
    } catch (err) {
      log.warn('Event dispatch failed:', name, err);
    }
  }

  function emitStackChange() {
    dispatchOverlayEvent('overlay:stack-change', {
      stack: state.stack.slice(),
    });
  }


  /* ============================================================
     15. OPEN
     ============================================================ */

  async function open(id, options) {
    options = options || {};

    if (typeof id !== 'string' || !CONFIG.ALLOWED_IDS.has(id)) {
      log.warn('Rejected unknown overlay id:', id);
      return false;
    }

    const record = state.overlays.get(id);
    if (!record) {
      log.warn('Overlay not registered:', id);
      return false;
    }

    if (record.isOpen) {
      log.debug('Already open, skipping:', id);
      return true;
    }

    /* Auto-close sheet on panel open */
    if (
      id === 'panel-class-detail' &&
      CONFIG.BEHAVIOUR.AUTO_CLOSE_SHEET_ON_PANEL_OPEN &&
      isOpen('sheet-all-classes')
    ) {
      close('sheet-all-classes').catch(function () { });
    }

    dispatchOverlayEvent('overlay:before-open', { id: id, type: record.type });

    if (typeof record.onBeforeOpen === 'function') {
      safeCall(record.onBeforeOpen, [options, record], record);
    }

    /* Remember focus */
    const active = document.activeElement;
    if (active && active !== document.body && isElementInDom(active)) {
      record.lastFocused = active;
      state.lastFocusedEl = active;
    }

    record.options = options;

    AnimationManager.cancel(record);
    AnimationManager.resetStyles(record);

    /* ─── SHOW ─── */
    if (record.type === 'sheet') {
      record.root.hidden = false;
      record.root.removeAttribute('aria-hidden');
      forceReflow(record.root);
      record.root.classList.add('is-open');
    } else {
      record.root.hidden = false;
      record.root.removeAttribute('aria-hidden');

      if (CONFIG.BEHAVIOUR.FORCE_REFLOW_ON_OPEN) {
        forceReflow(record.root);
        if (record.contentEl && record.contentEl !== record.root) {
          forceReflow(record.contentEl);
        }
      }
    }

    record.isOpen = true;

    if (state.stack.indexOf(id) === -1) {
      state.stack.push(id);
    }

    if (CONFIG.SCROLL_LOCK.ENABLED) ScrollLock.lock();

    InertManager.update();

    state.openTimestamps.set(id, now());
    state.stats.totalOpened++;

    dispatchOverlayEvent('overlay:open', { id: id, type: record.type });
    emitStackChange();

    /* Announce */
    const titleEl = record.root.querySelector(
      '.modal__title, .sheet__title, .panel__title'
    );
    const announcement = (titleEl && titleEl.textContent)
      ? titleEl.textContent.trim()
      : CONFIG.A11Y.ANNOUNCE_OPEN;
    Announcer.announce(announcement);

    /* Focus after paint */
    const delay = ENV.reducedMotion ? 0 : CONFIG.FOCUS.DELAY_AFTER_OPEN;
    window.setTimeout(function () {
      if (record.isOpen) FocusManager.focusFirst(record);
    }, delay);

    /* After-open */
    await nextFrame();
    const openDuration = now() - (state.openTimestamps.get(id) || now());
    dispatchOverlayEvent('overlay:after-open', {
      id: id,
      type: record.type,
      duration: Math.round(openDuration),
    });

    if (typeof record.onAfterOpen === 'function') {
      safeCall(record.onAfterOpen, [record], record);
    }

    return true;
  }


  /* ============================================================
     16. CLOSE
     ============================================================ */

  async function close(id) {
    if (typeof id !== 'string') return false;

    if (state.isClosing) {
      await nextFrame();
    }

    const record = state.overlays.get(id);
    if (!record || !record.isOpen) return false;

    state.isClosing = true;

    try {
      dispatchOverlayEvent('overlay:before-close', { id: id, type: record.type });

      if (typeof record.onBeforeClose === 'function') {
        safeCall(record.onBeforeClose, [record], record);
      }

      const idx = state.stack.indexOf(id);
      if (idx !== -1) state.stack.splice(idx, 1);
      emitStackChange();

      /* ─── CLOSE ─── */
      if (record.type === 'sheet') {
        record.root.classList.remove('is-open');

        await new Promise(function (resolve) {
          setTimeout(resolve, CONFIG.ANIMATION.SHEET_PANEL_MS);
        });

        record.root.setAttribute('aria-hidden', 'true');
      } else {
        await AnimationManager.animateOut(record);

        AnimationManager.resetStyles(record);
        record.root.hidden = true;
        record.root.setAttribute('aria-hidden', 'true');
      }

      record.isOpen = false;

      InertManager.update();

      if (CONFIG.SCROLL_LOCK.ENABLED) ScrollLock.unlock();

      FocusManager.restore(record);

      if (typeof record.onAfterClose === 'function') {
        safeCall(record.onAfterClose, [record], record);
      }

      state.stats.totalClosed++;
      const openedAt = state.openTimestamps.get(id);
      const duration = openedAt ? Math.round(now() - openedAt) : 0;
      state.openTimestamps.delete(id);

      dispatchOverlayEvent('overlay:close', { id: id, type: record.type });
      dispatchOverlayEvent('overlay:after-close', {
        id: id,
        type: record.type,
        duration: duration,
      });

      Announcer.announce(CONFIG.A11Y.ANNOUNCE_CLOSE);

      return true;

    } catch (err) {
      state.stats.errors++;
      log.error('Close failed for', id, err);
      dispatchOverlayEvent('overlay:error', { id: id, error: err });
      return false;

    } finally {
      window.requestAnimationFrame(function () {
        state.isClosing = false;
      });
    }
  }


  function closeTop() {
    if (!state.stack.length) return Promise.resolve(false);
    const topId = state.stack[state.stack.length - 1];
    return close(topId);
  }

  async function closeAll() {
    const ids = state.stack.slice().reverse();
    for (let i = 0; i < ids.length; i++) {
      await close(ids[i]);
    }
    return true;
  }

  function isOpen(id) {
    const rec = state.overlays.get(id);
    return !!(rec && rec.isOpen);
  }

  function getStack() {
    return state.stack.slice();
  }

  function getStats() {
    return {
      version: VERSION,
      totalOpened: state.stats.totalOpened,
      totalClosed: state.stats.totalClosed,
      errors: state.stats.errors,
      openCount: state.stack.length,
      registered: state.overlays.size,
      stack: state.stack.slice(),
      storageAvailable: storage.available,
      supportsInert: ENV.supportsInert,
      supportsWAAPI: ENV.supportsWAAPI,
      reducedMotion: ENV.reducedMotion,
      /* ⚡ TTL-aware flags */
      noticeOptOut: storage.isFlagValid(CONFIG.NOTICE.OPTOUT_KEY, CONFIG.NOTICE.OPTOUT_TTL_MS),
      prizeOptOut: storage.isFlagValid(CONFIG.PRIZE.OPTOUT_KEY, CONFIG.PRIZE.OPTOUT_TTL_MS),
      noticeTTLRemaining: Math.round(storage.getRemainingTTL(CONFIG.NOTICE.OPTOUT_KEY) / 1000),
      prizeTTLRemaining: Math.round(storage.getRemainingTTL(CONFIG.PRIZE.OPTOUT_KEY) / 1000),
    };
  }


  /* ============================================================
     17. NOTICE / PRIZE OPT-OUT HANDLERS (TTL-Aware)
     ============================================================ */

  function readOptOut(record, selector) {
    if (!record || !record.root) return false;
    const checkbox = record.root.querySelector(selector);
    if (!checkbox) return false;
    return !!checkbox.checked;
  }

  function resetOptOut(record, selector) {
    if (!record || !record.root) return;
    const checkbox = record.root.querySelector(selector);
    if (checkbox) checkbox.checked = false;
  }


  /* ============================================================
     18. PRE-OPEN HOOKS
     ============================================================ */

  function setupHooks() {

    /* Sheet: all classes */
    const sheetAll = state.overlays.get('sheet-all-classes');
    if (sheetAll) {
      sheetAll.onBeforeOpen = function () {
        const render = window.MissMathRender;
        if (render && typeof render.renderAllClassesSheet === 'function') {
          safeCall(render.renderAllClassesSheet, [], render);
        }
      };
    }

    /* Panel: class detail */
    const panelDetail = state.overlays.get('panel-class-detail');
    if (panelDetail) {
      panelDetail.onBeforeOpen = function (options) {
        const classId = options && options.classId;
        if (!classId) {
          log.warn('panel-class-detail opened without classId');
          return;
        }

        const render = window.MissMathRender;
        if (render && typeof render.renderClassDetail === 'function') {
          safeCall(render.renderClassDetail, [classId], render);
        }
      };
    }

    /* Modal: register */
    const modalRegister = state.overlays.get('modal-register');
    if (modalRegister) {
      modalRegister.onBeforeOpen = function (options) {
        const form = window.MissMathForm;
        if (form && typeof form.render === 'function') {
          safeCall(form.render, [options || {}], form);
        } else {
          const body = document.getElementById('modal-register-body');
          if (body) body.textContent = 'فرم در حال آماده‌سازی است…';
        }
      };

      modalRegister.onAfterClose = function () {
        const form = window.MissMathForm;
        if (form && typeof form.reset === 'function') {
          safeCall(form.reset, [], form);
        }
      };
    }

    /* Modal: welcome notice — with TTL */
    const modalNotice = state.overlays.get('modal-notice');
    if (modalNotice) {
      modalNotice.onBeforeOpen = function () {
        resetOptOut(modalNotice, CONFIG.NOTICE.OPTOUT_SELECTOR);
      };

      modalNotice.onBeforeClose = function () {
        const optedOut = readOptOut(modalNotice, CONFIG.NOTICE.OPTOUT_SELECTOR);
        if (optedOut) {
          /* ⚡ NEW: save with timestamp (TTL-aware) */
          storage.setFlagWithTTL(CONFIG.NOTICE.OPTOUT_KEY);
          log.debug('Notice opt-out saved (TTL: 24h)');
        } else {
          storage.remove(CONFIG.NOTICE.OPTOUT_KEY);
        }
      };

      modalNotice.onAfterClose = function () {
        schedulePrizeAfterNotice();
      };
    }

    /* Modal: prize — with TTL */
    const modalPrize = state.overlays.get('modal-prize');
    if (modalPrize) {
      modalPrize.onBeforeOpen = function () {
        resetOptOut(modalPrize, CONFIG.PRIZE.OPTOUT_SELECTOR);
      };

      modalPrize.onBeforeClose = function () {
        const optedOut = readOptOut(modalPrize, CONFIG.PRIZE.OPTOUT_SELECTOR);
        if (optedOut) {
          /* ⚡ NEW: save with timestamp (TTL-aware) */
          storage.setFlagWithTTL(CONFIG.PRIZE.OPTOUT_KEY);
          log.debug('Prize opt-out saved (TTL: 24h)');
        } else {
          storage.remove(CONFIG.PRIZE.OPTOUT_KEY);
        }
      };
    }
  }


  /* ============================================================
     19. WELCOME NOTICE SCHEDULING (TTL-Aware)
     ============================================================ */

  function scheduleWelcomeNotice() {
    if (!CONFIG.NOTICE.ENABLED) return;

    const record = state.overlays.get('modal-notice');
    if (!record) return;

    /* ⚡ Check with TTL */
    const stillOptedOut = storage.isFlagValid(
      CONFIG.NOTICE.OPTOUT_KEY,
      CONFIG.NOTICE.OPTOUT_TTL_MS
    );

    if (stillOptedOut) {
      log.debug('Notice opted out (still within TTL) — skipping');
      schedulePrizeFallback();
      return;
    }

    state.noticeTimer = window.setTimeout(function () {
      if (state.stack.length === 0) {
        open('modal-notice');
      }
    }, CONFIG.NOTICE.SHOW_DELAY_MS);
  }

  function cancelNotice() {
    if (state.noticeTimer) {
      window.clearTimeout(state.noticeTimer);
      state.noticeTimer = null;
    }
  }


  /* ============================================================
     20. PRIZE SCHEDULING (TTL-Aware)
     ============================================================ */

  function schedulePrizeAfterNotice() {
    if (!CONFIG.PRIZE.ENABLED) return;

    const stillOptedOut = storage.isFlagValid(
      CONFIG.PRIZE.OPTOUT_KEY,
      CONFIG.PRIZE.OPTOUT_TTL_MS
    );

    if (stillOptedOut) {
      log.debug('Prize opted out (still within TTL) — skipping');
      return;
    }

    cancelPrize();

    state.prizeTimer = window.setTimeout(function () {
      if (state.stack.length === 0) {
        open('modal-prize');
      }
    }, CONFIG.PRIZE.SHOW_DELAY_MS);
  }

  function schedulePrizeFallback() {
    if (!CONFIG.PRIZE.ENABLED) return;

    const stillOptedOut = storage.isFlagValid(
      CONFIG.PRIZE.OPTOUT_KEY,
      CONFIG.PRIZE.OPTOUT_TTL_MS
    );

    if (stillOptedOut) {
      log.debug('Prize opted out (fallback) — skipping');
      return;
    }

    cancelPrize();

    state.prizeTimer = window.setTimeout(function () {
      if (state.stack.length === 0) {
        open('modal-prize');
      }
    }, CONFIG.PRIZE.FALLBACK_DELAY_MS);
  }

  function cancelPrize() {
    if (state.prizeTimer) {
      window.clearTimeout(state.prizeTimer);
      state.prizeTimer = null;
    }
  }


  /* ============================================================
     21. CLICK DELEGATION
     ============================================================ */

  function onDocumentClick(e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target;
    if (!target || typeof target.closest !== 'function') return;

    /* STEP 1 — OPEN ACTIONS (checked BEFORE close triggers) */

    /* About the creator */
    if (target.closest('[data-action="open-creator"]')) {
      e.preventDefault();
      e.stopPropagation();
      log.debug('Opening creator modal');
      open('modal-creator');
      return;
    }

    /* Support */
    if (target.closest('[data-action="open-support"]')) {
      e.preventDefault();
      openSupport();
      return;
    }

    /* Open all classes sheet */
    if (target.closest('#open-all-classes') || target.closest('#float-cta')) {
      e.preventDefault();
      open('sheet-all-classes');
      return;
    }

    /* Register button in panel */
    const registerBtn = target.closest('#panel-register-btn');
    if (registerBtn) {
      const panel = document.getElementById('panel-class-detail');
      if (!panel) return;

      const classId = panel.dataset.classId || '';
      const classCode = panel.dataset.classCode || '';
      const classTitle = panel.dataset.classTitle || '';

      e.preventDefault();
      open('modal-register', {
        classId: classId,
        classCode: classCode,
        classTitle: classTitle,
      });
      return;
    }

    /* Class card → detail panel */
    const card = target.closest('.class-card[data-class-id]');
    if (card) {
      if (card.classList.contains('class-card--skeleton')) return;
      if (card.classList.contains('is-coming-soon')) return;

      const classId = card.getAttribute('data-class-id');
      const data = window.MissMathData;
      if (data && Array.isArray(data.CLASSES)) {
        const exists = data.CLASSES.some(function (c) { return c.id === classId; });
        if (!exists) {
          log.warn('Unknown classId:', classId);
          return;
        }
      }

      e.preventDefault();
      open('panel-class-detail', { classId: classId });
      return;
    }

    /* STEP 2 — CLOSE TRIGGERS */

    const closeTrigger = target.closest('[data-close]');
    if (closeTrigger) {
      const closeId = closeTrigger.getAttribute('data-close');

      if (closeId && CONFIG.EXCLUDED_CLOSE_IDS.has(closeId)) {
        log.debug('Skipping close trigger for excluded ID:', closeId);
      } else if (closeId && state.overlays.has(closeId)) {
        e.preventDefault();
        close(closeId);
        return;
      }
    }
  }


  /* ============================================================
     22. KEYBOARD HANDLER
     ============================================================ */

  function onDocumentKeydown(e) {
    if (!state.stack.length) return;

    const topId = state.stack[state.stack.length - 1];
    const top = state.overlays.get(topId);
    if (!top) return;

    if (e.key === CONFIG.KEYS.ESCAPE) {
      e.preventDefault();
      close(topId);
      return;
    }

    if (CONFIG.FOCUS.TRAP_ON_TAB && e.key === CONFIG.KEYS.TAB) {
      FocusManager.trap(top, e);
    }
  }


  /* ============================================================
     23. SUPPORT ACTION
     ============================================================ */

  function openSupport() {
    const data = window.MissMathData;
    if (!data || !data.SITE_CONFIG || !data.SITE_CONFIG.contact) {
      log.warn('Missing contact data for support action');
      return false;
    }

    const raw =
      data.SITE_CONFIG.contact.phone ||
      data.SITE_CONFIG.contact.whatsapp ||
      '';

    const digits = String(raw).replace(/\D/g, '');
    if (!digits || digits.length < 8) {
      log.warn('Invalid phone number for support action');
      return false;
    }

    const telNumber = buildTelNumber(digits);

    const isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini|IEMobile/i
      .test(navigator.userAgent || '');

    triggerTel(telNumber);

    if (!isMobile) {
      const display = formatPhoneForDisplay(digits);
      showPhoneToast(display);
    }

    log.debug('Support → tel:', telNumber, '| mobile:', isMobile);
    return true;
  }


  function buildTelNumber(digits) {
    let d = String(digits);

    if (d.startsWith('00')) return '+' + d.slice(2);
    if (d.startsWith('98')) return '+' + d;
    if (d.startsWith('0')) return '+98' + d.slice(1);
    return '+98' + d;
  }

  function formatPhoneForDisplay(digits) {
    const d = String(digits).replace(/\D/g, '');
    if (d.startsWith('98') && d.length >= 12) {
      const rest = d.slice(2);
      return '+98 ' + rest.slice(0, 3) + ' ' + rest.slice(3, 6) + ' ' + rest.slice(6);
    }
    if (d.startsWith('0')) {
      return d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7);
    }
    return d;
  }

  function triggerTel(telNumber) {
    try {
      const a = document.createElement('a');
      a.href = 'tel:' + telNumber;
      a.style.display = 'none';
      a.setAttribute('aria-hidden', 'true');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      log.warn('tel: trigger failed, falling back to location.href', err);
      try { window.location.href = 'tel:' + telNumber; } catch (e) { }
    }
  }

  function showPhoneToast(display) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    while (toast.firstChild) toast.removeChild(toast.firstChild);

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 ' +
      '19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 ' +
      '.7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 ' +
      '12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>' +
      '</svg>';

    const wrap = document.createElement('span');
    wrap.className = 'toast__content';
    const label = document.createElement('span');
    label.textContent = 'شماره تماس: ';
    const number = document.createElement('strong');
    number.textContent = display;
    number.dir = 'ltr';
    number.style.fontWeight = '900';
    number.style.letterSpacing = '0.02em';
    wrap.appendChild(label);
    wrap.appendChild(number);

    toast.appendChild(icon);
    toast.appendChild(wrap);

    toast.setAttribute('data-variant', 'info');
    toast.hidden = false;
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    if (showPhoneToast._timer) clearTimeout(showPhoneToast._timer);
    showPhoneToast._timer = setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () {
        if (!toast.classList.contains('is-visible')) {
          toast.hidden = true;
        }
      }, 320);
    }, CONFIG.TOAST.PHONE_DISPLAY_DURATION);
  }


  /* ============================================================
     24. INIT
     ============================================================ */

  function init() {
    if (state.initialised) return;
    state.initialised = true;

    const roots = document.querySelectorAll('.sheet, .panel, .modal');
    roots.forEach(function (root) { registerOverlay(root); });

    log.debug('Registered overlays:', state.overlays.size);

    setupHooks();

    document.addEventListener('click', onDocumentClick, false);
    document.addEventListener('keydown', onDocumentKeydown, false);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        cancelNotice();
        cancelPrize();
      }
    });

    scheduleWelcomeNotice();

    document.body.classList.add('modal-ready');
    document.body.setAttribute('data-modal-version', VERSION);

    log.debug('Initialised v' + VERSION);
  }


  /* ============================================================
     25. RESET ONBOARDING
     ============================================================ */

  function resetOnboarding() {
    storage.remove(CONFIG.NOTICE.OPTOUT_KEY);
    storage.remove(CONFIG.PRIZE.OPTOUT_KEY);
    /* Legacy keys cleanup */
    try {
      window.localStorage.removeItem('miss-math:notice-optout:v1');
      window.localStorage.removeItem('miss-math:prize-optout:v1');
    } catch (e) { }
    cancelNotice();
    cancelPrize();
    log.debug('Onboarding reset');
    return true;
  }


  /* ============================================================
     26. PUBLIC API
     ============================================================ */

  const API = {
    version: VERSION,
    open: open,
    close: close,
    closeTop: closeTop,
    closeAll: closeAll,
    isOpen: isOpen,
    getStack: getStack,
    getStats: getStats,
    resetOnboarding: resetOnboarding,
    support: openSupport,
    config: Object.freeze(Object.assign({}, CONFIG)),
  };

  Object.defineProperty(window, 'MissMathModal', {
    value: Object.freeze(API),
    writable: false,
    configurable: false,
    enumerable: false,
  });


  /* ============================================================
     27. BOOT
     ============================================================ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }


  /* ============================================================
     28. CLEANUP
     ============================================================ */

  window.addEventListener('pagehide', function () {
    cancelNotice();
    cancelPrize();
  }, { once: true });


  /* ============================================================
     29. END
     ============================================================ */

})();