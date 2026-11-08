import type { Metadata, Viewport } from "next";
import { Noto_Sans_Devanagari, Noto_Sans_Kannada, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--nf-display" });
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--nf-kannada", preload: false });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--nf-devanagari", preload: false });

export const metadata: Metadata = {
  title: "VoxMandi AI · Talk. Translate. Trade.",
  description: "Breaking language barriers in local markets through real-time voice translation.",
  applicationName: "VoxMandi AI",
  openGraph: {
    type: "website",
    siteName: "VoxMandi AI",
    locale: "en_IN",
    title: "VoxMandi AI · Talk. Translate. Trade.",
    description: "Every voice finds its language. Breaking language barriers in local markets through real-time voice translation.",
  },
  twitter: {
    card: "summary",
    title: "VoxMandi AI · Talk. Translate. Trade.",
    description: "Every voice finds its language. Breaking language barriers in local markets through real-time voice translation.",
  },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1020",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${kannada.variable} ${devanagari.variable}`}>
      <body>{children}</body>
    </html>
  );
}
