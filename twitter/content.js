// ── Klivio X Content Generator ──
// Generates viral-optimised tweets using Groq (free)
// 6 tweet types rotating daily
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');

const GROQ_KEY = process.env.GROQ_API_KEY;

// ── Tweet types & prompts ─────────────────────────────────────────────────────
const TWEET_TYPES = [

  {
    type: 'pain',
    weight: 3, // posted more often
    prompt: () => `Write a single tweet (max 240 chars) for Klivio — an AI automation company for UK small businesses.

Topic: A specific, painful thing that happens when a small business doesn't respond fast enough to leads.
Industry: Pick one randomly from: dental practice, estate agent, solicitor, gym, restaurant, plumber.
Style: Specific, punchy, loss-framed. Start with the loss. Use a real-sounding number (£ amount or %).
No emojis at the start. Can have 1-2 at most total.
No hashtags in the tweet body (add separately).
End with a short gut-punch line or rhetorical question.
Output ONLY the tweet text. No quotes.`,
  },

  {
    type: 'social_proof',
    weight: 2,
    prompt: () => `Write a single tweet (max 240 chars) for Klivio — AI automation for UK SMBs.

Topic: A result one of our clients got after installing AI (lead responder / voice assistant / chatbot).
Make up a realistic UK business name + city + result with numbers.
Style: Specific outcome first, then the "how". Sounds like a real case study.
No hashtags in body. Max 1 emoji.
Output ONLY the tweet text. No quotes.`,
  },

  {
    type: 'insight',
    weight: 2,
    prompt: () => `Write a single tweet (max 240 chars) for Klivio.

Topic: A surprising or counterintuitive insight about AI automation for small businesses in the UK.
Style: Sounds like something a smart founder discovered, not marketing copy.
Avoid words: "game-changer", "revolutionary", "unlock", "leverage".
No hashtags. Max 1 emoji.
Output ONLY the tweet text. No quotes.`,
  },

  {
    type: 'thread_hook',
    weight: 2,
    prompt: () => `Write the FIRST tweet of a thread (max 240 chars) for Klivio.

Topic: Something like "3 reasons dental practices lose 30% of new patients" or "How a Manchester gym added £4K/mo without hiring staff".
Style: Strong hook that makes people want to click "show more". End with a colon or "Thread 🧵".
No hashtags in this tweet.
Output ONLY the first tweet text. No quotes.`,
  },

  {
    type: 'cta',
    weight: 1,
    prompt: () => `Write a single tweet (max 240 chars) for Klivio — AI employees for UK small businesses.

Topic: Direct but not pushy call to action. Target: UK business owners (dental, legal, estate agents, gyms).
Include: klivio.netlify.app
Style: Specific audience + specific problem + link. Feels human, not like an ad.
Max 1 emoji. No hashtags in body.
Output ONLY the tweet text. No quotes.`,
  },

  {
    type: 'meme_format',
    weight: 1,
    prompt: () => `Write a single tweet (max 240 chars) in a relatable meme format for UK small business owners.

Topic: The contrast between how they THINK leads work vs how they actually work (speed matters, after-hours matters).
Style: Short, punchy, slightly funny. Two-line contrast format works well. Very human voice.
No hashtags. Max 2 emojis.
Output ONLY the tweet text. No quotes.`,
  },

];

// Hashtag pool — added after generation
const HASHTAG_SETS = [
  ['#SmallBusiness', '#UKBusiness'],
  ['#AI', '#BusinessAutomation'],
  ['#LeadGeneration', '#UKStartup'],
  ['#DentalMarketing', '#MedSpa'],
  ['#EstateAgent', '#PropertyUK'],
  ['#LawFirm', '#LegalMarketing'],
  ['#GymOwner', '#FitnessMarketing'],
  ['#SME', '#UKEntrepreneur'],
];

function pickHashtags() {
  return HASHTAG_SETS[Math.floor(Math.random() * HASHTAG_SETS.length)].join(' ');
}

// Pick tweet type using weights
function pickType() {
  const pool = [];
  for (const t of TWEET_TYPES) pool.push(...Array(t.weight).fill(t));
  return pool[Math.floor(Math.random() * pool.length)];
}

function callGroq(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 120,
      temperature: 0.92,
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
      timeout: 20000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).choices?.[0]?.message?.content?.trim() || null); }
        catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

async function generateTweet({ type = null, addHashtags = true } = {}) {
  const tweetType = type ? TWEET_TYPES.find(t => t.type === type) || pickType() : pickType();
  const text = await callGroq(tweetType.prompt());
  if (!text) throw new Error('Groq returned null');

  // Clean up AI artifacts
  let clean = text.replace(/^["']|["']$/g, '').replace(/^Tweet:\s*/i, '').trim();

  const hashtags = addHashtags ? '\n\n' + pickHashtags() : '';
  const full = clean + hashtags;

  return { text: full, type: tweetType.type, raw: clean };
}

// Generate a batch of tweets for scheduling
async function generateDailyBatch(count = 5) {
  const tweets = [];
  // Ensure variety — use each type at least once for larger batches
  const types = ['pain', 'social_proof', 'insight', 'thread_hook', 'cta'];
  for (let i = 0; i < count; i++) {
    const type = i < types.length ? types[i] : null;
    try {
      const tweet = await generateTweet({ type, addHashtags: true });
      tweets.push(tweet);
    } catch (err) {
      console.error(`Failed to generate tweet ${i + 1}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 800));
  }
  return tweets;
}

module.exports = { generateTweet, generateDailyBatch, TWEET_TYPES };
