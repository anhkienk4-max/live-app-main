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
import { Plus, Pencil, Trash2, Copy, Upload, Eye } from 'lucide-react'
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
  
  const { toast } = useToast()
  const { t, translate } = useTranslation()
  const { currentUser } = useCurrentUser()
  const canEdit = Boolean(currentUser && hasPermission(currentUser, 'shifts.edit'))
  const canDelete = Boolean(currentUser && hasPermission(currentUser, 'shifts.delete'))

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
      accessor: row => <button className="text-left" onClick={() => setDetailShift(row)}><span className="block font-semibold text-blue-700">{row.title || row.id}</span><span className="block text-xs text-muted-foreground">{row.id}</span></button>,
    },
    {
      header: t('date'),
      accessor: 'date',
      cell: (value) => format(new Date(String(value)), 'MMM d, yyyy')
    },
    {
      header: t('time'),
      accessor: (row) => formatShiftTimeRange(row)
    },
    {
      header: t('brand'),
      accessor: 'brand_id',
      cell: (value) => getBrandName(typeof value === 'string' ? value : '')
    },
    {
      header: t('platform'),
      accessor: 'platform_id',
      cell: (value) => getPlatformName(typeof value === 'string' ? value : '')
    },
    {
      header: t('studio'), accessor: row => row.studio || '—'
    },
    {
      header: t('campaign'), accessor: row => campaigns.find(item => item.id === row.campaign_id)?.name || '—'
    },
    {
      header: t('staffing'), accessor: row => <div className="space-y-1 text-xs">{getShiftRoleCapacities(row, registrations).map(capacity => <div key={capacity.role} className={capacity.remaining ? 'text-amber-700' : 'text-emerald-700'}>{t(capacity.role)}: {capacity.approved}/{capacity.required}</div>)}</div>
    },
    {
      header: t('host'),
      accessor: 'host_id',
      cell: (value) => getUserName(typeof value === 'string' ? value : undefined)
    },
    {
      header: t('support'),
      accessor: 'support_id',
      cell: (value) => getUserName(typeof value === 'string' ? value : undefined)
    },
    {
      header: t('technical'),
      accessor: 'technical_id',
      cell: (value) => getUserName(typeof value === 'string' ? value : undefined)
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
          collapseAt="lg"
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold">{t('totalShifts')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{shifts.length} {t('totalShifts')}</p>
        </div>
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

      <DataTable
        data={shifts}
        columns={columns}
        searchPlaceholder={t('search')}
        searchableText={row => [row.title, row.id, row.date, row.studio, getBrandName(row.brand_id), getPlatformName(row.platform_id), campaigns.find(item => item.id === row.campaign_id)?.name].filter(Boolean).join(' ')}
        emptyMessage={t('noData')}
      />

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
