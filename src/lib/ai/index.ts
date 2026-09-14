// Types only. Choosing a provider happens in chain.ts.
//
// This file used to export a factory that built a Gemini provider directly.
// Nothing called it any more, but leaving it was a trap: it was the obvious
// import for anyone adding a new server route, and taking it would have
// bypassed the fallback chain, the per-provider deadlines and the key checks,
// reintroducing the single point of failure the chain exists to remove — and
// doing it quietly, since a Gemini-only path works fine until its daily quota
// runs out mid-lesson.
//
// getProviderChain() in ./chain is the only way to reach a model.

export type { AiProvider, AgentRequest, AiMessage } from "./provider";
