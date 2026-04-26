// ── 2026 research-backed subject lines ──
// Rules: < 6 words, include numbers, 2 personalization points
// +113% open rate from numbers, +14% from 2 personalisations
// Source: Mixmax 2026, Instantly benchmark, SaaSConsult

const SUBJECTS = {
  dental: [
    '{{business}} — 30% missed calls?',
    '{{name}}, 5 minutes for {{business}}?',
    '{{business}} losing £8K/mo on calls?',
    '{{name}} — quick {{business}} idea',
    '14 hours. Then they\'re gone.',
  ],
  realestate: [
    '{{business}} — 5-min rule?',
    '{{name}}, 10x more viewings?',
    '{{business}} losing leads at 9pm?',
    '{{name}} — 60% of leads gone',
    '{{business}} vs Purplebricks?',
  ],
  law: [
    '{{name}}, after-hours at {{business}}?',
    '{{business}} — 10pm enquiry?',
    '{{name}} — 60% of leads slip',
    '{{business}} cases lost overnight?',
    '£0 cost, 5 minutes.',
  ],
  restaurant: [
    '{{business}} — full during peak?',
    '{{name}}, missed bookings?',
    '{{business}} — phone vs service',
    '{{name}} — 1 booking covers cost',
    '40 covers/wk slipping?',
  ],
  fitness: [
    '{{business}} — 9pm trial signups?',
    '{{name}}, +30% trials?',
    '{{business}} — chat = members',
    '{{name}} — 24/7 sales rep',
    '9pm browsers ≠ members.',
  ],
  trades: [
    '{{business}} — phone on site?',
    '{{name}}, 5 jobs/wk?',
    '{{business}} losing £600 jobs?',
    '{{name}} — pick up while drilling',
    'Ladder + ringing phone?',
  ],
  ecommerce: [
    '{{business}} — 70% cart loss?',
    '{{name}}, +£3K/mo recovered?',
    '{{business}} — 25% cart save',
    '{{name}} — 24/7 chat sales',
    '70% leave. 25% stay.',
  ],
  accounting: [
    '{{business}} — tax rush misses?',
    '{{name}}, 5 mins for {{business}}?',
    '{{business}} — 24/7 enquiry catch',
    '{{name}} — 1 client = ROI',
    'Off-season = leads lost.',
  ],
  healthcare: [
    '{{business}} — 6pm patients?',
    '{{name}}, +20% appointments?',
    '{{business}} — call → patient',
    '{{name}} — 5 min review',
    'Voicemail = lost patient.',
  ],
  wedding: [
    '{{business}} — 68% book first reply',
    '{{name}}, midnight enquiries?',
    '{{business}} — 3-5 vendors compete',
    '{{name}} — 10pm = booking',
    '5 vendors. 1 wins.',
  ],
  cleaning: [
    '{{business}} — 8pm quote requests?',
    '{{name}}, +40% clients?',
    '{{business}} — 2 mins to win',
    '{{name}} — 5 jobs/wk lost',
    '40% enquiries after 6pm.',
  ],
  recruitment: [
    '{{business}} — 10-day window?',
    '{{name}}, +40% placements?',
    '{{business}} — top talent gone',
    '{{name}} — 5 mins on this',
    '10 days. Best candidates gone.',
  ],
  insurance: [
    '{{business}} — 78% first reply wins',
    '{{name}}, 4 brokers compete',
    '{{business}} — 2 min response',
    '{{name}} — quick {{business}} idea',
    '4 quotes. 1 reply wins.',
  ],
  generic: [
    '{{business}} — 9pm enquiries?',
    '{{name}}, 5 minutes?',
    '{{business}} — 78% first reply wins',
    '{{name}} — quick idea',
    '14 hours = 0 leads.',
  ],
};

function getSubject(industry, idx = null) {
  const list = SUBJECTS[industry] || SUBJECTS.generic;
  const i = idx !== null ? idx % list.length : Math.floor(Math.random() * list.length);
  return list[i];
}

module.exports = { SUBJECTS, getSubject };
