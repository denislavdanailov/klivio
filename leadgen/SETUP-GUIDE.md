# Klivio Lead Generation — Setup & Anti-Spam Guide

## CRITICAL: DNS Setup (Do This First!)

Without proper DNS records, your emails WILL go to spam. Set these up for both domains:

### klivio.bond DNS Records:
```
Type: TXT
Host: @
Value: v=spf1 include:sendinblue.com ~all

Type: TXT
Host: mail._domainkey
Value: (Get from Brevo dashboard → Settings → Senders → DKIM)

Type: TXT
Host: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@klivio.bond
```

### klivio.site DNS Records:
```
(Same records as above for klivio.site)
```

### How to set up:
1. Go to your domain registrar (where you bought klivio.bond and klivio.site)
2. Find DNS settings / DNS management
3. Add the 3 TXT records above for each domain
4. Wait 24-48 hours for propagation
5. Verify in Brevo dashboard → Settings → Senders & Domains

## Warmup Schedule (FOLLOW THIS!)

New domains must be warmed up gradually. DO NOT send 4,750 emails on day 1.

```
Day 1:   5/account  =   95 total    (warmup command)
Day 2:  15/account  =  285 total
Day 3:  30/account  =  570 total
Day 4:  60/account  = 1,140 total
Day 5: 100/account  = 1,900 total
Day 6: 150/account  = 2,850 total
Day 7: 250/account  = 4,750 total   (full capacity)
```

Run: `node leadgen/run.js warmup`

## Daily Workflow

### 1. Find leads (choose one or combine):

**Option A: Import CSV** (recommended — use Apollo.io free tier, Hunter.io, or manually collect)
```
node leadgen/run.js import leads.csv
```
CSV format: `name,email,business,industry,website`

**Option B: Scrape specific websites**
```
node leadgen/run.js scrape-url https://somebusiness.com dental
node leadgen/run.js scrape-file urls.txt realestate
```

**Option C: Search and scrape** (works when search engines don't block)
```
node leadgen/run.js scrape "dentists Manchester" dental
```

### 2. Check stats:
```
node leadgen/run.js stats
```

### 3. Send emails:
```
node leadgen/run.js send 50          # Send to 50 leads
node leadgen/run.js send-all         # Send to all unsent leads
```

### 4. Track replies:
```
node leadgen/run.js mark someone@email.com replied
node leadgen/run.js mark someone@email.com unsubscribed
```

## Best Lead Sources (Free)

1. **Google Maps** — Search "dentists Manchester", visit each website, copy to urls.txt
2. **Apollo.io** (free tier) — 100 leads/month with email verification
3. **Hunter.io** (free tier) — 25 searches/month, find emails from domains
4. **LinkedIn** — Find business owners, look up their company website
5. **Industry directories** — NHS dentist finder, Law Society, etc.
6. **Google search** — "dentists Manchester" → visit sites → scrape-url each

## Anti-Spam Best Practices

1. **Never send more than 250/day per account** (system enforces this)
2. **Use warmup for first 7 days** (gradual increase)
3. **Random delays between emails** (8-25 seconds, built in)
4. **Personalised subject lines** (uses business name)
5. **Plain text emails** (no HTML, no images — better deliverability)
6. **Unsubscribe footer** (automatically added)
7. **List-Unsubscribe header** (automatically added)
8. **Rotate across 19 accounts** (round-robin, built in)
9. **Never send same email twice** (dedup, built in)
10. **Reply to unsubscribes immediately** (mark as unsubscribed)

## Revenue Math

```
4,750 emails/day × 14 days = 66,500 emails
× 2% reply rate = 1,330 replies
× 5% close rate = 66 customers
× $297 avg sale = $19,602

Conservative (1% reply, 3% close):
= 665 replies × 3% = 20 customers × $297 = $5,940

Target: $15,000 = ~50 customers = need ~3.5% effective conversion
```
