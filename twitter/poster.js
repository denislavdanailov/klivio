// ── Klivio X Poster — posts tweets via X API v2 ──
// OAuth 1.0a (required for posting tweets)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const https = require('https');
const crypto = require('crypto');

// Default single-account creds (legacy support)
const CREDS = {
  apiKey:            process.env.X_API_KEY,
  apiSecret:         process.env.X_API_SECRET,
  accessToken:       process.env.X_ACCESS_TOKEN,
  accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
  bearerToken:       process.env.X_BEARER_TOKEN,
};

// ── OAuth 1.0a signature ──────────────────────────────────────────────────────
function oauthSign(method, url, params, creds) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts    = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key:     creds.apiKey,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        ts,
    oauth_token:            creds.accessToken,
    oauth_version:          '1.0',
  };

  const allParams = { ...params, ...oauthParams };
  const sorted = Object.keys(allParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const base = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(sorted)].join('&');
  const sigKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessTokenSecret)}`;
  const sig = crypto.createHmac('sha1', sigKey).update(base).digest('base64');

  oauthParams.oauth_signature = sig;

  const header = 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');

  return header;
}

// ── Post a tweet ──────────────────────────────────────────────────────────────
function postTweet(text) {
  return new Promise((resolve, reject) => {
    if (!CREDS.apiKey) return reject(new Error('X API keys not configured. See README.'));

    const url     = 'https://api.twitter.com/2/tweets';
    const body    = JSON.stringify({ text });
    const authHdr = oauthSign('POST', url, {}, CREDS);

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization':  authHdr,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ id: json.data?.id, text: json.data?.text });
          } else {
            reject(new Error(`X API ${res.statusCode}: ${json.detail || json.title || d.slice(0, 100)}`));
          }
        } catch { reject(new Error('Invalid X API response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('X API timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Search recent tweets (Bearer token — app-only) ───────────────────────────
function searchTweets(query, { maxResults = 20 } = {}) {
  return new Promise((resolve, reject) => {
    if (!CREDS.bearerToken) return reject(new Error('X_BEARER_TOKEN not set'));

    const q   = encodeURIComponent(query + ' lang:en -is:retweet');
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${q}&max_results=${maxResults}&tweet.fields=author_id,created_at,text&expansions=author_id&user.fields=name,username,description`;

    https.get(url, {
      headers: { Authorization: `Bearer ${CREDS.bearerToken}` },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const users = {};
          (json.includes?.users || []).forEach(u => { users[u.id] = u; });
          const tweets = (json.data || []).map(t => ({
            id:       t.id,
            text:     t.text,
            username: users[t.author_id]?.username || '',
            name:     users[t.author_id]?.name || '',
            bio:      users[t.author_id]?.description || '',
          }));
          resolve(tweets);
        } catch { resolve([]); }
      });
      res.on('error', () => resolve([]));
    }).on('error', () => resolve([]));
  });
}

// ── Reply to a tweet ──────────────────────────────────────────────────────────
function replyToTweet(tweetId, text) {
  return new Promise((resolve, reject) => {
    if (!CREDS.apiKey) return reject(new Error('X API keys not configured'));

    const url  = 'https://api.twitter.com/2/tweets';
    const body = JSON.stringify({ text, reply: { in_reply_to_tweet_id: tweetId } });
    const auth = oauthSign('POST', url, {}, CREDS);

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization':  auth,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ id: json.data?.id });
          else reject(new Error(`X ${res.statusCode}: ${json.detail || d.slice(0,80)}`));
        } catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Post using a specific account object
function postTweetAs(account, text) {
  return postTweetWithCreds(text, account);
}

function postTweetWithCreds(text, creds) {
  return new Promise((resolve, reject) => {
    if (!creds.apiKey) return reject(new Error(`No API key for account`));
    const url     = 'https://api.twitter.com/2/tweets';
    const body    = JSON.stringify({ text });
    const authHdr = oauthSign('POST', url, {}, creds);
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Authorization': authHdr, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ id: json.data?.id, text: json.data?.text });
          else reject(new Error(`X ${res.statusCode}: ${json.detail || json.title || d.slice(0,100)}`));
        } catch { reject(new Error('Invalid X API response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = { postTweet, postTweetAs, searchTweets, replyToTweet, CREDS };
