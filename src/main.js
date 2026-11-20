/* Лендинг программ питания — клиентская логика без зависимостей.
   Настройки приходят из window.SITE_CONFIG (формируется из content/content.json при сборке). */
(function () {
  'use strict';

  var CFG = window.SITE_CONFIG || {};
  var A = CFG.analytics || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- безопасное хранилище (в in-app браузерах и приватном режиме может быть недоступно) ---------- */
  function store(type) {
    return {
      get: function (k) { try { return window[type].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[type].setItem(k, v); } catch (e) { /* ignore */ } },
    };
  }
  var local = store('localStorage');
  var session = store('sessionStorage');

  /* ---------- UTM-метки ---------- */
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var utm = {};
  (function () {
    var saved = {};
    try { saved = JSON.parse(session.get('utm') || '{}') || {}; } catch (e) { saved = {}; }
    var q = new URLSearchParams(location.search);
    var fromUrl = {};
    UTM_KEYS.forEach(function (k) { if (q.get(k)) fromUrl[k] = q.get(k).slice(0, 200); });
    utm = Object.keys(fromUrl).length ? fromUrl : saved;
    session.set('utm', JSON.stringify(utm));
    UTM_KEYS.forEach(function (k) {
      var el = document.querySelector('input[name="' + k + '"]');
      if (el && utm[k]) el.value = utm[k];
    });
  })();

  /* ---------- аналитика ---------- */
  var analyticsLoaded = false;
  var queue = [];
  var hasAnalytics = !!(A.yandexMetrikaId || A.ga4Id || A.vkPixelId || A.metaPixelId);

  function injectScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  function loadAnalytics() {
    if (analyticsLoaded || !hasAnalytics) return;
    analyticsLoaded = true;
    if (A.yandexMetrikaId) {
      window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
      window.ym.l = 1 * new Date();
      injectScript('https://mc.yandex.ru/metrika/tag.js');
      window.ym(A.yandexMetrikaId, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false, params: utm });
    }
    if (A.ga4Id) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', A.ga4Id);
      injectScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(A.ga4Id));
    }
    if (A.vkPixelId) {
      window._tmr = window._tmr || [];
      window._tmr.push({ id: String(A.vkPixelId), type: 'pageView', start: Date.now() });
      injectScript('https://top-fwz1.mail.ru/js/code.js');
    }
    if (A.metaPixelId) {
      var f = (window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); });
      if (!window._fbq) window._fbq = f;
      f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      injectScript('https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', String(A.metaPixelId));
      window.fbq('track', 'PageView');
    }
    queue.splice(0).forEach(function (a) { track(a[0], a[1]); });
  }

  /** Отправка цели во все подключённые системы. Названия целей — см. README. */
  function track(goal, params) {
    if (CFG.demo && window.console) console.info('[цель]', goal, params || '');
    if (!analyticsLoaded) { if (hasAnalytics) queue.push([goal, params]); return; }
    try {
      if (A.yandexMetrikaId && window.ym) window.ym(A.yandexMetrikaId, 'reachGoal', goal, params);
      if (A.ga4Id && window.gtag) window.gtag('event', goal, params || {});
      if (A.vkPixelId && window._tmr) window._tmr.push({ type: 'reachGoal', id: String(A.vkPixelId), goal: goal });
      if (A.metaPixelId && window.fbq && goal === 'form_submit') window.fbq('track', 'Lead');
    } catch (e) { /* аналитика не должна ломать сайт */ }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-goal]');
    if (el) track(el.getAttribute('data-goal'));
  });

  /* ---------- cookie-баннер ---------- */
  var cookie = $('#cookie');
  function setCookieOffset() {
    var h = cookie && !cookie.hidden && window.innerWidth < 600 ? cookie.offsetHeight + 8 : 0;
    document.documentElement.style.setProperty('--cookie-h', h + 'px');
  }
  (function () {
    var choice = local.get('cookie-consent');
    var consentNeeded = A.requireConsent !== false;
    if (choice === 'accepted' || !consentNeeded) idle(loadAnalytics);
    if (!cookie || choice || !(hasAnalytics || CFG.demo)) return;
    cookie.hidden = false;
    setCookieOffset();
    window.addEventListener('resize', setCookieOffset);
    cookie.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-cookie]');
      if (!btn) return;
      var accepted = btn.getAttribute('data-cookie') === 'accept';
      local.set('cookie-consent', accepted ? 'accepted' : 'declined');
      cookie.hidden = true;
      setCookieOffset();
      if (accepted) loadAnalytics();
    });
  })();

  function idle(fn) {
    var run = function () { ('requestIdleCallback' in window) ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500); };
    if (document.readyState === 'complete') run(); else window.addEventListener('load', run);
  }

  /* ---------- появление блоков и цели просмотра ---------- */
  var hasIO = 'IntersectionObserver' in window;
  (function () {
    var items = $$('.reveal');
    if (!hasIO) { items.forEach(function (el) { el.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });

    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { track(en.target.getAttribute('data-goal-view')); seen.unobserve(en.target); }
      });
    }, { threshold: 0.25 });
    $$('[data-goal-view]').forEach(function (el) { seen.observe(el); });
  })();

  /* ---------- липкая кнопка «Записаться» ---------- */
  (function () {
    var bar = $('#sticky-cta');
    var hero = $('.hero');
    var lead = $('#lead');
    if (!bar || !hero || !hasIO) return;
    var link = $('a', bar);
    var pastHero = false, leadVisible = false, typing = false;
    function update() {
      var show = pastHero && !leadVisible && !typing;
      bar.classList.toggle('is-visible', show);
      bar.setAttribute('aria-hidden', show ? 'false' : 'true');
      link.tabIndex = show ? 0 : -1;
    }
    new IntersectionObserver(function (en) { pastHero = !en[0].isIntersecting && en[0].boundingClientRect.top < 0; update(); }).observe(hero);
    if (lead) new IntersectionObserver(function (en) { leadVisible = en[0].isIntersecting; update(); }).observe(lead);
    document.addEventListener('focusin', function (e) { if (e.target.matches('input, select, textarea')) { typing = true; update(); } });
    document.addEventListener('focusout', function () { setTimeout(function () { typing = !!(document.activeElement && document.activeElement.matches('input, select, textarea')); update(); }, 50); });
  })();

  /* ---------- поле в фокусе не должно прятаться под клавиатурой ---------- */
  (function () {
    var vv = window.visualViewport;
    function ensureVisible() {
      var el = document.activeElement;
      if (!el || !el.matches || !el.matches('.form .input, .calc .input')) return;
      var r = el.getBoundingClientRect();
      var viewH = vv ? vv.height : window.innerHeight;
      if (r.bottom > viewH - 16 || r.top < 0) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    document.addEventListener('focusin', function () { setTimeout(ensureVisible, 350); });
    if (vv) vv.addEventListener('resize', function () { setTimeout(ensureVisible, 50); });
  })();

  /* ---------- форма заявки: элементы ---------- */
  var form = $('#lead-form');
  var goalSelect = $('#f-goal');
  var programInput = $('#f-program');
  var calcInput = $('#f-calc');

  function setGoal(value) {
    if (!goalSelect) return;
    var exists = $$('option', goalSelect).some(function (o) { return o.value === value; });
    if (exists) goalSelect.value = value;
  }

  /* выбор программы в карточке */
  $$('[data-program]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-program');
      setGoal(id);
      if (programInput) programInput.value = btn.getAttribute('data-program-name') || id;
      track('program_select', { program: id });
    });
  });
  if (goalSelect) goalSelect.addEventListener('change', function () {
    if (programInput) programInput.value = (CFG.programs || {})[goalSelect.value] || '';
  });

  /* ---------- калькулятор калорий (Миффлин — Сан Жеор) ---------- */
  /**
   * @param {{sex:'male'|'female', age:number, height:number, weight:number, activity:number, goal:'loss'|'balance'|'gain'}} d
   * Похудение: −15 % от нормы, набор массы: +10 %.
   */
  function calcNorm(d) {
    var bmr = 10 * d.weight + 6.25 * d.height - 5 * d.age + (d.sex === 'male' ? 5 : -161);
    var tdee = bmr * d.activity;
    var k = d.goal === 'loss' ? 0.85 : d.goal === 'gain' ? 1.1 : 1;
    var kcal = tdee * k;
    var proteinPerKg = d.goal === 'balance' ? 1.5 : 1.8;
    var fatShare = d.goal === 'loss' ? 0.27 : d.goal === 'gain' ? 0.25 : 0.3;
    var p = d.weight * proteinPerKg;
    var f = (kcal * fatShare) / 9;
    var c = Math.max(0, (kcal - p * 4 - f * 9) / 4);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal: Math.round(kcal), p: Math.round(p), f: Math.round(f), c: Math.round(c) };
  }
  window.calcNorm = calcNorm; // для проверки контрольных примеров из консоли

  (function () {
    var cf = $('#calc-form');
    if (!cf) return;
    var out = $('#calc-result');
    var err = $('#calc-error');
    var last = null;
    var usedOnce = false;
    var LIMITS = { age: [14, 100, 'Возраст'], height: [120, 230, 'Рост'], weight: [35, 250, 'Вес'] };

    cf.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = { sex: cf.sex.value, activity: parseFloat(cf.activity.value), goal: cf.goal.value };
      var bad = [];
      Object.keys(LIMITS).forEach(function (k) {
        var input = cf[k];
        var v = parseFloat(String(input.value).replace(',', '.'));
        var ok = isFinite(v) && v >= LIMITS[k][0] && v <= LIMITS[k][1];
        input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok) bad.push(LIMITS[k][2].toLowerCase() + ' (' + LIMITS[k][0] + '–' + LIMITS[k][1] + ')');
        data[k] = v;
      });
      if (bad.length) {
        err.textContent = 'Проверьте: ' + bad.join(', ') + '.';
        out.hidden = true;
        return;
      }
      err.textContent = '';
      last = data;
      var r = calcNorm(data);
      $('#calc-kcal').textContent = r.kcal.toLocaleString('ru-RU');
      $('#calc-p').textContent = r.p;
      $('#calc-f').textContent = r.f;
      $('#calc-c').textContent = r.c;
      $('#calc-bmr').textContent = r.bmr.toLocaleString('ru-RU') + ' ккал · норма для поддержания веса: ' + r.tdee.toLocaleString('ru-RU');
      out.hidden = false;
      last.result = r;
      if (!usedOnce) { track('calc_use', { goal: data.goal }); usedOnce = true; }
    });

    $('#calc-cta').addEventListener('click', function () {
      if (!last) return;
      setGoal(last.goal);
      if (programInput) programInput.value = (CFG.programs || {})[last.goal] || '';
      if (calcInput) {
        var r = last.result;
        calcInput.value = r.kcal + ' ккал, Б/Ж/У ' + r.p + '/' + r.f + '/' + r.c + ' г (' +
          (last.sex === 'male' ? 'м' : 'ж') + ', ' + last.age + ' л, ' + last.height + ' см, ' + last.weight + ' кг, акт. ' + last.activity + ')';
      }
      track('calc_cta');
    });
  })();

  /* ---------- отзывы: «Показать ещё» ---------- */
  (function () {
    var btn = $('.reviews__more');
    var list = $('#reviews-list');
    if (!btn || !list) return;
    btn.addEventListener('click', function () {
      var first = $('.is-extra', list);
      list.classList.add('reviews--expanded');
      btn.setAttribute('aria-expanded', 'true');
      btn.hidden = true;
      if (first) { first.classList.add('is-in'); first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
      $$('.is-extra', list).forEach(function (el) { el.classList.add('is-in'); });
    });
  })();

  /* ---------- галерея: просмотр на весь экран со свайпом ---------- */
  (function () {
    var links = $$('.gallery__item');
    var photos = CFG.gallery || [];
    if (!links.length || !photos.length) return;
    var lb, img, count, alt, index = 0, lastFocus = null, pushed = false;
    var ICON = function (d) { return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>'; };

    function build() {
      lb = document.createElement('div');
      lb.className = 'lb';
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', 'Просмотр фото');
      lb.innerHTML =
        '<div class="lb__stage"><img class="lb__img" alt="" draggable="false"></div>' +
        '<button class="lb__btn lb__close" type="button" aria-label="Закрыть">' + ICON('M6 6l12 12M18 6L6 18') + '</button>' +
        '<button class="lb__btn lb__prev" type="button" aria-label="Предыдущее фото">' + ICON('M15 5l-7 7 7 7') + '</button>' +
        '<button class="lb__btn lb__next" type="button" aria-label="Следующее фото">' + ICON('M9 5l7 7-7 7') + '</button>' +
        '<p class="lb__caption"><span class="lb__count"></span><span class="lb__alt"></span></p>';
      document.body.appendChild(lb);
      img = $('.lb__img', lb);
      count = $('.lb__count', lb);
      alt = $('.lb__alt', lb);
      $('.lb__close', lb).addEventListener('click', function () { close(false); });
      $('.lb__prev', lb).addEventListener('click', function () { go(-1); });
      $('.lb__next', lb).addEventListener('click', function () { go(1); });
      $('.lb__stage', lb).addEventListener('click', function (e) { if (e.target === e.currentTarget && !moved) close(false); });
      lb.addEventListener('keydown', onKey);
      bindSwipe($('.lb__stage', lb));
    }

    function show(i) {
      index = (i + photos.length) % photos.length;
      var p = photos[index];
      img.src = p.src;
      img.alt = p.alt;
      alt.textContent = p.alt;
      count.textContent = (index + 1) + ' / ' + photos.length;
      [index + 1, index - 1].forEach(function (n) { var pre = new Image(); pre.src = photos[(n + photos.length) % photos.length].src; });
    }
    function go(step) { show(index + step); }

    function open(i) {
      if (!lb) build();
      lastFocus = document.activeElement;
      show(i);
      lb.hidden = false;
      document.body.classList.add('no-scroll');
      requestAnimationFrame(function () { lb.classList.add('is-open'); });
      $('.lb__close', lb).focus();
      try { history.pushState({ lightbox: true }, ''); pushed = true; } catch (e) { pushed = false; }
      track('gallery_open');
    }
    function close(fromHistory) {
      if (!lb || lb.hidden) return;
      lb.classList.remove('is-open');
      lb.hidden = true;
      document.body.classList.remove('no-scroll');
      if (lastFocus) lastFocus.focus({ preventScroll: true });
      if (pushed && !fromHistory) { pushed = false; history.back(); }
      pushed = false;
    }
    window.addEventListener('popstate', function () { close(true); });

    function onKey(e) {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Tab') {
        var f = $$('button', lb);
        var i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }

    var moved = false;
    function bindSwipe(stage) {
      var x0 = 0, y0 = 0, dx = 0, dy = 0, active = false;
      stage.addEventListener('pointerdown', function (e) {
        active = true; moved = false; x0 = e.clientX; y0 = e.clientY; dx = dy = 0;
        img.classList.add('is-dragging');
      });
      stage.addEventListener('pointermove', function (e) {
        if (!active) return;
        dx = e.clientX - x0; dy = e.clientY - y0;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
        if (Math.abs(dx) > Math.abs(dy)) img.style.transform = 'translateX(' + dx + 'px)';
        else if (dy > 0) { img.style.transform = 'translateY(' + dy + 'px)'; img.style.opacity = String(Math.max(0.3, 1 - dy / 400)); }
      });
      function end() {
        if (!active) return;
        active = false;
        img.classList.remove('is-dragging');
        img.style.transform = ''; img.style.opacity = '';
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        else if (dy > 110 && dy > Math.abs(dx)) close(false);
        setTimeout(function () { moved = false; }, 0);
      }
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
      stage.addEventListener('pointerleave', end);
    }

    links.forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        open(parseInt(a.getAttribute('data-index'), 10) || 0);
      });
    });
  })();

  /* ---------- форма заявки ---------- */
  if (!form) return;
  var nameEl = $('#f-name');
  var phoneEl = $('#f-phone');
  var tgEl = $('#f-tg');
  var consentEl = $('#f-consent');
  var submitBtn = $('#f-submit');
  var formError = $('#form-error');
  var success = $('#lead-success');
  var startedAt = 0;

  /* маска телефона +7 (XXX) XXX-XX-XX */
  function phoneDigits(v) {
    var d = String(v).replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    else if (d[0] !== '7') d = '7' + d;
    return d.slice(0, 11);
  }
  function formatPhone(d) {
    if (!d) return '';
    var r = d.slice(1), out = '+7';
    if (r.length > 0) out += ' (' + r.slice(0, 3);
    if (r.length >= 4) out += ') ' + r.slice(3, 6);
    if (r.length >= 7) out += '-' + r.slice(6, 8);
    if (r.length >= 9) out += '-' + r.slice(8, 10);
    return out;
  }
  var prevDigits = '';
  phoneEl.addEventListener('focus', function () { if (!phoneEl.value) { phoneEl.value = '+7 ('; prevDigits = '7'; } });
  phoneEl.addEventListener('blur', function () { if (phoneDigits(phoneEl.value).length <= 1) { phoneEl.value = ''; prevDigits = ''; } });
  phoneEl.addEventListener('paste', function (e) {
    var text = (e.clipboardData || window.clipboardData || { getData: function () { return ''; } }).getData('text');
    var d = phoneDigits(text);
    if (d.length < 10) return; // неполный фрагмент — пусть вставится как есть
    e.preventDefault();
    prevDigits = d;
    phoneEl.value = formatPhone(d);
    phoneEl.dispatchEvent(new Event('change'));
  });
  phoneEl.addEventListener('input', function (e) {
    var raw = phoneEl.value.replace(/\D/g, '');
    // автозаполнение или вставка полного номера поверх «+7 (»: берём последние 11 цифр
    var d = phoneDigits(raw.length > 11 ? raw.slice(-11) : raw);
    // Backspace по символу форматирования: удаляем предыдущую цифру
    if (e.inputType === 'deleteContentBackward' && d === prevDigits && d.length > 1) d = d.slice(0, -1);
    // привычка набирать номер с «8» после уже подставленного «+7»
    if (prevDigits === '7' && d === '78') d = '7';
    prevDigits = d;
    phoneEl.value = d.length <= 1 ? (d ? '+7 (' : '') : formatPhone(d);
  });

  function normalizeTg(v) {
    return String(v).trim().replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '').replace(/^@/, '');
  }

  var RULES = {
    name: function () {
      var v = nameEl.value.trim();
      if (!v) return 'Укажите, как к вам обращаться';
      if (v.length < 2 || !/[a-zа-яё]/i.test(v)) return 'Имя должно содержать хотя бы 2 буквы';
      return '';
    },
    phone: function () {
      var d = phoneDigits(phoneEl.value);
      if (d.length <= 1) return 'Укажите номер телефона';
      if (d.length !== 11) return 'Введите номер полностью: +7 (XXX) XXX-XX-XX';
      return '';
    },
    telegram: function () {
      var v = normalizeTg(tgEl.value);
      if (!v) return '';
      if (!/^[A-Za-z0-9_]{5,32}$/.test(v)) return 'Ник: латиница, цифры и «_», от 5 символов';
      return '';
    },
    consent: function () { return consentEl.checked ? '' : 'Без согласия мы не сможем принять заявку'; },
  };
  var FIELDS = { name: nameEl, phone: phoneEl, telegram: tgEl, consent: consentEl };
  var touched = {};

  function validate(key) {
    var msg = RULES[key]();
    var el = FIELDS[key];
    var errEl = document.getElementById(el.getAttribute('aria-describedby'));
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (errEl) errEl.textContent = msg;
    return !msg;
  }

  Object.keys(FIELDS).forEach(function (key) {
    var el = FIELDS[key];
    el.addEventListener('blur', function () { if (key !== 'consent' && el.value && el.value !== '+7 (') { touched[key] = true; validate(key); } });
    el.addEventListener(key === 'consent' ? 'change' : 'input', function () { if (touched[key] || el.getAttribute('aria-invalid') === 'true') validate(key); });
  });
  // время заполнения (антиспам на сервере): старт по первому взаимодействию с формой
  ['focusin', 'input', 'change', 'pointerdown'].forEach(function (ev) {
    form.addEventListener(ev, function () { if (!startedAt) startedAt = Date.now(); });
  });
  function fillSeconds() {
    // если событий не было (например, автозаполнение + тап по кнопке), считаем от загрузки страницы
    var ms = startedAt ? Date.now() - startedAt : (window.performance && performance.now ? performance.now() : 0);
    return Math.round(ms / 1000);
  }

  function setLoading(on) {
    submitBtn.classList.toggle('is-loading', on);
    submitBtn.setAttribute('aria-disabled', on ? 'true' : 'false');
    submitBtn.disabled = on;
  }

  function showSuccess() {
    form.hidden = true;
    success.hidden = false;
    success.focus({ preventScroll: true });
    var top = success.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formError.textContent = '';
    var ok = true, firstBad = null;
    Object.keys(FIELDS).forEach(function (key) {
      touched[key] = true;
      if (!validate(key)) { ok = false; if (!firstBad) firstBad = FIELDS[key]; }
    });
    if (!ok) { firstBad.focus(); return; }

    // honeypot: боты заполняют скрытое поле — делаем вид, что всё хорошо
    if ($('#f-website').value) { showSuccess(); return; }

    var last = parseInt(local.get('lead-sent-at') || '0', 10);
    var wait = (CFG.rateLimitSeconds || 60) * 1000 - (Date.now() - last);
    if (wait > 0) {
      formError.textContent = 'Заявка уже отправлена. Повторить можно через ' + Math.ceil(wait / 1000) + ' сек.';
      return;
    }

    $('#f-page').value = location.href.split('#')[0];
    $('#f-ts').value = String(fillSeconds());
    phoneEl.value = formatPhone(phoneDigits(phoneEl.value));
    if (programInput && !programInput.value) programInput.value = (CFG.programs || {})[goalSelect.value] || '';
    var fd = new FormData(form);
    fd.set('telegram', normalizeTg(tgEl.value) ? '@' + normalizeTg(tgEl.value) : '');
    fd.set('goal_label', goalSelect.options[goalSelect.selectedIndex].text);

    setLoading(true);
    send(fd)
      .then(function () {
        local.set('lead-sent-at', String(Date.now()));
        track('form_submit', { goal: goalSelect.value, program: programInput ? programInput.value : '' });
        showSuccess();
      })
      .catch(function () {
        formError.innerHTML = 'Не удалось отправить заявку. Попробуйте ещё раз или <a href="' +
          (($('.lead .btn--tg') || {}).href || '#') + '" target="_blank" rel="noopener">напишите нам в Telegram</a>.';
      })
      .then(function () { setLoading(false); });
  });

  function send(fd) {
    if (!CFG.endpoint) {
      // демо-режим: обработчик не настроен — имитируем отправку
      if (window.console) console.info('[демо] заявка', Object.fromEntries ? Object.fromEntries(fd.entries()) : fd);
      return new Promise(function (res) { setTimeout(res, 900); });
    }
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    var done = function () { if (timer) clearTimeout(timer); };
    // urlencoded понимают и Vercel-функция (api/lead.js), и PHP (send.php)
    var body = new URLSearchParams();
    fd.forEach(function (v, k) { body.append(k, v); });
    return fetch(CFG.endpoint, { method: 'POST', body: body, headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          done();
          if (!r.ok || !j.ok) throw new Error(j.error || 'send failed');
        });
      }, function (err) { done(); throw err; });
  }
})();
