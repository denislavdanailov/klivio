// ── Klivio X Lead Finder ──
// Searches X for business owners expressing pain points → saves as leads
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const { searchTweets } = require('./poster');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Search queries that surface business owners with relevant pain ─────────────
const LEAD_SEARCHES = [
  // Missed calls / leads pain
  '"missed calls" (dental OR dentist OR practice) -is:retweet',
  '"missed enquiries" (estate agent OR solicitor OR law firm) -is:retweet',
  '"no shows" (gym OR clinic OR studio) -is:retweet',
  '"can\'t keep up" ("leads" OR "enquiries") small business -is:retweet',
  // After-hours pain
  '"after hours" ("calls" OR "enquiries") business -is:retweet',
  '"answering calls" small business -is:retweet',
  // AI curiosity
  '"AI for my business" -is:retweet',
  '"chatbot" (dental OR estate OR solicitor) -is:retweet',
  // Hiring pain → automation opportunity
  '"can\'t afford" ("receptionist" OR "admin" OR "staff") business -is:retweet',
  '"need a receptionist" -is:retweet',
  // Direct intent
  '"looking for AI" business -is:retweet',
  '"automate" ("follow up" OR "leads" OR "emails") small business -is:retweet',
];

// ── Groq: score whether a tweet is from a business owner worth DMing ──────────
const GROQ_KEY = process.env.GROQ_API_KEY;

function groqScore(tweetText, bio) {
  return new Promise(resolve => {
    if (!GROQ_KEY) return resolve(5); // default mid score if no key

    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Score this X (Twitter) user as a lead for Klivio (AI automation for UK small businesses).

Tweet: "${tweetText}"
Bio: "${bio}"

Score 1-10:
- 8-10: Clear UK business owner expressing a pain Klivio solves (missed calls, slow follow-up, overwhelmed)
- 5-7: Possibly relevant but unclear
- 1-4: Not relevant (consumer, employee, student, USA-only, large corp)

Respond with ONLY a single integer (1-10). Nothing else.`,
      }],
      max_tokens: 3,
      temperature: 0.1,
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 10000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const score = parseInt(JSON.parse(d).choices?.[0]?.message?.content?.trim());
          resolve(isNaN(score) ? 5 : score);
        } catch { resolve(5); }
      });
    });
    req.on('error', () => resolve(5));
    req.on('timeout', () => { req.destroy(); resolve(5); });
    req.write(payload);
    req.end();
  });
}

// ── Groq: generate a reply comment (not DM, visible reply) ───────────────────
function generateReply(tweetText, username) {
  return new Promise(resolve => {
    if (!GROQ_KEY) return resolve(null);

    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Write a short X reply (max 220 chars) to this tweet from @${username}:

"${tweetText}"

You are replying as Klivio — an AI automation company for UK small businesses.
Goal: Acknowledge their pain genuinely, plant curiosity about AI solving it.
Do NOT pitch directly. Sound human, helpful, slightly curious.
Do NOT say "I completely understand" or "Great point".
Do NOT use emojis excessively. Max 1.
End with a soft question or observation that invites them to reply.
Output ONLY the reply text. No quotes.`,
      }],
      max_tokens: 80,
      temperature: 0.85,
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content?.trim() || null); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// ── Main: find leads, score them, generate replies ────────────────────────────
async function findXLeads({ maxPerSearch = 10, scoreThreshold = 7, dryRun = false } = {}) {
  const results = [];

  for (const query of LEAD_SEARCHES) {
    console.log(`\n[SEARCH] ${query}`);
    try {
      const tweets = await searchTweets(query, { maxResults: maxPerSearch });
      console.log(`  ${tweets.length} tweets found`);

      for (const t of tweets) {
        const score = await groqScore(t.text, t.bio);
        if (score < scoreThreshold) continue;

        const reply = await generateReply(t.text, t.username);
        results.push({ ...t, score, reply });
        console.log(`  ★ ${score}/10 @${t.username}: "${t.text.slice(0, 60)}..."`);
        if (reply) console.log(`    Reply: "${reply.slice(0, 80)}..."`);

        await sleep(500);
      }
    } catch (err) {
      console.log(`  [ERROR] ${err.message}`);
    }

    await sleep(2000);
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);
  console.log(`\nTotal hot leads: ${results.length}`);
  return results;
}

module.exports = { findXLeads, generateReply };
