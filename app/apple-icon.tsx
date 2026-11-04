import { ImageResponse } from "next/og";
import { AdaOpsIcon } from "@/lib/pwa/AdaOpsIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <AdaOpsIcon dimension={180} />,
    { ...size }
  );
}
