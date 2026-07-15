import * as React from 'react'
import { userService } from '@/lib/services/dataService'
import { User, OperationalRole } from '@/lib/types/database.types'
import { DataTable, Column } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { UserPlus, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { StaffFormDialog } from './StaffFormDialog'

const PERMISSION_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  leader: 'bg-orange-100 text-orange-700',
  member: 'bg-gray-100 text-gray-700',
}

const ROLE_COLORS: Record<OperationalRole, string> = {
  host: 'bg-blue-100 text-blue-700',
  support: 'bg-green-100 text-green-700',
  technical: 'bg-purple-100 text-purple-700',
}

export function StaffList() {
  const [staff, setStaff] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedStaff, setSelectedStaff] = React.useState<User | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const { toast } = useToast()

  const loadStaff = React.useCallback(async () => {
    setLoading(true)
    const data = await userService.getAll()
    setStaff(data)
    setLoading(false)
  }, [])

  React.useEffect(() => { loadStaff() }, [loadStaff])

  const handleDelete = async (id: string) => {
    const success = await userService.delete(id)
    if (success) {
      toast({ title: 'Success', description: 'Staff member deleted', variant: 'default' })
      loadStaff()
    } else {
      toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' })
    }
  }

  const columns: Column<User>[] = [
    {
      header: 'Staff Member',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={row.avatar_url} />
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {row.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium text-gray-900">{row.full_name}</p>
            <p className="text-sm text-gray-500">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'System Permission',
      accessor: 'permission',
      cell: (value) => (
        <Badge variant="outline" className={`${PERMISSION_COLORS[value] ?? ''} border-0 capitalize`}>
          {value}
        </Badge>
      ),
    },
    {
      header: 'Operational Roles',
      accessor: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.operational_roles?.length
            ? row.operational_roles.map(r => (
                <Badge key={r} variant="outline" className={`${ROLE_COLORS[r]} border-0 capitalize text-xs`}>
                  {r}
                </Badge>
              ))
            : <span className="text-gray-400 text-sm">None assigned</span>
          }
        </div>
      ),
    },
    {
      header: 'Department',
      accessor: 'department',
      cell: (value) => value || <span className="text-gray-400">—</span>,
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value) => (
        <Badge variant={value === 'active' ? 'default' : 'secondary'} className="capitalize">
          {value}
        </Badge>
      ),
    },
    {
      header: 'Phone',
      accessor: 'phone',
      cell: (value) => value || <span className="text-gray-400">—</span>,
    },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedStaff(row); setIsFormOpen(true) }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      ),
    },
  ]

  if (loading) return <div className="text-center py-12">Loading staff…</div>

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff Management</h2>
          <p className="text-gray-600 mt-1">Manage team members, system permissions, and operational roles</p>
        </div>
        <Button onClick={() => { setSelectedStaff(null); setIsFormOpen(true) }}>
          <UserPlus className="h-4 w-4 mr-2" /> Add Staff
        </Button>
      </div>

      <DataTable data={staff} columns={columns} searchPlaceholder="Search by name or email…" emptyMessage="No staff members found." />

      <StaffFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} staff={selectedStaff} onSuccess={loadStaff} />

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Staff Member"
        description="Are you sure? This action cannot be undone."
        onConfirm={() => deleteId && handleDelete(deleteId)}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  )
}
