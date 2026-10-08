import http from 'node:http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import url from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
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
  parseEnvFile(path.resolve(process.cwd(), '.env.local'));
  parseEnvFile(path.resolve(process.cwd(), '.env'));
}
loadEnv();

function getSarvamKeyPool(): string[] {
  const pool: string[] = [];
  if (process.env.SARVAM_API_KEYS) {
    const list = process.env.SARVAM_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
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

function rawDataToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf-8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf-8');
  return Buffer.from(data).toString('utf-8');
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

const PORT = Number.parseInt(process.env.VOICE_GATEWAY_PORT || '3001', 10);
const MAX_MESSAGE_BYTES = 64 * 1024; // 64 KB per chunk
const MAX_SESSION_DURATION_MS = 15 * 60 * 1000; // 15 minutes limit per connection

const configuredHosts = process.env.ALLOWED_ORIGIN_HOSTS
  ? process.env.ALLOWED_ORIGIN_HOSTS.split(',').map((h) => h.trim().toLowerCase())
  : [];
const ALLOWED_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', ...configuredHosts]);

function isOriginAllowed(originHeader?: string): boolean {
  if (!originHeader) return true; // Direct non-browser clients or local test fixtures
  if (ALLOWED_ORIGIN_HOSTS.has('*')) return true; // Explicit wildcard if configured
  try {
    const parsed = new URL(originHeader);
    return ALLOWED_ORIGIN_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '', true);
  if (parsed.pathname === '/health') {
    const keyPool = getSarvamKeyPool();
    const origin = req.headers.origin;
    const allowOrigin = isOriginAllowed(origin) ? (origin || '*') : 'null';
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': allowOrigin });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'gd-arena-voice-gateway',
        port: PORT,
        sarvamConfigured: keyPool.length > 0,
        keysAvailable: keyPool.length
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});


const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const parsedUrl = url.parse(request.url || '', true);
  const origin = request.headers.origin;

  if (!isOriginAllowed(origin)) {
    console.warn(`[VoiceGW] Rejected connection from unauthorized origin: ${origin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  if (parsedUrl.pathname === '/stt') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

wss.on('connection', (clientWs: WebSocket, request: http.IncomingMessage) => {
  const parsedUrl = url.parse(request.url || '', true);
  const languageCode = (parsedUrl.query.language_code as string) || 'en-IN';
  const model = (parsedUrl.query.model as string) || 'saaras:v4';

  const keyPool = getSarvamKeyPool();

  // Safety timer to bound connection duration
  const sessionTimeout = setTimeout(() => {
    console.log('[VoiceGW] Session duration limit reached. Closing gracefully.');
    clientWs.close(1000, 'Max session duration reached');
  }, MAX_SESSION_DURATION_MS);

  if (keyPool.length === 0) {
    clientWs.send(
      JSON.stringify({
        type: 'status',
        ready: false,
        message: 'SARVAM_API_KEY is not configured on the server. Falling back to browser Web Speech API.'
      })
    );

    clientWs.on('close', () => clearTimeout(sessionTimeout));
    return;
  }

  // Connect to upstream Sarvam Realtime WebSocket with key fallback
  const upstreamUrl = `wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=${encodeURIComponent(
    languageCode
  )}&model=${encodeURIComponent(model)}`;

  let upstreamWs: WebSocket | null = null;
  let activeKeyIndex = 0;

  const tryConnectUpstream = (keyIndex: number) => {
    if (keyIndex >= keyPool.length) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'status',
            ready: false,
            message: 'All Sarvam keys failed or expired quota. Falling back to browser Web Speech.'
          })
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
          'api-subscription-key': currentKey
        }
      });

      upstreamWs.on('open', () => {
        didOpen = true;
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'status',
              ready: true,
              message: 'Connected to Sarvam Realtime STT',
              model,
              languageCode
            })
          );
        }
      });

      upstreamWs.on('message', (data: RawData) => {
        const text = rawDataToString(data);
        try {
          const parsed = JSON.parse(text);

          // Normalize Sarvam realtime transcription events
          const textContent =
            parsed.text ||
            parsed.transcript ||
            parsed.data?.transcript ||
            parsed.data?.text ||
            '';

          const isFinal =
            parsed.event === 'transcript.final' ||
            parsed.type === 'final' ||
            (parsed.type === 'data' && !parsed.is_partial);

          const isPartial =
            parsed.event === 'transcript.partial' ||
            parsed.type === 'partial' ||
            (parsed.type === 'data' && parsed.is_partial);

          if (isFinal && textContent) {
            clientWs.send(
              JSON.stringify({
                type: 'final',
                transcript: textContent,
                metrics: parsed.metrics || parsed.data?.metrics
              })
            );
          } else if (isPartial && textContent) {
            clientWs.send(
              JSON.stringify({
                type: 'partial',
                transcript: textContent
              })
            );
          } else {
            // Pass-through other events
            clientWs.send(text);
          }

        } catch {
          // Fallback pass-through if unparsed
          clientWs.send(text);
        }
      });

      upstreamWs.on('error', (err) => {
        console.warn(`[VoiceGW] Upstream Sarvam WebSocket error with key #${keyIndex + 1}:`, err.message);
        if (!didOpen && activeKeyIndex + 1 < keyPool.length) {
          console.log(`[VoiceGW] Retrying upstream with fallback key #${activeKeyIndex + 2}...`);
          tryConnectUpstream(activeKeyIndex + 1);
        } else if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'error',
              message: `Sarvam upstream error: ${err.message}`
            })
          );
        }
      });

      upstreamWs.on('close', (code, reason) => {
        if (!didOpen && activeKeyIndex + 1 < keyPool.length) {
          console.log(`[VoiceGW] Upstream closed early (${code}: ${reason.toString()}). Retrying with key #${activeKeyIndex + 2}...`);
          tryConnectUpstream(activeKeyIndex + 1);
          return;
        }

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'upstream_closed',
              code,
              reason: reason.toString()
            })
          );
          clientWs.close();
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[VoiceGW] Failed to initialize upstream key #${keyIndex + 1}:`, msg);
      if (keyIndex + 1 < keyPool.length) {
        tryConnectUpstream(keyIndex + 1);
      } else if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message: `Failed to connect upstream: ${msg}`
          })
        );
      }
    }
  };

  tryConnectUpstream(0);

  // Handle client messages (forwarding audio chunks)
  clientWs.on('message', (message: RawData, isBinary: boolean) => {
    const byteLength = getRawDataByteLength(message);

    if (byteLength > MAX_MESSAGE_BYTES) {
      console.warn(`[VoiceGW] Discarded oversized message: ${byteLength} bytes`);
      return;
    }

    if (upstreamWs?.readyState === WebSocket.OPEN) {
      if (isBinary) {
        upstreamWs.send(message, { binary: true });
      } else {
        // If client sent JSON with audio base64, decode to binary linear16 PCM
        const str = rawDataToString(message);
        try {
          const parsed = JSON.parse(str);
          const base64Audio = parsed.audio || parsed.data;
          if (base64Audio && typeof base64Audio === 'string') {
            const buf = Buffer.from(base64Audio, 'base64');
            upstreamWs.send(buf, { binary: true });
            return;
          }
        } catch {
          // Not JSON, pass through as text
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
        // Ignore close error
      }
      upstreamWs = null;
    }
  };

  clientWs.on('close', cleanup);
  clientWs.on('error', cleanup);
});

server.listen(PORT, () => {
  console.log(`[GD Arena Voice Gateway] Listening on http://localhost:${PORT} and ws://localhost:${PORT}/stt`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
