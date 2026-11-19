import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // The exact-SHA workflow injects this after verifying its checkout.
    RC19_BUILD_COMMIT_SHA: process.env.RC19_BUILD_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    RC19_BUILD_WORKFLOW_RUN_ID: process.env.RC19_BUILD_WORKFLOW_RUN_ID ?? "",
  },
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
