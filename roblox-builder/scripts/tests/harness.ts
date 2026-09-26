// Minimal test harness: no framework, just named cases and real assertions.
import assert from "node:assert/strict";

type Case = { name: string; fn: () => void | Promise<void> };
const cases: Case[] = [];

export function test(name: string, fn: () => void | Promise<void>): void {
  cases.push({ name, fn });
}

export { assert };

export async function runAll(filter?: string): Promise<number> {
  let failed = 0;
  let passed = 0;
  for (const c of cases) {
    if (filter && !c.name.includes(filter)) continue;
    try {
      await c.fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`✕ ${c.name}\n  ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  return failed;
}
