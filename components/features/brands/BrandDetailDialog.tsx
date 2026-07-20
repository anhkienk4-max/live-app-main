'use client'

import { ExternalLink, Pencil } from 'lucide-react'
import { Brand, Campaign, Platform, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function BrandDetailDialog({ open, onOpenChange, brand, campaigns, platforms, users, onEdit }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brand: Brand
  campaigns: Campaign[]
  platforms: Platform[]
  users: User[]
  onEdit: () => void
}) {
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const relatedCampaigns = campaigns.filter(campaign => campaign.brand_id === brand.id)
  const platformIds = new Set(relatedCampaigns.flatMap(campaign => campaign.platform_ids || []))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="xl" className="overflow-y-auto"><DialogHeader><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3">{brand.logo_url && <img className="h-14 w-14 rounded-lg border object-contain" src={brand.logo_url} alt={brand.name} />}<div><DialogTitle className="text-2xl">{brand.name}</DialogTitle><div className="mt-2 flex gap-2"><Badge>{t(brand.status || 'active')}</Badge>{brand.category && <Badge variant="outline">{brand.category}</Badge>}</div></div></div>{currentUser && hasPermission(currentUser, 'brands.manage') && <Button onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />{t('edit')}</Button>}</div></DialogHeader>
    <div className="grid gap-4 md:grid-cols-2">
      <Section title={t('description')}><p>{brand.description || '—'}</p></Section>
      <Section title={t('contactInformation')}><p>{brand.contact_person || '—'}</p><p>{brand.contact_email || '—'}</p><p>{brand.contact_phone || '—'}</p></Section>
      <Section title={t('brandGuideline')}><p className="whitespace-pre-wrap">{brand.brand_guideline || '—'}</p></Section>
      <Section title={t('toneOfVoice')}><p>{brand.tone_of_voice || '—'}</p></Section>
      <ListSection title={t('keyProducts')} items={brand.key_products} />
      <ListSection title={t('mandatoryClaims')} items={brand.mandatory_claims} />
      <ListSection title={t('restrictedClaims')} items={brand.restricted_claims} />
      <Section title={t('dosAndDonts')}><div className="grid grid-cols-2 gap-3"><List title={t('doLabel')} items={brand.dos} /><List title={t('dontLabel')} items={brand.donts} /></div></Section>
      <Section title={t('assetsDocuments')}>{brand.asset_links?.length ? brand.asset_links.map(link => <Button key={link} nativeButton={false} render={<a href={link} target="_blank" rel="noopener noreferrer" />} variant="link" className="h-auto justify-start p-0"><ExternalLink className="mr-1 h-3 w-3" />{link}</Button>) : <p>—</p>}</Section>
      <ListSection title={t('relatedCampaigns')} items={relatedCampaigns.map(campaign => campaign.name)} />
      <ListSection title={t('relatedPlatforms')} items={platforms.filter(platform => platformIds.has(platform.id)).map(platform => platform.name)} />
      <Section title={t('notes')}><p className="whitespace-pre-wrap">{brand.notes || '—'}</p></Section>
      <Section title={t('lastUpdated')}><p>{new Date(brand.updated_at).toLocaleString()}</p><p className="text-muted-foreground">{t('updatedBy')}: {users.find(user => user.id === brand.updated_by)?.full_name || brand.updated_by || '—'}</p></Section>
    </div>
  </DialogContent></Dialog>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardContent className="space-y-1 pt-5"><h3 className="mb-2 font-semibold">{title}</h3>{children}</CardContent></Card> }
function ListSection({ title, items }: { title: string; items?: string[] }) { return <Section title={title}><List items={items} /></Section> }
function List({ title, items }: { title?: string; items?: string[] }) { return <div>{title && <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>}{items?.length ? <ul className="list-disc space-y-1 pl-5">{items.map(item => <li key={item}>{item}</li>)}</ul> : <p>—</p>}</div> }
