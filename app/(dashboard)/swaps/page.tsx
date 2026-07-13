import { LazySwapRequestList } from '@/lib/utils/lazyComponents'
export default function SwapsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold">Swap Requests</h1><p className="text-gray-600">Manage shift swap requests</p></div>
      <LazySwapRequestList />
    </div>
  )
}
