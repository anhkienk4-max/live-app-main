'use client'

import * as React from 'react'
import { brandService, currentUserService } from '@/lib/services/dataService'
import { Brand, KnowledgeStatus } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'

interface BrandFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brand?: Brand | null
  onSuccess: () => void
}

const list = (value?: string[]) => value?.join('\n') || ''
const toList = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean)
const initial = (brand?: Brand | null) => ({
  name: brand?.name || '',
  logo_url: brand?.logo_url || '',
  color: brand?.color || '#2563EB',
  description: brand?.description || '',
  category: brand?.category || '',
  status: brand?.status || 'active' as KnowledgeStatus,
  contact_person: brand?.contact_person || '',
  contact_email: brand?.contact_email || '',
  contact_phone: brand?.contact_phone || '',
  brand_guideline: brand?.brand_guideline || '',
  tone_of_voice: brand?.tone_of_voice || '',
  key_products: list(brand?.key_products),
  mandatory_claims: list(brand?.mandatory_claims),
  restricted_claims: list(brand?.restricted_claims),
  dos: list(brand?.dos),
  donts: list(brand?.donts),
  asset_links: list(brand?.asset_links),
  notes: brand?.notes || '',
})

export function BrandFormDialog({ open, onOpenChange, brand, onSuccess }: BrandFormDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { currentUser } = useCurrentUser()
  const [form, setForm] = React.useState(initial(brand))
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { if (open) setForm(initial(brand)) }, [brand, open])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentUser || !hasPermission(currentUser, 'brands.manage')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    if (!form.name.trim()) {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
      return
    }
    setSaving(true)
    const data = {
      ...form,
      name: form.name.trim(),
      logo_url: form.logo_url || undefined,
      key_products: toList(form.key_products),
      mandatory_claims: toList(form.mandatory_claims),
      restricted_claims: toList(form.restricted_claims),
      dos: toList(form.dos),
      donts: toList(form.donts),
      asset_links: toList(form.asset_links),
      updated_by: currentUserService.getId(),
    }
    try {
      if (brand) await brandService.update(brand.id, data)
      else await brandService.create(data)
      toast({ title: t('success'), description: t(brand ? 'update' : 'create'), variant: 'success' })
      onSuccess()
      onOpenChange(false)
    } catch {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="lg" className="overflow-y-auto"><DialogHeader><DialogTitle>{brand ? t('edit') : t('create')} {t('brand')}</DialogTitle><DialogDescription>{t('brandKnowledge')}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5">
    <div className="grid gap-4 md:grid-cols-3">
      <Field label={`${t('brand')} *`} value={form.name} onChange={value => setForm(current => ({ ...current, name: value }))} required />
      <Field label="Logo URL" value={form.logo_url} onChange={value => setForm(current => ({ ...current, logo_url: value }))} />
      <Field label="Color" value={form.color} onChange={value => setForm(current => ({ ...current, color: value }))} type="color" />
      <Field label={t('category')} value={form.category} onChange={value => setForm(current => ({ ...current, category: value }))} />
      <label className="text-sm font-medium">{t('status')}<Select value={form.status} onValueChange={value => setForm(current => ({ ...current, status: value as KnowledgeStatus }))}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent>{(['active','inactive','draft'] as KnowledgeStatus[]).map(status => <SelectItem value={status} key={status}>{t(status)}</SelectItem>)}</SelectContent></Select></label>
      <Field label={t('contactPerson')} value={form.contact_person} onChange={value => setForm(current => ({ ...current, contact_person: value }))} />
      <Field label="Contact email" value={form.contact_email} onChange={value => setForm(current => ({ ...current, contact_email: value }))} type="email" />
      <Field label="Contact phone" value={form.contact_phone} onChange={value => setForm(current => ({ ...current, contact_phone: value }))} />
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      <Area label={t('description')} value={form.description} onChange={value => setForm(current => ({ ...current, description: value }))} />
      <Area label={t('brandGuideline')} value={form.brand_guideline} onChange={value => setForm(current => ({ ...current, brand_guideline: value }))} />
      <Area label={t('toneOfVoice')} value={form.tone_of_voice} onChange={value => setForm(current => ({ ...current, tone_of_voice: value }))} />
      <Area label={`${t('keyProducts')} · one per line`} value={form.key_products} onChange={value => setForm(current => ({ ...current, key_products: value }))} />
      <Area label={`${t('mandatoryClaims')} · one per line`} value={form.mandatory_claims} onChange={value => setForm(current => ({ ...current, mandatory_claims: value }))} />
      <Area label={`${t('restrictedClaims')} · one per line`} value={form.restricted_claims} onChange={value => setForm(current => ({ ...current, restricted_claims: value }))} />
      <Area label="Do · one per line" value={form.dos} onChange={value => setForm(current => ({ ...current, dos: value }))} />
      <Area label="Don't · one per line" value={form.donts} onChange={value => setForm(current => ({ ...current, donts: value }))} />
      <Area label={`${t('assetsDocuments')} · one URL per line`} value={form.asset_links} onChange={value => setForm(current => ({ ...current, asset_links: value }))} />
      <Area label={t('notes')} value={form.notes} onChange={value => setForm(current => ({ ...current, notes: value }))} />
    </div>
    <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button><Button type="submit" disabled={saving}>{saving ? t('loading') : t('save')}</Button></DialogFooter>
  </form></DialogContent></Dialog>
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="text-sm font-medium">{label}<Input className="mt-1" type={type} value={value} required={required} onChange={event => onChange(event.target.value)} /></label> }
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-medium">{label}<Textarea className="mt-1" rows={3} value={value} onChange={event => onChange(event.target.value)} /></label> }
