// ── Klivio Inbox Test — sends 1 real email per active account to your Gmail ──
// node leadgen/test-inbox.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { ACTIVE_ACCOUNTS } = require('./accounts');
const { sendFromAccount } = require('./sender');
const { generateEmail } = require('./personalizer');

const TO = 'klivio.ai.employees@gmail.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 12 realistic fake leads — varied industries, all using updated product lineup
const FAKE_LEADS = [
  {
    business: 'Smile Studio Dental',
    contactName: 'Sarah Okafor',
    industry: 'dental',
    city: 'London',
    weakness: 'new patients have to call during office hours — no online booking on the site',
    productName: 'AI Lead Responder',
    productPrice: '£197/mo',
    upsell: 'Growth plan (2 AI workers) is £297/mo',
    websiteContext: {
      tagline: 'Trusted dental care in South London',
      established: '2014', specialties: ['invisalign', 'implants', 'whitening'],
      closedWeekend: true, callToBook: true,
      groqHook: 'you offer emergency implants but booking requires a phone call — meaning patients in pain after 6pm hit voicemail',
    },
  },
  {
    business: 'Prestige Properties Manchester',
    contactName: 'Mark Reynolds',
    industry: 'realestate',
    city: 'Manchester',
    weakness: 'property enquiries sent evenings/weekends almost certainly go unanswered',
    productName: 'AI Lead Responder',
    productPrice: '£197/mo',
    upsell: 'Growth plan (2 AI workers) is £297/mo',
    websiteContext: {
      tagline: "Manchester's most trusted estate agent since 2009",
      established: '2009', numLocations: 3, services: ['Sales', 'Lettings', 'Property Management'],
      groqHook: 'you list 140+ properties but have no way to capture an enquiry after 5:30pm',
    },
  },
  {
    business: 'Hamilton & Partners Solicitors',
    contactName: 'Claire Hamilton',
    industry: 'law',
    city: 'Leeds',
    weakness: 'no instant response for evening enquiries — contact form only',
    productName: 'AI Lead Responder',
    productPrice: '£197/mo',
    upsell: 'Growth plan (2 AI workers) is £297/mo',
    websiteContext: {
      tagline: 'Expert legal advice. No jargon.',
      established: '2007', specialties: ['family law', 'conveyancing', 'employment'],
      teamSize: 8, callToBook: true,
      groqHook: 'you handle family law cases — people in crisis search at 10pm and need a response before morning',
    },
  },
  {
    business: 'FitZone Performance Gym',
    contactName: 'Dan Cooper',
    industry: 'fitness',
    city: 'London',
    weakness: 'no automated follow-up — leads go cold within 48 hours of first enquiry',
    productName: 'Follow-Up Automator',
    productPrice: '£197/mo',
    upsell: 'Growth plan (2 AI workers) is £297/mo',
    websiteContext: {
      tagline: 'Train harder. Recover smarter.',
      services: ['PT Sessions', 'Group Classes', 'Nutrition Coaching'],
      reviewCount: '340', hasTestimonials: true,
      groqHook: 'you offer a free trial but the sign-up form has a 2-day response window — by then most leads have joined PureGym',
    },
  },
  {
    business: 'Digital Spark Agency',
    contactName: 'Tom Mackenzie',
    industry: 'digital-agency',
    city: 'London',
    weakness: 'no automated outreach system — new client pipeline relies entirely on referrals',
    productName: 'Cold Outreach Setup',
    productPrice: '£497/mo',
    upsell: 'Full System (3 AI workers) is also £497/mo',
    websiteContext: {
      tagline: 'We grow brands with data-driven digital marketing',
      established: '2016', services: ['SEO', 'PPC', 'Social Media', 'Email'],
      groqHook: 'you have 47 case studies but no outbound system — your pipeline is entirely dependent on who finds you',
    },
  },
  {
    business: 'Meridian Accounting Partners',
    contactName: 'James Whitfield',
    industry: 'accounting',
    city: 'Birmingham',
    weakness: 'no automated follow-up — tax season enquiries pile up and slow response loses clients',
    productName: 'Follow-Up Automator',
    productPrice: '£197/mo',
    upsell: 'Growth plan (2 AI workers) is £297/mo',
    websiteContext: {
      tagline: 'Cloud accounting for growing businesses',
      established: '2011', specialties: ['xero', 'r&d tax', 'payroll'],
      teamSize: 6, accreditation: 'ICAEW Chartered',
      groqHook: 'you are ICAEW chartered and serve 200+ clients but have no system to follow up new enquiries automatically',
    },
  },
  {
    business: 'Riverside Veterinary Clinic',
    contactName: 'Dr. James Patel',
    industry: 'veterinary',
    city: 'Bristol',
    weakness: 'no after-hours booking — pet owners in distress go straight to competitors',
    productName: 'AI Lead Responder',
    productPrice: '£197/mo',
    upsell: 'Growth plan (2 AI workers) is £297/mo',
    websiteContext: {
      tagline: 'Compassionate care for your pets',
      established: '2011', specialties: ['emergency', 'surgery', 'exotic animals'],
      closedWeekend: false, hasEmergency: true,
      groqHook: 'you treat exotic animals — those owners search at midnight in a panic and need someone to respond immediately',
    },
  },
  {
    business: 'Summit Business Coaching',
    contactName: 'Rachel Forbes',
    industry: 'coaching',
    city: 'Manchester',
    weakness: 'no automated follow-up after discovery calls — leads go cold without consistent touch',
    productName: 'Follow-Up Automator',
    productPrice: '£197/mo',
    upsell: 'Growth plan (2 AI workers) is £297/mo',
    websiteContext: {
      tagline: 'Scale your business without burning out',
      services: ['1-to-1 Coaching', 'Group Mastermind', 'Strategy Days'],
      reviewCount: '89',
      groqHook: 'you charge £3,000+ for your mastermind but discovery calls have no follow-up sequence — most leads need 3-5 touches before they commit',
    },
  },
  {
    business: 'Swift Recruitment Solutions',
    contactName: 'Ben Crawford',
    industry: 'recruitment',
    city: 'Leeds',
    weakness: 'no automated outreach — new client pipeline relies entirely on referrals and word of mouth',
    productName: 'Cold Outreach Setup',
    productPrice: '£497/mo',
    upsell: 'Full System (3 AI workers) is also £497/mo',
    websiteContext: {
      tagline: 'We fill roles in 10 days or less',
      established: '2013', services: ['Permanent', 'Temp', 'Executive Search'],
      groqHook: 'you guarantee roles filled in 10 days — that\'s a strong offer that most HR managers in Leeds have never heard',
    },
  },
  {
    business: 'AllShield Insurance Brokers',
    contactName: 'Lisa Thornton',
    industry: 'insurance',
    city: 'London',
    weakness: 'quote requests sit 24-48 hours — prospects compare 3 quotes and buy from whoever responds first',
    productName: 'Follow-Up Automator',
    productPrice: '£197/mo',
    upsell: 'Growth plan (2 AI workers) is £297/mo',
    websiteContext: {
      tagline: 'Independent brokers. Honest advice.',
      established: '2010', services: ['Business Insurance', 'Life Cover', 'Landlord Insurance'],
      groqHook: 'you are FCA authorised independent brokers — a £197 follow-up system on a £2,000 avg policy is a rounding error',
    },
  },
  {
    business: 'Apex Plumbing & Heating',
    contactName: 'Gary Walsh',
    industry: 'trades',
    city: 'London',
    weakness: 'phone goes unanswered during jobs — emergency callers ring competitors immediately',
    productName: 'Voice Assistant',
    productPrice: '£497/mo',
    upsell: 'Full System (3 AI workers) — same price, adds chatbot + lead responder',
    websiteContext: {
      tagline: '24/7 emergency plumbing across London',
      established: '2008', specialties: ['boiler repair', 'emergency callout'],
      phoneDependent: true, callToBook: true,
      groqHook: 'you advertise 24/7 emergency cover but the phone goes to voicemail when Gary is under a sink',
    },
  },
  {
    business: 'Glow Beauty Studio',
    contactName: 'Natalie Brooks',
    industry: 'beauty',
    city: 'London',
    weakness: 'clients book on impulse — no online booking means losing them in under 2 minutes',
    productName: 'AI Lead Responder',
    productPrice: '£197/mo',
    upsell: 'Growth plan adds Review & Referral System for £297/mo total',
    websiteContext: {
      tagline: 'Premium aesthetics in the heart of Chelsea',
      specialties: ['lip filler', 'botox', 'facials'],
      reviewCount: '210', hasTestimonials: true,
      groqHook: 'you have 210+ Google reviews and a Chelsea location — but there\'s no way to book after 7pm when most clients browse Instagram',
    },
  },
];

async function main() {
  const accounts = ACTIVE_ACCOUNTS;
  console.log(`\nSending to ${TO} from ${accounts.length} accounts...\n`);
  console.log('═'.repeat(60));

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const lead = { ...FAKE_LEADS[i % FAKE_LEADS.length], senderName: account.name };

    process.stdout.write(`[${String(i + 1).padStart(2)}] ${account.email.padEnd(30)} → `);

    try {
      const { subject, body } = await generateEmail(lead);
      const result = await sendFromAccount(account, TO, subject, body);
      if (result.ok) {
        console.log(`✓  "${subject}"`);
        sent++;
      } else {
        console.log(`✗  ${result.reason?.slice(0, 60)}`);
        failed++;
      }
    } catch (err) {
      console.log(`✗  ${err.message.slice(0, 60)}`);
      failed++;
    }

    if (i < accounts.length - 1) await sleep(2500 + Math.random() * 1500);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`Done. Sent: ${sent}  Failed: ${failed}`);
  console.log(`Check: ${TO}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
