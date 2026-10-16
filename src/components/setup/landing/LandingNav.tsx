"use client";

import React, { useEffect, useState } from "react";

export function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 bg-paper/95 backdrop-blur-sm transition-colors ${
        isScrolled ? "border-b border-hair" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 sm:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-forest text-[11px] font-bold tracking-wide text-paper">
            GD
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight text-ink">GD Arena</span>
        </a>

        <a
          href="#setup"
          className="inline-flex h-10 items-center rounded-lg bg-forest px-4 text-sm font-medium text-paper transition-colors hover:bg-forest-hover"
        >
          Start practising
        </a>
      </div>
    </header>
  );
}
