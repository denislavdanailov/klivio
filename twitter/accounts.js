// ── Klivio X Accounts ──
// Add credentials for each X account.
// Each account posts ~10 tweets/day = safe from suspension.
// 4 accounts = 40 tweets/day, 8 accounts = 80 tweets/day.
//
// How to create more accounts:
// 1. New X account (different email/phone)
// 2. developer.twitter.com → New Project → New App → Keys & Tokens
// 3. Add here + in .env
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const ACCOUNTS = [
  {
    id:                'klivio_main',
    handle:            '@KlivioAI',
    dailyLimit:        10,
    apiKey:            process.env.X_API_KEY,
    apiSecret:         process.env.X_API_SECRET,
    accessToken:       process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET,
    bearerToken:       process.env.X_BEARER_TOKEN,
    active:            !!(process.env.X_API_KEY),
  },
  // Add more accounts as you create them:
  // {
  //   id: 'klivio_2',
  //   handle: '@KlivioGrowth',
  //   dailyLimit: 10,
  //   apiKey:            process.env.X2_API_KEY,
  //   apiSecret:         process.env.X2_API_SECRET,
  //   accessToken:       process.env.X2_ACCESS_TOKEN,
  //   accessTokenSecret: process.env.X2_ACCESS_TOKEN_SECRET,
  //   bearerToken:       process.env.X2_BEARER_TOKEN,
  //   active:            !!(process.env.X2_API_KEY),
  // },
  // {
  //   id: 'klivio_3',
  //   handle: '@KlivioUK',
  //   dailyLimit: 10,
  //   apiKey:            process.env.X3_API_KEY,
  //   apiSecret:         process.env.X3_API_SECRET,
  //   accessToken:       process.env.X3_ACCESS_TOKEN,
  //   accessTokenSecret: process.env.X3_ACCESS_TOKEN_SECRET,
  //   bearerToken:       process.env.X3_BEARER_TOKEN,
  //   active:            !!(process.env.X3_API_KEY),
  // },
  // {
  //   id: 'klivio_4',
  //   handle: '@KlivioLeads',
  //   dailyLimit: 10,
  //   apiKey:            process.env.X4_API_KEY,
  //   apiSecret:         process.env.X4_API_SECRET,
  //   accessToken:       process.env.X4_ACCESS_TOKEN,
  //   accessTokenSecret: process.env.X4_ACCESS_TOKEN_SECRET,
  //   bearerToken:       process.env.X4_BEARER_TOKEN,
  //   active:            !!(process.env.X4_API_KEY),
  // },
];

const ACTIVE_ACCOUNTS = ACCOUNTS.filter(a => a.active);

module.exports = { ACCOUNTS, ACTIVE_ACCOUNTS };
