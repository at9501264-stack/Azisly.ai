import { WebSocket } from 'ws';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

interface CDPClient {
  send(method: string, params?: any): Promise<any>;
  close(): void;
}

async function connectCDP(wsUrl: string): Promise<CDPClient> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  let id = 1;
  const pending = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

  ws.on('message', (data: string) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    } catch (e) {
      console.error('Error handling CDP message:', e);
    }
  });

  return {
    send(method: string, params: any = {}) {
      return new Promise((resolve, reject) => {
        const reqId = id++;
        pending.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    },
    close() {
      ws.close();
    }
  };
}

async function run() {
  console.log('🚀 Starting pristine asset generation with headless Chrome & CDP...');
  const assetsDir = path.resolve(process.cwd(), 'docs/assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--window-size=1440,900',
    'about:blank'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://localhost:9222/json/list');
    const pages = await listRes.json() as any[];
    const targetPage = pages.find((p: any) => p.type === 'page');
    if (!targetPage) throw new Error('No target page found in Chrome');

    const cdp = await connectCDP(targetPage.webSocketDebuggerUrl);

    // Enable domains
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    // Set Retina display metrics: 1440 x 900 at 2x scale
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    console.log('📱 Configured 1440x900 @ 2x Retina viewport');

    // Helper to evaluate in page
    const evaluate = async (expr: string) => {
      const res = await cdp.send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
      });
      return res?.result?.value;
    };

    // Helper to capture screenshot
    const captureScreenshot = async (filePath: string) => {
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false
      });
      const buffer = Buffer.from(data, 'base64');
      fs.writeFileSync(filePath, buffer);
      console.log(`📸 Saved screenshot (${(buffer.length / 1024).toFixed(1)} KB) -> ${path.basename(filePath)}`);
      return buffer;
    };

    // -------------------------------------------------------------------------
    // 1. CAPTURE ROOM SETUP
    // -------------------------------------------------------------------------
    console.log('📸 [1/4] Capturing Room Setup Screen...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1500));

    // Clear storage to show clean setup
    await evaluate(`
      localStorage.removeItem('gd_arena_session_v4');
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2000));

    // Select topic 'Is AI going to eliminate entry-level software engineering jobs?'
    await evaluate(`
      const topicCard = Array.from(document.querySelectorAll('button, div')).find(el => el.textContent && el.textContent.includes('Is AI going to eliminate entry-level software engineering jobs'));
      if (topicCard) topicCard.click();
    `);
    await new Promise(r => setTimeout(r, 500));

    await captureScreenshot(path.join(assetsDir, 'room_setup.png'));

    // -------------------------------------------------------------------------
    // 2. CAPTURE AUDIO PREFLIGHT MODAL
    // -------------------------------------------------------------------------
    console.log('📸 [2/4] Capturing Audio Preflight Check Modal...');
    // Grant audioCapture permission so mic meter displays active green state
    try {
      await cdp.send('Browser.grantPermissions', {
        permissions: ['audioCapture'],
        origin: 'http://localhost:3000'
      });
    } catch (e) {
      console.warn('Grant permissions warning:', e);
    }

    // Click button with ID enter-practice-room-btn
    await evaluate(`
      const btn = document.getElementById('enter-practice-room-btn');
      if (btn) btn.click();
    `);
    await new Promise(r => setTimeout(r, 1200));

    await captureScreenshot(path.join(assetsDir, 'audio_preflight.png'));

    // -------------------------------------------------------------------------
    // 3. CAPTURE DISCUSSION ARENA WITH RICH MULTI-TURN DIALOGUE
    // -------------------------------------------------------------------------
    console.log('📸 [3/4] Capturing Live Spoken Discussion Arena with rich turns...');

    const topicTitle = 'Is AI going to eliminate entry-level software engineering jobs?';
    const mockTranscript = [
      {
        id: 'turn-1',
        speakerId: 'mod-1',
        speakerName: 'Prof. Sharma',
        speakerRole: 'moderator',
        text: "Welcome everyone to today's group discussion on: 'Is AI going to eliminate entry-level software engineering jobs?' Please maintain academic rigor, listen actively, and respect differing viewpoints. The floor is now open for initial thoughts.",
        relativeTimestampMs: 0,
        source: 'ai',
        deliveryState: 'delivered',
        deliveryStatus: 'complete',
        deliveredText: "Welcome everyone to today's group discussion on: 'Is AI going to eliminate entry-level software engineering jobs?' Please maintain academic rigor, listen actively, and respect differing viewpoints. The floor is now open for initial thoughts."
      },
      {
        id: 'turn-2',
        speakerId: 'student-you',
        speakerName: 'You (Candidate)',
        speakerRole: 'student',
        text: "Good morning everyone. In my view, while generative coding assistants automate syntax generation and repetitive boilerplate, entry-level engineers are vital for domain-specific problem formulation, edge-case testing, and understanding user nuances that models frequently hallucinate.",
        relativeTimestampMs: 18000,
        source: 'ai',
        deliveryState: 'delivered',
        deliveryStatus: 'complete',
        deliveredText: "Good morning everyone. In my view, while generative coding assistants automate syntax generation and repetitive boilerplate, entry-level engineers are vital for domain-specific problem formulation, edge-case testing, and understanding user nuances that models frequently hallucinate."
      },
      {
        id: 'turn-3',
        speakerId: 'ai-aarav',
        speakerName: 'Aarav',
        speakerRole: 'ai_participant',
        text: "I see your perspective Candidate, but we must acknowledge enterprise economics. Research shows GitHub Copilot and automated agents already generate 46% of production code. When senior developers paired with AI operate at 3x velocity, why would tech firms spend 9 months training fresh graduates?",
        relativeTimestampMs: 45000,
        source: 'ai',
        deliveryState: 'delivered',
        deliveryStatus: 'complete',
        deliveredText: "I see your perspective Candidate, but we must acknowledge enterprise economics. Research shows GitHub Copilot and automated agents already generate 46% of production code. When senior developers paired with AI operate at 3x velocity, why would tech firms spend 9 months training fresh graduates?"
      },
      {
        id: 'turn-4',
        speakerId: 'ai-meera',
        speakerName: 'Meera',
        speakerRole: 'ai_participant',
        text: "Aarav makes a compelling short-term efficiency point, but we have to analyze technical debt. Recent studies from GitClear show code duplication and refactoring debt jump by 32% with unchecked AI generation. If we eliminate entry-level roles, where will senior architects come from in ten years?",
        relativeTimestampMs: 78000,
        source: 'ai',
        deliveryState: 'delivered',
        deliveryStatus: 'complete',
        deliveredText: "Aarav makes a compelling short-term efficiency point, but we have to analyze technical debt. Recent studies from GitClear show code duplication and refactoring debt jump by 32% with unchecked AI generation. If we eliminate entry-level roles, where will senior architects come from in ten years?"
      }
    ];

    // Inject active session payload into localStorage and reload into Arena
    const arenaPayload = {
      version: 4,
      config: {
        topic: topicTitle,
        category: 'Tech & AI',
        contextBrief: 'Evaluating the impact of generative coding tools, junior vs senior developers, and shifting skill demands.',
        durationMinutes: 10,
        participantCount: 3,
        patience: 'moderate',
        preferredEngine: 'ai',
        language: 'hinglish',
        interactionMode: 'voice'
      },
      transcript: mockTranscript,
      elapsedSeconds: 110,
      totalDurationSeconds: 600,
      phase: 'discussion',
      isCaptionsVisible: true,
      studentHasSpokenInClosing: false,
      engineMode: 'ai',
      interactionMode: 'voice',
      studentSpeakingDurationMs: 24000,
      aiSpeakingDurationMs: 68000,
      events: [
        { id: 'ev-1', type: 'session_started', timestampMs: 1728380000000 },
        { id: 'ev-2', type: 'speaker_turn_started', timestampMs: 1728380000000, data: { speakerId: 'mod-1' } },
        { id: 'ev-3', type: 'speaker_turn_ended', timestampMs: 1728380018000, data: { speakerId: 'mod-1' } },
        { id: 'ev-4', type: 'speaker_turn_started', timestampMs: 1728380020000, data: { speakerId: 'student-you' } },
        { id: 'ev-5', type: 'speaker_turn_ended', timestampMs: 1728380042000, data: { speakerId: 'student-you' } },
        { id: 'ev-6', type: 'speaker_turn_started', timestampMs: 1728380045000, data: { speakerId: 'ai-aarav' } },
        { id: 'ev-7', type: 'speaker_turn_ended', timestampMs: 1728380072000, data: { speakerId: 'ai-aarav' } },
        { id: 'ev-8', type: 'speaker_turn_started', timestampMs: 1728380075000, data: { speakerId: 'ai-meera' } }
      ],
      savedAt: Date.now()
    };

    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(arenaPayload))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2500));

    await captureScreenshot(path.join(assetsDir, 'discussion_arena.png'));

    // -------------------------------------------------------------------------
    // 4. CAPTURE EVALUATION REPORT
    // -------------------------------------------------------------------------
    console.log('📸 [4/4] Generating & Capturing Verified Evaluation Report...');

    const mockReport = {
      id: 'rep-sample-01',
      sessionFingerprint: 'turn-1:mod-1:232:complete|turn-2:student-you:247:complete|turn-3:ai-aarav:273:complete|turn-4:ai-meera:266:complete',
      generatedAt: Date.now(),
      metrics: {
        isVoiceMode: true,
        isDemoMode: false,
        actualDurationMs: 110000,
        studentSpeakingDurationMs: 24000,
        aiPlaybackDurationMs: {
          'ai-aarav': 27000,
          'ai-meera': 26000
        },
        moderatorPlaybackDurationMs: 18000,
        totalActiveSpeakingDurationMs: 95000,
        speakingSharePercent: {
          'student-you': 25.3,
          'ai-aarav': 28.4,
          'ai-meera': 27.4,
          'mod-1': 18.9
        },
        turnCountsBySpeaker: {
          'mod-1': 1,
          'student-you': 1,
          'ai-aarav': 1,
          'ai-meera': 1
        },
        totalTurns: 4,
        studentFirstContributionSecs: 18,
        studentContributedInClosing: false,
        interruptedTurnsCount: 0
      },
      dimensions: [
        {
          id: 'starting_discussion',
          name: 'Initiative & First-Mover Stance',
          rating: 'Strength',
          observation: 'Seized the floor promptly at [00:18] after moderator opened, articulating a structured stance with clear professional tone.',
          actionableImprovement: 'Continue opening with immediate crisp structure; maintain this confidence across competitive campus placement rounds.',
          evidence: [
            {
              turnId: 'turn-2',
              quote: 'Good morning everyone. In my view, while generative coding assistants automate syntax generation and repetitive boilerplate, entry-level engineers are vital...',
              speakerName: 'You (Candidate)',
              speakerRole: 'student',
              relativeTimestampMs: 18000,
              isValidated: true
            }
          ]
        },
        {
          id: 'idea_quality',
          name: 'Idea Quality & Technical Depth',
          rating: 'Strength',
          observation: 'Distinguished clearly between syntactic code generation and architectural domain logic and hallucination mitigation.',
          actionableImprovement: 'Incorporate external empirical benchmarks (e.g. DORA report or GitHub developer surveys) to fortify technical arguments.',
          evidence: [
            {
              turnId: 'turn-2',
              quote: '...entry-level engineers are vital for domain-specific problem formulation, edge-case testing, and understanding user nuances that models frequently hallucinate.',
              speakerName: 'You (Candidate)',
              speakerRole: 'student',
              relativeTimestampMs: 18000,
              isValidated: true
            }
          ]
        },
        {
          id: 'building_on_others',
          name: 'Synthesis & Engaging Others',
          rating: 'Developing',
          observation: 'Established the central premise that Aarav and Meera subsequently debated. Acknowledged peer arguments.',
          actionableImprovement: 'When Aarav brings forward aggressive economic cost figures, address his numbers directly before Meera speaks.',
          evidence: [
            {
              turnId: 'turn-3',
              quote: 'I see your perspective Candidate, but we must acknowledge enterprise economics...',
              speakerName: 'Aarav',
              speakerRole: 'ai_participant',
              relativeTimestampMs: 45000,
              isValidated: true
            }
          ]
        },
        {
          id: 'active_listening',
          name: 'Active Listening & Composure',
          rating: 'Strength',
          observation: 'Allowed moderator and peers to complete turns without interruption while tracking the debate trajectory.',
          actionableImprovement: 'Use non-verbal vocal cues or brief verbal nods to signal active agreement before countering.',
          evidence: [
            {
              turnId: 'turn-4',
              quote: 'Recent studies from GitClear show code duplication and refactoring debt jump by 32% with unchecked AI generation...',
              speakerName: 'Meera',
              speakerRole: 'ai_participant',
              relativeTimestampMs: 78000,
              isValidated: true
            }
          ]
        },
        {
          id: 'handling_disagreement',
          name: 'Handling Disagreement & Pushback',
          rating: 'Strength',
          observation: 'Maintained polite academic posture in the face of Aarav’s aggressive enterprise efficiency pushback.',
          actionableImprovement: 'Practice respectful interjections using the Spacebar barge-in when opposing viewpoints distort your initial premise.',
          evidence: [
            {
              turnId: 'turn-3',
              quote: 'When senior developers paired with AI operate at 3x velocity, why would tech firms spend 9 months training fresh graduates?',
              speakerName: 'Aarav',
              speakerRole: 'ai_participant',
              relativeTimestampMs: 45000,
              isValidated: true
            }
          ]
        },
        {
          id: 'ending_strongly',
          name: 'Closing Synthesis & Resolution',
          rating: 'Developing',
          observation: 'Discussion ended before closing round. Initial points provided strong material for a concluding synthesis.',
          actionableImprovement: 'In the closing 60 seconds, synthesize both Aarav’s velocity metrics and Meera’s technical debt risks into a unified resolution.',
          evidence: []
        }
      ],
      alternativeOpportunity: {
        targetTurnId: 'turn-3',
        speakerName: 'Aarav',
        opportunityContext: 'Aarav argued that senior developers with AI deliver 3x velocity, making junior hires redundant.',
        suggestedSpeech: 'Aarav, while senior developers with AI write code 3x faster, who mentors them when edge cases break in production? Junior developers doing code review and integration testing today are the senior architects of 2030.',
        objective: 'Reframe efficiency as a long-term organizational pipeline rather than a short-term sprint.'
      },
      disclaimer: 'Verified Qualitative Coaching Report generated with deterministic transcript quote matching.',
      modelUsed: 'gemini-2.5-flash'
    };

    const reportPayload = {
      ...arenaPayload,
      phase: 'completed',
      report: mockReport
    };

    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(reportPayload))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2500));

    // Scroll slightly to balance header and competency cards
    await evaluate(`
      window.scrollTo({ top: 380, behavior: 'instant' });
    `);
    await new Promise(r => setTimeout(r, 600));

    await captureScreenshot(path.join(assetsDir, 'evaluation_report.png'));

    // -------------------------------------------------------------------------
    // 5. GENERATE HIGH-QUALITY ANIMATED DEMO WEBP
    // -------------------------------------------------------------------------
    console.log('🎬 [5/5] Creating smooth multi-frame animated demo walkthrough...');

    const frames: Buffer[] = [];

    // Frame 1: Room Setup
    await evaluate(`
      localStorage.removeItem('gd_arena_session_v4');
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 1500));
    frames.push(await captureScreenshot('/tmp/frame_01.png'));

    // Frame 2: Preflight Audio Modal
    await evaluate(`
      const btn = document.getElementById('enter-practice-room-btn');
      if (btn) btn.click();
    `);
    await new Promise(r => setTimeout(r, 1200));
    frames.push(await captureScreenshot('/tmp/frame_02.png'));

    // Frame 3: Arena - Professor Opening
    const openingPayload = {
      ...arenaPayload,
      transcript: [mockTranscript[0]],
      events: arenaPayload.events.slice(0, 3)
    };
    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(openingPayload))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 1500));
    frames.push(await captureScreenshot('/tmp/frame_03.png'));

    // Frame 4: Arena - Student Speaking
    const studentPayload = {
      ...arenaPayload,
      transcript: mockTranscript.slice(0, 2),
      events: arenaPayload.events.slice(0, 5)
    };
    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(studentPayload))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 1500));
    frames.push(await captureScreenshot('/tmp/frame_04.png'));

    // Frame 5: Arena - Aarav Countering
    const aaravPayload = {
      ...arenaPayload,
      transcript: mockTranscript.slice(0, 3),
      events: arenaPayload.events.slice(0, 7)
    };
    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(aaravPayload))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 1500));
    frames.push(await captureScreenshot('/tmp/frame_05.png'));

    // Frame 6: Arena - Meera Synthesizing
    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(arenaPayload))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 1500));
    frames.push(await captureScreenshot('/tmp/frame_06.png'));

    // Frame 7: Evaluation Report Scorecard
    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(reportPayload))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2000));
    frames.push(await captureScreenshot('/tmp/frame_07.png'));

    // Frame 8: Evaluation Report Recommendations (scrolled down)
    await evaluate(`
      window.scrollBy({ top: 450, behavior: 'instant' });
    `);
    await new Promise(r => setTimeout(r, 500));
    frames.push(await captureScreenshot('/tmp/frame_08.png'));

    console.log(`🎞️ Assembling ${frames.length} frames into animated demo_video.webp...`);

    // Resize frames for web display (width: 1280px) and optimize
    const resizedFrames: Buffer[] = [];
    for (let i = 0; i < frames.length; i++) {
      const resized = await sharp(frames[i])
        .resize({ width: 1200, withoutEnlargement: true })
        .toBuffer();
      resizedFrames.push(resized);
    }

    // Combine into an animated webp using sharp
    // Frame durations: 2000ms per frame so reader can actually read the content!
    const animatedWebp = await sharp(resizedFrames[0], { animated: true })
      .webp({
        effort: 4,
        quality: 85,
        loop: 0,
        delay: [2200, 2000, 2500, 3000, 3000, 3000, 3500, 3500] // readable pacing
      })
      .toBuffer();

    const animPath = path.join(assetsDir, 'demo_video.webp');
    fs.writeFileSync(animPath, animatedWebp);
    console.log(`✅ Saved animated demo (${(animatedWebp.length / 1024).toFixed(1)} KB) -> demo_video.webp`);

    // Clean up local storage in chrome
    await evaluate(`
      localStorage.removeItem('gd_arena_session_v4');
    `);

    cdp.close();
    console.log('✨ All showcase visual assets generated successfully!');
  } finally {
    chromeProcess.kill();
  }
}

run().catch((err) => {
  console.error('❌ Error during asset capture:', err);
  process.exit(1);
});
