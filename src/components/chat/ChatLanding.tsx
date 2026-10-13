"use client";

import type { ReactNode } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import { PandaSitting } from "@/components/Panda";
import {
  AlertIcon,
  BracesIcon,
  CircleCheckIcon,
  GlobeIcon,
  LightbulbIcon,
  MonitorIcon,
  SparkleIcon,
  TargetIcon,
} from "@/components/icons";
import type { Suggestion } from "./suggestions";

// The empty chat: who you are talking to, and four ways in.
//
// The greeting is a sentence from the catalogue with the name dropped into its
// {name} slot, then split around that slot so the name alone can carry the
// brand colour. Splitting the translated sentence — rather than gluing
// "Hi, " to a name — keeps word order right in every language.

const ICONS: Partial<Record<StringKey, ReactNode>> = {
  "chat.starterScreenshot": <MonitorIcon />,
  "chat.starterApi": <BracesIcon />,
  "chat.starterPlanSite": <GlobeIcon />,
  "chat.starterCheckWork": <CircleCheckIcon />,
  "chat.suggestPractice": <TargetIcon />,
  "chat.suggestExplain": <LightbulbIcon />,
  "chat.suggestMistake": <AlertIcon />,
};

const MARK = "\u0000";

export function ChatHero({ name }: { name: string }) {
  const { t } = useI18n();
  const [before, after] = name ? t("chat.greeting", { name: MARK }).split(MARK) : [t("chat.greetingNoName"), ""];

  return (
    <div className="flex flex-col items-center px-4 pb-6 pt-8 text-center sm:pb-8 sm:pt-12">
      <div className="landing-panda mb-3 sm:mb-4">
        <PandaSitting className="h-[104px] w-[84px] sm:h-[150px] sm:w-[120px]" />
      </div>
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[36px]">
        {before}
        {name && <span className="gradient-text">{name}</span>}
        {after}
      </h1>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[var(--text-dim)]">{t("chat.landingSubtitle")}</p>
    </div>
  );
}

export function ChatSuggestions({ suggestions, onPick }: { suggestions: Suggestion[]; onPick: (text: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto mt-6 w-full max-w-2xl sm:mt-8">
      <p className="eyebrow mb-2.5 px-1">{t("chat.suggestionsLabel")}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5" role="group" aria-label={t("chat.suggestionsLabel")}>
        {suggestions.map((s) => {
          const text = t(s.key, s.vars);
          // A suggestion built from the insights engine is about the student;
          // it gets the accent tile so it reads as personal, not generic.
          const personal = s.id.startsWith("finding:");
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(text)}
              className="suggestion-card card card-interactive tap"
              data-personal={personal || undefined}
            >
              <span className="suggestion-icon">{ICONS[s.key] ?? <SparkleIcon />}</span>
              <span className="min-w-0 flex-1 text-start text-[14px] leading-snug text-[var(--text)]">{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
