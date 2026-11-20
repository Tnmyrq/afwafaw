/**
 * Vercel Serverless Function: приём заявок с лендинга → Telegram и/или вебхук CRM.
 * Адрес: POST /api/lead (application/x-www-form-urlencoded или JSON).
 *
 * Переменные окружения (Vercel → Project → Settings → Environment Variables):
 *   TELEGRAM_BOT_TOKEN   токен бота от @BotFather
 *   TELEGRAM_CHAT_ID     id чата/группы менеджеров (у групп начинается с -100…)
 *   TELEGRAM_THREAD_ID   (необязательно) id темы в группе
 *   WEBHOOK_URL          (необязательно) адрес CRM / Make / n8n — уйдёт JSON заявки
 *   ALLOWED_ORIGINS      (необязательно) список доменов через запятую: https://site.ru,https://www.site.ru
 *   RATE_LIMIT_SECONDS   (необязательно, по умолчанию 60)
 *   MIN_FILL_SECONDS     (необязательно, по умолчанию 2)
 */
'use strict';

// Ограничение частоты в памяти инстанса: базовая защита (инстансы serverless живут недолго,
// поэтому дополнительно работают honeypot, время заполнения и лимит в браузере).
const lastByIp = new Map();

function send(res, code, data) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel уже распарсил
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').slice(0, 20000);
  const type = String(req.headers['content-type'] || '');
  if (type.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

const clean = (v, max = 300) =>
  (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function post(url, payload) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' });

  const env = process.env;
  if (!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) && !env.WEBHOOK_URL) {
    return send(res, 500, { ok: false, error: 'not_configured' });
  }

  const origin = req.headers.origin || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && origin && !allowed.includes(origin)) return send(res, 403, { ok: false, error: 'forbidden' });

  const b = await readBody(req);

  // антиспам: honeypot и слишком быстрое заполнение — «принимаем», но не отправляем
  if (clean(b.website)) return send(res, 200, { ok: true });
  if ((parseInt(b.ts, 10) || 0) < Number(env.MIN_FILL_SECONDS || 2)) return send(res, 200, { ok: true });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const limit = Number(env.RATE_LIMIT_SECONDS || 60) * 1000;
  const now = Date.now();
  if (now - (lastByIp.get(ip) || 0) < limit) return send(res, 429, { ok: false, error: 'too_many_requests' });

  // валидация
  const name = clean(b.name, 60);
  let digits = clean(b.phone, 30).replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
  const telegram = clean(b.telegram, 33);
  const errors = [];
  if (name.length < 2) errors.push('name');
  if (!/^7\d{10}$/.test(digits)) errors.push('phone');
  if (telegram && !/^@?[A-Za-z0-9_]{5,32}$/.test(telegram)) errors.push('telegram');
  if (String(b.consent) !== '1') errors.push('consent');
  if (errors.length) return send(res, 422, { ok: false, error: 'validation', fields: errors });

  const phone = `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  const lead = {
    'Имя': name,
    'Телефон': phone,
    'Telegram': telegram,
    'Цель': clean(b.goal_label, 80) || clean(b.goal, 30),
    'Программа': clean(b.program, 80),
    'Комментарий': clean(b.comment, 300),
    'Калькулятор': clean(b.calc, 200),
    utm_source: clean(b.utm_source, 200),
    utm_medium: clean(b.utm_medium, 200),
    utm_campaign: clean(b.utm_campaign, 200),
    utm_content: clean(b.utm_content, 200),
    utm_term: clean(b.utm_term, 200),
    'Страница': clean(b.page, 500),
    'Время': new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
  };

  let delivered = 0;

  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const lines = ['<b>🆕 Заявка с сайта</b>'];
    for (const [k, v] of Object.entries(lead)) if (v) lines.push(`<b>${escHtml(k)}:</b> ${escHtml(v)}`);
    const payload = {
      chat_id: env.TELEGRAM_CHAT_ID,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (env.TELEGRAM_THREAD_ID) payload.message_thread_id = Number(env.TELEGRAM_THREAD_ID);
    if (await post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, payload)) delivered++;
  }

  if (env.WEBHOOK_URL) {
    if (await post(env.WEBHOOK_URL, lead)) delivered++;
  }

  if (!delivered) return send(res, 502, { ok: false, error: 'delivery_failed' });

  lastByIp.set(ip, now);
  if (lastByIp.size > 5000) lastByIp.clear();
  return send(res, 200, { ok: true });
};
