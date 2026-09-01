import 'server-only'

import type {
  ApplicationFilePurpose,
  CloudFileSource,
  NormalizedCloudFile,
} from '@/lib/files/applicationFileSource'
import {
  CloudFileIngestionError,
  cloudFileIngestionService,
  type CloudFileIngestionService,
} from '@/lib/services/cloudFileIngestionService'

export interface ApplicationFileSourceService {
  ingest(
    source: CloudFileSource,
    purpose: ApplicationFilePurpose,
    expectedContentType?: string,
  ): Promise<NormalizedCloudFile>
}

export function createApplicationFileSourceService(
  ingestion: CloudFileIngestionService = cloudFileIngestionService,
): ApplicationFileSourceService {
  return {
    async ingest(source, purpose, expectedContentType) {
      if (!source || !['google_drive', 'onedrive'].includes(source.type)) {
        throw new CloudFileIngestionError('CLOUD_INGESTION_PROVIDER_UNSUPPORTED')
      }
      const result = await ingestion.ingest({
        provider: source.type,
        resource: source.resource,
        expectedContentType,
        purpose,
      })
      return {
        sourceType: source.type,
        providerResourceId: result.providerResourceId,
        filename: result.filename,
        mimeType: result.mimeType,
        size: result.size,
        content: new Uint8Array(result.content),
      }
    },
  }
}

export const applicationFileSourceService = createApplicationFileSourceService()
