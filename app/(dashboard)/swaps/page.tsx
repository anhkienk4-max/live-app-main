import { LazySwapRequestList } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
export default function SwapsPage() {
  return (
    <div className="space-y-6">
      <LocalizedPageHeading title="swapsTitle" subtitle="swapsSubtitle" />
      <LazySwapRequestList />
    </div>
  )
}
