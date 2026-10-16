"use client";

import React from "react";
import { useSession } from "@/context/SessionContext";
import { LandingNav } from "./landing/LandingNav";
import { LandingHero } from "./landing/LandingHero";
import { SetupSection } from "./landing/SetupSection";

export function RoomSetup() {
  const { state } = useSession();

  return (
    <div className="min-h-screen bg-paper font-body text-ink selection:bg-marigold-soft selection:text-ink">
      <LandingNav />
      <main>
        <LandingHero isAiConfigured={state.isAiConfigured} />
        <SetupSection />
      </main>
    </div>
  );
}
