// ── Test Send — 1 имейл от всеки акаунт ──
// node leadgen/test-send.js
const { sendFromAccount, randomDelay } = require('./sender');
const { ACTIVE_ACCOUNTS } = require('./accounts');

const TEST_EMAIL = 'danailovd48@gmail.com';

async function runTests() {
  console.log(`\nKlivio Test Send — ${ACTIVE_ACCOUNTS.length} акаунта → ${TEST_EMAIL}\n`);
  console.log('─'.repeat(60));

  let passed = 0, failed = 0;

  for (let i = 0; i < ACTIVE_ACCOUNTS.length; i++) {
    const account = ACTIVE_ACCOUNTS[i];
    const subject = `Test ${i + 1}/${ACTIVE_ACCOUNTS.length} — ${account.name} (${account.provider})`;
    const body = `This is a test email from the Klivio sending system.

Account: ${account.name}
Email: ${account.email}
Provider: ${account.provider}
Test #: ${i + 1} of ${ACTIVE_ACCOUNTS.length}

If you received this, the account is working correctly.

— Klivio System Test`;

    process.stdout.write(`[${i + 1}/${ACTIVE_ACCOUNTS.length}] ${account.name} (${account.provider}) ... `);

    const result = await sendFromAccount(account, TEST_EMAIL, subject, body);

    if (result.ok) {
      console.log('✅ OK');
      passed++;
    } else {
      console.log(`❌ FAIL: ${result.reason}`);
      failed++;
    }

    // Delay между изпращания (освен за последния)
    if (i < ACTIVE_ACCOUNTS.length - 1) {
      await new Promise(r => setTimeout(r, 3000)); // 3 сек за тест
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`Резултат: ✅ ${passed} успешни  ❌ ${failed} неуспешни`);
  console.log(`Провери ${TEST_EMAIL} за получените имейли.\n`);
}

runTests().catch(console.error);
