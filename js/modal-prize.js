/* ============================================================
   modal-prize.js
   Miss Math — Prize Modal Controller
   فاز ۳ — نسخه جامع v3.0.0

   ─── OVERVIEW ─────────────────────────────────────────────
   Advanced typewriter engine + prize modal orchestrator.
   Handles every aspect of the prize modal EXCEPT scheduling
   and opt-out (which are delegated to modal.js).

   ─── ARCHITECTURE ─────────────────────────────────────────
   ┌──────────────────────────────────────────────────────┐
   │  1. StateMachine  →  explicit state transitions      │
   │  2. Typewriter    →  character-by-character engine   │
   │  3. Celebrator    →  confetti + completion effects   │
   │  4. Analytics     →  event & metric collection       │
   │  5. DebugOverlay  →  on-screen state inspection      │
   │  6. Recorder      →  last N session events           │
   └──────────────────────────────────────────────────────┘

   ─── PUBLIC API ───────────────────────────────────────────
   window.MissMathPrize.start()         — start typing now
   window.MissMathPrize.stop()          — stop typing
   window.MissMathPrize.skip()          — reveal all text
   window.MissMathPrize.reset()         — full reset
   window.MissMathPrize.celebrate()     — trigger celebration
   window.MissMathPrize.getState()      — state snapshot
   window.MissMathPrize.getAnalytics()  — collected metrics
   window.MissMathPrize.getHistory()    — recent events
   window.MissMathPrize.profile('slow') — switch typing profile
   window.MissMathPrize.debug(true)     — show debug overlay

   ─── EVENTS EMITTED ───────────────────────────────────────
   prize:state-change  { from, to }
   prize:opened        { }
   prize:started       { profile, text, expectedDuration }
   prize:char          { index, char, elapsed }
   prize:paused        { reason, atIndex }
   prize:resumed       { atIndex }
   prize:skipped       { reason, atIndex, elapsed }
   prize:typed         { duration, chars, skipped, reason }
   prize:celebrated    { }
   prize:closed        { }
   prize:error         { context, error }
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     0. GUARDS
     ============================================================ */

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (window.__MissMathPrizeLoaded) return;
  window.__MissMathPrizeLoaded = true;


  /* ============================================================
     1. VERSION
     ============================================================ */

  const VERSION = '3.0.0';
  const BUILD   = '1403.07';


  /* ============================================================
     2. CONFIG
     ============================================================ */

  const CONFIG = {

    VERSION: VERSION,
    BUILD:   BUILD,

    /* ─── Timing ─────────────────────────────────────────── */
    TIMING: {
      /* Delay before typing begins after modal is fully open */
      START_DELAY: 820,

      /* Per-character base delay (ms) */
      CHAR_DELAY: 68,

      /* Jitter range — random ±this from base (ms) */
      CHAR_JITTER: 18,

      /* Punctuation pause on top of base (ms) */
      PUNCT_PAUSE: 200,

      /* Delay for whitespace (space, tab) */
      SPACE_PAUSE: 40,

      /* Delay for uppercase letters (dramatic effect) */
      UPPER_DELAY: 30,

      /* Delay before hiding caret after typing done */
      CARET_HIDE_DELAY: 1500,

      /* Delay before celebration starts (after typing) */
      CELEBRATION_DELAY: 380,

      /* Celebration duration */
      CELEBRATION_DURATION: 2200,

      /* Delay before reset on re-open */
      RESET_DELAY: 120,

      /* Debounce for resize */
      RESIZE_DEBOUNCE: 180,

      /* Minimum interval between skip presses */
      SKIP_COOLDOWN: 220,
    },

    /* ─── Character classification ──────────────────────── */
    CHARS: {
      PUNCTUATION: ['!', '؟', '?', '.', '،', ':', '؛', ',', ';'],
      WHITESPACE:  [' ', '\t', '\n'],
      UPPERCASE:   'A-Z',
      DIGITS:      '0-9',
      MARKERS:     ['"', "'", '«', '»', '(', ')', '[', ']', '—', '–', '…'],
    },

    /* ─── Typing Profiles ───────────────────────────────── */
    PROFILES: {
      fast:     { charDelay: 42,  jitter: 10, punctPause: 130, startDelay: 500  },
      normal:   { charDelay: 68,  jitter: 18, punctPause: 200, startDelay: 820  },
      slow:     { charDelay: 110, jitter: 28, punctPause: 280, startDelay: 1100 },
      dramatic: { charDelay: 145, jitter: 40, punctPause: 360, startDelay: 1400 },
    },
    DEFAULT_PROFILE: 'normal',

    /* ─── Reduced motion levels ─────────────────────────── */
    REDUCED_MOTION_LEVELS: {
      NONE:    'none',      /* full animation */
      PARTIAL: 'partial',   /* no jitter, no celebration */
      MINIMAL: 'minimal',   /* typing but no caret */
      FULL:    'full',      /* instant text */
    },

    /* ─── Selectors ─────────────────────────────────────── */
    SELECTORS: {
      MODAL:       'modal-prize',
      TYPEWRITER:  'prize-typewriter',
      CARET:       '.typewriter__caret',
      TICKET:      'prize-ticket',
      TITLE:       'modal-prize-title',
      CELEBRATION: 'prize-celebration',
    },

    /* ─── Keyboard skip keys ───────────────────────────── */
    SKIP_KEYS: ['Enter', ' ', 'Spacebar'],

    /* ─── Accessibility ─────────────────────────────────── */
    A11Y: {
      /* Announce typing progress every N chars to SR */
      ANNOUNCE_EVERY: 4,
      /* Live region ID */
      LIVE_ID: 'miss-math-prize-live',
      /* Screen-reader text */
      SR_TYPING_START: 'در حال نمایش متن پیشنهاد ویژه',
      SR_TYPING_SKIP:  'متن به صورت کامل نمایش داده شد',
      SR_CELEBRATION:  'جشن پیشنهاد ویژه',
    },

    /* ─── Analytics ─────────────────────────────────────── */
    ANALYTICS: {
      ENABLED: true,
      MAX_HISTORY: 50,
    },

    /* ─── Debug ─────────────────────────────────────────── */
    DEBUG: false,
    DEBUG_QUERY_PARAM: 'prize-debug',

    /* ─── State machine ─────────────────────────────────── */
    STATES: {
      IDLE:         'idle',
      PREPARING:    'preparing',
      TYPING:       'typing',
      PAUSED:       'paused',
      SKIPPING:     'skipping',
      COMPLETING:   'completing',
      CELEBRATING:  'celebrating',
      CLOSING:      'closing',
      RESETTING:    'resetting',
      ERROR:        'error',
    },

    /* Valid transitions from each state */
    VALID_TRANSITIONS: {
      idle:        ['preparing'],
      preparing:   ['typing', 'skipping', 'error'],
      typing:      ['paused', 'skipping', 'completing', 'closing', 'error'],
      paused:      ['typing', 'skipping', 'closing', 'error'],
      skipping:    ['completing', 'closing', 'error'],
      completing:  ['celebrating', 'closing', 'error'],
      celebrating: ['closing', 'error'],
      closing:     ['resetting', 'error'],
      resetting:   ['idle', 'error'],
      error:       ['resetting', 'idle'],
    },
  };


  /* ============================================================
     3. ENVIRONMENT DETECTION
     ============================================================ */

  const ENV = (function () {
    const mq = function (q) {
      if (!window.matchMedia) return false;
      try { return window.matchMedia(q).matches; } catch (e) { return false; }
    };

    /* Determine reduced-motion level */
    const reducedLevel = (function () {
      const L = CONFIG.REDUCED_MOTION_LEVELS;
      if (mq('(prefers-reduced-motion: reduce)')) return L.FULL;
      if (mq('(prefers-reduced-motion: minimal)')) return L.MINIMAL;
      if (mq('(prefers-reduced-motion: partial)')) return L.PARTIAL;
      return L.NONE;
    })();

    return {
      reducedMotion:     reducedLevel !== CONFIG.REDUCED_MOTION_LEVELS.NONE,
      reducedLevel:      reducedLevel,
      isTouch:           mq('(hover: none) and (pointer: coarse)'),
      isMobile:          mq('(max-width: 640px)'),
      supportsRAF:       typeof window.requestAnimationFrame === 'function',
      supportsPerf:      typeof window.performance !== 'undefined'
                         && typeof window.performance.now === 'function',
      supportsCAF:       typeof window.cancelAnimationFrame === 'function',
    };
  })();


  /* ============================================================
     4. UTILITIES
     ============================================================ */

  const util = {

    now: function () {
      return ENV.supportsPerf ? performance.now() : Date.now();
    },

    /* Random jitter within ±range */
    jitter: function (range) {
      if (ENV.reducedLevel === CONFIG.REDUCED_MOTION_LEVELS.PARTIAL ||
          ENV.reducedLevel === CONFIG.REDUCED_MOTION_LEVELS.MINIMAL ||
          ENV.reducedLevel === CONFIG.REDUCED_MOTION_LEVELS.FULL) {
        return 0;
      }
      return Math.round((Math.random() * 2 - 1) * range);
    },

    /* Debounce */
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

    /* Match a character against a class */
    isPunctuation: function (ch) {
      return CONFIG.CHARS.PUNCTUATION.indexOf(ch) !== -1;
    },

    isWhitespace: function (ch) {
      return CONFIG.CHARS.WHITESPACE.indexOf(ch) !== -1;
    },

    isUppercase: function (ch) {
      return /[A-Z]/.test(ch);
    },

    isDigit: function (ch) {
      return /[0-9]/.test(ch);
    },

    isMarker: function (ch) {
      return CONFIG.CHARS.MARKERS.indexOf(ch) !== -1;
    },

    isEmoji: function (ch) {
      return /\p{Emoji}/u ? /\p{Emoji}/u.test(ch) : /[\u{1F300}-\u{1FAFF}]/u.test(ch);
    },

    /* Safe string */
    safeString: function (v) {
      return (v === null || v === undefined) ? '' : String(v);
    },

    /* Clamp */
    clamp: function (n, min, max) {
      return Math.max(min, Math.min(max, n));
    },

    /* Format ms → human */
    formatMs: function (ms) {
      if (ms < 1000) return Math.round(ms) + 'ms';
      return (Math.round(ms / 100) / 10) + 's';
    },
  };


  /* ============================================================
     5. LOGGER
     ============================================================ */

  const log = (function () {
    const prefix = '[modal-prize]';

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
      debug: CONFIG.DEBUG ? safeConsole('log')   : function () {},
      info:  safeConsole('info'),
      warn:  safeConsole('warn'),
      error: safeConsole('error'),
    };
  })();


  /* ============================================================
     6. EVENT BUS (emit + subscribe)
     ============================================================ */

  const Bus = (function () {

    const listeners = new Map();

    function emit(name, detail) {
      /* Local listeners */
      if (listeners.has(name)) {
        const fns = listeners.get(name).slice();
        fns.forEach(function (fn) {
          try { fn(detail || {}); } catch (err) {
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
      } catch (err) {
        log.warn('Emit failed:', name, err);
      }
    }

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

    function clear() {
      listeners.clear();
    }

    return { emit: emit, on: on, clear: clear };
  })();


  /* ============================================================
     7. ANALYTICS
     ─── Collects metrics & history
     ============================================================ */

  const Analytics = (function () {

    const metrics = {
      openCount:         0,
      completedCount:    0,
      skippedCount:      0,
      skippedReasons:    {},
      totalTypingTime:   0,
      fastestTypingTime: Infinity,
      slowestTypingTime: 0,
      averageTypingTime: 0,
      errorsCount:       0,
      celebrationCount:  0,
    };

    const history = [];

    function record(eventName, detail) {
      if (!CONFIG.ANALYTICS.ENABLED) return;

      const entry = {
        t:      Date.now(),
        name:   eventName,
        detail: detail || {},
      };

      history.push(entry);

      /* Trim */
      if (history.length > CONFIG.ANALYTICS.MAX_HISTORY) {
        history.shift();
      }
    }

    function trackOpen() {
      metrics.openCount++;
      record('open', {});
    }

    function trackComplete(duration) {
      metrics.completedCount++;
      metrics.totalTypingTime += duration;
      metrics.fastestTypingTime = Math.min(metrics.fastestTypingTime, duration);
      metrics.slowestTypingTime = Math.max(metrics.slowestTypingTime, duration);
      metrics.averageTypingTime = Math.round(
        metrics.totalTypingTime / metrics.completedCount
      );
      record('complete', { duration: duration });
    }

    function trackSkip(reason, atIndex) {
      metrics.skippedCount++;
      const r = String(reason || 'unknown');
      metrics.skippedReasons[r] = (metrics.skippedReasons[r] || 0) + 1;
      record('skip', { reason: r, atIndex: atIndex });
    }

    function trackCelebration() {
      metrics.celebrationCount++;
      record('celebration', {});
    }

    function trackError(context, err) {
      metrics.errorsCount++;
      record('error', {
        context: context,
        message: err && err.message ? err.message : String(err),
      });
    }

    function getMetrics() {
      const m = Object.assign({}, metrics);
      if (m.fastestTypingTime === Infinity) m.fastestTypingTime = 0;
      return m;
    }

    function getHistory() {
      return history.slice();
    }

    function reset() {
      metrics.openCount = 0;
      metrics.completedCount = 0;
      metrics.skippedCount = 0;
      metrics.skippedReasons = {};
      metrics.totalTypingTime = 0;
      metrics.fastestTypingTime = Infinity;
      metrics.slowestTypingTime = 0;
      metrics.averageTypingTime = 0;
      metrics.errorsCount = 0;
      metrics.celebrationCount = 0;
      history.length = 0;
    }

    return {
      trackOpen:        trackOpen,
      trackComplete:    trackComplete,
      trackSkip:        trackSkip,
      trackCelebration: trackCelebration,
      trackError:       trackError,
      getMetrics:       getMetrics,
      getHistory:       getHistory,
      reset:            reset,
    };
  })();


  /* ============================================================
     8. STATE MACHINE
     ─── Explicit transitions with validation
     ============================================================ */

  const StateMachine = (function () {

    let current = CONFIG.STATES.IDLE;
    let previous = null;
    let stateEnteredAt = util.now();
    const stateHistory = [];

    function canTransition(to) {
      const allowed = CONFIG.VALID_TRANSITIONS[current] || [];
      return allowed.indexOf(to) !== -1;
    }

    function transition(to, meta) {
      if (current === to) {
        return true;
      }

      if (!canTransition(to)) {
        log.warn('Invalid transition:', current, '→', to);
        return false;
      }

      previous = current;
      current = to;
      const enteredAt = util.now();
      const elapsed = enteredAt - stateEnteredAt;
      stateEnteredAt = enteredAt;

      const entry = {
        from: previous,
        to: current,
        at: enteredAt,
        durationInPrev: elapsed,
        meta: meta || {},
      };

      stateHistory.push(entry);
      if (stateHistory.length > 30) stateHistory.shift();

      Bus.emit('prize:state-change', {
        from: previous,
        to: current,
        durationInPrev: elapsed,
        meta: meta || {},
      });

      log.debug('State:', previous, '→', current, '(' + util.formatMs(elapsed) + ')');
      return true;
    }

    function get() {
      return current;
    }

    function getPrevious() {
      return previous;
    }

    function timeInState() {
      return util.now() - stateEnteredAt;
    }

    function is(state) {
      return current === state;
    }

    function isAny(states) {
      return states.indexOf(current) !== -1;
    }

    function getHistory() {
      return stateHistory.slice();
    }

    function forceReset() {
      current = CONFIG.STATES.IDLE;
      previous = null;
      stateEnteredAt = util.now();
      stateHistory.length = 0;
    }

    return {
      transition:   transition,
      canTransition: canTransition,
      get:          get,
      getPrevious:  getPrevious,
      timeInState:  timeInState,
      is:           is,
      isAny:        isAny,
      getHistory:   getHistory,
      forceReset:   forceReset,
    };
  })();


  /* ============================================================
     9. ARIA LIVE ANNOUNCER
     ============================================================ */

  const Announcer = (function () {
    let regionEl = null;
    let lastAnnouncement = '';
    let lastAnnouncementTime = 0;

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

    function announce(message, force) {
      if (!message) return;
      const now = util.now();

      /* Throttle: don't spam same message within 500ms */
      if (!force &&
          message === lastAnnouncement &&
          now - lastAnnouncementTime < 500) {
        return;
      }

      const el = ensure();
      el.textContent = '';
      window.setTimeout(function () {
        el.textContent = String(message);
      }, 30);

      lastAnnouncement = message;
      lastAnnouncementTime = now;
    }

    return { announce: announce };
  })();


  /* ============================================================
     10. TYPEWRITER ENGINE
     ─── The heart of the module
     ============================================================ */

  const Typewriter = (function () {

    /* Current run configuration */
    let profile = CONFIG.DEFAULT_PROFILE;
    let profileCfg = CONFIG.PROFILES[profile];

    /* Runtime data */
    let text = '';
    let index = 0;
    let timer = null;
    let caretTimer = null;
    let active = false;
    let startedAt = 0;
    let finishedAt = 0;
    let skipReason = null;
    let pauseReason = null;
    let charCounters = { punct: 0, space: 0, upper: 0, digit: 0, marker: 0, emoji: 0 };

    /* DOM refs */
    let el = null;
    let caret = null;

    /* ─── Timer management ─────────────────────────────── */

    function clearTimers() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (caretTimer) {
        clearTimeout(caretTimer);
        caretTimer = null;
      }
    }

    /* ─── Caret ─────────────────────────────────────────── */

    function showCaret() {
      if (!caret) return;
      if (ENV.reducedLevel === CONFIG.REDUCED_MOTION_LEVELS.MINIMAL ||
          ENV.reducedLevel === CONFIG.REDUCED_MOTION_LEVELS.FULL) {
        return;
      }
      caret.classList.remove('is-hidden');
      caret.removeAttribute('aria-hidden');
    }

    function hideCaret() {
      if (!caret) return;
      caret.classList.add('is-hidden');
      caret.setAttribute('aria-hidden', 'true');
    }

    function scheduleCaretHide() {
      if (caretTimer) clearTimeout(caretTimer);
      caretTimer = setTimeout(hideCaret, CONFIG.TIMING.CARET_HIDE_DELAY);
    }

    /* ─── Speed calculation ─────────────────────────────── */

    function baseDelayFor(ch) {
      let delay = profileCfg.charDelay;

      /* Character-specific adjustments */
      if (util.isPunctuation(ch)) {
        delay += profileCfg.punctPause;
      } else if (util.isWhitespace(ch)) {
        delay += CONFIG.TIMING.SPACE_PAUSE;
      } else if (util.isUppercase(ch)) {
        delay += CONFIG.TIMING.UPPER_DELAY;
      } else if (util.isEmoji(ch)) {
        delay += profileCfg.punctPause;
      }

      /* Jitter for natural feel */
      delay += util.jitter(profileCfg.jitter);

      /* Clamp to sane range */
      return util.clamp(delay, 10, 800);
    }

    /* ─── Reset ─────────────────────────────────────────── */

    function reset() {
      clearTimers();
      active = false;
      index = 0;
      text = '';
      startedAt = 0;
      finishedAt = 0;
      skipReason = null;
      pauseReason = null;
      charCounters = { punct: 0, space: 0, upper: 0, digit: 0, marker: 0, emoji: 0 };
    }

    function stop() {
      clearTimers();
      active = false;
    }

    /* ─── Full reveal ──────────────────────────────────── */

    function showFull(reason) {
      if (!el) return false;

      clearTimers();

      el.textContent = text;
      index = text.length;
      active = false;
      finishedAt = util.now();
      skipReason = reason || 'manual';

      scheduleCaretHide();

      Bus.emit('prize:skipped', {
        reason: skipReason,
        atIndex: index,
        elapsed: Math.round(finishedAt - startedAt),
      });

      Analytics.trackSkip(skipReason, index);

      Bus.emit('prize:typed', {
        duration: Math.round(finishedAt - startedAt),
        chars: text.length,
        skipped: true,
        reason: skipReason,
      });

      log.debug('Typing skipped:', skipReason);
      return true;
    }

    /* ─── One step ──────────────────────────────────────── */

    function step() {
      if (!el || !active) return;

      const total = text.length;

      /* Done */
      if (index >= total) {
        active = false;
        timer = null;
        finishedAt = util.now();

        scheduleCaretHide();

        const duration = Math.round(finishedAt - startedAt);

        Analytics.trackComplete(duration);

        Bus.emit('prize:typed', {
          duration: duration,
          chars: total,
          skipped: false,
          counters: Object.assign({}, charCounters),
        });

        StateMachine.transition(CONFIG.STATES.COMPLETING, {
          duration: duration,
          chars: total,
        });

        /* Celebrate if configured */
        if (ENV.reducedLevel === CONFIG.REDUCED_MOTION_LEVELS.NONE) {
          setTimeout(function () {
            if (StateMachine.is(CONFIG.STATES.COMPLETING) ||
                StateMachine.is(CONFIG.STATES.CELEBRATING)) {
              Celebrator.fire();
            }
          }, CONFIG.TIMING.CELEBRATION_DELAY);
        }

        log.debug('Typing finished in', util.formatMs(duration));
        return;
      }

      /* Append next character */
      const ch = text.charAt(index);
      el.textContent += ch;

      /* Classify */
      if (util.isPunctuation(ch)) charCounters.punct++;
      else if (util.isWhitespace(ch)) charCounters.space++;
      else if (util.isUppercase(ch)) charCounters.upper++;
      else if (util.isDigit(ch)) charCounters.digit++;
      else if (util.isMarker(ch)) charCounters.marker++;
      else if (util.isEmoji(ch)) charCounters.emoji++;

      index++;

      Bus.emit('prize:char', {
        index: index,
        char: ch,
        total: total,
        elapsed: Math.round(util.now() - startedAt),
      });

      /* SR progress announcements */
      if (index > 0 && index % CONFIG.A11Y.ANNOUNCE_EVERY === 0) {
        /* Only announce near milestones, not every char */
        if (index === Math.floor(total / 2)) {
          Announcer.announce('نیمه متن نمایش داده شد');
        }
      }

      /* Schedule next */
      timer = setTimeout(step, baseDelayFor(ch));
    }

    /* ─── Start ────────────────────────────────────────── */

    function start() {
      try {
        const modal = document.getElementById(CONFIG.SELECTORS.MODAL);
        if (!modal) {
          log.warn('Prize modal not in DOM');
          return false;
        }

        el = document.getElementById(CONFIG.SELECTORS.TYPEWRITER);
        if (!el) {
          log.warn('Typewriter element not found');
          return false;
        }

        caret = modal.querySelector(CONFIG.SELECTORS.CARET);

        /* Read text */
        const raw = el.getAttribute('data-text') || el.textContent || '';
        text = util.safeString(raw).trim();

        if (!text) {
          log.warn('No text to type');
          return false;
        }

        /* Full reset */
        reset();

        /* Reassign after reset */
        el.textContent = '';
        showCaret();

        /* Read fresh text (reset doesn't clear DOM) */
        const rawAgain = document.getElementById(CONFIG.SELECTORS.TYPEWRITER);
        if (rawAgain) el = rawAgain;
        text = util.safeString(el.getAttribute('data-text') || text).trim();

        /* Reduced-motion FULL → instant */
        if (ENV.reducedLevel === CONFIG.REDUCED_MOTION_LEVELS.FULL) {
          showFull('reduced-motion-full');
          return true;
        }

        /* Reduced-motion MINIMAL → show without typing */
        if (ENV.reducedLevel === CONFIG.REDUCED_MOTION_LEVELS.MINIMAL) {
          showFull('reduced-motion-minimal');
          return true;
        }

        /* Start */
        startedAt = util.now();
        active = true;
        index = 0;

        Bus.emit('prize:started', {
          profile: profile,
          text: text,
          expectedDuration: text.length * profileCfg.charDelay,
        });

        Announcer.announce(CONFIG.A11Y.SR_TYPING_START);

        timer = setTimeout(step, profileCfg.startDelay || CONFIG.TIMING.START_DELAY);

        log.debug('Typing started with profile:', profile);
        return true;

      } catch (err) {
        Analytics.trackError('start', err);
        log.error('Start failed:', err);
        StateMachine.transition(CONFIG.STATES.ERROR, { context: 'start' });
        return false;
      }
    }

    /* ─── Pause / Resume ──────────────────────────────── */

    function pause(reason) {
      if (!active) return false;
      clearTimers();
      active = false;
      pauseReason = reason || 'manual';

      Bus.emit('prize:paused', {
        reason: pauseReason,
        atIndex: index,
      });

      StateMachine.transition(CONFIG.STATES.PAUSED, { reason: pauseReason });
      log.debug('Typing paused:', pauseReason);
      return true;
    }

    function resume() {
      if (active) return false;
      if (!el || !text) return false;

      active = true;
      pauseReason = null;

      Bus.emit('prize:resumed', { atIndex: index });
      StateMachine.transition(CONFIG.STATES.TYPING, { from: 'paused' });

      /* Continue from current index */
      const ch = text.charAt(index - 1) || '';
      timer = setTimeout(step, baseDelayFor(ch));

      log.debug('Typing resumed at index', index);
      return true;
    }

    /* ─── Profile switching ──────────────────────────── */

    function setProfile(name) {
      if (!CONFIG.PROFILES[name]) {
        log.warn('Unknown profile:', name);
        return false;
      }
      profile = name;
      profileCfg = CONFIG.PROFILES[name];
      log.debug('Profile switched to:', name);
      return true;
    }

    function getProfile() {
      return profile;
    }

    /* ─── State snapshot ─────────────────────────────── */

    function getState() {
      return {
        active:       active,
        index:        index,
        total:        text.length,
        progress:     text.length ? index / text.length : 0,
        elapsed:      startedAt ? Math.round(util.now() - startedAt) : 0,
        skipped:      !!skipReason,
        skipReason:   skipReason,
        paused:       pauseReason !== null,
        pauseReason:  pauseReason,
        profile:      profile,
        counters:     Object.assign({}, charCounters),
      };
    }

    return {
      start:       start,
      stop:        stop,
      pause:       pause,
      resume:      resume,
      full:        showFull,
      reset:       reset,
      setProfile:  setProfile,
      getProfile:  getProfile,
      getState:    getState,
    };
  })();


  /* ============================================================
     11. CELEBRATOR
     ─── Confetti + visual effects after typing completes
     ============================================================ */

  const Celebrator = (function () {

    let hasFiredThisCycle = false;

    function createConfetti(count) {
      const container = document.createElement('div');
      container.className = 'prize-confetti';
      container.setAttribute('aria-hidden', 'true');

      const colors = ['#DDA83D', '#C68B1E', '#C25E3A', '#2A7A80', '#4F5634', '#EDC77A'];
      const shapes = ['square', 'circle', 'triangle'];

      for (let i = 0; i < count; i++) {
        const piece = document.createElement('span');
        piece.className = 'prize-confetti__piece';
        const color = colors[Math.floor(Math.random() * colors.length)];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        const size = 6 + Math.random() * 8;
        const left = Math.random() * 100;
        const delay = Math.random() * 400;
        const duration = 1800 + Math.random() * 900;
        const rotate = Math.random() * 360;
        const drift = -60 + Math.random() * 120;

        piece.dataset.shape = shape;
        piece.style.cssText =
          'left:' + left + '%;' +
          'width:' + size + 'px;' +
          'height:' + size + 'px;' +
          'background-color:' + color + ';' +
          '--rotate:' + rotate + 'deg;' +
          '--drift:' + drift + 'px;' +
          'animation-delay:' + delay + 'ms;' +
          'animation-duration:' + duration + 'ms;';

        container.appendChild(piece);
      }

      return container;
    }

    function fire() {
      if (hasFiredThisCycle) return false;
      hasFiredThisCycle = true;

      const modal = document.getElementById(CONFIG.SELECTORS.MODAL);
      if (!modal) return false;

      /* Reduced motion check */
      if (ENV.reducedLevel !== CONFIG.REDUCED_MOTION_LEVELS.NONE) {
        return false;
      }

      try {
        const confetti = createConfetti(38);
        modal.appendChild(confetti);

        StateMachine.transition(CONFIG.STATES.CELEBRATING, {});

        Analytics.trackCelebration();

        Bus.emit('prize:celebrated', {
          pieces: 38,
        });

        Announcer.announce(CONFIG.A11Y.SR_CELEBRATION);

        /* Auto-remove */
        setTimeout(function () {
          if (confetti.parentNode) {
            confetti.parentNode.removeChild(confetti);
          }
        }, CONFIG.TIMING.CELEBRATION_DURATION);

        log.debug('Celebration fired');
        return true;

      } catch (err) {
        Analytics.trackError('celebrate', err);
        log.error('Celebration failed:', err);
        return false;
      }
    }

    function reset() {
      hasFiredThisCycle = false;
    }

    return {
      fire:  fire,
      reset: reset,
    };
  })();


  /* ============================================================
     12. FLOW HANDLERS
     ============================================================ */

  function handlePrizeOpened() {
    StateMachine.transition(CONFIG.STATES.PREPARING, { trigger: 'open' });
    Celebrator.reset();

    Analytics.trackOpen();

    Bus.emit('prize:opened', {
      timestamp: Date.now(),
      profile: Typewriter.getProfile(),
    });

    /* Small delay to let modal animation settle */
    setTimeout(function () {
      try {
        const ok = Typewriter.start();
        if (ok) {
          StateMachine.transition(CONFIG.STATES.TYPING, { profile: Typewriter.getProfile() });
        }
      } catch (err) {
        Analytics.trackError('after-open-handler', err);
        log.error('Post-open start failed:', err);
      }
    }, 120);
  }


  function handlePrizeBeforeClose() {
    StateMachine.transition(CONFIG.STATES.CLOSING, {});

    if (Typewriter.getState().active) {
      Typewriter.stop();
      log.debug('Typing cancelled on close');
    }
  }


  function handlePrizeAfterClose() {
    try {
      Typewriter.reset();
      Celebrator.reset();

      Bus.emit('prize:closed', {
        timestamp: Date.now(),
      });

      StateMachine.transition(CONFIG.STATES.RESETTING, {});
      setTimeout(function () {
        StateMachine.transition(CONFIG.STATES.IDLE, { from: 'resetting' });
      }, CONFIG.TIMING.RESET_DELAY);

      log.debug('Prize closed and reset');
    } catch (err) {
      Analytics.trackError('after-close-handler', err);
      log.error('Reset failed:', err);
    }
  }


  /* ============================================================
     13. EVENT BINDINGS
     ============================================================ */

  function bindOverlayEvents() {
    document.addEventListener('overlay:after-open', function (e) {
      const id = e && e.detail && e.detail.id;
      if (id === CONFIG.SELECTORS.MODAL) {
        handlePrizeOpened(e.detail);
      }
    });

    document.addEventListener('overlay:before-close', function (e) {
      const id = e && e.detail && e.detail.id;
      if (id === CONFIG.SELECTORS.MODAL) {
        handlePrizeBeforeClose(e.detail);
      }
    });

    document.addEventListener('overlay:after-close', function (e) {
      const id = e && e.detail && e.detail.id;
      if (id === CONFIG.SELECTORS.MODAL) {
        handlePrizeAfterClose(e.detail);
      }
    });
  }


  /* ============================================================
     14. KEYBOARD SKIP
     ============================================================ */

  let lastSkipAt = 0;

  function bindKeyboard() {
    document.addEventListener('keydown', function (e) {
      /* Only when prize is open */
      if (!window.MissMathModal ||
          typeof window.MissMathModal.isOpen !== 'function') return;
      if (!window.MissMathModal.isOpen(CONFIG.SELECTORS.MODAL)) return;

      /* Ignore combos */
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      /* Only skip keys */
      if (CONFIG.SKIP_KEYS.indexOf(e.key) === -1) return;

      /* Don't hijack interactive */
      const target = e.target;
      if (target && target.closest) {
        const interactive = target.closest(
          'button, a, input, select, textarea, [role="button"]'
        );
        if (interactive) return;
      }

      /* Only if typing active */
      if (!Typewriter.getState().active) return;

      /* Cooldown */
      const now = util.now();
      if (now - lastSkipAt < CONFIG.TIMING.SKIP_COOLDOWN) return;
      lastSkipAt = now;

      e.preventDefault();
      StateMachine.transition(CONFIG.STATES.SKIPPING, { trigger: 'keyboard' });
      Typewriter.full('keyboard');
    });
  }


  /* ============================================================
     15. CLICK-TO-SKIP
     ─── Clicking on the typewriter area skips typing
     ============================================================ */

  function bindClickSkip() {
    document.addEventListener('click', function (e) {
      const modal = document.getElementById(CONFIG.SELECTORS.MODAL);
      if (!modal || modal.hidden) return;

      if (!Typewriter.getState().active) return;

      /* Don't hijack clicks on buttons/links */
      const target = e.target;
      if (!target || !target.closest) return;
      if (target.closest('button, a, input, select, textarea, [role="button"]')) return;

      /* Only within the ticket area */
      const ticket = target.closest('.prize-ticket__title, .typewriter, .prize-ticket__main');
      if (!ticket) return;

      const now = util.now();
      if (now - lastSkipAt < CONFIG.TIMING.SKIP_COOLDOWN) return;
      lastSkipAt = now;

      StateMachine.transition(CONFIG.STATES.SKIPPING, { trigger: 'click' });
      Typewriter.full('click');
    });
  }


  /* ============================================================
     16. VISIBILITY HANDLING
     ============================================================ */

  function bindVisibility() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (Typewriter.getState().active) {
          Typewriter.pause('tab-hidden');
        }
      } else {
        /* Auto-resume with full text if user returns */
        const st = Typewriter.getState();
        if (st.paused && st.pauseReason === 'tab-hidden') {
          /* Reveal everything instead of resuming (feels more natural) */
          StateMachine.transition(CONFIG.STATES.SKIPPING, { trigger: 'tab-return' });
          Typewriter.full('tab-hidden');
        }
      }
    });
  }


  /* ============================================================
     17. RESIZE HANDLING
     ============================================================ */

  function bindResize() {
    const handler = util.debounce(function () {
      /* Nothing to do — text wrapping handles itself.
         Hook retained for future use. */
    }, CONFIG.TIMING.RESIZE_DEBOUNCE);

    window.addEventListener('resize', handler, { passive: true });
  }


  /* ============================================================
     18. DEBUG OVERLAY
     ============================================================ */

  const DebugOverlay = (function () {

    let el = null;
    let updateTimer = null;

    function create() {
      if (el) return el;

      el = document.createElement('div');
      el.className = 'prize-debug';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'position:fixed;top:8px;left:8px;z-index:99999;' +
        'background:rgba(19,24,35,0.92);color:#fff;' +
        'font-family:ui-monospace,monospace;font-size:11px;' +
        'padding:8px 10px;border-radius:8px;line-height:1.6;' +
        'pointer-events:none;white-space:pre;max-width:280px;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
      document.body.appendChild(el);
      return el;
    }

    function update() {
      if (!el) return;
      const st = Typewriter.getState();
      const sm = StateMachine.get();
      el.textContent =
        'state:    ' + sm + '\n' +
        'active:   ' + st.active + '\n' +
        'index:    ' + st.index + '/' + st.total + '\n' +
        'progress: ' + (st.progress * 100).toFixed(1) + '%\n' +
        'elapsed:  ' + st.elapsed + 'ms\n' +
        'profile:  ' + st.profile + '\n' +
        'reduced:  ' + ENV.reducedLevel;
    }

    function show() {
      create();
      if (!updateTimer) {
        updateTimer = setInterval(update, 120);
      }
      update();
      CONFIG.DEBUG = true;
    }

    function hide() {
      if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
      }
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
      el = null;
      CONFIG.DEBUG = false;
    }

    function toggle() {
      if (el) hide(); else show();
    }

    return { show: show, hide: hide, toggle: toggle };
  })();


  /* ============================================================
     19. URL DEBUG CHECK
     ============================================================ */

  function checkDebugParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has(CONFIG.DEBUG_QUERY_PARAM)) {
        DebugOverlay.show();
      }
    } catch (e) {}
  }


  /* ============================================================
     20. INIT
     ============================================================ */

  function init() {
    try {
      bindOverlayEvents();
      bindKeyboard();
      bindClickSkip();
      bindVisibility();
      bindResize();

      checkDebugParam();

      /* Mark body */
      document.body.classList.add('prize-ready');
      document.body.setAttribute('data-prize-version', VERSION);

      log.debug('Initialised v' + VERSION + ' (' + BUILD + ')');

    } catch (err) {
      log.error('Init failed:', err);
      /* Fail safe — page still works */
    }
  }


  /* ============================================================
     21. PUBLIC API
     ============================================================ */

  function reset() {
    Typewriter.reset();
    Celebrator.reset();
    StateMachine.forceReset();
    Analytics.reset();
    log.debug('Full reset');
    return true;
  }

  function forceOpen() {
    if (!window.MissMathModal) return false;
    if (typeof window.MissMathModal.open !== 'function') return false;
    return !!window.MissMathModal.open(CONFIG.SELECTORS.MODAL);
  }

  function skipTyping() {
    if (!Typewriter.getState().active) return false;
    StateMachine.transition(CONFIG.STATES.SKIPPING, { trigger: 'api' });
    Typewriter.full('api');
    return true;
  }

  function getState() {
    return {
      version:      VERSION,
      build:        BUILD,
      state:        StateMachine.get(),
      previousState: StateMachine.getPrevious(),
      timeInState:  Math.round(StateMachine.timeInState()),
      typing:       Typewriter.getState(),
      modalOpen:    window.MissMathModal
        ? window.MissMathModal.isOpen(CONFIG.SELECTORS.MODAL)
        : false,
      reducedLevel: ENV.reducedLevel,
      reducedMotion: ENV.reducedMotion,
      elementsPresent: {
        modal:       !!document.getElementById(CONFIG.SELECTORS.MODAL),
        typewriter:  !!document.getElementById(CONFIG.SELECTORS.TYPEWRITER),
      },
    };
  }

  const API = {
    version:        VERSION,
    build:          BUILD,

    /* Control */
    open:           forceOpen,
    start:          function () { return Typewriter.start(); },
    stop:           function () { return Typewriter.stop(); },
    pause:          function (reason) { return Typewriter.pause(reason); },
    resume:         function () { return Typewriter.resume(); },
    skip:           skipTyping,
    celebrate:      function () { return Celebrator.fire(); },
    reset:          reset,

    /* Config */
    profile:        function (name) { return Typewriter.setProfile(name); },
    getProfile:     function () { return Typewriter.getProfile(); },

    /* Inspection */
    getState:       getState,
    getAnalytics:   Analytics.getMetrics,
    getHistory:     Analytics.getHistory,
    getStateHistory: StateMachine.getHistory,

    /* Debug */
    debug:          function (on) {
      if (on === false) DebugOverlay.hide();
      else DebugOverlay.show();
    },

    /* Full config snapshot */
    config:         Object.freeze(Object.assign({}, CONFIG)),
  };

  Object.defineProperty(window, 'MissMathPrize', {
    value: Object.freeze(API),
    writable: false,
    configurable: false,
    enumerable: false,
  });


  /* ============================================================
     22. BOOT
     ============================================================ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }


  /* ============================================================
     23. CLEANUP
     ============================================================ */

  window.addEventListener('pagehide', function () {
    try {
      Typewriter.stop();
      DebugOverlay.hide();
      Bus.clear();
    } catch (e) {}
  }, { once: true });


  /* ============================================================
     24. END
     ============================================================ */

})();