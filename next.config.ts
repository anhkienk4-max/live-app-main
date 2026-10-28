import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: [
    "sharp",
    "@img/sharp-linux-x64",
    "@img/sharp-libvips-linux-x64",
    "tesseract.js",
    "@tesseract.js-data/eng",
    "@tesseract.js-data/vie",
  ],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
      "./node_modules/@img/sharp-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
