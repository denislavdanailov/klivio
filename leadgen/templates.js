// ── Industry-specific cold email templates ──
// Each template has multiple variants to avoid spam filters
// Variables: {{name}}, {{business}}, {{sender}}, {{industry}}, {{unsubscribe}}
// Rules: MAX 75 words, NO "AI", PAS format, one soft close question

const TEMPLATES = {

  dental: {
    subject: [
      '{{business}} — missed calls during procedures',
      'Every missed call is a missed booking for {{business}}',
      '{{business}} — what happens when the phone rings mid-procedure?',
    ],
    body: [
      `Hi {{name}},

When your team is with a patient, every missed call is a missed booking — most callers don't leave voicemails, they just call the next clinic.

We built a 24/7 receptionist that answers every call for {{business}}, books appointments, and sends you a summary. Setup in 48 hours, no tech needed.

Worth a look?

{{sender}}
Klivio — klivio.online`,

      `Hi {{name}},

The average dental practice misses 30-40% of calls during procedures. At $375-500 per new patient, that's up to $8,000/month walking out.

We set up a system that answers every call for {{business}}, handles bookings, and works 24/7. Costs less than a receptionist's daily wage.

Could this help {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  realestate: {
    subject: [
      '{{business}} — leads going cold overnight?',
      'The 5-minute rule and {{business}}',
      '{{business}} — response time is costing you viewings',
    ],
    body: [
      `Hi {{name}},

Buyers who don't hear back within 5 minutes call three other agents. Most agencies reply in 2-4 hours — by then the lead is gone.

We built a system that responds to every enquiry for {{business}} in under 2 minutes, day or night. One agency added 15 extra viewings per month from after-hours leads alone.

Worth a look?

{{sender}}
Klivio — klivio.online`,

      `Hi {{name}},

Forty to sixty percent of online property leads go cold simply from slow response times — not because buyers lost interest.

We set up a system for {{business}} that qualifies every enquiry instantly, books callbacks, and never goes offline. Setup under a week, less than a part-time admin.

Is this something {{business}} could use?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  law: {
    subject: [
      '{{business}} — after-hours enquiries going elsewhere',
      'How {{business}} could capture more cases',
      '{{business}} — the cost of a slow first reply',
    ],
    body: [
      `Hi {{name}},

When someone needs a solicitor at 10pm, they don't leave a voicemail — they call the next firm on Google.

We help law firms like {{business}} capture every enquiry with a system that responds in under 2 minutes, qualifies the case, and books a consultation — day or night.

Worth a quick look?

{{sender}}
Klivio — klivio.online`,

      `Hi {{name}},

Most firms lose 60% of after-hours enquiries to competitors who reply faster — not because they're better, just quicker.

We set up a system for {{business}} that handles initial contact 24/7: responds instantly, asks the right qualifying questions, routes urgent matters to you. Live in under a week.

Could this help {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  restaurant: {
    subject: [
      '{{business}} — bookings missed during service',
      'What happens when the phone rings during rush at {{business}}?',
      '{{business}} — capturing bookings your team can\'t answer',
    ],
    body: [
      `Hi {{name}},

During peak service nobody can answer the phone — but that's exactly when customers call to book. A missed call at 7pm on a Friday is a table lost.

We set up a system that answers every call for {{business}}, handles reservations, and responds to enquiries 24/7. Setup 3-5 days, costs less than one evening's lost covers.

Worth a look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  fitness: {
    subject: [
      '{{business}} — website visitors leaving without booking',
      'How {{business}} could get 30% more trial sessions',
      '{{business}} — converting late-night website traffic',
    ],
    body: [
      `Hi {{name}},

When someone visits your website at 9pm thinking about joining, they browse, leave, and sign up with the gym that responded first.

We put a system on {{business}}'s website that engages visitors instantly and books trial sessions automatically — 24/7. Gyms using this see 30% more trial bookings within the first month.

Worth a quick look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  trades: {
    subject: [
      '{{business}} — missed jobs while you\'re on site',
      'What happens when you can\'t answer the phone on a job?',
      '{{business}} — never lose a lead to voicemail again',
    ],
    body: [
      `Hi {{name}},

When you're on a job site, the phone rings and you can't answer. By the time you call back, they've already booked someone else.

We built a system that answers {{business}}'s phone, takes the job details, qualifies the lead, and texts you a summary — all while you're working. No app, no tech. Live in 3-5 days.

Could this help {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  ecommerce: {
    subject: [
      '{{business}} — 70% of carts are abandoned. Here\'s a fix.',
      'Recovering lost sales for {{business}} automatically',
      '{{business}} — converting more browsers into buyers',
    ],
    body: [
      `Hi {{name}},

Seventy percent of online carts are abandoned — most shoppers just needed a quick answer or a small nudge before checkout.

We set up a system for {{business}} that engages visitors in real time, answers product questions, and recovers abandoned carts automatically. Stores using this recover 15-25% of lost sales.

Worth a look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  medical: {
    subject: [
      '{{business}} — patients calling after hours go elsewhere',
      'After-hours patient enquiries for {{business}}',
      '{{business}} — missed appointment requests cost more than you think',
    ],
    body: [
      `Hi {{name}},

When patients call after hours and reach voicemail, most don't leave a message — they book with the next clinic on Google.

We set up a system for {{business}} that answers calls 24/7, books appointments, and handles routine enquiries automatically. Practices using this capture 20-30% more appointments. Setup in under a week.

Worth a look?

{{sender}}
Klivio — klivio.online`,

      `Hi {{name}},

The average medical practice misses 35-40% of calls outside office hours. At $200-400 per patient visit, that adds up fast.

We built a 24/7 system for {{business}} that answers every call, books appointments, and only escalates genuine emergencies to you. No app, no tech to manage. Live in 3-5 days.

Could this help {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  finance: {
    subject: [
      '{{business}} — client enquiries going to faster advisers?',
      'Quick thought on after-hours leads for {{business}}',
      '{{business}} — the cost of a slow first reply',
    ],
    body: [
      `Hi {{name}},

When someone needs financial advice, they contact 2-3 firms. Research shows 74% go with whoever responds first — not necessarily whoever is best.

We set up a system for {{business}} that responds to every enquiry in under 2 minutes, qualifies the lead, and books a consultation — day or night, including weekends.

Worth a quick look?

{{sender}}
Klivio — klivio.online`,

      `Hi {{name}},

Most financial firms lose 50-60% of after-hours enquiries simply because no one replies until the next morning. By then, prospects have moved on.

We built a 24/7 response system for {{business}}: answers instantly, asks the right qualifying questions, books callbacks with your team. From $197/month. Cancel anytime.

Could this work for {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  accounting: {
    subject: [
      '{{business}} — leads slipping through after hours',
      'Quick thought for {{business}} about after-hours enquiries',
      '{{business}} — capturing more client enquiries automatically',
    ],
    body: [
      `Hi {{name}},

During tax season you're drowning in calls. Off-season, enquiries slip through. Either way, potential clients choose whichever firm replies first.

We set up a system for {{business}} that responds to every enquiry in under 2 minutes, qualifies the lead, and books a consultation — year-round, 24/7. No setup fees, cancel anytime.

Could this work for {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  healthcare: {
    subject: [
      '{{business}} — patients calling after hours go elsewhere',
      'After-hours patient enquiries for {{business}}',
      '{{business}} — missed appointment requests cost more than you think',
    ],
    body: [
      `Hi {{name}},

When patients call after hours and hit voicemail, they call the next clinic. Every missed call is a lost patient — and lost recurring revenue.

We set up a system for {{business}} that answers calls 24/7, books appointments, handles routine enquiries, and only escalates emergencies. Practices using this book 20-30% more appointments. Setup 3-5 days.

Worth a conversation?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  wedding: {
    subject: [
      '{{business}} — 68% of couples book whoever responds first',
      'Losing bookings to faster responders, {{business}}?',
      '{{business}} — what happens to enquiries at midnight?',
    ],
    body: [
      `Hi {{name}},

Couples planning their wedding contact 3-5 vendors. Research shows 68% book whoever responds first.

If someone fills your enquiry form at 10pm, how quickly do they hear back? For most businesses, it's next morning — by which time they've booked someone else.

We set up a system that responds to every {{business}} enquiry in under 2 minutes, 24/7.

Worth a look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  cleaning: {
    subject: [
      '{{business}} — quote requests after hours going cold',
      '40% of cleaning enquiries come outside office hours',
      '{{business}} — capturing leads while your team is on-site',
    ],
    body: [
      `Hi {{name}},

A potential client requests a quote at 8pm. By morning, they've booked whichever cleaning company replied fastest — it wasn't you.

We set up a system for {{business}} that responds instantly to every enquiry, gathers property details, and books assessments — 24/7. Cleaning companies using this capture 30-40% more clients. Under a week setup.

Could this help {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  recruitment: {
    subject: [
      '{{business}} — top candidates gone in 10 days',
      'Speed-to-contact and placement rates for {{business}}',
      '{{business}} — are candidates ghosting because of slow response?',
    ],
    body: [
      `Hi {{name}},

The best candidates are off the market in 10 days. If your team takes even a few hours to respond to an application, top talent has already moved on.

We set up a system for {{business}} that engages candidates instantly — screening, answering FAQs, scheduling interviews automatically. Agencies using this see 40% higher placement rates.

Worth a quick look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  insurance: {
    subject: [
      '{{business}} — losing quotes to faster brokers?',
      'What if every quote request got an instant reply from {{business}}?',
      '{{business}} — response time wins the deal 78% of the time',
    ],
    body: [
      `Hi {{name}},

When someone requests an insurance quote, they typically submit to 3-4 brokers. The one who responds first wins the business 78% of the time.

We set up a system for {{business}} that responds to every enquiry in under 2 minutes, gathers details, and books callbacks with your team — 24/7, including weekends.

Could this help {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  veterinary: {
    subject: [
      '{{business}} — pet owners calling in emergencies need instant answers',
      'After-hours calls for {{business}} going to competitors?',
      '{{business}} — missed calls during consultations cost bookings',
    ],
    body: [
      `Hi {{name}},

When a worried pet owner calls at 8pm, they need reassurance immediately — not voicemail. Most will call the next clinic and never come back.

We set up a system for {{business}} that answers every call, handles routine enquiries, books appointments, and flags genuine emergencies. 24/7, no tech to manage.

Worth a look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  hotel: {
    subject: [
      '{{business}} — booking enquiries unanswered overnight?',
      'Direct bookings vs OTA fees for {{business}}',
      '{{business}} — capturing late-night reservation requests',
    ],
    body: [
      `Hi {{name}},

Travellers book hotels at 11pm. If your direct line goes to voicemail, they go to Booking.com — and you pay the commission.

We set up a system for {{business}} that answers every call and web enquiry instantly, handles availability questions, and takes direct bookings 24/7. Hotels using this shift 15-25% of OTA bookings to direct. Setup under a week.

Could this help {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  // ── Online / Digital businesses ──
  saas: {
    subject: [
      '{{business}} — trial signups not converting?',
      'Quick question about {{business}} onboarding',
      '{{business}} — what happens when a trial user gets stuck?',
    ],
    body: [
      `Hi {{name}},

Most SaaS trials fail not because the product is bad — but because the user gets stuck and nobody replies fast enough.

We set up a system for {{business}} that responds to every trial user question in under 2 minutes, 24/7. Automatically qualifies who's worth chasing and books demos with your team.

Worth a look?

{{sender}}
Klivio — klivio.online`,

      `Hi {{name}},

The average SaaS loses 60% of trial users in the first 48 hours — most just needed one quick answer.

We built an instant-response system for {{business}} that handles onboarding questions, nudges inactive trials, and routes hot leads straight to your team. Setup under a week.

Could this help {{business}}?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  coach: {
    subject: [
      '{{business}} — contact form replies taking too long?',
      'Quick thought for {{business}}',
      '{{business}} — how fast do you reply to new enquiries?',
    ],
    body: [
      `Hi {{name}},

When someone fills your contact form at 10pm excited to work with you — how long before they hear back?

Most coaches reply next morning. By then, they've booked with whoever responded first.

We set up a system for {{business}} that replies instantly, qualifies the lead, and books a discovery call automatically. From $47/month.

Worth a look?

{{sender}}
Klivio — klivio.online`,

      `Hi {{name}},

Research shows 78% of clients go with the first coach or consultant who responds — not necessarily the best one.

We help {{business}} respond to every enquiry in under 2 minutes, 24/7. Qualifies leads, answers FAQs, books calls — while you focus on clients.

Is this something {{business}} could use?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  agency: {
    subject: [
      '{{business}} — losing new business enquiries overnight?',
      'Quick question for {{business}}',
      '{{business}} — what happens to leads that come in on weekends?',
    ],
    body: [
      `Hi {{name}},

New business enquiries that come in on Friday afternoon are usually cold by Monday. The prospect has already spoken to two other agencies.

We set up a system for {{business}} that responds within 2 minutes — any time, any day. Qualifies the brief, confirms budget, books a call. No staff needed.

Worth a quick look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  freelancer: {
    subject: [
      '{{business}} — replying to every lead while you\'re on a project?',
      'Quick thought for {{business}}',
      '{{business}} — missing new clients while you\'re heads-down?',
    ],
    body: [
      `Hi {{name}},

When you're deep in a project, new enquiries go unanswered. By the time you surface, that client has hired someone else.

We set up a system that responds to every {{business}} enquiry instantly — qualifies the project, gets the brief, books a call. All while you work.

From $47/month. Worth a look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  dropshipping: {
    subject: [
      '{{business}} — customer questions killing your conversion rate?',
      'Quick thought on {{business}} support',
      '{{business}} — how fast do you answer pre-purchase questions?',
    ],
    body: [
      `Hi {{name}},

70% of online shoppers abandon their cart after getting no answer to a pre-purchase question. They needed 30 seconds of help — and instead they left.

We set up an instant-response system for {{business}} that answers product questions, handles objections, and recovers abandoned carts automatically. Stores see 15-25% more completed purchases.

Worth a look?

{{sender}}
Klivio — klivio.online`,
    ],
  },

  generic: {
    subject: [
      '{{business}} — losing leads outside office hours?',
      'Quick question about {{business}}',
      '{{business}} — what if every enquiry got a reply in 2 minutes?',
    ],
    body: [
      `Hi {{name}},

When someone contacts {{business}} at 9pm or on a weekend, how long before they get a reply?

For most businesses, the answer is "next morning" — and by then, 78% of leads have already gone with whoever responded first.

We set up a system that responds to every enquiry in under 2 minutes, 24/7. Live in 2-7 days.

Worth 5 minutes to see if it fits?

{{sender}}
Klivio — klivio.online`,

      `Hi {{name}},

Most businesses lose 30-50% of leads simply from slow response times — not from bad products or pricing.

We built a system that handles enquiries, answers calls, and follows up with leads automatically, 24/7. From $197/month, no contracts. Most clients see ROI in the first two weeks.

Is this something {{business}} could use?

{{sender}}
Klivio — klivio.online`,
    ],
  },
};

const INDUSTRY_DESC = {
  dental: 'dental practice',
  realestate: 'estate agency',
  law: 'law firm',
  restaurant: 'restaurant',
  fitness: 'gym',
  trades: 'trades business',
  ecommerce: 'online store',
  accounting: 'accounting firm',
  healthcare: 'healthcare clinic',
  medical: 'medical practice',
  finance: 'financial services firm',
  veterinary: 'veterinary practice',
  hotel: 'hotel',
  wedding: 'wedding business',
  cleaning: 'cleaning company',
  recruitment: 'recruitment agency',
  insurance: 'insurance broker',
  events: 'events business',
  saas: 'SaaS company',
  coach: 'coaching or consulting business',
  agency: 'digital agency',
  freelancer: 'freelance business',
  dropshipping: 'online store',
  generic: 'business similar to yours',
};

// Pick a random template variant
function getTemplate(industry) {
  const tmpl = TEMPLATES[industry] || TEMPLATES.generic;
  const subjectIdx = Math.floor(Math.random() * tmpl.subject.length);
  const bodyIdx = Math.floor(Math.random() * tmpl.body.length);
  return {
    subject: tmpl.subject[subjectIdx],
    body: tmpl.body[bodyIdx],
  };
}

// Fill in template variables
function renderTemplate(template, vars) {
  let subject = template.subject;
  let body = template.body;
  for (const [key, val] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(re, val);
    body = body.replace(re, val);
  }
  // Add unsubscribe footer
  body += `\n\n---\nIf you don't want to hear from us, reply "unsubscribe" and we'll remove you immediately.`;
  return { subject, body };
}

module.exports = { TEMPLATES, INDUSTRY_DESC, getTemplate, renderTemplate };
