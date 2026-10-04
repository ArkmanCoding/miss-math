/* ============================================================
   form.js
   Miss Math — Registration Form Engine
   فاز ۳ — نسخه کامل نهایی v5.0.0

   ─── OVERVIEW ─────────────────────────────────────────────
   The conversion engine. Renders the pre-registration form,
   validates input with live feedback, and sends directly to
   WhatsApp. Zero-friction, maximum conversion.

   ─── ARCHITECTURE (35 LAYERS) ─────────────────────────────
   L01  Guards & Version
   L02  Config & Constants
   L03  Grades Data
   L04  Storage (safe localStorage wrapper)
   L05  String / Number Helpers
   L06  Persian Digit Utilities
   L07  Phone Formatting
   L08  Validation Patterns
   L09  Field Definitions
   L10  State Machine
   L11  State
   L12  DOM Helpers
   L13  Live Region
   L14  Analytics Hooks
   L15  Field Analytics
   L16  Progress Tracker
   L17  Field Builders
   L18  Phone Auto-Format
   L19  Honeypot
   L20  Actions
   L21  Form Builder
   L22  Validation Engine
   L23  Value Handling
   L24  Default Grade From Class
   L25  Draft Persistence
   L26  Dirty Tracking
   L27  Message Builder
   L28  WhatsApp Direct Send
   L29  SMS Fallback
   L30  Success View
   L31  Copy to Clipboard
   L32  Submit Handler
   L33  Reset Handler
   L34  Rebuild / Render
   L35  Public API

   ─── SECURITY ─────────────────────────────────────────────
   • All text via textContent
   • URLs validated through safeUrl
   • Honeypot + rate limit
   • Draft in localStorage with safe wrapper
   • External links use rel="noopener noreferrer"

   ─── ACCESSIBILITY ────────────────────────────────────────
   • aria-invalid, aria-describedby on fields
   • aria-live for validation
   • Focus management on error
   • Keyboard navigation
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     L01 — GUARDS & VERSION
     ============================================================ */

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__MissMathFormLoaded) return;
  window.__MissMathFormLoaded = true;

  const VERSION = '5.0.0';
  const BUILD   = '1403.07';


  /* ============================================================
     L02 — CONFIG & CONSTANTS
     ============================================================ */

  const CONFIG = {

    VERSION: VERSION,
    BUILD:   BUILD,
    DEBUG:   false,

    /* ─── Timing (ms) ─── */
    TIMING: {
      VALIDATE_DEBOUNCE:    220,
      SUBMIT_COOLDOWN:      3000,
      DRAFT_SAVE_DEBOUNCE:  800,
      TOAST_DURATION:       4200,
      SUCCESS_DELAY:        220,
      UNDO_WINDOW:          5000,      /* reset undo window */
      WHATSAPP_RETRY_DELAY: 400,
      PHONE_FORMAT_DELAY:   120,
      PROGRESS_ANIM:        380,
    },

    /* ─── Storage keys ─── */
    STORAGE: {
      DRAFT_KEY:       'miss-math:form-draft:v3',
      LAST_SUBMIT_KEY: 'miss-math:form-last-submit:v2',
      ANALYTICS_KEY:   'miss-math:form-analytics:v1',
    },

    /* ─── Selectors ─── */
    SELECTORS: {
      MODAL_BODY: 'modal-register-body',
    },

    /* ─── a11y ─── */
    A11Y: {
      LIVE_ID: 'miss-math-form-live',
    },

    /* ─── Feature flags ─── */
    FEATURES: {
      SAVE_DRAFT:            true,
      AUTO_RESUME_DRAFT:     true,
      SHOW_CHAR_COUNTER:     true,
      HONEYPOT:              true,
      RATE_LIMIT:            true,
      PHONE_OPTIONAL:        true,
      AUTO_FOCUS:            true,
      SHOW_PROGRESS_BAR:     true,
      DIRECT_WHATSAPP:       true,
      PHONE_AUTO_FORMAT:     true,
      ANALYTICS:             true,
      DIRTY_TRACKING:        true,
      UNDO_RESET:            true,
      SMS_FALLBACK:          true,
      KEYBOARD_NAV:          true,
      RETRY_WHATSAPP:        true,
      LIVE_VALIDATION:       true,
      CARET_COLOR_CHANGE:    true,
    },

    /* ─── WhatsApp ─── */
    WHATSAPP: {
      BASE: 'https://wa.me/',
      MAX_MESSAGE_LENGTH: 1500,
      MAX_RETRIES: 2,
    },

    /* ─── Rate limits ─── */
    LIMITS: {
      MAX_ATTEMPTS_PER_MINUTE: 3,
      MAX_DRAFT_AGE_DAYS: 7,
    },
  };


  /* ============================================================
     L03 — GRADES DATA
     ============================================================ */

  const GRADES = [
    { value: 'first',   label: 'اول دبستان',           group: 'ابتدایی' },
    { value: 'second',  label: 'دوم دبستان',           group: 'ابتدایی' },
    { value: 'third',   label: 'سوم دبستان',           group: 'ابتدایی' },
    { value: 'fourth',  label: 'چهارم دبستان',         group: 'ابتدایی' },
    { value: 'fifth',   label: 'پنجم دبستان',           group: 'ابتدایی' },
    { value: 'sixth',   label: 'ششم دبستان',            group: 'ابتدایی' },
    { value: 'seventh', label: 'هفتم (متوسطه اول)',    group: 'متوسطه' },
    { value: 'eighth',  label: 'هشتم (متوسطه اول)',    group: 'متوسطه' },
    { value: 'ninth',   label: 'نهم (متوسطه اول)',     group: 'متوسطه' },
    { value: 'other',   label: 'پایه دیگر',            group: 'سایر' },
  ];

  /* Persian grade name → value */
  const GRADE_NAME_TO_VALUE = {
    'اول':    'first',
    'دوم':    'second',
    'سوم':    'third',
    'چهارم':  'fourth',
    'پنجم':   'fifth',
    'ششم':    'sixth',
    'هفتم':   'seventh',
    'هشتم':   'eighth',
    'نهم':    'ninth',
  };


  /* ─── Data guard ─── */
  if (!window.MissMathData) {
    console.warn('[form.js] MissMathData missing');
    return;
  }
  const DATA = window.MissMathData;


  /* ============================================================
     L04 — STORAGE
     ============================================================ */

  const Storage = (function () {

    let available = false;

    try {
      const k = '__mm_form_test__';
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

    return {
      available: available,
      get: get,
      set: set,
      remove: remove,
      getJSON: getJSON,
      setJSON: setJSON,
    };
  })();


  /* ============================================================
     L05 — STRING / NUMBER HELPERS
     ============================================================ */

  function toPersian(input) {
    if (input === null || input === undefined) return '';
    const map = {
      '0':'۰','1':'۱','2':'۲','3':'۳','4':'۴',
      '5':'۵','6':'۶','7':'۷','8':'۸','9':'۹',
    };
    return String(input).replace(/[0-9]/g, function (d) { return map[d]; });
  }

  function toEnglishDigits(input) {
    if (input === null || input === undefined) return '';
    const map = {
      '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4',
      '۵':'5','۶':'6','۷':'7','۸':'8','۹':'9',
      '٠':'0','١':'1','٢':'2','٣':'3','٤':'4',
      '٥':'5','٦':'6','٧':'7','٨':'8','٩':'9',
    };
    return String(input).replace(/[۰-۹٠-٩]/g, function (d) { return map[d] || d; });
  }

  function normalizePersian(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/ۀ/g, 'ه')
      .replace(/ة/g, 'ه')
      .replace(/\u200c+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function truncate(str, max) {
    if (typeof str !== 'string') return '';
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  }


  /* ============================================================
     L06 — PERSIAN DIGIT UTILITIES
     ============================================================ */

  function replaceDigitsWithPersian(input) {
    return toPersian(input);
  }

  function ensurePersianNumbersOnly(input) {
    /* Remove anything that's not digit or Persian digit */
    return String(input || '');
  }


  /* ============================================================
     L07 — PHONE FORMATTING
     ─── Convert "09123456789" → "۰۹۱۲ ۳۴۵ ۶۷۸۹" for display
     ─── Keep digits only for storage
     ============================================================ */

  function normalizePhone(input) {
    if (!input) return '';
    return toEnglishDigits(String(input)).replace(/\D/g, '');
  }

  function formatPhoneDisplay(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (!d) return '';

    /* 11 digits: 09123456789 → ۰۹۱۲ ۳۴۵ ۶۷۸۹ */
    if (d.length === 11) {
      return toPersian(d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7));
    }
    if (d.length === 10) {
      return toPersian(d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6));
    }
    if (d.length > 11) {
      return toPersian(d.slice(0, 4) + ' ' + d.slice(4, 7) + ' ' + d.slice(7, 11) + ' ' + d.slice(11));
    }
    return toPersian(d);
  }

  function formatPhoneInput(raw) {
    /* For the input field — keep digits but format with spaces */
    const digits = normalizePhone(raw).slice(0, 11);
    return formatPhoneDisplay(digits);
  }


  /* ============================================================
     L08 — VALIDATION PATTERNS
     ============================================================ */

  const PATTERNS = {
    PERSIAN_NAME: /^[\u0600-\u06FF\s\u200c]{2,40}$/,
    IR_MOBILE:    /^09\d{9}$/,
    IR_PHONE:     /^0\d{10}$/,
    CITY:         /^[\u0600-\u06FF\s\u200c\-]{2,40}$/,
  };


  /* ============================================================
     L09 — FIELD DEFINITIONS
     ============================================================ */

  const FIELDS = [

    /* ─── Parent name ─── */
    {
      name: 'parentName',
      label: 'نام و نام خانوادگی والد',
      type: 'text',
      required: true,
      placeholder: 'مثلاً: زهرا محمدی',
      hint: 'این اسم توی پیام واتساپ برای مدرس نمایش داده می‌شه.',
      autocomplete: 'name',
      maxLength: 60,
      validate: function (v) {
        const value = normalizePersian(v);
        if (!value) return 'لطفاً نام والد رو وارد کنید';
        if (value.length < 2) return 'نام باید حداقل ۲ حرف باشه';
        if (value.length > 60) return 'نام طولانی‌تر از حد مجازه';
        if (!PATTERNS.PERSIAN_NAME.test(value)) return 'لطفاً فقط حروف فارسی وارد کنید';
        return null;
      },
      normalize: normalizePersian,
    },

    /* ─── Student name ─── */
    {
      name: 'studentName',
      label: 'نام و نام خانوادگی دانش‌آموز',
      type: 'text',
      required: true,
      placeholder: 'مثلاً: نیایش کریمی',
      hint: 'اسم دانش‌آموزی که توی کلاس شرکت می‌کنه.',
      autocomplete: 'off',
      maxLength: 60,
      validate: function (v) {
        const value = normalizePersian(v);
        if (!value) return 'لطفاً نام دانش‌آموز رو وارد کنید';
        if (value.length < 2) return 'نام باید حداقل ۲ حرف باشه';
        if (value.length > 60) return 'نام طولانی‌تر از حد مجازه';
        if (!PATTERNS.PERSIAN_NAME.test(value)) return 'لطفاً فقط حروف فارسی وارد کنید';
        return null;
      },
      normalize: normalizePersian,
    },

    /* ─── Grade ─── */
    {
      name: 'grade',
      label: 'پایه تحصیلی دانش‌آموز',
      type: 'select',
      required: true,
      placeholder: 'انتخاب کنید...',
      hint: 'پایه‌ای که دانش‌آموز توش درس می‌خونه.',
      options: GRADES,
      validate: function (v) {
        if (!v) return 'لطفاً پایه تحصیلی رو انتخاب کنید';
        const exists = GRADES.some(function (g) { return g.value === v; });
        if (!exists) return 'پایه انتخابی معتبر نیست';
        return null;
      },
      normalize: function (v) { return String(v || '').trim(); },
    },

    /* ─── City ─── */
    {
      name: 'city',
      label: 'شهر یا محل سکونت',
      type: 'text',
      required: true,
      placeholder: 'مثلاً: تهران، اصفهان، ...',
      hint: 'برای هماهنگی کلاس حضوری و اطلاع از نزدیک‌ترین مکان.',
      autocomplete: 'address-level2',
      maxLength: 40,
      validate: function (v) {
        const value = normalizePersian(v);
        if (!value) return 'لطفاً شهر یا محل سکونت رو وارد کنید';
        if (value.length < 2) return 'اسم شهر باید حداقل ۲ حرف باشه';
        if (!PATTERNS.CITY.test(value)) return 'لطفاً اسم شهر رو درست وارد کنید';
        return null;
      },
      normalize: normalizePersian,
    },

    /* ─── Phone (with auto-format) ─── */
    {
      name: 'phone',
      label: 'شماره تماس',
      type: 'tel',
      required: false,
      optional: true,
      placeholder: '۰۹۱۲ ۳۴۵ ۶۷۸۹',
      hint: 'اختیاری — اگه بدید، مدرس سریع‌تر با شما تماس می‌گیره.',
      autocomplete: 'tel',
      inputmode: 'tel',
      maxLength: 13,
      autoFormat: 'phone',
      validate: function (v) {
        if (!v) return null;
        const digits = normalizePhone(v);
        if (digits.length < 10) return 'شماره تماس ناقصه';
        if (digits.length > 11) return 'شماره تماس طولانی‌تر از حده';
        if (!PATTERNS.IR_MOBILE.test(digits) && !PATTERNS.IR_PHONE.test(digits)) {
          return 'فرمت شماره صحیح نیست (مثل: ۰۹۱۲۳۴۵۶۷۸۹)';
        }
        return null;
      },
      normalize: normalizePhone,
    },

    /* ─── Notes ─── */
    {
      name: 'notes',
      label: 'توضیحات اضافی',
      type: 'textarea',
      required: false,
      optional: true,
      placeholder: 'مثلاً: دانش‌آموز توی کسر مشکل داره، یا ترجیح می‌دیم کلاس آنلاین باشه...',
      hint: 'اگه نکته خاصی هست، اینجا بنویسید.',
      maxLength: 300,
      rows: 4,
      validate: function (v) {
        const value = String(v || '').trim();
        if (value && value.length > 300) return 'توضیحات طولانی‌تر از حده';
        return null;
      },
      normalize: function (v) { return String(v || '').trim(); },
    },
  ];

  /* Fields that count toward progress */
  const PROGRESS_FIELDS = FIELDS.filter(function (f) { return f.required; });


  /* ============================================================
     L10 — STATE MACHINE
     ─── Explicit form states for predictable behavior
     ============================================================ */

  const STATES = {
    IDLE:       'idle',
    BUILDING:   'building',
    READY:      'ready',
    VALIDATING: 'validating',
    SUBMITTING: 'submitting',
    SUCCESS:    'success',
    RESETTING:  'resetting',
    ERROR:      'error',
  };

  const StateMachine = (function () {

    let current = STATES.IDLE;
    let previous = null;
    let enteredAt = Date.now();

    function transition(to) {
      if (current === to) return true;
      previous = current;
      current = to;
      enteredAt = Date.now();

      if (CONFIG.DEBUG) {
        console.log('[form state]', previous, '→', current);
      }
      return true;
    }

    function get() { return current; }
    function getPrevious() { return previous; }
    function timeInState() { return Date.now() - enteredAt; }
    function is(state) { return current === state; }

    return {
      transition: transition,
      get: get,
      getPrevious: getPrevious,
      timeInState: timeInState,
      is: is,
      STATES: STATES,
    };
  })();


  /* ============================================================
     L11 — STATE
     ============================================================ */

  const state = {
    options:     { classId: '', classCode: '', classTitle: '' },
    values:      {},
    errors:      {},
    touched:     {},
    dirty:       {},
    root:        null,
    fieldEls:    {},
    progressEl:  null,
    isSubmitting: false,
    lastSubmitAt: 0,
    draftTimer:  null,
    liveEl:      null,
    isSuccess:   false,
    resetUndoTimer: null,
    resetUndoData: null,
    phoneFormatTimer: null,
    analytics: {
      renders:      0,
      submissions:  0,
      validationErrors: 0,
      fieldFocus:   {},
      fieldEdits:   {},
      whatsappOpens: 0,
    },
  };


  /* ============================================================
     L12 — DOM HELPERS
     ============================================================ */

  function el(tag, attrs, children) {
    const node = document.createElement(tag);

    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        const val = attrs[key];
        if (val === null || val === undefined || val === false) return;

        if (key === 'class') {
          node.className = val;
        } else if (key === 'text') {
          node.textContent = String(val);
        } else if (key === 'html') {
          node.innerHTML = val;
        } else if (key === 'dataset' && typeof val === 'object') {
          Object.keys(val).forEach(function (dk) {
            node.dataset[dk] = String(val[dk]);
          });
        } else if (key === 'style') {
          if (typeof val === 'string') {
            node.setAttribute('style', val);
          } else if (typeof val === 'object') {
            Object.keys(val).forEach(function (sk) {
              try { node.style[sk] = val[sk]; } catch (e) {}
            });
          }
        } else {
          node.setAttribute(key, String(val));
        }
      });
    }

    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(node, c); });
      return;
    }
    if (children instanceof Node) {
      node.appendChild(children);
      return;
    }
    node.appendChild(document.createTextNode(String(children)));
  }

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }


  /* ============================================================
     L13 — LIVE REGION
     ============================================================ */

  function ensureLiveRegion() {
    if (state.liveEl && document.contains(state.liveEl)) return state.liveEl;

    state.liveEl = document.getElementById(CONFIG.A11Y.LIVE_ID);
    if (state.liveEl) return state.liveEl;

    state.liveEl = el('div', {
      id: CONFIG.A11Y.LIVE_ID,
      class: 'visually-hidden',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      role: 'status',
    });
    document.body.appendChild(state.liveEl);
    return state.liveEl;
  }

  function announce(message) {
    if (!message) return;
    const el = ensureLiveRegion();
    el.textContent = '';
    setTimeout(function () { el.textContent = message; }, 30);
  }


  /* ============================================================
     L14 — ANALYTICS HOOKS
     ============================================================ */

  function trackEvent(name, detail) {
    if (!CONFIG.FEATURES.ANALYTICS) return;

    try {
      if (window.MissMathMain && typeof window.MissMathMain.emit === 'function') {
        window.MissMathMain.emit('form:' + name, detail || {});
      }
      if (CONFIG.DEBUG) {
        console.log('[form event]', name, detail);
      }
    } catch (e) {}
  }


  /* ============================================================
     L15 — FIELD ANALYTICS
     ============================================================ */

  function trackFieldFocus(name) {
    if (!CONFIG.FEATURES.ANALYTICS) return;
    state.analytics.fieldFocus[name] = (state.analytics.fieldFocus[name] || 0) + 1;
  }

  function trackFieldEdit(name) {
    if (!CONFIG.FEATURES.ANALYTICS) return;
    state.analytics.fieldEdits[name] = (state.analytics.fieldEdits[name] || 0) + 1;
  }

  function getFieldAnalytics() {
    return {
      focus: Object.assign({}, state.analytics.fieldFocus),
      edits: Object.assign({}, state.analytics.fieldEdits),
    };
  }


  /* ============================================================
     L16 — PROGRESS TRACKER
     ============================================================ */

  function computeProgress() {
    const total = PROGRESS_FIELDS.length;
    let filled = 0;

    PROGRESS_FIELDS.forEach(function (f) {
      const ref = state.fieldEls[f.name];
      if (!ref) return;
      const v = String(ref.input.value || '').trim();
      if (v.length > 0) filled++;
    });

    return {
      filled: filled,
      total:  total,
      percent: total > 0 ? Math.round((filled / total) * 100) : 0,
      complete: filled === total,
    };
  }


  /* ============================================================
     L17 — FIELD BUILDERS
     ============================================================ */

  function buildLabel(field, inputId) {
    const label = el('label', { class: 'form-label', for: inputId }, [
      el('span', { class: 'form-label__text', text: field.label }),
    ]);

    if (field.required) {
      label.appendChild(el('span', {
        class: 'form-label__required',
        text: '*',
        'aria-label': 'اجباری',
      }));
    } else if (field.optional) {
      label.appendChild(el('span', {
        class: 'form-label__optional',
        text: '(اختیاری)',
      }));
    }

    return label;
  }

  function buildInput(field, inputId) {
    /* Select */
    if (field.type === 'select') {
      const select = el('select', {
        class: 'form-input form-select',
        id: inputId,
        name: field.name,
        required: field.required || false,
        'aria-describedby': inputId + '-hint ' + inputId + '-error',
      });

      if (field.placeholder) {
        select.appendChild(el('option', {
          value: '',
          text: field.placeholder,
          disabled: true,
          selected: true,
        }));
      }

      (field.options || []).forEach(function (opt) {
        select.appendChild(el('option', {
          value: opt.value,
          text: opt.label,
          disabled: opt.enabled === false,
        }));
      });

      return select;
    }

    /* Textarea */
    if (field.type === 'textarea') {
      return el('textarea', {
        class: 'form-input form-textarea',
        id: inputId,
        name: field.name,
        placeholder: field.placeholder || '',
        required: field.required || false,
        maxlength: field.maxLength || null,
        rows: field.rows || 4,
        'aria-describedby': inputId + '-hint ' + inputId + '-error ' + inputId + '-counter',
      });
    }

    /* Text-like input */
    return el('input', {
      type: field.type || 'text',
      class: 'form-input',
      id: inputId,
      name: field.name,
      placeholder: field.placeholder || '',
      required: field.required || false,
      maxlength: field.maxLength || null,
      autocomplete: field.autocomplete || 'off',
      inputmode: field.inputmode || null,
      'aria-describedby': inputId + '-hint ' + inputId + '-error',
    });
  }

  function buildHint(field, inputId) {
    if (!field.hint) return null;
    return el('div', {
      class: 'form-hint',
      id: inputId + '-hint',
    }, [
      el('span', {
        class: 'form-hint__icon',
        html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        'aria-hidden': 'true',
      }),
      el('span', { class: 'form-hint__text', text: field.hint }),
    ]);
  }

  function buildError(field, inputId) {
    return el('div', {
      class: 'form-error',
      id: inputId + '-error',
      role: 'alert',
      'aria-live': 'polite',
    });
  }

  function buildCounter(field, inputId) {
    if (!CONFIG.FEATURES.SHOW_CHAR_COUNTER) return null;
    if (!field.maxLength) return null;

    return el('div', {
      class: 'form-counter',
      id: inputId + '-counter',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    }, [
      el('span', { class: 'form-counter__current', text: '۰' }),
      el('span', { class: 'form-counter__sep', text: ' / ' }),
      el('span', { class: 'form-counter__max', text: toPersian(field.maxLength) }),
    ]);
  }

  function buildField(field) {
    const inputId = 'form-field-' + field.name;

    const input   = buildInput(field, inputId);
    const hint    = buildHint(field, inputId);
    const error   = buildError(field, inputId);
    const counter = buildCounter(field, inputId);

    const wrapper = el('div', {
      class: 'form-field',
      dataset: { field: field.name },
    }, [
      buildLabel(field, inputId),
      input,
      hint,
      counter,
      error,
    ]);

    state.fieldEls[field.name] = {
      wrapper, input, error, counter, hint, field,
    };

    return wrapper;
  }


  /* ============================================================
     L18 — PHONE AUTO-FORMAT
     ─── When user types in the phone field, format with spaces
     ============================================================ */

  function bindPhoneAutoFormat(ref) {
    if (!CONFIG.FEATURES.PHONE_AUTO_FORMAT) return;
    if (!ref || !ref.field || ref.field.autoFormat !== 'phone') return;

    const input = ref.input;

    input.addEventListener('input', function (e) {
      const raw = input.value;
      const digits = normalizePhone(raw).slice(0, 11);

      /* If empty, clear */
      if (!digits) return;

      /* Reformat for display */
      const formatted = formatPhoneDisplay(digits);

      /* Only rewrite if different and cursor is at end */
      if (formatted !== raw) {
        const cursorAtEnd = input.selectionStart >= raw.length;
        input.value = formatted;
        if (cursorAtEnd) {
          try {
            input.setSelectionRange(formatted.length, formatted.length);
          } catch (e2) {}
        }
      }
    });
  }


  /* ============================================================
     L19 — HONEYPOT
     ─── Truly invisible — multiple layers of hiding
     ============================================================ */

  function buildHoneypot() {
    if (!CONFIG.FEATURES.HONEYPOT) return null;

    const HIDDEN_STYLE =
      'position:absolute !important;' +
      'left:-9999px !important;' +
      'top:-9999px !important;' +
      'width:1px !important;' +
      'height:1px !important;' +
      'overflow:hidden !important;' +
      'opacity:0 !important;' +
      'visibility:hidden !important;' +
      'pointer-events:none !important;' +
      'clip:rect(0,0,0,0) !important;' +
      'clip-path:inset(50%) !important;';

    const wrap = el('div', {
      class: 'form-honeypot',
      hidden: 'hidden',
      'aria-hidden': 'true',
      style: HIDDEN_STYLE,
      tabindex: '-1',
    });

    wrap.appendChild(el('label', { for: 'form-website' }, 'Website'));
    wrap.appendChild(el('input', {
      type: 'text',
      id: 'form-website',
      name: 'website',
      tabindex: '-1',
      autocomplete: 'off',
    }));

    return wrap;
  }


  /* ============================================================
     L20 — ACTIONS
     ============================================================ */

  function buildActions() {
    const submitBtn = el('button', {
      type: 'submit',
      class: 'btn btn--primary btn--block btn--lg form-submit',
      id: 'form-submit-btn',
    }, [
      el('span', {
        class: 'form-submit__icon',
        html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>',
        'aria-hidden': 'true',
      }),
      el('span', { class: 'form-submit__text', text: 'ارسال به واتساپ' }),
    ]);

    const resetBtn = el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--block form-reset',
      id: 'form-reset-btn',
    }, [
      el('span', { text: 'پاک کردن فرم' }),
    ]);

    return el('div', { class: 'form-actions' }, [submitBtn, resetBtn]);
  }


  /* ============================================================
     L21 — FORM BUILDER
     ============================================================ */

  function buildFormContext() {
    const ctx = state.options;
    if (!ctx.classTitle && !ctx.classCode) return null;

    const wrap = el('div', { class: 'form-context' });

    wrap.appendChild(el('span', {
      class: 'form-context__icon',
      html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
      'aria-hidden': 'true',
    }));

    const body = el('div', { class: 'form-context__body' });

    if (ctx.classTitle) {
      body.appendChild(el('div', {
        class: 'form-context__title',
        text: ctx.classTitle,
      }));
    }

    if (ctx.classCode) {
      body.appendChild(el('div', { class: 'form-context__code' }, [
        el('span', { text: 'کد کلاس: ' }),
        el('strong', { text: ctx.classCode, dir: 'ltr' }),
      ]));
    }

    wrap.appendChild(body);
    return wrap;
  }

  function buildProgressBar() {
    if (!CONFIG.FEATURES.SHOW_PROGRESS_BAR) return null;

    const total = PROGRESS_FIELDS.length;
    const wrap = el('div', { class: 'form-progress' });

    wrap.appendChild(el('div', { class: 'form-progress__header' }, [
      el('span', { class: 'form-progress__title', text: 'پیشرفت فرم' }),
      el('span', { class: 'form-progress__count' }, [
        el('span', { class: 'form-progress__current', text: '۰' }),
        el('span', { text: ' / ' }),
        el('span', { class: 'form-progress__total', text: toPersian(total) }),
      ]),
    ]));

    wrap.appendChild(el('div', {
      class: 'form-progress__track',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
      'aria-valuenow': '0',
      'aria-label': 'پیشرفت پر کردن فرم',
    }, [
      el('span', { class: 'form-progress__fill' }),
    ]));

    state.progressEl = wrap;
    return wrap;
  }

  function buildForm() {
    const form = el('form', {
      class: 'form',
      id: 'miss-math-register-form',
      novalidate: 'novalidate',
      autocomplete: 'on',
    });

    const context = buildFormContext();
    if (context) form.appendChild(context);

    form.appendChild(el('div', { class: 'form-intro' }, [
      el('p', {
        class: 'form-intro__text',
        text: 'لطفاً اطلاعات زیر رو پر کنید. پیش‌ثبت‌نام کاملاً رایگانه و در پایان مستقیم به واتساپ خانم صفری وصل می‌شید.',
      }),
    ]));

    const progress = buildProgressBar();
    if (progress) form.appendChild(progress);

    const honeypot = buildHoneypot();
    if (honeypot) form.appendChild(honeypot);

    const fieldsWrap = el('div', { class: 'form-fields' });
    FIELDS.forEach(function (field) {
      fieldsWrap.appendChild(buildField(field));
    });
    form.appendChild(fieldsWrap);

    form.appendChild(buildActions());

    form.appendChild(el('p', {
      class: 'form-legal',
      text: 'اطلاعات شما فقط برای هماهنگی کلاس استفاده می‌شه و در اختیار شخص دیگری قرار نمی‌گیره.',
    }));

    return form;
  }


  /* ============================================================
     L22 — VALIDATION ENGINE
     ============================================================ */

  function validateField(name) {
    const fieldDef = FIELDS.find(function (f) { return f.name === name; });
    if (!fieldDef) return null;
    return fieldDef.validate ? fieldDef.validate(state.values[name]) : null;
  }

  function validateAll() {
    const errors = {};
    FIELDS.forEach(function (field) {
      const err = validateField(field.name);
      if (err) errors[field.name] = err;
    });
    return errors;
  }

  function isFormValid() {
    return Object.keys(validateAll()).length === 0;
  }

  function applyFieldError(name, errorMessage) {
    const ref = state.fieldEls[name];
    if (!ref) return;

    const { wrapper, input, error } = ref;

    if (errorMessage) {
      state.errors[name] = errorMessage;
      wrapper.classList.add('has-error');
      wrapper.classList.remove('has-success');
      input.setAttribute('aria-invalid', 'true');
      if (error) error.textContent = errorMessage;
      state.analytics.validationErrors++;
    } else {
      delete state.errors[name];
      wrapper.classList.remove('has-error');
      if (state.touched[name] && state.values[name]) {
        wrapper.classList.add('has-success');
      }
      input.removeAttribute('aria-invalid');
      if (error) error.textContent = '';
    }
  }

  function applyAllErrors() {
    const errors = validateAll();
    FIELDS.forEach(function (field) {
      applyFieldError(field.name, errors[field.name] || null);
    });
    return errors;
  }

  function focusFirstError(errors) {
    const firstName = FIELDS
      .map(function (f) { return f.name; })
      .find(function (n) { return errors[n]; });

    if (!firstName) return;
    const ref = state.fieldEls[firstName];
    if (!ref) return;

    try {
      ref.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(function () {
        ref.input.focus({ preventScroll: true });
      }, 260);
    } catch (e) {}
  }

  function updateCounter(name) {
    const ref = state.fieldEls[name];
    if (!ref || !ref.counter) return;

    const value = String(state.values[name] || '');
    const max = ref.field.maxLength || 0;
    const length = value.length;
    const current = ref.counter.querySelector('.form-counter__current');

    if (current) current.textContent = toPersian(length);

    /* Warning color if near limit */
    if (max > 0) {
      const pct = length / max;
      ref.counter.classList.toggle('is-warning', pct >= 0.8 && pct < 1);
      ref.counter.classList.toggle('is-danger', pct >= 1);
    }
  }


  /* ============================================================
     L23 — VALUE HANDLING
     ============================================================ */

  function readFieldValue(name) {
    const ref = state.fieldEls[name];
    return ref ? (ref.input.value || '') : '';
  }

  function setFieldValue(name, value) {
    const ref = state.fieldEls[name];
    if (!ref) return;
    ref.input.value = value == null ? '' : String(value);
    state.values[name] = ref.input.value;
  }

  function applyNormalizers() {
    FIELDS.forEach(function (field) {
      const ref = state.fieldEls[field.name];
      if (!ref) return;

      const raw = ref.input.value;
      let normalized = raw;

      if (field.normalize) {
        const n = field.normalize(raw);
        if (typeof n === 'string') normalized = n;
      }

      /* For phone, restore formatted display */
      if (field.autoFormat === 'phone' && normalized) {
        const display = formatPhoneDisplay(normalized);
        if (display !== raw) {
          ref.input.value = display;
        }
      } else if (normalized !== raw) {
        ref.input.value = normalized;
      }

      state.values[field.name] = field.autoFormat === 'phone'
        ? normalized
        : ref.input.value;
    });
  }


  /* ============================================================
     L24 — DEFAULT GRADE FROM CLASS
     ============================================================ */

  function applyDefaultGradeFromClass() {
    const classId = state.options.classId;
    if (!classId) return false;

    const cls = DATA.CLASSES.find(function (c) { return c.id === classId; });
    if (!cls || !cls.grade) return false;

    const gradeValue = GRADE_NAME_TO_VALUE[cls.grade];
    if (!gradeValue) return false;

    const ref = state.fieldEls.grade;
    if (!ref) return false;

    ref.input.value = gradeValue;
    state.values.grade = gradeValue;
    state.touched.grade = true;

    applyFieldError('grade', null);
    updateProgress();
    return true;
  }


  /* ============================================================
     L25 — DRAFT PERSISTENCE
     ============================================================ */

  function saveDraft() {
    if (!CONFIG.FEATURES.SAVE_DRAFT) return;
    if (state.isSuccess) return;

    try {
      const draft = {
        values:     Object.assign({}, state.values),
        classId:    state.options.classId || '',
        classCode:  state.options.classCode || '',
        classTitle: state.options.classTitle || '',
        savedAt:    Date.now(),
      };
      Storage.setJSON(CONFIG.STORAGE.DRAFT_KEY, draft);
    } catch (e) {}
  }

  function saveDraftDebounced() {
    if (state.draftTimer) clearTimeout(state.draftTimer);
    state.draftTimer = setTimeout(saveDraft, CONFIG.TIMING.DRAFT_SAVE_DEBOUNCE);
  }

  function loadDraft() {
    if (!CONFIG.FEATURES.AUTO_RESUME_DRAFT) return null;

    const draft = Storage.getJSON(CONFIG.STORAGE.DRAFT_KEY);
    if (!draft || typeof draft !== 'object') return null;

    const maxAge = CONFIG.LIMITS.MAX_DRAFT_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (draft.savedAt && (Date.now() - draft.savedAt) > maxAge) {
      Storage.remove(CONFIG.STORAGE.DRAFT_KEY);
      return null;
    }

    /* Only resume if same class context */
    if (state.options.classId && draft.classId && draft.classId !== state.options.classId) {
      return null;
    }

    return draft;
  }

  function clearDraft() {
    Storage.remove(CONFIG.STORAGE.DRAFT_KEY);
  }

  function applyDraft(draft) {
    if (!draft || !draft.values) return;
    FIELDS.forEach(function (field) {
      const v = draft.values[field.name];
      if (v === undefined || v === null || v === '') return;
      setFieldValue(field.name, v);
      state.touched[field.name] = true;
    });
    FIELDS.forEach(function (f) { updateCounter(f.name); });
  }


  /* ============================================================
     L26 — DIRTY TRACKING
     ─── Track which fields have been changed from initial state
     ============================================================ */

  function markDirty(name) {
    if (!CONFIG.FEATURES.DIRTY_TRACKING) return;
    state.dirty[name] = true;
  }

  function isDirty(name) {
    return !!state.dirty[name];
  }

  function hasAnyDirty() {
    return Object.keys(state.dirty).some(function (k) { return state.dirty[k]; });
  }

  function clearDirty() {
    state.dirty = {};
  }


  /* ============================================================
     L27 — MESSAGE BUILDER
     ============================================================ */

  function buildMessage() {
    const values = state.values;
    const opts = state.options;
    const lines = [];

    lines.push('سلام خانم صفری 👋');
    lines.push('از سایت «خانم ریاضی» اومدم و می‌خوام پیش‌ثبت‌نام کنم.');
    lines.push('');

    if (opts.classTitle) {
      lines.push('📚 کلاس انتخابی:');
      lines.push('• ' + opts.classTitle);
      if (opts.classCode) lines.push('• کد: ' + opts.classCode);
      lines.push('');
    }

    lines.push('👤 اطلاعات والد:');
    lines.push('• نام: ' + (values.parentName || '—'));
    lines.push('');

    lines.push('👦 اطلاعات دانش‌آموز:');
    lines.push('• نام: ' + (values.studentName || '—'));

    const gradeLabel = (function () {
      const g = GRADES.find(function (x) { return x.value === values.grade; });
      return g ? g.label : (values.grade || '—');
    })();
    lines.push('• پایه: ' + gradeLabel);

    lines.push('');
    lines.push('📍 شهر: ' + (values.city || '—'));

    if (values.phone) {
      lines.push('📞 شماره تماس: ' + toPersian(values.phone));
    }

    if (values.notes && values.notes.trim()) {
      lines.push('');
      lines.push('📝 توضیحات:');
      lines.push(values.notes.trim());
    }

    lines.push('');
    lines.push('منتظر تماس شما هستم. ممنون!');

    let message = lines.join('\n');
    if (message.length > CONFIG.WHATSAPP.MAX_MESSAGE_LENGTH) {
      message = message.slice(0, CONFIG.WHATSAPP.MAX_MESSAGE_LENGTH - 20) + '\n...(ادامه)';
    }
    return message;
  }

  function buildWhatsAppUrl(message) {
    const phone = String(DATA.SITE_CONFIG.contact.whatsapp || '').replace(/\D/g, '');
    if (!phone) return null;
    return CONFIG.WHATSAPP.BASE + phone + '?text=' + encodeURIComponent(message);
  }

  function buildSmsUrl(message) {
    const phone = String(DATA.SITE_CONFIG.contact.phone || '').replace(/\D/g, '');
    if (!phone) return null;
    return 'sms:' + phone + '?body=' + encodeURIComponent(message);
  }


  /* ============================================================
     L28 — WHATSAPP DIRECT SEND
     ─── Retry up to N times if blocked
     ============================================================ */

  function triggerWhatsApp(url, attempt) {
    if (!url) return false;
    attempt = attempt || 0;

    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      state.analytics.whatsappOpens++;
      trackEvent('whatsapp-open', { attempt: attempt });
      return true;
    } catch (err) {
      console.warn('[form] anchor click failed', err);

      if (attempt < CONFIG.WHATSAPP.MAX_RETRIES) {
        setTimeout(function () {
          triggerWhatsApp(url, attempt + 1);
        }, CONFIG.TIMING.WHATSAPP_RETRY_DELAY);
        return false;
      }

      /* Last resort: window.open */
      try {
        const w = window.open(url, '_blank', 'noopener,noreferrer');
        return !!w;
      } catch (e2) {
        try {
          window.location.href = url;
          return true;
        } catch (e3) {
          return false;
        }
      }
    }
  }


  /* ============================================================
     L29 — SMS FALLBACK
     ============================================================ */

  function triggerSms(url) {
    if (!url) return false;
    try {
      window.location.href = url;
      return true;
    } catch (e) {
      return false;
    }
  }


  /* ============================================================
     L30 — SUCCESS VIEW
     ============================================================ */

  function buildSuccessView(message, waUrl, smsUrl) {
    const wrap = el('div', { class: 'form-success' });

    wrap.appendChild(el('div', {
      class: 'form-success__icon',
      html: '<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      'aria-hidden': 'true',
    }));

    wrap.appendChild(el('h2', {
      class: 'form-success__title',
      text: 'اطلاعات شما ثبت شد!',
    }));

    wrap.appendChild(el('p', {
      class: 'form-success__desc',
      text: 'واتساپ باید خودکار باز شده باشه. اگه باز نشد، روی دکمه زیر بزنید تا پیام آماده به خانم صفری ارسال بشه.',
    }));

    wrap.appendChild(el('div', {
      class: 'form-success__preview-label',
      text: 'متن پیام:',
    }));

    wrap.appendChild(el('pre', {
      class: 'form-success__preview',
      dir: 'rtl',
      text: message,
    }));

    /* Actions */
    const actions = el('div', { class: 'form-success__actions' });

    actions.appendChild(el('a', {
      class: 'btn btn--whatsapp btn--block btn--lg',
      href: waUrl,
      target: '_blank',
      rel: 'noopener noreferrer',
      id: 'form-whatsapp-btn',
    }, [
      el('span', {
        class: 'form-success__btn-icon',
        html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>',
        'aria-hidden': 'true',
      }),
      el('span', { text: 'باز کردن واتساپ دوباره' }),
    ]));

    /* SMS fallback */
    if (CONFIG.FEATURES.SMS_FALLBACK && smsUrl) {
      actions.appendChild(el('a', {
        class: 'btn btn--ghost btn--block',
        href: smsUrl,
        id: 'form-sms-btn',
      }, [
        el('span', { text: 'ارسال پیامک به جای واتساپ' }),
      ]));
    }

    /* Copy */
    actions.appendChild(el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--block',
      id: 'form-copy-btn',
      dataset: { message: message },
    }, [
      el('span', { text: 'کپی متن پیام' }),
    ]));

    /* Edit */
    actions.appendChild(el('button', {
      type: 'button',
      class: 'btn btn--link btn--block',
      id: 'form-edit-btn',
    }, [
      el('span', { text: 'ویرایش اطلاعات' }),
    ]));

    wrap.appendChild(actions);
    return wrap;
  }


  /* ============================================================
     L31 — COPY TO CLIPBOARD
     ============================================================ */

  function copyToClipboard(text) {
    if (!text) return false;

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(
        function () { notifyCopySuccess(); },
        function () { fallbackCopy(text); }
      );
      return true;
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? notifyCopySuccess() : notifyCopyFail();
      return ok;
    } catch (e) {
      notifyCopyFail();
      return false;
    }
  }

  function notifyCopySuccess() {
    announce('متن کپی شد');
    showToast('متن با موفقیت کپی شد ✓', 'success');
  }

  function notifyCopyFail() {
    announce('کپی نشد');
    showToast('کپی نشد — لطفاً دستی انتخاب کنید', 'error');
  }

  function showToast(message, variant) {
    if (window.MissMathMain && typeof window.MissMathMain.toast === 'function') {
      window.MissMathMain.toast(message, {
        variant: variant,
        duration: CONFIG.TIMING.TOAST_DURATION,
      });
      return;
    }
    console.log('[form toast]', message);
  }


  /* ============================================================
     L32 — SUBMIT HANDLER
     ============================================================ */

  function handleSubmit(e) {
    if (e) e.preventDefault();

    StateMachine.transition(STATES.VALIDATING);

    /* Rate limit */
    if (CONFIG.FEATURES.RATE_LIMIT) {
      const now = Date.now();
      if (now - state.lastSubmitAt < CONFIG.TIMING.SUBMIT_COOLDOWN) {
        announce('لطفاً چند لحظه صبر کنید');
        return;
      }
    }

    if (state.isSubmitting) return;

    /* Normalize */
    applyNormalizers();

    /* Validate */
    const errors = applyAllErrors();
    if (Object.keys(errors).length > 0) {
      announce('لطفاً خطاهای فرم رو برطرف کنید');
      focusFirstError(errors);
      StateMachine.transition(STATES.READY);
      trackEvent('submit-error', { errors: Object.keys(errors) });
      return;
    }

    /* Honeypot */
    if (CONFIG.FEATURES.HONEYPOT) {
      const hp = state.root.querySelector('[name="website"]');
      if (hp && hp.value) {
        console.warn('[form] honeypot triggered');
        return;
      }
    }

    /* Build message + URLs */
    const message = buildMessage();
    const waUrl   = buildWhatsAppUrl(message);
    const smsUrl  = buildSmsUrl(message);

    if (!waUrl) {
      announce('خطا در ساخت لینک واتساپ');
      return;
    }

    /* Update state */
    state.isSubmitting = true;
    state.lastSubmitAt = Date.now();
    state.analytics.submissions++;
    StateMachine.transition(STATES.SUBMITTING);

    /* Persist */
    Storage.set(CONFIG.STORAGE.LAST_SUBMIT_KEY, String(Date.now()));
    clearDraft();
    clearDirty();

    /* Direct send */
    if (CONFIG.FEATURES.DIRECT_WHATSAPP) {
      triggerWhatsApp(waUrl);
    }

    /* Show success */
    showSuccess(message, waUrl, smsUrl);

    trackEvent('submit-success', {
      classId: state.options.classId,
      hasPhone: !!state.values.phone,
    });

    announce('اطلاعات ثبت شد — واتساپ در حال باز شدن');
    state.isSubmitting = false;
  }


  function showSuccess(message, waUrl, smsUrl) {
    state.isSuccess = true;
    StateMachine.transition(STATES.SUCCESS);

    if (!state.root || !state.root.parentNode) return;

    const successView = buildSuccessView(message, waUrl, smsUrl);
    const parent = state.root.parentNode;
    parent.replaceChild(successView, state.root);

    /* Scroll modal body to top */
    try {
      const modal = document.getElementById('modal-register');
      const body = modal ? modal.querySelector('.modal__body') : null;
      if (body) body.scrollTop = 0;
    } catch (e) {}

    /* Focus retry button */
    setTimeout(function () {
      const cta = document.getElementById('form-whatsapp-btn');
      if (cta && typeof cta.focus === 'function') {
        try { cta.focus({ preventScroll: true }); } catch (e) {}
      }
    }, 120);

    /* Bind copy */
    const copyBtn = document.getElementById('form-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyToClipboard(message);
      });
    }

    /* Bind edit */
    const editBtn = document.getElementById('form-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        state.isSuccess = false;
        StateMachine.transition(STATES.READY);
        rebuildForm();
      });
    }
  }


  /* ============================================================
     L33 — RESET HANDLER (with undo window)
     ============================================================ */

  function handleResetClick() {
    const hasData = FIELDS.some(function (f) { return state.values[f.name]; });

    if (hasData && !CONFIG.FEATURES.UNDO_RESET) {
      if (!window.confirm('اطلاعات فرم پاک بشه؟')) return;
    }

    /* Snapshot for undo */
    if (CONFIG.FEATURES.UNDO_RESET && hasData) {
      state.resetUndoData = {
        values: Object.assign({}, state.values),
        touched: Object.assign({}, state.touched),
      };
      clearTimeout(state.resetUndoTimer);
      state.resetUndoTimer = setTimeout(function () {
        state.resetUndoData = null;
      }, CONFIG.TIMING.UNDO_WINDOW);
    }

    StateMachine.transition(STATES.RESETTING);
    resetValues();
    clearDraft();
    clearDirty();
    announce('فرم پاک شد');

    /* Show undo toast */
    if (CONFIG.FEATURES.UNDO_RESET && state.resetUndoData) {
      showUndoToast();
    }

    StateMachine.transition(STATES.READY);
  }


  function showUndoToast() {
    if (!window.MissMathMain || typeof window.MissMathMain.toast !== 'function') return;
    window.MissMathMain.toast('فرم پاک شد — برای لغو ۵ ثانیه فرصت دارید', {
      variant: 'info',
      duration: CONFIG.TIMING.UNDO_WINDOW,
    });
  }


  function resetValues() {
    FIELDS.forEach(function (field) {
      const ref = state.fieldEls[field.name];
      if (!ref) return;
      ref.input.value = '';
      state.values[field.name] = '';
      state.touched[field.name] = false;
      state.dirty[field.name] = false;
      applyFieldError(field.name, null);
      ref.wrapper.classList.remove('has-success', 'has-error', 'is-focused');
      updateCounter(field.name);
    });
    updateProgress();

    /* Re-apply default grade from class */
    applyDefaultGradeFromClass();

    /* Focus first */
    const first = FIELDS[0];
    if (first && state.fieldEls[first.name]) {
      try { state.fieldEls[first.name].input.focus({ preventScroll: true }); } catch (e) {}
    }
  }


  /* ============================================================
     L34 — REBUILD / RENDER
     ============================================================ */

  function updateProgress() {
    if (!state.progressEl) return;

    const progress = computeProgress();

    const currentEl = state.progressEl.querySelector('.form-progress__current');
    const trackEl   = state.progressEl.querySelector('.form-progress__track');
    const fillEl    = state.progressEl.querySelector('.form-progress__fill');

    if (currentEl) currentEl.textContent = toPersian(progress.filled);
    if (trackEl)   trackEl.setAttribute('aria-valuenow', String(progress.filled));
    if (fillEl)    fillEl.style.width = progress.percent + '%';

    state.progressEl.classList.toggle('is-complete', progress.complete);
  }


  function bindFieldEvents(field) {
    const ref = state.fieldEls[field.name];
    if (!ref) return;

    const input = ref.input;
    let validateTimer = null;

    function scheduleValidate() {
      if (validateTimer) clearTimeout(validateTimer);
      validateTimer = setTimeout(function () {
        if (!state.touched[field.name]) return;
        const err = validateField(field.name);
        applyFieldError(field.name, err);
      }, CONFIG.TIMING.VALIDATE_DEBOUNCE);
    }

    input.addEventListener('input', function () {
      state.values[field.name] = input.value;
      updateCounter(field.name);
      updateProgress();
      markDirty(field.name);
      trackFieldEdit(field.name);

      if (!state.touched[field.name]) {
        state.touched[field.name] = true;
      }

      if (CONFIG.FEATURES.LIVE_VALIDATION) {
        scheduleValidate();
      }
      saveDraftDebounced();
    });

    input.addEventListener('blur', function () {
      state.touched[field.name] = true;
      const err = validateField(field.name);
      applyFieldError(field.name, err);
      saveDraft();
    });

    input.addEventListener('change', function () {
      state.values[field.name] = input.value;
      state.touched[field.name] = true;
      const err = validateField(field.name);
      applyFieldError(field.name, err);
      updateProgress();
      markDirty(field.name);
      saveDraftDebounced();
    });

    input.addEventListener('focus', function () {
      ref.wrapper.classList.add('is-focused');
      trackFieldFocus(field.name);
    });

    input.addEventListener('blur', function () {
      ref.wrapper.classList.remove('is-focused');
    });

    /* Phone auto-format */
    bindPhoneAutoFormat(ref);
  }


  function bindFormEvents() {
    if (!state.root) return;

    state.root.addEventListener('submit', handleSubmit);

    const resetBtn = state.root.querySelector('#form-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function (e) {
        e.preventDefault();
        handleResetClick();
      });
    }

    /* Enter to submit (except textarea) */
    state.root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      const t = e.target;
      if (!t) return;
      if (t.tagName === 'TEXTAREA') return;
      if (t.tagName === 'BUTTON') return;
      if (t.tagName === 'A') return;
      e.preventDefault();
      handleSubmit(e);
    });

    /* Keyboard nav: Alt+Arrow to jump between fields */
    if (CONFIG.FEATURES.KEYBOARD_NAV) {
      state.root.addEventListener('keydown', function (e) {
        if (!e.altKey) return;
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

        e.preventDefault();
        const fields = FIELDS.map(function (f) { return state.fieldEls[f.name]; })
          .filter(Boolean)
          .map(function (r) { return r.input; });

        const currentIndex = fields.indexOf(e.target);
        if (currentIndex === -1) return;

        let nextIndex;
        if (e.key === 'ArrowDown') {
          nextIndex = (currentIndex + 1) % fields.length;
        } else {
          nextIndex = (currentIndex - 1 + fields.length) % fields.length;
        }

        try { fields[nextIndex].focus(); } catch (err) {}
      });
    }

    FIELDS.forEach(bindFieldEvents);
  }


  function rebuildForm() {
    const modalBody = document.getElementById(CONFIG.SELECTORS.MODAL_BODY);
    if (!modalBody) return false;

    StateMachine.transition(STATES.BUILDING);

    clear(modalBody);
    state.fieldEls = {};
    state.errors = {};
    state.isSuccess = false;
    state.progressEl = null;
    state.analytics.renders++;

    state.root = buildForm();
    modalBody.appendChild(state.root);

    /* Apply draft */
    const draft = loadDraft();
    if (draft && draft.values) {
      applyDraft(draft);
    }

    /* Default grade (if not already set by draft) */
    if (!draft || !draft.values || !draft.values.grade) {
      applyDefaultGradeFromClass();
    }

    updateProgress();
    bindFormEvents();

    StateMachine.transition(STATES.READY);

    /* Auto focus */
    if (CONFIG.FEATURES.AUTO_FOCUS) {
      setTimeout(function () {
        const first = FIELDS[0];
        if (first && state.fieldEls[first.name]) {
          try {
            state.fieldEls[first.name].input.focus({ preventScroll: true });
          } catch (e) {}
        }
      }, 280);
    }

    return true;
  }


  function render(options) {
    options = options || {};

    state.options = {
      classId:    String(options.classId || ''),
      classCode:  String(options.classCode || ''),
      classTitle: String(options.classTitle || ''),
    };

    /* Resolve title/code from data if only id */
    if (!state.options.classTitle && state.options.classId) {
      const cls = DATA.CLASSES.find(function (c) { return c.id === state.options.classId; });
      if (cls) {
        state.options.classTitle = cls.title;
        state.options.classCode  = state.options.classCode || cls.code;
      }
    }

    state.values = {};
    state.errors = {};
    state.touched = {};
    state.dirty = {};
    state.isSuccess = false;
    state.isSubmitting = false;

    trackEvent('render', { classId: state.options.classId });

    return rebuildForm();
  }


  function reset() {
    state.fieldEls = {};
    state.root = null;
    state.isSuccess = false;
    state.isSubmitting = false;
    clearDirty();
    StateMachine.transition(STATES.IDLE);
  }


  /* ============================================================
     L35 — PUBLIC API
     ============================================================ */

  function getState() {
    return {
      version:      VERSION,
      build:        BUILD,
      formState:    StateMachine.get(),
      previousState: StateMachine.getPrevious(),
      timeInState:  StateMachine.timeInState(),
      isSuccess:    state.isSuccess,
      isSubmitting: state.isSubmitting,
      classId:      state.options.classId,
      classCode:    state.options.classCode,
      fieldCount:   FIELDS.length,
      touched:      Object.assign({}, state.touched),
      dirty:        Object.assign({}, state.dirty),
      errors:       Object.assign({}, state.errors),
      hasDraft:     !!Storage.getJSON(CONFIG.STORAGE.DRAFT_KEY),
      progress:     computeProgress(),
      analytics:    Object.assign({}, state.analytics),
    };
  }

  function getValues() {
    return Object.assign({}, state.values);
  }

  function forceSaveDraft() {
    saveDraft();
    return true;
  }

  function clearDraftPublic() {
    clearDraft();
    return true;
  }

  function validateFieldPublic(name) {
    return validateField(name);
  }

  function validateAllPublic() {
    return validateAll();
  }

  function undoReset() {
    if (!state.resetUndoData) return false;
    try {
      Object.keys(state.resetUndoData.values).forEach(function (k) {
        if (state.resetUndoData.values[k]) {
          setFieldValue(k, state.resetUndoData.values[k]);
        }
      });
      Object.keys(state.resetUndoData.touched).forEach(function (k) {
        state.touched[k] = state.resetUndoData.touched[k];
      });
      FIELDS.forEach(function (f) { updateCounter(f.name); });
      updateProgress();
      state.resetUndoData = null;
      announce('اطلاعات بازیابی شد');
      return true;
    } catch (e) {
      return false;
    }
  }

  const API = {
    version: VERSION,
    build:   BUILD,

    render:  render,
    reset:   reset,

    /* Validation */
    validate:      validateAllPublic,
    validateField: validateFieldPublic,
    isFormValid:   isFormValid,

    /* Values */
    getValues: getValues,
    getState:  getState,

    /* Draft */
    saveDraft:  forceSaveDraft,
    clearDraft: clearDraftPublic,

    /* Utility */
    buildMessage:    buildMessage,
    copyToClipboard: copyToClipboard,
    undoReset:       undoReset,

    /* Diagnostics */
    getAnalytics: getFieldAnalytics,
    getStateMachine: function () { return StateMachine.get(); },

    /* Config */
    config: Object.freeze(Object.assign({}, CONFIG)),
    fields: Object.freeze(FIELDS.map(function (f) {
      return { name: f.name, label: f.label, required: !!f.required };
    })),
  };

  Object.defineProperty(window, 'MissMathForm', {
    value: Object.freeze(API),
    writable: false,
    configurable: false,
    enumerable: false,
  });


  /* ============================================================
     BOOT
     ============================================================ */

  console.info('[form.js] v' + VERSION + ' ready');

})();