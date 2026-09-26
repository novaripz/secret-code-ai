import "./tests/env";
import { runAll } from "./tests/harness";
import "./tests/luau.test";
import "./tests/roblox.test";
import "./tests/assets.test";
import "./tests/agent.test";

const failed = await runAll(process.argv[2]);
process.exit(failed ? 1 : 0);
