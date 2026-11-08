"use client";

import { useRef, useState } from "react";
import type { Playback } from "@/hooks/use-conversation";
import { base64ToUrl } from "@/hooks/use-conversation";
import { streamPipeline } from "@/lib/api-client";
import { getLanguage, type LanguageCode } from "@/lib/languages";
import { PHRASES } from "@/lib/phrases";
import type { Role } from "@/lib/types/conversation";
import { AudioPlayer } from "./audio-player";
import { Spinner } from "./icons";

interface Selected {
  id: string;
  role: Role;
  english: string;
  speakerLang: LanguageCode;
  listenerLang: LanguageCode;
  status: "translating" | "ready" | "voicing" | "error";
  speakerText?: string;
  listenerText?: string;
  audioUrl?: string;
  error?: string;
}

/**
 * Starter phrases for either side. Each is translated by the live provider into
 * the speaker's language (to say it) and the listener's (to show or play it).
 * Nothing here is added to the conversation.
 */
export function PhrasePanel({
  customerLang,
  vendorLang,
  disabled,
  playback,
  onToggleAudio,
}: {
  customerLang: LanguageCode;
  vendorLang: LanguageCode;
  disabled: boolean;
  playback: Playback | null;
  onToggleAudio: (id: string, url: string) => void;
}) {
  const [role, setRole] = useState<Role>("customer");
  const [selected, setSelected] = useState<Selected | null>(null);
  /** Translations and audio already fetched this session, by phrase id and language pair. */
  const cache = useRef(new Map<string, Selected>());

  const speakerLang = role === "customer" ? customerLang : vendorLang;
  const listenerLang = role === "customer" ? vendorLang : customerLang;

  const choose = async (id: string, english: string) => {
    const key = `${id}:${speakerLang}:${listenerLang}`;
    const cached = cache.current.get(key);
    if (cached) return setSelected(cached);

    const base: Selected = { id, role, english, speakerLang, listenerLang, status: "translating" };
    setSelected(base);
    try {
      const res = await fetch("/api/phrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, languages: [speakerLang, listenerLang] }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body?.texts)) {
        throw new Error(body?.error?.message ?? "The phrase could not be translated.");
      }
      const ready: Selected = { ...base, status: "ready", speakerText: body.texts[0], listenerText: body.texts[1] };
      cache.current.set(key, ready);
      setSelected((s) => (s?.id === id ? ready : s));
    } catch (err) {
      setSelected((s) => (s?.id === id ? { ...base, status: "error", error: err instanceof Error ? err.message : "Translation failed." } : s));
    }
  };

  const voice = async () => {
    if (!selected?.speakerText || !selected.listenerText) return;
    if (selected.audioUrl) return onToggleAudio(`phrase-${selected.id}`, selected.audioUrl);

    const current = selected;
    setSelected({ ...current, status: "voicing", error: undefined });
    try {
      let url: string | undefined;
      let failure: string | undefined;
      await streamPipeline(
        { source: current.speakerLang, target: current.listenerLang, transcript: current.speakerText, translation: current.listenerText },
        (event) => {
          if (event.type === "audio") url = base64ToUrl(event.base64, event.mimeType);
          if (event.type === "error") failure = event.error.message;
        },
        new AbortController().signal,
      );
      if (!url) throw new Error(failure ?? "No audio was returned.");
      const done: Selected = { ...current, status: "ready", audioUrl: url };
      cache.current.set(`${current.id}:${current.speakerLang}:${current.listenerLang}`, done);
      setSelected((s) => (s?.id === current.id ? done : s));
      onToggleAudio(`phrase-${current.id}`, url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "The audio could not be generated.";
      setSelected((s) => (s?.id === current.id ? { ...current, status: "ready", error: message } : s));
    }
  };

  const phrases = PHRASES.filter((p) => p.role === role);
  const tab = (r: Role, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={role === r}
      onClick={() => setRole(r)}
      className={`min-h-9 rounded-lg px-3 py-1 text-xs font-semibold sm:min-h-0 ${
        role === r ? (r === "customer" ? "bg-customer-soft text-customer" : "bg-vendor-soft text-vendor") : "text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
  const audioId = selected ? `phrase-${selected.id}` : "";

  return (
    <section aria-label="Market phrases" className="rounded-3xl border border-line bg-surface p-4 shadow-xl shadow-black/25">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-bold">Market phrases</h2>
          <p className="text-xs text-muted">Ideas to start talking. Tap one to see it in both languages.</p>
        </div>
        <div role="tablist" aria-label="Phrases for" className="flex gap-1 rounded-xl border border-line p-1">
          {tab("customer", "Customer")}
          {tab("vendor", "Vendor")}
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {phrases.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => void choose(p.id, p.text)}
            aria-pressed={selected?.id === p.id}
            className={`min-h-10 shrink-0 rounded-full border px-3.5 py-1.5 text-[0.8rem] font-medium whitespace-nowrap sm:min-h-0 sm:px-3 sm:text-xs disabled:opacity-40 ${
              selected?.id === p.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-raised hover:border-accent/50"
            }`}
          >
            {p.text}
          </button>
        ))}
      </div>

      {disabled && <p className="mt-2 text-xs text-muted">Phrases use the live services, so they are off in demo mode.</p>}

      {selected && !disabled && (
        <div className="mt-3 rounded-2xl border border-line bg-raised p-3" aria-live="polite">
          {selected.status === "translating" ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="size-4" /> Translating with the live service…
            </p>
          ) : selected.status === "error" && !selected.speakerText ? (
            <p role="alert" className="text-sm text-danger">{selected.error}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div lang={selected.speakerLang}>
                <p className="text-[0.7rem] font-semibold tracking-wide text-muted uppercase" lang="en">
                  {selected.role === "customer" ? "Customer" : "Vendor"} says · {getLanguage(selected.speakerLang).name}
                </p>
                <p className="mt-0.5 text-base">{selected.speakerText}</p>
              </div>
              <div lang={selected.listenerLang}>
                <p className="text-[0.7rem] font-semibold tracking-wide text-muted uppercase" lang="en">
                  {selected.role === "customer" ? "Vendor" : "Customer"} hears · {getLanguage(selected.listenerLang).name}
                </p>
                <p className="mt-0.5 text-base font-bold">{selected.listenerText}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                {selected.status === "voicing" ? (
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <Spinner className="size-3.5" /> Creating {getLanguage(selected.listenerLang).name} voice…
                  </span>
                ) : (
                  <AudioPlayer
                    size="sm"
                    status={playback?.id === audioId ? playback.status : null}
                    languageName={getLanguage(selected.listenerLang).name}
                    error={selected.error}
                    onToggle={() => void voice()}
                  />
                )}
                <span className="text-[0.7rem] text-muted">Suggestion only. It is not added to the conversation.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
