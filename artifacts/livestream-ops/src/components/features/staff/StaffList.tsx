

import * as React from 'react'
import { userService } from '@/lib/services/dataService'
import { User } from '@/lib/types/database.types'
import { DataTable, Column } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { UserPlus, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { StaffFormDialog } from './StaffFormDialog'

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

  React.useEffect(() => {
    loadStaff()
  }, [loadStaff])

  const handleDelete = async (id: string) => {
    const success = await userService.delete(id)
    if (success) {
      toast({ title: 'Success', description: 'Staff member deleted successfully', variant: 'default' })
      loadStaff()
    } else {
      toast({ title: 'Error', description: 'Failed to delete staff member', variant: 'destructive' })
    }
  }

  const handleEdit = (user: User) => {
    setSelectedStaff(user)
    setIsFormOpen(true)
  }

  const handleCreate = () => {
    setSelectedStaff(null)
    setIsFormOpen(true)
  }

  const columns: Column<User>[] = [
    {
      header: 'Staff',
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
      )
    },
    {
      header: 'Department',
      accessor: 'department',
      cell: (value) => value || <span className="text-gray-400">—</span>
    },
    {
      header: 'Role',
      accessor: 'role',
      cell: (value) => (
        <Badge variant={value === 'admin' ? 'default' : 'secondary'} className="capitalize">
          {value}
        </Badge>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value) => (
        <Badge variant={value === 'active' ? 'default' : 'secondary'} className="capitalize">
          {value}
        </Badge>
      )
    },
    {
      header: 'Phone',
      accessor: 'phone',
      cell: (value) => value || <span className="text-gray-400">—</span>
    },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleEdit(row)}
            data-testid={`edit-staff-${row.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteId(row.id)}
            data-testid={`delete-staff-${row.id}`}
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      )
    }
  ]

  if (loading) {
    return <div className="text-center py-12">Loading staff...</div>
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff Management</h2>
          <p className="text-gray-600 mt-1">Manage your team members and their roles</p>
        </div>
        <Button onClick={handleCreate} data-testid="add-staff-btn">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Staff
        </Button>
      </div>

      <DataTable
        data={staff}
        columns={columns}
        searchPlaceholder="Search by name or email..."
        emptyMessage="No staff members found. Add your first team member!"
      />

      <StaffFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        staff={selectedStaff}
        onSuccess={loadStaff}
      />

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Staff Member"
        description="Are you sure you want to delete this staff member? This action cannot be undone."
        onConfirm={() => deleteId && handleDelete(deleteId)}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  )
}
