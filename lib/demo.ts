import type { Turn } from "@/lib/types/conversation";

/**
 * Sample script for DEMO mode. These strings are written by hand: no microphone,
 * translation service or Gnani voice produced them, and they carry no audio.
 */
export const DEMO_TURNS: Turn[] = [
  {
    id: "demo-1",
    role: "customer",
    source: "kn-IN",
    target: "hi-IN",
    status: "done",
    demo: true,
    transcript: "ನನಗೆ ಎರಡು ಕಿಲೋ ಟೊಮೇಟೊ ಬೇಕು.",
    translation: "मुझे दो किलो टमाटर चाहिए।",
  },
  {
    id: "demo-2",
    role: "vendor",
    source: "hi-IN",
    target: "kn-IN",
    status: "done",
    demo: true,
    transcript: "दो किलो टमाटर 60 रुपये के हैं।",
    translation: "ಎರಡು ಕಿಲೋ ಟೊಮೇಟೊ 60 ರೂಪಾಯಿ.",
  },
];
