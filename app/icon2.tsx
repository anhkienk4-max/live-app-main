import { ImageResponse } from "next/og";
import { AdaOpsIcon } from "@/lib/pwa/AdaOpsIcon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <AdaOpsIcon dimension={512} />,
    { ...size }
  );
}
