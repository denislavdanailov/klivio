require('dotenv').config();
const https = require('https');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT  = process.env.TELEGRAM_CHAT_ID;

const text = `✅ *Klivio системата е свързана\\!*

Telegram известията работят\\.
Ще получаваш ежедневен отчет всяка сутрин в 08:00\\.

📊 *Конфигурация:*
• Groq AI: активен
• Brevo акаунти: 12 активни
• Leads база: готова

_Klivio — AI That Works While You Sleep_`;

const payload = JSON.stringify({ chat_id: CHAT, text, parse_mode: 'MarkdownV2' });

const req = https.request({
  hostname: 'api.telegram.org',
  path: `/bot${TOKEN}/sendMessage`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const r = JSON.parse(d);
    if (r.ok) console.log('✅ Telegram работи! Провери телефона си.');
    else console.log('❌ Грешка:', r.description);
  });
});
req.on('error', e => console.log('❌ Network error:', e.message));
req.write(payload);
req.end();
