import React from "react";
import { ArrowDown } from "lucide-react";
import { AI_PERSONAS, MODERATOR } from "@/constants/participants";
import { PersonaAvatar } from "@/components/ui/PersonaAvatar";

interface LandingHeroProps {
  readonly isAiConfigured: boolean | null;
}

const PANEL = [MODERATOR, ...Object.values(AI_PERSONAS)];

export function LandingHero({ isAiConfigured }: LandingHeroProps) {
  return (
    <section id="top" className="border-b border-hair">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.25fr_1fr] lg:py-24 [&>*]:min-w-0">
        <div className="animate-fade-up">
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-muted">
            Placement group discussion practice
          </p>
          <h1 className="mt-5 font-serif text-[clamp(2.4rem,4.6vw,3.75rem)] font-semibold leading-[1.05] tracking-[-0.015em] text-ink">
            Rehearse the group discussion before the real one.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Sit in a live GD with a moderator and AI peers who argue, interrupt
            and listen. Speak in English or Hinglish, then see feedback built
            from what you actually said.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <a
              href="#setup"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-forest px-6 text-base font-medium text-paper transition-colors hover:bg-forest-hover"
            >
              Set up your room
              <ArrowDown className="h-4 w-4" />
            </a>
            <span className="text-sm text-muted">5 to 10 minute rounds · No sign-up</span>
          </div>
        </div>

        {/* The panel you'll face */}
        <aside className="animate-fade-up rounded-xl border border-hair bg-card p-6 [animation-delay:120ms]">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-ink">Who&apos;s in the room</h2>
            <span className="inline-flex items-center gap-2 text-xs font-medium text-muted">
              <span className="h-2 w-2 rounded-full bg-marigold" />
              {isAiConfigured === false ? "Demo panel" : "Live panel"}
            </span>
          </div>
          <ul className="mt-5 divide-y divide-hair">
            {PANEL.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <PersonaAvatar participant={p} size="sm" />
                <span className="text-sm font-semibold text-ink">{p.name}</span>
                <span className="ml-auto text-right text-sm text-muted">
                  {p.role === "moderator" ? "Moderator" : p.personality}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
