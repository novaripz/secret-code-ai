"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export const DEVICES = [
  { id: "phone", label: "Phone", w: 844, h: 390 },
  { id: "tablet", label: "Tablet", w: 1024, h: 768 },
  { id: "laptop", label: "Laptop", w: 1280, h: 720 },
  { id: "desktop", label: "Desktop", w: 1920, h: 1080 },
] as const;

/** Renders children at a fixed device resolution, scaled to fit the available space. */
export function DeviceFrame({ w, h, children, className }: { w: number; h: number; children: ReactNode; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = host.current!;
    const ro = new ResizeObserver(() => {
      const s = Math.min((el.clientWidth - 32) / w, (el.clientHeight - 32) / h, 1.5);
      setScale(Math.max(0.05, s));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return (
    <div ref={host} className="relative grid h-full w-full place-items-center overflow-hidden">
      <div style={{ width: w * scale, height: h * scale }} className="relative">
        <div
          className={className}
          style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "0 0", position: "absolute", left: 0, top: 0, overflow: "hidden", borderRadius: 14 / scale > 40 ? 40 : 14 / Math.max(scale, 0.3) }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
