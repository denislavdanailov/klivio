// ── Test all 7 active Brevo accounts via HTTP API ──
const { ACTIVE_ACCOUNTS } = require('./accounts');
const { brevoSend } = require('./sender');

const TARGET = 'danailovd48@gmail.com';

async function testAll() {
  console.log(`Testing ${ACTIVE_ACCOUNTS.length} active accounts → ${TARGET}\n`);

  for (const acc of ACTIVE_ACCOUNTS) {
    const subject = `[TEST] Klivio — ${acc.name} (${acc.email})`;
    const body = `Hi!\n\nThis is a test email from ${acc.name} at Klivio.\nSent via: ${acc.email}\nMethod: Brevo HTTP API\nTime: ${new Date().toISOString()}\n\nIf you see this, the account works!\n\n— ${acc.name}, Klivio`;

    try {
      const result = await brevoSend(acc.apiKey, acc.email, `${acc.name} from Klivio`, TARGET, subject, body);
      console.log(`✅ ${acc.name} (${acc.email}) — SENT | messageId: ${result.data.messageId || 'ok'}`);
    } catch (err) {
      console.log(`❌ ${acc.name} (${acc.email}) — FAILED: ${err.message}`);
    }

    // Small delay between sends
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\nDone! Check danailovd48@gmail.com for results.');
}

testAll();
