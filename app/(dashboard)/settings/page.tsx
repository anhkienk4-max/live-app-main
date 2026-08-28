'use client'

import * as React from 'react'
import { Bell, Bot, Plug, RotateCcw, ShieldCheck, SlidersHorizontal, UserCog, ShieldAlert } from 'lucide-react'
import { settingsService } from '@/lib/services/dataService'
import { OperationalRole, OperationalSettings, PersonalSettings } from '@/lib/types/database.types'
import { hasPermission, permissionMatrix, resolveSystemPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { getAuthMode } from '@/lib/auth/authMode'
import { PageLoadError } from '@/components/ui/page-load-error'
import { RecoveryPanel } from '@/components/features/settings/RecoveryPanel'

const roles: OperationalRole[] = ['host', 'support', 'technical']
type SettingsTab = 'personal' | 'team' | 'system' | 'integrations' | 'audit' | 'recovery'

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

export default function SettingsPage() {
  const { currentUser, users, loading, setCurrentUser } = useCurrentUser()
  const { language, setLanguage, t } = useTranslation()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = React.useState<SettingsTab>('personal')
  const [personal, setPersonal] = React.useState<PersonalSettings | null>(null)
  const [operational, setOperational] = React.useState<OperationalSettings | null>(null)
  const [system, setSystem] = React.useState<Record<string, string | number | boolean> | null>(null)
  const [savedPersonal, setSavedPersonal] = React.useState<PersonalSettings | null>(null)
  const [savedOperational, setSavedOperational] = React.useState<OperationalSettings | null>(null)
  const [savedSystem, setSavedSystem] = React.useState<Record<string, string | number | boolean> | null>(null)
  const [savingTab, setSavingTab] = React.useState<SettingsTab | null>(null)
  const [settingsLoading, setSettingsLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const showMockSwitcher = getAuthMode() === 'mock'
    && process.env.NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER === 'true'

  const loadSettings = React.useCallback(async () => {
    if (!currentUser) {
      setSettingsLoading(false)
      return
    }
    setActiveTab('personal')
    setSettingsLoading(true)
    setLoadError(null)
    try {
      const [loadedPersonal, loadedOperational, loadedSystem] = await Promise.all([
        settingsService.getPersonal(currentUser.id),
        settingsService.getOperational(),
        settingsService.getSystem(),
      ])
      const localizedPersonal = { ...loadedPersonal, language }
      setPersonal(localizedPersonal)
      setSavedPersonal(localizedPersonal)
      setOperational(loadedOperational)
      setSavedOperational(loadedOperational)
      setSystem(loadedSystem)
      setSavedSystem(loadedSystem)
    } catch (error) {
      setLoadError(error)
    } finally {
      setSettingsLoading(false)
    }
  }, [currentUser, language])

  React.useEffect(() => { void loadSettings() }, [loadSettings])

  const personalDirty = !same(personal, savedPersonal)
  const operationalDirty = !same(operational, savedOperational)
  const systemDirty = !same(system, savedSystem)
  const hasUnsavedChanges = personalDirty || operationalDirty || systemDirty

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])

  const isDirty = (tab: SettingsTab) =>
    tab === 'personal' ? personalDirty :
      tab === 'team' ? operationalDirty :
        tab === 'system' || tab === 'integrations' || tab === 'audit' ? systemDirty :
          false

  const changeTab = (next: SettingsTab) => {
    if (next !== activeTab && isDirty(activeTab) && !window.confirm(t('unsavedChangesPrompt'))) return
    setActiveTab(next)
  }

  const savePersonal = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentUser || !personal || !personal.timezone || !personal.date_format) return
    setSavingTab('personal')
    try {
      const saved = await settingsService.updatePersonal(currentUser.id, personal)
      setSavedPersonal(saved)
      setLanguage(saved.language)
      toast({ title: t('success'), description: t('settingsSaved'), variant: 'success' })
    } catch {
      toast({ title: t('error'), description: t('settingsSaveFailed'), variant: 'destructive' })
    } finally {
      setSavingTab(null)
    }
  }

  const saveOperational = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!operational || !hasPermission(currentUser, 'settings.leader')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    const counts = [operational.registration_cutoff_hours, operational.report_reminder_hours, operational.default_host_count, operational.default_support_count, operational.default_technical_count]
    if (counts.some(value => !Number.isInteger(value) || value < 0)) {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
      return
    }
    setSavingTab('team')
    try {
      const saved = await settingsService.updateOperational(operational)
      setOperational(saved)
      setSavedOperational(saved)
      toast({ title: t('success'), description: t('settingsSaved'), variant: 'success' })
    } catch {
      toast({ title: t('error'), description: t('settingsSaveFailed'), variant: 'destructive' })
    } finally {
      setSavingTab(null)
    }
  }

  const saveSystem = async (event: React.FormEvent, tab: SettingsTab = 'system') => {
    event.preventDefault()
    if (!system || !hasPermission(currentUser, 'settings.admin')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    if (Number(system.audit_retention_days) < 1) {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
      return
    }
    const visionNumbers = [
      Number(system.vision_ocr_timeout_ms),
      Number(system.vision_ocr_retry_count),
      Number(system.vision_ocr_daily_request_limit),
      Number(system.vision_ocr_monthly_request_limit),
    ]
    if (
      visionNumbers.some(value => !Number.isInteger(value) || value < 0)
      || visionNumbers[0] < 1000
      || visionNumbers[1] > 1
    ) {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
      return
    }
    setSavingTab(tab)
    try {
      const saved = await settingsService.updateSystem(system)
      setSystem(saved)
      setSavedSystem(saved)
      toast({ title: t('success'), description: t('settingsSaved'), variant: 'success' })
    } catch {
      toast({ title: t('error'), description: t('settingsSaveFailed'), variant: 'destructive' })
    } finally {
      setSavingTab(null)
    }
  }

  if (loading || settingsLoading || !currentUser) {
    return <div className="py-12 text-center">{t('loading')}</div>
  }
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { void loadSettings() }} />
  if (!personal || !operational || !system || !savedPersonal || !savedOperational || !savedSystem) {
    return <PageLoadError error={new Error(t('tryAgain'))} onRetry={() => { void loadSettings() }} />
  }

  const isLeader = hasPermission(currentUser, 'settings.leader')
  const isAdmin = hasPermission(currentUser, 'settings.admin')
  const mockVisionAvailable = process.env.NODE_ENV !== 'production'
  const visionProvider = String(system.vision_ocr_provider || 'disabled')
  const visionProviderConfigured = visionProvider === 'mock'
    ? mockVisionAvailable
    : false

  return <div className="min-w-0 space-y-6" data-testid="settings-page">
    <div><h1 className="text-3xl font-bold">{t('settings')}</h1><p className="mt-1 text-muted-foreground">{t('settingsSubtitle')}</p></div>

    {showMockSwitcher && (
      <Card className="border-dashed"><CardHeader><CardTitle className="text-base">{t('developerTools')}</CardTitle><CardDescription>{t('mockMode')}</CardDescription></CardHeader><CardContent><label className="text-sm font-medium">{t('currentProfile')}<Select value={currentUser.id} onValueChange={value => void setCurrentUser(value)}><SelectTrigger className="mt-1 max-w-md"><SelectValue /></SelectTrigger><SelectContent>{users.filter(user => user.status === 'active').map(user => <SelectItem key={user.id} value={user.id}>{user.full_name} · {resolveSystemPermission(user)}</SelectItem>)}</SelectContent></Select></label></CardContent></Card>
    )}

    <Tabs value={activeTab} onValueChange={value => changeTab(value as SettingsTab)} className="min-w-0">
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList className="h-auto w-max flex-nowrap">
          <TabsTrigger className="flex-none px-4 py-1.5" value="personal">{t('personalSettings')}{personalDirty ? ' •' : ''}</TabsTrigger>
          {isLeader && <TabsTrigger className="flex-none px-4 py-1.5" value="team">{t('teamSettings')}{operationalDirty ? ' •' : ''}</TabsTrigger>}
          {isAdmin && <TabsTrigger className="flex-none px-4 py-1.5" value="system">{t('systemSettings')}{systemDirty ? ' •' : ''}</TabsTrigger>}
          {isAdmin && <TabsTrigger className="flex-none px-4 py-1.5" value="integrations">{t('integrations')}</TabsTrigger>}
          {isAdmin && <TabsTrigger className="flex-none px-4 py-1.5" value="audit">{t('audit')}</TabsTrigger>}
          {isAdmin && <TabsTrigger className="flex-none px-4 py-1.5" value="recovery">Recovery</TabsTrigger>}
        </TabsList>
      </div>

      <TabsContent value="personal">
        <form onSubmit={savePersonal}>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" />{t('personalSettings')}</CardTitle><CardDescription>{currentUser.email}</CardDescription></CardHeader><CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <SettingSelect label={t('language')} value={personal.language} options={[{ id: 'en', name: t('english') }, { id: 'vi', name: t('vietnamese') }]} onChange={value => setPersonal(current => current && ({ ...current, language: value as 'en' | 'vi' }))} />
              <SettingSelect label={t('timezone')} value={personal.timezone} options={[{ id: 'Asia/Ho_Chi_Minh', name: 'Asia/Ho_Chi_Minh' }, { id: 'UTC', name: 'UTC' }, { id: 'Asia/Singapore', name: 'Asia/Singapore' }]} onChange={value => setPersonal(current => current && ({ ...current, timezone: value }))} />
              <SettingSelect label={t('dateFormat')} value={personal.date_format} options={[{ id: 'dd/MM/yyyy', name: 'DD/MM/YYYY' }, { id: 'MM/dd/yyyy', name: 'MM/DD/YYYY' }, { id: 'yyyy-MM-dd', name: 'YYYY-MM-DD' }]} onChange={value => setPersonal(current => current && ({ ...current, date_format: value }))} />
              <SettingSelect label={t('defaultCalendarView')} value={personal.default_calendar_view} options={['month','week','day','list'].map(value => ({ id: value, name: t(value as 'month' | 'week' | 'day' | 'list') }))} onChange={value => setPersonal(current => current && ({ ...current, default_calendar_view: value as PersonalSettings['default_calendar_view'] }))} />
              <ToggleSetting label={t('notifications')} checked={personal.notifications_enabled} onChange={checked => setPersonal(current => current && ({ ...current, notifications_enabled: checked }))} />
            </div>
            <div><p className="mb-2 text-sm font-medium">{t('registrationPreferences')}</p><div className="flex flex-wrap gap-2">{roles.map(role => { const active = personal.preferred_roles.includes(role); return <Button type="button" key={role} variant={active ? 'default' : 'outline'} onClick={() => setPersonal(current => current && ({ ...current, preferred_roles: active ? current.preferred_roles.filter(item => item !== role) : [...current.preferred_roles, role] }))}>{t(role)}</Button> })}</div></div>
            <Actions dirty={personalDirty} saving={savingTab === 'personal'} onReset={() => setPersonal(savedPersonal)} />
          </CardContent></Card>
        </form>
      </TabsContent>

      {isLeader && <TabsContent value="team"><form onSubmit={saveOperational}>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" />{t('teamSettings')}</CardTitle><CardDescription>{t('approvalPreferences')}</CardDescription></CardHeader><CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <NumberSetting label={`${t('registrationCutoff')} (hours)`} value={operational.registration_cutoff_hours} onChange={value => setOperational(current => current && ({ ...current, registration_cutoff_hours: value }))} />
            <NumberSetting label={`${t('reportReminders')} (hours)`} value={operational.report_reminder_hours} onChange={value => setOperational(current => current && ({ ...current, report_reminder_hours: value }))} />
            <ToggleSetting label={t('approvalPreferences')} checked={operational.require_registration_approval} onChange={checked => setOperational(current => current && ({ ...current, require_registration_approval: checked }))} />
            <ToggleSetting label={t('teamNotifications')} checked={operational.team_notifications_enabled} onChange={checked => setOperational(current => current && ({ ...current, team_notifications_enabled: checked }))} />
            <ToggleSetting label={t('swapRules')} checked={operational.swap_approval_required} onChange={checked => setOperational(current => current && ({ ...current, swap_approval_required: checked }))} />
            <ToggleSetting label={t('lockShift')} checked={operational.auto_lock_filled_shifts} onChange={checked => setOperational(current => current && ({ ...current, auto_lock_filled_shifts: checked }))} />
            <ToggleSetting label={t('multiRoleBlocked')} checked={!operational.allow_multi_role_per_shift} onChange={checked => setOperational(current => current && ({ ...current, allow_multi_role_per_shift: !checked }))} />
            <ToggleSetting label={t('reportOcrReview')} checked={operational.require_report_review} onChange={checked => setOperational(current => current && ({ ...current, require_report_review: checked }))} />
          </div>
          <div><p className="mb-2 text-sm font-medium">{t('staffingDefaults')}</p><div className="grid gap-3 sm:grid-cols-3"><CountInput label={t('host')} value={operational.default_host_count} onChange={value => setOperational(current => current && ({ ...current, default_host_count: value }))} /><CountInput label={t('support')} value={operational.default_support_count} onChange={value => setOperational(current => current && ({ ...current, default_support_count: value }))} /><CountInput label={t('technical')} value={operational.default_technical_count} onChange={value => setOperational(current => current && ({ ...current, default_technical_count: value }))} /></div></div>
          <Actions dirty={operationalDirty} saving={savingTab === 'team'} onReset={() => setOperational(savedOperational)} />
        </CardContent></Card>
      </form></TabsContent>}

      {isAdmin && <TabsContent value="system"><form onSubmit={saveSystem}>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />{t('systemSettings')}</CardTitle><CardDescription>{t('credentialsSafe')}</CardDescription></CardHeader><CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <ToggleSetting label={t('exportSettings')} checked={Boolean(system.export_include_metadata)} onChange={checked => setSystem(current => current && ({ ...current, export_include_metadata: checked }))} />
            <ToggleSetting label={t('importSettings')} checked={Boolean(system.import_duplicate_warning)} onChange={checked => setSystem(current => current && ({ ...current, import_duplicate_warning: checked }))} />
            <ToggleSetting label={t('publicCsvImport')} checked={Boolean(system.import_allow_public_csv)} onChange={checked => setSystem(current => current && ({ ...current, import_allow_public_csv: checked }))} />
            <ToggleSetting label={t('maintenanceTools')} checked={Boolean(system.maintenance_mode)} onChange={checked => setSystem(current => current && ({ ...current, maintenance_mode: checked }))} />
            <SettingSelect label={t('exportFileFormat')} value={String(system.export_file_format)} options={[{ id: 'xlsx', name: 'XLSX' }]} onChange={value => setSystem(current => current && ({ ...current, export_file_format: value }))} />
            <SettingSelect label={t('brandDefaults')} value={String(system.brand_default_status)} options={[{ id: 'active', name: t('active') }, { id: 'draft', name: t('draft') }]} onChange={value => setSystem(current => current && ({ ...current, brand_default_status: value }))} />
            <SettingSelect label={t('platformDefaults')} value={String(system.platform_default_status)} options={[{ id: 'active', name: t('active') }, { id: 'draft', name: t('draft') }]} onChange={value => setSystem(current => current && ({ ...current, platform_default_status: value }))} />
            <SettingSelect label={t('campaignDefaults')} value={String(system.campaign_default_status)} options={[{ id: 'draft', name: t('draft') }, { id: 'active', name: t('active') }]} onChange={value => setSystem(current => current && ({ ...current, campaign_default_status: value }))} />
            <SettingSelect label={t('localizationSettings')} value={String(system.localization_default)} options={[{ id: 'en', name: t('english') }, { id: 'vi', name: t('vietnamese') }]} onChange={value => setSystem(current => current && ({ ...current, localization_default: value }))} />
            <ReadOnlySetting label={t('ocrConfiguration')} value={String(system.ocr_provider)} />
          </div>
          <div><h3 className="mb-3 font-semibold">{t('systemPermissions')}</h3><div className="grid gap-3 md:grid-cols-3">{(['member','leader','admin'] as const).map(level => <div key={level} className="rounded-lg border p-3"><p className="font-medium">{t(level)}</p><p className="mt-1 text-xs text-muted-foreground">{permissionMatrix[level].size} {t('permissions')}</p></div>)}</div></div>
          <div><h3 className="mb-3 font-semibold">{t('operationalRoles')}</h3><div className="grid gap-3 md:grid-cols-3">{roles.map(role => <div className="rounded-lg border p-3" key={role}><p className="text-sm font-medium">{t(role)}</p><Badge className="mt-2 bg-green-100 text-green-800">{t('active')}</Badge></div>)}</div></div>
          <Actions dirty={systemDirty} saving={savingTab === 'system'} onReset={() => setSystem(savedSystem)} />
        </CardContent></Card>
      </form></TabsContent>}

      {isAdmin && <TabsContent value="integrations"><form onSubmit={event => void saveSystem(event, 'integrations')}>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" />{t('integrations')}</CardTitle><CardDescription>{t('credentialsSafe')}</CardDescription></CardHeader><CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3"><ReadOnlySetting label={t('integrationSettings')} value={String(system.integration_mode)} /><ReadOnlySetting label={t('supabaseStatus')} value={String(system.supabase_connection_status)} /><ReadOnlySetting label={t('ocrConfiguration')} value={String(system.ocr_provider)} /></div>
          <section className="space-y-4 rounded-lg border p-4" data-testid="vision-ocr-admin-settings">
            <div><h3 className="flex items-center gap-2 font-semibold"><Bot className="h-5 w-5" />{t('visionOcrSettings')}</h3><p className="mt-1 text-sm text-muted-foreground">{t('visionOcrSettingsHelp')}</p></div>
            <div className="grid gap-4 md:grid-cols-3">
              <ToggleSetting label={t('visionOcrEnabled')} checked={Boolean(system.vision_ocr_enabled)} onChange={checked => setSystem(current => current && ({ ...current, vision_ocr_enabled: checked }))} />
              <SettingSelect label={t('visionOcrProvider')} value={visionProvider} options={[{ id: 'disabled', name: t('visionOcrDisabled') }, ...(mockVisionAvailable ? [{ id: 'mock', name: 'Mock' }] : []), { id: 'openai', name: 'OpenAI' }]} onChange={value => setSystem(current => current && ({ ...current, vision_ocr_provider: value, vision_ocr_provider_configured: value === 'mock' && mockVisionAvailable }))} />
              <ReadOnlySetting label={t('visionOcrProviderState')} value={visionProviderConfigured ? t('visionOcrConfigured') : t('visionOcrNotConfiguredState')} />
              <SettingSelect label={t('visionOcrDefaultMode')} value={String(system.vision_ocr_default_mode || 'local')} options={[{ id: 'local', name: t('visionOcrQuickScan') }, { id: 'ai', name: t('visionOcrAiScan') }, { id: 'compare', name: t('visionOcrCompareScan') }]} onChange={value => setSystem(current => current && ({ ...current, vision_ocr_default_mode: value }))} />
              <label className="text-sm font-medium">{t('visionOcrModelIdentifier')}<Input className="mt-1" value={String(system.vision_ocr_model || '')} maxLength={120} onChange={event => setSystem(current => current && ({ ...current, vision_ocr_model: event.target.value }))} /></label>
              <NumberSetting label={t('visionOcrTimeoutMs')} min={1000} value={finiteNumber(system.vision_ocr_timeout_ms, 30000)} onChange={value => setSystem(current => current && ({ ...current, vision_ocr_timeout_ms: value }))} />
              <NumberSetting label={t('visionOcrRetryCount')} value={finiteNumber(system.vision_ocr_retry_count, 0)} onChange={value => setSystem(current => current && ({ ...current, vision_ocr_retry_count: Math.min(1, value) }))} />
              <NumberSetting label={t('visionOcrDailyLimit')} min={1} value={finiteNumber(system.vision_ocr_daily_request_limit, 25)} onChange={value => setSystem(current => current && ({ ...current, vision_ocr_daily_request_limit: value }))} />
              <NumberSetting label={t('visionOcrMonthlyLimit')} min={1} value={finiteNumber(system.vision_ocr_monthly_request_limit, 500)} onChange={value => setSystem(current => current && ({ ...current, vision_ocr_monthly_request_limit: value }))} />
              <ToggleSetting label={t('visionOcrAllowTikTok')} checked={Boolean(system.vision_ocr_allow_tiktok)} onChange={checked => setSystem(current => current && ({ ...current, vision_ocr_allow_tiktok: checked }))} />
              <ToggleSetting label={t('visionOcrAllowShopee')} checked={Boolean(system.vision_ocr_allow_shopee)} onChange={checked => setSystem(current => current && ({ ...current, vision_ocr_allow_shopee: checked }))} />
              <ToggleSetting label={t('visionOcrDiagnosticsRetention')} checked={Boolean(system.vision_ocr_diagnostics_retention)} onChange={checked => setSystem(current => current && ({ ...current, vision_ocr_diagnostics_retention: checked }))} />
            </div>
            <p className="text-sm text-muted-foreground">{t('visionOcrMockDevelopmentOnly')}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={!mockVisionAvailable || visionProvider !== 'mock'} onClick={() => toast({ title: t('visionOcrTestMock'), description: t('visionOcrConfigured'), variant: 'success' })}>{t('visionOcrTestMock')}</Button>
              <Button type="button" variant="outline" onClick={() => setSystem(current => current && ({ ...current, vision_ocr_enabled: false, vision_ocr_provider: 'disabled', vision_ocr_provider_configured: false, vision_ocr_default_mode: 'local' }))}>{t('visionOcrDisable')}</Button>
              <Button type="button" variant="outline" onClick={() => setSystem(current => current && ({ ...current, vision_ocr_provider: 'disabled', vision_ocr_provider_configured: false, vision_ocr_model: 'openai-not-configured' }))}>{t('visionOcrClearConfiguration')}</Button>
            </div>
          </section>
          <p className="text-sm text-muted-foreground">{t('integrationSecretsNotice')}</p>
          <Actions dirty={systemDirty} saving={savingTab === 'integrations'} onReset={() => setSystem(savedSystem)} />
        </CardContent></Card>
      </form></TabsContent>}

      {isAdmin && <TabsContent value="audit"><form onSubmit={event => void saveSystem(event, 'audit')}>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />{t('audit')}</CardTitle><CardDescription>{t('auditSettings')}</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><ToggleSetting label={t('auditEnabled')} checked={Boolean(system.audit_enabled)} onChange={checked => setSystem(current => current && ({ ...current, audit_enabled: checked }))} /><NumberSetting label={t('auditRetentionDays')} min={1} value={finiteNumber(system.audit_retention_days, 90)} onChange={value => setSystem(current => current && ({ ...current, audit_retention_days: value }))} /></div><div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{t('auditMockNotice')}</div><Actions dirty={systemDirty} saving={savingTab === 'audit'} onReset={() => setSystem(savedSystem)} /></CardContent></Card>
      </form></TabsContent>}

      {isAdmin && <TabsContent value="recovery">
        <RecoveryPanel />
      </TabsContent>}
    </Tabs>
  </div>
}

function Actions({ dirty, saving, onReset }: { dirty: boolean; saving: boolean; onReset: () => void }) {
  const { t } = useTranslation()
  return <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={!dirty || saving} onClick={onReset}><RotateCcw className="mr-2 h-4 w-4" />{t('reset')}</Button><Button type="submit" disabled={!dirty || saving}>{saving ? t('loading') : t('saveSettings')}</Button></div>
}
function SettingSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) { return <label className="text-sm font-medium">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></label> }
function ToggleSetting({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <div className="flex items-center justify-between gap-3 rounded-lg border p-3"><span className="text-sm font-medium">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div> }
function NumberSetting({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) { return <label className="text-sm font-medium">{label}<Input className="mt-1" type="number" min={min} step="1" value={value} onChange={event => onChange(Number(event.target.value))} /></label> }
function CountInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <NumberSetting label={label} value={value} onChange={onChange} /> }
function ReadOnlySetting({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-3"><p className="text-sm font-medium">{label}</p><Badge variant="outline" className="mt-2">{value}</Badge></div> }
function finiteNumber(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback }
