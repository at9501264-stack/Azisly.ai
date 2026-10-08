import { TranscriptTurn } from '@/types/session';
import { DimensionEvaluation, EvidenceReference, DimensionRating } from '@/types/report';

export interface EvidenceValidationResult {
  isValid: boolean;
  validatedDimensions: DimensionEvaluation[];
  rejectedQuotesCount: number;
  validationErrors: string[];
}

/**
 * Derives eligible spoken text for a turn.
 * Critical Rule: Unplayed text from interrupted AI turns cannot become report evidence.
 */
export function getEligibleTurnText(turn: TranscriptTurn): string {
  if (turn.deliveryStatus === 'interrupted' && turn.deliveredText) {
    return turn.deliveredText.trim();
  }
  return turn.text.trim();
}

/**
 * Validates quotes against the actual transcript turns.
 * Guarantees that:
 * 1. The turn exists.
 * 2. The quote is an EXACT substring of eligible text.
 * 3. Timestamps and speaker names are derived from stored data, NEVER model output.
 */
export function verifyReportEvidence(
  dimensions: DimensionEvaluation[],
  transcript: TranscriptTurn[]
): EvidenceValidationResult {
  const turnMap = new Map<string, TranscriptTurn>();
  for (const t of transcript) {
    turnMap.set(t.id, t);
  }

  const validatedDimensions: DimensionEvaluation[] = [];
  const validationErrors: string[] = [];
  let rejectedQuotesCount = 0;

  for (const dim of dimensions) {
    const validatedEvidence: EvidenceReference[] = [];

    if (Array.isArray(dim.evidence)) {
      for (const ev of dim.evidence) {
        if (!ev || !ev.turnId || !ev.quote) {
          rejectedQuotesCount++;
          validationErrors.push(`Dimension "${dim.name}": Evidence item missing turnId or quote.`);
          continue;
        }

        const realTurn = turnMap.get(ev.turnId);
        if (!realTurn) {
          rejectedQuotesCount++;
          validationErrors.push(
            `Dimension "${dim.name}": Referencing unknown turnId "${ev.turnId}".`
          );
          continue;
        }

        const eligibleText = getEligibleTurnText(realTurn);
        const cleanQuote = ev.quote.trim().replace(/^["']|["']$/g, '');

        if (!cleanQuote || !eligibleText.includes(cleanQuote)) {
          rejectedQuotesCount++;
          validationErrors.push(
            `Dimension "${dim.name}": Quote "${cleanQuote}" is not an exact substring of turn "${realTurn.id}" eligible text.`
          );
          continue;
        }

        // Quote verified! Populate authoritative speaker and timestamp from stored domain data
        validatedEvidence.push({
          turnId: realTurn.id,
          quote: cleanQuote,
          speakerName: realTurn.speakerName,
          speakerRole: realTurn.speakerRole,
          relativeTimestampMs: realTurn.relativeTimestampMs,
          isValidated: true
        });
      }
    }

    // Determine final rating if evidence was stripped
    let finalRating: DimensionRating = dim.rating;
    if (finalRating !== 'Not observed' && validatedEvidence.length === 0) {
      // If the model claimed Strength/Needs Practice but provided no valid quotes, downgrade to Developing or Not observed
      if (dim.id === 'starting_discussion' || dim.id === 'ending_strongly') {
        finalRating = 'Not observed';
      } else {
        finalRating = 'Developing';
      }
    }

    validatedDimensions.push({
      ...dim,
      rating: finalRating,
      evidence: validatedEvidence
    });
  }

  return {
    isValid: rejectedQuotesCount === 0,
    validatedDimensions,
    rejectedQuotesCount,
    validationErrors
  };
}

/**
 * Computes a stable content fingerprint of the transcript for report caching.
 */
export function generateTranscriptFingerprint(transcript: TranscriptTurn[]): string {
  if (transcript.length === 0) return 'empty-session';
  const raw = transcript
    .map((t) => `${t.id}:${t.speakerId}:${t.text.length}:${t.deliveryStatus || 'done'}`)
    .join('|');
  
  // Lightweight hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `fp-${Math.abs(hash)}-${transcript.length}t`;
}
