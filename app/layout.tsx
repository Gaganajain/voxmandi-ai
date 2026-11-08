import type { Metadata, Viewport } from "next";
import { Noto_Sans_Devanagari, Noto_Sans_Kannada, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--nf-display" });
const kannada = Noto_Sans_Kannada({ subsets: ["kannada"], variable: "--nf-kannada", preload: false });
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--nf-devanagari", preload: false });

export const metadata: Metadata = {
  title: "BazaarBuddy AI · Your market. Your language.",
  description: "Talk naturally. Understand instantly. Shop confidently. Voice translation between customers and vendors in Indian markets.",
  applicationName: "BazaarBuddy AI",
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
