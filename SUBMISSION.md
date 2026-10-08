# GD Arena — Hackathon Project Submission

## 1. Product Description
**GD Arena** is an AI-powered simulation environment that allows a candidate to practise campus placement and MBA admission Group Discussions (GDs) independently. The candidate participates in real time with 3 to 5 distinct AI debater personas and a separate academic moderator, using live speech or text, and receives a post-discussion coaching report grounded in verbatim transcript evidence.

## 2. Problem It Solves
In Indian campus placements and graduate admissions, Group Discussions are used as a high-volume elimination round. However, solitary candidates face a structural practice barrier:
- Practising alone with a conversational chatbot only trains 1-on-1 interview banter; it cannot replicate multi-party group dynamics, turn-stealing, or cross-debater rebuttal.
- Assembling peer study groups regularly is logistically difficult and often yields unstructured, subjective feedback.
- Candidates lack objective metrics on their speaking share, initiation timing, and active listening.

GD Arena solves this by simulating an authentic, multi-agent discussion room where AI debaters interact with each other and the candidate, with an impartial moderator keeping time and structure.

## 3. Implemented Core Features
- **Configurable GD Setup**:
  - Selection of 8 preset placement topics (e.g., AI ethics, remote work, gig economy) or custom topic entry.
  - Sizing panel to 3, 4, or 5 AI participants plus a dedicated moderator.
  - English and collegiate Hindi-English (Hinglish) language options.
  - Configurable discussion durations (5, 8, 10 minutes) and AI patience levels (`quick`, `balanced`, `patient`).
- **Autonomous Multi-Agent Discussion**:
  - Distinct debater personas with contrasting debate styles (assertive, analytical, calm, creative, synthesizer).
  - Impartial moderator persona (Prof. Vikram Sharma) who introduces the topic, manages time, enforces decorum, and moderates the closing round.
  - Multi-party peer exchanges: AI debaters address and rebut each other directly, not just the candidate.
  - Student opportunity detection: ensures candidate gets entry openings when AI debaters talk consecutively.
- **Voice Pipeline & Interruption Handling**:
  - Streaming candidate speech recognition via Web Speech API and WebSocket voice gateway.
  - Spoken AI turns with distinct voice character assignments via Sarvam AI API and browser speech synthesis fallback.
  - Single-speaker state machine: ensures only one participant speaks aloud at any given moment.
  - Real-time barge-in/interruption: candidate speech immediately cuts off AI audio playback, truncates the delivered transcript turn to what was actually heard, and resumes the debate from that point.
- **Evidence-Backed Coaching Report**:
  - Client-side deterministic speaking metrics (candidate speaking share %, first contribution timestamp, closing round participation, barge-in counter).
  - Multi-speaker timing intervals merged in code to prevent double-counting.
  - 6 qualitative assessment dimensions (Starting the Discussion, Idea Quality, Building on Others, Active Listening, Handling Disagreement, Ending Strongly).
  - Code-level quote verification: every cited quote must be an exact substring of delivered transcript text. Unplayed audio from interrupted turns is strictly excluded.
  - Interactive transcript links: clicking an evidence quote scrolls to and highlights the verbatim turn in the transcript.
  - "What You Could Have Said" card: suggests an alternative constructive pivot based on a specific peer turn.
  - Local export: download full report as Markdown (`.md`) or raw session telemetry as JSON (`.json`).
  - Session persistence: active sessions and reports are recoverable via browser `localStorage`.

## 4. Actual Architecture & Providers
```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js Frontend (React 19)                     │
│  - Setup View: Room configuration, mic preflight check                 │
│  - Discussion Room: Multi-agent arena, active speaker UI, live captions │
│  - Summary View: Deterministic metrics, verified coaching report       │
│  - Local State Machine: Single-speaker lock, timers, storage cache     │
└───────────────────▲───────────────────────────────▲────────────────────┘
                    │ REST / SSE                    │ WebSockets (8080)
┌───────────────────▼───────────────────┐ ┌─────────▼────────────────────┐
│      Next.js Route Handlers (App)     │ │ Node.js Voice Gateway (ws)   │
│  - /api/discussion/turn               │ │ - PCM 16kHz audio stream     │
│  - /api/discussion/report             │ │ - Sarvam Realtime STT bridge │
│  - /api/discussion/config             │ └──────────────────────────────┘
│  - /api/speech/tts                    │
└───────┬──────────────────────┬────────┘
        │                      │
┌───────▼──────────────┐ ┌─────▼────────────────────────────────────────┐
│   Google Gemini API  │ │            Sarvam AI Speech API              │
│ - gemini-2.5-flash   │ │ - Saaras v4 (Realtime STT streaming)         │
│ - Prompt isolation   │ │ - Bulbul v3 (TTS with distinct voices:       │
│ - Zod schema check   │ │   ratan, aditya, ishita, kabir, kavya, dev)  │
└──────────────────────┘ └──────────────────────────────────────────────┘
        ▲                                       ▲
        └─────────────────┬─────────────────────┘
                          │ (If keys unconfigured)
         ┌────────────────┴───────────────────────┐
         │       Deterministic Fallback Engine    │
         │ - Offline scripted discussion engine   │
         │ - Browser Web Speech API (STT / TTS)   │
         │ - Rule-based evidence report evaluator │
         └────────────────────────────────────────┘
```

- **LLM Provider**: Google Gemini API (`gemini-2.5-flash` or `gemini-2.0-flash`) via official `@google/genai` SDK.
- **Voice Provider**: Sarvam AI API (Saaras v4 for realtime Indian English/Hindi STT, Bulbul v3 for multi-voice TTS) with a Node.js WebSocket gateway (`src/server/voiceGateway.ts`).
- **Fallbacks**: When credentials are not configured, the app transitions automatically to a deterministic demo provider and browser Web Speech API with 100% functional integrity.

## 5. Concrete Implemented Differentiator
**Transcript-Backed Evidence Verification with Interruption Pruning**:
Unlike LLM coaching tools that generate impressionistic feedback or hallucinated quotes, GD Arena runs a deterministic post-processing verifier (`src/lib/evidenceVerifier.ts`) that validates every quote against committed transcript text. Furthermore, when a candidate interrupts an AI debater, the system calculates the sentence boundary where speech was stopped and truncates the turn text; unplayed text is excluded from eligible report evidence so the candidate is never evaluated on statements that were never heard in the room.

## 6. How Transcript Evidence Supports the Report
1. Every candidate turn and AI peer turn in the room is committed to an immutable transcript with a stable ID (`turn-[timestamp]-[seq]`), delivery status, and timestamp.
2. The report generator (Gemini LLM or deterministic rule evaluator) extracts verbatim quotes and tags them with the exact `turnId`.
3. The server runs `verifyReportEvidence()`:
   - Verifies the `turnId` exists in the session.
   - Verifies the quote is a verbatim substring of `deliveredText` (not raw unplayed text).
   - Rejects hallucinated quotes and strips invalid evidence.
4. The client UI renders each quote as a clickable button that scrolls down to the corresponding turn card in the chronological transcript and flashes a turquoise highlight border.

## 7. Known Limitations
- **Cloud API Keys Required for Live Generation**: Live LLM debate turns and Sarvam Indian voice synthesis require valid `GEMINI_API_KEY` and `SARVAM_API_KEY` in `.env.local`. Without them, the app runs on its deterministic demo script and browser Web Speech synthesis.
- **Microphone Permissions**: Web Speech STT requires running in a Chromium- or WebKit-based browser with active microphone permissions.
- **Audio Autoplay Restrictions**: Browsers require an initial user interaction (such as clicking "Enter Practice Arena" or "Enable Voice") before playing Web Audio.
- **Client-Side Persistence**: Sessions are saved exclusively in browser `localStorage`. Using private/incognito browsing or clearing site data resets stored session history.
- **Single-Candidate Experience**: The system is designed for one human candidate against simulated AI debaters, not multi-human multiplayer.

## 8. Local Setup & Verification

### Prerequisites
- Node.js v18+ (tested on Node v20/v24)
- npm v9+

### Setup Commands
```bash
# Clone and enter the repository
git clone <repo-url>
cd <repo-folder>

# Install dependencies
npm install

# (Optional) Add API keys for live cloud generation
cp .env.example .env.local
# Edit .env.local and add GEMINI_API_KEY and SARVAM_API_KEY if available

# Run the complete verification suites
npm run lint         # Runs ESLint checks (exits 0)
npm run verify       # Runs 19 automated state machine & report checks (exits 0)
npm run test:golden  # Runs 10-step end-to-end golden path simulation (exits 0)
npm run build        # Production Next.js build verification (exits 0)

# Start the application
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Google Chrome or Microsoft Edge.
