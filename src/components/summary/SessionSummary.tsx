'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Download,
  FileText,
  MessageSquareQuote,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { calculateSessionMetrics } from '@/lib/metricsCalculator';
import { downloadMarkdownReport, downloadSessionJson, downloadTranscript } from '@/lib/reportExport';
import { DimensionRating } from '@/types/report';
import { PersonaAvatar } from '@/components/ui/PersonaAvatar';
import { STUDENT_PARTICIPANT } from '@/constants/participants';
import { AirtimeChart } from './AirtimeChart';
import { DiscussionTimeline } from './DiscussionTimeline';
import { SkillCard } from './SkillCard';
import { RATING_STYLES, SKILL_TIPS, formatClock, formatSpan } from './reportUi';

const DEFAULT_DISCLAIMER =
  'AI-generated practice coaching based strictly on observable behaviours in this session; not an official placement assessment.';

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-hair bg-card p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatTile({ label, value, hint }: { readonly label: string; readonly value: string; readonly hint?: string }) {
  return (
    <div className="rounded-xl border border-hair bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function DownloadMenu({ onMarkdown, onTranscript, onJson }: { readonly onMarkdown: () => void; readonly onTranscript: () => void; readonly onJson: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = 'block w-full cursor-pointer px-4 py-2.5 text-left text-sm text-ink hover:bg-paper';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-hair bg-card px-3.5 text-sm font-medium text-ink hover:border-muted/40"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Download</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-hair bg-card shadow-[0_12px_32px_-12px_rgba(26,26,23,0.35)]">
          <button role="menuitem" id="download-markdown-report-btn" className={item} onClick={() => { onMarkdown(); setOpen(false); }}>
            Coaching report (.md)
          </button>
          <button role="menuitem" className={item} onClick={() => { onTranscript(); setOpen(false); }}>
            Transcript (.txt)
          </button>
          <button role="menuitem" id="download-json-btn" className={item} onClick={() => { onJson(); setOpen(false); }}>
            Full session data (.json)
          </button>
        </div>
      )}
    </div>
  );
}

export function SessionSummary() {
  const { state, resetSession, report, isGeneratingReport, reportError, isReportStale, generateReport } = useSession();
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

  const fallbackMetrics = useMemo(
    () =>
      calculateSessionMetrics({
        transcript: state.transcript,
        timingEvents: [],
        activeDurationMs: state.elapsedSeconds * 1000,
        isVoiceMode: state.interactionMode === 'voice',
        isDemoMode: state.engineMode === 'demo',
      }),
    [state.transcript, state.elapsedSeconds, state.interactionMode, state.engineMode],
  );
  const metrics = report?.metrics || fallbackMetrics;
  const exportInput = { state, metrics, report };

  const studentId = STUDENT_PARTICIPANT.id;
  const yourTurns = metrics.turnCountsBySpeaker[studentId] ?? 0;
  const yourShare = metrics.speakingSharePercent[studentId] ?? 0;
  const evenSplit = Math.round(100 / Math.max(1, state.participants.length));
  const durationMs = state.elapsedSeconds * 1000;

  // Rating counts drive the headline; derived only from the verified report
  const ratingCounts = useMemo(() => {
    const counts: Record<DimensionRating, number> = { Strength: 0, Developing: 0, 'Needs practice': 0, 'Not observed': 0 };
    report?.dimensions.forEach((d) => (counts[d.rating] = (counts[d.rating] ?? 0) + 1));
    return counts;
  }, [report]);

  let headline = 'Your discussion is complete';
  let subline = 'Your coaching report is being prepared from the transcript.';
  if (yourTurns === 0) {
    headline = "You didn't speak this round";
    subline = 'There was nothing of yours to assess yet. Next time, try to make one point in the first two minutes.';
  } else if (report) {
    if (ratingCounts.Strength >= 4) {
      headline = 'A strong, confident round';
      subline = 'You showed clear strengths across most of the skills placement panels look for.';
    } else if (ratingCounts.Strength >= 2) {
      headline = 'A solid round with clear next steps';
      subline = 'You have real strengths to build on and a couple of skills to sharpen.';
    } else {
      headline = 'A good start, with plenty to build on';
      subline = 'Focus on the action plan below; small changes will show up quickly.';
    }
  }

  const sortedDimensions = report ? [...report.dimensions] : [];
  const topStrength = sortedDimensions.find((d) => d.rating === 'Strength');
  // Plan: weakest rated skills first, then skills the round never showed, with concrete advice
  const focusAreas = sortedDimensions
    .filter((d) => d.rating !== 'Strength')
    .sort((a, b) => {
      const order: Record<DimensionRating, number> = { 'Needs practice': 0, Developing: 1, 'Not observed': 2, Strength: 3 };
      return order[a.rating] - order[b.rating];
    })
    .slice(0, 3)
    .map((d) => ({
      ...d,
      actionableImprovement: d.rating === 'Not observed' ? SKILL_TIPS[d.id] ?? d.actionableImprovement : d.actionableImprovement,
    }));

  const scrollToTurn = (turnId: string) => {
    setIsTranscriptOpen(true);
    requestAnimationFrame(() => {
      const el = document.getElementById(`turn-${turnId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedTurnId(turnId);
      setTimeout(() => setHighlightedTurnId((curr) => (curr === turnId ? null : curr)), 3500);
    });
  };

  const alternative = report?.alternativeOpportunity;
  const alternativeTurn = alternative ? state.transcript.find((t) => t.id === alternative.targetTurnId) : undefined;

  return (
    <div className="min-h-screen bg-paper font-body text-ink selection:bg-marigold-soft">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-hair bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-forest text-[11px] font-bold tracking-wide text-paper">GD</span>
            <span className="hidden font-serif text-xl font-semibold tracking-tight sm:inline">GD Arena</span>
            <span className="hidden rounded bg-paper-2 px-2 py-0.5 text-xs font-medium text-muted sm:inline">Your report</span>
          </div>
          <div className="flex items-center gap-2">
            <DownloadMenu
              onMarkdown={() => downloadMarkdownReport(exportInput)}
              onTranscript={() => downloadTranscript(exportInput)}
              onJson={() => downloadSessionJson(exportInput)}
            />
            <button
              type="button"
              id="practise-again-top-btn"
              onClick={resetSession}
              className="flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg bg-forest px-4 text-sm font-medium text-paper hover:bg-forest-hover"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Practise again</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {/* Overview */}
        <section className="grid grid-cols-1 gap-6 rounded-2xl bg-forest p-5 text-paper sm:p-8 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-on-forest-muted">Group discussion report</p>
            <h1 className="mt-3 font-serif text-[clamp(1.9rem,4vw,2.9rem)] font-semibold leading-[1.1] tracking-[-0.01em]">{headline}</h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-on-forest-muted">{subline}</p>
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-on-forest-muted">Topic</p>
            <p className="mt-1 font-serif text-lg leading-snug">{state.config.topic}</p>
            <ul className="mt-5 flex list-none flex-wrap gap-2 p-0 text-xs">
              {[
                formatSpan(durationMs) + ' discussion',
                `${state.participants.length - 2} AI peers + moderator`,
                state.config.language === 'hinglish' ? 'Hinglish' : 'English',
                metrics.isVoiceMode ? 'Voice' : 'Text',
                ...(metrics.isDemoMode ? ['Demo panel'] : []),
              ].map((chip) => (
                <li key={chip} className="rounded-full bg-white/10 px-3 py-1">{chip}</li>
              ))}
            </ul>
          </div>

          {/* Skill snapshot */}
          <div className="rounded-xl bg-paper p-5 text-ink">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Skill snapshot</p>
            {report ? (
              <>
                <ul className="mt-3 list-none space-y-2 p-0">
                  {report.dimensions.map((d) => {
                    const style = RATING_STYLES[d.rating] ?? RATING_STYLES['Not observed'];
                    const Icon = style.icon;
                    return (
                      <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">{d.name}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: style.bg, color: style.fg }}>
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {style.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {topStrength && (
                  <p className="mt-4 border-t border-hair pt-3 text-sm">
                    <span className="font-semibold">Best skill: </span>
                    {topStrength.name}
                  </p>
                )}
              </>
            ) : isGeneratingReport ? (
              <div className="mt-3 space-y-2" aria-busy="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-5 animate-pulse rounded bg-paper-2" />
                ))}
                <p className="pt-2 text-xs text-muted">Reading the transcript and checking every quote…</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">Coaching isn&apos;t available yet. See below.</p>
            )}
          </div>
        </section>

        {/* Key numbers */}
        <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Your share" value={`${yourShare}%`} hint={`Even split ≈ ${evenSplit}%`} />
          <StatTile label="Times you spoke" value={String(yourTurns)} hint={`of ${metrics.totalTurns} turns in total`} />
          <StatTile
            label="First point"
            value={metrics.studentFirstContributionSecs !== null ? formatClock(metrics.studentFirstContributionSecs * 1000) : '—'}
            hint={metrics.studentFirstContributionSecs !== null ? 'minutes into the discussion' : 'You did not speak'}
          />
          <StatTile
            label="Closing round"
            value={metrics.studentContributedInClosing ? 'Spoke' : 'Missed'}
            hint={metrics.studentContributedInClosing ? 'You helped wrap up' : 'Summarising at the end scores well'}
          />
        </section>

        <Section
          title="Who held the floor"
          description="Higher isn't automatically better; strong candidates speak enough to be heard and leave room for others."
        >
          <AirtimeChart participants={state.participants} metrics={metrics} />
        </Section>

        <Section title="How the discussion flowed" description="Spot when you joined in, and the stretches where you stayed quiet.">
          <DiscussionTimeline
            participants={state.participants}
            transcript={state.transcript}
            durationMs={durationMs}
            onSelectTurn={scrollToTurn}
          />
        </Section>

        {/* Coaching */}
        <Section
          id="coaching"
          title="Your six GD skills"
          description="Rated from what you actually said. Every quote is checked word-for-word against the transcript."
          action={
            <div className="flex items-center gap-2">
              {isReportStale && <span className="rounded bg-marigold-soft px-2 py-0.5 text-xs font-medium">Out of date</span>}
              <button
                type="button"
                id="regenerate-report-btn"
                onClick={() => generateReport(true)}
                disabled={isGeneratingReport}
                className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-hair bg-card px-3 text-sm font-medium text-ink hover:border-muted/40 disabled:cursor-wait disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingReport ? 'animate-spin' : ''}`} />
                {report ? 'Regenerate' : 'Generate'}
              </button>
            </div>
          }
        >
          {isGeneratingReport && (
            <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-48 animate-pulse rounded-xl border border-hair bg-paper" />
              ))}
            </div>
          )}

          {reportError && !isGeneratingReport && (
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-danger/25 bg-[#f3ddd8]/60 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <span>
                  {reportError} Your numbers, chart and transcript above are unaffected.
                </span>
              </span>
              <button type="button" onClick={() => generateReport(true)} className="shrink-0 cursor-pointer rounded-lg bg-forest px-3 py-1.5 font-medium text-paper">
                Try again
              </button>
            </div>
          )}

          {report && !isGeneratingReport && (
            <div className="grid gap-4 md:grid-cols-2">
              {report.dimensions.map((dim, i) => (
                <SkillCard key={dim.id} dimension={dim} index={i} onSelectTurn={scrollToTurn} />
              ))}
            </div>
          )}
        </Section>

        {/* What you could have said */}
        {alternative && !isGeneratingReport && (
          <Section
            title="What you could have said"
            description="A moment where you had an opening. This is a suggested line for practice, not something you said."
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl bg-paper p-5">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                  {alternative.speakerName} said · {formatClock(alternativeTurn?.relativeTimestampMs ?? 0)}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">
                  {alternativeTurn ? alternativeTurn.deliveredText || alternativeTurn.text : alternative.opportunityContext}
                </p>
                <button
                  type="button"
                  onClick={() => scrollToTurn(alternative.targetTurnId)}
                  className="mt-3 flex cursor-pointer items-center gap-1 text-sm font-medium text-forest hover:underline"
                >
                  See it in the transcript <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="rounded-xl border-2 border-marigold bg-marigold-soft/40 p-5">
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-ink">
                  <MessageSquareQuote className="h-4 w-4" aria-hidden="true" />
                  You could have said
                </p>
                <p className="mt-2 font-serif text-lg italic leading-relaxed text-ink">&ldquo;{alternative.suggestedSpeech}&rdquo;</p>
                <p className="mt-3 text-sm text-muted">
                  <span className="font-medium text-ink">Why it works: </span>
                  {alternative.opportunityContext}
                </p>
              </div>
            </div>
          </Section>
        )}

        {/* Action plan */}
        {focusAreas.length > 0 && !isGeneratingReport && (
          <Section title="Your plan for the next round" description="Practise these, in this order.">
            <ol className="m-0 list-none space-y-3 p-0">
              {focusAreas.map((d, i) => (
                <li key={d.id} className="flex gap-4 rounded-xl bg-paper p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest text-sm font-semibold text-paper">{i + 1}</span>
                  <span>
                    <span className="block font-semibold text-ink">{d.name}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-ink">{d.actionableImprovement}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Transcript */}
        <Section
          title="Full transcript"
          description={`${state.transcript.length} turns. Quotes above link here.`}
          action={
            <button
              type="button"
              onClick={() => setIsTranscriptOpen((v) => !v)}
              aria-expanded={isTranscriptOpen}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-hair bg-card px-3 text-sm font-medium text-ink hover:border-muted/40"
            >
              <FileText className="h-3.5 w-3.5" />
              {isTranscriptOpen ? 'Hide' : 'Show'}
            </button>
          }
        >
          {isTranscriptOpen ? (
            <ol className="m-0 list-none space-y-4 p-0">
              {state.transcript.map((turn) => {
                const isStudent = turn.speakerRole === 'student';
                const isCut = turn.deliveryStatus === 'interrupted';
                const participant = state.participants.find((p) => p.id === turn.speakerId) ?? {
                  id: turn.speakerId,
                  name: turn.speakerName,
                  initials: turn.speakerName.slice(0, 2).toUpperCase(),
                };
                return (
                  <li
                    key={turn.id}
                    id={`turn-${turn.id}`}
                    className={`flex gap-3 rounded-lg p-2 transition-colors duration-500 ${highlightedTurnId === turn.id ? 'bg-marigold-soft' : ''}`}
                  >
                    <PersonaAvatar participant={participant} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-2 text-sm">
                        <span className="font-semibold">{isStudent ? 'You' : turn.speakerName}</span>
                        <span className="text-xs tabular-nums text-muted">{formatClock(turn.relativeTimestampMs)}</span>
                        {isCut && <span className="text-xs font-medium text-danger">cut off</span>}
                      </p>
                      <p className={`mt-1 rounded-lg px-3 py-2 text-[15px] leading-relaxed ${isStudent ? 'bg-marigold-soft/60' : 'bg-paper'}`}>
                        {isCut && turn.deliveredText ? turn.deliveredText : turn.text}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted">Hidden to keep the report short. Clicking any quote opens it.</p>
          )}
        </Section>

        <p className="px-2 text-center text-xs text-muted">{report?.disclaimer || DEFAULT_DISCLAIMER}</p>

        <div className="flex justify-center pb-4">
          <button
            type="button"
            id="practise-again-btn"
            onClick={resetSession}
            className="flex h-12 cursor-pointer items-center gap-2 rounded-lg bg-marigold px-6 text-base font-semibold text-ink hover:bg-[#d6942f]"
          >
            <RotateCcw className="h-4 w-4" />
            Practise another round
          </button>
        </div>
      </main>
    </div>
  );
}
