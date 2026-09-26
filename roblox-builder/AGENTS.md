<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project notes

- `src/core/` is pure, framework-free TypeScript (Luau parser/analyzer, Roblox model, validator, repair, asset pipeline, diff). Keep it free of Node and React imports so it runs in the browser, the server and tests.
- `src/server/` is Node-only (disk store, command runner, agent loop, Open Cloud).
- `src/ui/` is the client (workspace, panels).
- Run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` before committing.
- Never report a Roblox publish/upload as successful unless Open Cloud confirmed it.
