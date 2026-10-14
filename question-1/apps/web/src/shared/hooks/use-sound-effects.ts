import { useCallback, useEffect, useRef, useState } from "react";
import type { SoundCueName } from "../types/game";

const SOUND_PREFERENCE_KEY = "sketch-league:sound-enabled";

type Tone = {
  frequency: number;
  duration: number;
  volume: number;
  delay?: number;
  type?: OscillatorType;
};

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

function playTone(context: AudioContext, tone: Tone): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime + (tone.delay ?? 0);
  const endAt = startAt + tone.duration;

  oscillator.type = tone.type ?? "sine";
  oscillator.frequency.setValueAtTime(tone.frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(tone.volume, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

function playSweep(context: AudioContext, startFrequency: number, endFrequency: number, duration: number, volume: number): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startAt = context.currentTime;
  const endAt = startAt + duration;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(startFrequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, endAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

export type SoundEffects = {
  enabled: boolean;
  toggle: () => void;
  playButton: () => void;
  playDrawing: () => void;
  playCue: (cue: SoundCueName) => void;
};

export function useSoundEffects(): SoundEffects {
  const [enabled, setEnabled] = useState(readSoundPreference);
  const contextRef = useRef<AudioContext | null>(null);
  const lastDrawingSoundAt = useRef(0);

  const getContext = useCallback((): AudioContext | null => {
    if (!enabled || typeof window === "undefined" || !("AudioContext" in window)) return null;
    if (!contextRef.current) {
      try {
        contextRef.current = new AudioContext();
      } catch {
        return null;
      }
    }
    return contextRef.current;
  }, [enabled]);

  const unlock = useCallback((): void => {
    const context = getContext();
    if (context?.state === "suspended") void context.resume();
  }, [getContext]);

  const playButton = useCallback((): void => {
    const context = getContext();
    if (!context) return;
    unlock();
    playTone(context, { frequency: 620, duration: 0.045, volume: 0.024, type: "triangle" });
  }, [getContext, unlock]);

  const playDrawing = useCallback((): void => {
    const now = performance.now();
    if (now - lastDrawingSoundAt.current < 90) return;
    lastDrawingSoundAt.current = now;
    const context = getContext();
    if (!context) return;
    unlock();
    playTone(context, { frequency: 180, duration: 0.035, volume: 0.012, type: "sine" });
  }, [getContext, unlock]);

  const playCue = useCallback((cue: SoundCueName): void => {
    const context = getContext();
    if (!context) return;
    unlock();
    switch (cue) {
      case "correct":
        playTone(context, { frequency: 660, duration: 0.09, volume: 0.045, type: "sine" });
        playTone(context, { frequency: 880, duration: 0.14, volume: 0.05, delay: 0.08, type: "sine" });
        break;
      case "near-miss":
        playSweep(context, 360, 220, 0.16, 0.035);
        break;
      case "disconnect":
        playSweep(context, 250, 135, 0.22, 0.035);
        break;
      case "reconnect":
        playSweep(context, 220, 420, 0.18, 0.032);
        break;
      case "round-start":
        playTone(context, { frequency: 520, duration: 0.08, volume: 0.032, type: "triangle" });
        playTone(context, { frequency: 700, duration: 0.12, volume: 0.038, delay: 0.08, type: "triangle" });
        break;
      case "round-end":
        playTone(context, { frequency: 520, duration: 0.1, volume: 0.03, type: "sine" });
        playTone(context, { frequency: 390, duration: 0.16, volume: 0.028, delay: 0.09, type: "sine" });
        break;
      case "error":
        playTone(context, { frequency: 170, duration: 0.12, volume: 0.03, type: "square" });
        break;
    }
  }, [getContext, unlock]);

  const toggle = useCallback((): void => {
    setEnabled((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SOUND_PREFERENCE_KEY, next ? "on" : "off");
      } catch {
        // Sound preference is best-effort when storage is unavailable.
      }
      if (!next && contextRef.current?.state === "running") void contextRef.current.suspend();
      return next;
    });
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      unlock();
      const target = event.target as Element | null;
      if (target?.closest("button, a")) playButton();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [playButton, unlock]);

  useEffect(() => () => {
    void contextRef.current?.close();
  }, []);

  return { enabled, toggle, playButton, playDrawing, playCue };
}
