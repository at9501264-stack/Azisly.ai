# GD Arena — Voice-First AI Group Discussion Practice Arena

**GD Arena** is an AI-powered simulation platform designed to prepare students for campus placement Group Discussions (GDs). A student enters a live, voice-driven practice room with 3 to 5 distinct AI debaters and an academic moderator, speaks aloud, experiences natural barge-in interruptions, and receives a verifiable, evidence-backed post-discussion coaching report.

Built during a 5-phase hackathon sprint.

---

## Architecture & Technology Stack

| Layer | Technologies & Providers |
|---|---|
| **Frontend UI** | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS, Lucide Icons |
| **State & Lifecycle** | Deterministic Room Controller State Machine, HTML5 Web Audio VU Analyzer, LocalStorage Session Recovery |
| **Conversational LLM** | Google Gemini (`gemini-2.5-flash`) via official `@google/genai` SDK with XML prompt isolation |
| **Speech-to-Text (STT)** | Sarvam AI Realtime Streaming (`saaras:v4` / `saaras:v3-realtime`) via WebSocket Voice Gateway; Zero-config browser Web Speech fallback |
| **Text-to-Speech (TTS)** | Sarvam AI Indian English & Hindi TTS (`bulbul:v3`) with distinct voices (`ratan`, `aditya`, `ishita`, `kabir`, `kavya`, `dev`); Browser SpeechSynthesis fallback |
| **Voice Gateway** | Node.js WebSocket Server (`ws`) proxying 16kHz PCM audio to Sarvam Realtime STT on port 3001 |
| **Evaluation Engine** | Deterministic metrics calculator + server-side Gemini qualitative evaluation with code-level quote verification |

---

## Key Features

1. **Realistic Placement GD Dynamics**:
   - 8 curated placement topics + Custom Topic support.
   - Panel size scalability: 3, 4, or 5 AI peer debaters + 1 separate moderator.
   - Language options: English and Hindi-English (Hinglish) collegiate mode.
2. **Distinct AI Debater Personalities**:
   - **Prof. Sharma (Moderator)**: Calm, academic, regulates flow and transitions.
   - **Aarav**: Assertive, firm, challenges assumptions directly.
   - **Meera**: Analytical, structured, provides data and framework-driven viewpoints.
   - **Kabir**: Thoughtful, deliberate, introduces ethical and long-term implications.
   - **Riya**: Creative, tangential, brings real-world anecdotes.
   - **Dev**: Diplomatic synthesizer, builds consensus.
3. **Live Voice & Streaming Transcription**:
   - Student speaks aloud into the microphone.
   - Real-time transient captions stream in the live captions bar.
   - Automatic silence detection (VAD) commits student contributions into the permanent transcript.
4. **Instant Barge-In / Interruption Protocol**:
   - Speaking during an AI response halts AI speech playback immediately (<100ms).
   - Turn is tagged `[Interrupted by candidate]` in amber.
   - Delivered text calculation ensures the discussion continues from what was actually heard, discarding unplayed audio tails.
5. **Deterministic Metrics & Quantitative Analytics**:
   - Candidate speaking duration (marked approx. VAD) vs AI playback durations.
   - Overlapping interval merging to prevent double-counting.
   - Speaking share percentage relative to active discussion speech duration.
   - Separate moderator row.
   - Neutral interruption counters and milestone tracking (first contribution time, closing participation).
6. **Code-Verified Qualitative Coaching Report**:
   - Evaluated across 6 competencies: *Starting the Discussion, Idea Quality, Building on Others, Active Listening, Handling Disagreements, Ending Strongly*.
   - Qualitative ratings: `Strength`, `Developing`, `Needs practice`, `Not observed`. No arbitrary numeric marks.
   - **Zero Hallucinated Quotes**: Every positive or critical claim is verified against eligible transcript text in code. Authoritative timestamps and speakers are derived directly from stored domain turns.
   - **Interactive Evidence Navigation**: Clicking an evidence quote scrolls to and illuminates the referenced transcript turn.
   - **Strategic Differentiator**: *"What You Could Have Said"* identifies constructive openings to build, challenge, or synthesize.
7. **Session Persistence & Multi-Format Exports**:
   - Automatic session caching under `localStorage` with content fingerprinting to avoid redundant LLM spend on reload.
   - Export full session report as Markdown (`.md`).
   - Export structured metrics and session state as JSON (`.json`).
   - Export plain-text transcript (`.txt`).
8. **Graceful Zero-Key & Offline Fallback**:
   - If API keys are omitted or venue network drops, GD Arena automatically falls back to its deterministic scripted discussion engine and browser Web Speech APIs.

---

## Local Setup & Development

### 1. Prerequisites
- Node.js 18.x or 20.x
- npm 9.x or higher

### 2. Installation
```bash
git clone <repository-url>
cd Azisly.ai
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Configure your credentials:
```env
# Google Gemini API Key (Server-side only)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Sarvam AI Subscription Key (For bulbul:v3 TTS & saaras:v4 STT)
SARVAM_API_KEY=your_sarvam_api_key_here

# Optional: Voice Gateway port (defaults to 3001)
VOICE_GATEWAY_PORT=3001
```

> **Note**: If `GEMINI_API_KEY` or `SARVAM_API_KEY` are left blank, the application gracefully engages the scripted engine and browser Web Speech API without crashing.

### 4. Running the Development Server
A single command concurrently starts Next.js on port 3000 and the WebSocket Voice Gateway on port 3001:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Google Chrome, Microsoft Edge, or Brave.

### 5. Running Verification & Builds
```bash
# Run all 19 automated acceptance checks:
npm run verify

# Run production build (type checking + Turbopack compilation):
npm run build
```

---

## Deployment Architecture

GD Arena consists of two runtime components:

```
[Browser Client]
   |--- HTTP / API Routes ---> [Next.js Web Server / Serverless Routes] (Port 3000)
   |                                 |--- Calls Google Gemini API (Server-side)
   |                                 |--- Calls Sarvam TTS API (Server-side)
   |
   |--- Audio PCM Stream (WSS) -> [Voice Gateway: Node.js WebSocket Service] (Port 3001)
                                     |--- Proxies to Sarvam Realtime STT (wss://api.sarvam.ai)
```

### Hosting Strategy
1. **Next.js Web Frontend**:
   - Deployable to any standard Node.js server, Docker container, or Vercel.
2. **WebSocket Voice Gateway**:
   - Because WebSockets require a persistent running Node process, deploy `src/server/voiceGateway.ts` to a runtime supporting WebSockets (e.g., Render, Railway, Fly.io, or an AWS/GCP virtual machine).
   - Set `ALLOWED_ORIGIN_HOSTS` to your production frontend domain (e.g. `ALLOWED_ORIGIN_HOSTS=gdarena.com`).
   - In the frontend environment, set `NEXT_PUBLIC_VOICE_GATEWAY_URL` to the public WebSocket endpoint of the gateway.
3. **Serverless-Only Fallback**:
   - In environments where only a serverless Next.js deployment is available, the client automatically falls back to browser Web Speech API (`webkitSpeechRecognition`) with zero crashes.

---

## Troubleshooting & FAQ

- **Microphone Denied / Not Working**:
  - Click the microphone icon in your browser URL bar and allow microphone permissions.
  - Test your mic level using the VU volume meter in the preflight modal.
  - If permissions cannot be granted, click "Switch to Text Mode" in the preflight dialog.
- **Audio Output Blocked by Browser Autoplay**:
  - Browsers restrict audio before the first user click. Click the "Play Test Sound" chime in the preflight modal or the "Enable Audio" banner at the top of the room to unlock audio playback.
- **AI Audio Echoing Into Microphone**:
  - Use headphones or a wired headset to prevent laptop speaker audio from feeding back into the microphone.
- **Gemini API Rate Limits (429)**:
  - If rate limits occur during heavy testing, GD Arena shows a clear status notice and offers a one-click "Switch to Demo Mode" toggle.

---

## Demonstration Script

For a 3–4 minute presentation guide for judges and evaluators, see [DEMO_SCRIPT.md](file:///Users/lalamansingh/Desktop/Azisly.ai/DEMO_SCRIPT.md).
For a pre-demo technical checklist, see [HACKATHON_CHECKLIST.md](file:///Users/lalamansingh/Desktop/Azisly.ai/HACKATHON_CHECKLIST.md).
