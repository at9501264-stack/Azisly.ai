import * as fs from 'fs';
import * as path from 'path';

async function fetchAudio(text: string, speakerVoice: string, outFile: string) {
  console.log(`Generating audio with voice ${speakerVoice}... -> ${path.basename(outFile)}`);
  const res = await fetch('http://localhost:3000/api/speech/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speakerVoice })
  });
  const data = await res.json() as { audioBase64?: string };
  if (data.audioBase64) {
    const buffer = Buffer.from(data.audioBase64, 'base64');
    fs.writeFileSync(outFile, buffer);
    console.log(`Saved ${(buffer.length / 1024).toFixed(1)} KB -> ${path.basename(outFile)}`);
  } else {
    throw new Error(`Failed to generate audio for ${outFile}`);
  }
}

async function main() {
  const audioDir = path.resolve(process.cwd(), 'scratch/master_audio');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  console.log('🎙️ Generating 7 continuous voice segments for 95-second walkthrough...');

  // 1. Intro Feature Tour
  await fetchAudio(
    "Welcome to GD Arena, the voice-first AI group discussion simulator for campus placements. On this setup dashboard, you can choose from curated campus topics, customize panel size from 3 to 5 peers, and select between formal English or natural Hinglish.",
    "kavya",
    path.join(audioDir, "01_intro_narration.mp3")
  );

  // 2. Preflight Hardware Check
  await fetchAudio(
    "Before entering the arena, the hardware preflight check verifies your microphone, measures input audio with a live VU meter, and primes the Web Audio context so speech plays without browser delay.",
    "kavya",
    path.join(audioDir, "02_preflight_narration.mp3")
  );

  // 3. Prof Sharma Opening
  await fetchAudio(
    "Welcome everyone to today's group discussion on whether AI will eliminate entry-level software jobs. Please maintain academic rigor, listen actively, and respect differing viewpoints. The floor is open.",
    "ratan",
    path.join(audioDir, "03_prof_sharma.mp3")
  );

  // 4. Candidate Spoken Turn
  await fetchAudio(
    "Good morning everyone. In my view, while generative coding tools automate syntax generation and repetitive boilerplate, entry-level engineers are vital for domain logic, edge-case testing, and understanding user nuances.",
    "dev",
    path.join(audioDir, "04_candidate.mp3")
  );

  // 5. Aarav Counter
  await fetchAudio(
    "I see your perspective Candidate, but enterprise economics tell a different story. AI tools already write 46% of production code, and senior engineers with AI work at 3x velocity. Why would tech companies hire fresh graduates?",
    "aditya",
    path.join(audioDir, "05_aarav.mp3")
  );

  // 6. Meera Synthesis
  await fetchAudio(
    "Aarav makes an interesting point, but we have to analyze technical debt. Studies show code duplication jumps by 32% with unchecked AI generation. Fresh graduates are the senior software architects of tomorrow.",
    "ishita",
    path.join(audioDir, "06_meera.mp3")
  );

  // 7. Scorecard Coaching Review
  await fetchAudio(
    "Once the session concludes, GD Arena generates a verifiable coaching report. Here you see your speaking share breakdown, response pacing, and qualitative scores across 6 placement competencies with clickable, verified transcript quotes.",
    "kavya",
    path.join(audioDir, "07_scorecard_narration.mp3")
  );

  console.log('✅ All 7 voice tracks generated successfully!');
}

main().catch(console.error);
