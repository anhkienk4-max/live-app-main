'use client'

import * as React from 'react'
import { History, Clock, User, AlertCircle, Loader2 } from 'lucide-react'
import type { AuditLog, User as UserType } from '@/lib/types/database.types'
import { auditService } from '@/lib/services/auditService'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface RegistrationAuditHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUser: UserType | null
  registrationId?: string
}

export function RegistrationAuditHistoryDialog({
  open,
  onOpenChange,
  currentUser,
  registrationId,
}: RegistrationAuditHistoryDialogProps) {
  const [logs, setLogs] = React.useState<AuditLog[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadAuditData = React.useCallback(async () => {
    if (!currentUser) return
    setLoading(true)
    setError(null)
    try {
      const response = await auditService.getAuditLogs({
        user: currentUser,
        page: 1,
        pageSize: 50,
        filters: { module: 'calendar' },
        sort: 'newest',
      })
      const registrationLogs = (response.items || []).filter(item => {
        const isReg = item.entity_type === 'shift_registration' || item.action.includes('registration') || item.action === 'approve' || item.action === 'reject'
        if (!isReg) return false
        if (registrationId) {
          return item.entity_id === registrationId || item.entity_name?.includes(registrationId)
        }
        return true
      })
      setLogs(registrationLogs)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải lịch sử kiểm toán.')
    } finally {
      setLoading(false)
    }
  }, [currentUser, registrationId])

  React.useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      void loadAuditData()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, loadAuditData])

  const renderActionBadge = (action: string) => {
    switch (action) {
      case 'approve':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">Phê duyệt</Badge>
      case 'reject':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[10px]">Từ chối</Badge>
      case 'cancel_registration':
      case 'cancel':
        return <Badge className="bg-slate-100 text-slate-700 border-slate-300 text-[10px]">Đã hủy</Badge>
      case 'register':
      case 'requested':
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">Đăng ký mới</Badge>
      default:
        return <Badge variant="outline" className="text-[10px]">{action}</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
            <History className="h-5 w-5 text-slate-700" />
            <span>Lịch sử kiểm toán đăng ký ca (Audit Trail)</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            {registrationId
              ? `Nhật ký sự kiện cho đơn đăng ký #${registrationId}`
              : 'Toàn bộ các sự kiện thay đổi trạng thái, phê duyệt, từ chối và hủy đăng ký ca'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2 text-xs">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang tải nhật ký kiểm toán...</span>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-xs">
              <History className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <div className="font-semibold text-slate-700">Chưa có bản ghi kiểm toán</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Các thao tác đăng ký, duyệt hoặc từ chối sẽ tự động được ghi nhận tại đây.
              </div>
            </div>
          )}

          {!loading && !error && logs.length > 0 && (
            <div className="divide-y divide-slate-100 text-xs">
              {logs.map((log) => (
                <div key={log.id} className="py-3 space-y-1.5 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {renderActionBadge(log.action)}
                      <span className="font-mono font-bold text-slate-800">{log.entity_name || log.entity_id}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                      <Clock className="h-3 w-3" />
                      <span>{log.created_at ? new Date(log.created_at).toLocaleString('vi-VN') : 'N/A'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <User className="h-3 w-3 text-slate-400" />
                    <span>Người thực hiện: <strong className="text-slate-800">{log.actor_name || log.actor_id}</strong></span>
                    {log.actor_role && (
                      <Badge variant="outline" className="text-[9px] uppercase px-1 py-0">
                        {log.actor_role}
                      </Badge>
                    )}
                  </div>

                  {log.reason && (
                    <div className="rounded bg-slate-50 border border-slate-100 p-2 text-[11px] text-slate-700">
                      <span className="font-semibold text-slate-800">Lý do / Ghi chú: </span>
                      <span className="italic">{log.reason}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
