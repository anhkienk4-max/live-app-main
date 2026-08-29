'use client'

import * as React from 'react'
import { shiftService, brandService, platformService, campaignService, userService } from '@/lib/services/dataService'
import { templateService } from '@/lib/services/templateService'
import { Shift, Brand, Platform, Campaign, User, DeletionImpact } from '@/lib/types/database.types'
import { formatShiftTimeRange, ShiftTemplate } from '@/lib/utils/shiftUtils'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
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

export function ShiftList() {
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [templates, setTemplates] = React.useState<ShiftTemplate[]>([])
  const [loading, setLoading] = React.useState(true)
  
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
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const canEdit = Boolean(currentUser && hasPermission(currentUser, 'shifts.edit'))
  const canDelete = Boolean(currentUser && hasPermission(currentUser, 'shifts.delete'))

  const loadData = React.useCallback(async () => {
    setLoading(true)
    const [shiftsData, brandsData, platformsData, campaignsData, usersData, templatesData] = await Promise.all([
      shiftService.getAll(),
      brandService.getAll(),
      platformService.getAll(),
      campaignService.getAll(),
      userService.getAll(),
      templateService.getAll(),
    ])
    setShifts(shiftsData)
    setBrands(brandsData)
    setPlatforms(platformsData)
    setCampaigns(campaignsData)
    setUsers(usersData)
    setTemplates(templatesData)
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

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
      for (const id of deleteIds) await shiftService.remove(id, currentUser.id, reason)
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
    setEditingShift(shift)
    setDuplicateShift(null)
    setReopenDetailAfterEdit(false)
    setIsFormOpen(true)
  }

  const handleDuplicate = (shift: Shift) => {
    setDuplicateShift(shift)
    setEditingShift(null)
    setReopenDetailAfterEdit(false)
    setIsFormOpen(true)
  }

  const handleCreate = () => {
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
      header: 'Date',
      accessor: 'date',
      cell: (value) => format(new Date(value), 'MMM d, yyyy')
    },
    {
      header: 'Time',
      accessor: (row) => formatShiftTimeRange(row)
    },
    {
      header: 'Brand',
      accessor: 'brand_id',
      cell: (value) => getBrandName(value)
    },
    {
      header: 'Platform',
      accessor: 'platform_id',
      cell: (value) => getPlatformName(value)
    },
    {
      header: 'Host',
      accessor: 'host_id',
      cell: (value) => getUserName(value)
    },
    {
      header: 'Support',
      accessor: 'support_id',
      cell: (value) => getUserName(value)
    },
    {
      header: 'Technical',
      accessor: 'technical_id',
      cell: (value) => getUserName(value)
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
          scheduled: 'secondary',
          live: 'destructive',
          completed: 'default',
          cancelled: 'secondary'
        }
        return <Badge variant={variants[value] || 'secondary'} className="capitalize">{value}</Badge>
      }
    },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="flex items-center gap-1">
          <Button className="hidden lg:flex" variant="ghost" size="icon" aria-label={t('viewShiftDetail')} title={t('viewShiftDetail')} onClick={() => setDetailShift(row)} data-testid={`view-shift-${row.id}`}>
            <Eye className="h-4 w-4" />
          </Button>
          {canEdit && <Button className="hidden lg:flex" variant="ghost" size="icon" aria-label="Edit shift" onClick={() => handleEdit(row)} data-testid={`edit-shift-${row.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>}
          <Button className="hidden lg:flex" variant="ghost" size="icon" aria-label="Duplicate" onClick={() => handleDuplicate(row)} data-testid={`duplicate-shift-${row.id}`}>
            <Copy className="h-4 w-4" />
          </Button>
          {canDelete && <Button className="hidden lg:flex" variant="ghost" size="icon" aria-label="Delete or cancel shift" title="Delete or cancel shift" onClick={() => void requestDelete([row.id])} data-testid={`delete-shift-${row.id}`}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>}
          
          <MobileActionMenu
            breakpoint="lg"
            actions={[
              { key: 'view', label: t('viewShiftDetail'), icon: <Eye className="h-4 w-4" />, onClick: () => setDetailShift(row) },
              ...(canEdit ? [{ key: 'edit', label: t('edit'), icon: <Pencil className="h-4 w-4" />, onClick: () => handleEdit(row) }] : []),
              { key: 'dup', label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onClick: () => handleDuplicate(row) },
              ...(canDelete ? [{ key: 'del', label: t('delete'), icon: <Trash2 className="h-4 w-4" />, onClick: () => void requestDelete([row.id]), destructive: true }] : [])
            ]}
          />
        </div>
      )
    }
  ]

  if (loading) return <div className="text-center py-12">Loading shifts...</div>

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Shift Management</h2>
          <p className="text-gray-600 mt-1">Manage livestream schedules and assignments</p>
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
          <Button onClick={handleCreate} data-testid="add-shift-btn">
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
        searchPlaceholder="Search shifts..."
        emptyMessage="No shifts found. Create your first shift!"
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
