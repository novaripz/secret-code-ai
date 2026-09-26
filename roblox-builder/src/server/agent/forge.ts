// Forge mode: several independent takes on one idea, built in parallel.
//
// Each variant is a real branch forked from the current one, built by its
// own autopilot run with a distinct creative direction. Variants are
// separately editable, previewable and restorable (they have their own
// snapshots), and adopting one copies its tree onto the base branch behind a
// restore point.

import * as store from "../store";
import { FORGE_DIRECTIONS_PROMPT } from "./prompt";
import { getProvider } from "./providers";
import { startRun, type Run } from "./runs";

export interface Direction {
  label: string;
  brief: string;
}

export interface ForgeVariant {
  branch: string;
  runId: string;
  label: string;
  brief: string;
}

const FALLBACK_DIRECTIONS: Direction[] = [
  { label: "Clean and minimal", brief: "Restrained palette, generous spacing, one accent colour, calm motion; clarity over decoration." },
  { label: "Bold and vibrant", brief: "Saturated colours, strong contrast, chunky shapes and punchy feedback on every interaction." },
  { label: "Playful and rounded", brief: "Soft rounded shapes, friendly type, bouncy animation and a warm, toy-like feel." },
  { label: "Sleek sci-fi", brief: "Dark surfaces, neon accents, thin strokes and glassy panels with a high-tech mood." },
  { label: "Cozy handcrafted", brief: "Natural materials, earthy tones and textured details that feel handmade." },
];

async function proposeDirections(prompt: string, count: number): Promise<Direction[]> {
  try {
    const provider = getProvider();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    const r = await provider.turn({
      system: "You are a creative director for game and product design. Reply with JSON only.",
      messages: [{ role: "user", content: `${FORGE_DIRECTIONS_PROMPT}\n\nNumber of directions: ${count}\n\nRequest: ${prompt}` }],
      tools: [],
      signal: controller.signal,
      maxTokens: 4000,
    });
    clearTimeout(timer);
    const json = /\[[\s\S]*\]/.exec(r.text)?.[0];
    const list = JSON.parse(json ?? "[]") as Direction[];
    const valid = list.filter((d) => typeof d?.label === "string" && typeof d?.brief === "string").slice(0, count);
    if (valid.length === count) return valid.map((d) => ({ label: d.label.slice(0, 40), brief: d.brief.slice(0, 400) }));
  } catch {
    // Fall through to the defaults; a Forge run should never fail just because this helper call did.
  }
  return FALLBACK_DIRECTIONS.slice(0, count);
}

export async function startForge(input: {
  projectId: string;
  prompt: string;
  count: number;
  directions?: Direction[];
  origin?: string;
}): Promise<{ batch: string; base: string; variants: ForgeVariant[] }> {
  const meta = await store.getProject(input.projectId);
  const base = meta.activeBranch;
  const count = Math.max(2, Math.min(5, input.count));
  const directions = input.directions?.length ? input.directions.slice(0, count) : await proposeDirections(input.prompt, count);
  const batch = store.newId("f").slice(0, 7).toLowerCase();
  await store.createSnapshot(input.projectId, base, { label: `Before Forge: ${input.prompt.slice(0, 60)}`, reason: "manual" });

  const variants: ForgeVariant[] = [];
  for (const [i, d] of directions.entries()) {
    const branch = `forge-${batch}-${i + 1}`;
    await store.createBranch(input.projectId, branch, { branch: base }, { label: d.label, forgeBatch: batch });
    const run: Run = await startRun({
      projectId: input.projectId,
      branch,
      mode: "autopilot",
      origin: input.origin,
      forgeBatch: batch,
      label: d.label,
      prompt: `${input.prompt}\n\nDesign direction for this version — ${d.label}: ${d.brief}\nCommit fully to this direction so it is clearly different from other versions. Record the direction in the design system memory.`,
    });
    variants.push({ branch, runId: run.id, label: d.label, brief: d.brief });
  }
  return { batch, base, variants };
}

/** Copies a variant's files onto the target branch, with restore points on both sides. */
export async function adoptBranch(projectId: string, from: string, into: string): Promise<{ changed: string[]; before: string; after: string }> {
  const before = await store.createSnapshot(projectId, into, { label: `Before adopting ${from}`, reason: "before-restore", force: true });
  const files = await store.readTree(projectId, from);
  const changed = await store.applyFileMap(projectId, into, files);
  const after = await store.createSnapshot(projectId, into, { label: `Adopted ${from}`, reason: "branch", force: true });
  return { changed, before: before.id, after: after.id };
}
