import { createAdaOpsIconResponse } from "@/lib/pwa/iconResponse";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return createAdaOpsIconResponse(512);
}
