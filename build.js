#!/usr/bin/env node
/*
 * Сборка лендинга: content/content.json + src/ → dist/
 * Зависимостей нет, нужен только Node.js 18+.
 *
 *   node build.js           — собрать сайт в папку dist/
 *   node build.js --serve   — собрать и открыть локально на http://localhost:8080
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'content.json'), 'utf8'));

/* ---------- helpers ---------- */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const ENV = process.env;
const ON_VERCEL = !!ENV.VERCEL;
// Адрес сайта: SITE_URL из окружения → site.url из content.json → домен проекта на Vercel (если в content.json заглушка)
const siteUrl = String(
  ENV.SITE_URL ||
    (/example\.ru/.test(C.site.url || '') && ENV.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${ENV.VERCEL_PROJECT_PRODUCTION_URL}`
      : C.site.url) ||
    ''
).replace(/\/+$/, '');
// Куда отправлять заявки: form.endpoint из content.json, иначе на Vercel — /api/lead, если заданы переменные бота/вебхука
const FORM_ENDPOINT =
  C.form.endpoint ||
  (ON_VERCEL && ((ENV.TELEGRAM_BOT_TOKEN && ENV.TELEGRAM_CHAT_ID) || ENV.WEBHOOK_URL) ? '/api/lead' : '');
const abs = (p) => (/^https?:/.test(p) ? p : `${siteUrl}/${p.replace(/^\//, '')}`);
const tgHref = C.contacts.telegram;

const ICONS = {
  chef: '<path d="M7 14a4 4 0 1 1 1.6-7.7A4 4 0 0 1 15.4 6.3 4 4 0 1 1 17 14"/><path d="M7 14v6h10v-6"/><path d="M7 17h10"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4.5 19.5l1.4-4.2A7.5 7.5 0 1 1 20 11.5z"/><path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01"/>',
  swap: '<path d="M7 8h11l-3-3"/><path d="M17 16H6l3 3"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19l7-7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  phone: '<path d="M6.5 4h3l1.5 4-2 1.2a10 10 0 0 0 5.8 5.8L16 13l4 1.5v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z"/>',
};
const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const TG_ICON =
  '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.7 4.3 3.2 11c-1.2.5-1.2 1.2-.2 1.5l4.5 1.4 1.7 5.3c.2.6.4.8.8.8s.6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14c.3-1.3-.5-1.9-1.6-1.5zM9.2 14.2l8.6-5.4c.4-.3.8-.1.5.2l-7 6.4-.3 3-1.8-4.2z"/></svg>';
const WA_ICON =
  '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.5 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5zm0 17.2c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A7.8 7.8 0 1 1 12 19.7zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.4 6.4 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.2.1-.1 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.4-.2z"/></svg>';

/* ---------- partials ---------- */

function head({ title, description, canonical, isHome }) {
  const ogImage = abs(C.site.ogImage);
  const robots = C.demo ? '<meta name="robots" content="noindex, nofollow">' : '';
  const heroPreload = isHome
    ? `<link rel="preload" as="image" href="${esc(C.hero.image.src)}" fetchpriority="high">`
    : '';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<script>document.documentElement.className+=' js'</script>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${robots}
<meta name="theme-color" content="${esc(C.site.themeColor)}">
<meta name="color-scheme" content="light">
<meta name="format-detection" content="telephone=no">
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="${esc(C.site.brand)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.ico" sizes="32x32">
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Unbounded:wght@600;700&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Unbounded:wght@600;700&display=swap"></noscript>
${heroPreload}
<style>${css()}</style>
</head>`;
}

function css() {
  return fs
    .readFileSync(path.join(SRC, 'styles.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function demoBar() {
  if (!C.demo) return '';
  return `<div class="demo-bar" role="note">Демо-версия: цены, отзывы, цифры и фото — примеры. Замените их в <code>content/content.json</code>.</div>`;
}

function header(isHome) {
  const h = isHome ? '' : 'index.html';
  const nav = [
    ['#programs', 'Программы'],
    C.calculator.enabled ? ['#calc', 'Калькулятор'] : null,
    ['#gallery', 'Меню'],
    ['#reviews', 'Отзывы'],
    ['#faq', 'Вопросы'],
  ]
    .filter(Boolean)
    .map(([href, label]) => `<a href="${h}${href}">${label}</a>`)
    .join('');
  return `<header class="header">
  <div class="container header__inner">
    <a class="logo" href="${isHome ? '#top' : 'index.html'}" aria-label="${esc(C.site.brand)} — на главную">
      <span class="logo__mark" aria-hidden="true"></span><span class="logo__text">${esc(C.site.brand)}</span>
    </a>
    <nav class="header__nav" aria-label="Разделы страницы">${nav}</nav>
    <a class="btn btn--tg btn--sm header__tg" href="${esc(tgHref)}" target="_blank" rel="noopener" data-goal="telegram_click">${TG_ICON}<span>Telegram</span></a>
  </div>
</header>`;
}

function footer(isHome) {
  const h = isHome ? '' : 'index.html';
  const co = C.company;
  const social = [
    C.contacts.telegram && `<a href="${esc(C.contacts.telegram)}" target="_blank" rel="noopener" data-goal="telegram_click">Telegram</a>`,
    C.contacts.telegramChannel && `<a href="${esc(C.contacts.telegramChannel)}" target="_blank" rel="noopener">Telegram-канал</a>`,
    C.contacts.whatsapp && `<a href="${esc(C.contacts.whatsapp)}" target="_blank" rel="noopener" data-goal="whatsapp_click">WhatsApp</a>`,
    C.contacts.vk && `<a href="${esc(C.contacts.vk)}" target="_blank" rel="noopener">ВКонтакте</a>`,
    C.contacts.instagram && `<a href="${esc(C.contacts.instagram)}" target="_blank" rel="noopener">Instagram*</a>`,
  ]
    .filter(Boolean)
    .join('');
  const phoneHref = String(C.contacts.phone || '').replace(/[^\d+]/g, '');
  return `<footer class="footer">
  <div class="container footer__grid">
    <div>
      <a class="logo logo--footer" href="${h || '#top'}"><span class="logo__mark" aria-hidden="true"></span><span class="logo__text">${esc(C.site.brand)}</span></a>
      <p class="footer__muted">${esc(C.contacts.hours)}</p>
    </div>
    <div class="footer__col">
      <p class="footer__title">Контакты</p>
      ${C.contacts.phone ? `<a href="tel:${esc(phoneHref)}">${esc(C.contacts.phone)}</a>` : ''}
      ${C.contacts.email ? `<a href="mailto:${esc(C.contacts.email)}">${esc(C.contacts.email)}</a>` : ''}
      ${co.address ? `<span class="footer__muted">${esc(co.address)}</span>` : ''}
    </div>
    <div class="footer__col">
      <p class="footer__title">Мы в соцсетях</p>
      ${social}
    </div>
    <div class="footer__col">
      <p class="footer__title">Документы</p>
      <a href="privacy.html">Политика конфиденциальности</a>
      ${C.legal.showOffer ? '<a href="offer.html">Публичная оферта</a>' : ''}
    </div>
  </div>
  <div class="container footer__bottom">
    <p>${esc(co.legalName)}${co.inn ? `, ИНН ${esc(co.inn)}` : ''}${co.ogrn ? `, ОГРН ${esc(co.ogrn)}` : ''}</p>
    <p>${esc(C.footer.disclaimer)}</p>
    ${C.contacts.instagram ? '<p>* Instagram принадлежит компании Meta, деятельность которой признана экстремистской и запрещена на территории РФ.</p>' : ''}
    <p>© ${new Date().getFullYear()} ${esc(C.site.brand)}</p>
  </div>
</footer>`;
}

/* ---------- sections ---------- */

function hero() {
  const H = C.hero;
  const img = H.image;
  const trust = (H.trust || []).filter((t) => String(t).trim());
  return `<section class="hero" id="top">
  <div class="container hero__grid">
    <div class="hero__text">
      ${H.eyebrow ? `<p class="eyebrow">${esc(H.eyebrow)}</p>` : ''}
      <h1 class="hero__title">${esc(H.title)}</h1>
      <p class="hero__subtitle">${esc(H.subtitle)}</p>
      <div class="hero__actions">
        <a class="btn btn--primary btn--lg" href="#programs" data-goal="cta_primary">${esc(H.ctaPrimary)}</a>
        <a class="link-tg" href="${esc(tgHref)}" target="_blank" rel="noopener" data-goal="telegram_click">${TG_ICON}<span>${esc(H.ctaSecondary)}</span></a>
      </div>
      ${trust.length ? `<ul class="trust" aria-label="Коротко о нас">${trust.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="hero__media">
      <img src="${esc(img.src)}" alt="${esc(img.alt)}" width="${img.width}" height="${img.height}" fetchpriority="high" decoding="async">
    </div>
  </div>
</section>`;
}

function programs() {
  const P = C.programs;
  const cards = P.items
    .map(
      (p) => `<article class="card program${p.popular ? ' program--popular' : ''} reveal">
      ${p.popular ? '<span class="badge">Популярно</span>' : ''}
      <h3 class="program__name">${esc(p.name)}</h3>
      <p class="program__audience">${esc(p.audience)}</p>
      <p class="program__duration">${icon('clock', 'icon icon--sm')}<span>Длительность: ${esc(p.duration)}</span></p>
      <ul class="checklist">${p.features.map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>
      <div class="program__footer">
        <p class="price"><span class="price__value">${esc(p.price)}</span> <span class="price__note">${esc(p.priceNote)}</span></p>
        <a class="btn ${p.popular ? 'btn--primary' : 'btn--outline'} btn--block" href="#lead" data-program="${esc(p.id)}" data-program-name="${esc(p.name)}">Выбрать</a>
      </div>
    </article>`
    )
    .join('\n');
  return `<section class="section" id="programs" data-goal-view="programs_view">
  <div class="container">
    <div class="section__head reveal">
      <h2>${esc(P.title)}</h2>
      <p>${esc(P.subtitle)}</p>
    </div>
    <div class="programs">${cards}</div>
  </div>
</section>`;
}

function calculator() {
  const K = C.calculator;
  if (!K.enabled) return '';
  const radio = (name, value, label, checked) =>
    `<label class="seg__opt"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${label}</span></label>`;
  return `<section class="section section--alt" id="calc">
  <div class="container calc-wrap">
    <div class="section__head reveal">
      <h2>${esc(K.title)}</h2>
      <p>${esc(K.subtitle)}</p>
    </div>
    <form class="card calc reveal" id="calc-form" novalidate>
      <fieldset class="seg">
        <legend class="label">Пол</legend>
        <div class="seg__row">${radio('sex', 'male', 'Мужской', false)}${radio('sex', 'female', 'Женский', true)}</div>
      </fieldset>
      <div class="calc__nums">
        <div class="field"><label class="label" for="c-age">Возраст</label><input class="input" id="c-age" name="age" type="number" inputmode="numeric" min="14" max="100" placeholder="лет" required></div>
        <div class="field"><label class="label" for="c-height">Рост</label><input class="input" id="c-height" name="height" type="number" inputmode="numeric" min="120" max="230" placeholder="см" required></div>
        <div class="field"><label class="label" for="c-weight">Вес</label><input class="input" id="c-weight" name="weight" type="number" inputmode="decimal" min="35" max="250" step="0.1" placeholder="кг" required></div>
      </div>
      <div class="field">
        <label class="label" for="c-activity">Уровень активности</label>
        <select class="input" id="c-activity" name="activity">
          <option value="1.2">Без тренировок, сидячая работа</option>
          <option value="1.375" selected>1–3 тренировки в неделю</option>
          <option value="1.55">3–5 тренировок в неделю</option>
          <option value="1.725">6–7 тренировок в неделю</option>
          <option value="1.9">Физическая работа и спорт</option>
        </select>
      </div>
      <fieldset class="seg">
        <legend class="label">Цель</legend>
        <div class="seg__row seg__row--3">${radio('goal', 'loss', 'Похудение', true)}${radio('goal', 'balance', 'Баланс', false)}${radio('goal', 'gain', 'Набор', false)}</div>
      </fieldset>
      <p class="field__error calc__error" id="calc-error" role="alert"></p>
      <button class="btn btn--primary btn--block" type="submit">Рассчитать</button>
      <div class="calc__result" id="calc-result" hidden>
        <p class="calc__kcal"><span id="calc-kcal">0</span> ккал <span class="calc__kcal-note">в день</span></p>
        <dl class="macros">
          <div><dt>Белки</dt><dd><span id="calc-p">0</span> г</dd></div>
          <div><dt>Жиры</dt><dd><span id="calc-f">0</span> г</dd></div>
          <div><dt>Углеводы</dt><dd><span id="calc-c">0</span> г</dd></div>
        </dl>
        <p class="calc__bmr">Базовый обмен (BMR): <span id="calc-bmr">0</span> ккал</p>
        <a class="btn btn--primary btn--block" href="#lead" id="calc-cta">Получить план питания</a>
      </div>
      <p class="note">${esc(K.disclaimer)}</p>
    </form>
  </div>
</section>`;
}

function benefits() {
  const B = C.benefits;
  return `<section class="section" id="benefits">
  <div class="container">
    <div class="section__head reveal"><h2>${esc(B.title)}</h2></div>
    <ul class="benefits">
      ${B.items
        .map(
          (b) => `<li class="benefit reveal">
        <span class="benefit__icon">${icon(b.icon)}</span>
        <h3 class="benefit__title">${esc(b.title)}</h3>
        <p>${esc(b.text)}</p>
      </li>`
        )
        .join('\n')}
    </ul>
  </div>
</section>`;
}

function gallery() {
  const G = C.gallery;
  return `<section class="section section--alt" id="gallery">
  <div class="container">
    <div class="section__head reveal">
      <h2>${esc(G.title)}</h2>
      ${G.subtitle ? `<p>${esc(G.subtitle)}</p>` : ''}
    </div>
    <ul class="gallery">
      ${G.items
        .map(
          (g, i) => `<li><a class="gallery__item" href="${esc(g.full || g.src)}" data-index="${i}" aria-label="Открыть фото: ${esc(g.alt)}">
        <img src="${esc(g.src)}" alt="${esc(g.alt)}" width="${g.width || 600}" height="${g.height || 600}" loading="lazy" decoding="async">
      </a></li>`
        )
        .join('\n')}
    </ul>
  </div>
</section>`;
}

function reviews() {
  const R = C.reviews;
  const n = R.initialVisibleMobile || 3;
  const initials = (name) =>
    String(name)
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  const items = R.items
    .map(
      (r, i) => `<li class="card review${i >= n ? ' is-extra' : ''} reveal">
      <div class="review__head">
        ${
          r.photo
            ? `<img class="review__avatar" src="${esc(r.photo)}" alt="" width="48" height="48" loading="lazy" decoding="async">`
            : `<span class="review__avatar review__avatar--initials" aria-hidden="true">${esc(initials(r.name))}</span>`
        }
        <p class="review__name">${esc(r.name)}</p>
        ${r.result ? `<p class="review__result">${icon('check', 'icon icon--sm')}${esc(r.result)}</p>` : ''}
      </div>
      <p class="review__text">${esc(r.text)}</p>
    </li>`
    )
    .join('\n');
  return `<section class="section" id="reviews">
  <div class="container">
    <div class="section__head reveal">
      <h2>${esc(R.title)}</h2>
      ${R.subtitle ? `<p>${esc(R.subtitle)}</p>` : ''}
    </div>
    <ul class="reviews" id="reviews-list">${items}</ul>
    <div class="reviews__actions">
      ${R.items.length > n ? '<button class="btn btn--outline reviews__more" type="button" aria-controls="reviews-list" aria-expanded="false">Показать ещё</button>' : ''}
      ${C.contacts.telegramChannel ? `<a class="link-tg" href="${esc(C.contacts.telegramChannel)}" target="_blank" rel="noopener">${TG_ICON}<span>${esc(R.channelLabel)}</span></a>` : ''}
    </div>
  </div>
</section>`;
}

function faq() {
  const F = C.faq;
  return `<section class="section section--alt" id="faq">
  <div class="container container--narrow">
    <div class="section__head reveal"><h2>${esc(F.title)}</h2></div>
    <div class="faq">
      ${F.items
        .map(
          (f) => `<details class="faq__item">
        <summary>${esc(f.q)}<span class="faq__plus" aria-hidden="true"></span></summary>
        <p>${esc(f.a)}</p>
      </details>`
        )
        .join('\n')}
    </div>
  </div>
</section>`;
}

function lead() {
  const L = C.lead;
  const success = esc(L.successText).replace('{hours}', esc(C.form.responseHours));
  return `<section class="section lead" id="lead" data-goal-view="form_open">
  <div class="container lead__grid">
    <div class="lead__intro reveal">
      <h2>${esc(L.title)}</h2>
      <p>${esc(L.subtitle)}</p>
      <div class="lead__alt">
        <p class="lead__alt-title">${esc(L.altLabel)}</p>
        <div class="lead__alt-btns">
          <a class="btn btn--tg" href="${esc(tgHref)}" target="_blank" rel="noopener" data-goal="telegram_click">${TG_ICON}<span>Telegram</span></a>
          ${C.contacts.whatsapp ? `<a class="btn btn--wa" href="${esc(C.contacts.whatsapp)}" target="_blank" rel="noopener" data-goal="whatsapp_click">${WA_ICON}<span>WhatsApp</span></a>` : ''}
        </div>
      </div>
    </div>
    <div class="card lead__card reveal">
      <form class="form" id="lead-form" action="${esc(FORM_ENDPOINT || '#')}" method="post" novalidate>
        <div class="field">
          <label class="label" for="f-name">Имя <span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="f-name" name="name" type="text" autocomplete="given-name" maxlength="60" required aria-describedby="f-name-err">
          <p class="field__error" id="f-name-err"></p>
        </div>
        <div class="field">
          <label class="label" for="f-phone">Телефон <span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" required aria-describedby="f-phone-err">
          <p class="field__error" id="f-phone-err"></p>
        </div>
        <div class="field">
          <label class="label" for="f-tg">Ник в Telegram <span class="opt">необязательно</span></label>
          <input class="input" id="f-tg" name="telegram" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="@username" maxlength="33" aria-describedby="f-tg-err">
          <p class="field__error" id="f-tg-err"></p>
        </div>
        <div class="field">
          <label class="label" for="f-goal">Цель</label>
          <select class="input" id="f-goal" name="goal">
            ${L.goals.map((g) => `<option value="${esc(g.value)}">${esc(g.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label" for="f-comment">Комментарий <span class="opt">необязательно</span></label>
          <input class="input" id="f-comment" name="comment" type="text" maxlength="300" placeholder="Аллергии, ограничения, пожелания">
        </div>
        <div class="field field--check">
          <label class="check">
            <input type="checkbox" id="f-consent" name="consent" value="1" required aria-describedby="f-consent-err">
            <span>Я согласен(на) на обработку персональных данных в соответствии с <a href="privacy.html" target="_blank">политикой конфиденциальности</a></span>
          </label>
          <p class="field__error" id="f-consent-err"></p>
        </div>
        <div class="hp" aria-hidden="true">
          <label for="f-website">Не заполняйте это поле</label>
          <input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off">
        </div>
        <input type="hidden" name="program" id="f-program">
        <input type="hidden" name="calc" id="f-calc">
        <input type="hidden" name="utm_source"><input type="hidden" name="utm_medium"><input type="hidden" name="utm_campaign"><input type="hidden" name="utm_content"><input type="hidden" name="utm_term">
        <input type="hidden" name="page" id="f-page">
        <input type="hidden" name="ts" id="f-ts">
        <p class="form__error" id="form-error" role="alert"></p>
        <button class="btn btn--primary btn--block btn--lg" type="submit" id="f-submit"><span class="btn__label">${esc(L.submit)}</span><span class="spinner" aria-hidden="true"></span></button>
      </form>
      <div class="success" id="lead-success" hidden tabindex="-1">
        <span class="success__icon">${icon('check')}</span>
        <h3>${esc(L.successTitle)}</h3>
        <p>${success}</p>
        <a class="btn btn--tg" href="${esc(tgHref)}" target="_blank" rel="noopener" data-goal="telegram_click">${TG_ICON}<span>Написать в Telegram</span></a>
      </div>
    </div>
  </div>
</section>`;
}

function overlays() {
  return `<div class="sticky-cta" id="sticky-cta" aria-hidden="true">
  <a class="btn btn--primary btn--block" href="#lead" tabindex="-1" data-goal="cta_sticky">Записаться</a>
</div>
<div class="cookie" id="cookie" hidden>
  <p>Мы используем cookie и Яндекс.Метрику, чтобы сайт работал лучше. <a href="privacy.html">Подробнее</a></p>
  <div class="cookie__btns">
    <button class="btn btn--sm btn--light" type="button" data-cookie="accept">Принять</button>
    <button class="btn btn--sm btn--ghost-light" type="button" data-cookie="decline">Отклонить</button>
  </div>
</div>`;
}

function clientConfig() {
  const cfg = {
    demo: !!C.demo,
    endpoint: FORM_ENDPOINT,
    rateLimitSeconds: C.form.rateLimitSeconds || 60,
    analytics: C.analytics,
    gallery: C.gallery.items.map((g) => ({ src: g.full || g.src, alt: g.alt })),
    programs: Object.fromEntries(C.programs.items.map((p) => [p.id, p.name])),
  };
  return `<script>window.SITE_CONFIG=${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>`;
}

/* ---------- pages ---------- */

function homePage() {
  return `${head({ title: C.site.title, description: C.site.description, canonical: `${siteUrl}/`, isHome: true })}
<body>
<a class="skip" href="#programs">Перейти к программам</a>
${demoBar()}
${header(true)}
<main>
${hero()}
${programs()}
${calculator()}
${benefits()}
${gallery()}
${reviews()}
${faq()}
${lead()}
</main>
${footer(true)}
${overlays()}
${clientConfig()}
<script src="assets/js/main.js" defer></script>
</body>
</html>
`;
}

function legalPage(file, title) {
  const co = C.company;
  const vars = {
    date: C.legal.revisionDate || new Date().toLocaleDateString('ru-RU'),
    legalName: co.legalName,
    inn: co.inn,
    ogrn: co.ogrn,
    address: co.address,
    email: C.contacts.email,
    phone: C.contacts.phone,
    siteUrl,
  };
  const body = fs
    .readFileSync(path.join(ROOT, 'content', 'legal', file), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{(\w+)\}\}/g, (_, k) => esc(vars[k] ?? ''));
  const description = `${title} — ${C.site.brand}`;
  return `${head({ title: description, description, canonical: `${siteUrl}/${file}`, isHome: false })}
<body class="page-legal">
${demoBar()}
${header(false)}
<main class="container container--narrow legal">
<p><a class="back" href="index.html">← На главную</a></p>
${body}
</main>
${footer(false)}
</body>
</html>
`;
}

/* ---------- static files ---------- */

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [`${siteUrl}/`, `${siteUrl}/privacy.html`];
  if (C.legal.showOffer) urls.push(`${siteUrl}/offer.html`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u, i) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod><priority>${i ? '0.3' : '1.0'}</priority></url>`).join('\n')}
</urlset>
`;
}

function robots() {
  if (C.demo) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

/* ---------- checks ---------- */

function checks() {
  const w = [];
  if (C.demo) w.push('Включён демо-режим ("demo": true): на сайте плашка «Демо», индексация закрыта. Перед запуском поставьте false.');
  if (!FORM_ENDPOINT) w.push('Форма не подключена: задайте переменные TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в Vercel (или form.endpoint). Пока отправка имитируется.');
  if (!C.analytics.yandexMetrikaId && !C.analytics.ga4Id) w.push('Не подключена аналитика (analytics.yandexMetrikaId / ga4Id).');
  if (/example\.ru/.test(siteUrl)) w.push('site.url — заглушка example.ru: Open Graph и sitemap будут вести не туда.');
  const json = JSON.stringify(C);
  if (/your_username|your_channel|your_group|your_account|79990000000/.test(json)) w.push('В contacts остались заглушки (your_username, 79990000000 и т. п.).');
  if (/0{10,}/.test(C.company.inn + C.company.ogrn)) w.push('Реквизиты компании (ИНН/ОГРН) не заполнены.');
  if (C.gallery.items.length < 8) w.push(`В галерее ${C.gallery.items.length} фото — по ТЗ нужно минимум 8.`);
  for (const g of [C.hero.image, ...C.gallery.items]) {
    for (const p of [g.src, g.full].filter(Boolean)) {
      if (!fs.existsSync(path.join(SRC, p))) w.push(`Файл не найден: src/${p}`);
    }
    if (!g.alt) w.push(`Нет alt у изображения ${g.src}`);
  }
  if (C.hero.title.split(/\s+/).filter((x) => /[\wа-яё]/i.test(x)).length > 8) w.push('Заголовок первого экрана длиннее 8 слов.');
  return w;
}

/* ---------- build ---------- */

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));
  fs.mkdirSync(path.join(DIST, 'assets', 'js'), { recursive: true });
  fs.copyFileSync(path.join(SRC, 'main.js'), path.join(DIST, 'assets', 'js', 'main.js'));
  if (fs.existsSync(path.join(SRC, 'assets', 'img', 'favicon.ico'))) {
    fs.copyFileSync(path.join(SRC, 'assets', 'img', 'favicon.ico'), path.join(DIST, 'favicon.ico'));
  }
  // серверная часть (PHP-обработчик формы и настройки Apache)
  // на Vercel заявки принимает api/lead.js, PHP-файлы не нужны
  for (const f of ON_VERCEL ? [] : ['send.php', 'send.config.php', '.htaccess']) {
    const p = path.join(ROOT, 'server', f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(DIST, f));
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), homePage());
  fs.writeFileSync(path.join(DIST, 'privacy.html'), legalPage('privacy.html', 'Политика конфиденциальности'));
  if (C.legal.showOffer) fs.writeFileSync(path.join(DIST, 'offer.html'), legalPage('offer.html', 'Публичная оферта'));
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap());
  fs.writeFileSync(path.join(DIST, 'robots.txt'), robots());

  console.log('✔ Сайт собран в папку dist/');
  const w = checks();
  if (w.length) {
    console.log(`\nПеред запуском проверьте (${w.length}):`);
    w.forEach((x) => console.log('  • ' + x));
  }
}

function serve(port) {
  const http = require('http');
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  };
  http
    .createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(DIST, path.normalize(p).replace(/^(\.\.[\\/])+/, ''));
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Не найдено');
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(port, () => console.log(`\n→ http://localhost:${port}  (Ctrl+C — остановить)`));
}

build();
if (process.argv.includes('--serve')) {
  const i = process.argv.indexOf('--port');
  serve(i > -1 ? Number(process.argv[i + 1]) : 8080);
}
