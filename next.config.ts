import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: [
    "tesseract.js",
    "@tesseract.js-data/eng",
    "@tesseract.js-data/vie",
  ],
};

export default nextConfig;
