/**
 * Shared loudness meters for the room UI.
 *
 * Playback services route their sources through `getOutputTap(ctx)` instead of
 * `ctx.destination`, and the mic capture services attach their media source with
 * `attachInputMeter`. The UI polls `readOutputLevel` / `readInputLevel` once per
 * animation frame to drive speaking faces and the mic ring.
 */

const outputTaps = new WeakMap<AudioContext, AnalyserNode>();
const activeOutputTaps = new Set<AnalyserNode>();
let inputAnalyser: AnalyserNode | null = null;
let sampleBuffer = new Float32Array(512);

function createAnalyser(ctx: BaseAudioContext): AnalyserNode {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;
  return analyser;
}

/** RMS loudness of the analyser's current window, normalised to roughly 0..1 */
function readLevel(analyser: AnalyserNode): number {
  if (sampleBuffer.length !== analyser.fftSize) {
    sampleBuffer = new Float32Array(analyser.fftSize);
  }
  analyser.getFloatTimeDomainData(sampleBuffer);
  let sum = 0;
  for (let i = 0; i < sampleBuffer.length; i++) {
    sum += sampleBuffer[i] * sampleBuffer[i];
  }
  const rms = Math.sqrt(sum / sampleBuffer.length);
  return Math.min(1, rms * 5);
}

/** Node to connect playback sources to; it forwards to the speakers. */
export function getOutputTap(ctx: AudioContext): AudioNode {
  let tap = outputTaps.get(ctx);
  if (!tap) {
    tap = createAnalyser(ctx);
    tap.connect(ctx.destination);
    outputTaps.set(ctx, tap);
    activeOutputTaps.add(tap);
  }
  return tap;
}

/** Loudest level across all playback contexts (only one voice plays at a time). */
export function readOutputLevel(): number {
  let level = 0;
  for (const tap of activeOutputTaps) {
    if (tap.context.state === "closed") {
      activeOutputTaps.delete(tap);
      continue;
    }
    level = Math.max(level, readLevel(tap));
  }
  return level;
}

export function attachInputMeter(ctx: AudioContext, source: MediaStreamAudioSourceNode): void {
  detachInputMeter();
  inputAnalyser = createAnalyser(ctx);
  source.connect(inputAnalyser);
}

export function detachInputMeter(): void {
  if (inputAnalyser) {
    try {
      inputAnalyser.disconnect();
    } catch {
      // Already disconnected
    }
    inputAnalyser = null;
  }
}

export function readInputLevel(): number {
  if (!inputAnalyser || inputAnalyser.context.state === "closed") return 0;
  return readLevel(inputAnalyser);
}
