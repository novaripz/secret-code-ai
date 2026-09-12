"use client";

// The rules for one assignment, at a glance.
//
// Split out because the list, the editor preview and the overview all need the
// same reading of the same three settings, and three copies would drift. An
// allowed setting is deliberately quiet and a disabled one is loud: the default
// is permissive, so the information is in what has been switched off.

import type { AssignmentRules } from "@/lib/school/types";
import { Chip } from "./primitives";

const ANSWERS: Record<AssignmentRules["answers"], { label: string; tone: "neutral" | "good" | "warn" }> = {
  guided: { label: "Answers: guided only", tone: "warn" },
  afterUnderstanding: { label: "Answers: after understanding", tone: "neutral" },
  allowed: { label: "Answers: allowed", tone: "good" },
};

export function RuleChips({ rules }: { rules: Omit<AssignmentRules, "assignmentId"> }) {
  return (
    <>
      <Chip tone={ANSWERS[rules.answers].tone}>{ANSWERS[rules.answers].label}</Chip>
      {rules.translation === "disabled" && <Chip tone="bad">Translation off</Chip>}
      {rules.simplification === "disabled" && <Chip tone="bad">Simplifying off</Chip>}
      {rules.pandaInstructions && <Chip>Custom instructions</Chip>}
    </>
  );
}
