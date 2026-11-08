"use client";

import { useCallback, useEffect, useState } from "react";
import { useConversation } from "@/hooks/use-conversation";
import { useRecorder } from "@/hooks/use-recorder";
import { fetchHealth } from "@/lib/api-client";
import type { LanguageCode } from "@/lib/languages";
import type { HealthResponse, Role } from "@/lib/types/conversation";
import { AppHeader } from "./app-header";
import { ConversationPanel } from "./conversation-panel";
import { Hero } from "./hero";
import { LanguagePairBar } from "./language-selector";
import { MicAccessNotice } from "./mic-access-notice";
import { MicrophonePanel } from "./microphone-button";
import { PhrasePanel } from "./phrase-panel";
import { SiteFooter } from "./site-footer";
import { deriveMode } from "./status-indicator";
import { SummaryPanel } from "./summary-panel";

export function BazaarApp() {
  const [customerLang, setCustomerLang] = useState<LanguageCode>("kn-IN");
  const [vendorLang, setVendorLang] = useState<LanguageCode>("hi-IN");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoaded, setHealthLoaded] = useState(false);
  const [demoActive, setDemoActive] = useState(false);
  /** Bumped on every clear so per-conversation panels start fresh. */
  const [epoch, setEpoch] = useState(0);

  const conversation = useConversation();
  const { submit } = conversation;

  // The pair is read when recording ends, so a swap always changes the direction sent to the server.
  const recorder = useRecorder((role, wav) => {
    const [source, target] = role === "customer" ? [customerLang, vendorLang] : [vendorLang, customerLang];
    submit(role, source, target, wav);
  });

  const recheck = useCallback(async () => {
    setHealth(await fetchHealth());
    setHealthLoaded(true);
  }, []);

  useEffect(() => {
    let current = true;
    void fetchHealth().then((result) => {
      if (!current) return;
      setHealth(result);
      setHealthLoaded(true);
    });
    return () => {
      current = false;
    };
  }, []);

  const mode = deriveMode(demoActive, health, healthLoaded, conversation.serviceResults);
  const missing = health ? [...new Set(Object.values(health.services).flatMap((s) => s.missing))] : [];

  const recorderBusy = recorder.phase !== "idle";
  const anyBusy = recorderBusy || conversation.busy;
  const turns = conversation.turns;

  /** Selecting the other side's language swaps the two, so the pair is always valid. */
  const changeLanguage = (role: Role, code: LanguageCode) => {
    const [mine, other, setMine, setOther] =
      role === "customer"
        ? [customerLang, vendorLang, setCustomerLang, setVendorLang]
        : [vendorLang, customerLang, setVendorLang, setCustomerLang];
    if (code === other) setOther(mine);
    setMine(code);
  };

  /** Clears messages, notes and playback, and discards any recording in progress. */
  const clearAll = () => {
    recorder.cancel();
    conversation.clear();
    setEpoch((e) => e + 1);
  };

  // Whose turn: the other side after a finished message, the same side to try again after a failure.
  const lastLive = turns.filter((t) => !t.demo).at(-1);
  const nextRole: Role = !lastLive
    ? "customer"
    : lastLive.status === "error"
      ? lastLive.role
      : lastLive.role === "customer"
        ? "vendor"
        : "customer";

  const panel = (role: Role, language: LanguageCode) => {
    const mine = turns.filter((t) => t.role === role && !t.demo);
    return (
      <MicrophonePanel
        role={role}
        language={language}
        phase={recorder.activeRole === role ? recorder.phase : "idle"}
        seconds={recorder.seconds}
        activeTurn={mine.find((t) => t.status === "processing")}
        lastTurn={mine.at(-1)}
        isTurn={!demoActive && nextRole === role}
        disabled={anyBusy || demoActive}
        error={recorder.error?.role === role ? recorder.error.message : undefined}
        onStart={() => {
          conversation.unlockAudio();
          void recorder.start(role);
        }}
        onStop={() => {
          conversation.unlockAudio();
          recorder.stop();
        }}
      />
    );
  };

  return (
    <>
      <AppHeader
        customerLang={customerLang}
        vendorLang={vendorLang}
        mode={mode}
        health={health}
        serviceResults={conversation.serviceResults}
        onRecheck={() => void recheck()}
      />
      <main className="mx-auto w-full max-w-6xl px-4">
        <Hero />
        <MicAccessNotice />
        <LanguagePairBar
          customerLang={customerLang}
          vendorLang={vendorLang}
          onChange={changeLanguage}
          onSwap={() => {
            setCustomerLang(vendorLang);
            setVendorLang(customerLang);
          }}
          disabled={anyBusy || demoActive}
        />

        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)_15rem] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
            <ConversationPanel
              turns={turns}
              playback={conversation.playback}
              playbackError={conversation.playbackError}
              retryDisabled={anyBusy}
              recording={recorderBusy}
              demoActive={demoActive}
              missing={missing}
              onToggleAudio={(turn) => turn.audioUrl && conversation.toggle(turn.id, turn.audioUrl)}
              onRetry={(turn) => void conversation.retry(turn)}
              onClear={() => {
                clearAll();
                setDemoActive(false);
              }}
              onShowDemo={() => {
                clearAll();
                conversation.loadDemo();
                setDemoActive(true);
              }}
              onExitDemo={() => {
                clearAll();
                setDemoActive(false);
              }}
            />
            <PhrasePanel
              customerLang={customerLang}
              vendorLang={vendorLang}
              disabled={demoActive}
              playback={conversation.playback}
              onToggleAudio={conversation.toggle}
            />
            <SummaryPanel key={epoch} turns={turns} demoActive={demoActive} busy={conversation.busy} />
          </div>

          {/* Phones: a dock fixed to the bottom. Desktop: dissolves so each mic is a side column. */}
          <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-3 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:contents">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1 lg:h-[min(60vh,40rem)]">{panel("customer", customerLang)}</div>
            <div className="min-w-0 lg:col-start-3 lg:row-start-1 lg:h-[min(60vh,40rem)]">{panel("vendor", vendorLang)}</div>
          </div>
        </div>
      </main>
      <SiteFooter translationProvider={health?.services.translate.provider} />
    </>
  );
}
