# Roblox Builder

An AI product engineer for Roblox games. Describe what you want and it plans the work, writes production Luau in a Rojo project, builds the UI and 3D assets, validates everything against Roblox's rules, repairs what it can, and exports a place you can open in Studio or publish through Open Cloud. It also builds plain web apps.

## Quick start

```bash
npm install          # also copies Monaco into public/monaco
cp .env.example .env.local   # add ANTHROPIC_API_KEY (or another provider)
npm run dev          # http://localhost:3000
```

You need Node 20+. Projects are stored in `DATA_DIR` (default `.data/`).

## What's in it

| Area | What it does |
| --- | --- |
| **Agent** | A streaming tool-use loop (Claude by default; OpenAI, Gemini, OpenRouter or Groq also work) with 20+ tools: read, write and patch files, edit the instance hierarchy, run commands, validate, auto-repair, run tests, generate assets, snapshot and restore. |
| **Modes** | **Guided** asks before destructive actions. **Autopilot** runs the full plan → code → test → debug → optimize → validate timeline by itself. **Forge** builds several design directions in parallel on separate branches, which you can preview, compare, adopt or discard. |
| **Verification gate** | A run can't finish while its Roblox checks fail. The harness auto-repairs, re-validates, runs the tests and feeds any remaining errors back to the agent for a bounded number of rounds. |
| **Luau** | A real lexer, parser and semantic analyzer covering client/server boundaries, deprecated APIs (with fixes), remote argument validation, DataStore `pcall`, busy loops and instance references. It powers the editor's live diagnostics and quick fixes. |
| **Roblox model** | Rojo 7 file→instance mapping, a class/enum reflection subset, typed property values, `.rbxlx`/`.rbxmx` writer and reader. |
| **Compatibility validator** | 10 check groups plus a UI audit at phone, tablet and desktop sizes. Each finding has a ✓/⚠/✕ status, and many come with a one-click repair. |
| **UI builder** | Drag and resize GuiObjects on a device frame with snapping. There's an inspector for every property and a "make responsive" helper. Changes are written back to `*.model.json`. |
| **3D assets** | Assets are built from a spec as primitive meshes. Output is GLB, glTF or OBJ (with textures), plus a native-part Roblox model with a PrimaryPart and welds. Scale and triangle-budget validation is included, and there's a live three.js viewport. |
| **History** | Every change is a content-addressed snapshot. You get restore points, per-file restore, diffs between any two points, branches (real working trees) and "undo run". |
| **Export** | Rojo project zip (`src/client`, `server`, `shared`, `ui`, `modules`, `assets`, `config`), `.rbxlx` place, `.rbxmx` model, or an Open Cloud place publish and asset upload. |
| **IDE** | Dockable, resizable and collapsible panels; Monaco with Luau highlighting; explorer; preview; terminal; tests; logs; a command palette (`⌘K`); and light/dark themes. |

## Honest limits

- Gameplay only runs inside Roblox. Outside it, the tool checks everything it can: parse, analysis, the hierarchy, and an export round-trip. TestEZ specs are listed as *skipped* with a note to run them in Studio.
- `rojo build` and `selene` run only when they're installed on the server. Otherwise they're reported as skipped and the built-in exporter/analyzer is used instead.
- FBX isn't generated. Use GLB (Roblox's recommended import format) or the native-part `.model.json`.
- Publishing and uploads call Roblox's official Open Cloud APIs. Success is shown only when Roblox returns a version number or an asset id.

## Scripts

`npm run dev` · `npm run build` · `npm start` · `npm test` (core + agent tests) · `npm run lint` · `npm run typecheck`

## Security

Commands run without a shell. Only allow-listed programs are run, with a scrubbed environment (no API keys) and timeouts. They still execute real project code, so host the app somewhere you're willing to let project code run. You can set `ALLOW_COMMANDS=false`, and `APP_PASSWORD` protects a shared deployment.
