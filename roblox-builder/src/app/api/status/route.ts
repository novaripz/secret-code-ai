import { providerStatus } from "@/server/agent/providers";
import { authEnabled } from "@/server/auth";
import { findChromium } from "@/server/browser";
import { commandsEnabled, toolAvailability } from "@/server/exec";
import { json, route } from "@/server/http";
import { cloudConfigured } from "@/server/robloxCloud";

export const dynamic = "force-dynamic";

export const GET = route(async () =>
  json({
    ai: providerStatus(),
    commands: commandsEnabled(),
    tools: toolAvailability(),
    browser: !!findChromium(),
    robloxCloud: cloudConfigured(),
    auth: authEnabled(),
  }),
);
