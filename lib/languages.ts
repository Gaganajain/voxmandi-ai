/** Languages supported by both Gnani Prisma STT and Timbre v2.5 TTS (docs.gnani.ai). */
export const LANGUAGES = [
  { code: "kn-IN", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "hi-IN", name: "Hindi", native: "हिन्दी" },
  { code: "ta-IN", name: "Tamil", native: "தமிழ்" },
  { code: "te-IN", name: "Telugu", native: "తెలుగు" },
  { code: "ml-IN", name: "Malayalam", native: "മലയാളം" },
  { code: "mr-IN", name: "Marathi", native: "मराठी" },
  { code: "bn-IN", name: "Bengali", native: "বাংলা" },
  { code: "gu-IN", name: "Gujarati", native: "ગુજરાતી" },
  { code: "pa-IN", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "en-IN", name: "English", native: "English" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code) as [
  LanguageCode,
  ...LanguageCode[],
];

export function getLanguage(code: LanguageCode) {
  return LANGUAGES.find((l) => l.code === code)!;
}
