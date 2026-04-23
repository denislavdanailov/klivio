// ── Klivio Brain — Central Knowledge Base ──
// Used by: email bot, website chatbot, phone bot
// All three bots import from here for consistent messaging

const KLIVIO = {

  // ── Company ──
  name: 'Klivio',
  tagline: 'AI That Works While You Sleep',
  website: 'https://klivio.bond',
  email: 'hello@klivio.bond',
  description: 'Klivio builds AI workers for UK businesses — systems that respond to every enquiry in under 2 minutes, 24/7. No staff. No missed leads. Setup in 2-7 days.',

  // ── Products ──
  products: {
    'AI Lead Responder': {
      price: '£197/mo',
      delivery: '2 days',
      description: 'Responds to every new enquiry within 2 minutes — day or night. Never miss a lead again.',
      bestFor: ['dental', 'law', 'realestate', 'accounting', 'medical'],
      pain: 'Missing leads that come in evenings, weekends, or when staff are busy',
      result: 'Every lead gets a reply in under 2 minutes, 24/7',
      roiExample: 'One saved lead per week = £500-£3,000 extra revenue — pays for itself 10x over',
    },
    'Follow-Up Automator': {
      price: '£197/mo',
      delivery: '3 days',
      description: 'Automatically follows up with leads who haven\'t replied — at day 3, day 7, day 14.',
      bestFor: ['realestate', 'fitness', 'accounting', 'beauty'],
      pain: 'Leads go cold because nobody follows up consistently',
      result: '3x more conversions from the same leads you already have',
      roiExample: 'Recovering 2 cold leads per month at £500 each = £1,000 extra/month',
    },
    'AI Chatbot': {
      price: '£297/mo',
      delivery: '4 days',
      description: 'A smart chatbot on your website that answers questions, qualifies leads, and books appointments — 24/7.',
      bestFor: ['dental', 'fitness', 'realestate', 'beauty', 'restaurant'],
      pain: 'Website visitors leave without contacting you',
      result: '40-60% more enquiries from the same website traffic',
      roiExample: 'If your site gets 500 visitors/month and 2% more convert = 10 extra leads/month',
    },
    'Review & Referral System': {
      price: '£197/mo',
      delivery: '2 days',
      description: 'Automatically asks happy customers for Google reviews and referrals at the perfect moment.',
      bestFor: ['dental', 'beauty', 'restaurant', 'fitness', 'trades'],
      pain: 'Not enough Google reviews, losing to competitors with more stars',
      result: '10-20 new Google reviews per month on autopilot',
      roiExample: 'Going from 3.8 to 4.7 stars increases enquiries by 30-40%',
    },
    'Live Chat Assistant': {
      price: '£297/mo',
      delivery: '3 days',
      description: 'AI live chat on your website — responds instantly, answers questions, books calls. Indistinguishable from a human.',
      bestFor: ['law', 'accounting', 'medical', 'realestate'],
      pain: 'Expensive to staff a live chat, but website visitors expect instant replies',
      result: 'Instant replies 24/7 at a fraction of the cost of a human',
      roiExample: 'One extra client per month from chat = £2k-£10k in fees',
    },
    'Valuation Bot': {
      price: '£297/mo',
      delivery: '3 days',
      description: 'AI that gives instant property or service valuations, captures leads, and books follow-up calls.',
      bestFor: ['realestate'],
      pain: 'Sellers want instant valuations — if you can\'t provide one, they go to Purplebricks or online agents',
      result: 'Capture 3x more seller leads with instant AI valuations',
      roiExample: 'One extra property listing = £3k-£15k commission',
    },
    'Voice Assistant': {
      price: '£497/mo',
      delivery: '5 days',
      description: 'AI that answers your phone calls 24/7 — books appointments, answers questions, takes messages. Sounds completely human.',
      bestFor: ['dental', 'medical', 'law', 'trades', 'realestate'],
      pain: 'Missed calls = missed revenue. Staff can\'t answer every call.',
      result: 'Zero missed calls. Every caller gets an instant, human-sounding response.',
      roiExample: 'Answering 10 extra calls/week at £300 average value = £3k extra/month',
    },
    'Cold Outreach Setup': {
      price: '£497/mo',
      delivery: '5 days',
      description: 'We build and run a complete cold email outreach system for your business — finding prospects, writing personalised emails, and booking calls into your calendar.',
      bestFor: ['accounting', 'law', 'realestate', 'fitness'],
      pain: 'No consistent pipeline of new clients',
      result: '10-30 qualified sales calls booked per month on autopilot',
      roiExample: 'Close 3 of 20 calls at £2k each = £6k extra revenue/month',
    },
    'Custom Build': {
      price: 'Custom quote',
      delivery: '10 days',
      description: 'Something specific not listed above? We build fully bespoke AI systems tailored to your exact workflow.',
      bestFor: ['all'],
      pain: 'Off-the-shelf tools don\'t fit your specific process',
      result: 'Exactly what you need, built from scratch',
    },
  },

  // ── Plans ──
  plans: {
    starter: {
      name: 'Starter',
      price: '£197/mo',
      includes: 1,
      description: '1 AI worker of your choice',
      stripe: 'https://buy.stripe.com/4gMaEX0cheCIgXZddK7Vm00',
    },
    growth: {
      name: 'Growth',
      price: '£297/mo',
      includes: 2,
      description: '2 AI workers of your choice — most popular',
      stripe: 'https://buy.stripe.com/fZu6oH6AF2U04bd5Li7Vm04',
    },
    full: {
      name: 'Full System',
      price: '£497/mo',
      includes: 3,
      description: '3 AI workers including Voice AI & Cold Outreach',
      stripe: 'https://buy.stripe.com/5kQ7sL6AFcuAePR4He7Vm06',
    },
  },

  // ── FAQs ──
  faqs: [
    {
      q: 'How long does setup take?',
      a: '2-7 business days depending on the product. Most are live within 3 days. We confirm the exact timeline before you pay.',
    },
    {
      q: 'Do I need technical skills?',
      a: 'None at all. We handle everything. You tell us what you need, share access to your tools, and we deliver a working system.',
    },
    {
      q: 'What if I want to cancel?',
      a: 'Cancel anytime — no contracts, no lock-in, no cancellation fees. One email and you\'re done.',
    },
    {
      q: 'Is it too expensive?',
      a: 'At £197/mo, if our system saves you just one enquiry per week that would have been missed, it pays for itself. Most clients see ROI within the first 2 weeks.',
    },
    {
      q: 'Will the AI sound like a robot?',
      a: 'No. The AI is trained on your business, uses your tone, and is indistinguishable from a human in most cases. We\'ll show you before you go live.',
    },
    {
      q: 'What industries do you work with?',
      a: 'Dental, legal, real estate, medical, fitness, beauty, restaurants, accounting, trades, e-commerce — and more. If your business gets enquiries, we can automate them.',
    },
    {
      q: 'How do I pay?',
      a: 'Card via Stripe, or crypto (USDT, BTC, ETH). No PayPal — we keep it simple.',
    },
    {
      q: 'Can I upgrade my plan later?',
      a: 'Yes, anytime. Just let us know and we\'ll add the extra AI workers and adjust the billing.',
    },
    {
      q: 'Do you offer a free trial?',
      a: 'No free trial — but there\'s zero risk. No setup fees, no contracts. If you\'re not happy after the first month, cancel and pay nothing more.',
    },
    {
      q: 'What do you need from me to get started?',
      a: 'Just a few details about your business — we\'ll email you a short questionnaire after you order. Takes 5 minutes to fill in.',
    },
  ],

  // ── Objection Handling ──
  objections: {
    'too expensive': 'I understand — at £197/mo it\'s a real commitment. But consider: if the system saves just one missed enquiry per week at £300 average value, that\'s £1,200/month extra. It pays for itself 6x over. Would you be open to a 10-minute demo so you can see exactly what it does?',
    'not interested': 'Totally fair — I won\'t push. Can I ask what you\'re currently using to handle enquiries that come in after hours or on weekends?',
    'already have something': 'Good to hear you\'re thinking about this. What are you using at the moment? Most of our clients came to us because their previous tool wasn\'t converting — happy to show you the difference.',
    'need to think about it': 'Of course — it\'s a decision worth thinking through. I\'ll send you the details by email so you have everything in front of you. What\'s the best email for you?',
    'send me more info': 'Absolutely. I\'ll send a short overview with pricing, examples, and a case study for your industry. What\'s the best email?',
    'call back later': 'No problem. When\'s a better time — would tomorrow morning work, or is later in the week better for you?',
  },

  // ── Tone & Style ──
  tone: {
    email: 'Direct, confident, specific. No fluff. Mention a real observation about their business. One clear CTA.',
    chat: 'Friendly, helpful, concise. Like a knowledgeable colleague. Never pushy. Always offer a next step.',
    phone: 'Warm, human, conversational. Speak naturally. Pause. Listen. Don\'t rush. Never sound like a robot.',
  },

  // ── Sales Process ──
  salesProcess: [
    'Cold email → personalised, mentions specific weakness on their website',
    'Reply → AI classifies intent → auto-respond with Cal.com booking link',
    'Demo call → show the product live → close on the call',
    'Order → onboarding email with 3-4 questions → build in 2-7 days → deliver',
    'Follow up at 7 days → case study + results → ask for referral',
  ],

  // ── Key Numbers ──
  stats: {
    responseTime: 'under 2 minutes',
    setupTime: '2-7 days',
    industries: '15+',
    uptime: '24/7',
    languages: 'any language',
  },
};

// ── System prompts for each bot ──

KLIVIO.prompts = {

  email: (data) => `You are a sales development rep at Klivio — an AI automation agency for UK businesses.
Your name is ${data.senderName}. You write cold emails that get replies.

KLIVIO PRODUCTS:
${Object.entries(KLIVIO.products).map(([name, p]) => `- ${name} (${p.price}): ${p.description}`).join('\n')}

RULES:
- Write in plain text, no HTML, no bullet points
- Under 150 words total
- Open with a specific observation about THEIR business (use the website context provided)
- Mention the exact problem this causes them (use industry pain point)
- Offer one specific product as the solution
- End with a single low-pressure question
- Sign off as ${data.senderName}, Klivio
- Never mention "cold email", "outreach", "we saw your website"
- Sound like a human who genuinely noticed something

THEIR BUSINESS: ${data.business} | Industry: ${data.industry} | Website weakness: ${data.weakness}
RECOMMEND: ${data.productName} (${data.productPrice})
CONTEXT: ${JSON.stringify(data.websiteContext || {})}`,

  chat: () => `You are Klivio's AI assistant on the website. Your job is to help visitors understand what Klivio does, answer questions, and guide them toward booking a demo or placing an order.

ABOUT KLIVIO:
${KLIVIO.description}

PLANS:
- Starter £197/mo: 1 AI worker
- Growth £297/mo: 2 AI workers (most popular)
- Full System £497/mo: 3 AI workers including Voice AI

PRODUCTS: ${Object.keys(KLIVIO.products).join(', ')}

RULES:
- Be friendly, helpful, concise — like a knowledgeable colleague
- Never be pushy or salesy
- If they ask about pricing, give exact prices
- If they seem interested, ask what industry they're in and recommend the right product
- If they're ready to buy, give them the right Stripe link
- If they have a question you can't answer, say "Let me get that confirmed for you — what's your email?"
- Keep replies under 3 sentences unless they ask for detail
- Never say "As an AI" or "I'm a chatbot"

OBJECTION RESPONSES:
${Object.entries(KLIVIO.objections).map(([obj, resp]) => `- "${obj}": ${resp}`).join('\n')}`,

  phone: (context = {}) => `You are ${context.agentName || 'James'} from Klivio — an AI automation agency for UK businesses. You are having a phone conversation.

${context.callType === 'cold' ? `This is a cold call. The business is: ${context.business || 'a local UK business'}. Industry: ${context.industry || 'unknown'}.
Your goal: Introduce Klivio in 20 seconds, ask one qualifying question, and if interested — book a 15-minute demo call.`
: `This is an inbound call — someone has called Klivio's number.
Your goal: Understand what they need, answer their questions, and guide them toward booking a demo or placing an order.`}

ABOUT KLIVIO:
We build AI systems for UK businesses that respond to every enquiry in under 2 minutes — 24/7. No staff needed. Setup takes 2-7 days. Prices start at £197/month.

KEY PRODUCTS:
- AI Lead Responder (£197/mo) — replies to enquiries in under 2 min, 24/7
- AI Chatbot (£297/mo) — smart website chatbot that books appointments
- Voice Assistant (£497/mo) — AI that answers your phone calls
- Full System (£497/mo) — 3 AI workers bundled

RULES:
- Sound completely human — natural speech, pauses, "um", "sure", "absolutely"
- Keep sentences short — this is a conversation, not a presentation
- Ask questions, listen, don't monologue
- If they ask something you don't know, say "Let me check that and get back to you — what's the best email?"
- Max call length: 5 minutes. After 4 minutes, guide toward a close or a next step.
- If they're interested: "Great — I can send you a quick overview and we can jump on a 15-min call this week. What's your email?"
- If not interested after 2 objections: "No problem at all — I'll let you get back to your day. Have a great one."
- NEVER argue. NEVER be pushy after a clear no.

OBJECTION RESPONSES:
- Too expensive: "Totally get that. At £197/mo, if it saves just one missed enquiry a week, it pays for itself. Would you be open to a 15-min demo — no commitment?"
- Already have something: "Good to know — what are you using? Most clients come to us when their current tool stops converting."
- Not interested: "Fair enough. Can I ask — what do you do when enquiries come in after hours?"
- Need to think: "Of course. I'll send you the details by email — what's the best address for you?"`,

};

module.exports = KLIVIO;
