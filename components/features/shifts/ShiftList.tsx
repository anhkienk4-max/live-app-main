'use client'

import * as React from 'react'
import { shiftService, brandService, platformService, campaignService, userService, shiftRegistrationService, getShiftRoleCapacities } from '@/lib/services/dataService'
import { templateService } from '@/lib/services/templateService'
import { Shift, Brand, Platform, Campaign, User, DeletionImpact, ShiftRegistration } from '@/lib/types/database.types'
import { formatShiftTimeRange, ShiftTemplate } from '@/lib/utils/shiftUtils'
import { ActionBar } from '@/components/ui/action-bar'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import { buildShiftActions } from '@/lib/ui/action-priority'
import { DataTable, Column } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Pencil, Trash2, Copy, Upload, Eye, ArrowDownUp } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { ShiftFormDialog } from './ShiftFormDialog'
import { ShiftDetailModal } from './ShiftDetailModal'
import { BulkActionsToolbar } from './BulkActionsToolbar'
import { ImportExportDialog } from './ImportExportDialog'
import { format } from 'date-fns'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { PageLoadError } from '@/components/ui/page-load-error'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'

export function ShiftList() {
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [templates, setTemplates] = React.useState<ShiftTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  
  const [editingShift, setEditingShift] = React.useState<Shift | null>(null)
  const [detailShift, setDetailShift] = React.useState<Shift | null>(null)
  const [reopenDetailAfterEdit, setReopenDetailAfterEdit] = React.useState(false)
  const [duplicateShift, setDuplicateShift] = React.useState<Shift | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleteIds, setDeleteIds] = React.useState<string[]>([])
  const [deleteImpact, setDeleteImpact] = React.useState<DeletionImpact | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [isImportExportOpen, setIsImportExportOpen] = React.useState(false)
  
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [showBulkActions, setShowBulkActions] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<Shift['status'] | 'all'>('all')
  const [sortDescending, setSortDescending] = React.useState(false)
  
  const { toast } = useToast()
  const { t, translate } = useTranslation()
  const { currentUser } = useCurrentUser()
  const canEdit = Boolean(currentUser && hasPermission(currentUser, 'shifts.edit'))
  const canDelete = Boolean(currentUser && hasPermission(currentUser, 'shifts.delete'))
  const statusValues = ['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'] as const
  const filteredShifts = statusFilter === 'all' ? shifts : shifts.filter(shift => shift.status === statusFilter)
  const sortedShifts = [...filteredShifts].sort((a, b) => {
    const dateOrder = String(a.date).localeCompare(String(b.date)) || a.start_time.localeCompare(b.start_time)
    return sortDescending ? -dateOrder : dateOrder
  })

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
    const [shiftsData, brandsData, platformsData, campaignsData, usersData, templatesData, registrationData] = await Promise.all([
      shiftService.getAll(),
      brandService.getAll(),
      platformService.getAll(),
      campaignService.getAll(),
      userService.getAll(),
      templateService.getAll(),
      shiftRegistrationService.getAll(),
    ])
    setShifts(shiftsData)
    setBrands(brandsData)
    setPlatforms(platformsData)
    setCampaigns(campaignsData)
    setUsers(usersData)
    setTemplates(templatesData)
    setRegistrations(registrationData)
    } catch (error) { setLoadError(error) } finally { setLoading(false) }
  }, [])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadData() })
    return () => window.cancelAnimationFrame(frame)
  }, [loadData])

  const requestDelete = async (ids: string[]) => {
    if (!canDelete) return
    const impacts = (await Promise.all(ids.map(id => shiftService.getDeletionImpact(id)))).filter((impact): impact is DeletionImpact => Boolean(impact))
    if (impacts.length === 0) return
    setDeleteIds(ids)
    setDeleteId(ids.length === 1 ? ids[0] : 'bulk')
    setDeleteImpact(ids.length === 1 ? impacts[0] : {
      entity_type: 'shift',
      entity_id: 'bulk',
      entity_name: `${ids.length} selected shifts`,
      action: impacts.some(impact => impact.action === 'soft_delete') ? 'soft_delete' : 'delete',
      consequence: 'Each shift will follow its own policy: empty future shifts are deleted; shifts with history are cancelled and soft-deleted.',
      reversible: impacts.some(impact => impact.reversible),
      related_records: impacts.flatMap(impact => impact.related_records),
    })
  }

  const handleDelete = async (reason: string) => {
    if (!currentUser) return
    try {
      for (const id of deleteIds) {
        await shiftService.remove(id, currentUser.id, reason, shifts.find(shift => shift.id === id)?.version)
      }
      toast({ title: 'Success', description: deleteIds.length === 1 ? 'Shift lifecycle updated' : `${deleteIds.length} shifts processed`, variant: 'success' })
      setSelectedIds(new Set())
      setShowBulkActions(false)
      await loadData()
    } catch (error) {
      toast({ title: 'Action failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
      throw error
    }
  }

  const handleEdit = (shift: Shift) => {
    if (!canEdit) return
    setEditingShift(shift)
    setDuplicateShift(null)
    setReopenDetailAfterEdit(false)
    setIsFormOpen(true)
  }

  const handleDuplicate = (shift: Shift) => {
    if (!canEdit) return
    setDuplicateShift(shift)
    setEditingShift(null)
    setReopenDetailAfterEdit(false)
    setIsFormOpen(true)
  }

  const handleCreate = () => {
    if (!canEdit) return
    setEditingShift(null)
    setDuplicateShift(null)
    setReopenDetailAfterEdit(false)
    setIsFormOpen(true)
  }

  const editFromDetail = () => {
    if (!detailShift) return
    setEditingShift(detailShift)
    setDuplicateShift(null)
    setReopenDetailAfterEdit(true)
    setDetailShift(null)
    setIsFormOpen(true)
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
    setShowBulkActions(newSet.size > 0)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === shifts.length) {
      setSelectedIds(new Set())
      setShowBulkActions(false)
    } else {
      setSelectedIds(new Set(shifts.map(s => s.id)))
      setShowBulkActions(true)
    }
  }

  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'
  const getUserName = (id?: string) => id ? users.find(u => u.id === id)?.full_name || 'Unassigned' : 'Unassigned'
  const getCampaignName = (id?: string) => id ? campaigns.find(campaign => campaign.id === id)?.name || 'Unknown' : null
  const getRolePeople = (shift: Shift, role: 'host' | 'support' | 'technical') => {
    const shiftRegistrations = registrations.filter(registration => registration.shift_id === shift.id)
    const resolved = resolveStaffingLabelsForRole(shift, shiftRegistrations, users, role, translate)
      .filter(label => !label.isUnassigned)
      .map(label => label.name)
    if (resolved.length > 0) return resolved
    const legacyId = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    return legacyId ? [getUserName(legacyId)] : []
  }

  const columns: Column<Shift>[] = [
    {
      header: () => (
        <Checkbox
          checked={selectedIds.size === shifts.length && shifts.length > 0}
          onCheckedChange={toggleSelectAll}
        />
      ),
      accessor: (row) => (
        <Checkbox
          checked={selectedIds.has(row.id)}
          onCheckedChange={() => toggleSelect(row.id)}
        />
      )
    },
    {
      header: t('shiftDetail'),
      accessor: row => {
        const campaign = getCampaignName(row.campaign_id)
        return <div className="min-w-0"><button className="block max-w-full truncate text-left font-semibold text-slate-900 hover:text-blue-700" title={row.title || row.id} onClick={() => setDetailShift(row)}>{row.title || row.id}</button><div className="mt-1 truncate text-[11px] text-muted-foreground" title={`${row.id}${campaign ? ` · ${campaign}` : ''}`}><span>{row.id.slice(0, 8)}</span>{campaign && <><span aria-hidden="true"> · </span><span>{campaign}</span></>}</div></div>
      },
    },
    {
      header: `${t('date')} / ${t('time')}`,
      accessor: row => <div className="whitespace-nowrap"><div className="font-medium text-slate-800">{format(new Date(String(row.date)), 'MMM d, yyyy')}</div><div className="mt-1 text-[11px] text-muted-foreground">{formatShiftTimeRange(row)}</div></div>,
    },
    {
      header: `${t('brand')} / ${t('platform')}`,
      accessor: row => <div className="min-w-0"><div className="truncate font-medium text-slate-800" title={getBrandName(row.brand_id)}>{getBrandName(row.brand_id)}</div><div className="mt-1 truncate text-[11px] text-muted-foreground" title={`${getPlatformName(row.platform_id)} · ${row.studio || '—'}`}>{getPlatformName(row.platform_id)} · {row.studio || '—'}</div></div>,
    },
    {
      header: t('staffing'), accessor: row => {
        const capacities = getShiftRoleCapacities(row, registrations)
        const roles = ['host', 'support', 'technical'] as const
        const assignments = roles.flatMap(role => {
          const people = getRolePeople(row, role)
          return people.length ? [`${t(role)}: ${people.join(', ')}`] : []
        })
        const capacityDescription = capacities.map(capacity => `${t(capacity.role)} ${capacity.approved}/${capacity.required}${capacity.pending ? `, ${capacity.pending} ${t('pending')}` : ''}`).join(' · ')
        return <div className="min-w-0" title={[capacityDescription, ...assignments].join(' · ')} aria-label={[capacityDescription, ...assignments].join(' · ')}><div className="flex flex-wrap gap-1">{capacities.map(capacity => <span key={capacity.role} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${capacity.remaining ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`} aria-label={`${t(capacity.role)} ${capacity.approved}/${capacity.required}`}>{capacity.role === 'host' ? 'H' : capacity.role === 'support' ? 'S' : 'T'} {capacity.approved}/{capacity.required}</span>)}</div></div>
      }
    },
    {
      header: t('status'),
      accessor: 'status',
      cell: (value) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
          scheduled: 'secondary',
          live: 'destructive',
          completed: 'default',
          cancelled: 'secondary'
        }
        const status = String(value)
        return <Badge variant={variants[status] || 'secondary'} className="capitalize">{translate(status === 'live' ? 'liveStatus' : status)}</Badge>
      }
    },
    {
      header: t('actions'),
      accessor: (row) => (
        <ActionBar
          iconOnly
          compact
          collapseAt="lg"
          className="flex-nowrap"
          actions={buildShiftActions(
            { canEdit, canDelete },
            {
              onView: () => setDetailShift(row),
              onEdit: canEdit ? () => handleEdit(row) : undefined,
              onDuplicate: () => handleDuplicate(row),
              onDelete: canDelete ? () => void requestDelete([row.id]) : undefined,
            },
            {
              view: t('viewShiftDetail'),
              edit: t('edit'),
              duplicate: t('duplicate'),
              delete: t('delete'),
            },
            {
              view: <Eye />,
              edit: <Pencil />,
              duplicate: <Copy />,
              delete: <Trash2 />,
            }
          )}
        />
      )
    }
  ]

  if (loading) return <div className="text-center py-12">{t('loading')}</div>
  if (loadError) return <PageLoadError error={loadError} onRetry={() => void loadData()} />

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold tracking-tight">{translate('Shift Management')}</h1><p className="mt-1 text-xs text-muted-foreground">{filteredShifts.length} / {shifts.length} {t('totalShifts')}</p></div>
        <div className="flex gap-2">
          <Button className="hidden sm:flex" variant="outline" onClick={() => setIsImportExportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import/Export
          </Button>
          <MobileActionMenu
            breakpoint="sm"
            actions={[{ key: 'import', label: 'Import/Export', icon: <Upload className="h-4 w-4" />, onClick: () => setIsImportExportOpen(true) }]}
          />
          <Button disabled={!canEdit} onClick={handleCreate} data-testid="add-shift-btn">
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Add Shift</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {showBulkActions && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          onBulkDelete={() => void requestDelete(Array.from(selectedIds))}
          onDeselectAll={() => { setSelectedIds(new Set()); setShowBulkActions(false) }}
          shifts={shifts.filter(s => selectedIds.has(s.id))}
          onUpdate={loadData}
        />
      )}

      <div className="[&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_table]:text-xs [&_tbody_tr]:h-[62px]">
      <DataTable
        data={sortedShifts}
        columns={columns}
        searchPlaceholder={t('search')}
        filterComponent={<div className="flex flex-wrap items-center gap-2"><label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-600"><span>{t('status')}</span><select aria-label={t('status')} value={statusFilter} onChange={event => setStatusFilter(event.target.value as Shift['status'] | 'all')} className="max-w-40 bg-transparent font-medium text-slate-800 outline-none"><option value="all">{t('all')} ({shifts.length})</option>{statusValues.map(status => <option key={status} value={status}>{translate(status === 'live' ? 'liveStatus' : status)} ({shifts.filter(shift => shift.status === status).length})</option>)}</select></label><Button variant="outline" size="sm" onClick={() => setSortDescending(value => !value)} aria-label={`${t('date')} ${sortDescending ? 'ascending' : 'descending'}`} title={`${t('date')} ${sortDescending ? 'ascending' : 'descending'}`}><ArrowDownUp className="mr-1.5 h-4 w-4" />{t('date')} {sortDescending ? '↓' : '↑'}</Button></div>}
        searchableText={row => [row.title, row.id, row.date, row.start_time, row.studio, getBrandName(row.brand_id), getPlatformName(row.platform_id), getCampaignName(row.campaign_id), ...(['host', 'support', 'technical'] as const).flatMap(role => getRolePeople(row, role))].filter(Boolean).join(' ')}
        emptyMessage={t('noData')}
      />
      </div>

      <ShiftFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open)
          if (!open) {
            setEditingShift(null)
            setReopenDetailAfterEdit(false)
          }
        }}
        shift={editingShift}
        duplicateFrom={duplicateShift}
        brands={brands}
        platforms={platforms}
        campaigns={campaigns}
        users={users}
        registrations={registrations}
        templates={templates}
        onSuccess={async (updatedShift) => {
          await loadData()
          setIsFormOpen(false)
          setEditingShift(null)
          if (reopenDetailAfterEdit && updatedShift) setDetailShift({ ...updatedShift })
          setReopenDetailAfterEdit(false)
        }}
      />

      {detailShift && (
        <ShiftDetailModal
          open
          onOpenChange={(open) => { if (!open) setDetailShift(null) }}
          shift={detailShift}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          onUpdate={() => {
            void (async () => {
              await loadData()
              const refreshed = await shiftService.getById(detailShift.id)
              if (refreshed) setDetailShift({ ...refreshed })
            })()
          }}
          onEdit={editFromDetail}
          onDelete={() => {
            setDetailShift(null)
            void loadData()
          }}
        />
      )}

      <ImportExportDialog
        open={isImportExportOpen}
        onOpenChange={setIsImportExportOpen}
        shifts={shifts}
        brands={brands}
        platforms={platforms}
        campaigns={campaigns}
        users={users}
        onSuccess={loadData}
      />

      <LifecycleActionDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) { setDeleteId(null); setDeleteIds([]); setDeleteImpact(null) } }}
        title={deleteImpact?.action === 'delete' ? 'Delete shift' : 'Cancel and archive shift'}
        impact={deleteImpact}
        confirmText={deleteImpact?.action === 'delete' ? 'Delete' : 'Cancel shift'}
        onConfirm={handleDelete}
      />
    </>
  )
}
