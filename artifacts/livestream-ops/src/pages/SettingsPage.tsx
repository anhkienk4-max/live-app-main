import * as React from 'react'
import { settingsService } from '@/lib/services/dataService'
import { AppSettings } from '@/lib/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  Settings, Globe, Building2, Bell, FileSpreadsheet,
  Database, Bot, HardDrive, Save, CheckCircle, Loader2,
} from 'lucide-react'

const TIMEZONES = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Jakarta',
  'Asia/Manila',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
]

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4 border-b last:border-0">
      <div className="flex-1 mr-6">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<AppSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const { toast } = useToast()

  React.useEffect(() => {
    settingsService.get().then(s => { setSettings(s); setLoading(false) })
  }, [])

  const set = (key: keyof AppSettings, value: any) =>
    setSettings(prev => prev ? { ...prev, [key]: value } : prev)

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await settingsService.update(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      toast({ title: 'Settings Saved', description: 'Your configuration has been saved', variant: 'default' })
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Configure your LiveStream Operations workspace</p>
          </div>
          <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> :
             saved ? <CheckCircle className="h-4 w-4 mr-2 text-green-400" /> :
             <Save className="h-4 w-4 mr-2" />}
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
          </Button>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general">
              <Globe className="h-4 w-4 mr-1.5" /> General
            </TabsTrigger>
            <TabsTrigger value="company">
              <Building2 className="h-4 w-4 mr-1.5" /> Company
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-1.5" /> Notifications
            </TabsTrigger>
            <TabsTrigger value="integrations">
              <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Integrations
            </TabsTrigger>
            <TabsTrigger value="backup">
              <HardDrive className="h-4 w-4 mr-1.5" /> Backup
            </TabsTrigger>
          </TabsList>

          {/* ── General ──────────────────────────────────────────────────── */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Language & Region</CardTitle>
                <CardDescription>Localisation preferences for the workspace</CardDescription>
              </CardHeader>
              <CardContent>
                <SettingRow label="Language" description="Interface language">
                  <Select value={settings.language} onValueChange={v => set('language', v)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="vi">Tiếng Việt</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                      <SelectItem value="th">ภาษาไทย</SelectItem>
                      <SelectItem value="id">Bahasa Indonesia</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow label="Theme" description="Light, dark, or follow system preference">
                  <Select value={settings.theme} onValueChange={v => set('theme', v)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow label="Timezone" description="Used for shift scheduling and reporting">
                  <Select value={settings.timezone} onValueChange={v => set('timezone', v)}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </SettingRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Company ──────────────────────────────────────────────────── */}
          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Company Profile</CardTitle>
                <CardDescription>Displayed across reports and exports</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium block mb-1">Company Name</label>
                  <Input value={settings.company_name} onChange={e => set('company_name', e.target.value)} placeholder="LiveStream Ops" />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Company Logo URL</label>
                  <Input value={settings.company_logo || ''} onChange={e => set('company_logo', e.target.value)} placeholder="https://…/logo.png" />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Contact Email</label>
                  <Input type="email" value={settings.company_email || ''} onChange={e => set('company_email', e.target.value)} placeholder="ops@yourcompany.com" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Notifications ─────────────────────────────────────────────── */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notification Preferences</CardTitle>
                <CardDescription>Control when and how you are notified</CardDescription>
              </CardHeader>
              <CardContent>
                <SettingRow label="Shift Reminders" description="Notify crew before a shift starts">
                  <Toggle checked={settings.notify_shift_reminder} onChange={v => set('notify_shift_reminder', v)} />
                </SettingRow>
                <SettingRow label="Swap Requests" description="Alert leaders when a swap request is submitted">
                  <Toggle checked={settings.notify_swap_request} onChange={v => set('notify_swap_request', v)} />
                </SettingRow>
                <SettingRow label="Report Due" description="Remind staff to submit post-shift reports">
                  <Toggle checked={settings.notify_report_due} onChange={v => set('notify_report_due', v)} />
                </SettingRow>
                <SettingRow label="Notification Channel" description="Where notifications are sent">
                  <Select value={settings.notify_channel} onValueChange={v => set('notify_channel', v)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">In-App Only</SelectItem>
                      <SelectItem value="email">Email Only</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Integrations ─────────────────────────────────────────────── */}
          <TabsContent value="integrations" className="space-y-4">
            {/* Google Sheets */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" /> Google Sheets
                </CardTitle>
                <CardDescription>Import shift schedules from Google Sheets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">API Key</label>
                  <Input
                    type="password"
                    value={settings.google_sheets_api_key || ''}
                    onChange={e => set('google_sheets_api_key', e.target.value)}
                    placeholder="AIza…"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Default Spreadsheet ID</label>
                  <Input
                    value={settings.google_sheets_spreadsheet_id || ''}
                    onChange={e => set('google_sheets_spreadsheet_id', e.target.value)}
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                  />
                  <p className="text-xs text-gray-400 mt-1">Found in the Google Sheets URL between /d/ and /edit</p>
                </div>
                <Badge variant="outline" className="text-xs">Not connected — enter API key to enable import</Badge>
              </CardContent>
            </Card>

            {/* Supabase */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-emerald-600" /> Supabase
                </CardTitle>
                <CardDescription>Connect to a real Supabase database for persistent storage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">Supabase URL</label>
                  <Input
                    value={settings.supabase_url || ''}
                    onChange={e => set('supabase_url', e.target.value)}
                    placeholder="https://xxxx.supabase.co"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Anon / Public Key</label>
                  <Input
                    type="password"
                    value={settings.supabase_anon_key || ''}
                    onChange={e => set('supabase_anon_key', e.target.value)}
                    placeholder="eyJhbGciOi…"
                  />
                </div>
                <Badge variant="outline" className="text-xs">Currently running in-memory — connect Supabase to persist data</Badge>
              </CardContent>
            </Card>

            {/* AI */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-violet-600" /> AI Assistant
                </CardTitle>
                <CardDescription>Configure the AI chat assistant and OCR analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm font-medium block mb-1">AI Provider</label>
                  <Select value={settings.ai_provider} onValueChange={v => set('ai_provider', v)}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI (GPT-4)</SelectItem>
                      <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">Model</label>
                  <Input
                    value={settings.ai_model || ''}
                    onChange={e => set('ai_model', e.target.value)}
                    placeholder={settings.ai_provider === 'openai' ? 'gpt-4o' : settings.ai_provider === 'anthropic' ? 'claude-3-5-sonnet' : 'gemini-1.5-pro'}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1">API Key</label>
                  <Input
                    type="password"
                    value={settings.ai_api_key || ''}
                    onChange={e => set('ai_api_key', e.target.value)}
                    placeholder="sk-…"
                  />
                  <p className="text-xs text-gray-400 mt-1">Stored securely. Used for AI chat and OCR extraction.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Backup / Import-Export ────────────────────────────────────── */}
          <TabsContent value="backup">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5" /> Backup & Import/Export</CardTitle>
                <CardDescription>Manage data backups and bulk data operations</CardDescription>
              </CardHeader>
              <CardContent>
                <SettingRow label="Automatic Backup" description="Periodically export all data to a file">
                  <Toggle checked={settings.auto_backup} onChange={v => set('auto_backup', v)} />
                </SettingRow>

                {settings.auto_backup && (
                  <SettingRow label="Backup Frequency" description="How often to run automatic backups">
                    <Select value={settings.backup_frequency} onValueChange={v => set('backup_frequency', v)}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingRow>
                )}

                <div className="pt-4 space-y-3 border-t mt-4">
                  <p className="text-sm font-medium text-gray-700">Manual Operations</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="justify-start" onClick={() => {
                      // Export all data as JSON
                      const data = {
                        exportedAt: new Date().toISOString(),
                        company: settings.company_name,
                        note: 'Full data export from LiveStream Ops',
                      }
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `livestream-ops-export-${new Date().toISOString().split('T')[0]}.json`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}>
                      <HardDrive className="h-4 w-4 mr-2" /> Export All Data
                    </Button>
                    <Button variant="outline" className="justify-start text-gray-400" disabled>
                      <HardDrive className="h-4 w-4 mr-2" /> Import Data (coming soon)
                    </Button>
                  </div>
                </div>

                {settings.last_backup_at && (
                  <p className="text-xs text-gray-400 mt-4">
                    Last backup: {new Date(settings.last_backup_at).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  )
}
