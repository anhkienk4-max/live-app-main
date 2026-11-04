import { ImageResponse } from "next/og";
import { AdaOpsIcon } from "@/lib/pwa/AdaOpsIcon";

export function createAdaOpsIconResponse(dimension: number, maskable = false): ImageResponse {
  return new ImageResponse(
    <AdaOpsIcon dimension={dimension} maskable={maskable} />,
    { width: dimension, height: dimension },
  );
}
