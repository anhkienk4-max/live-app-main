'use client'

import * as React from 'react'
import { ExternalLink, MonitorPlay, Radio, X } from 'lucide-react'
import type { Shift } from '@/lib/types/database.types'
import { verifyLiveStreamLink } from '@/lib/utils/liveStreamLink'
import { Button, buttonVariants } from '@/components/ui/button'

/**
 * Always displays the official session URL. LIVE iframe playback is a user-
 * initiated best effort because TikTok/Shopee do not guarantee live embedding.
 * Never render arbitrary URLs in an iframe or autoplay on page navigation.
 */
export function LiveStreamPanel({ shift }: { shift: Shift }) {
  const [preview, setPreview] = React.useState(false)
  const link = verifyLiveStreamLink(shift.live_link)
  const configured = Boolean(shift.live_link?.trim())
  return <section className="border-b border-slate-200 bg-slate-50 p-3" data-testid="live-stream-panel">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Radio className="h-4 w-4 text-red-500" />Xem phiên livestream</h3>
        <p className="mt-1 text-xs text-slate-500">
          {link ? `${link.platform} · ${shift.status === 'live' ? 'Ca đang được đánh dấu LIVE' : 'Trạng thái theo lịch ca'}` :
            configured ? 'Link không hợp lệ. Chỉ hỗ trợ HTTPS TikTok hoặc Shopee.' : 'Chưa gắn link live. Người quản lý cập nhật trong Chỉnh sửa ca → Lịch phát sóng.'}
        </p>
      </div>
      {link && <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setPreview(value => !value)}
          aria-expanded={preview} aria-controls="live-platform-preview" data-testid="toggle-live-preview">
          {preview ? <X className="mr-2 h-4 w-4" /> : <MonitorPlay className="mr-2 h-4 w-4" />}
          {preview ? 'Đóng khung xem' : 'Thử xem trong Monitor'}
        </Button>
        <a href={link.href} target="_blank" rel="noopener noreferrer"
          className={buttonVariants({variant:'default',size:'sm'})} data-testid="open-official-live">
          <ExternalLink className="mr-2 h-4 w-4" />Mở LIVE trên {link.platform}
        </a>
      </div>}
    </div>
    {link && <p className="mt-2 break-all text-xs text-slate-500" data-testid="live-platform-link">{link.href}</p>}
    {link && preview && <div id="live-platform-preview" className="mt-3 space-y-2">
      <p className="text-xs text-amber-700">TikTok/Shopee có thể chặn phát LIVE trong website khác. Nếu không xem được, dùng nút “Mở LIVE” phía trên. Link không xác nhận phiên đang phát.</p>
      <iframe key={link.href} src={link.href} title={`Xem trực tiếp ${link.platform} · ${shift.title}`}
        data-testid="live-platform-frame" loading="lazy" className="h-[440px] w-full rounded-lg border bg-white md:h-[540px]"
        allow="autoplay; fullscreen; picture-in-picture" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-presentation"
        referrerPolicy="strict-origin-when-cross-origin" />
    </div>}
  </section>
}
