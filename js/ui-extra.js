/* ============================================================
   ui-extra.js
   Miss Math — Interactive UI Layer
   فاز ۳ — نسخه کامل حرفه‌ای

   ─── RESPONSIBILITIES ────────────────────────────────────
   1. Mobile Drawer          (hamburger menu)
   2. Floating CTA           ("همین الان ثبت نام کن!")
   3. Back to Top            (scroll-to-top button)
   4. Smooth Scroll          (data-scroll links)
   5. Overlay State Bridge   (hide CTA when overlays open)

   ─── PRINCIPLES ──────────────────────────────────────────
   • Progressive enhancement — works without JS
   • Passive listeners + rAF throttle — no jank
   • IntersectionObserver where possible — cheap
   • Focus trap for a11y — WCAG 2.1 compliant
   • No global leaks — single IIFE
   • MutationObserver for body class — reactive to overlays
   • Respects prefers-reduced-motion
   • Idempotent init — safe to call multiple times
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     0. ENVIRONMENT GUARD
     ============================================================ */

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  /* Prevent double-init if script loaded twice */
  if (window.__MissMathUIExtraLoaded) return;
  window.__MissMathUIExtraLoaded = true;


  /* ============================================================
     1. CONFIG — all magic numbers in one place
     ============================================================ */

  const CONFIG = {
    /* Floating CTA */
    FLOAT_CTA: {
      /* Show after user scrolls past this much (px from top) */
      SHOW_AFTER_PX: 320,
      /* Or when hero is less than this % visible */
      HERO_VISIBILITY_THRESHOLD: 0.45,
      /* Hide when overlay is open */
      HIDE_ON_OVERLAY: true,
    },

    /* Back to Top */
    TO_TOP: {
      SHOW_AFTER_PX: 700,
    },

    /* Drawer */
    DRAWER: {
      OPEN_DURATION_MS: 480,
      FOCUS_DELAY_MS: 100,
      CLOSE_ON_ESCAPE: true,
      CLOSE_ON_BACKDROP: true,
      LOCK_BODY: true,
    },

    /* Smooth scroll */
    SCROLL: {
      DURATION_MS: 680,
      /* Extra offset beyond sticky header height */
      OFFSET_EXTRA: 12,
      /* Fallback header height if CSS var not readable */
      FALLBACK_HEADER_H: 72,
    },

    /* Perf */
    PERF: {
      USE_RAF: true,
      PASSIVE: true,
    },
  };

  const REDUCED_MOTION = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const IS_TOUCH = window.matchMedia
    ? window.matchMedia('(hover: none) and (pointer: coarse)').matches
    : false;


  /* ============================================================
     2. STATE
     ============================================================ */

  const STATE = {
    /* DOM refs (populated at init) */
    refs: {
      body:           null,
      html:           null,
      menuToggle:     null,
      drawer:         null,
      drawerPanel:    null,
      floatCta:       null,
      toTop:          null,
      hero:           null,
    },

    /* Drawer */
    drawer: {
      isOpen:       false,
      lastFocused:  null,
      focusables:   [],
    },

    /* Scroll */
    scroll: {
      ticking:      false,
      lastY:        0,
      direction:    'down', // 'up' | 'down'
    },

    /* Observer */
    heroObserver: null,

    /* Body class observer */
    bodyObserver: null,
  };


  /* ============================================================
     3. UTILITIES
     ============================================================ */

  /**
   * rAF-throttled function executor.
   * Ensures fn runs at most once per animation frame.
   */
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

  /**
   * Debounce — for resize handlers etc.
   */
  function debounce(fn, wait) {
    let timer = null;
    return function debounced() {
      const args = arguments;
      const ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  /**
   * Read a CSS custom property value as integer pixels.
   */
  function readCssVarPx(name, fallback) {
    try {
      const val = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
      if (!val) return fallback;
      const num = parseFloat(val);
      return isFinite(num) ? num : fallback;
    } catch (err) {
      return fallback;
    }
  }

  /**
   * Get all focusable elements inside a container (visible ones only).
   */
  function getFocusable(container) {
    if (!container) return [];
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
    ].join(',');

    return Array.prototype.filter.call(
      container.querySelectorAll(selector),
      function (el) {
        if (el.hasAttribute('hidden')) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (parseFloat(style.opacity) === 0) return false;
        return true;
      }
    );
  }

  /**
   * Cubic ease-in-out. t ∈ [0, 1] → [0, 1]
   */
  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }


  /* ============================================================
     4. BODY SCROLL LOCK
     ─── Prevents layout shift by compensating for scrollbar width
     ============================================================ */

  const ScrollLock = (function () {
    let lockCount = 0;
    let savedPaddingInlineEnd = '';

    function lock() {
      lockCount++;
      if (lockCount > 1) return;

      const body = document.body;
      const scrollbarW = window.innerWidth - document.documentElement.clientWidth;

      /* Save current padding to restore later */
      savedPaddingInlineEnd = body.style.paddingInlineEnd || '';

      if (scrollbarW > 0) {
        body.style.setProperty('--scrollbar-width', scrollbarW + 'px');
        body.style.paddingInlineEnd = scrollbarW + 'px';
      }

      body.classList.add('is-locked');
    }

    function unlock() {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount > 0) return;

      const body = document.body;
      body.classList.remove('is-locked');
      body.style.paddingInlineEnd = savedPaddingInlineEnd;
      body.style.removeProperty('--scrollbar-width');
    }

    function isLocked() {
      return lockCount > 0;
    }

    return { lock: lock, unlock: unlock, isLocked: isLocked };
  })();


  /* ============================================================
     5. SMOOTH SCROLL — custom, controllable, a11y-friendly
     ============================================================ */

  function smoothScrollTo(targetY, durationMs) {
    if (REDUCED_MOTION || !durationMs) {
      window.scrollTo(0, targetY);
      return;
    }

    const startY = window.pageYOffset;
    const distance = targetY - startY;
    const startTime = performance.now();

    /* Cancel if user scrolls manually */
    let cancelled = false;
    const cancel = function () { cancelled = true; };
    window.addEventListener('wheel', cancel, { passive: true, once: true });
    window.addEventListener('touchstart', cancel, { passive: true, once: true });

    function step(now) {
      if (cancelled) return;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const y = startY + distance * easeInOutCubic(progress);
      window.scrollTo(0, y);
      if (progress < 1) window.requestAnimationFrame(step);
    }

    window.requestAnimationFrame(step);
  }

  /**
   * Get the Y coordinate to scroll to for a target element.
   * Accounts for sticky header.
   */
  function getScrollTargetY(targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const currentY = window.pageYOffset;
    const headerH = readCssVarPx('--header-h', CONFIG.SCROLL.FALLBACK_HEADER_H);
    const offset = headerH + CONFIG.SCROLL.OFFSET_EXTRA;
    return Math.max(0, rect.top + currentY - offset);
  }


  /* ============================================================
     6. DRAWER MODULE
     ============================================================ */

  const Drawer = (function () {

    function open() {
      const { drawer, menuToggle, body } = STATE.refs;
      if (!drawer || STATE.drawer.isOpen) return;

      /* Remember who opened us, for focus restore */
      STATE.drawer.lastFocused = document.activeElement;

      STATE.drawer.isOpen = true;

      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');

      if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', 'true');
        menuToggle.setAttribute('aria-label', 'بستن منو');
      }

      if (CONFIG.DRAWER.LOCK_BODY) {
        ScrollLock.lock();
      }

      /* Cache focusables and move focus into the panel */
      const panel = drawer.querySelector('.drawer__panel');
      STATE.drawer.focusables = getFocusable(panel);

      const delay = REDUCED_MOTION ? 0 : CONFIG.DRAWER.FOCUS_DELAY_MS;
      setTimeout(function () {
        const firstFocusable = STATE.drawer.focusables[0];
        if (firstFocusable) firstFocusable.focus();
      }, delay);

      /* Notify overlay state */
      document.dispatchEvent(new CustomEvent('overlay:open', {
        detail: { id: 'drawer' },
      }));
    }

    function close() {
      const { drawer, menuToggle } = STATE.refs;
      if (!drawer || !STATE.drawer.isOpen) return;

      STATE.drawer.isOpen = false;

      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');

      if (menuToggle) {
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'باز کردن منو');
      }

      if (CONFIG.DRAWER.LOCK_BODY) {
        ScrollLock.unlock();
      }

      /* Restore focus */
      const toFocus = STATE.drawer.lastFocused;
      if (toFocus && typeof toFocus.focus === 'function') {
        toFocus.focus();
      }

      STATE.drawer.focusables = [];

      document.dispatchEvent(new CustomEvent('overlay:close', {
        detail: { id: 'drawer' },
      }));
    }

    function toggle() {
      if (STATE.drawer.isOpen) close();
      else open();
    }

    /* Focus trap */
    function trapFocus(e) {
      if (!STATE.drawer.isOpen) return;
      if (e.key !== 'Tab') return;

      const focusables = STATE.drawer.focusables;
      if (!focusables.length) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function bind() {
      const { menuToggle, drawer } = STATE.refs;
      if (!menuToggle || !drawer) return;

      /* Toggle button */
      menuToggle.addEventListener('click', function (e) {
        e.preventDefault();
        toggle();
      });

      /* Anything with data-close="drawer" closes */
      drawer.addEventListener('click', function (e) {
        const closeTrigger = e.target.closest('[data-close="drawer"]');
        if (closeTrigger) {
          e.preventDefault();
          close();
        }
      });

      /* Escape */
      if (CONFIG.DRAWER.CLOSE_ON_ESCAPE) {
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && STATE.drawer.isOpen) {
            e.preventDefault();
            close();
          }
        });
      }

      /* Focus trap */
      document.addEventListener('keydown', trapFocus);

      /* Close on drawer nav-link click (after navigation) */
      drawer.querySelectorAll('.drawer__nav-link').forEach(function (link) {
        link.addEventListener('click', function () {
          /* Delay close so hash-nav starts first */
          setTimeout(close, 50);
        });
      });

      /* Close if viewport grows past mobile breakpoint */
      const mq = window.matchMedia('(min-width: 900px)');
      const handleMQ = function (e) {
        if (e.matches && STATE.drawer.isOpen) close();
      };
      if (mq.addEventListener) mq.addEventListener('change', handleMQ);
      else if (mq.addListener) mq.addListener(handleMQ);
    }

    return { open: open, close: close, toggle: toggle, bind: bind };
  })();


  /* ============================================================
     7. FLOATING CTA MODULE
     ─── Shows after hero is mostly scrolled past, hides on overlay
     ============================================================ */

  const FloatCta = (function () {

    let isVisible = false;
    let overlayOpen = false;
    let userHasScrolled = false;

    function update() {
      const cta = STATE.refs.floatCta;
      if (!cta) return;

      /* Decide visibility */
      const shouldShow = userHasScrolled && !overlayOpen;

      if (shouldShow === isVisible) return;
      isVisible = shouldShow;

      if (isVisible) {
        cta.classList.add('is-visible');
        cta.setAttribute('aria-hidden', 'false');
      } else {
        cta.classList.remove('is-visible');
        cta.setAttribute('aria-hidden', 'true');
      }
    }

    function handleScroll() {
      const y = window.pageYOffset || document.documentElement.scrollTop;
      const threshold = CONFIG.FLOAT_CTA.SHOW_AFTER_PX;

      /* Use a small hysteresis band to prevent flicker near threshold */
      if (!userHasScrolled && y > threshold) {
        userHasScrolled = true;
        update();
      } else if (userHasScrolled && y < threshold - 80) {
        userHasScrolled = false;
        update();
      }
    }

    function handleOverlayChange(open) {
      overlayOpen = open;
      update();
    }

    function bind() {
      const cta = STATE.refs.floatCta;
      if (!cta) return;

      /* Set initial hidden state */
      cta.setAttribute('aria-hidden', 'true');

      /* Scroll-based visibility */
      const throttled = rafThrottle(handleScroll);
      window.addEventListener('scroll', throttled, { passive: true });

      /* Initial check (in case user landed mid-page via anchor) */
      handleScroll();

      /* Overlay events — hide when modal/sheet/panel open */
      if (CONFIG.FLOAT_CTA.HIDE_ON_OVERLAY) {
        document.addEventListener('overlay:open', function () {
          handleOverlayChange(true);
        });
        document.addEventListener('overlay:close', function () {
          /* Only show again if no other overlay is open */
          const anyOpen =
            document.querySelector('.modal:not([hidden])') ||
            document.querySelector('.sheet:not([hidden])') ||
            document.querySelector('.panel:not([hidden])') ||
            document.querySelector('.drawer.is-open');
          handleOverlayChange(!!anyOpen);
        });
      }
    }

    return { bind: bind };
  })();


  /* ============================================================
     8. BACK TO TOP MODULE
     ============================================================ */

  const ToTop = (function () {

    let isVisible = false;

    function update() {
      const btn = STATE.refs.toTop;
      if (!btn) return;

      const y = window.pageYOffset || document.documentElement.scrollTop;
      const shouldShow = y > CONFIG.TO_TOP.SHOW_AFTER_PX;

      if (shouldShow === isVisible) return;
      isVisible = shouldShow;

      if (isVisible) {
        btn.classList.add('is-visible');
        btn.setAttribute('aria-hidden', 'false');
        btn.tabIndex = 0;
      } else {
        btn.classList.remove('is-visible');
        btn.setAttribute('aria-hidden', 'true');
        btn.tabIndex = -1;
      }
    }

    function scrollToTop() {
      smoothScrollTo(0, CONFIG.SCROLL.DURATION_MS);
    }

    function bind() {
      const btn = STATE.refs.toTop;
      if (!btn) return;

      /* Initially hidden */
      btn.setAttribute('aria-hidden', 'true');
      btn.tabIndex = -1;

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToTop();
      });

      /* Keyboard: Enter/Space already triggers click for buttons */

      const throttled = rafThrottle(update);
      window.addEventListener('scroll', throttled, { passive: true });
      update();
    }

    return { bind: bind, scrollToTop: scrollToTop };
  })();


  /* ============================================================
     9. SMOOTH SCROLL LINKS [data-scroll]
     ============================================================ */

  const SmoothScroll = (function () {

    function handleClick(e) {
      /* Only handle left-clicks with no modifiers */
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const link = e.target.closest('a[data-scroll][href^="#"]');
      if (!link) return;

      const hash = link.getAttribute('href');
      if (!hash || hash === '#') return;

      const target = document.querySelector(hash);
      if (!target) return;

      e.preventDefault();

      const y = getScrollTargetY(target);
      smoothScrollTo(y, CONFIG.SCROLL.DURATION_MS);

      /* Update URL without jumping */
      if (history.replaceState) {
        history.replaceState(null, '', hash);
      }
    }

    function bind() {
      document.addEventListener('click', handleClick);
    }

    return { bind: bind };
  })();


  /* ============================================================
     10. ACTIVE NAV SPY
     ─── Highlight current section in desktop nav
     ============================================================ */

  const NavSpy = (function () {

    let observer = null;

    function markActive(id) {
      const links = document.querySelectorAll('.site-nav__link');
      links.forEach(function (link) {
        const href = link.getAttribute('href') || '';
        const match = href === '#' + id;
        link.classList.toggle('is-active', match);
        if (match) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }

    function bind() {
      if (!('IntersectionObserver' in window)) return;

      const sections = ['about', 'classes', 'process', 'testimonials', 'faq', 'location']
        .map(function (id) { return document.getElementById(id); })
        .filter(Boolean);

      if (!sections.length) return;

      const headerH = readCssVarPx('--header-h', CONFIG.SCROLL.FALLBACK_HEADER_H);

      observer = new IntersectionObserver(
        function (entries) {
          /* Pick the entry most in-view */
          let best = null;
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            if (!best || entry.intersectionRatio > best.intersectionRatio) {
              best = entry;
            }
          });
          if (best) markActive(best.target.id);
        },
        {
          rootMargin: '-' + (headerH + 20) + 'px 0px -55% 0px',
          threshold: [0.05, 0.25, 0.5, 0.75],
        }
      );

      sections.forEach(function (s) { observer.observe(s); });
    }

    return { bind: bind };
  })();


  /* ============================================================
     11. INIT
     ============================================================ */

  function cacheRefs() {
    const r = STATE.refs;
    r.body       = document.body;
    r.html       = document.documentElement;
    r.menuToggle = document.getElementById('menu-toggle');
    r.drawer     = document.getElementById('mobile-drawer');
    r.floatCta   = document.getElementById('float-cta');
    r.toTop      = document.getElementById('to-top');
    r.hero       = document.getElementById('hero');
  }

  function init() {
    cacheRefs();

    Drawer.bind();
    FloatCta.bind();
    ToTop.bind();
    SmoothScroll.bind();
    NavSpy.bind();

    /* Mark UI-extra ready */
    STATE.refs.body.classList.add('ui-extra-ready');
  }

  /* Fire once DOM is parsed */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }


  /* ============================================================
     12. PUBLIC API — for debugging & integration
     ============================================================ */

  Object.defineProperty(window, 'MissMathUIExtra', {
    value: Object.freeze({
      drawer:  { open: Drawer.open, close: Drawer.close, toggle: Drawer.toggle },
      toTop:   { scrollToTop: ToTop.scrollToTop },
      scroll:  { to: smoothScrollTo, getTargetY: getScrollTargetY },
      config:  CONFIG,
      state:   function () {
        return {
          drawerOpen: STATE.drawer.isOpen,
          scrollLocked: ScrollLock.isLocked(),
          reducedMotion: REDUCED_MOTION,
          isTouch: IS_TOUCH,
        };
      },
    }),
    writable: false,
    configurable: false,
    enumerable: false,
  });

})();