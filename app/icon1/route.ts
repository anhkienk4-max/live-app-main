import { createAdaOpsIconResponse } from "@/lib/pwa/iconResponse";

// Public image asset used by the same-origin PWA manifest.
export function GET() {
  return createAdaOpsIconResponse(192);
}
