'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, AlertCircle, Headphones, CheckCircle2, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { audioPlaybackService } from '@/services/audio/audioPlaybackService';

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
  onSwitchToTextMode
}: AudioPreflightModalProps) {
  const [permissionState, setPermissionState] = useState<'prompt' | 'requesting' | 'granted' | 'denied' | 'error' | 'unsupported'>('prompt');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string>('Default Microphone');
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
      try {
        audioContextRef.current.close();
      } catch {
        // Ignore
      }
      audioContextRef.current = null;
    }
    setVolumeLevel(0);
  }, []);

  const requestMicrophoneAccess = async () => {
    cleanupAudio();
    setPermissionState('requesting');
    setErrorMessage(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPermissionState('unsupported');
      setErrorMessage('Your browser does not support standard microphone media capture.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        setDeviceName(audioTrack.label || 'Default Microphone');
      }

      // AudioContext analyser for volume meter
      const audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        // Normalize to 0-100 range with sensitivity boost
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setVolumeLevel(normalized);

        animationFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
      setPermissionState('granted');

      // Auto-unlock audio playback
      await audioPlaybackService.unlockAudio();
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      console.warn('Microphone access rejected:', error);

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionState('denied');
        setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser address bar.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermissionState('error');
        setErrorMessage('No microphone device found on this system.');
      } else {
        setPermissionState('error');
        setErrorMessage(`Microphone error: ${error.message || 'Unknown device error'}`);
      }
    }
  };

  const handleTestTone = async () => {
    setIsTestTonePlaying(true);
    await audioPlaybackService.unlockAudio();

    try {
      const audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
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
    setPermissionState('prompt');
    setErrorMessage(null);
    onClose();
  };

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-[#0b1222] border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col text-slate-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Audio & Voice Preflight</h3>
              <p className="text-xs text-slate-400">Verify your microphone and speakers before practice</p>
            </div>
          </div>
          <button
            onClick={handleCancelModal}
            className="text-slate-400 hover:text-white text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          >
            Cancel
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Disclosure Card */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 text-teal-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
              <span>Voice Processing Disclosure</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Your audio will be streamed in real-time to speech recognition services for live transcription.
              No raw audio recordings are permanently stored or shared.
            </p>
            <div className="flex items-center gap-2 text-amber-300/90 pt-1 border-t border-slate-800/80">
              <Headphones className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Recommended: Wear headphones to prevent AI voice loopback.</span>
            </div>
          </div>

          {/* Microphone Test Area */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                {permissionState === 'granted' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <MicOff className="w-4 h-4 text-slate-400" />
                )}
                <span>Microphone Status</span>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                {permissionState === 'granted' ? 'Connected' : permissionState}
              </span>
            </div>

            {permissionState === 'prompt' && (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-slate-400">
                  Click below to grant temporary microphone access.
                </p>
                <button
                  onClick={requestMicrophoneAccess}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-teal-900/30 transition flex items-center gap-2 mx-auto"
                >
                  <Mic className="w-4 h-4" />
                  Grant & Test Microphone
                </button>
              </div>
            )}

            {permissionState === 'requesting' && (
              <div className="text-center py-4 text-xs text-teal-400 animate-pulse">
                Requesting microphone permission from browser...
              </div>
            )}

            {permissionState === 'granted' && (
              <div className="space-y-3">
                <div className="text-xs text-slate-400 truncate">
                  Device: <span className="text-slate-200">{deviceName}</span>
                </div>

                {/* Live VU Volume Meter */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Input Level (Speak to test)</span>
                    <span className="font-mono">{volumeLevel}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        volumeLevel > 70
                          ? 'bg-rose-500'
                          : volumeLevel > 20
                          ? 'bg-teal-400'
                          : 'bg-emerald-500/60'
                      }`}
                      style={{ width: `${Math.max(4, volumeLevel)}%` }}
                    />
                  </div>
                </div>

                {/* Speaker Audio Test */}
                <div className="pt-2 flex items-center justify-between border-t border-slate-900 text-xs">
                  <span className="text-slate-400">Browser Audio Output</span>
                  <button
                    onClick={handleTestTone}
                    disabled={isTestTonePlaying}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                    <span>{isTestTonePlaying ? 'Playing chime...' : 'Play Test Tone'}</span>
                  </button>
                </div>
              </div>
            )}

            {(permissionState === 'denied' || permissionState === 'error' || permissionState === 'unsupported') && (
              <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded-xl text-xs text-rose-300 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMessage || 'Microphone error occurred.'}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={requestMicrophoneAccess}
                    className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-900 text-rose-100 rounded-lg transition"
                  >
                    Retry Permission
                  </button>
                  <button
                    onClick={() => {
                      cleanupAudio();
                      onSwitchToTextMode();
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
                  >
                    Switch to Text Mode
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900/40 border-t border-slate-800/80 flex items-center justify-between">
          <button
            onClick={() => {
              cleanupAudio();
              onSwitchToTextMode();
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4"
          >
            Continue in Text Mode instead
          </button>

          <button
            onClick={() => {
              cleanupAudio();
              onConfirmVoiceMode();
            }}
            disabled={permissionState !== 'granted'}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:hover:bg-teal-600 text-white font-medium text-sm rounded-xl shadow-lg shadow-teal-900/30 transition flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Enter Discussion Room</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
