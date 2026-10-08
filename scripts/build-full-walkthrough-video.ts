import { WebSocket } from 'ws';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

async function main() {
  console.log('🎬 Starting full 70-second video walkthrough builder...');
  const framesDir = path.resolve(process.cwd(), 'scratch/video_frames');
  const audioDir = path.resolve(process.cwd(), 'scratch/video_audio');
  const assetsDir = path.resolve(process.cwd(), 'docs/assets');

  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

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
    if (!targetPage) throw new Error('No target page found');

    const cdp = await connectCDP(targetPage.webSocketDebuggerUrl);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    try {
      await cdp.send('Browser.grantPermissions', {
        permissions: ['audioCapture'],
        origin: 'http://localhost:3000'
      });
    } catch {}

    const evaluate = async (expr: string) => {
      const res = await cdp.send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true
      });
      return res?.result?.value;
    };

    const saveFrame = async (filename: string) => {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(data, 'base64');
      fs.writeFileSync(path.join(framesDir, filename), buf);
      console.log(`📸 Captured frame: ${filename}`);
    };

    // ----------------------------------------------------
    // STAGE 1: Room Setup Top View (0s - 8s)
    // ----------------------------------------------------
    await cdp.send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1500));
    await evaluate(`localStorage.removeItem('gd_arena_session_v4'); window.location.reload();`);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('seg_01_setup_top.png');

    // ----------------------------------------------------
    // STAGE 2: Room Setup Configured Options (8s - 16s)
    // ----------------------------------------------------
    await evaluate(`window.scrollTo({ top: 350, behavior: 'instant' });`);
    await new Promise(r => setTimeout(r, 800));
    await saveFrame('seg_02_setup_options.png');

    // ----------------------------------------------------
    // STAGE 3: Audio Preflight Modal with VU Meter (16s - 23s)
    // ----------------------------------------------------
    await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' });`);
    await new Promise(r => setTimeout(r, 300));
    await evaluate(`document.getElementById('enter-practice-room-btn')?.click();`);
    await new Promise(r => setTimeout(r, 1200));
    await saveFrame('seg_03_preflight_modal.png');

    // ----------------------------------------------------
    // STAGE 4: Discussion Arena - Prof Sharma Opening (23s - 31s)
    // ----------------------------------------------------
    const topicTitle = 'Is AI going to eliminate entry-level software engineering jobs?';
    const tTurn1 = {
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
    };

    const arenaPayload1 = {
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
      transcript: [tTurn1],
      elapsedSeconds: 8,
      totalDurationSeconds: 600,
      phase: 'discussion',
      activeSpeakerId: 'mod-1',
      isCaptionsVisible: true,
      studentHasSpokenInClosing: false,
      engineMode: 'ai',
      interactionMode: 'voice',
      studentSpeakingDurationMs: 0,
      aiSpeakingDurationMs: 8000,
      events: [
        { id: 'ev-1', type: 'session_started', timestampMs: 1728380000000 },
        { id: 'ev-2', type: 'speaker_turn_started', timestampMs: 1728380000000, data: { speakerId: 'mod-1' } }
      ],
      savedAt: Date.now()
    };

    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(arenaPayload1))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('seg_04_prof_sharma_speaking.png');

    // ----------------------------------------------------
    // STAGE 5: Discussion Arena - Candidate Speaking (31s - 43s)
    // ----------------------------------------------------
    const tTurn2 = {
      id: 'turn-2',
      speakerId: 'student-you',
      speakerName: 'You (Candidate)',
      speakerRole: 'student',
      text: "Good morning everyone. In my view, while generative coding assistants automate syntax generation and repetitive boilerplate, entry-level engineers are vital for domain-specific problem formulation and edge-case testing.",
      relativeTimestampMs: 8000,
      source: 'ai',
      deliveryState: 'delivered',
      deliveryStatus: 'complete',
      deliveredText: "Good morning everyone. In my view, while generative coding assistants automate syntax generation and repetitive boilerplate, entry-level engineers are vital for domain-specific problem formulation and edge-case testing."
    };

    const arenaPayload2 = {
      ...arenaPayload1,
      transcript: [tTurn1, tTurn2],
      activeSpeakerId: 'student-you',
      elapsedSeconds: 20,
      studentSpeakingDurationMs: 11000
    };

    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(arenaPayload2))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('seg_05_candidate_speaking.png');

    // ----------------------------------------------------
    // STAGE 6: Discussion Arena - Aarav Countering (43s - 55s)
    // ----------------------------------------------------
    const tTurn3 = {
      id: 'turn-3',
      speakerId: 'ai-aarav',
      speakerName: 'Aarav',
      speakerRole: 'ai_participant',
      text: "I see your perspective Candidate, but we must acknowledge enterprise economics. Research shows automated agents already generate 46% of production code. Senior developers with AI operate at 3x velocity.",
      relativeTimestampMs: 20000,
      source: 'ai',
      deliveryState: 'delivered',
      deliveryStatus: 'complete',
      deliveredText: "I see your perspective Candidate, but we must acknowledge enterprise economics. Research shows automated agents already generate 46% of production code. Senior developers with AI operate at 3x velocity."
    };

    const arenaPayload3 = {
      ...arenaPayload2,
      transcript: [tTurn1, tTurn2, tTurn3],
      activeSpeakerId: 'ai-aarav',
      elapsedSeconds: 32,
      aiSpeakingDurationMs: 20000
    };

    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(arenaPayload3))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('seg_06_aarav_countering.png');

    // ----------------------------------------------------
    // STAGE 7: Discussion Arena - Meera Synthesizing (55s - 64s)
    // ----------------------------------------------------
    const tTurn4 = {
      id: 'turn-4',
      speakerId: 'ai-meera',
      speakerName: 'Meera',
      speakerRole: 'ai_participant',
      text: "Aarav makes an interesting point, but we have to analyze technical debt. Recent studies from GitClear show code duplication jumps by 32% with unchecked AI generation.",
      relativeTimestampMs: 32000,
      source: 'ai',
      deliveryState: 'delivered',
      deliveryStatus: 'complete',
      deliveredText: "Aarav makes an interesting point, but we have to analyze technical debt. Recent studies from GitClear show code duplication jumps by 32% with unchecked AI generation."
    };

    const arenaPayload4 = {
      ...arenaPayload3,
      transcript: [tTurn1, tTurn2, tTurn3, tTurn4],
      activeSpeakerId: 'ai-meera',
      elapsedSeconds: 42,
      aiSpeakingDurationMs: 29000
    };

    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(arenaPayload4))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('seg_07_meera_synthesizing.png');

    // ----------------------------------------------------
    // STAGE 8: Post-Session Evaluation Report (64s - 74s)
    // ----------------------------------------------------
    const mockReport = {
      id: 'rep-sample-01',
      sessionFingerprint: 'turn-1:mod-1:232:complete|turn-2:student-you:247:complete|turn-3:ai-aarav:273:complete|turn-4:ai-meera:266:complete',
      generatedAt: Date.now(),
      metrics: {
        isVoiceMode: true,
        isDemoMode: false,
        actualDurationMs: 42000,
        studentSpeakingDurationMs: 11000,
        aiPlaybackDurationMs: { 'ai-aarav': 12000, 'ai-meera': 9000 },
        moderatorPlaybackDurationMs: 8000,
        totalActiveSpeakingDurationMs: 40000,
        speakingSharePercent: { 'student-you': 27.5, 'ai-aarav': 30.0, 'ai-meera': 22.5, 'mod-1': 20.0 },
        turnCountsBySpeaker: { 'mod-1': 1, 'student-you': 1, 'ai-aarav': 1, 'ai-meera': 1 },
        totalTurns: 4,
        studentFirstContributionSecs: 8,
        studentContributedInClosing: false,
        interruptedTurnsCount: 0
      },
      dimensions: [
        {
          id: 'starting_discussion',
          name: 'Initiative & First-Mover Stance',
          rating: 'Strength',
          observation: 'Seized the floor promptly at [00:08] after moderator opened, articulating a structured stance with clear professional tone.',
          actionableImprovement: 'Continue opening with immediate crisp structure.',
          evidence: [
            {
              turnId: 'turn-2',
              quote: 'Good morning everyone. In my view, while generative coding assistants automate syntax generation...',
              speakerName: 'You (Candidate)',
              speakerRole: 'student',
              relativeTimestampMs: 8000,
              isValidated: true
            }
          ]
        },
        {
          id: 'idea_quality',
          name: 'Idea Quality & Technical Depth',
          rating: 'Strength',
          observation: 'Distinguished clearly between syntactic code generation and architectural domain logic.',
          actionableImprovement: 'Incorporate external empirical benchmarks to fortify arguments.',
          evidence: [
            {
              turnId: 'turn-2',
              quote: '...entry-level engineers are vital for domain-specific problem formulation and edge-case testing.',
              speakerName: 'You (Candidate)',
              speakerRole: 'student',
              relativeTimestampMs: 8000,
              isValidated: true
            }
          ]
        }
      ],
      disclaimer: 'Verified Qualitative Coaching Report generated with deterministic transcript quote matching.',
      modelUsed: 'gemini-2.5-flash'
    };

    const reportPayload = {
      ...arenaPayload4,
      phase: 'completed',
      report: mockReport
    };

    await evaluate(`
      localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(reportPayload))});
      window.location.reload();
    `);
    await new Promise(r => setTimeout(r, 2000));
    await evaluate(`window.scrollTo({ top: 380, behavior: 'instant' });`);
    await new Promise(r => setTimeout(r, 600));
    await saveFrame('seg_08_evaluation_report.png');

    cdp.close();
  } finally {
    chromeProcess.kill();
  }

  // --------------------------------------------------------------------------
  // ASSEMBLE MASTER AUDIO TRACK USING FFMPEG
  // --------------------------------------------------------------------------
  console.log('🎵 Building master synchronized audio track with FFmpeg...');

  // Timings:
  // 0s - 23s: Feature showcase (23 seconds of ambient subtle background or silence)
  // 23s: Prof Sharma (duration 8s) -> 31s
  // 31s: Candidate (duration 11.5s) -> 42.5s
  // 42.5s: Aarav (duration 12s) -> 54.5s
  // 54.5s: Meera (duration 9.5s) -> 64s
  // 64s - 74s: Report summary (10s silence / outro)

  // Generate silence clips:
  const introSilence = path.join(audioDir, 'silence_23s.wav');
  const outroSilence = path.join(audioDir, 'silence_10s.wav');
  execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 23 "${introSilence}"`, { stdio: 'inherit' });
  execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 10 "${outroSilence}"`, { stdio: 'inherit' });

  // Concat all audio files
  const concatList = path.join(audioDir, 'audio_concat.txt');
  fs.writeFileSync(concatList, `
file '${introSilence}'
file '${path.join(audioDir, '01_prof_sharma.mp3')}'
file '${path.join(audioDir, '02_candidate.mp3')}'
file '${path.join(audioDir, '03_aarav.mp3')}'
file '${path.join(audioDir, '04_meera.mp3')}'
file '${outroSilence}'
  `.trim());

  const fullAudio = path.join(audioDir, 'master_walkthrough_audio.wav');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c:a pcm_s16le "${fullAudio}"`, { stdio: 'inherit' });
  console.log('✅ Master audio track created successfully!');

  // --------------------------------------------------------------------------
  // ASSEMBLE VIDEO WITH FFMPEG (H.264 + AAC MP4, 1080p, 30fps)
  // --------------------------------------------------------------------------
  console.log('🎬 Encoding 74-second master walkthrough MP4 with FFmpeg...');

  // Frame timings:
  // seg_01_setup_top.png: 8s
  // seg_02_setup_options.png: 8s
  // seg_03_preflight_modal.png: 7s
  // seg_04_prof_sharma_speaking.png: 8s
  // seg_05_candidate_speaking.png: 11.5s
  // seg_06_aarav_countering.png: 12s
  // seg_07_meera_synthesizing.png: 9.5s
  // seg_08_evaluation_report.png: 10s

  const videoConcatList = path.join(framesDir, 'video_concat.txt');
  fs.writeFileSync(videoConcatList, `
file '${path.join(framesDir, 'seg_01_setup_top.png')}'
duration 8
file '${path.join(framesDir, 'seg_02_setup_options.png')}'
duration 8
file '${path.join(framesDir, 'seg_03_preflight_modal.png')}'
duration 7
file '${path.join(framesDir, 'seg_04_prof_sharma_speaking.png')}'
duration 8
file '${path.join(framesDir, 'seg_05_candidate_speaking.png')}'
duration 11.5
file '${path.join(framesDir, 'seg_06_aarav_countering.png')}'
duration 12
file '${path.join(framesDir, 'seg_07_meera_synthesizing.png')}'
duration 9.5
file '${path.join(framesDir, 'seg_08_evaluation_report.png')}'
duration 10
file '${path.join(framesDir, 'seg_08_evaluation_report.png')}'
  `.trim());

  const outMp4 = path.join(assetsDir, 'demo_walkthrough.mp4');
  execSync(`
    ffmpeg -y -f concat -safe 0 -i "${videoConcatList}" \
      -i "${fullAudio}" \
      -c:v libx264 -pix_fmt yuv420p -r 30 -preset medium -crf 22 \
      -c:a aac -b:a 192k -shortest \
      -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
      "${outMp4}"
  `, { stdio: 'inherit' });

  console.log(`🎉 Master Video Saved (${(fs.statSync(outMp4).size / (1024 * 1024)).toFixed(2)} MB) -> ${outMp4}`);
}

main().catch(console.error);
