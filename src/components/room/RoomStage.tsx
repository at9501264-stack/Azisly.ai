"use client";

import React from "react";
import { Participant, DiscussionPhase } from "@/types/session";
import { Seat } from "./Seat";
import { StudentSeat } from "./StudentSeat";

interface RoomStageProps {
  readonly topic: string;
  readonly phase: DiscussionPhase;
  readonly moderator: Participant | undefined;
  readonly peers: Participant[];
  readonly activeSpeakerId: string | null;
  readonly generatingSpeakerId: string | null;
  readonly isGenerating: boolean;
  readonly isVoiceMode: boolean;
  readonly isMicMuted: boolean;
  readonly isStudentSpeaking: boolean;
  readonly hasTheFloor: boolean;
  readonly isPanelSpeaking: boolean;
  readonly onToggleMute: () => void;
}

interface SeatPosition {
  x: number;
  y: number;
}

const PHASE_LABEL: Record<DiscussionPhase, string> = {
  setup: "Getting ready",
  opening: "Opening",
  discussion: "Open discussion",
  closing: "Closing round",
  completed: "Finished",
};

const MODERATOR_POS: SeatPosition = { x: 50, y: 19 };
const STUDENT_POS: SeatPosition = { x: 50, y: 86 };

/** Vertical slots for 1–3 people seated along one side of the table */
const SIDE_SLOTS: Record<number, number[]> = {
  1: [52],
  2: [36, 70],
  3: [25, 52, 79],
};

/** Split peers around the table: the smaller group on the left. */
function layoutPeers(peers: Participant[]): Map<string, SeatPosition & { crowded: boolean }> {
  const leftCount = Math.floor(peers.length / 2);
  const left = peers.slice(0, leftCount);
  const right = peers.slice(leftCount);
  const positions = new Map<string, SeatPosition & { crowded: boolean }>();
  left.forEach((p, i) => positions.set(p.id, { x: 13, y: SIDE_SLOTS[left.length][i], crowded: left.length > 2 }));
  right.forEach((p, i) => positions.set(p.id, { x: 87, y: SIDE_SLOTS[right.length][i], crowded: right.length > 2 }));
  return positions;
}

function gazeToward(from: SeatPosition, to: SeatPosition | null): number {
  if (!to) return 0;
  const dx = to.x - from.x;
  if (Math.abs(dx) < 4) return 0;
  return dx > 0 ? 1 : -1;
}

export function RoomStage({
  topic,
  phase,
  moderator,
  peers,
  activeSpeakerId,
  generatingSpeakerId,
  isGenerating,
  isVoiceMode,
  isMicMuted,
  isStudentSpeaking,
  hasTheFloor,
  isPanelSpeaking,
  onToggleMute,
}: RoomStageProps) {
  const peerPositions = layoutPeers(peers);

  const positionOf = (id: string | null): SeatPosition | null => {
    if (!id) return null;
    if (moderator && id === moderator.id) return MODERATOR_POS;
    return peerPositions.get(id) ?? STUDENT_POS;
  };
  // Everyone turns toward whoever holds the floor
  const focus = isStudentSpeaking ? STUDENT_POS : positionOf(activeSpeakerId);

  const seatProps = (p: Participant, pos: SeatPosition) => ({
    participant: p,
    isSpeaking: activeSpeakerId === p.id,
    isThinking: isGenerating && generatingSpeakerId === p.id && activeSpeakerId !== p.id,
    lookX: activeSpeakerId === p.id ? 0 : gazeToward(pos, focus),
  });

  const placeAt = (pos: SeatPosition) =>
    ({ "--x": `${pos.x}%`, "--y": `${pos.y}%` }) as React.CSSProperties;
  const SEAT_ANCHOR = "md:absolute md:left-[var(--x)] md:top-[var(--y)] md:-translate-x-1/2 md:-translate-y-1/2";

  return (
    <section
      aria-label="Discussion table"
      className="relative overflow-hidden rounded-2xl border border-hair bg-[radial-gradient(ellipse_at_50%_45%,#fbf9f4_0%,#efebe2_75%)] px-4 py-6 md:h-[clamp(640px,76vh,780px)] md:p-0"
    >
      {/* Table with the topic placard */}
      <div className="mx-auto mb-6 max-w-md rounded-[2rem] bg-forest p-5 text-center text-paper shadow-[inset_0_0_0_6px_rgba(246,243,236,0.06),0_20px_40px_-20px_rgba(30,58,47,0.6)] md:absolute md:inset-x-[25%] md:bottom-[26%] md:top-[36%] md:mb-0 md:flex md:max-w-none md:flex-col md:items-center md:justify-center md:rounded-[50%] md:p-10">
        <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-on-forest-muted">
          {PHASE_LABEL[phase]}
        </span>
        <p className="mt-2 line-clamp-3 font-serif text-lg font-semibold leading-snug md:text-xl lg:text-2xl">
          {topic}
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 md:contents">
        {moderator && (
          <div className={SEAT_ANCHOR} style={placeAt(MODERATOR_POS)}>
            <Seat {...seatProps(moderator, MODERATOR_POS)} size="lg" />
          </div>
        )}

        <div className="grid w-full grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:contents">
          {peers.map((p) => {
            const pos = peerPositions.get(p.id)!;
            return (
              <div key={p.id} className={SEAT_ANCHOR} style={placeAt(pos)}>
                <Seat {...seatProps(p, pos)} size={pos.crowded ? "sm" : "md"} />
              </div>
            );
          })}
        </div>

        <div className={SEAT_ANCHOR} style={placeAt(STUDENT_POS)}>
          <StudentSeat
            isVoiceMode={isVoiceMode}
            isMicMuted={isMicMuted}
            isSpeaking={isStudentSpeaking}
            hasTheFloor={hasTheFloor}
            isPanelSpeaking={isPanelSpeaking}
            onToggleMute={onToggleMute}
          />
        </div>
      </div>
    </section>
  );
}
