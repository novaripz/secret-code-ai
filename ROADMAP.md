# Panda — roadmap

The product brief describes a full education platform. This is the honest
mapping of that brief onto what exists, what is missing, and what order the
missing parts should be built in.

## What is actually built today

- Google sign-in (verified server side), guest mode, per-account data scoping
- Real token streaming from Gemini, rendered as it arrives
- Streaming-aware markdown (partial fences and half-typed bold do not flicker)
- Chat with memory, image attachments, Explain / Humanize / AI Homie modes
- Search and Watch tabs, Build tab with in-browser projects
- Profile, appearance settings, dark and light themes, panda mascot

## The gap

Everything above is a **single-player chat app**. The brief describes a
**multi-tenant school platform**. The distance between those is not polish, it
is a missing backend.

Three things block almost everything else in the brief:

### 1. A database

All data currently lives in the browser (`localStorage` and IndexedDB). That
makes these impossible, not merely unbuilt:

- classes, assignments, submissions
- teachers seeing student work
- anything shared between two people
- sync between a phone and a laptop
- server-enforced permissions

No amount of frontend work substitutes for this. Postgres via Supabase or Neon
is the smallest step that unlocks the rest.

### 2. Roles

There is one kind of user. Teacher and student are different products sharing a
shell, and every screen in the brief depends on knowing which one is asking.

### 3. Server-side permission enforcement

The brief is explicit that personal Panda must not see assignment contents, and
that hiding things in the client is not sufficient. That check has to live next
to the data, which means it depends on (1).

## Build order

Each step is usable on its own, and each unlocks the next.

1. **Database + roles.** Users, classes, enrollments, assignments,
   submissions. Move profile and threads off the browser. Nothing below works
   without this.
2. **Classes and assignments.** Teacher creates a class, students join, teacher
   posts an assignment. The first genuinely multi-user moment.
3. **Class Panda vs personal Panda.** Two contexts with different data access,
   enforced server side. This is where the permission boundary becomes real.
4. **The answer policy.** Progressive hints, understanding checks, teacher
   overrides. Mostly prompt and state design, but it needs assignments to exist
   first.
5. **"I don't understand" and translate.** Chat actions that re-explain rather
   than restate. Cheap once the chat has assignment context.
6. **Interface translation.** Every string through a translation layer with a
   language picker in onboarding. Mechanical but wide.
7. **Canvas OAuth and sync.** Biggest single integration. Needs the assignment
   schema from step 1 to import into.
8. **Planner, focus mode, study mode.** These read the data the earlier steps
   create. Fun to build, worthless before then.
9. **Teacher analytics.** Aggregate only. Last because it summarises everything
   above.

## Why the name is "Panda"

School filters block on the letters "ai" in a hostname. The app and the domain
both avoid them. A product students cannot open is not a product.
