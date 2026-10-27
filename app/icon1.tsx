import { ImageResponse } from "next/og";
import { AdaOpsIcon } from "@/lib/pwa/AdaOpsIcon";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <AdaOpsIcon dimension={192} />,
    { ...size }
  );
}
