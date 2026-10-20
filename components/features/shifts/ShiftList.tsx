'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'

import * as React from 'react'
import { usePagedList } from '@/lib/hooks/usePagedList'
import { getOperationalReferences } from '@/lib/services/operationalReferences'
import { shiftService, shiftRegistrationService, getShiftRoleCapacities } from '@/lib/services/dataService'
import { templateService } from '@/lib/services/templateService'
import { Shift, Brand, Platform, Campaign, User, DeletionImpact, ShiftRegistration } from '@/lib/types/database.types'
import { formatShiftTimeRange, ShiftTemplate } from '@/lib/utils/shiftUtils'
import { shiftDateWindowFilters, type ShiftDateWindow } from '@/lib/utils/shiftDateWindow'
import { ActionBar } from '@/components/ui/action-bar'
import { MobileActionMenu } from '@/components/ui/mobile-action-menu'
import { buildShiftActions } from '@/lib/ui/action-priority'
import { DataTable, Column } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Copy, Upload, Eye, ArrowDownUp, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { ShiftFormDialog } from './ShiftFormDialog'
import { ShiftDetailModal } from './ShiftDetailModal'
import { BulkActionsToolbar } from './BulkActionsToolbar'
import { ImportExportDialog } from './ImportExportDialog'
import { format } from 'date-fns'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'
import { PageLoadError } from '@/components/ui/page-load-error'
import { resolveStaffingLabelsForRole } from '@/lib/utils/staffingResolver'

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive'> = {
  scheduled: 'secondary',
  live: 'destructive',
  completed: 'default',
  cancelled: 'secondary'
}

export function ShiftList() {
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [templates, setTemplates] = React.useState<ShiftTemplate[]>([])
  const [pendingBulkStatus, setPendingBulkStatus] = React.useState<'scheduled' | 'completed' | null>(null)
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false)
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
  const [searchQuery, setSearchQuery] = React.useState('')
  const [sortDescending, setSortDescending] = React.useState(true)
  const [dateWindow, setDateWindow] = React.useState<ShiftDateWindow>('recent')
  const [visibleShifts, setVisibleShifts] = React.useState<Shift[]>([])
  const [filteredTableShifts, setFilteredTableShifts] = React.useState<Shift[]>([])
  const [tableFilterInitialized, setTableFilterInitialized] = React.useState(false)

  const handleVisibleDataChange = React.useCallback((next: Shift[]) => {
    setVisibleShifts(prev => {
      if (prev.length === next.length && prev.every((s, i) => s.id === next[i]?.id)) {
        return prev
      }
      return next
    })
  }, [])

  const handleFilteredDataChange = React.useCallback((next: Shift[]) => {
    setTableFilterInitialized(true)
    setFilteredTableShifts(prev => {
      if (prev.length === next.length && prev.every((s, i) => s.id === next[i]?.id)) {
        return prev
      }
      return next
    })
  }, [])

  const handleStatusFilterChange = React.useCallback((status: Shift['status'] | 'all') => {
    setStatusFilter(status)
    setSelectedIds(new Set())
    setShowBulkActions(false)
  }, [])

  const handleSearchQueryChange = React.useCallback((query: string) => {
    setSearchQuery(query)
    setSelectedIds(new Set())
    setShowBulkActions(false)
  }, [])
  
  const { toast } = useToast()
  const { t, translate } = useTranslation()
  const { currentUser } = useCurrentUser()

  // Granular capability gating (UX-P1-01)
  const canCreate = Boolean(currentUser && hasPermission(currentUser, 'shifts.edit'))
  const canEdit = Boolean(currentUser && hasPermission(currentUser, 'shifts.edit'))
  const canDelete = Boolean(currentUser && hasPermission(currentUser, 'shifts.delete'))
  const canImport = Boolean(currentUser && hasPermission(currentUser, 'shifts.import'))
  const canExport = Boolean(currentUser && hasPermission(currentUser, 'shifts.export'))
  const canImportExport = canImport || canExport
  const canMutate = canEdit || canDelete

  const statusValues = ['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'] as const
  const listFilters = { ...shiftDateWindowFilters(dateWindow), search: searchQuery, statuses: statusFilter === 'all' ? [] : [statusFilter], descending: sortDescending }
  const list = usePagedList(shiftService, 'shifts', listFilters)
  useShiftChangeRefresh(list.reload)
  const { items: shifts, loading } = list
  const sortedShifts = shifts

  const getBrandName = React.useCallback((id: string) => brands.find(b => b.id === id)?.name || 'Unknown', [brands])
  const getPlatformName = React.useCallback((id: string) => platforms.find(p => p.id === id)?.name || 'Unknown', [platforms])
  const getUserName = React.useCallback((id?: string) => id ? users.find(u => u.id === id)?.full_name || 'Unassigned' : 'Unassigned', [users])
  const getCampaignName = React.useCallback((id?: string) => id ? campaigns.find(campaign => campaign.id === id)?.name || 'Unknown' : null, [campaigns])

  const getRolePeople = React.useCallback((shift: Shift, role: 'host' | 'support' | 'technical') => {
    const shiftRegistrations = registrations.filter(registration => registration.shift_id === shift.id)
    const resolved = resolveStaffingLabelsForRole(shift, shiftRegistrations, users, role, translate)
      .filter(label => !label.isUnassigned)
      .map(label => label.name)
    if (resolved.length > 0) return resolved
    const legacyId = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    return legacyId ? [getUserName(legacyId)] : []
  }, [registrations, users, translate, getUserName])

  const mobilePaginatedShifts = sortedShifts
  const mobileTotalPages = Math.max(1, Math.ceil(list.total / list.pageSize))
  const safeMobilePage = Math.min(Math.max(1, list.page), mobileTotalPages)
  const mobileStartIndex = list.total === 0 ? 0 : (safeMobilePage - 1) * list.pageSize + 1
  const mobileEndIndex = Math.min(safeMobilePage * list.pageSize, list.total)

  const loadReferences = React.useCallback(async () => {
    if (!currentUser) return
    setLoadError(null)
    try {
      const [refs, templatesData] = await Promise.all([getOperationalReferences(currentUser), templateService.getAll()])
      const { brands: brandsData, platforms: platformsData, campaigns: campaignsData, users: usersData } = refs
      setBrands(brandsData)
      setPlatforms(platformsData)
      setCampaigns(campaignsData)
      setUsers(usersData)
      setTemplates(templatesData)
    } catch (error) { setLoadError(error) }
  }, [currentUser])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadReferences() })
    return () => window.cancelAnimationFrame(frame)
  }, [loadReferences])

  const loadData = async () => { await list.reload() }
  const pageIds = shifts.map(shift => shift.id).join(',')
  React.useEffect(() => {
    let active = true
    if (!pageIds) return
    void shiftRegistrationService.getForShifts(pageIds.split(',')).then(rows => { if (active) setRegistrations(rows) }).catch(error => { if (active) setLoadError(error) })
    return () => { active = false }
  }, [pageIds])
  const clearSelection = () => { setSelectedIds(new Set()); setShowBulkActions(false) }

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
    if (!currentUser || !canDelete) return
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
    if (!canCreate) return
    setDuplicateShift(shift)
    setEditingShift(null)
    setReopenDetailAfterEdit(false)
    setIsFormOpen(true)
  }

  const handleCreate = () => {
    if (!canCreate) return
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

  // Active filtered shifts on desktop:
  // - If table filter is initialized: strictly filteredTableShifts (which is [] when 0 results match)
  // - If table filter is not yet initialized: sortedShifts
  const currentTableFilteredShifts = React.useMemo(() => {
    if (tableFilterInitialized) {
      return filteredTableShifts
    }
    return sortedShifts
  }, [tableFilterInitialized, filteredTableShifts, sortedShifts])

  // Reconcile selectedIds during render when filtered table data changes:
  // Prunes any previously selected IDs that no longer exist in currentTableFilteredShifts.
  const [prevFilteredShifts, setPrevFilteredShifts] = React.useState<Shift[]>(filteredTableShifts)
  if (filteredTableShifts !== prevFilteredShifts) {
    setPrevFilteredShifts(filteredTableShifts)
    if (selectedIds.size > 0 && tableFilterInitialized) {
      const validIdSet = new Set(filteredTableShifts.map(s => s.id))
      const next = new Set<string>()
      selectedIds.forEach(id => {
        if (validIdSet.has(id)) next.add(id)
      })
      if (next.size !== selectedIds.size) {
        setSelectedIds(next)
        if (next.size === 0) {
          setShowBulkActions(false)
        }
      }
    }
  }

  // Only shifts that are currently selected AND in currentTableFilteredShifts
  const selectedFilteredShifts = React.useMemo(() => {
    if (tableFilterInitialized && filteredTableShifts.length === 0) {
      return []
    }
    const pool = currentTableFilteredShifts
    const validIds = new Set(pool.map(s => s.id))
    return pool.filter(s => selectedIds.has(s.id) && validIds.has(s.id))
  }, [tableFilterInitialized, filteredTableShifts, currentTableFilteredShifts, selectedIds])

  const allPageSelected = visibleShifts.length > 0 && visibleShifts.every(s => selectedIds.has(s.id))
  const somePageSelected = visibleShifts.some(s => selectedIds.has(s.id)) && !allPageSelected

  const toggleSelectPage = () => {
    if (allPageSelected) {
      const next = new Set(selectedIds)
      visibleShifts.forEach(s => next.delete(s.id))
      setSelectedIds(next)
      setShowBulkActions(next.size > 0)
    } else {
      const next = new Set(selectedIds)
      visibleShifts.forEach(s => next.add(s.id))
      setSelectedIds(next)
      setShowBulkActions(true)
    }
  }

  const columns: Column<Shift>[] = [
    ...(canMutate ? [{
      header: () => (
        <Checkbox
          checked={allPageSelected ? true : somePageSelected ? 'indeterminate' : false}
          onCheckedChange={toggleSelectPage}
          aria-label={t('selectAllPage')}
          data-testid="shift-select-all-checkbox"
        />
      ),
      accessor: (row: Shift) => (
        <Checkbox
          checked={selectedIds.has(row.id)}
          onCheckedChange={() => toggleSelect(row.id)}
          aria-label={`${t('select')} ${row.id}`}
          data-testid="shift-row-checkbox"
        />
      )
    }] : []),
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
        const status = String(value)
        return <Badge variant={statusVariants[status] || 'secondary'} className="capitalize">{translate(status === 'live' ? 'liveStatus' : status)}</Badge>
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
              onDuplicate: canCreate ? () => handleDuplicate(row) : undefined,
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

  if (loadError || list.error) return <PageLoadError error={loadError || list.error} onRetry={() => { setLoadError(null); void loadData() }} />
  if (loading) return <div className="text-center py-12">{t('loading')}</div>

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{translate('Shift Management')}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{list.total} {t('totalShifts')}</p>
        </div>
        <div className="flex gap-2">
          {canImportExport && (
            <>
              <Button className="hidden sm:flex" variant="outline" onClick={() => setIsImportExportOpen(true)} data-testid="import-export-btn">
                <Upload className="h-4 w-4 mr-2" />
                {t('importExport')}
              </Button>
              <MobileActionMenu
                breakpoint="sm"
                actions={[{ key: 'import', label: t('importExport'), icon: <Upload className="h-4 w-4" />, onClick: () => setIsImportExportOpen(true) }]}
              />
            </>
          )}
          {canCreate && (
            <Button onClick={handleCreate} data-testid="add-shift-btn">
              <Plus className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{t('addShift')}</span>
              <span className="sm:hidden">{t('addShift')}</span>
            </Button>
          )}
        </div>
      </div>

      {showBulkActions && <p className="text-xs text-muted-foreground">{t('currentPage')} · {t('selectedCount',{count:selectedIds.size})}</p>}
      {showBulkActions && selectedFilteredShifts.length > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedFilteredShifts.length}
          totalFilteredCount={currentTableFilteredShifts.length}
          onBulkDelete={() => void requestDelete(selectedFilteredShifts.map(s => s.id))}
          onDeselectAll={() => { setSelectedIds(new Set()); setShowBulkActions(false) }}
          shifts={selectedFilteredShifts}
          onUpdate={loadData}
          canDelete={canDelete}
          onBulkStatus={setPendingBulkStatus}
        />
      )}

      {/* DESKTOP VIEW: Data Table (UX-P1-02: Hidden on mobile < md) */}
      <div className="hidden md:block [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_table]:text-xs [&_tbody_tr]:h-[62px]">
        <DataTable
          data={sortedShifts}
          columns={columns}
          search={searchQuery}
          onSearch={value => { handleSearchQueryChange(value); list.reset() }}
          pagination={{ loading: list.refreshing, page: list.page, pageSize: list.pageSize, total: list.total,
            onPageChange: value => { clearSelection(); list.setPage(value) },
            onPageSizeChange: value => { clearSelection(); list.setPageSize(value) } }}
          onVisibleDataChange={handleVisibleDataChange}
          onFilteredDataChange={handleFilteredDataChange}
          searchPlaceholder={t('search')}
          filterComponent={
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-600">
                <span>{t('dateRange')}</span>
                <select aria-label={t('dateRange')} value={dateWindow}
                  onChange={event => { setDateWindow(event.target.value as ShiftDateWindow); clearSelection(); list.reset() }}
                  className="max-w-40 bg-transparent font-medium text-slate-800 outline-none">
                  <option value="recent">{t('last30Days')}</option>
                  <option value="upcoming">{t('upcoming')}</option>
                  <option value="all">{t('all')}</option>
                </select>
              </label>
              <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-600">
                <span>{t('status')}</span>
                <select
                  aria-label={t('status')}
                  value={statusFilter}
                  onChange={event => { handleStatusFilterChange(event.target.value as Shift['status'] | 'all'); list.reset() }}
                  className="max-w-40 bg-transparent font-medium text-slate-800 outline-none"
                >
                  <option value="all">{t('all')}</option>
                  {statusValues.map(status => (
                    <option key={status} value={status}>
                      {translate(status === 'live' ? 'liveStatus' : status)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSortDescending(value => !value); clearSelection(); list.reset() }}
                aria-label={`${t('date')} ${sortDescending ? 'ascending' : 'descending'}`}
                title={`${t('date')} ${sortDescending ? 'ascending' : 'descending'}`}
              >
                <ArrowDownUp className="mr-1.5 h-4 w-4" />
                {t('date')} {sortDescending ? '↓' : '↑'}
              </Button>
            </div>
          }
          emptyMessage={t('noData')}
        />
      </div>

      {/* MOBILE VIEW: Compact Shift Cards with 10/20/50 pagination (UX-P1-02: 390px mobile scan) */}
      <div className="block md:hidden space-y-3" data-testid="shifts-mobile-container">
        {/* Mobile Search & Filter Toolbar */}
        <div className="flex flex-col gap-2 bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder={t('search')}
              value={searchQuery}
              onChange={e => { handleSearchQueryChange(e.target.value); list.reset() }}
              className="pl-8 h-9 text-xs"
              data-testid="shifts-mobile-search"
            />
          </div>
          <div className="flex items-center gap-2">
            <select aria-label={t('dateRange')} value={dateWindow}
              onChange={event => { setDateWindow(event.target.value as ShiftDateWindow); clearSelection(); list.reset() }}
              className="flex-1 h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none">
              <option value="recent">{t('last30Days')}</option>
              <option value="upcoming">{t('upcoming')}</option>
              <option value="all">{t('all')}</option>
            </select>
            <select
              aria-label={t('status')}
              value={statusFilter}
              onChange={event => { handleStatusFilterChange(event.target.value as Shift['status'] | 'all'); list.reset() }}
              className="flex-1 h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 outline-none"
              data-testid="shifts-mobile-status-filter"
            >
              <option value="all">{t('all')}</option>
              {statusValues.map(status => (
                <option key={status} value={status}>
                  {translate(status === 'live' ? 'liveStatus' : status)}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-2.5 text-xs shrink-0"
              onClick={() => { setSortDescending(value => !value); clearSelection(); list.reset() }}
              aria-label={`${t('date')} ${sortDescending ? 'ascending' : 'descending'}`}
            >
              <ArrowDownUp className="mr-1 h-3.5 w-3.5" />
              {t('date')} {sortDescending ? '↓' : '↑'}
            </Button>
          </div>
        </div>

        {/* Compact Cards List */}
        {mobilePaginatedShifts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-xs text-muted-foreground" data-testid="shifts-mobile-empty-state">
            {t('noData')}
          </div>
        ) : (
          <div className="space-y-2">
            {mobilePaginatedShifts.map(shift => {
              const capacities = getShiftRoleCapacities(shift, registrations)
              const brand = getBrandName(shift.brand_id)
              const platform = getPlatformName(shift.platform_id)
              const campaign = getCampaignName(shift.campaign_id)

              return (
                <div
                  key={shift.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs space-y-2.5 transition-colors hover:border-slate-300"
                  data-testid={`shift-mobile-card-${shift.id}`}
                >
                  {/* Top Line: Brand, Platform, Studio & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {brand}
                        </span>
                        <span className="text-slate-400 text-xs">•</span>
                        <span className="text-xs font-medium text-slate-600 truncate">
                          {platform}
                        </span>
                        {shift.studio && (
                          <span className="text-[10px] text-muted-foreground bg-slate-100 rounded px-1 py-0.5">
                            {shift.studio}
                          </span>
                        )}
                      </div>
                      {shift.title && (
                        <button type="button" className="block max-w-full text-xs text-slate-500 hover:text-blue-700 truncate mt-0.5 font-normal text-left" onClick={() => setDetailShift(shift)}>{shift.title}</button>
                      )}
                    </div>
                    <Badge variant={statusVariants[shift.status] || 'secondary'} className="capitalize shrink-0 text-[11px] font-medium">
                      {translate(shift.status === 'live' ? 'liveStatus' : shift.status)}
                    </Badge>
                  </div>

                  {/* Middle Line: Date, Time & Campaign */}
                  <div className="flex items-center justify-between text-xs text-slate-600 gap-2 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <span>{shift.date}</span>
                      <span className="text-slate-400">•</span>
                      <span>{formatShiftTimeRange(shift)}</span>
                    </div>
                    {campaign && (
                      <span className="text-[11px] text-muted-foreground truncate max-w-[120px]" title={campaign}>
                        {campaign}
                      </span>
                    )}
                  </div>

                  {/* Bottom Line: Occupancy Chips & Quick View Drilldown */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    {/* Staffing Occupancy Chips */}
                    <div className="flex flex-wrap items-center gap-1" aria-label={t('staffing')}>
                      {capacities.map(cap => (
                        <span
                          key={cap.role}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            cap.remaining > 0
                              ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                          }`}
                          title={`${t(cap.role)} ${cap.approved}/${cap.required}`}
                        >
                          {cap.role === 'host' ? 'H' : cap.role === 'support' ? 'S' : 'T'} {cap.approved}/{cap.required}
                        </span>
                      ))}
                    </div>

                    {/* View Action / Drilldown */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs font-medium"
                        onClick={() => setDetailShift(shift)}
                        data-testid={`view-shift-mobile-${shift.id}`}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        {t('viewShiftDetail')}
                      </Button>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => handleEdit(shift)}
                          aria-label={t('edit')}
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-600" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => void requestDelete([shift.id])}
                          aria-label={t('delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Mobile controls use the same bounded server page as the desktop table. */}
        {list.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 px-1 text-xs text-slate-600" data-testid="shifts-mobile-pagination">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">{t('show')}:</span>
              <Select
                value={String(list.pageSize)}
                onValueChange={val => { clearSelection(); list.setPageSize(Number(val)) }}
              >
                <SelectTrigger className="h-8 w-16 text-xs px-2" aria-label="Mobile page size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {mobileStartIndex}–{mobileEndIndex} / {list.total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 min-h-[32px] min-w-[32px]"
                  disabled={safeMobilePage <= 1}
                  onClick={() => { clearSelection(); list.setPage(safeMobilePage - 1) }}
                  aria-label={t('previousPage')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 min-h-[32px] min-w-[32px]"
                  disabled={safeMobilePage >= mobileTotalPages}
                  onClick={() => { clearSelection(); list.setPage(safeMobilePage + 1) }}
                  aria-label={t('nextPage')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
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

      {canImportExport && (
        <ImportExportDialog
          exportFilters={listFilters}
          totalCount={list.total}
          open={isImportExportOpen}
          onOpenChange={setIsImportExportOpen}
          shifts={shifts}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          onSuccess={loadData}
        />
      )}

      <LifecycleActionDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) { setDeleteId(null); setDeleteIds([]); setDeleteImpact(null) } }}
        title={deleteImpact?.action === 'delete' ? 'Delete shift' : 'Cancel and archive shift'}
        impact={deleteImpact}
        confirmText={deleteImpact?.action === 'delete' ? 'Delete' : 'Cancel shift'}
        onConfirm={handleDelete}
      />

      {pendingBulkStatus && (
        <Dialog open onOpenChange={open => { if (!open) setPendingBulkStatus(null) }}>
          <DialogContent size="sm" data-testid="confirm-bulk-status-dialog">
            <DialogHeader>
              <DialogTitle>{t('confirmBulkStatusTitle')}</DialogTitle>
              <DialogDescription>
                {t('confirmBulkStatusMessage', {
                  count: selectedFilteredShifts.length,
                  status: pendingBulkStatus === 'scheduled' ? t('scheduled') : t('completed'),
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-36 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 my-2 text-xs text-slate-600" data-testid="bulk-affected-shifts-list">
              <span className="font-semibold block mb-1 text-slate-700">
                {t('affectedShifts', { count: selectedFilteredShifts.length }) || `Affected shifts (${selectedFilteredShifts.length}):`}
              </span>
              <ul className="list-disc pl-4 space-y-0.5" data-testid="bulk-affected-ids">
                {selectedFilteredShifts.map(s => (
                  <li key={s.id} className="truncate" data-testid={`bulk-affected-item-${s.id}`}>
                    <span className="font-mono text-[11px] text-slate-500">{s.id.slice(0, 8)}:</span> {s.title || s.id}
                  </li>
                ))}
              </ul>
            </div>
            <DialogFooter className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                data-testid="cancel-bulk-status-btn"
                disabled={isBulkUpdating}
                onClick={() => setPendingBulkStatus(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                data-testid="confirm-bulk-status-btn"
                disabled={isBulkUpdating}
                onClick={async () => {
                  setIsBulkUpdating(true)
                  try {
                    const result = await shiftService.bulkUpdateStatus(selectedFilteredShifts, pendingBulkStatus)
                    await loadData()
                    if (result.failed === 0) {
                      toast({ title: 'Success', description: `Updated ${result.succeeded} shifts`, variant: 'success' })
                      setSelectedIds(new Set())
                      setShowBulkActions(false)
                      return
                    }
                    const conflicts = result.outcomes.filter(outcome => !outcome.success && outcome.error_message?.includes('STALE_WRITE')).length
                    toast({
                      title: result.succeeded > 0 ? 'Partial update' : 'Action failed',
                      description: `Updated ${result.succeeded} of ${selectedFilteredShifts.length} shifts. ${result.failed} failed${conflicts > 0 ? ` (${conflicts} version conflict)` : ''}: ${result.outcomes.filter(outcome => !outcome.success).map(outcome => outcome.shift_title || outcome.shift_id).join(', ')}`,
                      variant: 'destructive',
                    })
                  } finally {
                    setIsBulkUpdating(false)
                    setPendingBulkStatus(null)
                  }
                }}
              >
                {isBulkUpdating ? '...' : t('confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </>
  )
}
