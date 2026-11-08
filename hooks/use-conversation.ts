"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { publicErrorFrom, streamPipeline } from "@/lib/api-client";
import { DEMO_TURNS } from "@/lib/demo";
import type { LanguageCode } from "@/lib/languages";
import type { Role, ServiceId, Turn } from "@/lib/types/conversation";

export function base64ToUrl(base64: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/** 0.05 s of silence as a WAV data URI, used to unlock audio playback inside a tap. */
const SILENT_WAV = (() => {
  if (typeof btoa === "undefined") return "";
  const samples = 400;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
})();

/** What the single shared audio element is doing, keyed by the clip's owner id. */
export interface Playback {
  id: string;
  status: "loading" | "playing" | "paused";
}

export function useConversation() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [playbackError, setPlaybackError] = useState<{ id: string; message: string } | null>(null);
  /** Outcome of the latest real call to each service in this session. */
  const [serviceResults, setServiceResults] = useState<Partial<Record<ServiceId, boolean>>>({});

  const abort = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef<string[]>([]);

  const patch = useCallback((id: string, changes: Partial<Turn>) => {
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...changes } : t)));
  }, []);

  const stopAudio = useCallback(() => {
    if (audio.current) {
      audio.current.onpause = null;
      audio.current.pause();
    }
    setPlayback(null);
  }, []);

  /** Plays a clip from the start. One clip plays at a time. */
  const play = useCallback(async (id: string, url: string) => {
    audio.current ??= new Audio();
    const el = audio.current;
    el.onpause = null;
    el.pause();
    el.src = url;
    el.onplaying = () => setPlayback({ id, status: "playing" });
    el.onpause = () => {
      if (!el.ended) setPlayback({ id, status: "paused" });
    };
    el.onended = () => setPlayback(null);
    el.onerror = () => {
      setPlayback(null);
      setPlaybackError({ id, message: "This audio could not be played." });
    };
    setPlaybackError(null);
    setPlayback({ id, status: "loading" });
    try {
      await el.play();
    } catch (err) {
      setPlayback(null);
      // Browsers can block sound that does not directly follow a tap.
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPlaybackError({ id, message: "Your browser blocked autoplay. Tap Play to hear it." });
      }
    }
  }, []);

  /**
   * Phones (iOS Safari especially) only let an audio element play after it has
   * been started inside a tap. The translated clip arrives seconds after the tap,
   * so start the shared element once, silently, while the tap is still active.
   */
  const unlocked = useRef(false);
  const unlockAudio = useCallback(() => {
    if (unlocked.current) return;
    unlocked.current = true;
    audio.current ??= new Audio();
    const el = audio.current;
    el.src = SILENT_WAV;
    void el.play().then(
      () => el.pause(),
      () => {
        unlocked.current = false;
      },
    );
  }, []);

  /** Play, pause or resume the clip for `id`. */
  const toggle = useCallback(
    (id: string, url: string) => {
      const el = audio.current;
      if (playback?.id === id && el) {
        if (playback.status === "paused") void el.play();
        else el.pause();
        return;
      }
      void play(id, url);
    },
    [playback, play],
  );

  /** Runs the pipeline for a turn, resuming after whichever steps it already has. */
  const run = useCallback(
    async (turn: Turn) => {
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      stopAudio();
      patch(turn.id, { status: "processing", stage: undefined, error: undefined });

      try {
        await streamPipeline(
          { source: turn.source, target: turn.target, wav: turn.wav, transcript: turn.transcript, translation: turn.translation },
          (event) => {
            switch (event.type) {
              case "stage":
                patch(turn.id, { stage: event.stage });
                break;
              case "transcript":
                patch(turn.id, { transcript: event.text });
                setServiceResults((r) => ({ ...r, stt: true }));
                break;
              case "translation":
                patch(turn.id, { translation: event.text });
                setServiceResults((r) => ({ ...r, translate: true }));
                break;
              case "audio": {
                const url = base64ToUrl(event.base64, event.mimeType);
                urls.current.push(url);
                patch(turn.id, { audioUrl: url });
                setServiceResults((r) => ({ ...r, tts: true }));
                void play(turn.id, url);
                break;
              }
              case "error":
                patch(turn.id, { status: "error", stage: undefined, error: { ...event.error, stage: event.stage } });
                // A blank recording says nothing about whether the service works.
                if (!["NO_SPEECH", "EMPTY_AUDIO", "UNSUPPORTED_AUDIO", "AUDIO_TOO_LONG"].includes(event.error.code)) {
                  setServiceResults((r) => ({ ...r, [event.stage]: false }));
                }
                break;
              case "done":
                patch(turn.id, { status: "done", stage: undefined, wav: undefined });
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        if (!controller.signal.aborted) {
          patch(turn.id, { status: "error", stage: undefined, error: publicErrorFrom(err) });
        }
      } finally {
        if (abort.current === controller) {
          abort.current = null;
          setBusy(false);
        }
      }
    },
    [patch, play, stopAudio],
  );

  const submit = useCallback(
    (role: Role, source: LanguageCode, target: LanguageCode, wav: Blob) => {
      // No stage yet: the audio is still uploading.
      const turn: Turn = { id: crypto.randomUUID(), role, source, target, status: "processing", wav };
      setTurns((all) => [...all, turn]);
      void run(turn);
    },
    [run],
  );

  const clear = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    stopAudio();
    urls.current.forEach(URL.revokeObjectURL);
    urls.current = [];
    setTurns([]);
    setPlaybackError(null);
  }, [stopAudio]);

  const loadDemo = useCallback(() => {
    clear();
    setTurns(DEMO_TURNS);
  }, [clear]);

  useEffect(
    () => () => {
      abort.current?.abort();
      audio.current?.pause();
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );

  return {
    turns,
    busy,
    playback,
    playbackError,
    serviceResults,
    submit,
    retry: run,
    play,
    toggle,
    unlockAudio,
    stopAudio,
    clear,
    loadDemo,
  };
}
