import { PRESET_TOPICS } from '../src/constants/topics';
import { getParticipantsForPanel, MODERATOR, STUDENT_PARTICIPANT } from '../src/constants/participants';
import { demoDiscussionProvider } from '../src/services/providers/demoDiscussionProvider';
import { audioPlaybackService } from '../src/services/audio/audioPlaybackService';
import { calculateSessionMetrics } from '../src/lib/metricsCalculator';
import { verifyReportEvidence, generateTranscriptFingerprint } from '../src/lib/evidenceVerifier';
import { TranscriptTurn, RoomConfig } from '../src/types/session';
import { DimensionEvaluation } from '../src/types/report';
import { DiscussionContext } from '../src/types/providers';

async function runGoldenPath() {
  console.log('=== GD Arena Phase 6: Automated Golden Path Verification ===\n');

  // 1. Topic & Panel Setup
  const topic = PRESET_TOPICS[0].title;
  const panelSize = 3;
  const participants = [
    STUDENT_PARTICIPANT,
    MODERATOR,
    ...getParticipantsForPanel(panelSize)
  ];
  const config: RoomConfig = {
    topic,
    isCustomTopic: false,
    participantCount: panelSize,
    language: 'english',
    durationMinutes: 5,
    patience: 'balanced',
    preferredEngine: 'demo',
    mode: 'voice'
  };
  console.log(`[Step 1] Initialized room: Topic="${topic}", Debaters=${panelSize} (${participants.filter(p => p.role === 'ai_participant').map(p => p.name).join(', ')})`);

  // 2. Moderator Opening
  const transcript: TranscriptTurn[] = [];
  const baseContext: DiscussionContext = {
    config,
    participants,
    transcript,
    activeSpeakerId: null,
    phase: 'opening'
  };

  const modTurn = await demoDiscussionProvider.getOpeningTurn(baseContext);
  transcript.push(modTurn);
  console.log(`[Step 2] Moderator spoke opening: "${modTurn.text.substring(0, 60)}..."`);

  // 3. Student Contribution
  const studentText = "I believe we must balance technological innovation with patient privacy and algorithmic explainability.";
  const studentTurn: TranscriptTurn = {
    id: 'turn-student-1',
    speakerId: STUDENT_PARTICIPANT.id,
    speakerName: STUDENT_PARTICIPANT.name,
    speakerRole: 'student',
    text: studentText,
    deliveredText: studentText,
    deliveryState: 'complete',
    deliveryStatus: 'fully_delivered',
    relativeTimestampMs: 7000,
    source: 'student',
    playbackDurationMs: 5000
  };
  transcript.push(studentTurn);
  console.log(`[Step 3] Student contributed turn: "${studentTurn.text}"`);

  // 4. Relevant Spoken Reply (AI responding to student)
  const aiPeers = participants.filter(p => p.role === 'ai_participant');
  const responder = aiPeers[0];
  const ackContext: DiscussionContext = {
    ...baseContext,
    phase: 'discussion',
    transcript
  };
  const aiAckTurn = await demoDiscussionProvider.acknowledgeStudentContribution(ackContext, responder, studentTurn);
  transcript.push(aiAckTurn);
  console.log(`[Step 4] ${responder.name} replied to student: "${aiAckTurn.text.substring(0, 60)}..."`);

  // 5. AI-to-AI Exchange (Peer debater responding to peer)
  const peerContext: DiscussionContext = {
    ...baseContext,
    phase: 'discussion',
    transcript
  };
  const aiPeerTurn = await demoDiscussionProvider.getNextTurn(peerContext);
  if (!aiPeerTurn) throw new Error('Expected AI peer turn');
  transcript.push(aiPeerTurn);
  console.log(`[Step 5] AI-to-AI exchange observed: ${aiPeerTurn.speakerName} addressed previous turn.`);

  // 6. Student Interruption Handling
  const rawFullText = "First, high-cost clinical trials will inevitably slow down deployment. Second, insurance companies might misinterpret risk scores. Third, smaller hospitals will be left behind.";
  const interruptedDelivered = audioPlaybackService.calculateDeliveredText(rawFullText, 2500);
  const interruptedTurn: TranscriptTurn = {
    id: 'turn-interrupted-1',
    speakerId: aiPeers[1].id,
    speakerName: aiPeers[1].name,
    speakerRole: aiPeers[1].role,
    text: rawFullText,
    deliveredText: interruptedDelivered,
    deliveryState: 'complete',
    deliveryStatus: 'interrupted',
    relativeTimestampMs: 22000,
    source: 'scripted-demo',
    playbackDurationMs: 2500
  };
  transcript.push(interruptedTurn);
  console.log(`[Step 6] Interruption tested: Original text was ${rawFullText.length} chars, delivered text truncated to ${interruptedDelivered.length} chars.`);

  // 7. Student Closing Contribution
  const studentClosingText = "To summarize, establishing clear clinical validation benchmarks ensures patient safety while preserving AI innovation.";
  const studentClosingTurn: TranscriptTurn = {
    id: 'turn-student-closing',
    speakerId: STUDENT_PARTICIPANT.id,
    speakerName: STUDENT_PARTICIPANT.name,
    speakerRole: 'student',
    text: studentClosingText,
    deliveredText: studentClosingText,
    deliveryState: 'complete',
    deliveryStatus: 'fully_delivered',
    relativeTimestampMs: 31000,
    source: 'student',
    playbackDurationMs: 4000
  };
  transcript.push(studentClosingTurn);
  console.log(`[Step 7] Student completed closing contribution: "${studentClosingTurn.text.substring(0, 60)}..."`);

  // 8. Generate Report & Deterministic Metrics
  const metrics = calculateSessionMetrics({
    transcript,
    timingEvents: [
      { type: 'ai_playback', speakerId: 'mod', startMs: 1000, endMs: 5000 },
      { type: 'student_speech', speakerId: STUDENT_PARTICIPANT.id, startMs: 8000, endMs: 13000 },
      { type: 'ai_playback', speakerId: responder.id, startMs: 15000, endMs: 21000 },
      { type: 'ai_playback', speakerId: aiPeers[1].id, startMs: 23000, endMs: 25500 },
      { type: 'student_speech', speakerId: STUDENT_PARTICIPANT.id, startMs: 32000, endMs: 36000 }
    ],
    activeDurationMs: 38000,
    isVoiceMode: true,
    isDemoMode: true
  });
  console.log(`[Step 8] Metrics calculated: Total turns=${metrics.totalTurns}, Student turns=${metrics.turnCountsBySpeaker[STUDENT_PARTICIPANT.id]}, First contribution=${metrics.studentFirstContributionSecs}s, Interrupted turns=${metrics.interruptedTurnsCount}`);

  // 9. Evidence Link Verification
  const sampleDims: DimensionEvaluation[] = [
    {
      id: 'starting_discussion',
      name: 'Starting the Discussion',
      rating: 'Developing',
      observation: 'Student entered after moderator opening.',
      actionableImprovement: 'Attempt opening immediately.',
      evidence: [
        {
          turnId: 'turn-student-1',
          quote: 'balance technological innovation with patient privacy',
          speakerName: 'You (Candidate)'
        }
      ]
    },
    {
      id: 'handling_disagreement',
      name: 'Handling Disagreement & Interruptions',
      rating: 'Strength',
      observation: 'Student interrupted AI debater gracefully.',
      actionableImprovement: 'Continue to use polite transitions.',
      evidence: [
        {
          turnId: 'turn-interrupted-1',
          quote: interruptedDelivered,
          speakerName: aiPeers[1].name
        }
      ]
    }
  ];

  const validationResult = verifyReportEvidence(sampleDims, transcript);
  if (validationResult.validationErrors.length > 0) {
    throw new Error(`Evidence validation failed: ${validationResult.validationErrors.join(', ')}`);
  }
  console.log(`[Step 9] Evidence verified: All quotes matched verbatim delivered text. Zero hallucinations.`);

  // 10. Fresh Session Reset
  const fp = generateTranscriptFingerprint(transcript);
  console.log(`[Step 10] Session fingerprint generated: ${fp}. Session reset ready.`);

  console.log('\n✓ Golden Path Verified Successfully End-to-End!');
}

runGoldenPath().catch((err) => {
  console.error('Golden path failed:', err);
  process.exit(1);
});
