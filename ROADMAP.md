# Roadmap

Things we've agreed to build, roughly in order. Notes to pick back up from.

## 1. Streaming + real "thinking" UI

Right now a response appears all at once after a wait. Make it live:

- Stream tokens from Gemini as they generate, so text types itself out.
- Show genuine status while work is happening — reading a file, looking at an
  image, writing a file. These must reflect real work actually in progress.
  Do NOT animate fake steps or invent stages that aren't happening; a fake
  progress theater is worse than a plain spinner.
- Gemini supports streaming (`generateContentStream`) and the API route can
  forward it as a stream to the client.

## 2. Google Sign-In + accounts

Goal: friends can use it at school, each with their own private data.

- Google Sign-In itself is free at this scale (Firebase Auth / Google Identity).
- The real work is moving data off `localStorage` and into a server-side
  database, so a profile follows the account instead of the browser.
  Supabase or Firebase; both have usable free tiers.
- What moves server-side: profile (name, nickname, birthday, likes), mode
  settings, memory facts, chat threads, projects and their files.

### Cost guardrails — decide BEFORE handing this to other people

Every request runs on the owner's Gemini API key.

- Free-tier key: no charges, but hard rate limits. Several simultaneous users
  will hit them and everyone sees errors.
- Billing-enabled key: limits lift and every request costs the key owner,
  including anything anyone spams.
- Therefore: add per-account usage caps and basic abuse protection as part of
  this step, not after.

## 3. Paid subscription tier

Not designed yet — deferred by request. Revisit once accounts exist, since
subscriptions need accounts to attach to. Discuss scope before building.
