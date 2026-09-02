'use client'

import * as React from 'react'
import { CheckCircle2, Eye, Loader2, RefreshCw, RotateCcw, XCircle } from 'lucide-react'

import type { AccountRequest } from '@/lib/types/accountRequest.types'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'

type ApiError = { error?: { message?: string } }

const provisioningLabel: Record<AccountRequest['provisioning_status'], TranslationKey> = {
  not_started: 'provisioningNotStarted',
  in_progress: 'provisioningInProgress',
  invited: 'provisioningInvited',
  linked: 'provisioningLinked',
  failed: 'provisioningFailed',
}

async function readResponse(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as ApiError | null
  if (!response.ok) throw new Error(payload?.error?.message || fallback)
  return payload
}

export function AccountRequestPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [requests, setRequests] = React.useState<AccountRequest[]>([])
  const [selected, setSelected] = React.useState<AccountRequest | null>(null)
  const [rejectionReason, setRejectionReason] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const loadRequests = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/account-requests?status=all', { cache: 'no-store' })
      const payload = await readResponse(response, t('accountRequestReadFailed')) as { requests?: AccountRequest[] } | null
      setRequests(payload?.requests ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('accountRequestReadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadRequests() })
    return () => window.cancelAnimationFrame(frame)
  }, [loadRequests])

  const mutate = React.useCallback(async (
    request: AccountRequest,
    action: 'approve' | 'reject' | 'provision',
    body: Record<string, unknown>,
  ) => {
    setBusyId(request.id)
    try {
      const path = action === 'provision'
        ? `/api/account-requests/${request.id}/provision`
        : `/api/account-requests/${request.id}/${action}`
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      await readResponse(response, t('accountRequestOperationFailed'))
      setSelected(null)
      setRejectionReason('')
      await loadRequests()
      toast({ title: t('accountRequestUpdated'), variant: 'success' })
    } catch (mutationError) {
      toast({
        title: t('accountRequestOperationFailed'),
        description: mutationError instanceof Error ? mutationError.message : t('tryAgain'),
        variant: 'destructive',
      })
    } finally {
      setBusyId(null)
    }
  }, [loadRequests, t, toast])

  const approve = (request: AccountRequest) => mutate(request, 'approve', { expected_version: request.version })
  const provision = (request: AccountRequest) => mutate(request, 'provision', {
    expected_version: request.version,
    retry: request.provisioning_status === 'failed',
  })
  const reject = (request: AccountRequest) => {
    const reason = rejectionReason.trim()
    if (!reason) {
      toast({ title: t('accountRequestRejectionReasonRequired'), variant: 'destructive' })
      return
    }
    void mutate(request, 'reject', {
      expected_version: request.version,
      rejection_reason: reason,
    })
  }

  return (
    <Card className="mb-6 shadow-none" data-testid="account-request-panel">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{t('accountRequests')}</CardTitle>
            <CardDescription>{t('accountRequestsDescription')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadRequests()} disabled={loading} data-testid="refresh-account-requests">
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            {t('refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading && !requests.length ? <p className="p-4 text-sm text-muted-foreground">{t('loading')}</p> : null}
        {error ? <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-red-700"><span>{error}</span><Button variant="outline" size="sm" onClick={() => void loadRequests()}>{t('tryAgain')}</Button></div> : null}
        {!loading && !error && !requests.length ? <p className="p-4 text-sm text-muted-foreground">{t('noAccountRequests')}</p> : null}
        {requests.length ? (
          <div className="divide-y">
            {requests.map(request => {
              const busy = busyId === request.id
              const canReview = request.status === 'pending'
              const canProvision = request.status === 'approved'
                && (request.provisioning_status === 'not_started' || request.provisioning_status === 'failed')
              return (
                <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between" key={request.id} data-testid={`account-request-${request.id}`}>
                  <button className="min-w-0 text-left" onClick={() => { setSelected(request); setRejectionReason('') }} data-testid={`view-account-request-${request.id}`}>
                    <p className="truncate font-medium">{request.full_name}</p>
                    <p className="truncate text-sm text-muted-foreground">{request.email}</p>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={request.status === 'pending' ? 'secondary' : 'outline'}>{t(request.status)}</Badge>
                    <Badge variant="outline">{t(provisioningLabel[request.provisioning_status])}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => { setSelected(request); setRejectionReason('') }} aria-label={t('viewDetails')}>
                      <Eye className="mr-2 size-4" />{t('viewDetails')}
                    </Button>
                    {canReview && <>
                      <Button size="sm" onClick={() => void approve(request)} disabled={busy} data-testid={`approve-account-request-${request.id}`}>
                        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CheckCircle2 className="mr-2 size-4" />}{t('approve')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setSelected(request); setRejectionReason('') }} disabled={busy} data-testid={`reject-account-request-${request.id}`}>
                        <XCircle className="mr-2 size-4" />{t('reject')}
                      </Button>
                    </>}
                    {canProvision && <Button size="sm" variant="outline" onClick={() => void provision(request)} disabled={busy} data-testid={`${request.provisioning_status === 'failed' ? 'retry' : 'provision'}-account-request-${request.id}`}>
                      {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}
                      {t(request.provisioning_status === 'failed' ? 'retryProvisioning' : 'provisionAccount')}
                    </Button>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </CardContent>

      {selected && (
        <Dialog open onOpenChange={open => !open && setSelected(null)}>
          <DialogContent size="md">
            <DialogHeader><DialogTitle>{selected.full_name}</DialogTitle><p className="text-sm text-muted-foreground">{selected.email}</p></DialogHeader>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label={t('phone')} value={selected.phone} />
              <Detail label={t('department')} value={selected.department} />
              <Detail label={t('status')} value={t(selected.status)} />
              <Detail label={t('provisioningStatus')} value={t(provisioningLabel[selected.provisioning_status])} />
              <Detail label={t('requestVersion')} value={String(selected.version)} />
              <Detail label={t('submittedAt')} value={new Date(selected.submitted_at).toLocaleString()} />
            </div>
            {selected.provisioning_status === 'invited' || selected.provisioning_status === 'linked' ? <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{t('staffActivationSeparate')}</p> : null}
            {selected.provisioning_error_code ? <p className="text-sm text-red-700">{t('provisioningError')}: {selected.provisioning_error_code}</p> : null}
            {selected.status === 'rejected' && selected.rejection_reason ? <Detail label={t('rejectionReason')} value={selected.rejection_reason} /> : null}
            {selected.status === 'pending' ? <div className="space-y-2"><label className="text-sm font-medium" htmlFor="account-request-rejection-reason">{t('rejectionReason')}</label><Textarea id="account-request-rejection-reason" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} maxLength={1000} placeholder={t('rejectionReasonPlaceholder')} /></div> : null}
            <DialogFooter>
              {selected.status === 'pending' ? <>
                <Button onClick={() => void approve(selected)} disabled={busyId === selected.id}>{t('approve')}</Button>
                <Button variant="destructive" onClick={() => reject(selected)} disabled={busyId === selected.id}>{t('reject')}</Button>
              </> : null}
              {selected.status === 'approved' && (selected.provisioning_status === 'not_started' || selected.provisioning_status === 'failed') ? <Button onClick={() => void provision(selected)} disabled={busyId === selected.id}>{t(selected.provisioning_status === 'failed' ? 'retryProvisioning' : 'provisionAccount')}</Button> : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words">{value || '—'}</p></div>
}
