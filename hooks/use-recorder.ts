"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { convertToWav, RecordingError, startRecording, type ActiveRecording } from "@/lib/audio/recording";
import type { Role } from "@/lib/types/conversation";

/** Gnani REST STT rejects audio over 30 s; stop early to leave margin. */
export const MAX_RECORDING_SECONDS = 29;

export type RecorderPhase = "idle" | "starting" | "recording" | "stopping" | "converting";

export function useRecorder(onAudio: (role: Role, wav: Blob) => void) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [activeRole, setActiveRole] = useState<Role | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<{ role: Role; message: string } | null>(null);

  const recording = useRef<ActiveRecording | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onAudioRef = useRef(onAudio);
  useEffect(() => {
    onAudioRef.current = onAudio;
  });

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const start = useCallback(async (role: Role) => {
    if (recording.current) return;
    setError(null);
    setActiveRole(role);
    setSeconds(0);
    setPhase("starting");

    const fail = (err: unknown) => {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const message = err instanceof RecordingError ? err.message : "Recording failed. Please try again.";
        setError({ role, message });
      }
    };
    const reset = () => {
      clearTimer();
      recording.current = null;
      setPhase("idle");
      setActiveRole(null);
    };

    let active: ActiveRecording;
    try {
      active = await startRecording();
    } catch (err) {
      fail(err);
      reset();
      return;
    }
    recording.current = active;
    setPhase("recording");

    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) {
        setPhase("stopping");
        active.stop();
      }
    }, 250);

    try {
      const blob = await active.finished;
      clearTimer();
      setPhase("converting");
      const wav = await convertToWav(blob);
      onAudioRef.current(role, wav);
    } catch (err) {
      fail(err);
    } finally {
      reset();
    }
  }, []);

  const stop = useCallback(() => {
    if (!recording.current) return;
    setPhase("stopping");
    recording.current.stop();
  }, []);

  /** Stops and discards the current recording, if any. */
  const cancel = useCallback(() => {
    recording.current?.cancel();
    setError(null);
  }, []);

  useEffect(
    () => () => {
      clearTimer();
      recording.current?.cancel();
    },
    [],
  );

  return { phase, activeRole, seconds, error, start, stop, cancel };
}
