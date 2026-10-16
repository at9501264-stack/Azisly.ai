"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Volume2,
  AlertCircle,
  Headphones,
  CheckCircle2,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { audioPlaybackService } from "@/services/audio/audioPlaybackService";
import { pcmAudioPlayer } from "@/services/audio/pcmAudioPlayer";

interface AudioPreflightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmVoiceMode: () => void;
  onSwitchToTextMode: () => void;
}

export function AudioPreflightModal({
  isOpen,
  onClose,
  onConfirmVoiceMode,
  onSwitchToTextMode,
}: Readonly<AudioPreflightModalProps>) {
  const [permissionState, setPermissionState] = useState<
    "prompt" | "requesting" | "granted" | "denied" | "error" | "unsupported"
  >("prompt");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>("Default Microphone");
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [isTestTonePlaying, setIsTestTonePlaying] = useState<boolean>(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const cleanupAudio = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setVolumeLevel(0);
  }, []);

  const requestMicrophoneAccess = useCallback(async () => {
    cleanupAudio();
    setPermissionState("requesting");
    setErrorMessage(null);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setPermissionState("unsupported");
      setErrorMessage(
        "Your browser does not support standard microphone media capture.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        setDeviceName(audioTrack.label || "Default Microphone");
      }

      // AudioContext analyser for volume meter
      const audioCtx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (const val of dataArray) {
          sum += val;
        }
        const avg = sum / dataArray.length;
        // Normalize to 0-100 range with sensitivity boost
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setVolumeLevel(normalized);

        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
      setPermissionState("granted");

      // Auto-unlock audio playback
      await audioPlaybackService.unlockAudio();
      await pcmAudioPlayer.unlock();
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      console.warn("Microphone access rejected:", error);

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        setPermissionState("denied");
        setErrorMessage(
          "Microphone access was denied. Please allow microphone permissions in your browser address bar.",
        );
      } else if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        setPermissionState("error");
        setErrorMessage("No microphone device found on this system.");
      } else {
        setPermissionState("error");
        setErrorMessage(
          `Microphone error: ${error.message || "Unknown device error"}`,
        );
      }
    }
  }, [cleanupAudio]);

  const handleTestTone = async () => {
    setIsTestTonePlaying(true);
    await audioPlaybackService.unlockAudio();
    await pcmAudioPlayer.unlock();

    try {
      const audioCtx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // 440 Hz (A4)
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);

      setTimeout(() => {
        setIsTestTonePlaying(false);
      }, 500);
    } catch {
      setIsTestTonePlaying(false);
    }
  };

  const handleCancelModal = () => {
    cleanupAudio();
    setPermissionState("prompt");
    setErrorMessage(null);
    onClose();
  };

  useEffect(() => {
    let active = true;
    if (isOpen && permissionState === "prompt") {
      const timer = setTimeout(() => {
        if (active) {
          void requestMicrophoneAccess();
        }
      }, 100);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
  }, [isOpen, permissionState, requestMicrophoneAccess]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Close on Escape while open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancelModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!isOpen) return null;

  const isGranted = permissionState === "granted";
  const hasError =
    permissionState === "denied" ||
    permissionState === "error" ||
    permissionState === "unsupported";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={handleCancelModal}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preflight-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg animate-fade-up flex-col overflow-hidden rounded-xl border border-hair bg-card font-body text-ink shadow-[0_24px_60px_-20px_rgba(26,26,23,0.45)]"
      >
        {/* Header */}
        <div className="border-b border-hair px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest text-paper">
                <Mic className="h-5 w-5" />
              </span>
              <div>
                <h3 id="preflight-title" className="font-serif text-xl font-semibold">
                  Check your mic &amp; speakers
                </h3>
                <p className="text-sm text-muted">
                  A quick check before you enter the room
                </p>
              </div>
            </div>
            <button
              onClick={handleCancelModal}
              aria-label="Cancel"
              className="cursor-pointer rounded-lg border border-hair px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="space-y-4 p-6">
          {/* Microphone test */}
          <div className="rounded-lg border border-hair bg-paper p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {isGranted ? (
                  <CheckCircle2 className="h-4 w-4 text-forest" />
                ) : (
                  <MicOff className="h-4 w-4 text-muted" />
                )}
                Microphone
              </span>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                  isGranted ? "bg-forest-soft text-forest" : hasError ? "bg-[#f3ddd8] text-danger" : "bg-paper-2 text-muted"
                }`}
              >
                {isGranted ? "Connected" : permissionState}
              </span>
            </div>

            {permissionState === "prompt" && (
              <div className="space-y-3 py-4 text-center">
                <p className="text-xs text-muted">Allow microphone access to test your input level.</p>
                <button
                  onClick={requestMicrophoneAccess}
                  className="mx-auto flex cursor-pointer items-center gap-2 rounded-lg bg-forest px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-forest-hover"
                >
                  <Mic className="h-4 w-4" />
                  Allow &amp; test microphone
                </button>
              </div>
            )}

            {permissionState === "requesting" && (
              <p className="animate-pulse py-4 text-center text-xs text-muted">
                Waiting for microphone permission…
              </p>
            )}

            {isGranted && (
              <div className="mt-3 space-y-3">
                <p className="truncate text-xs text-muted">
                  Device: <span className="font-medium text-ink">{deviceName}</span>
                </p>

                {/* Live level meter */}
                <div>
                  <div className="mb-1.5 flex justify-between text-[11px] text-muted">
                    <span>Say something to test</span>
                    <span className="font-mono tabular-nums">{volumeLevel}%</span>
                  </div>
                  <div className="flex h-8 items-end gap-[3px]" aria-hidden="true">
                    {Array.from({ length: 28 }, (_, i) => {
                      const threshold = ((i + 1) / 28) * 100;
                      const lit = volumeLevel >= threshold;
                      return (
                        <span
                          key={i}
                          className="flex-1 rounded-sm transition-colors duration-75"
                          style={{
                            height: `${30 + (i / 28) * 70}%`,
                            background: lit ? (threshold > 85 ? "#e3a13b" : "#1e3a2f") : "#e2dccf",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Speaker test */}
                <div className="flex items-center justify-between border-t border-hair pt-3 text-xs">
                  <span className="text-muted">Speakers</span>
                  <button
                    onClick={handleTestTone}
                    disabled={isTestTonePlaying}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-hair bg-card px-3 py-1.5 font-medium transition-colors hover:border-forest hover:text-forest disabled:opacity-60"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    {isTestTonePlaying ? "Playing…" : "Play test tone"}
                  </button>
                </div>
              </div>
            )}

            {hasError && (
              <div className="mt-3 space-y-2 rounded-lg border border-danger/20 bg-[#f3ddd8]/50 p-3 text-sm">
                <p className="flex items-start gap-2 text-ink">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                  {errorMessage || "Microphone error occurred."}
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={requestMicrophoneAccess}
                    className="cursor-pointer rounded-lg bg-forest px-3 py-1.5 font-medium text-paper"
                  >
                    Try again
                  </button>
                  <button
                    onClick={() => {
                      cleanupAudio();
                      onSwitchToTextMode();
                    }}
                    className="cursor-pointer rounded-lg border border-hair bg-card px-3 py-1.5 font-medium"
                  >
                    Use text mode
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Privacy + tips */}
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
              Your voice is transcribed live. Raw audio is never stored.
            </li>
            <li className="flex items-start gap-2.5">
              <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
              Wear headphones so the panel&apos;s voices don&apos;t echo into your mic.
            </li>
          </ul>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-hair px-6 py-4">
          <button
            onClick={() => {
              cleanupAudio();
              onSwitchToTextMode();
            }}
            className="cursor-pointer text-sm text-muted underline underline-offset-4 hover:text-ink"
          >
            Use text mode instead
          </button>
          <button
            onClick={async () => {
              await audioPlaybackService.unlockAudio();
              if (permissionState === "prompt") {
                await requestMicrophoneAccess();
              }
              cleanupAudio();
              onConfirmVoiceMode();
            }}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-marigold px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-[#d6942f]"
          >
            Enter the room
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
