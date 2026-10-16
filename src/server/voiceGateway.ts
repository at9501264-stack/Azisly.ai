import http from "node:http";
import { WebSocketServer, WebSocket, RawData } from "ws";
import url from "node:url";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI, Modality } from "@google/genai";

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[VoiceGW] Notice loading ${filePath}:`, msg);
  }
}

function loadEnv() {
  parseEnvFile(path.resolve(process.cwd(), ".env.local"));
  parseEnvFile(path.resolve(process.cwd(), ".env"));
}
loadEnv();

function getSarvamKeyPool(): string[] {
  const pool: string[] = [];
  if (process.env.SARVAM_API_KEYS) {
    const list = process.env.SARVAM_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    pool.push(...list);
  }
  if (process.env.SARVAM_API_KEY) {
    const single = process.env.SARVAM_API_KEY.trim();
    if (single && !pool.includes(single)) {
      pool.unshift(single);
    }
  }
  return Array.from(new Set(pool));
}

function getGeminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

function rawDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString("utf-8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf-8");
  return Buffer.from(data).toString("utf-8");
}

function getRawDataByteLength(message: RawData): number {
  if (Buffer.isBuffer(message)) {
    return message.length;
  }
  if (Array.isArray(message)) {
    return message.reduce((acc, b) => acc + b.length, 0);
  }
  return (message as ArrayBuffer).byteLength;
}

const PORT = Number.parseInt(process.env.VOICE_GATEWAY_PORT || "3001", 10);
const MAX_MESSAGE_BYTES = 64 * 1024; // 64 KB per chunk
const MAX_SESSION_DURATION_MS = 15 * 60 * 1000; // 15 minutes limit per connection

const configuredHosts = process.env.ALLOWED_ORIGIN_HOSTS
  ? process.env.ALLOWED_ORIGIN_HOSTS.split(",").map((h) =>
      h.trim().toLowerCase(),
    )
  : [];
const ALLOWED_ORIGIN_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  ...configuredHosts,
]);

function isOriginAllowed(originHeader?: string): boolean {
  if (!originHeader) return true; // Direct non-browser clients or local test fixtures
  if (ALLOWED_ORIGIN_HOSTS.has("*")) return true; // Explicit wildcard if configured
  try {
    const parsed = new URL(originHeader);
    return ALLOWED_ORIGIN_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || "", true);
  if (parsed.pathname === "/health") {
    const keyPool = getSarvamKeyPool();
    const geminiKey = getGeminiApiKey();
    const origin = req.headers.origin;
    const allowOrigin = isOriginAllowed(origin) ? origin || "*" : "null";
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowOrigin,
    });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "gd-arena-voice-gateway",
        port: PORT,
        s2sConfigured: Boolean(geminiKey),
        s2sModel: process.env.GEMINI_S2S_MODEL || "gemini-3.8-live",
        sarvamConfigured: keyPool.length > 0,
        keysAvailable: keyPool.length,
      }),
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

const wssS2S = new WebSocketServer({ noServer: true });
const wssSTT = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const parsedUrl = url.parse(request.url || "", true);
  const origin = request.headers.origin;

  if (!isOriginAllowed(origin)) {
    console.warn(
      `[VoiceGW] Rejected connection from unauthorized origin: ${origin}`,
    );
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  if (parsedUrl.pathname === "/s2s") {
    wssS2S.handleUpgrade(request, socket, head, (ws) => {
      wssS2S.emit("connection", ws, request);
    });
  } else if (parsedUrl.pathname === "/stt") {
    wssSTT.handleUpgrade(request, socket, head, (ws) => {
      wssSTT.emit("connection", ws, request);
    });
  } else {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  }
});

interface GeminiLiveServerContent {
  modelTurn?: {
    parts?: Array<{
      inlineData?: {
        data?: string;
        mimeType?: string;
      };
    }>;
  };
  outputTranscription?: {
    text?: string;
  };
  inputTranscription?: {
    text?: string;
  };
  interrupted?: boolean;
  turnComplete?: boolean;
}

interface GeminiLiveServerMessage {
  serverContent?: GeminiLiveServerContent;
}

type LiveSession = Awaited<ReturnType<GoogleGenAI["live"]["connect"]>>;

interface ClientControlCommand {
  type: string;
  speakerId?: string;
  speakerName?: string;
  role?: string;
  voiceName?: string;
  instruction?: string;
  text?: string;
}

// ============================================================================
// 1. SPEECH-TO-SPEECH (S2S) LIVE WEBSOCKET HANDLER
// ============================================================================
wssS2S.on(
  "connection",
  async (clientWs: WebSocket, request: http.IncomingMessage) => {
    const parsedUrl = url.parse(request.url || "", true);
    const topic = (parsedUrl.query.topic as string) || "Group Discussion";
    const language = (parsedUrl.query.language as string) || "english";
    const initialSpeakerId =
      (parsedUrl.query.speaker_id as string) || "ai-aarav";
    const initialSpeakerName =
      (parsedUrl.query.speaker_name as string) || "Aarav";
    const initialRole =
      (parsedUrl.query.speaker_role as string) || "ai_participant";
    const initialVoice = (parsedUrl.query.voice_name as string) || "Puck";

    const geminiKey = getGeminiApiKey();
    const sessionTimeout = setTimeout(() => {
      console.log(
        "[VoiceGW:S2S] Session duration limit reached. Closing gracefully.",
      );
      clientWs.close(1000, "Max session duration reached");
    }, MAX_SESSION_DURATION_MS);

    if (!geminiKey) {
      clientWs.send(
        JSON.stringify({
          type: "status",
          ready: false,
          message:
            "GEMINI_API_KEY is not configured on server. Falling back to scripted/browser audio.",
        }),
      );
      clientWs.on("close", () => clearTimeout(sessionTimeout));
      return;
    }

    const s2sModel = process.env.GEMINI_S2S_MODEL || "gemini-3.8-live";
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    let currentSpeakerId = initialSpeakerId;
    let currentSpeakerName = initialSpeakerName;
    let currentRole = initialRole;
    let currentVoice = initialVoice;
    let currentAccumulatedText = "";

    const buildSystemInstruction = (
      spkName: string,
      spkRole: string,
      spkVoice: string,
    ) => {
      return `You are ${spkName}, participating in a real-time collegiate and placement practice Group Discussion (GD) on the topic: "${topic}".
Role: ${spkRole === "moderator" ? "Neutral Moderator (Prof. Sharma) guiding discussions, keeping time, asking for points, ensuring equal turns" : "AI Debater with distinct point of view"}.
Language: ${language === "hinglish" ? "Hinglish (conversational Hindi-English blend in Latin script)" : "Indian English"}.
Voice Persona: ${spkVoice}.

CRITICAL CONVERSATIONAL RULES FOR ULTRA-LOW LATENCY SPEECH-TO-SPEECH:
1. Speak concisely in 1-2 punchy, spoken sentences (maximum 30 words). Never recite paragraphs or long lists.
2. Directly answer or challenge the latest remark from the candidate or peer debaters.
3. Sound conversational, articulate, and natural.
4. If interrupted, stop immediately.`;
    };

    let geminiSession: LiveSession | null = null;
    let isClosed = false;
    // Set while we deliberately replace a session (voice switch) so its close isn't reported as a failure
    let isReplacingSession = false;

    const reportUnavailable = (reason: string) => {
      if (isClosed || clientWs.readyState !== WebSocket.OPEN) return;
      clientWs.send(
        JSON.stringify({ type: "status", ready: false, message: reason }),
      );
    };

    const initSession = async (voiceName: string) => {
      try {
        if (geminiSession) {
          isReplacingSession = true;
          try {
            geminiSession.close();
          } catch {
            // Ignore close error
          }
          geminiSession = null;
        }

        currentVoice = voiceName;
        const instruction = buildSystemInstruction(
          currentSpeakerName,
          currentRole,
          currentVoice,
        );

        geminiSession = await ai.live.connect({
          model: s2sModel,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: currentVoice || "Puck",
                },
              },
            },
            systemInstruction: {
              parts: [{ text: instruction }],
            },
          },
          callbacks: {
            onopen: () => {
              console.log(
                `[VoiceGW:S2S] Connected to Gemini Live S2S (${s2sModel}, voice: ${currentVoice})`,
              );
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: "status",
                    ready: true,
                    message: "Connected to Gemini Live Speech-to-Speech",
                    model: s2sModel,
                    voice: currentVoice,
                    speakerId: currentSpeakerId,
                  }),
                );
              }
            },
            onmessage: (msg: GeminiLiveServerMessage) => {
              if (isClosed || clientWs.readyState !== WebSocket.OPEN) return;
              const serverContent = msg.serverContent;
              if (!serverContent) return;

              // 1. Audio Chunks (Raw 24kHz PCM linear16)
              if (serverContent.modelTurn?.parts) {
                for (const part of serverContent.modelTurn.parts) {
                  if (part.inlineData?.data) {
                    clientWs.send(
                      JSON.stringify({
                        type: "audio_chunk",
                        audio: part.inlineData.data, // base64 string
                        mimeType:
                          part.inlineData.mimeType || "audio/pcm;rate=24000",
                        speakerId: currentSpeakerId,
                        speakerName: currentSpeakerName,
                      }),
                    );
                  }
                }
              }

              // 2. Output Transcription (AI spoken text for captions and report)
              if (serverContent.outputTranscription?.text) {
                const text = serverContent.outputTranscription.text;
                currentAccumulatedText += text;
                clientWs.send(
                  JSON.stringify({
                    type: "output_transcript",
                    text,
                    speakerId: currentSpeakerId,
                    speakerName: currentSpeakerName,
                  }),
                );
              }

              // 3. Input Transcription (Candidate voice transcribed natively by Gemini)
              if (serverContent.inputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({
                    type: "input_transcript",
                    text: serverContent.inputTranscription.text,
                  }),
                );
              }

              // 4. Interruption / Barge-In event
              if (serverContent.interrupted) {
                console.log(
                  `[VoiceGW:S2S] Gemini Live detected interruption on ${currentSpeakerId}`,
                );
                clientWs.send(
                  JSON.stringify({
                    type: "interrupted",
                    speakerId: currentSpeakerId,
                    deliveredText: currentAccumulatedText,
                  }),
                );
                currentAccumulatedText = "";
              }

              // 5. Turn Complete
              if (serverContent.turnComplete) {
                clientWs.send(
                  JSON.stringify({
                    type: "turn_complete",
                    speakerId: currentSpeakerId,
                    deliveredText: currentAccumulatedText,
                  }),
                );
                currentAccumulatedText = "";
              }
            },
            onerror: (err: unknown) => {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.warn("[VoiceGW:S2S] Gemini Live session error:", errMsg);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: "error",
                    message: `S2S error: ${errMsg}`,
                  }),
                );
              }
            },
            onclose: (e: unknown) => {
              const closeInfo =
                e && typeof e === "object" && "reason" in e
                  ? String((e as { reason?: string }).reason)
                  : "normal";
              console.log(
                "[VoiceGW:S2S] Gemini Live session closed:",
                closeInfo,
              );
              if (isReplacingSession) {
                isReplacingSession = false;
                return;
              }
              // Unexpected close (quota, auth, network): tell the client so it can fall back
              if (closeInfo && closeInfo !== "normal") {
                reportUnavailable(closeInfo);
              }
            },
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          "[VoiceGW:S2S] Failed to initialize Gemini Live session:",
          msg,
        );
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: "status",
              ready: false,
              message: `Failed to connect S2S model: ${msg}`,
            }),
          );
        }
      }
    };

    await initSession(initialVoice);

    const processControlCommand = async (cmd: ClientControlCommand) => {
      if (cmd.type === "trigger_turn") {
        currentSpeakerId = cmd.speakerId || currentSpeakerId;
        currentSpeakerName = cmd.speakerName || currentSpeakerName;
        currentRole = cmd.role || currentRole;
        currentAccumulatedText = "";

        const targetVoice = cmd.voiceName || currentVoice;
        if (targetVoice !== currentVoice) {
          await initSession(targetVoice);
        }

        const promptText =
          cmd.instruction ||
          `[Turn for ${currentSpeakerName} (${currentRole})]: Please deliver a 1-2 sentence contribution on the topic "${topic}". Respond concisely and directly to what was said earlier.`;

        if (!geminiSession) {
          reportUnavailable("Live voice session is not available.");
          return;
        }
        geminiSession.sendRealtimeInput({ text: promptText });
      } else if (
        cmd.type === "switch_voice" &&
        cmd.voiceName &&
        cmd.voiceName !== currentVoice
      ) {
        await initSession(cmd.voiceName);
      }
    };

    // Handle messages from client
    clientWs.on("message", async (data: RawData, isBinary: boolean) => {
      const byteLength = getRawDataByteLength(data);
      if (byteLength > MAX_MESSAGE_BYTES) {
        console.warn(
          `[VoiceGW:S2S] Discarded oversized message: ${byteLength} bytes`,
        );
        return;
      }

      if (isBinary) {
        // Candidate speech is transcribed client-side; ignore stray audio frames
        return;
      }

      try {
        const cmd: ClientControlCommand = JSON.parse(rawDataToString(data));
        await processControlCommand(cmd);
      } catch {
        // Non-JSON string, ignore
      }
    });

    const cleanup = () => {
      isClosed = true;
      clearTimeout(sessionTimeout);
      if (geminiSession) {
        try {
          geminiSession.close();
        } catch {
          // Ignore
        }
        geminiSession = null;
      }
    };

    clientWs.on("close", cleanup);
    clientWs.on("error", cleanup);
  },
);

// ============================================================================
// 2. LEGACY / FALLBACK SARVAM REALTIME STT WEBSOCKET HANDLER
// ============================================================================
wssSTT.on(
  "connection",
  (clientWs: WebSocket, request: http.IncomingMessage) => {
    const parsedUrl = url.parse(request.url || "", true);
    const languageCode = (parsedUrl.query.language_code as string) || "en-IN";
    const model = (parsedUrl.query.model as string) || "saaras:v4";

    const keyPool = getSarvamKeyPool();
    const sessionTimeout = setTimeout(() => {
      console.log(
        "[VoiceGW:STT] Session duration limit reached. Closing gracefully.",
      );
      clientWs.close(1000, "Max session duration reached");
    }, MAX_SESSION_DURATION_MS);

    if (keyPool.length === 0) {
      clientWs.send(
        JSON.stringify({
          type: "status",
          ready: false,
          message:
            "SARVAM_API_KEY is not configured on the server. Falling back to browser Web Speech API.",
        }),
      );
      clientWs.on("close", () => clearTimeout(sessionTimeout));
      return;
    }

    const upstreamUrl = `wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=${encodeURIComponent(
      languageCode,
    )}&model=${encodeURIComponent(model)}`;

    let upstreamWs: WebSocket | null = null;
    let activeKeyIndex = 0;

    const tryConnectUpstream = (keyIndex: number) => {
      if (keyIndex >= keyPool.length) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: "status",
              ready: false,
              message:
                "All Sarvam keys failed or expired quota. Falling back to browser Web Speech.",
            }),
          );
        }
        return;
      }

      activeKeyIndex = keyIndex;
      const currentKey = keyPool[keyIndex];
      let didOpen = false;

      try {
        upstreamWs = new WebSocket(upstreamUrl, {
          headers: {
            "api-subscription-key": currentKey,
          },
        });

        upstreamWs.on("open", () => {
          didOpen = true;
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: "status",
                ready: true,
                message: "Connected to Sarvam Realtime STT",
                model,
                languageCode,
              }),
            );
          }
        });

        upstreamWs.on("message", (data: RawData) => {
          const text = rawDataToString(data);
          try {
            const parsed = JSON.parse(text);
            const textContent =
              parsed.text ||
              parsed.transcript ||
              parsed.data?.transcript ||
              parsed.data?.text ||
              "";

            const isFinal =
              parsed.event === "transcript.final" ||
              parsed.type === "final" ||
              (parsed.type === "data" && !parsed.is_partial);

            const isPartial =
              parsed.event === "transcript.partial" ||
              parsed.type === "partial" ||
              (parsed.type === "data" && parsed.is_partial);

            if (isFinal && textContent) {
              clientWs.send(
                JSON.stringify({
                  type: "final",
                  transcript: textContent,
                  metrics: parsed.metrics || parsed.data?.metrics,
                }),
              );
            } else if (isPartial && textContent) {
              clientWs.send(
                JSON.stringify({
                  type: "partial",
                  transcript: textContent,
                }),
              );
            } else {
              clientWs.send(text);
            }
          } catch {
            clientWs.send(text);
          }
        });

        upstreamWs.on("error", (err) => {
          console.warn(
            `[VoiceGW:STT] Upstream Sarvam WebSocket error with key #${keyIndex + 1}:`,
            err.message,
          );
          if (!didOpen && activeKeyIndex + 1 < keyPool.length) {
            tryConnectUpstream(activeKeyIndex + 1);
          } else if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: "error",
                message: `Sarvam upstream error: ${err.message}`,
              }),
            );
          }
        });

        upstreamWs.on("close", (code, reason) => {
          if (!didOpen && activeKeyIndex + 1 < keyPool.length) {
            tryConnectUpstream(activeKeyIndex + 1);
            return;
          }

          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(
              JSON.stringify({
                type: "upstream_closed",
                code,
                reason: reason.toString(),
              }),
            );
            clientWs.close();
          }
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (keyIndex + 1 < keyPool.length) {
          tryConnectUpstream(keyIndex + 1);
        } else if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: "error",
              message: `Failed to connect upstream: ${msg}`,
            }),
          );
        }
      }
    };

    tryConnectUpstream(0);

    clientWs.on("message", (message: RawData, isBinary: boolean) => {
      const byteLength = getRawDataByteLength(message);
      if (byteLength > MAX_MESSAGE_BYTES) return;

      if (upstreamWs?.readyState === WebSocket.OPEN) {
        if (isBinary) {
          upstreamWs.send(message, { binary: true });
        } else {
          const str = rawDataToString(message);
          try {
            const parsed = JSON.parse(str);
            const base64Audio = parsed.audio || parsed.data;
            if (base64Audio && typeof base64Audio === "string") {
              const buf = Buffer.from(base64Audio, "base64");
              upstreamWs.send(buf, { binary: true });
              return;
            }
          } catch {
            // Pass through
          }
          upstreamWs.send(message, { binary: false });
        }
      }
    });

    const cleanup = () => {
      clearTimeout(sessionTimeout);
      if (upstreamWs) {
        try {
          upstreamWs.removeAllListeners();
          upstreamWs.close();
        } catch {
          // Ignore
        }
        upstreamWs = null;
      }
    };

    clientWs.on("close", cleanup);
    clientWs.on("error", cleanup);
  },
);

server.listen(PORT, () => {
  console.log(`[GD Arena Voice Gateway] Listening on http://localhost:${PORT}`);
  console.log(
    `  -> Speech-to-Speech (Gemini 3.8 Live): ws://localhost:${PORT}/s2s`,
  );
  console.log(
    `  -> Speech-to-Text (Sarvam Realtime):   ws://localhost:${PORT}/stt`,
  );
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
