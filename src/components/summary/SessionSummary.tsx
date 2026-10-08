'use client';

import React, { useState, useMemo } from 'react';
import { useSession } from '@/context/SessionContext';
import { DimensionRating } from '@/types/report';
import { calculateSessionMetrics } from '@/lib/metricsCalculator';
import {
  Download,
  RotateCcw,
  CheckCircle2,
  Clock,
  Users,
  MessageSquare,
  Award,
  FileText,
  Mic,
  Volume2,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  ArrowRight
} from 'lucide-react';

function getRatingBadge(rating: DimensionRating) {
  switch (rating) {
    case 'Strength':
      return {
        label: 'Strength',
        className: 'bg-zinc-900 text-emerald-300 border-zinc-700'
      };
    case 'Developing':
      return {
        label: 'Developing',
        className: 'bg-zinc-900 text-zinc-300 border-zinc-800'
      };
    case 'Needs practice':
      return {
        label: 'Needs practice',
        className: 'bg-zinc-900 text-amber-300 border-zinc-800'
      };
    case 'Not observed':
    default:
      return {
        label: 'Not observed',
        className: 'bg-zinc-900 text-zinc-500 border-zinc-800'
      };
  }
}

function getTranscriptTurnCardStyle(
  isHighlighted: boolean,
  isStudent: boolean,
  isModerator: boolean,
  isInterrupted: boolean
): string {
  if (isHighlighted) {
    return 'ring-1 ring-white border-zinc-500 bg-zinc-800/80';
  }
  if (isStudent) {
    return 'bg-[#18181c] border-[#3f3f46] ml-2';
  }
  if (isModerator) {
    return 'bg-[#141417] border-[#27272a]';
  }
  if (isInterrupted) {
    return 'bg-[#1a1815] border-amber-900/40';
  }
  return 'bg-[#141417] border-[#27272a]';
}

function getTranscriptSpeakerColor(isStudent: boolean, isModerator: boolean): string {
  if (isStudent) return 'text-white font-semibold';
  if (isModerator) return 'text-zinc-200 font-semibold';
  return 'text-zinc-300';
}

function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return 'Unavailable';
  const totalSecs = Math.round(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatRelativeTime(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function SessionSummary() {
  const {
    state,
    resetSession,
    report,
    isGeneratingReport,
    reportError,
    isReportStale,
    generateReport
  } = useSession();

  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(null);

  // Compute metrics deterministically on client if report is not yet loaded
  const fallbackMetrics = useMemo(() => {
    return calculateSessionMetrics({
      transcript: state.transcript,
      timingEvents: [],
      activeDurationMs: state.elapsedSeconds * 1000,
      isVoiceMode: state.interactionMode === 'voice',
      isDemoMode: state.engineMode === 'demo'
    });
  }, [state.transcript, state.elapsedSeconds, state.interactionMode, state.engineMode]);

  const metrics = report?.metrics || fallbackMetrics;

  const totalTurns = state.transcript.length;
  const elapsedMins = Math.floor(state.elapsedSeconds / 60);
  const elapsedSecs = state.elapsedSeconds % 60;
  const formattedDuration = `${elapsedMins}m ${elapsedSecs}s`;

  const scrollToTurn = (turnId: string) => {
    const el = document.getElementById(`turn-${turnId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedTurnId(turnId);
      setTimeout(() => {
        setHighlightedTurnId((curr) => (curr === turnId ? null : curr));
      }, 3500);
    }
  };

  // Download complete report in Markdown
  const handleDownloadMarkdownReport = () => {
    const firstContributionText =
      metrics.studentFirstContributionSecs !== null
        ? `${metrics.studentFirstContributionSecs}s into discussion`
        : 'Did not contribute';

    const mdLines = [
      '# GD Arena — Practice Coaching Report',
      '',
      `**Topic:** ${state.config.topic}  `,
      `**Language:** ${state.config.language === 'hinglish' ? 'Hindi-English (Hinglish)' : 'English'}  `,
      `**Session Mode:** ${metrics.isVoiceMode ? 'Live Voice' : 'Text Practice'} (${metrics.isDemoMode ? 'Scripted Demo Panel' : 'Live AI (Groq + Gemini)'})  `,
      `**Active Duration:** ${formattedDuration} (${state.config.durationMinutes} min configured)  `,
      `**Panel Size:** ${state.participants.length - 2} AI Debaters + 1 Moderator  `,
      `**Report Generated:** ${report ? new Date(report.generatedAt).toLocaleString() : new Date().toLocaleString()}  `,
      report?.modelUsed ? `**Model:** ${report.modelUsed}  ` : '',
      '',
      '---',
      '',
      '## 1. Participation & Speaking Share Metrics',
      '',
      '> *Note: Metrics are calculated deterministically in code. Total active speaking duration represents the sum of individual speech intervals across candidate and AI participants. Overlaps/pauses may occur; greater speaking share does not automatically equate to better performance.*',
      '',
      '| Participant | Role | Turns | Speaking Time | Speaking Share (%) |',
      '| :--- | :--- | :--- | :--- | :--- |',
      ...state.participants.map((p) => {
        const count = metrics.turnCountsBySpeaker[p.id] || 0;
        let timeStr: string;
        if (p.role === 'student') {
          timeStr = metrics.isVoiceMode
            ? `${formatDurationMs(metrics.studentSpeakingDurationMs)} (approx. VAD)`
            : 'Unavailable (text mode)';
        } else if (p.role === 'moderator') {
          timeStr = formatDurationMs(metrics.moderatorPlaybackDurationMs);
        } else {
          timeStr = formatDurationMs(metrics.aiPlaybackDurationMs[p.id] || 0);
        }
        const share = metrics.speakingSharePercent[p.id] !== undefined
          ? `${metrics.speakingSharePercent[p.id]}%`
          : '—';
        let roleLabel = p.personality;
        if (p.role === 'student') {
          roleLabel = 'Candidate (You)';
        } else if (p.role === 'moderator') {
          roleLabel = 'Moderator';
        }
        return `| ${p.name} | ${roleLabel} | ${count} | ${timeStr} | ${share} |`;
      }),
      '',
      `- **Total Active Speaking Time (Denominator):** ${formatDurationMs(metrics.totalActiveSpeakingDurationMs)}`,
      `- **First Candidate Contribution:** ${firstContributionText}`,
      `- **Contributed in Closing Phase:** ${metrics.studentContributedInClosing ? 'Yes' : 'No'}`,
      `- **Interruption Overlap Events:** ${metrics.interruptedTurnsCount} detected overlap occurrences`,
      '',
      '---',
      '',
      '## 2. Qualitative Competency Dimensions',
      ''
    ];

    if (report?.dimensions) {
      report.dimensions.forEach((dim, idx) => {
        mdLines.push(
          `### ${idx + 1}. ${dim.name}`,
          `**Rating:** \`${dim.rating}\`  `,
          `**Observation:** ${dim.observation}  `,
          `**Actionable Advice:** ${dim.actionableImprovement}  `
        );
        if (dim.evidence && dim.evidence.length > 0) {
          mdLines.push('**Verbatim Evidence:**');
          dim.evidence.forEach((ev) => {
            const timeStr = formatRelativeTime(ev.relativeTimestampMs);
            mdLines.push(`- *[${timeStr}] ${ev.speakerName || 'Speaker'} (Turn ${ev.turnId}):* "${ev.quote}"`);
          });
        } else {
          mdLines.push('*Evidence:* None observed / Not applicable.');
        }
        mdLines.push('');
      });
    } else {
      mdLines.push('*Qualitative coaching report currently unavailable.*', '');
    }

    if (report?.alternativeOpportunity) {
      const opp = report.alternativeOpportunity;
      mdLines.push(
        '---',
        '',
        '## 3. What You Could Have Said',
        '',
        `> **Opportunity:** In response to ${opp.speakerName} (Turn ${opp.targetTurnId})  `,
        `> **Context:** ${opp.opportunityContext}  `,
        `> **Objective:** \`${opp.objective}\`  `,
        '',
        `**Suggested Alternative Response:**  `,
        `*"${opp.suggestedSpeech}"*`,
        '',
        '*Note: This is a suggested constructive alternative, not something you actually said.*',
        ''
      );
    }

    mdLines.push(
      '---',
      '',
      `> **Disclaimer:** ${report?.disclaimer || 'AI-generated practice coaching based strictly on observable behaviours in this session; not an official placement assessment.'}`
    );

    const blob = new Blob([mdLines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gd-arena-report-${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download raw session JSON
  const handleDownloadJSON = () => {
    const payload = {
      sessionId: `gd-session-${Date.now()}`,
      exportDate: new Date().toISOString(),
      config: state.config,
      elapsedSeconds: state.elapsedSeconds,
      metrics,
      report,
      transcript: state.transcript
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gd-arena-data-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Download simple text transcript
  const handleDownloadTranscript = () => {
    const headerLines = [
      '====================================================',
      '           GD ARENA — SESSION TRANSCRIPT            ',
      '====================================================',
      `Topic: ${state.config.topic}`,
      `Language: ${state.config.language === 'english' ? 'English' : 'Hindi-English'}`,
      `Interaction Mode: ${state.interactionMode === 'voice' ? 'Voice Practice' : 'Text Practice'}`,
      `Configured Duration: ${state.config.durationMinutes} minutes`,
      `Actual Elapsed: ${formattedDuration}`,
      `Interrupted Turns: ${metrics.interruptedTurnsCount}`,
      `Total Turns Recorded: ${totalTurns}`,
      `Exported At: ${new Date().toLocaleString()}`,
      '----------------------------------------------------'
    ];

    const transcriptLines = state.transcript.flatMap((turn) => {
      const time = formatRelativeTime(turn.relativeTimestampMs);
      const tag = turn.isDemoResponse ? ' [Demo Response]' : '';
      const interruptedTag = turn.deliveryStatus === 'interrupted' ? ' [Interrupted by candidate]' : '';
      const textToExport =
        turn.deliveryStatus === 'interrupted' && turn.deliveredText
          ? turn.deliveredText
          : turn.text;
      return [
        `[${time}] ${turn.speakerName} (${turn.speakerRole})${tag}${interruptedTag}:`,
        `  "${textToExport}"`,
        ''
      ];
    });

    const blob = new Blob([[...headerLines, '', ...transcriptLines].join('\n')], {
      type: 'text/plain;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gd-arena-transcript-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const studentParticipant = state.participants.find((p) => p.role === 'student');
  const moderatorParticipant = state.participants.find((p) => p.role === 'moderator');
  const peerParticipants = state.participants.filter(
    (p) => p.role !== 'student' && p.role !== 'moderator'
  );

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-100 flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-[#27272a] bg-[#0c0c0e]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 font-bold text-xs">
              GD
            </div>
            <div>
              <span className="font-semibold text-base text-white">GD Arena</span>
              <span className="ml-2 text-xs font-medium px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                Phase 4 Evidence Report
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={resetSession}
              id="practise-again-top-btn"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Practise again</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-6">
        {/* Completion Banner */}
        <div className="p-6 rounded-2xl bg-[#141417] border border-[#27272a] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-5 h-5 text-zinc-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Group Discussion Completed
                </h1>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                  {metrics.isVoiceMode ? 'Live Voice' : 'Text-Only'} Mode
                </span>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                  {metrics.isDemoMode ? 'Scripted Demo Panel' : 'Live AI (Groq + Gemini)'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
                Topic: <span className="text-zinc-200 font-medium">&ldquo;{state.config.topic}&rdquo;</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap sm:flex-nowrap">
            <button
              onClick={handleDownloadMarkdownReport}
              id="download-markdown-report-btn"
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-medium transition"
              title="Download structured report as Markdown"
            >
              <Download className="w-4 h-4 text-zinc-400" />
              <span>Report (.md)</span>
            </button>

            <button
              onClick={handleDownloadJSON}
              id="download-json-btn"
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-medium transition"
              title="Download session & metrics JSON"
            >
              <Download className="w-4 h-4 text-zinc-400" />
              <span>Data (.json)</span>
            </button>

            <button
              onClick={resetSession}
              id="practise-again-btn"
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Practise again</span>
            </button>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-5 rounded-xl bg-[#141417] border border-[#27272a] flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>Elapsed Duration</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight my-1">{formattedDuration}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {state.config.durationMinutes}m target limit
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#141417] border border-[#27272a] flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
              <span>Total Turns</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight my-1">{totalTurns}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {metrics.turnCountsBySpeaker[studentParticipant?.id || ''] || 0} student turns
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#141417] border border-[#27272a] flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
              <Mic className="w-3.5 h-3.5 text-zinc-400" />
              <span>Candidate Voice Time</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight my-1">
              {metrics.isVoiceMode
                ? formatDurationMs(metrics.studentSpeakingDurationMs)
                : 'Unavailable'}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {metrics.isVoiceMode ? 'Approx. VAD voice interval' : 'Text-only session'}
            </p>
          </div>

          <div className="p-5 rounded-xl bg-[#141417] border border-[#27272a] flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
              <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>AI Audio Time</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight my-1">
              {metrics.isVoiceMode
                ? formatDurationMs(
                    Object.values(metrics.aiPlaybackDurationMs).reduce((a, b) => a + b, 0)
                  )
                : 'Unavailable'}
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {metrics.isVoiceMode ? 'Actual delivered playback' : 'Text-only session'}
            </p>
          </div>
        </div>

        {/* Deterministic Participation & Speaking Share Breakdown */}
        <section className="p-5 sm:p-6 rounded-2xl bg-[#141417] border border-[#27272a] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-300" />
                Participation & Speaking Share Breakdown
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Calculated deterministically in code. Denominator:{' '}
                <span className="text-zinc-300 font-medium">
                  {metrics.isVoiceMode
                    ? `${formatDurationMs(metrics.totalActiveSpeakingDurationMs)} active speaking duration across all speakers`
                    : `${metrics.totalTurns} total committed turns`}
                </span>
                {'. Overlap and silence occur; higher share does not imply better performance.'}
              </p>
            </div>
          </div>

          {/* Student Row */}
          {studentParticipant && (
            <div className="p-3.5 rounded-xl border bg-zinc-900/60 border-zinc-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${studentParticipant.avatarColor}`}
                  >
                    {studentParticipant.initials}
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-100">You (Candidate)</span>
                    <span className="text-[10px] text-zinc-400 ml-2">
                      {metrics.turnCountsBySpeaker[studentParticipant.id] || 0} turns
                    </span>
                  </div>
                </div>

                <div className="text-right flex items-center gap-3">
                  <span className="font-mono text-zinc-400 text-xs">
                    {metrics.isVoiceMode
                      ? `${formatDurationMs(metrics.studentSpeakingDurationMs)} (VAD)`
                      : 'Text mode'}
                  </span>
                  <span className="font-mono font-bold text-white text-sm">
                    {metrics.speakingSharePercent[studentParticipant.id] || 0}% share
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-zinc-100 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, metrics.speakingSharePercent[studentParticipant.id] || 0)}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* AI Debaters Grid / List */}
          <div className="space-y-2.5 pt-1">
            <p className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">
              AI Discussion Participants
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {peerParticipants.map((p) => {
                const turns = metrics.turnCountsBySpeaker[p.id] || 0;
                const durMs = metrics.aiPlaybackDurationMs[p.id] || 0;
                const share = metrics.speakingSharePercent[p.id] || 0;

                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl border bg-zinc-900/40 border-zinc-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] ${p.avatarColor}`}
                        >
                          {p.initials}
                        </div>
                        <div>
                          <span className="font-medium text-zinc-200">{p.name}</span>
                          <span className="text-[10px] text-zinc-500 ml-1.5">{p.personality}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-semibold text-zinc-300 text-xs">
                          {share}%
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-zinc-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, share)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                      <span>{turns} {turns === 1 ? 'turn' : 'turns'}</span>
                      <span>{metrics.isVoiceMode ? formatDurationMs(durMs) : 'Text'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Separate Moderator Row */}
          {moderatorParticipant && (
            <div className="p-3 rounded-xl border bg-zinc-900/30 border-zinc-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] ${moderatorParticipant.avatarColor}`}
                >
                  {moderatorParticipant.initials}
                </div>
                <div>
                  <span className="font-semibold text-zinc-200">
                    {moderatorParticipant.name} (Moderator)
                  </span>
                  <span className="text-[10px] text-zinc-500 ml-2">
                    {metrics.turnCountsBySpeaker[moderatorParticipant.id] || 0} framing & transition turns
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-right">
                <span className="font-mono text-zinc-500 text-[11px]">
                  {metrics.isVoiceMode
                    ? formatDurationMs(metrics.moderatorPlaybackDurationMs)
                    : 'Text mode'}
                </span>
                <span className="font-mono text-zinc-300 font-medium text-xs">
                  {metrics.speakingSharePercent[moderatorParticipant.id] || 0}% share
                </span>
              </div>
            </div>
          )}

          {/* Timing & Flow Milestones */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
              <span className="text-[11px] text-zinc-500 block mb-0.5">First Contribution</span>
              <span className="font-semibold text-zinc-200">
                {metrics.studentFirstContributionSecs !== null
                  ? `${metrics.studentFirstContributionSecs}s into discussion`
                  : 'Did not volunteer'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
              <span className="text-[11px] text-zinc-500 block mb-0.5">Closing Phase</span>
              <span
                className={`font-semibold ${
                  metrics.studentContributedInClosing ? 'text-zinc-200' : 'text-zinc-500'
                }`}
              >
                {metrics.studentContributedInClosing
                  ? 'Contributed in closing'
                  : 'Did not speak in closing'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
              <span className="text-[11px] text-zinc-500 block mb-0.5">
                Barge-In / Interruption Overlaps
              </span>
              <span className="font-semibold text-amber-300">
                {metrics.interruptedTurnsCount}{' '}
                {metrics.interruptedTurnsCount === 1 ? 'overlap event' : 'overlap events'}
              </span>
            </div>
          </div>
        </section>

        {/* Phase 4 Qualitative Evidence-Backed Feedback Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-zinc-300" />
                <h2 className="text-base font-bold text-white tracking-tight">
                  Evidence-Backed Coaching Evaluation
                </h2>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Evaluated strictly against observable behaviours. All strengths and coaching tips are verified with verbatim transcript quotes.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isReportStale && (
                <span className="text-[10px] text-amber-400 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-full">
                  Report stale
                </span>
              )}
              <button
                onClick={() => generateReport(true)}
                disabled={isGeneratingReport}
                id="regenerate-report-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-medium transition disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isGeneratingReport ? 'animate-spin' : ''}`}
                />
                <span>{report ? 'Regenerate feedback' : 'Generate feedback'}</span>
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isGeneratingReport && (
            <div className="p-8 rounded-2xl bg-[#141417] border border-[#27272a] flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-2 border-zinc-800 border-t-zinc-200 animate-spin" />
              <div>
                <h3 className="font-semibold text-sm text-white">
                  Synthesizing Evidence & Verifying Quotes...
                </h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-md">
                  Analyzing candidate initiations, argument quality, collaborative listening, and matching verbatim transcript turns with zero hallucinated timestamps.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {reportError && !isGeneratingReport && (
            <div className="p-4 rounded-xl bg-[#181111] border border-red-900/50 flex items-start justify-between gap-3 text-xs text-red-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Report Generation Notice:</strong> {reportError}
                  <p className="text-[11px] text-red-300/80 mt-0.5">
                    Your session metrics and transcript above are fully preserved and calculated locally.
                  </p>
                </div>
              </div>
              <button
                onClick={() => generateReport(true)}
                className="shrink-0 px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-medium"
              >
                Retry
              </button>
            </div>
          )}

          {/* Six Dimension Cards Grid */}
          {report && !isGeneratingReport && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.dimensions.map((dim) => {
                const badge = getRatingBadge(dim.rating);

                return (
                  <div
                    key={dim.id}
                    className="p-5 rounded-2xl bg-[#141417] border border-[#27272a] flex flex-col justify-between space-y-4 hover:border-zinc-700 transition"
                  >
                    <div>
                      {/* Dimension Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-bold text-sm text-white leading-snug">
                          {dim.name}
                        </h3>
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0 font-mono ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      {/* Observation */}
                      <p className="text-xs text-zinc-300 leading-relaxed mb-3">
                        {dim.observation}
                      </p>

                      {/* Actionable Advice */}
                      <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block mb-1">
                          Actionable Improvement
                        </span>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {dim.actionableImprovement}
                        </p>
                      </div>
                    </div>

                    {/* Verbatim Evidence Chips */}
                    {dim.evidence && dim.evidence.length > 0 ? (
                      <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">
                          Verified Verbatim Evidence ({dim.evidence.length})
                        </span>
                        <div className="space-y-1.5">
                          {dim.evidence.map((ev, evIdx) => (
                            <button
                              key={`ev-${dim.id}-${ev.turnId}-${evIdx}`}
                              onClick={() => scrollToTurn(ev.turnId)}
                              className="w-full text-left p-2.5 rounded-lg bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition group"
                              title="Click to jump to this turn in the transcript"
                            >
                              <div className="flex items-center justify-between text-[10px] text-zinc-300 font-mono mb-1">
                                <span className="font-semibold">
                                  {ev.speakerName || 'Candidate'} • Turn {ev.turnId}
                                </span>
                                <span className="flex items-center gap-1 text-zinc-400 group-hover:text-zinc-200 transition">
                                  {formatRelativeTime(ev.relativeTimestampMs)}
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </span>
                              </div>
                              <p className="text-xs text-zinc-300 italic line-clamp-2">
                                &ldquo;{ev.quote}&rdquo;
                              </p>
                              <span className="text-[9px] text-zinc-400 group-hover:text-zinc-200 font-sans block mt-1 underline underline-offset-2">
                                View in transcript
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-500 italic">
                        {dim.rating === 'Not observed'
                          ? 'No candidate opportunity or contribution was recorded for this dimension.'
                          : 'No verbatim quote cited for this observation.'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Differentiator: "What you could have said" Card */}
          {report?.alternativeOpportunity && !isGeneratingReport && (
            <div className="p-5 sm:p-6 rounded-2xl bg-[#141417] border border-[#27272a] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-zinc-300" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white">
                      What You Could Have Said (Strategic Alternative)
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Concrete conversational pivot opportunity identified from peer exchanges.
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 font-medium">
                  Objective: {report.alternativeOpportunity.objective}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400 font-mono">
                    Context: In response to{' '}
                    <strong className="text-zinc-200">
                      {report.alternativeOpportunity.speakerName}
                    </strong>
                  </span>
                  <button
                    onClick={() => scrollToTurn(report.alternativeOpportunity!.targetTurnId)}
                    className="text-zinc-300 hover:text-white font-medium flex items-center gap-1 text-[11px] underline underline-offset-2"
                  >
                    <span>View peer turn {report.alternativeOpportunity.targetTurnId}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <p className="text-zinc-300 text-xs">
                  {report.alternativeOpportunity.opportunityContext}
                </p>

                <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 mt-2">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold block mb-1">
                    Suggested Response (Model Alternative)
                  </span>
                  <p className="italic font-medium text-xs leading-relaxed">
                    &ldquo;{report.alternativeOpportunity.suggestedSpeech}&rdquo;
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-zinc-500 italic">
                *Note: This is an AI-suggested alternative phrase for practice, not something you actually said in the discussion.
              </p>
            </div>
          )}

          {/* Coaching Disclaimer */}
          <p className="text-[11px] text-zinc-500 text-center italic py-1">
            {report?.disclaimer ||
              'AI-generated practice coaching based strictly on observable behaviours in this session; not an official placement assessment.'}
          </p>
        </section>

        {/* Full Transcript Review Accordion / List */}
        <section className="p-5 sm:p-6 rounded-2xl bg-[#141417] border border-[#27272a] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-zinc-300" />
                Full Transcript Review ({totalTurns} Turns)
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Target turns referenced in the report above can be highlighted directly below.
              </p>
            </div>

            <button
              onClick={handleDownloadTranscript}
              className="text-xs text-zinc-400 hover:text-zinc-200 font-medium underline underline-offset-2 flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save .txt</span>
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {state.transcript.map((turn, idx) => {
              const isInterrupted = turn.deliveryStatus === 'interrupted';
              const isStudent = turn.speakerRole === 'student';
              const isModerator = turn.speakerRole === 'moderator';
              const isHighlighted = highlightedTurnId === turn.id;

              return (
                <div
                  key={turn.id || `summary-turn-${idx}`}
                  id={`turn-${turn.id}`}
                  className={`p-3.5 rounded-xl border transition-all duration-300 ${getTranscriptTurnCardStyle(
                    isHighlighted,
                    isStudent,
                    isModerator,
                    isInterrupted
                  )}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-semibold ${getTranscriptSpeakerColor(
                          isStudent,
                          isModerator
                        )}`}
                      >
                        {turn.speakerName}
                      </span>
                      {isStudent && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 font-medium">
                          You
                        </span>
                      )}
                      {isModerator && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                          Moderator
                        </span>
                      )}
                      {turn.source === 'model' && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
                          Gemini AI
                        </span>
                      )}
                      {turn.source === 'scripted-demo' && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-500 border border-zinc-800 font-mono">
                          Demo response
                        </span>
                      )}
                      {isInterrupted && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#1f1a14] text-amber-300 border border-amber-800/60 flex items-center gap-1 font-mono">
                          <ShieldAlert className="w-2.5 h-2.5 text-amber-400" /> Interrupted by candidate
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-zinc-500">
                        ID: {turn.id}
                      </span>
                    </div>

                    <span className="text-[10px] font-mono text-zinc-500">
                      {formatRelativeTime(turn.relativeTimestampMs)}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
                    {isInterrupted && turn.deliveredText ? turn.deliveredText : turn.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#27272a] py-4 px-4 sm:px-6 text-center text-xs text-zinc-500">
        GD Arena • Evidence-Backed Discussion Coaching & Verbatim Citations
      </footer>
    </div>
  );
}
