"use client";

import { useEffect, useState } from "react";

// Instant hover text on the health pages (owner, 2026-11-13: the browser's own tooltip waits about
// a second). Any element with a `title` (or `data-tip`) inside the page shows its text at once in a
// bubble under the pointer's element. The title moves to data-tip on first hover, so the browser's
// slow tooltip doesn't show as well. Fixed position, so a table's scroll box never clips it.
type Tip = { text: string; x: number; y: number; above: boolean };

export function InstantTips() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      const title = el.getAttribute("title");
      if (title) {
        el.dataset.tip = title;
        el.removeAttribute("title");
      }
      const text = el.dataset.tip;
      if (!text) return setTip(null);
      const r = el.getBoundingClientRect();
      const above = r.bottom + 60 > window.innerHeight;
      setTip({ text, x: Math.min(Math.max(8, r.left), window.innerWidth - 328), y: above ? r.top - 6 : r.bottom + 6, above });
    };
    const over = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("main [title], main [data-tip]") ?? null;
      if (el === current) return;
      current = el;
      if (el) show(el);
      else setTip(null);
    };
    const hide = () => {
      current = null;
      setTip(null);
    };
    // Keyboard users get the same text on focus.
    const focus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("main [title], main [data-tip]") ?? null;
      current = el;
      if (el) show(el);
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-80 whitespace-pre-line rounded-md bg-slate-900 px-2 py-1 text-xs leading-snug text-white shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: tip.above ? "translateY(-100%)" : undefined }}
    >
      {tip.text}
    </div>
  );
}
