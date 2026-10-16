import { CheckCircle2, MinusCircle, Target, TrendingUp } from "lucide-react";
import { DimensionRating } from "@/types/report";

/** Chart marks: the candidate is highlighted, everyone else recedes (validated pair). */
export const CHART_YOU = "#b87a1c";
export const CHART_OTHERS = "#3f6b59";
export const CHART_TRACK = "#ece7dc";

export interface RatingStyle {
  label: DimensionRating;
  fg: string;
  bg: string;
  icon: typeof CheckCircle2;
  /** Ordering for summaries: strongest first */
  rank: number;
}

/** Status styles always pair colour with an icon and the rating text. */
export const RATING_STYLES: Record<DimensionRating, RatingStyle> = {
  Strength: { label: "Strength", fg: "#1f5a3f", bg: "#e3ebe5", icon: CheckCircle2, rank: 0 },
  Developing: { label: "Developing", fg: "#34506a", bg: "#e0e7ee", icon: TrendingUp, rank: 1 },
  "Needs practice": { label: "Needs practice", fg: "#7d5110", bg: "#f7e6c8", icon: Target, rank: 2 },
  "Not observed": { label: "Not observed", fg: "#6b675e", bg: "#efebe2", icon: MinusCircle, rank: 3 },
};

export function formatClock(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSecs / 60)}:${(totalSecs % 60).toString().padStart(2, "0")}`;
}

export function formatSpan(ms: number): string {
  const totalSecs = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return m === 0 ? `${s}s` : `${m}m ${s.toString().padStart(2, "0")}s`;
}

/** Concrete practice advice per skill, used when a round gave nothing to judge. */
export const SKILL_TIPS: Record<string, string> = {
  starting_discussion:
    "Enter in the first minute: define the topic in one line, state your stance, and suggest two angles for the group to cover.",
  idea_quality:
    "Back every point with one concrete example, number or company case, and say what trade-off it creates.",
  building_on_others:
    "Name the person and extend their idea: “Adding to Meera’s point on data…”, then give your own angle.",
  active_listening:
    "Before you respond, paraphrase the last speaker in one sentence so the panel sees you were listening.",
  handling_disagreement:
    "Disagree with the idea, not the person: “I see it differently, because…”, and offer evidence calmly.",
  ending_strongly:
    "In the closing round, summarise the main views and the group’s conclusion in two or three sentences.",
};
