import { SessionState } from '@/types/session';
import { DeterministicMetrics, SessionReport } from '@/types/report';

export interface ExportInput {
  state: SessionState;
  metrics: DeterministicMetrics;
  report: SessionReport | null;
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined) return 'Unavailable';
  const totalSecs = Math.round(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export function formatRelativeTime(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '00:00';
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatElapsed(elapsedSeconds: number): string {
  return `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`;
}

function saveFile(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Structured Markdown coaching report. */
export function downloadMarkdownReport({ state, metrics, report }: ExportInput) {
  const formattedDuration = formatElapsed(state.elapsedSeconds);
  const firstContributionText =
    metrics.studentFirstContributionSecs !== null
      ? `${metrics.studentFirstContributionSecs}s into discussion`
      : 'Did not contribute';

  const mdLines = [
    '# GD Arena — Practice Coaching Report',
    '',
    `**Topic:** ${state.config.topic}  `,
    `**Language:** ${state.config.language === 'hinglish' ? 'Hindi-English (Hinglish)' : 'English'}  `,
    `**Session Mode:** ${metrics.isVoiceMode ? 'Live Voice' : 'Text Practice'} (${metrics.isDemoMode ? 'Scripted Demo Panel' : 'Live AI Panel'})  `,
    `**Active Duration:** ${formattedDuration} (${state.config.durationMinutes} min configured)  `,
    `**Panel Size:** ${state.participants.length - 2} AI Debaters + 1 Moderator  `,
    `**Report Generated:** ${report ? new Date(report.generatedAt).toLocaleString() : new Date().toLocaleString()}  `,
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

  saveFile(mdLines.join('\n'), 'text/markdown;charset=utf-8', `gd-arena-report-${Date.now()}.md`);
}

/** Complete session, metrics and report as JSON. */
export function downloadSessionJson({ state, metrics, report }: ExportInput) {
  const payload = {
    sessionId: `gd-session-${Date.now()}`,
    exportDate: new Date().toISOString(),
    config: state.config,
    elapsedSeconds: state.elapsedSeconds,
    metrics,
    report,
    transcript: state.transcript
  };
  saveFile(JSON.stringify(payload, null, 2), 'application/json;charset=utf-8', `gd-arena-data-${Date.now()}.json`);
}

/** Plain-text chronological transcript. */
export function downloadTranscript({ state, metrics }: ExportInput) {
  const formattedDuration = formatElapsed(state.elapsedSeconds);
  const totalTurns = state.transcript.length;
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

  saveFile([...headerLines, '', ...transcriptLines].join('\n'), 'text/plain;charset=utf-8', `gd-arena-transcript-${Date.now()}.txt`);
}
