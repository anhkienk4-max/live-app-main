'use client'

import * as React from 'react'
import { AlertCircle, CheckCircle, Download, RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { useTranslation } from '@/lib/i18n'

type ValidationStatus = 'PASS' | 'WARNING' | 'FAIL' | 'IDLE' | 'LOADING'

interface ValidationResult {
  timestamp: string
  status: ValidationStatus
  checks: {
    tablesExist: boolean
    orphans: { kind: string; count: number }[]
    rowCounts: Record<string, number>
    migrationLineageOk: boolean
    authIdentityConsistent: boolean
    registrationIntegrityOk: boolean
    swapIntegrityOk: boolean
    reportIntegrityOk: boolean
  }
  warnings: string[]
  failures: string[]
  nextSteps: string[]
}

export function RecoveryPanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [validateStatus, setValidateStatus] = React.useState<'idle' | 'loading' | 'done'>('idle')
  const [validationResult, setValidationResult] = React.useState<ValidationResult | null>(null)
  const [exportLoading, setExportLoading] = React.useState(false)

  const runValidation = async () => {
    setValidateStatus('loading')
    try {
      const res = await fetch('/api/admin/recovery/validate')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setValidationResult(data)
      setValidateStatus('done')
      toast({ title: 'Validation complete', variant: 'success' })
    } catch (error) {
      toast({ title: 'Validation failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
      setValidateStatus('idle')
    }
  }

  const exportData = async () => {
    setExportLoading(true)
    try {
      const res = await fetch('/api/admin/recovery/export')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      // Download as JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `emergency-export-${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'Export downloaded', variant: 'success' })
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setExportLoading(false)
    }
  }

  const getStatusBadge = (status: ValidationStatus) => {
    switch (status) {
      case 'PASS': return <Badge className="bg-green-100 text-green-800">PASS</Badge>
      case 'WARNING': return <Badge className="bg-yellow-100 text-yellow-800">WARNING</Badge>
      case 'FAIL': return <Badge className="bg-red-100 text-red-800">FAIL</Badge>
      default: return null
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Recovery Validation
          </CardTitle>
          <CardDescription>Read-only health check of Core V1 operational data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runValidation} disabled={validateStatus === 'loading'}>
            <RefreshCw className={validateStatus === 'loading' ? 'animate-spin mr-2 h-4 w-4' : 'mr-2 h-4 w-4'} />
            {validateStatus === 'loading' ? 'Validating...' : 'Run Validation'}
          </Button>

          {validationResult && (
            <div className="space-y-3 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status: {getStatusBadge(validationResult.status)}</span>
                <span className="text-xs text-muted-foreground">{new Date(validationResult.timestamp).toLocaleString()}</span>
              </div>

              <div className="grid gap-2 text-sm">
                <div className="flex justify-between"><span>Tables exist:</span> {validationResult.checks.tablesExist ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}</div>
                <div className="flex justify-between"><span>Migration lineage:</span> {validationResult.checks.migrationLineageOk ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}</div>
                <div className="flex justify-between"><span>Auth identity:</span> {validationResult.checks.authIdentityConsistent ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}</div>
                <div className="flex justify-between"><span>Registration integrity:</span> {validationResult.checks.registrationIntegrityOk ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}</div>
                <div className="flex justify-between"><span>Swap integrity:</span> {validationResult.checks.swapIntegrityOk ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}</div>
                <div className="flex justify-between"><span>Report integrity:</span> {validationResult.checks.reportIntegrityOk ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}</div>
              </div>

              {validationResult.checks.orphans.length > 0 && (
                <div>
                  <p className="text-sm font-medium">Orphans ({validationResult.checks.orphans.length})</p>
                  <ul className="text-xs space-y-1">
                    {validationResult.checks.orphans.map(o => (
                      <li key={o.kind}>{o.kind}: {o.count}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.warnings.length > 0 && (
                <div className="bg-yellow-50 p-2 rounded">
                  <p className="text-sm font-medium text-yellow-800">Warnings</p>
                  <ul className="text-xs space-y-1 text-yellow-700">
                    {validationResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {validationResult.failures.length > 0 && (
                <div className="bg-red-50 p-2 rounded">
                  <p className="text-sm font-medium text-red-800">Failures</p>
                  <ul className="text-xs space-y-1 text-red-700">
                    {validationResult.failures.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}

              <div className="text-sm">
                <p className="font-medium">Next steps:</p>
                <ul className="text-xs list-disc list-inside">
                  {validationResult.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Emergency Export
          </CardTitle>
          <CardDescription>Export safe operational dataset (Admin only, no sensitive fields)</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={exportData} disabled={exportLoading}>
            <Download className="mr-2 h-4 w-4" />
            {exportLoading ? 'Exporting...' : 'Export Operational Data (JSON)'}
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Includes schedule, staffing, users, reports, swaps, and master data. No secrets, tokens, or PII.</p>
        </CardContent>
      </Card>
    </div>
  )
}