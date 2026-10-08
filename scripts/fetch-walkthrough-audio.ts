import * as fs from 'fs';
import * as path from 'path';

async function fetchAudio(text: string, speakerVoice: string, outFile: string) {
  console.log(`Generating audio with voice ${speakerVoice}...`);
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
    throw new Error('No audio returned');
  }
}

async function main() {
  const scratchDir = path.resolve(process.cwd(), 'scratch/video_audio');
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

  await fetchAudio(
    "Welcome everyone to today's group discussion on: Is AI going to eliminate entry-level software engineering jobs? The floor is now open for initial thoughts.",
    "ratan",
    path.join(scratchDir, "01_prof_sharma.mp3")
  );

  await fetchAudio(
    "Good morning everyone. In my view, while generative coding assistants automate syntax generation and repetitive boilerplate, entry-level engineers are vital for domain-specific problem formulation and edge-case testing.",
    "dev",
    path.join(scratchDir, "02_candidate.mp3")
  );

  await fetchAudio(
    "I see your perspective Candidate, but we must acknowledge enterprise economics. Research shows automated agents already generate 46% of production code. Senior developers with AI operate at 3x velocity.",
    "aditya",
    path.join(scratchDir, "03_aarav.mp3")
  );

  await fetchAudio(
    "Aarav makes an interesting point, but we have to analyze technical debt. Recent studies from GitClear show code duplication jumps by 32% with unchecked AI generation.",
    "ishita",
    path.join(scratchDir, "04_meera.mp3")
  );

  console.log("All audio tracks generated successfully!");
}

main().catch(console.error);
