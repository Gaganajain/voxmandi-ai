import type { NextConfig } from "next";

/** Private (RFC 1918) network ranges, e.g. home Wi-Fi or a phone hotspot. */
const privateNetworks = [
  "192.168.*.*",
  "10.*.*.*",
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
];

const nextConfig: NextConfig = {
  // `npm run dev:phone` serves the app to a phone on the same network. The dev
  // server refuses its own assets to other origins unless they are listed here.
  allowedDevOrigins: privateNetworks,
  // The floating dev badge sits over the phone's microphone dock. Errors still show.
  devIndicators: false,
};

export default nextConfig;
