# Studio — browser-based AI coding environment

Code, chat with an AI agent, and preview your project — entirely in the browser. No VS Code, no CLI tools, no local installs required for your friend to use it.

## What it is

- **Project & file system** — create projects, files, and nested folders; rename, delete, drag through tabs; everything autosaves to the browser (IndexedDB) as you type.
- **Code editor** — Monaco (the engine behind VS Code): syntax highlighting, autocomplete, multi-tab editing, unsaved-change dots. Supports HTML, CSS, JS/TS, JSON, Python, Java, C#, C/C++, Go, Rust, Ruby, PHP, Markdown, YAML, and more.
- **AI coding agent** — a right-side chat panel backed by Google Gemini. It inspects your file tree and relevant file contents, then returns **structured file operations** (create/modify/delete/rename) which you review and apply — never a wall of code to copy-paste by hand.
- **Live preview** — sandboxed `<iframe>` that renders your project's `index.html` with local CSS/JS inlined; console/runtime errors are captured and shown in a Console/Problems panel.
- **Command panel** — an honest run/console panel. This app does not fake a terminal or run arbitrary shell commands; it clearly executes only what a browser can safely execute (loading your HTML/CSS/JS in a sandbox).
- **Import/export** — zip a project out, or import an existing folder-as-zip back in.

## Tech stack

Next.js (App Router) + TypeScript, Tailwind CSS, Monaco Editor, Zustand, IndexedDB (via `localforage`) for persistence, Google Gemini via a server-only API route.

## Getting started

```bash
npm install
cp .env.example .env.local
# edit .env.local and set GEMINI_API_KEY=your-key-here
npm run dev
```

Open http://localhost:3000, create a project, and start chatting with the AI — try:

> "create a simple portfolio website with a hero section, about section, projects section, and contact form"

Then iterate:

> "make the hero section bigger and add animations"

## Architecture

```
src/
  app/
    page.tsx                 project list (home)
    project/[id]/page.tsx    the IDE itself
    api/ai/route.ts          server-only Gemini endpoint (the API key never reaches the browser)
  lib/
    fileSystem.ts            in-memory project tree: create/rename/delete/move, path-safe
    paths.ts                 path normalization + traversal protection ("../" is rejected everywhere)
    storage.ts                IndexedDB persistence (project autosave, project list)
    zip.ts                   import/export as .zip
    buildPreviewDocument.ts  builds a sandboxed, self-contained HTML doc for the live preview
    ai/
      provider.ts            provider-agnostic interface — swap Gemini for OpenAI/Anthropic here
      gemini.ts               Gemini implementation + strict JSON response parsing
      systemPrompt.ts         the agent's instructions (always respond with structured operations)
      contextSelection.ts     picks a bounded, relevant subset of files to send to the model
      validateOperations.ts   server-side re-validation of every AI-proposed file operation
  store/
    useStudioStore.ts        project/editor/tabs/console state (zustand) + autosave
    useChatStore.ts          chat history, persisted per project
  components/                explorer, editor, chat, preview, layout
```

### How the AI agent works

1. The client builds a **text file tree** and a **bounded set of relevant file contents** (`lib/ai/contextSelection.ts`) — the current open file, files it references (via simple import/`href`/`src` scanning), files whose path matches keywords in the prompt, and common entry points. This keeps requests fast and cheap even as a project grows, instead of always shipping every file.
2. That, plus the prompt and recent chat history, is POSTed to `/api/ai` — a Next.js server route. This is the **only** place `GEMINI_API_KEY` is read; it is never sent to or bundled into client code.
3. The server asks Gemini (`lib/ai/gemini.ts`) for a **strict JSON** response: `{ operations: [...], message, openFiles }`. The system prompt (`lib/ai/systemPrompt.ts`) forbids diffs/partial code — every `create`/`modify` operation carries complete file contents.
4. The server re-validates every operation (`lib/ai/validateOperations.ts`) — rejecting path traversal, absolute paths, and malformed entries — before it ever reaches the client, and the client's `applyOperations` re-checks paths again before writing to the project tree.
5. The chat panel shows the proposed operations (type, path, diffable content) with **Apply** / **Discard** — nothing touches your project until you approve it.

### Safety notes

- `GEMINI_API_KEY` is read only inside `src/app/api/ai/route.ts` (a server route) — grep the client bundle and you won't find it.
- All file paths — from the UI and from the AI — go through `assertSafePath()`, which rejects `..`, absolute paths, and invalid characters.
- The preview `<iframe>` uses `sandbox="allow-scripts allow-forms allow-modals"` with **no** `allow-same-origin`, and is fed a self-contained `srcdoc` document (no network fetches of your files) — it cannot reach cookies, localStorage, or the parent app.
- There is no server-side command execution of any kind, AI-proposed or otherwise. The "Run" button only loads your HTML/CSS/JS into the sandboxed preview.

## Optional: Firebase

The app works fully offline/local with zero config (IndexedDB). If you want multi-device sync or auth later, add Firebase env vars from `.env.example` and wire up `firebase`/`firebase-admin` (already installed) behind the same `lib/storage.ts` interface — the rest of the app doesn't need to change.

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # run the production build
npm run lint    # eslint
```

## Deploying

Any Node hosting works (Vercel, Fly, Render, a VPS). Set `GEMINI_API_KEY` as a server environment variable in your host's dashboard — never commit it, never prefix it with `NEXT_PUBLIC_`.
