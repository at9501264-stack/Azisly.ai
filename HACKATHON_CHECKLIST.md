# GD Arena — Hackathon Readiness & Demo Checklist

Use this checklist before demoing GD Arena live to judges or evaluators.

---

## 1. Pre-Flight Configuration & Environment

- [ ] **`.env.local` Created**:
  - `GEMINI_API_KEY`: Configured with active credits from Google AI Studio.
  - `SARVAM_API_KEY`: Configured with active credits from Sarvam AI Developer Portal.
  - Optional `GEMINI_MODEL`: `gemini-2.5-flash` (recommended for speed and quota limits).
- [ ] **Zero-Key Fallback Tested**:
  - Verify that omitting API keys gracefully engages browser Web Speech API and the deterministic scripted engine without crashing.
- [ ] **Dependencies & Build**:
  - `npm run verify` runs with 0 errors (all 19 acceptance checks pass).
  - `npm run build` succeeds cleanly without TypeScript or Next.js build errors.

---

## 2. Hardware & Browser Setup

- [ ] **Microphone Permission**:
  - Granted in Chrome, Edge, or Brave.
  - Audio preflight modal shows active VU volume meter (10–70% on voice).
- [ ] **Headphones Recommended**:
  - Use headphones (or wired headset) during live voice demos to prevent laptop speakers from feeding AI debater speech back into the microphone.
- [ ] **Audio Autoplay Permission**:
  - If browser blocks audio autoplay, click the preflight "Play Test Sound" chime or top banner to unlock audio playback.

---

## 3. Network & Deployment

- [ ] **Local Demo Server Running**:
  - `npm run dev` starts Next.js on `http://localhost:3000` and Voice Gateway on `http://localhost:3001`.
- [ ] **Public / Cloud Deployment**:
  - Frontend: Deployed on Node runtime or Vercel.
  - Voice Gateway: If deploying Sarvam Realtime streaming STT, gateway runs as a persistent Node WebSocket service (e.g. Render/Railway/Fly.io) with `ALLOWED_ORIGIN_HOSTS` configured.
  - Fallback: In browser-only serverless environments without the gateway, client automatically falls back to browser Web Speech API (`webkitSpeechRecognition`).

---

## 4. Rehearsed Session Flow Check

- [ ] **Preset Topic Selected**: e.g., *"Should Remote Work Replace Traditional Offices in Indian Tech?"*
- [ ] **Opening Address Heard**: Prof. Sharma introduces topic within 5 seconds.
- [ ] **Candidate Voice Spoken**: Speak 1 short contribution; observe live captions committing turn.
- [ ] **AI Responses Heard**: Observe at least two AI participants respond sequentially.
- [ ] **Barge-In Interruption Tested**: Speak mid-sentence or click "Interrupt / Speak"; verify AI audio halts immediately (<100ms) and turn is marked `[Interrupted by candidate]`.
- [ ] **Closing Sequence Tested**: Click "Jump to closing — demo" to enter closing takeaways.
- [ ] **Evidence Report Verified**:
  - Speaking share bars display correct percentages and separate moderator row.
  - 6 qualitative dimension cards render.
  - Clicking "View in transcript" on evidence quote smoothly scrolls to and highlights target turn.
  - Alternative response ("What you could have said") is displayed.
  - Markdown report export downloads cleanly.

---

## 5. Offline / Disaster Recovery Plan

If external Wi-Fi fails or provider API quotas trigger rate limits (`429`):
1. **Switch to Demo Mode**: In room setup, toggle Engine to **"Demo mode (Scripted Fallback)"**.
2. **Switch to Text Mode**: If microphone hardware malfunctions, toggle Interaction Mode to **"Text Mode"**.
3. **Report Generation**: Deterministic metrics and synthetic quote verification will continue to work offline without network dependency.
