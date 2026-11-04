import { Suspense } from 'react'
import { OperationalFileWorkspace } from '@/components/features/storage/OperationalFileWorkspace'

export default function StoragePage() {
  return <div className="ada-workspace-page min-w-0"><Suspense fallback={<p className="p-4 text-sm">Đang tải kho file...</p>}>
    <OperationalFileWorkspace />
  </Suspense></div>
}
