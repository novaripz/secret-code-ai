# The UI/UX overhaul

All of this work lives on the branch `claude/ui-overhaul`. The branch it started from, `claude/browser-ai-coding-env-wa7q9m`, has not been touched, so going back is one checkout:

```bash
git checkout claude/browser-ai-coding-env-wa7q9m   # the app as it was
git checkout claude/ui-overhaul                    # the overhaul
```

Each area was merged as its own merge commit, so a single area can also be reverted on its own with `git revert -m 1 <merge-commit>`:

| Area | Merge commit message |
|---|---|
| Watch | "Merge the Watch overhaul…" |
| Chat, sidebar, settings, onboarding | "Merge the shell, chat, settings and onboarding overhaul" |
| Classes, planner, teacher | "Merge the classes, planner and teacher overhaul" |
| Build IDE | "Merge the Build IDE overhaul" |

## Everywhere

- **A real brand colour.** Panda used to be pure grey with a white accent. It now has a violet-indigo accent for primary buttons, active tabs, focus rings and links, on all five themes (dark, light, ocean, forest, sepia). Every text colour pair was checked at 4.5:1 contrast or better.
- **One set of controls.** `.btn`, `.card`, `.input`, `.chip`, `.badge`, `.kbd`, `.segmented` and `.menu` are defined in `globals.css`, with React versions in `src/components/ui/`. Every screen now uses them, so buttons, cards and fields look the same everywhere.
- **Free, licensed icons.** Every hand-drawn icon was replaced with [Lucide](https://lucide.dev) (ISC licence, free to redistribute). The unused Vercel and Next.js logos are gone. `THIRD_PARTY_NOTICES.md` carries the licence text so it travels with every copy you hand out. The Panda mascot is the app's own original art.
- **CSS layering fix.** Element-level CSS was moved into `@layer base`. In Tailwind v4 an unlayered rule beats every utility, so `font-semibold` on buttons silently did nothing, and focus rings squared off rounded buttons.
- **The app frame is drawn once.** It no longer rebuilds on every tab switch, so the chat list keeps its scroll position and nothing refetches.

## Chat, sidebar, settings, onboarding

- **Sidebar:** chat search, Today / Yesterday / Previous 7 days / Older groups, pinned chats, a per-chat menu, and active states that also work on sub-pages.
- **Ctrl/Cmd + K** opens a command palette: new chat, search chats, jump to any tab or settings section, toggle theme.
- **Chats have links** (`/?c=<id>`), so reload, Back and Forward work.
- **New chat actions:** edit and resend your last message, retry the last answer, flag an answer, "Quiz me on this", and download a chat as Markdown.
- **Code blocks** show the language, a copy button and light syntax colouring.
- **Read aloud and voice typing** use the browser's own speech features, and only appear where the browser supports them.
- **Settings** has a section list on desktop and tabs on phones. Each section has its own link (`/settings?tab=appearance`). Memory shows exactly what Panda is told.
- **Onboarding** scrolls on small screens and can be skipped. "Redo setup" asks first and starts from your current answers instead of wiping them.
- **Bugs fixed:**
  - You could send a second message while a reply was still streaming.
  - Replies landed in the wrong chat if you switched chats mid-reply.
  - "Report a problem" was squeezed into the sidebar, or invisible on phones.
  - The theme toggle showed the wrong icon.
  - Signed-in students saw a theme flash on load.
  - Arabic didn't read right to left.
  - Lists numbered every item "1."
  - Streaming text disappeared after a lone `[`.
  - Dialogs had no focus trap and Escape didn't work reliably.

## Watch (YouTube)

- **A YouTube-style layout:**
  - Subject chips on the home page (Math, Science, Coding, History…).
  - Continue watching and Watch later shelves.
  - Search with suggestions and filters (length, upload date, sort, subtitles).
  - A watch page with the player, a 3-line description whose timestamps seek the video, chapters, and an Up next list.
  - Theater mode, its own end screen, and a friendly card when a school network blocks a video.
- **Library:** Watch later (your old saved videos are still there), History (with Clear and Pause), and Continue watching with progress bars.
- **"Ask Panda about this video"** opens a new chat with the video's details already typed in.
- **Keyboard shortcuts:** `/` search, `k` play/pause, `j`/`l` skip, `t` theater, `w` watch later, `?` lists them all.
- **Safety and quota:**
  - SafeSearch stays strict. Live, age-restricted and unplayable videos are filtered out.
  - Searches are cached and de-duplicated, so a class of 30 opening Watch together costs one search, not thirty.
  - A daily quota budget switches to cached-only results before YouTube's limit is hit.
  - Requests now carry the student's sign-in, so rate limits apply per student.

## Classes, planner, teacher

- **Security fix:** Canvas sign-in could be pointed at any website, which would have sent it the school's Canvas secret. It now only talks to hosts listed in the new `CANVAS_BASE_URLS` setting (see `.env.example`).
- **Students now see what their teachers set up** when Supabase is configured and they're signed in, and ticking work done reaches the teacher. Guests, or anyone without Supabase, keep the local-only flow. Students can add their own classes again.
- **Plan:**
  - Quick add ("bio lab fri 45m").
  - A week view.
  - A focus timer that keeps running across pages and reloads, with 25/5 presets, an end chime and a countdown in the tab title.
  - Gentle progress and streaks.
  - Per-assignment checklists.
  - "Add to calendar" (.ics export).
  - Separate "nothing set" and "all done" states.
- **Grades:** a "what do I need on the final?" calculator.
- **Assignment page:** the instructions stay pinned beside the chat, the chat is saved, and the input grows as you type.
- **Teacher screens:**
  - Due dates use the real clock.
  - "Due next" no longer shows months-old work.
  - Students and teachers now agree on what "overdue" means.
  - Opening an editor link directly no longer creates a duplicate assignment.
  - No flicker or "not found" flash on load.

## Build (the IDE)

- **Looks and works like a real editor.** Saved/Saving status instead of a Save button, an activity rail, an icon for every file type, clickable breadcrumbs, and a phone layout with bottom tabs.
- **Six starter templates:** blank page, canvas game, quiz, portfolio, multi-page site, drawing app.
- **Preview:**
  - Re-runs shortly after you stop typing, not on every key.
  - Phone, tablet and desktop sizes; open in a new tab; fullscreen.
  - Clear console and console filters, plus a console input that runs JavaScript in the preview.
- **Editor tools:**
  - Find in files with replace (Ctrl+Shift+F).
  - A Problems tab fed by the editor's own error checking, with runtime errors that jump to the right file and line.
  - `!` expands to an HTML page skeleton, plus a few snippets.
  - Drag files onto folders to move them.
  - Editor settings: font size, wrap, minimap, tab size (Ctrl+,).
  - A shortcuts sheet (`?`).
- **The projects page** is a card grid with search, sort, rename, make a copy, download zip and delete.
- **Bugs fixed:**
  - Renaming a folder into itself destroyed the project.
  - The preview reloaded on every keystroke, firing `alert()` each time.
  - An AI reply could land in a different project.
  - Switching tabs wiped undo history.
  - Unsaved dots and the save status never updated, and closing the tab could lose the last second of typing.
  - Downloaded images were corrupt.
  - Apply could run twice.
  - The editor got squeezed to nothing on a Chromebook.
  - Links between pages in subfolders broke.

## How it was checked

- `npx tsc --noEmit`, `npm run lint` and `npm run check` are all clean. There are now 15 check suites; `check:watch`, `check:school` and `check:ide` are new.
- `next build` passes.
- An end-to-end browser test passed on desktop and phone with no console errors. It covers:
  - Watch → Ask Panda → the chat opens with the draft.
  - Both Ctrl+K palettes, each staying on its own pages.
  - Plan quick add.
  - Picking a template → the IDE opens with the editor and a running preview.
- Every screen was screenshotted in dark and light at phone and desktop width.

## Not verified here

No API keys exist in the environment this was built in, so these paths were tested against realistic mocks rather than the real services:

- **AI chat streaming.** The Gemini key wasn't available.
- **YouTube search and playback.** The UI was driven with mock API data and a stand-in player that speaks the same postMessage protocol.
- **Signed-in students reading teacher data from Supabase.** Tested against a mocked Supabase. Row-level security and real-session edge cases need one pass against the real project.

## Left for later

- A split editor in the IDE.
- "Break it down with Panda" for assignments, a Canvas connect screen, and reminder notifications.
- Translations of the new text. Every new string falls back to English. Spanish covers the most visible Watch strings.
- Searching inside chat messages; the sidebar search matches titles only.
