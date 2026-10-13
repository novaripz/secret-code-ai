"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

// The one iframe in the whole tab.
//
// A single video can be embedded where youtube.com itself cannot, through the
// youtube-nocookie host. Everything else in Watch is drawn from data, so this
// player is a video, not a door.
//
// It is driven with plain postMessage rather than YouTube's IFrame API script:
// with `enablejsapi=1` the embed listens for JSON commands and reports its
// state back, which is all Panda needs (play, pause, seek, mute, where are
// you, did you finish, did you fail), and it means no third-party script runs
// on the page and the CSP needs nothing new. The handshake is the same one the
// official script performs: say "listening" until the frame answers, then ask
// for the events.
//
// What the embed parameters do, honestly:
//   rel=0            related videos at the end come only from the same channel
//                    — and Panda hides the end screen anyway, see WatchView
//   iv_load_policy=3 no annotation cards over the video
//   playsinline=1    iPhones play in the page, not in a fullscreen takeover
//   autoplay=1       one click on a card is enough to start it
// `modestbranding` is gone: YouTube has ignored it since 2023.

export const PLAYER_ORIGIN = "https://www.youtube-nocookie.com";

/** What the watch page can ask of the player. */
export interface PlayerControls {
  togglePlay(): void;
  seekTo(seconds: number): void;
  seekBy(delta: number): void;
  toggleMute(): void;
  /** Seconds in, from the player's own last report. */
  time(): number;
  duration(): number;
}

export interface PlayerEvents {
  /** Each time playback (re)starts. */
  onPlaying?: () => void;
  onEnded?: () => void;
  /** YouTube's code: 2 bad id, 5 HTML5 error, 100 gone, 101/150 not embeddable, 153 missing referrer. */
  onError?: (code: number) => void;
  /** Several times a second while playing. */
  onTime?: (time: number, duration: number) => void;
}

interface PlayerProps extends PlayerEvents {
  videoId: string;
  title: string;
  start: number;
  /** The page's own origin, which the embed needs to know who it is talking to. */
  origin: string;
  locale: string;
  ref?: Ref<PlayerControls>;
}

function send(frame: HTMLIFrameElement | null, message: Record<string, unknown>) {
  frame?.contentWindow?.postMessage(JSON.stringify({ id: 1, channel: "widget", ...message }), PLAYER_ORIGIN);
}

function command(frame: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  send(frame, { event: "command", func, args });
}

export function embedSrc(videoId: string, start: number, origin: string, locale: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    iv_load_policy: "3",
    playsinline: "1",
    enablejsapi: "1",
    origin,
    hl: locale,
  });
  if (start > 0) params.set("start", String(Math.floor(start)));
  return `${PLAYER_ORIGIN}/embed/${videoId}?${params.toString()}`;
}

export function Player({ videoId, title, start, origin, locale, ref, ...events }: PlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const info = useRef({ time: start, duration: 0, state: -1, muted: false });

  // The latest handlers, read from inside the message listener so the listener
  // itself is set up once per video and never torn down mid-playback.
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });

  useImperativeHandle(
    ref,
    () => ({
      togglePlay() {
        const playing = info.current.state === 1 || info.current.state === 3;
        command(frameRef.current, playing ? "pauseVideo" : "playVideo");
      },
      seekTo(seconds) {
        const to = Math.max(0, info.current.duration ? Math.min(seconds, info.current.duration - 1) : seconds);
        info.current.time = to;
        command(frameRef.current, "seekTo", [to, true]);
      },
      seekBy(delta) {
        this.seekTo(info.current.time + delta);
      },
      toggleMute() {
        command(frameRef.current, info.current.muted ? "unMute" : "mute");
        info.current.muted = !info.current.muted;
      },
      time: () => info.current.time,
      duration: () => info.current.duration,
    }),
    [],
  );

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let heard = false;

    const hello = () => send(frame, { event: "listening" });
    const timer = window.setInterval(() => {
      if (heard) window.clearInterval(timer);
      else hello();
    }, 400);
    frame.addEventListener("load", hello);

    function setState(state: number) {
      if (state === info.current.state) return;
      info.current.state = state;
      if (state === 1) eventsRef.current.onPlaying?.();
      if (state === 0) eventsRef.current.onEnded?.();
    }

    function onMessage(e: MessageEvent) {
      // Only our own frame, from YouTube's origin. Anything else posting to the
      // page (an extension, another frame) is ignored outright.
      if (e.origin !== PLAYER_ORIGIN || e.source !== frame?.contentWindow) return;
      let data: { event?: string; info?: unknown };
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!data || typeof data !== "object") return;

      if (!heard) {
        heard = true;
        command(frame, "addEventListener", ["onStateChange"]);
        command(frame, "addEventListener", ["onError"]);
      }

      if (data.event === "infoDelivery" || data.event === "initialDelivery") {
        const i = (data.info ?? {}) as { currentTime?: unknown; duration?: unknown; playerState?: unknown; muted?: unknown };
        if (typeof i.duration === "number" && i.duration > 0) info.current.duration = i.duration;
        if (typeof i.muted === "boolean") info.current.muted = i.muted;
        if (typeof i.currentTime === "number") {
          info.current.time = i.currentTime;
          eventsRef.current.onTime?.(i.currentTime, info.current.duration);
        }
        if (typeof i.playerState === "number") setState(i.playerState);
      } else if (data.event === "onStateChange" && typeof data.info === "number") {
        setState(data.info);
      } else if (data.event === "onError") {
        eventsRef.current.onError?.(Number(data.info));
      }
    }

    window.addEventListener("message", onMessage);
    return () => {
      window.clearInterval(timer);
      frame.removeEventListener("load", hello);
      window.removeEventListener("message", onMessage);
    };
  }, [videoId, start]);

  return (
    <iframe
      ref={frameRef}
      src={embedSrc(videoId, start, origin, locale)}
      title={title}
      // No accelerometer or gyroscope: a video lesson needs neither, and both
      // are fingerprinting surface.
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
      allowFullScreen
      // The embed refuses to play (error 153) without knowing which site it is
      // on, so the origin has to travel even though nothing else does.
      referrerPolicy="strict-origin-when-cross-origin"
      className="absolute inset-0 h-full w-full border-0"
    />
  );
}
