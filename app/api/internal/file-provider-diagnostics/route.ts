import { createFileProviderDiagnosticsGetHandler } from '@/lib/server/fileProviderDiagnosticsRouteHandler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// TEMPORARY DEBUG CODE: remove after RC1.2 provider runtime diagnosis.
export const GET = createFileProviderDiagnosticsGetHandler()
