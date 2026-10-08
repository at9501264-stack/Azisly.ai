import { NextRequest, NextResponse } from 'next/server';
import {
  TranscriptTurn,
  LanguagePreference,
  DiscussionTimingEvent
} from '@/types/session';
import {
  DimensionEvaluation,
  SessionReport,
  AlternativeOpportunity,
  ReportDimensionId
} from '@/types/report';
import { calculateSessionMetrics } from '@/lib/metricsCalculator';
import {
  verifyReportEvidence,
  generateTranscriptFingerprint
} from '@/lib/evidenceVerifier';
import {
  buildReportSystemInstruction,
  buildReportUserPrompt
} from '@/lib/reportPromptBuilder';
import { generateLlmCompletion, getLlmProviderStatus } from '@/lib/llmClient';

// Rate limiter for report generation
interface RateLimitRecord {
  timestamps: number[];
}
const reportRateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REPORT_REQUESTS_PER_WINDOW = 10; // Max 10 reports per minute per IP

function checkReportRateLimit(clientId: string): boolean {
  const now = Date.now();
  let record = reportRateLimitMap.get(clientId);
  if (!record) {
    record = { timestamps: [] };
    reportRateLimitMap.set(clientId, record);
  }
  record.timestamps = record.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (record.timestamps.length >= MAX_REPORT_REQUESTS_PER_WINDOW) {
    return false;
  }
  record.timestamps.push(now);
  return true;
}

interface ReportRequestBody {
  topic: string;
  language: LanguagePreference;
  transcript: TranscriptTurn[];
  timingEvents?: DiscussionTimingEvent[];
  activeDurationMs: number;
  isVoiceMode?: boolean;
  isDemoMode?: boolean;
  sessionFingerprint?: string;
}

const DEFAULT_DIMENSION_NAMES: Record<ReportDimensionId, string> = {
  starting_discussion: 'Starting the Discussion',
  idea_quality: 'Quality & Relevance of Ideas',
  building_on_others: 'Building on Others',
  active_listening: 'Demonstrated Listening',
  handling_disagreement: 'Handling Disagreement & Interruptions',
  ending_strongly: 'Ending Strongly'
};

const DISCLAIMER_TEXT =
  'AI-generated practice coaching based strictly on observable behaviours in this session; not an official placement assessment.';

/**
 * Returns a deterministic "Not observed" report when the student made 0 contributions.
 * Saves tokens, prevents latency, and avoids LLM hallucination.
 */
function createSilentStudentReport(
  topic: string,
  metrics: ReturnType<typeof calculateSessionMetrics>,
  fingerprint: string
): SessionReport {
  const silentDimensions: DimensionEvaluation[] = (
    [
      'starting_discussion',
      'idea_quality',
      'building_on_others',
      'active_listening',
      'handling_disagreement',
      'ending_strongly'
    ] as ReportDimensionId[]
  ).map((id) => ({
    id,
    name: DEFAULT_DIMENSION_NAMES[id],
    rating: 'Not observed',
    observation: 'No committed student spoken or text turns were recorded during this session.',
    actionableImprovement:
      id === 'starting_discussion'
        ? 'Aim to volunteer an opening definition or structured frame within the first 60 seconds.'
        : 'Participate actively with at least 2-3 substantive points to demonstrate your presence.',
    evidence: []
  }));

  return {
    id: `rep-${Date.now()}`,
    sessionFingerprint: fingerprint,
    generatedAt: Date.now(),
    metrics,
    dimensions: silentDimensions,
    alternativeOpportunity: null,
    disclaimer: DISCLAIMER_TEXT,
    modelUsed: 'deterministic-rules'
  };
}

/**
 * Generates an honest deterministic report grounded in student turns when GEMINI_API_KEY is not configured.
 */
function createDeterministicStudentReport(
  topic: string,
  transcript: TranscriptTurn[],
  metrics: ReturnType<typeof calculateSessionMetrics>,
  fingerprint: string
): SessionReport {
  const studentTurns = transcript.filter(
    (t) => t.speakerRole === 'student' && (t.deliveredText || t.text).trim().length > 0
  );
  const firstTurn = studentTurns[0];
  const firstTurnSecs = metrics.studentFirstContributionSecs;

  const hasEarlyStart = firstTurnSecs !== null && firstTurnSecs <= 60;
  const hasSubstance = studentTurns.some(
    (t) => (t.deliveredText || t.text).split(/\s+/).length >= 10
  );
  const mentionsOther = studentTurns.some((t) => {
    const text = (t.deliveredText || t.text).toLowerCase();
    return (
      text.includes('agree') ||
      text.includes('point') ||
      text.includes('building') ||
      text.includes('as') ||
      text.includes('said')
    );
  });

  const dimensions: DimensionEvaluation[] = [
    {
      id: 'starting_discussion',
      name: DEFAULT_DIMENSION_NAMES.starting_discussion,
      rating: hasEarlyStart ? 'Strength' : firstTurnSecs !== null ? 'Developing' : 'Not observed',
      observation: hasEarlyStart
        ? `Initiated early at ${firstTurnSecs}s with an active contribution.`
        : firstTurnSecs !== null
        ? `Entered the discussion at ${firstTurnSecs}s after peer debaters had established the initial framing.`
        : 'Did not volunteer an opening contribution.',
      actionableImprovement: hasEarlyStart
        ? 'Maintain this initiative while leaving space for quieter participants to enter early.'
        : 'Aim to volunteer a definition or structural framework within the first 60 seconds.',
      evidence: firstTurn
        ? [
            {
              turnId: firstTurn.id,
              quote: (firstTurn.deliveredText || firstTurn.text).substring(0, 120),
              relativeTimestampMs: firstTurn.relativeTimestampMs || 0,
              speakerName: firstTurn.speakerName
            }
          ]
        : []
    },
    {
      id: 'idea_quality',
      name: DEFAULT_DIMENSION_NAMES.idea_quality,
      rating: hasSubstance ? 'Strength' : 'Developing',
      observation: hasSubstance
        ? 'Presented structured reasoning with substantive domain arguments.'
        : 'Shared conversational points that can be deepened with concrete examples and data.',
      actionableImprovement:
        'Support core claims with real-world examples, measurable impacts, or industry case studies.',
      evidence: studentTurns.slice(0, 1).map((t) => ({
        turnId: t.id,
        quote: (t.deliveredText || t.text).substring(0, 120),
        relativeTimestampMs: t.relativeTimestampMs || 0,
        speakerName: t.speakerName
      }))
    },
    {
      id: 'building_on_others',
      name: DEFAULT_DIMENSION_NAMES.building_on_others,
      rating: mentionsOther ? 'Strength' : 'Developing',
      observation: mentionsOther
        ? 'Acknowledged peer perspectives and built directly upon earlier contributions.'
        : 'Offered isolated standalone viewpoints without explicitly linking to peer arguments.',
      actionableImprovement:
        'Explicitly reference previous speakers by name ("Building on Priya\'s point...") to demonstrate synthesis.',
      evidence:
        mentionsOther && studentTurns.length > 0
          ? [
              {
                turnId: studentTurns[0].id,
                quote: (studentTurns[0].deliveredText || studentTurns[0].text).substring(0, 120),
                relativeTimestampMs: studentTurns[0].relativeTimestampMs || 0,
                speakerName: studentTurns[0].speakerName
              }
            ]
          : []
    },
    {
      id: 'active_listening',
      name: DEFAULT_DIMENSION_NAMES.active_listening,
      rating: studentTurns.length >= 2 ? 'Strength' : 'Developing',
      observation:
        studentTurns.length >= 2
          ? 'Participated across multiple turns in response to the evolving group discussion.'
          : 'Limited participation turns; engage more reciprocally with debaters across the full session.',
      actionableImprovement:
        'Track key threads from fellow participants and summarize common ground before introducing your own view.',
      evidence: []
    },
    {
      id: 'handling_disagreement',
      name: DEFAULT_DIMENSION_NAMES.handling_disagreement,
      rating: 'Developing',
      observation:
        'Maintained a professional, collegial tone throughout turn exchanges without aggressive speech.',
      actionableImprovement:
        'When encountering opposing views, frame counterpoints objectively using trade-offs rather than direct dismissal.',
      evidence: []
    },
    {
      id: 'ending_strongly',
      name: DEFAULT_DIMENSION_NAMES.ending_strongly,
      rating: metrics.studentContributedInClosing ? 'Strength' : 'Needs practice',
      observation: metrics.studentContributedInClosing
        ? 'Delivered a concluding synthesis or closing perspective when the moderator opened the final round.'
        : 'Did not contribute a closing statement when the moderator invited final remarks.',
      actionableImprovement: metrics.studentContributedInClosing
        ? 'Ensure your closing remark emphasizes consensus themes rather than introducing new unresolved arguments.'
        : "Prepare a 15-second synthesis of the group's top 2 consensus takeaways when entering the closing phase.",
      evidence:
        metrics.studentContributedInClosing && studentTurns.length > 0
          ? [
              {
                turnId: studentTurns[studentTurns.length - 1].id,
                quote: (
                  studentTurns[studentTurns.length - 1].deliveredText ||
                  studentTurns[studentTurns.length - 1].text
                ).substring(0, 120),
                relativeTimestampMs:
                  studentTurns[studentTurns.length - 1].relativeTimestampMs || 0,
                speakerName: studentTurns[studentTurns.length - 1].speakerName
              }
            ]
          : []
    }
  ];

  const aiPeerTurns = transcript.filter(
    (t) => t.speakerRole === 'ai_participant' && t.deliveredText
  );
  let alternativeOpportunity: AlternativeOpportunity | null = null;
  if (aiPeerTurns.length > 0) {
    const targetTurn = aiPeerTurns[0];
    alternativeOpportunity = {
      targetTurnId: targetTurn.id,
      speakerName: targetTurn.speakerName,
      opportunityContext: `Following ${targetTurn.speakerName}'s point on "${topic}"`,
      suggestedSpeech: `I appreciate ${targetTurn.speakerName}'s perspective, and to build on that, we should also examine the operational feasibility and regulatory constraints.`,
      objective: 'build'
    };
  }

  return {
    id: `rep-${Date.now()}`,
    sessionFingerprint: fingerprint,
    generatedAt: Date.now(),
    metrics,
    dimensions,
    alternativeOpportunity,
    disclaimer: DISCLAIMER_TEXT,
    modelUsed: 'deterministic-rules'
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting
    const clientIp = req.headers.get('x-forwarded-for') || 'local-client';
    if (!checkReportRateLimit(clientIp)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded: Please wait a moment before generating another report.',
          retryable: true
        },
        { status: 429 }
      );
    }

    // 2. Parse request
    let body: Partial<ReportRequestBody>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request payload.', retryable: false },
        { status: 400 }
      );
    }

    const {
      topic,
      language = 'english',
      transcript = [],
      timingEvents = [],
      activeDurationMs = 0,
      isVoiceMode = false,
      isDemoMode = false
    } = body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Topic is required to generate a report.', retryable: false },
        { status: 400 }
      );
    }

    const validTranscript: TranscriptTurn[] = Array.isArray(transcript) ? transcript : [];
    const validTimingEvents: DiscussionTimingEvent[] = Array.isArray(timingEvents) ? timingEvents : [];
    const fingerprint = body.sessionFingerprint || generateTranscriptFingerprint(validTranscript);

    // 3. Compute Deterministic Metrics in Code
    const deterministicMetrics = calculateSessionMetrics({
      transcript: validTranscript,
      timingEvents: validTimingEvents,
      activeDurationMs,
      isVoiceMode,
      isDemoMode
    });

    // 4. Low-data / Silent student handling:
    // If student spoke 0 turns, return deterministic report with "Not observed" without calling LLM
    const studentTurns = validTranscript.filter((t) => t.speakerRole === 'student');
    if (studentTurns.length === 0) {
      const silentReport = createSilentStudentReport(topic, deterministicMetrics, fingerprint);
      return NextResponse.json({
        success: true,
        report: silentReport,
        cached: false,
        source: 'deterministic'
      });
    }

    // 5. Check server-side LLM credentials (Groq primary, Gemini fallback)
    const { isConfigured } = getLlmProviderStatus();
    if (!isConfigured) {
      // Deterministic fallback report when neither GROQ_API_KEY nor GEMINI_API_KEY is set
      const deterministicReport = createDeterministicStudentReport(
        topic,
        validTranscript,
        deterministicMetrics,
        fingerprint
      );
      return NextResponse.json({
        success: true,
        report: deterministicReport,
        cached: false,
        source: 'deterministic-rules'
      });
    }

    // 6. Build Prompts
    const promptParams = {
      topic: topic.trim(),
      language: language as LanguagePreference,
      transcript: validTranscript,
      studentTurnsCount: studentTurns.length,
      totalDurationSeconds: Math.round(activeDurationMs / 1000)
    };

    const systemInstruction = buildReportSystemInstruction(language as LanguagePreference);
    const userPrompt = buildReportUserPrompt(promptParams);

    // 7. Call LLM (Groq primary, Gemini fallback)
    const callModel = async (prompt: string) => {
      return await generateLlmCompletion({
        systemInstruction,
        userPrompt: prompt,
        temperature: 0.2, // Low temperature for high adherence to transcript quotes
        maxTokens: 2500,
        timeoutMs: 35000
      });
    };

    const llmResult = await callModel(userPrompt);
    const responseText = llmResult.text.trim();

    // 8. Parse LLM response
    interface LLMReportOutput {
      dimensions: DimensionEvaluation[];
      alternativeOpportunity?: AlternativeOpportunity;
    }

    let parsedOutput: LLMReportOutput;
    try {
      parsedOutput = JSON.parse(responseText);
    } catch {
      parsedOutput = JSON.parse(responseText.replace(/```json|```/g, '').trim());
    }

    if (!Array.isArray(parsedOutput.dimensions)) {
      throw new TypeError('LLM response did not contain a valid dimensions array');
    }

    // 9. Verify Evidence in Code
    let validationResult = verifyReportEvidence(parsedOutput.dimensions, validTranscript);

    // 10. Bounded Repair: If quotes failed verification, allow exactly 1 repair attempt
    if (!validationResult.isValid && validationResult.validationErrors.length > 0) {
      console.warn(
        `[Report Evidence] Initial response had ${validationResult.rejectedQuotesCount} invalid quotes. Attempting 1 repair.`
      );

      const repairPrompt = `${userPrompt}

[IMPORTANT CORRECTION REQUIRED - PREVIOUS ATTEMPT FAILED QUOTE VERIFICATION]
The following evidence references were REJECTED because the quotes were NOT exact verbatim substrings in the transcript or referenced invalid turns:
${validationResult.validationErrors.slice(0, 8).join('\n')}

Please regenerate the JSON report.
MANDATORY RULES FOR REPAIR:
1. Every quote in the "evidence" array MUST be an EXACT, literal substring from the text of the given turnId.
2. If the student did not say something, do NOT invent a quote. Mark the dimension "Not observed" with an empty evidence array [].
3. Adhere strictly to the requested JSON schema.`;

      try {
        const repairResponse = await callModel(repairPrompt);
        const repairText = repairResponse.text.trim();
        const repairedParsed: LLMReportOutput = JSON.parse(
          repairText.replace(/```json|```/g, '').trim()
        );

        if (Array.isArray(repairedParsed.dimensions)) {
          const repairedValidation = verifyReportEvidence(
            repairedParsed.dimensions,
            validTranscript
          );
          // Use repaired dimensions (with any remaining unverified quotes stripped)
          validationResult = repairedValidation;
          if (repairedParsed.alternativeOpportunity) {
            parsedOutput.alternativeOpportunity = repairedParsed.alternativeOpportunity;
          }
        }
      } catch (repairErr) {
        console.warn('[Report Evidence] Repair attempt failed or timed out:', repairErr);
        // Continue with original validatedDimensions where invalid quotes were stripped safely
      }
    }

    // Validate alternative opportunity if present
    let safeAlternative: AlternativeOpportunity | null = null;
    if (parsedOutput.alternativeOpportunity?.targetTurnId) {
      const opp = parsedOutput.alternativeOpportunity;
      const targetTurn = validTranscript.find((t) => t.id === opp.targetTurnId);
      if (targetTurn) {
        safeAlternative = {
          targetTurnId: targetTurn.id,
          speakerName: targetTurn.speakerName,
          opportunityContext: opp.opportunityContext || 'Constructive pivot opportunity',
          suggestedSpeech: opp.suggestedSpeech,
          objective: opp.objective || 'build'
        };
      }
    }

    // Ensure all 6 required dimensions are represented
    const requiredDims: ReportDimensionId[] = [
      'starting_discussion',
      'idea_quality',
      'building_on_others',
      'active_listening',
      'handling_disagreement',
      'ending_strongly'
    ];

    const finalDimensions: DimensionEvaluation[] = requiredDims.map((dimId) => {
      const found = validationResult.validatedDimensions.find((d) => d.id === dimId);
      if (found) {
        return {
          ...found,
          name: DEFAULT_DIMENSION_NAMES[dimId] || found.name
        };
      }
      return {
        id: dimId,
        name: DEFAULT_DIMENSION_NAMES[dimId],
        rating: 'Not observed',
        observation: 'No assessable evidence was observed for this dimension.',
        actionableImprovement: 'Focus on actively displaying this behaviour in your next group discussion.',
        evidence: []
      };
    });

    const report: SessionReport = {
      id: `rep-${Date.now()}`,
      sessionFingerprint: fingerprint,
      generatedAt: Date.now(),
      metrics: deterministicMetrics,
      dimensions: finalDimensions,
      alternativeOpportunity: safeAlternative,
      disclaimer: DISCLAIMER_TEXT,
      modelUsed: llmResult.model
    };

    return NextResponse.json({
      success: true,
      report,
      cached: false,
      validationWarnings: validationResult.validationErrors
    });
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
        ? err
        : JSON.stringify(err);
    console.error('[API /api/discussion/report error]:', errorMessage);

    const isQuotaOrRateLimit =
      errorMessage.includes('429') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('RESOURCE_EXHAUSTED');

    return NextResponse.json(
      {
        success: false,
        error: isQuotaOrRateLimit
          ? 'LLM API rate limit or quota exceeded while generating report. Please retry in a few moments.'
          : 'Failed to generate discussion report: ' + errorMessage.slice(0, 150),
        retryable: true
      },
      { status: 500 }
    );
  }
}
