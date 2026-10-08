# GD Arena — Hackathon Pitch & Technical Defense

## 1. 60-Second Spoken Pitch

> *"Every year, millions of Indian engineering and MBA graduates face a major bottleneck in campus placements: the Group Discussion round. A staggering 60% to 70% of applicants get eliminated right here.*
>
> *Why? Because you cannot practise a group discussion alone. Conversational chatbots only prepare you for 1-on-1 interviews. But a real GD is a messy, high-stakes group dynamic: you have to read the room, find entry openings, deal with dominant speakers, and build on peer points under a strict timer.*
>
> *Introducing **GD Arena**: a voice-first, multi-agent AI arena for solitary GD practice. A student steps into a room with 3 to 5 distinct AI debaters and an academic moderator, speaks aloud with live streaming speech recognition, hears AI debaters speak and debate each other, interrupts speakers mid-sentence, and receives a comprehensive coaching report.*
>
> *Most importantly: our feedback has zero hallucinated advice. Every score, speaking percentage, and coaching tip is deterministically verified against verbatim transcript evidence. With GD Arena, any student can master the group discussion anytime, anywhere."*

---

## 2. 3-Minute Demonstration Outline

*(For exact dialogue and clicks, follow [DEMO_SCRIPT.md](file:///Users/lalamansingh/Desktop/Azisly.ai/DEMO_SCRIPT.md).)*

| Minute | Phase | What the Judges See & Hear |
| :--- | :--- | :--- |
| **0:00 – 0:30** | **Setup & Audio Preflight** | Show room creation: select placement topic (`"Should Remote Work Replace Traditional Offices in Indian Tech?"`), pick 3 AI debaters (Aarav, Meera, Kabir) + Moderator (Prof. Sharma). Perform mic volume check in preflight modal. |
| **0:30 – 1:30** | **Live Multi-Agent Discussion** | Prof. Sharma introduces the topic. Aarav opens assertively. Student speaks aloud into the mic; speech appears in real-time captions and commits to the transcript. Analytical Meera responds directly to what the student said. |
| **1:30 – 2:15** | **Live Barge-In & Interruption** | Kabir begins an AI turn. The student speaks aloud mid-turn: AI audio immediately cuts off, the turn is truncated to what was actually delivered, and the debate flows forward from that point. |
| **2:15 – 2:40** | **Closing Round Wrap-Up** | Moderator initiates the concluding summary round. Debaters share brief 1-sentence takeaways. Session concludes smoothly. |
| **2:40 – 3:00** | **Evidence-Backed Coaching Report** | Review deterministic speaking metrics (% share, time to first turn, overlaps). Click on an evidence quote under the 6 competency dimensions to see the transcript auto-scroll and highlight the verbatim source turn. Point out "What You Could Have Said" and export report to Markdown. |

---

## 3. Technical Questions & Defense

### Q1: Why does this need more than a chatbot?
**Answer:** A standard LLM chatbot is inherently dyadic (1-on-1 ping-pong). It cannot replicate the cognitive load of a group discussion:
- In a real GD, you are not prompted after every turn. You must monitor peer discourse, determine when a conversational lull occurs, and assertively jump in.
- In GD Arena, AI debaters disagree, cite, and rebut each other without waiting for the human candidate.
- We implement a room coordinator (`speakerSelector.ts`) that manages conversational turn-taking, peer-to-peer addressing, and an independent moderator persona who manages pacing and round transitions.

### Q2: How do participants interact with each other?
**Answer:** Interaction is governed by a multi-agent orchestration architecture:
- Each participant has a defined persona profile (e.g., Aarav is assertive and outcome-oriented; Meera is analytical and data-driven; Kabir is calm and ethical).
- The discussion controller tracks speaker history, turn objectives (`challenge`, `build`, `synthesize`, `redirect`), and conversational momentum.
- When generating turns, the LLM prompt is injected with the recent transcript history and an XML-isolated instruction identifying the previous speaker and their specific claims.
- The next speaker explicitly references peer debaters by name (e.g., *"While I agree with Meera's points regarding operational costs, Aarav's timeline is overly optimistic..."*).

### Q3: How are interruptions handled?
**Answer:** Interruptions are handled synchronously through our voice and playback state machine:
- When the speech recognition engine detects candidate voice activity while an AI debater is speaking aloud, it emits a speech start event.
- The audio playback service immediately aborts in-flight HTML5/Web Audio playback and clears the queued audio buffer.
- The controller calculates the exact playback elapsed time, truncates the AI turn's `deliveredText` at the sentence boundary that was actually spoken before the interruption, and marks the turn status as `interrupted`.
- Unplayed text is excluded from the room's working context and cannot be cited in the report.

### Q4: How is feedback grounded in the transcript?
**Answer:** We separate objective metrics computation from qualitative evaluation and enforce a code-level verifier:
1. **Deterministic Metrics**: Speaking duration, turn count, first contribution latency, and overlap counts are calculated in pure TypeScript (`metricsCalculator.ts`) from timestamped audio events, completely bypassing the LLM.
2. **Deterministic Evidence Verifier**: The qualitative evaluator must provide exact `turnId` references for any quoted evidence. The server runs `verifyReportEvidence()` (`evidenceVerifier.ts`) which validates that each quote exists as a verbatim substring of `deliveredText`. Fabricated quotes or references to unplayed text are rejected before rendering.
3. **Interactive Traceability**: Every cited quote in the UI links directly to the corresponding turn in the transcript with an auto-scroll and highlight animation.

### Q5: What happens if an API fails?
**Answer:** The architecture is designed with multi-tier, zero-crash fallbacks:
- **LLM Failure**: If the Gemini API key is missing or encounters a quota limit, the session seamlessly switches to our deterministic demo provider (`demoDiscussionProvider.ts`), which continues the discussion using structured debate trees without dropping the user experience.
- **Speech Service Failure**: If the Sarvam WebSocket gateway or cloud TTS is unavailable, the client automatically falls back to the browser's native Web Speech API (`webkitSpeechRecognition` and `speechSynthesis`).
- **Microphone Denial**: If microphone access is blocked or unavailable, the room enables a text input bar and text-based simulated pacing so the full discussion and report remain accessible.
- **Report Generation**: If the Gemini API is unconfigured on the server, the report route automatically generates a deterministic, rule-based coaching assessment (`modelUsed: 'deterministic-rules'`) with 100% verified quotes from student turns.

### Q6: What would you improve next?
**Answer:**
1. **Multi-turn Voice Gateway**: Upgrading the WebSocket audio pipeline to support bidirectional WebRTC streaming to further minimize audio turnaround latency.
2. **Video & Body Language Analysis**: Incorporating webcam feed analysis (via local MediaPipe) to track eye contact, posture, and facial composure during speech.
3. **Adaptive Difficulty & Adversarial Debaters**: Introducing adjustable AI pressure levels, such as an aggressive "interrupter" persona to train candidates specifically on handling high-pressure placement panels.
4. **Institutional LMS Integration**: Building multi-tenant dashboards for college training and placement cells (TPOs) to track cohort progress and identify candidates who need intervention.
