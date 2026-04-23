// ── Industry-specific cold email templates ──
// Each template has multiple variants to avoid spam filters
// Variables: {{name}}, {{business}}, {{sender}}, {{industry}}, {{unsubscribe}}

const TEMPLATES = {

  dental: {
    subject: [
      '{{business}} — quick question about missed calls',
      'Do you know how many calls {{business}} misses during procedures?',
      'Thought about this for {{business}}',
    ],
    body: [
      `Hi {{name}},

I was looking at dental practices in your area and noticed something most clinics struggle with — missed phone calls during procedures.

Studies show the average dental practice misses 30-40% of incoming calls. At roughly $300-500 per new patient, that's $3,000-8,000/month walking out the door.

We built an AI system that answers your phone 24/7, books appointments, and sends you a summary — all for less than a receptionist's daily wage.

Would it be worth a 5-minute chat to see if this fits {{business}}?

Best,
{{sender}}
Klivio — AI Workers for Business
klivio.bond`,

      `Hi {{name}},

Quick question: what happens when a patient calls {{business}} during a procedure?

For most clinics, the answer is voicemail — and 80% of callers who hit voicemail never call back.

We help dental practices capture every call with an AI receptionist that sounds natural, books appointments, and works 24/7. Setup takes 3-5 days, no tech needed on your end.

Worth a look? Happy to share a quick demo.

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  realestate: {
    subject: [
      '{{business}} — are you losing leads overnight?',
      'Quick thought for {{business}} about response times',
      'The 5-minute rule and {{business}}',
    ],
    body: [
      `Hi {{name}},

Research from MIT shows that responding to a property enquiry within 5 minutes makes you 10x more likely to convert that lead.

Most estate agents reply in 2-4 hours. By then, the buyer has already called 3 other agents.

We build AI systems that respond to every enquiry in under 2 minutes — even at midnight. One of our agents added 15 extra viewings per month just from capturing after-hours leads.

Could this work for {{business}}? Happy to show you in 5 minutes.

{{sender}}
Klivio — klivio.bond`,

      `Hi {{name}},

I work with estate agents who were losing 40-60% of their online leads simply because they couldn't respond fast enough.

We built a system that instantly responds to every enquiry, qualifies the lead, and books a callback — 24/7, no human needed.

Setup takes under a week and costs less than a part-time admin.

Would {{business}} benefit from never missing another lead? Happy to chat briefly.

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  law: {
    subject: [
      '{{business}} — thought about your after-hours enquiries',
      'How {{business}} could capture more cases',
      'Quick idea for {{business}}',
    ],
    body: [
      `Hi {{name}},

When someone needs a solicitor at 10pm, they don't leave a voicemail — they call the next firm on Google.

We help law firms capture every enquiry with an AI system that responds in under 2 minutes, qualifies the case, and books a consultation — day or night.

One firm went from losing 60% of after-hours leads to capturing 95%.

Worth a 5-minute conversation to see if this fits {{business}}?

{{sender}}
Klivio — klivio.bond`,

      `Hi {{name}},

Most law firms I speak to have the same problem: great at what they do, but enquiries slip through the cracks — especially outside office hours.

We built an AI system that handles initial client contact 24/7. It responds instantly, asks the right qualifying questions, and routes urgent matters to you.

No contracts, no setup fees. Live in under a week.

Could this help {{business}}? Happy to show you a quick demo.

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  restaurant: {
    subject: [
      '{{business}} — are you losing bookings during service?',
      'Quick thought for {{business}}',
      '{{business}} — what happens when the phone rings during rush?',
    ],
    body: [
      `Hi {{name}},

During peak service, nobody can answer the phone — but that's exactly when customers call to book.

We help restaurants and venues with an AI that answers every call, handles reservations, and responds to online enquiries 24/7. No more missed bookings during busy service.

Setup takes 3-5 days. Costs less than one evening's lost bookings.

Interested to see how it works for {{business}}?

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  fitness: {
    subject: [
      '{{business}} — converting more website visitors to members',
      'Quick idea for {{business}}',
      'How {{business}} could get 30% more trial sessions',
    ],
    body: [
      `Hi {{name}},

When someone visits your website at 9pm thinking about joining, what happens? Usually nothing — they browse, leave, and join the gym that replied first.

We build AI chatbots that sit on your website and convert visitors into trial sessions — 24/7, automatically.

Gyms using this see 30% more trial bookings because the bot engages visitors instantly.

Worth a quick look for {{business}}? Takes 5 minutes to show you.

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  trades: {
    subject: [
      '{{business}} — never miss a job enquiry again',
      'Quick thought for {{business}} about missed calls',
      '{{business}} — what happens when you can\'t answer the phone on site?',
    ],
    body: [
      `Hi {{name}},

When you're on a job site, the phone rings and you can't answer. By the time you call back, they've found someone else.

We built an AI that answers your business phone, takes the job details, qualifies the lead, and texts you a summary — all while you're working.

No app to install, no tech needed. Live in 3-5 days.

Could this help {{business}}? Happy to show you how it works.

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  ecommerce: {
    subject: [
      '{{business}} — recovering abandoned carts automatically',
      'Quick idea for {{business}} about conversion rates',
      '{{business}} — 70% of your carts are abandoned. Here\'s a fix.',
    ],
    body: [
      `Hi {{name}},

The average online store loses 70% of carts before checkout. Most of those people just needed a quick answer or a small nudge.

We build AI chatbots that engage your visitors in real time — answering product questions, handling objections, and recovering abandoned carts automatically.

Stores using this recover 15-25% of abandoned carts.

Worth a quick look for {{business}}?

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  accounting: {
    subject: [
      '{{business}} — capturing more client enquiries automatically',
      'Quick thought for {{business}}',
      '{{business}} — what happens to leads outside office hours?',
    ],
    body: [
      `Hi {{name}},

During tax season you're drowning in calls. Off-season, leads slip through the cracks. Either way, potential clients are choosing the firm that responds first.

We help accounting firms capture every enquiry with an AI system that responds in under 2 minutes, qualifies the lead, and books a consultation — year-round, 24/7.

No setup fees, cancel anytime. Live in under a week.

Could this work for {{business}}?

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  healthcare: {
    subject: [
      '{{business}} — capturing after-hours patient enquiries',
      'Quick idea for {{business}} about missed appointments',
      '{{business}} — patients calling after hours go elsewhere',
    ],
    body: [
      `Hi {{name}},

When patients call after hours, they get voicemail and call the next clinic. Every missed call is a lost patient — and lost recurring revenue.

We help healthcare practices with an AI that answers calls 24/7, books appointments, handles routine enquiries, and only escalates emergencies to you.

Practices using this book 20-30% more appointments. Setup in 3-5 days.

Worth a conversation for {{business}}?

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  wedding: {
    subject: [
      '{{business}} — losing bookings to faster responders?',
      'Quick idea for {{business}} about enquiry response times',
      '{{business}} — what happens to enquiries at midnight?',
    ],
    body: [
      `Hi {{name}},

Couples planning their wedding usually contact 3-5 vendors. Research shows 68% book with whoever responds first.

If someone fills out your enquiry form at 10pm, how quickly do they hear back? For most wedding businesses, it's the next morning — by which time they've already booked someone else.

We build AI systems that respond to every enquiry in under 2 minutes, 24/7. It answers common questions, shares availability, and books consultations automatically.

Would this be useful for {{business}}? Happy to show you in 5 minutes.

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  cleaning: {
    subject: [
      '{{business}} — are you missing quote requests after hours?',
      'Quick thought for {{business}} about lead capture',
      '{{business}} — 40% of cleaning enquiries come outside office hours',
    ],
    body: [
      `Hi {{name}},

When a potential client requests a quote on your website at 8pm, what happens? For most cleaning companies, they wait until morning — but by then, the client has already booked someone who replied faster.

We build AI systems that respond instantly to every enquiry, gather property details, provide estimates, and book assessments — 24/7, automatically.

Cleaning companies using this capture 30-40% more clients. Setup in under a week, no tech skills needed.

Could this help {{business}}? Happy to show you how it works.

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  recruitment: {
    subject: [
      '{{business}} — are candidates ghosting you?',
      'Quick idea for {{business}} about candidate response rates',
      '{{business}} — speed-to-contact and placement rates',
    ],
    body: [
      `Hi {{name}},

The best candidates are off the market in 10 days. If your team takes even a few hours to respond to an application, the top talent has already moved on.

We build AI systems that engage candidates instantly — screening, answering FAQs, and scheduling interviews automatically. Agencies using this see 40% higher placement rates from faster first contact.

No contracts, no setup fees. Live in under a week.

Worth a quick chat for {{business}}?

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  insurance: {
    subject: [
      '{{business}} — losing quotes to faster brokers?',
      'Quick thought for {{business}} about lead response times',
      '{{business}} — what if every quote request got an instant reply?',
    ],
    body: [
      `Hi {{name}},

When someone requests an insurance quote online, they typically submit to 3-4 brokers. The one who responds first wins the business 78% of the time.

We build AI systems that respond to every enquiry in under 2 minutes — gathering details, answering common questions, and booking callbacks with your team. Works 24/7, even on weekends.

Brokers using this convert 30-40% more leads. No tech needed on your end.

Could this help {{business}}? Happy to show you a quick demo.

{{sender}}
Klivio — klivio.bond`,
    ],
  },

  generic: {
    subject: [
      '{{business}} — are you losing leads outside office hours?',
      'Quick question about {{business}}',
      '{{business}} — what if every enquiry got a reply in 2 minutes?',
    ],
    body: [
      `Hi {{name}},

Quick question: when someone contacts {{business}} at 9pm or on a weekend, how long before they get a reply?

For most businesses, the answer is "next morning" — and by then, 78% of leads go with whoever responded first.

We build AI systems that respond to every enquiry in under 2 minutes, 24/7. No staff needed, no tech skills required. Live in 2-7 days.

Would it be worth 5 minutes to see if this fits your business?

{{sender}}
Klivio — klivio.bond`,

      `Hi {{name}},

I've been looking at businesses like {{business}} and noticed a pattern — most lose 30-50% of leads simply from slow response times.

We built AI workers that handle enquiries, answer calls, and follow up with leads — all automatically, 24/7. From $197/month, no contracts.

Most of our clients see ROI in the first 2 weeks.

Curious to learn more? Happy to send a quick overview.

{{sender}}
Klivio — klivio.bond`,
    ],
  },
};

// ── Follow-up templates (Email 2: Day 3, Email 3: Day 7) ──
const FOLLOWUP_2 = {
  subject: 'Re: {{original_subject}}',
  body: `Hi {{name}},

Just following up on my note a few days ago.

One of our clients — a {{industry_desc}} — went from losing 60% of after-hours enquiries to capturing 95% within the first week. Their words: "It paid for itself on day one."

If you're curious, I can show you exactly how it works in 5 minutes — no commitment.

Either way, no pressure at all.

{{sender}}
Klivio — klivio.bond`,
};

const FOLLOWUP_3 = {
  subject: 'Re: {{original_subject}}',
  body: `Hi {{name}},

I sent a couple of notes about how {{business}} could capture more leads automatically. If it's not relevant right now, totally understand — just let me know and I'll stop reaching out.

If the timing is better down the road, we'll be here.

All the best,
{{sender}}
Klivio — klivio.bond`,
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
  wedding: 'wedding business',
  cleaning: 'cleaning company',
  recruitment: 'recruitment agency',
  insurance: 'insurance broker',
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

// Get follow-up template (step 2 or 3)
function getFollowup(step) {
  return step === 3 ? FOLLOWUP_3 : FOLLOWUP_2;
}

// Render follow-up with variables
function renderFollowup(step, vars) {
  const tmpl = getFollowup(step);
  let subject = tmpl.subject;
  let body = tmpl.body;
  vars.industry_desc = INDUSTRY_DESC[vars.industry] || INDUSTRY_DESC.generic;
  for (const [key, val] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    subject = subject.replace(re, val);
    body = body.replace(re, val);
  }
  body += `\n\n---\nIf you don't want to hear from us, reply "unsubscribe" and we'll remove you immediately.`;
  return { subject, body };
}

module.exports = { TEMPLATES, INDUSTRY_DESC, getTemplate, renderTemplate, getFollowup, renderFollowup };
