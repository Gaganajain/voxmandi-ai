/** Browser-only helpers for capturing speech and preparing it for upload. */

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];
const TARGET_SAMPLE_RATE = 16_000;
const MIN_SECONDS = 0.3;
/** Peak level below this is treated as a silent or muted microphone. */
const SILENCE_PEAK = 0.002;

export class RecordingError extends Error {}

export interface ActiveRecording {
  /** Settles when recording ends for any reason, including a lost microphone. */
  finished: Promise<Blob>;
  stop(): void;
  /** Stops and discards the audio. */
  cancel(): void;
}

function microphoneError(err: unknown): RecordingError {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new RecordingError("Microphone permission was denied. Allow the microphone in your browser's site settings, then try again.");
    case "NotFoundError":
      return new RecordingError("No microphone was found on this device.");
    case "NotReadableError":
      return new RecordingError("The microphone is being used by another app. Close it and try again.");
    default:
      return new RecordingError("Could not start the microphone. Please try again.");
  }
}

export async function startRecording(): Promise<ActiveRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new RecordingError(
      window.isSecureContext
        ? "This browser cannot record audio. Try a recent Chrome, Edge, Firefox or Safari."
        : "Recording needs a secure page. Open the app on localhost or over HTTPS.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    throw microphoneError(err);
  }
  const releaseMicrophone = () => stream.getTracks().forEach((t) => t.stop());

  let recorder: MediaRecorder;
  try {
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    releaseMicrophone();
    throw new RecordingError("This browser cannot record in a supported audio format.");
  }

  const chunks: Blob[] = [];
  let cancelled = false;

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      releaseMicrophone();
      reject(new RecordingError("Recording failed. Please try again."));
    };
    recorder.onstop = () => {
      releaseMicrophone();
      if (cancelled) reject(new DOMException("Recording cancelled", "AbortError"));
      else resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
  });

  // A microphone that disappears mid-recording ends the track without stopping the recorder.
  stream.getTracks().forEach((t) =>
    t.addEventListener("ended", () => {
      if (recorder.state !== "inactive") recorder.stop();
    }),
  );

  try {
    recorder.start();
  } catch {
    releaseMicrophone();
    throw new RecordingError("Recording failed to start. Please try again.");
  }

  const stop = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };
  return {
    finished,
    stop,
    cancel() {
      cancelled = true;
      stop();
    },
  };
}

/**
 * Gnani REST STT accepts WAV, MP3, OGG, FLAC, AAC and M4A, but browsers record
 * WebM or MP4. Decoding to 16 kHz mono WAV gives one upload format for all
 * browsers and exposes clips that are too short or silent before spending credit.
 */
export async function convertToWav(recording: Blob): Promise<Blob> {
  if (recording.size === 0) {
    throw new RecordingError("No audio was captured. Please record again.");
  }

  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await recording.arrayBuffer());
  } catch {
    throw new RecordingError("The recording could not be read. Please record again.");
  } finally {
    void context.close();
  }

  if (decoded.duration < MIN_SECONDS) {
    throw new RecordingError("That recording was too short. Hold on a moment longer while you speak.");
  }

  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  if (!samples.some((s) => Math.abs(s) > SILENCE_PEAK)) {
    throw new RecordingError("No sound was picked up. Check that your microphone is not muted.");
  }
  return encodeWav(samples, TARGET_SAMPLE_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + dataSize));
  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  samples.forEach((s, i) => {
    const clamped = Math.max(-1, Math.min(1, s));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Blob([view], { type: "audio/wav" });
}
