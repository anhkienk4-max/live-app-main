# RC19 G8 → C8 Physical Folder Browser Contract Handoff

**Status:** frontend presentation implemented; provider browsing remains disabled pending an authenticated C8 contract.

## Source audit

| Concern | Current contract | G8 result |
|---|---|---|
| Provider root lookup | `/api/operational-files?catalog=1` returns global active-route count and provider credential-configuration booleans. `/api/operational-storage-setup` is an Admin setup surface and returns configured route records; it is not a scoped browser API. | No user-scoped, verified browsing root is available to the Storage workspace. |
| Operational file list | `GET /api/operational-files` authorizes a business scope and pages `operational_files` metadata. It does not enumerate Drive or OneDrive children. | Existing files remain listed from the operational metadata registry. |
| Resource registry | `GET /api/storage-resources` returns RLS-scoped resource metadata and grant/scope fields. `POST action=verify` checks one canonical item’s metadata and records `verified_metadata`; its response explicitly does not prove viewer access. | It cannot browse children or choose a destination. Attendance resources stay outside unrestricted browsing. |
| Provider adapters | Server-only `FileProvider.list(parentId?)` and `getMetadata(id)` exist. Google Drive lists up to 1,000 immediate children in one request; the adapter discards `nextPageToken`. OneDrive reads one `/children` response and does not follow `@odata.nextLink`. | These methods are not exposed by an authenticated, authorized folder-list endpoint; pagination is incomplete. |
| Parent/child and metadata | Provider metadata includes ID, name, kind, parent IDs, MIME, and size when supplied. Google metadata includes MD5 in provider metadata, not SHA-256. OneDrive metadata includes `web_url`; it does not provide checksum. | A folder entry can only be treated as verified after server-side provider metadata checks. |
| File receipts and access | `operational_files` stores external file ID, parent ID, path, MIME, size, optional SHA-256 and `integrity_status`. App uploads can be `sha256_verified`; provider-linked files are `provider_reference`. List receipts use the authenticated `/api/operational-files?file_id=...` route. | No receipt or provider URL is fabricated by G8. Existing app receipts are unchanged. |
| Destination selection | Existing `prepare_folder` derives and materializes a destination from the authorized business scope. `attach_existing` verifies a file is in that derived parent. Admin setup route registration accepts explicit folder IDs after ancestry checks and explicit confirmation. | No general folder selection or authoritative confirmation endpoint exists. G8 does not send or persist a clicked folder ID. |
| Permission verification | Existing endpoints use server permission checks and Supabase RLS; provider adapters use configured server credentials. Adapter `getMetadata` proves metadata visibility only, not the current user’s provider access. | Client controls remain disabled; client-side role visibility is not authorization. |
| Access expiry and errors | App file receipts route through the server. Provider adapters expose provider-specific error codes. No browser-list response contract describes URL expiry; direct OneDrive download URLs can be transient. | Browser UI exposes no provider URL or raw credentials. |

## Proposed C8 contract (not implemented by Gemini)

The provider browser needs a read endpoint that accepts the business scope and an optional previously returned parent/cursor, but never treats a client-supplied folder ID as authority. The server must resolve the configured route/root, enforce the existing Admin/Leader/Member scope and private Attendance rules, verify that a requested parent descends from that root, and return only immediate children from the provider. A cursor must preserve provider pagination rather than silently truncating results.

```ts
type StorageProvider = 'google_drive' | 'onedrive'
type StorageBrowserScope = {
  brand_id?: string
  campaign_id?: string
  shift_id?: string
  platform_id?: string
  period_date?: string
  execution_source?: 'internal' | 'agency'
  resource_id?: string // for an existing, authorized resource grant
}
type StorageBrowseRequest = StorageBrowserScope & {
  provider: StorageProvider
  parent_id?: string // accepted only after server ancestry verification
  cursor?: string
  page_size?: 10 | 20 | 50
}
type StorageBrowserEntry = {
  id: string
  parent_id: string
  name: string
  kind: 'folder' | 'file'
  mime_type: string | null
  size_bytes: number | null
  provider: StorageProvider
  verification: 'provider_metadata'
  checksum_sha256: string | null // null unless bytes were actually hashed
  access_url: string | null // server-authorized receipt only; no public-link inference
}
type StorageBrowseResponse = {
  ok: true
  provider: StorageProvider
  root: { id: string; name: string; verification: 'provider_metadata' }
  current_folder: { id: string; name: string; parent_id: string | null }
  entries: StorageBrowserEntry[]
  next_cursor: string | null
}
```

Destination selection needs a separate authenticated confirmation operation. It must re-resolve the route and provider, re-check the selected folder’s ancestry and actor scope at confirmation time, then return authoritative provider ID/name/parent/verification and any persisted destination reference. A visual selection alone must never become a saved ID. Do not use this flow for private Attendance photos without the existing C5 authorization and root boundary.

## G8 UI behavior

- The previous Brand/year/month/platform illustration depended on a **global** route count and generated its hierarchy in the browser. It is removed as a physical folder tree.
- The remaining scope breadcrumb is explicitly labeled logical scope.
- The Storage panel identifies the selected provider and explains that root lookup and child listing are unavailable. Search and browse controls are disabled and no folder entries are rendered, even when a mock catalog reports active routes and configured credentials.
- Existing Table/Card views continue to show only records returned by the authorized operational file list.

## Verification boundary

Mock browser checks can verify the unavailable state, disabled controls, no invented folder entries, and responsive rendering. They cannot establish Google Drive or OneDrive availability, user permissions at the provider, complete pagination, physical ancestry, or successful destination confirmation. Those remain C8 implementation and authenticated provider acceptance requirements.
