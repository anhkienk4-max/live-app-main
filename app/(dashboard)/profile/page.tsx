'use client'

import * as React from 'react'
import { Briefcase, Camera, Mail, Phone, Trash2, User as UserIcon, X } from 'lucide-react'
import { userService } from '@/lib/services/dataService'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

const acceptedAvatarTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])
const maxAvatarBytes = 5 * 1024 * 1024

export default function ProfilePage() {
  const { currentUser, loading, reload } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const objectUrlRef = React.useRef<string | null>(null)
  const [form, setForm] = React.useState({ full_name: '', phone: '', department: '' })
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null)
  const [removeAvatar, setRemoveAvatar] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const revokePreview = React.useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  React.useEffect(() => () => revokePreview(), [revokePreview])
  React.useEffect(() => {
    if (currentUser) {
      setForm({ full_name: currentUser.full_name, phone: currentUser.phone || '', department: currentUser.department || '' })
    }
  }, [currentUser])

  if (loading || !currentUser) return <div className="py-12 text-center">{t('loading')}</div>

  const canEdit = hasPermission(currentUser, 'profile.edit_own')
  const initials = currentUser.full_name.split(' ').map(part => part[0]).join('').toUpperCase()
  const displayedAvatar = avatarPreview || (!removeAvatar ? currentUser.avatar_url : undefined)
  const avatarDirty = Boolean(avatarFile || removeAvatar)

  const cancelAvatarChange = () => {
    revokePreview()
    setAvatarPreview(null)
    setAvatarFile(null)
    setRemoveAvatar(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const selectAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!acceptedAvatarTypes.has(file.type)) {
      toast({ title: t('error'), description: t('avatarTypeError'), variant: 'destructive' })
      event.target.value = ''
      return
    }
    if (file.size > maxAvatarBytes) {
      toast({ title: t('error'), description: t('avatarSizeError'), variant: 'destructive' })
      event.target.value = ''
      return
    }
    revokePreview()
    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl
    setAvatarPreview(objectUrl)
    setAvatarFile(file)
    setRemoveAvatar(false)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canEdit) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    if (!form.full_name.trim()) {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      let avatarUrl = removeAvatar ? undefined : currentUser.avatar_url
      let storagePath = removeAvatar ? undefined : currentUser.avatar_storage_path
      if (avatarFile) {
        avatarUrl = await fileToDataUrl(avatarFile)
        storagePath = `mock/profiles/${currentUser.id}/avatar/${avatarFile.name}`
      }
      await userService.update(currentUser.id, {
        ...form,
        full_name: form.full_name.trim(),
        avatar_url: avatarUrl,
        avatar_storage_path: storagePath,
      })
      cancelAvatarChange()
      await reload()
      toast({ title: t('success'), description: avatarDirty ? t('avatarSaved') : t('profileSaved'), variant: 'success' })
    } catch {
      toast({ title: t('error'), description: t('profileSaveFailed'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold">{t('profile')}</h1><p className="mt-1 text-muted-foreground">{t('accountDetails')}</p></div>
    <form onSubmit={save}>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader className="items-center text-center">
          <Avatar className="h-24 w-24"><AvatarImage src={displayedAvatar} /><AvatarFallback>{initials}</AvatarFallback></Avatar>
          <CardTitle>{currentUser.full_name}</CardTitle><CardDescription>{currentUser.email}</CardDescription>
          <div className="flex flex-wrap justify-center gap-2"><Badge>{t(resolveSystemPermission(currentUser))}</Badge>{currentUser.operational_roles?.map(role => <Badge key={role} variant="outline">{t(role)}</Badge>)}</div>
        </CardHeader><CardContent className="space-y-3">
          <input ref={fileInputRef} className="sr-only" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={selectAvatar} />
          <Button className="w-full" type="button" variant="outline" disabled={!canEdit || saving} onClick={() => fileInputRef.current?.click()}><Camera className="mr-2 h-4 w-4" />{t('changeAvatar')}</Button>
          {(displayedAvatar || avatarDirty) && <Button className="w-full" type="button" variant="outline" disabled={!canEdit || saving} onClick={() => { revokePreview(); setAvatarPreview(null); setAvatarFile(null); setRemoveAvatar(true) }}><Trash2 className="mr-2 h-4 w-4" />{t('removeAvatar')}</Button>}
          {avatarDirty && <Button className="w-full" type="button" variant="ghost" disabled={saving} onClick={cancelAvatarChange}><X className="mr-2 h-4 w-4" />{t('cancelAvatarChange')}</Button>}
          <p className="text-center text-xs text-muted-foreground">{t('avatarRequirements')}</p>
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><CardTitle>{t('profileInformation')}</CardTitle><CardDescription>{t('accountDetails')}</CardDescription></CardHeader><CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field required icon={<UserIcon className="h-4 w-4" />} label={t('fullName')} value={form.full_name} disabled={!canEdit} onChange={value => setForm(current => ({ ...current, full_name: value }))} />
            <div><Field icon={<Mail className="h-4 w-4" />} label={t('email')} value={currentUser.email} disabled /><p className="mt-1 text-xs text-muted-foreground">{t('emailReadOnlyHelp')}</p></div>
            <Field icon={<Phone className="h-4 w-4" />} label={t('phone')} value={form.phone} disabled={!canEdit} onChange={value => setForm(current => ({ ...current, phone: value }))} />
            <Field icon={<Briefcase className="h-4 w-4" />} label={t('department')} value={form.department} disabled={!canEdit} onChange={value => setForm(current => ({ ...current, department: value }))} />
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={!canEdit || saving}>{saving ? t('loading') : t('save')}</Button></div>
        </CardContent></Card>
      </div>
    </form>
  </div>
}

function Field({ icon, label, value, onChange, disabled = false, required = false }: { icon: React.ReactNode; label: string; value: string; onChange?: (value: string) => void; disabled?: boolean; required?: boolean }) {
  return <label className="space-y-2 text-sm font-medium"><span className="flex items-center gap-2">{icon}{label}</span><Input value={value} disabled={disabled} required={required} onChange={event => onChange?.(event.target.value)} /></label>
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Avatar could not be read.'))
    reader.onerror = () => reject(reader.error || new Error('Avatar could not be read.'))
    reader.readAsDataURL(file)
  })
}
