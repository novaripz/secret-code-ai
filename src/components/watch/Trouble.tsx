"use client";

import { Fragment } from "react";
import { useI18n, type StringKey } from "@/lib/i18n";
import { AlertIcon, BookmarkIcon, ClockIcon, LockIcon, RefreshIcon, ShieldCheckIcon, SparkleIcon, UserIcon } from "@/components/icons";
import { LinkButton } from "@/components/ui/Button";
import { PandaSitting } from "@/components/Panda";
import type { WatchProblem } from "@/lib/watch/types";
import type { WatchFailure } from "./api";
import { watchHref } from "./nav";

// What went wrong, and the one next step that would actually help.
//
// Six problems, six different answers, and "try again" only where trying again
// can work: a dropped connection or Panda's own short rate limit, yes; a missing
// key, a wrong key or YouTube's daily quota, never — a Retry button there only
// teaches students that the button lies. Every card points at the library,
// because Watch later, History and Continue watching work with no YouTube at
// all.
//
// The wording is the page's own, in the student's language, rather than the
// English sentence the server sent: the server's message is written for
// whoever runs Panda, and the student needs a different one.

const HEADLINE: Record<WatchProblem, StringKey> = {
  "missing-key": "watch.notConfiguredTitle",
  quota: "watch.troubleQuota",
  "wrong-key": "watch.troubleWrongKey",
  failed: "watch.troubleFailed",
  busy: "watch.troubleBusy",
  auth: "watch.troubleAuth",
};

const HINT: Record<WatchProblem, StringKey> = {
  "missing-key": "watch.notConfiguredBody",
  quota: "watch.troubleQuotaHint",
  "wrong-key": "watch.troubleWrongKeyHint",
  failed: "watch.troubleFailedHint",
  busy: "watch.troubleBusyHint",
  auth: "watch.troubleAuthHint",
};

const ICON: Record<WatchProblem, typeof AlertIcon> = {
  "missing-key": LockIcon,
  quota: ClockIcon,
  "wrong-key": LockIcon,
  failed: AlertIcon,
  busy: ClockIcon,
  auth: UserIcon,
};

export function Trouble({
  failure,
  onRetry,
  compact = false,
}: {
  failure: WatchFailure;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (failure.problem === "missing-key" && !compact) return <NotConfigured />;

  const retryable = failure.problem === "failed" || failure.problem === "busy";
  const Icon = ICON[failure.problem];

  return (
    <div
      role="status"
      className={`flex gap-3.5 rounded-ui-lg border border-line bg-surface-1 shadow-ui-1 ${compact ? "px-4 py-3.5" : "px-5 py-5"}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">{t(HEADLINE[failure.problem])}</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-dim">{t(HINT[failure.problem])}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {retryable && onRetry && (
            <button type="button" className="btn btn-secondary btn-sm tap" onClick={onRetry}>
              <RefreshIcon />
              {failure.problem === "busy" && failure.retryAfter
                ? t("watch.retryIn", { seconds: failure.retryAfter })
                : t("action.retry")}
            </button>
          )}
          {!compact && (
            <LinkButton href={watchHref({ list: "later" })} size="sm" variant="ghost" className="tap" icon={<BookmarkIcon />}>
              {t("watch.notConfiguredLibrary")}
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  );
}

/** Highlights the two names an admin needs to find, inside a translated sentence. */
function withCode(text: string) {
  return text.split(/(\.env\.example|YOUTUBE_API_KEY)/).map((part, i) =>
    part === ".env.example" || part === "YOUTUBE_API_KEY" ? (
      <code key={i} className="rounded-[5px] bg-surface-3 px-1.5 py-0.5 font-mono text-[12.5px] text-ink">
        {part}
      </code>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/**
 * The "no YouTube key" state, which is what every fresh copy of Panda shows
 * until someone sets one up. It is the first thing a new school sees, so it is
 * written to look intentional rather than broken: what's missing, who can fix
 * it and where the steps are, and what still works in the meantime.
 */
export function NotConfigured() {
  const { t } = useI18n();
  return (
    <div className="card relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[0.16] blur-3xl"
        style={{ background: "var(--brand-gradient)" }}
      />
      <div className="relative flex flex-col items-center gap-6 px-6 py-8 text-center sm:flex-row sm:items-center sm:gap-8 sm:px-10 sm:text-left">
        <PandaSitting className="h-32 w-auto shrink-0 sm:h-40" />
        <div className="min-w-0 max-w-xl">
          <span className="badge badge-warn">
            <LockIcon />
            {t("watch.setupNeeded")}
          </span>
          <h2 className="mt-3 text-[21px] font-semibold tracking-tight text-ink sm:text-[24px]">{t("watch.notConfiguredTitle")}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">{t("watch.notConfiguredBody")}</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-faint">{withCode(t("watch.notConfiguredHow"))}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
            <LinkButton href={watchHref({ list: "later" })} variant="primary" className="tap" icon={<BookmarkIcon />}>
              {t("watch.notConfiguredLibrary")}
            </LinkButton>
          </div>
        </div>
      </div>

      {/* What switching it on gets a student, so the card reads as "not yet"
          rather than "broken". */}
      <ul className="relative grid border-t border-line sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 border-line px-6 py-4 [&:not(:last-child)]:border-b sm:[&:not(:last-child)]:border-b-0 sm:[&:not(:last-child)]:border-r">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-sm bg-accent-soft text-accent-text">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold text-ink">{t(title)}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-faint">{t(body)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FEATURES: { icon: typeof AlertIcon; title: StringKey; body: StringKey }[] = [
  { icon: ShieldCheckIcon, title: "watch.featureSafeTitle", body: "watch.featureSafeBody" },
  { icon: BookmarkIcon, title: "watch.featureLaterTitle", body: "watch.featureLaterBody" },
  { icon: SparkleIcon, title: "watch.featureAskTitle", body: "watch.featureAskBody" },
];
