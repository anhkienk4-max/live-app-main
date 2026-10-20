'use client'

import * as React from 'react'
import { ExternalLink, PanelsTopLeft, Radio } from 'lucide-react'
import type { Shift } from '@/lib/types/database.types'
import { verifyLiveStreamLink } from '@/lib/utils/liveStreamLink'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { shiftService } from '@/lib/services/dataService'
import { invalidatePageCache } from '@/lib/services/operationsPageCache'
import { LiveTabCapture } from './LiveTabCapture'

/**
 * Official TikTok/Shopee LIVE pages refuse cross-origin iframe embedding.
 * Render one safe, verified external player link and an optional user-initiated
 * separate-window mode instead of a permanently broken in-page iframe.
 */
export function LiveStreamPanel({ shift, onSaved }: { shift: Shift; onSaved?: (saved: Shift) => void | Promise<void> }) {
  const { currentUser } = useCurrentUser()
  const canEdit = Boolean(currentUser && hasPermission(currentUser, 'shifts.edit'))
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(shift.live_link ?? '')
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState('')
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canEdit || saving) return
    const value = draft.trim()
    if (value && !verifyLiveStreamLink(value)) {
      setSaveError('Chỉ chấp nhận link HTTPS của TikTok hoặc Shopee.')
      return
    }
    setSaving(true); setSaveError('')
    try {
      const saved = await shiftService.update(shift.id, { live_link: value, version: shift.version })
      if (!saved) throw new Error('Không tìm thấy ca hoặc ca không còn quyền chỉnh sửa.')
      invalidatePageCache()
      setEditing(false)
      await onSaved?.(saved)
    } catch (error) {
      setSaveError(error instanceof Error && error.message.includes('STALE_WRITE')
        ? 'Ca đã được người khác chỉnh sửa. Tải lại ca trước khi lưu link.'
        : 'Không thể lưu link. Kiểm tra quyền chỉnh sửa và thử lại.')
    } finally { setSaving(false) }
  }
  const link = verifyLiveStreamLink(shift.live_link)
  const configured = Boolean(shift.live_link?.trim())
  const displayLink = link ? new URL(link.href) : null
  const openAlongside = () => {
    if (!link) return
    // This is a genuine user gesture. The browser may choose a tab if popups are disabled.
    window.open(link.href, '_blank', 'popup=yes,width=560,height=840,noopener,noreferrer')
  }
  return <section className="border-b border-slate-200 bg-slate-50 p-3" data-testid="live-stream-panel">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Radio className="h-4 w-4 text-red-500" />Xem phiên livestream</h3>
        <p className="mt-1 text-xs text-slate-500">
          {link ? `${link.platform} · ${shift.status === 'live' ? 'Ca đang được đánh dấu LIVE' : 'Trạng thái theo lịch ca'}` :
            configured ? 'Link không hợp lệ. Chỉ hỗ trợ HTTPS TikTok hoặc Shopee.' : 'Chưa gắn link live. Người quản lý cập nhật trong Chỉnh sửa ca → Lịch phát sóng.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
      {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => {setDraft(shift.live_link ?? ''); setSaveError('');setEditing(value=>!value)}}
        data-testid="edit-live-link">{editing ? 'Đóng chỉnh sửa' : link ? 'Đổi link' : 'Gắn link LIVE'}</Button>}
      {link && <>
        <Button type="button" size="sm" variant="outline" onClick={openAlongside}
          data-testid="open-live-side-window" title="Yêu cầu trình duyệt mở cửa sổ riêng để theo dõi song song">
          <PanelsTopLeft className="mr-2 h-4 w-4" />Xem song song
        </Button>
        <a href={link.href} target="_blank" rel="noopener noreferrer"
          className={buttonVariants({variant:'default',size:'sm'})} data-testid="open-official-live">
          <ExternalLink className="mr-2 h-4 w-4" />Mở LIVE trên {link.platform}
        </a>
      </>}
      </div>
    </div>
    {editing && canEdit && <form onSubmit={save} className="mt-3 flex flex-col gap-2 rounded-lg border bg-white p-3" data-testid="inline-live-link-form">
      <label htmlFor="monitor-live-link" className="text-xs font-medium">Dán link phiên LIVE cho ca này</label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id="monitor-live-link" type="url" inputMode="url" className="min-w-[210px] flex-1" value={draft}
          onChange={event => {setDraft(event.target.value);setSaveError('')}} placeholder="https://www.tiktok.com/@shop/live" data-testid="monitor-live-link-input" />
        <Button type="submit" size="sm" disabled={saving} data-testid="save-monitor-live-link">{saving ? 'Đang lưu…' : 'Lưu link'}</Button>
      </div>
      {saveError && <p role="alert" className="text-xs text-red-600">{saveError}</p>}
      <p className="text-xs text-slate-500">Link lưu theo từng ca, cập nhật đồng thời cho Monitor và lịch ca. Để trống rồi lưu để xóa link.</p>
    </form>}
    {link && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500" data-testid="live-platform-link">
      <span className="min-w-0 max-w-full truncate" title={link.href}>{displayLink?.hostname}{displayLink?.pathname}</span>
      {displayLink?.search && <span className="shrink-0 text-slate-400">(đã ẩn tham số theo dõi dài)</span>}
    </div>}
    {link && <LiveTabCapture key={shift.id + ':' + link.href} />}
    {link && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="live-embed-unavailable">
      {link.platform} không cung cấp trình phát LIVE nhúng được xác nhận cho website này.
      Bạn có thể chọn “Chia sẻ tab LIVE vào Monitor” để hiển thị hình ảnh tab TikTok/Shopee ngay tại đây,
      hoặc mở LIVE chính thức bằng cửa sổ riêng.
      Trạng thái LIVE trên ca không tự xác minh phiên phát đang hoạt động.
    </p>}
  </section>
}
