# GD Arena — 3–4 Minute Hackathon Demonstration Script

This script provides an exact, step-by-step walkthrough to present **GD Arena** in 3–4 minutes during judging or live hackathon evaluations.

---

## Demonstration Overview

| Stage | Duration | Core Action | Key Feature Highlighted |
|---|---|---|---|
| **1. Hook & Problem** | 30s | Explain the placement GD bottleneck | Why solo GD practice is traditionally impossible |
| **2. Room Configuration** | 30s | Setup room + audio preflight | Distinct persona roster + Indian collegiate context |
| **3. Live Discussion & Speech** | 60s | Speak aloud + observe AI debaters | Realtime STT, live captions, Indian voice personas |
| **4. Barge-In Interruption** | 30s | Interrupt an AI debater mid-sentence | Instant speech cut-off, delivered text slicing |
| **5. Closing Round** | 20s | Trigger closing round + conclude | Moderator pacing, closing round structure |
| **6. Evidence-Backed Report** | 60s | View metrics + click evidence quote | Deterministic math, zero fake quotes, "What you could have said" |

---

## Recommended Demo Topic & Candidate Contribution

- **Selected Topic**: `"Should Remote Work Replace Traditional Offices in Indian Tech?"` (Preset Topic #2)
- **Why this topic**: Highly relatable, immediately triggers distinct viewpoints between assertive Aarav (pro-productivity) and analytical Meera (pro-mentorship & office culture), allowing natural student disagreement without needing memorized statistics.
- **Suggested Student Contribution**:
  > *"I agree with Aarav that remote work offers autonomy, but in early career stages, serendipitous learning from senior engineers at the whiteboard cannot be replicated over video calls."*

---

## Step-by-Step Script

### 1. Hook & Problem Statement (0:00 – 0:30)
> **Speaker Says:**
> *"Every year, millions of Indian engineering and MBA students get eliminated in the first round of campus placements: the Group Discussion. Why? Because you can't practise a group discussion alone.*
>
> *Today, we're showing **GD Arena**: a voice-first, AI-powered practice room where a student enters a real-time discussion with 3 to 5 distinct AI debaters and an academic moderator, speaks aloud, interrupts, and receives a verifiable, transcript-backed coaching report."*

### 2. Room Setup & Audio Preflight (0:30 – 1:00)
> **Action:**
> 1. Show the Setup screen (`http://localhost:3000`).
> 2. Point out:
>    - **Preset Topics**: Curated placement topics + Custom Topic option.
>    - **Language Switch**: English vs Hindi-English (Hinglish) collegiate mode.
>    - **Panel Size**: 3, 4, or 5 AI Debaters with distinct personas:
>      - **Aarav**: Assertive & firm
>      - **Meera**: Analytical & structured
>      - **Kabir**: Thoughtful & calm
>    - **Separate Moderator**: Prof. Sharma manages time pacing and transitions.
> 3. Click **"Enter Practice Arena"**.
> 4. In the **Audio Preflight Modal**, show:
>    - Live VU volume meter responding to your mic.
>    - Headphone recommendation to prevent microphone loopback.
>    - Privacy disclosure: *Audio is transcribed live; raw audio is not stored or shared.*
> 5. Click **"Confirm & Enter Room"**.

### 3. Live Discussion & Candidate Contribution (1:00 – 2:00)
> **Action:**
> 1. The room loads. **Prof. Sharma (Moderator)** opens the discussion with a calm, academic framing.
> 2. Point out the live status indicator: `Listening` / `Thinking` / `Speaking`.
> 3. Aarav begins speaking firmly in favor of remote flexibility.
> 4. **Candidate Speaks**: Speak the suggested contribution into your microphone:
>    *"I agree with Aarav that remote work offers autonomy, but in early career stages, serendipitous learning from senior engineers at the whiteboard cannot be replicated over video calls."*
> 5. Watch the **Live Captions Bar** track your words in real time.
> 6. Silence detector commits your turn into the main chronological transcript.
> 7. Meera responds directly to your point about junior engineer mentorship.

### 4. Live Barge-In / Interruption (2:00 – 2:30)
> **Action:**
> 1. While Meera or Kabir is speaking aloud, **interrupt immediately** by speaking:
>    *"Excuse me, let me add a quick point here..."* (or click the **"Interrupt / Speak"** button).
> 2. **Notice the instant behavior**:
>    - AI audio halts immediately (<100ms).
>    - The turn is marked `[Interrupted by candidate]` in amber.
>    - The unplayed tail is excluded so the discussion proceeds only from what was actually heard.

### 5. Early Closing Trigger (2:30 – 2:50)
> **Action:**
> 1. Click the **"Jump to closing — demo"** button in the header.
> 2. Prof. Sharma calls for closing takeaways.
> 3. Each debater provides a 1-sentence final position.
> 4. Moderator closes the arena. Session automatically completes.

### 6. Evidence-Backed Coaching Report (2:50 – 3:50)
> **Action:**
> 1. The **Evidence Report** renders:
>    - **Deterministic Metrics Breakdown**:
>      - Candidate speaking share % vs peer debaters.
>      - Separate moderator row.
>      - First contribution timestamp (`X seconds into discussion`).
>      - Closing contribution badge.
>      - Neutral barge-in/overlap counter.
>    - **6 Evaluative Competency Cards**:
>      - Qualitative ratings: `Strength`, `Developing`, `Needs practice`, `Not observed`.
>      - Highlight that ratings are backed by **verbatim quotes** from the session.
> 2. **Interactive Proof**:
>    - Click **"View in transcript"** on any quoted evidence chip.
>    - The viewport smoothly scrolls down and illuminates the exact referenced turn with a turquoise highlight ring.
> 3. **The Differentiator**:
>    - Show the **"What You Could Have Said"** card.
>    - Demonstrates an AI-suggested constructive alternative tailored to the peer exchange.
> 4. **Exports**:
>    - Click **"Report (.md)"** to download the clean Markdown report.
>    - Click **"Data (.json)"** to download the complete raw data payload.
> 5. Wrap up with the ethical disclaimer:
>    *"AI coaching for practice; not an automated placement rejection tool."*

---

## Fallback Demonstration (If APIs / Network Fail)

If the venue Wi-Fi drops or external API quotas are exhausted:

1. **Scripted Demo Fallback**:
   - In Room Setup, switch Engine to **"Demo mode (Scripted Fallback)"**.
   - Select **Text Mode** if microphone permissions are restricted on the presentation machine.
2. **Behavior**:
   - The discussion runs deterministically using GD Arena's internal conversation state machine.
   - Pacing, turns, interruptions, and the complete Phase 4 report generation (with synthetic quote verification) continue to function offline.
   - The UI clearly labels all scripted participants with `"Demo response"` and `"Scripted Fallback"`.
