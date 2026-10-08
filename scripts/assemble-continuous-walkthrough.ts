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
  console.log('🎬 Starting 92-second Master Walkthrough Video Assembly with Continuous Voice...');

  const audioDir = path.resolve(process.cwd(), 'scratch/master_audio');
  const framesDir = path.resolve(process.cwd(), 'scratch/master_frames');
  const assetsDir = path.resolve(process.cwd(), 'docs/assets');

  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  // --------------------------------------------------------------------------
  // STEP 1: CONCATENATE MASTER AUDIO TRACK (WITH NATURAL SPEECH TRANSITIONS)
  // --------------------------------------------------------------------------
  console.log('🎵 Building master audio track from 7 voice segments...');

  // Generate 0.6s silence between turns
  const pauseWav = path.join(audioDir, 'pause_0.6s.wav');
  execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 0.6 "${pauseWav}"`, { stdio: 'inherit' });

  const audioConcatList = path.join(audioDir, 'concat_list.txt');
  fs.writeFileSync(audioConcatList, `
file '${path.join(audioDir, '01_intro_narration.mp3')}'
file '${pauseWav}'
file '${path.join(audioDir, '02_preflight_narration.mp3')}'
file '${pauseWav}'
file '${path.join(audioDir, '03_prof_sharma.mp3')}'
file '${pauseWav}'
file '${path.join(audioDir, '04_candidate.mp3')}'
file '${pauseWav}'
file '${path.join(audioDir, '05_aarav.mp3')}'
file '${pauseWav}'
file '${path.join(audioDir, '06_meera.mp3')}'
file '${pauseWav}'
file '${path.join(audioDir, '07_scorecard_narration.mp3')}'
  `.trim());

  const masterAudio = path.join(audioDir, 'master_walkthrough_audio.wav');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${audioConcatList}" -c:a pcm_s16le "${masterAudio}"`, { stdio: 'inherit' });

  const masterDuration = parseFloat(
    execSync(`ffprobe -i "${masterAudio}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
  );
  console.log(`✅ Master Audio Ready! Duration: ${masterDuration.toFixed(2)}s`);

  // --------------------------------------------------------------------------
  // STEP 2: CAPTURE HIGH-DEFINITION RETINA FRAMES VIA CDP
  // --------------------------------------------------------------------------
  console.log('📸 Launching Headless Chrome to capture synchronized scene frames...');

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
      console.log(`📸 Captured: ${filename}`);
    };

    // Frame 1: Setup Dashboard Top (0s - 7.5s)
    await cdp.send('Page.navigate', { url: 'http://localhost:3000' });
    await new Promise(r => setTimeout(r, 1500));
    await evaluate(`localStorage.removeItem('gd_arena_session_v4'); window.location.reload();`);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('f01_setup_top.png');

    // Frame 2: Setup Options & Personas (7.5s - 15.6s)
    await evaluate(`window.scrollTo({ top: 380, behavior: 'instant' });`);
    await new Promise(r => setTimeout(r, 800));
    await saveFrame('f02_setup_options.png');

    // Frame 3: Audio Preflight Modal (15.6s - 26.6s)
    await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' });`);
    await new Promise(r => setTimeout(r, 300));
    await evaluate(`document.getElementById('enter-practice-room-btn')?.click();`);
    await new Promise(r => setTimeout(r, 1200));
    await saveFrame('f03_preflight_modal.png');

    // Dialogue data
    const topicTitle = 'Is AI going to eliminate entry-level software engineering jobs?';
    const turn1 = {
      id: 'turn-1',
      speakerId: 'mod-1',
      speakerName: 'Prof. Sharma',
      speakerRole: 'moderator',
      text: "Welcome everyone to today's group discussion on whether AI will eliminate entry-level software jobs. Please maintain academic rigor, listen actively, and respect differing viewpoints. The floor is open.",
      relativeTimestampMs: 0,
      source: 'ai',
      deliveryState: 'delivered',
      deliveryStatus: 'complete',
      deliveredText: "Welcome everyone to today's group discussion on whether AI will eliminate entry-level software jobs. Please maintain academic rigor, listen actively, and respect differing viewpoints. The floor is open."
    };

    const turn2 = {
      id: 'turn-2',
      speakerId: 'student-you',
      speakerName: 'You (Candidate)',
      speakerRole: 'student',
      text: "Good morning everyone. In my view, while generative coding tools automate syntax generation and repetitive boilerplate, entry-level engineers are vital for domain logic, edge-case testing, and understanding user nuances.",
      relativeTimestampMs: 11000,
      source: 'ai',
      deliveryState: 'delivered',
      deliveryStatus: 'complete',
      deliveredText: "Good morning everyone. In my view, while generative coding tools automate syntax generation and repetitive boilerplate, entry-level engineers are vital for domain logic, edge-case testing, and understanding user nuances."
    };

    const turn3 = {
      id: 'turn-3',
      speakerId: 'ai-aarav',
      speakerName: 'Aarav',
      speakerRole: 'ai_participant',
      text: "I see your perspective Candidate, but enterprise economics tell a different story. AI tools already write 46% of production code, and senior engineers with AI work at 3x velocity. Why would tech companies hire fresh graduates?",
      relativeTimestampMs: 23000,
      source: 'ai',
      deliveryState: 'delivered',
      deliveryStatus: 'complete',
      deliveredText: "I see your perspective Candidate, but enterprise economics tell a different story. AI tools already write 46% of production code, and senior engineers with AI work at 3x velocity. Why would tech companies hire fresh graduates?"
    };

    const turn4 = {
      id: 'turn-4',
      speakerId: 'ai-meera',
      speakerName: 'Meera',
      speakerRole: 'ai_participant',
      text: "Aarav makes an interesting point, but we have to analyze technical debt. Studies show code duplication jumps by 32% with unchecked AI generation. Fresh graduates are the senior software architects of tomorrow.",
      relativeTimestampMs: 36000,
      source: 'ai',
      deliveryState: 'delivered',
      deliveryStatus: 'complete',
      deliveredText: "Aarav makes an interesting point, but we have to analyze technical debt. Studies show code duplication jumps by 32% with unchecked AI generation. Fresh graduates are the senior software architects of tomorrow."
    };

    const basePayload = {
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
      totalDurationSeconds: 600,
      phase: 'discussion',
      isCaptionsVisible: true,
      studentHasSpokenInClosing: false,
      engineMode: 'ai',
      interactionMode: 'voice'
    };

    // Frame 4: Prof Sharma Opening (26.6s - 38.3s)
    const payload1 = {
      ...basePayload,
      transcript: [turn1],
      activeSpeakerId: 'mod-1',
      elapsedSeconds: 11,
      studentSpeakingDurationMs: 0,
      aiSpeakingDurationMs: 11000,
      events: [{ id: 'ev-1', type: 'session_started', timestampMs: 1728380000000 }]
    };
    await evaluate(`localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(payload1))}); window.location.reload();`);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('f04_prof_sharma.png');

    // Frame 5: Candidate Turn (38.3s - 51.1s)
    const payload2 = {
      ...basePayload,
      transcript: [turn1, turn2],
      activeSpeakerId: 'student-you',
      elapsedSeconds: 23,
      studentSpeakingDurationMs: 12000,
      aiSpeakingDurationMs: 11000,
      events: [{ id: 'ev-1', type: 'session_started', timestampMs: 1728380000000 }]
    };
    await evaluate(`localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(payload2))}); window.location.reload();`);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('f05_candidate.png');

    // Frame 6: Aarav Countering (51.1s - 64.8s)
    const payload3 = {
      ...basePayload,
      transcript: [turn1, turn2, turn3],
      activeSpeakerId: 'ai-aarav',
      elapsedSeconds: 36,
      studentSpeakingDurationMs: 12000,
      aiSpeakingDurationMs: 24000,
      events: [{ id: 'ev-1', type: 'session_started', timestampMs: 1728380000000 }]
    };
    await evaluate(`localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(payload3))}); window.location.reload();`);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('f06_aarav.png');

    // Frame 7: Meera Synthesizing (64.8s - 76.6s)
    const payload4 = {
      ...basePayload,
      transcript: [turn1, turn2, turn3, turn4],
      activeSpeakerId: 'ai-meera',
      elapsedSeconds: 47,
      studentSpeakingDurationMs: 12000,
      aiSpeakingDurationMs: 35000,
      events: [{ id: 'ev-1', type: 'session_started', timestampMs: 1728380000000 }]
    };
    await evaluate(`localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(payload4))}); window.location.reload();`);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('f07_meera.png');

    // Frame 8 & 9: Evaluation Report (76.6s - 92.0s)
    const mockReport = {
      id: 'rep-sample-01',
      sessionFingerprint: 'turn-1:mod-1:232:complete|turn-2:student-you:247:complete|turn-3:ai-aarav:273:complete|turn-4:ai-meera:266:complete',
      generatedAt: Date.now(),
      metrics: {
        isVoiceMode: true,
        isDemoMode: false,
        actualDurationMs: 47000,
        studentSpeakingDurationMs: 12000,
        aiPlaybackDurationMs: { 'ai-aarav': 13000, 'ai-meera': 11000 },
        moderatorPlaybackDurationMs: 11000,
        totalActiveSpeakingDurationMs: 47000,
        speakingSharePercent: { 'student-you': 25.5, 'ai-aarav': 27.7, 'ai-meera': 23.4, 'mod-1': 23.4 },
        turnCountsBySpeaker: { 'mod-1': 1, 'student-you': 1, 'ai-aarav': 1, 'ai-meera': 1 },
        totalTurns: 4,
        studentFirstContributionSecs: 11,
        studentContributedInClosing: false,
        interruptedTurnsCount: 0
      },
      dimensions: [
        {
          id: 'starting_discussion',
          name: 'Initiative & First-Mover Stance',
          rating: 'Strength',
          observation: 'Seized the floor promptly at [00:11] after moderator opened, articulating a structured stance with clear professional tone.',
          actionableImprovement: 'Continue opening with immediate crisp structure; maintain this confidence across campus placement rounds.',
          evidence: [
            {
              turnId: 'turn-2',
              quote: 'Good morning everyone. In my view, while generative coding tools automate syntax generation...',
              speakerName: 'You (Candidate)',
              speakerRole: 'student',
              relativeTimestampMs: 11000,
              isValidated: true
            }
          ]
        },
        {
          id: 'idea_quality',
          name: 'Idea Quality & Technical Depth',
          rating: 'Strength',
          observation: 'Distinguished clearly between syntactic code generation and architectural domain logic.',
          actionableImprovement: 'Incorporate external empirical benchmarks to fortify technical arguments.',
          evidence: [
            {
              turnId: 'turn-2',
              quote: '...entry-level engineers are vital for domain logic, edge-case testing, and understanding user nuances.',
              speakerName: 'You (Candidate)',
              speakerRole: 'student',
              relativeTimestampMs: 11000,
              isValidated: true
            }
          ]
        }
      ],
      disclaimer: 'Verified Qualitative Coaching Report generated with deterministic transcript quote matching.',
      modelUsed: 'gemini-2.5-flash'
    };

    const reportPayload = {
      ...payload4,
      phase: 'completed',
      report: mockReport
    };

    await evaluate(`localStorage.setItem('gd_arena_session_v4', ${JSON.stringify(JSON.stringify(reportPayload))}); window.location.reload();`);
    await new Promise(r => setTimeout(r, 2000));
    await saveFrame('f08_scorecard_top.png');

    await evaluate(`window.scrollTo({ top: 380, behavior: 'instant' });`);
    await new Promise(r => setTimeout(r, 600));
    await saveFrame('f09_scorecard_competencies.png');

    cdp.close();
  } finally {
    chromeProcess.kill();
  }

  // --------------------------------------------------------------------------
  // STEP 3: ENCODE 92-SECOND FULL HD MP4 (H.264 + AAC STEREO)
  // --------------------------------------------------------------------------
  console.log('🎬 Encoding master 92-second walkthrough MP4 with FFmpeg...');

  // Timings precisely aligned with speech durations:
  // f01_setup_top.png: 7.5s (intro narration part 1)
  // f02_setup_options.png: 8.1s (intro narration part 2 + pause)
  // f03_preflight_modal.png: 11.0s (preflight narration + pause)
  // f04_prof_sharma.png: 11.7s (prof sharma speech + pause)
  // f05_candidate.png: 12.8s (candidate speech + pause)
  // f06_aarav.png: 13.7s (aarav speech + pause)
  // f07_meera.png: 11.8s (meera speech + pause)
  // f08_scorecard_top.png: 7.0s (scorecard narration part 1)
  // f09_scorecard_competencies.png: 7.5s (scorecard narration part 2)

  const videoConcatList = path.join(framesDir, 'master_video_concat.txt');
  fs.writeFileSync(videoConcatList, `
file '${path.join(framesDir, 'f01_setup_top.png')}'
duration 7.5
file '${path.join(framesDir, 'f02_setup_options.png')}'
duration 8.1
file '${path.join(framesDir, 'f03_preflight_modal.png')}'
duration 11.0
file '${path.join(framesDir, 'f04_prof_sharma.png')}'
duration 11.7
file '${path.join(framesDir, 'f05_candidate.png')}'
duration 12.8
file '${path.join(framesDir, 'f06_aarav.png')}'
duration 13.7
file '${path.join(framesDir, 'f07_meera.png')}'
duration 11.8
file '${path.join(framesDir, 'f08_scorecard_top.png')}'
duration 7.0
file '${path.join(framesDir, 'f09_scorecard_competencies.png')}'
duration 7.5
file '${path.join(framesDir, 'f09_scorecard_competencies.png')}'
  `.trim());

  const outMp4 = path.join(assetsDir, 'demo_walkthrough.mp4');
  execSync(`
    ffmpeg -y -f concat -safe 0 -i "${videoConcatList}" \
      -i "${masterAudio}" \
      -c:v libx264 -pix_fmt yuv420p -r 30 -preset medium -crf 22 \
      -c:a aac -b:a 192k -shortest \
      -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
      "${outMp4}"
  `, { stdio: 'inherit' });

  const finalDuration = execSync(`ffprobe -i "${outMp4}" -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim();
  const finalSize = (fs.statSync(outMp4).size / (1024 * 1024)).toFixed(2);
  console.log(`🎉 Master Walkthrough Video Produced! Duration: ${finalDuration}s, Size: ${finalSize} MB -> ${outMp4}`);
}

main().catch(console.error);
