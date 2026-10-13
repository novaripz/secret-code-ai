// The watch page's player controls, reachable from the page-wide keyboard
// shortcuts. The page registers them while it is mounted and clears them on
// the way out; the shortcut handler only ever reads them inside a key event.

export interface PageControls {
  togglePlay(): void;
  seekBy(delta: number): void;
  toggleMute(): void;
  next(): void;
  toggleLater(): void;
  askPanda(): void;
}

export const pageControls: { current: PageControls | null } = { current: null };
