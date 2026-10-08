import http from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import url from 'url';

const PORT = parseInt(process.env.VOICE_GATEWAY_PORT || '3001', 10);
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
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'gd-arena-voice-gateway',
        port: PORT,
        sarvamConfigured: Boolean(process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY.trim().length > 0)
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

  const sarvamKey = process.env.SARVAM_API_KEY?.trim();

  // Safety timer to bound connection duration
  const sessionTimeout = setTimeout(() => {
    console.log('[VoiceGW] Session duration limit reached. Closing gracefully.');
    clientWs.close(1000, 'Max session duration reached');
  }, MAX_SESSION_DURATION_MS);

  if (!sarvamKey) {
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

  // Connect to upstream Sarvam Realtime WebSocket
  const upstreamUrl = `wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=${encodeURIComponent(
    languageCode
  )}&model=${encodeURIComponent(model)}`;

  let upstreamWs: WebSocket | null = null;

  try {
    upstreamWs = new WebSocket(upstreamUrl, {
      headers: {
        'api-subscription-key': sarvamKey
      }
    });

    upstreamWs.on('open', () => {
      clientWs.send(
        JSON.stringify({
          type: 'status',
          ready: true,
          message: 'Connected to Sarvam Realtime STT',
          model,
          languageCode
        })
      );
    });

    upstreamWs.on('message', (data: RawData) => {
      try {
        const text = data.toString('utf-8');
        const parsed = JSON.parse(text);

        // Normalize Sarvam realtime transcription events
        if (parsed.type === 'data' && parsed.data?.transcript) {
          clientWs.send(
            JSON.stringify({
              type: 'final',
              transcript: parsed.data.transcript,
              metrics: parsed.data.metrics
            })
          );
        } else if (parsed.event === 'transcript.partial' || parsed.type === 'partial') {
          clientWs.send(
            JSON.stringify({
              type: 'partial',
              transcript: parsed.transcript || parsed.data?.transcript || ''
            })
          );
        } else {
          // Pass-through other events
          clientWs.send(text);
        }
      } catch {
        // Fallback pass-through if unparsed
        clientWs.send(data.toString('utf-8'));
      }
    });

    upstreamWs.on('error', (err) => {
      console.error('[VoiceGW] Upstream Sarvam WebSocket error:', err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message: `Sarvam upstream error: ${err.message}`
          })
        );
      }
    });

    upstreamWs.on('close', (code, reason) => {
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
    console.error('[VoiceGW] Failed to initialize upstream connection:', msg);
    clientWs.send(
      JSON.stringify({
        type: 'error',
        message: `Failed to connect upstream: ${msg}`
      })
    );
  }

  // Handle client messages (forwarding audio chunks)
  clientWs.on('message', (message: RawData) => {
    const byteLength = Buffer.isBuffer(message)
      ? message.length
      : Array.isArray(message)
      ? message.reduce((acc, b) => acc + b.length, 0)
      : (message as ArrayBuffer).byteLength;

    if (byteLength > MAX_MESSAGE_BYTES) {
      console.warn(`[VoiceGW] Discarded oversized message: ${byteLength} bytes`);
      return;
    }

    if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(message);
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
