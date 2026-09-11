// Two icons the rest of the app doesn't have a use for, so they live next to
// the tab that does. A bookmark rather than a floppy disk or a heart: saving a
// video here means "come back to this", not "I liked it".

export function BookmarkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4.5h12v15l-6-4.2-6 4.2z" />
    </svg>
  );
}

export function BookmarkFilledIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" stroke="currentColor"
         strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4.5h12v15l-6-4.2-6 4.2z" />
    </svg>
  );
}
