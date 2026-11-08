# BazaarBuddy AI

**Your market. Your language.** Talk naturally. Understand instantly. Shop confidently.

Voice-first translation for Indian street markets. A customer and a vendor each speak their own language and hear the other in theirs. "Market notes" lists the products, quantities and prices mentioned, checked against the conversation text. "Market phrases" offers starter phrases, translated live and playable, without adding them to the conversation.

**Flow:** microphone → Gnani speech-to-text → Groq translation (Cerebras also supported) → Gnani text-to-speech → playback.

## Run it

```
npm install
npm run dev
```

Open http://localhost:3000. `npm run dev` only listens on this laptop.

## Use it on your phone

The phone opens the app from your laptop over Wi-Fi. Nothing is published to the internet; the API keys stay on the laptop.

1. **Same network.** Connect the laptop and phone to the same Wi-Fi. At a market with no Wi-Fi, turn on the phone's mobile hotspot and connect the laptop to it (the laptop then reaches Gnani and Groq through the phone's data).
2. **Find the laptop's address.** On the laptop, run `ipconfig` in a terminal. Under the adapter you are connected with (Wi-Fi), copy the **IPv4 Address**, e.g. `192.168.x.x`.
3. **Start the server for the network.** Stop any running dev server (Ctrl+C), then run one of:
   - `npm run phone` (recommended for the demo: production build, faster and steadier), or
   - `npm run dev:phone` (development mode, reloads when code changes).
4. **Windows Firewall.** If Windows asks whether Node.js may communicate on networks, allow **Private networks**. If the phone cannot connect, make sure the Wi-Fi/hotspot connection is set to **Private** in Windows Settings → Network & internet.
5. **Open it on the phone.** In Chrome, go to `http://<IPv4 address>:3000`.
6. **Allow the microphone on that address (one time).** Phones only allow the microphone on HTTPS or `localhost`; a `http://192.168…` address is neither, and the app shows a yellow notice explaining this. In Chrome on Android:
   - open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
   - enter `http://<IPv4 address>:3000`, set it to **Enabled**, tap **Relaunch**
   - reopen the app and allow the microphone when asked.

   This only affects that one address on your phone. If the laptop's address changes (for example a different hotspot), add the new one.

   Alternative with a USB cable (needs USB debugging turned on in the phone's Developer options): on the laptop open `chrome://inspect/#devices` → Port forwarding → `3000` → `localhost:3000`, then open `http://localhost:3000` on the phone. `localhost` is always allowed, so no flag is needed.

Stop the server with Ctrl+C when you are done so the app is no longer reachable on the network.

## Keys

Put these in `.env.local` (ignored by Git). Next.js picks up changes automatically.

| Variable | Where to get it |
| --- | --- |
| `GNANI_API_KEY` | https://app.gnani.ai/voice (needs STT and TTS access) |
| `GROQ_API_KEY` | https://console.groq.com/keys |

`TRANSLATION_PROVIDER` picks the translator: `groq` (default) or `cerebras` (then set `CEREBRAS_API_KEY`). Optional settings are listed in `.env.example`. If the status menu says the model is unavailable on your account, set `GROQ_MODEL` (or `CEREBRAS_MODEL`).

## Status labels

- **LIVE:** all keys are set, the translation provider accepted its key (this check cannot see account credit), and no real call has failed this session. Gnani has no free check, so open the status menu to see whether each service has worked this session.
- **CONFIGURATION REQUIRED:** a key is missing. The app still runs and names what is missing.
- **API ERROR:** a key was rejected, or the latest real call to a service failed. The status menu says which.
- **DEMO:** a hand-written sample conversation with no audio, opened with "View demo". The microphones are off while it shows.

## Where things are

- `lib/pipeline.ts`: the speech → translation → speech pipeline, used for both speakers
- `app/api/translate/route.ts`: streams each pipeline result to the browser as it is ready
- `lib/phrases.ts` and `app/api/phrase/route.ts`: starter phrases, translated by the live provider; audio reuses `/api/translate`
- `lib/summary.ts` and `app/api/summary/route.ts`: market notes; items whose quote is not in the conversation are dropped and unverifiable numbers are marked uncertain
- `lib/gnani/`: speech-to-text and text-to-speech clients
- `lib/translation/`: provider interface, a shared OpenAI-compatible client, and the Groq and Cerebras providers; register new providers in `translate.ts`
- `lib/audio/recording.ts`: microphone capture and conversion to the WAV format Gnani accepts

## Limits

Recordings stop automatically at 29 seconds because Gnani's REST speech-to-text accepts up to 30. The API routes have no login or rate limit, so add both before deploying publicly: anyone who can reach them can spend your API credit.
