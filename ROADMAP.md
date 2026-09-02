# Panda

A learning tool for students: chat that teaches instead of answering, classes
and assignments in one place, and a planner that can show its working.

## Setup

Copy `.env.example` and fill in what you need. Only `GEMINI_API_KEY` is
required; every other feature says plainly that it is not configured rather
than pretending to work.

## What is built

**Chat.** Real token streaming — text renders as the model produces it, and
nothing that has not arrived exists in the page. Markdown parses while partial,
so an unclosed code fence or a half-typed `**bold` never flickers. Stop
generation cancels mid-stream and keeps what arrived.

**Teaching.** Answers are not handed over on request. A six-rung ladder runs
from a nudge to the worked answer, and there are four ways to reach the top:
demonstrated understanding, genuine repeated attempts, an authorised mode, or
reviewing finished work. Judged from the conversation, never from a hint
counter.

**Language.** Sixteen languages offered, ten with translated interface strings,
English underneath as a fallback. The device language is suggested and never
applied on its own. Interface language and reply language are set separately,
because a student learning English often wants the buttons in Spanish and the
answers in English.

**Chat actions.** I don't understand, translate, hint, explain another way,
check my work. Simplifying eases the wording while holding the concept where it
was, and changes strategy rather than rewording itself.

**Classes and assignments.** Created locally or imported from Canvas. Each
assignment carries teacher rules — answer policy, translation, simplification —
which are applied in the UI, not merely described to the model.

**The permission boundary.** A class chat receives the assignment text. The
general chat never does, and is told so, so it declines cleanly instead of
inventing an assignment from its title.

**Planner.** Arithmetic over real due dates and point values, not generation.
Overdue first, then soonest, then worth the most, and every line carries the
reason it sits where it does. Focus mode is a timer and one goal.

**Accounts.** Supabase email sign-in, or continue as a guest. Email leads
deliberately: the browser only ever talks to your own Supabase subdomain, so it
works on a school network that blocks accounts.google.com. Google is offered
underneath and labelled honestly, since signing in with Google means a trip to
Google's domain whichever way it is wired. Google Identity Services remains as
a fallback for deployments with no Supabase project. Signing in namespaces
profile, chats, classes and assignments by account, which is what makes a
shared school laptop safe.

**Canvas.** Real OAuth2 with a state check, server-side secret, and a token the
page never sees. Syncing updates what Canvas owns and never touches whether the
student marked something done. A failed sync changes nothing.

**Accessibility.** Visible focus rings, a skip link, semantic landmarks, and
motion that respects both the OS setting and an in-app switch.

## What is not built

**A database.** Everything persists to the browser. That means no sync between
devices, no teacher seeing student work, and no genuinely multi-user anything.
Supabase is now connected for sign-in, so the project and its Postgres already
exist — what is left is moving the stores onto tables. The data model is already
shaped for it: stable ids, foreign keys, and an `externalId` on the entities an
LMS owns, so this is a repository swap rather than a rewrite.

**Teacher accounts.** There is a `role` field and assignment rules exist, but
there is no teacher UI and no way for a teacher to reach a student's class.
Both need the database first.

**Class analytics.** Aggregating across students requires students to share a
backend.

**Notifications.** No scheduler.

## Build order from here

1. Database and roles. Move profile, chats, classes and assignments off the
   browser and into the Supabase project sign-in already uses, behind row-level
   security keyed on the signed-in user. Nothing multi-user works before this.
2. Teacher UI: create a class, post an assignment, set its rules.
3. Server-side permission checks against real rows, replacing the client-side
   boundary.
4. Class analytics, aggregate only.
5. Notifications.
