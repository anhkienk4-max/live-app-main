'use client'

import * as React from 'react'
import { shiftService } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User } from '@/lib/types/database.types'
import { exportShiftsToExcel, downloadExcelTemplate, importShiftsFromExcel } from '@/lib/utils/excelUtils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, Upload, AlertCircle, CheckCircle } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

interface ImportExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  onSuccess: () => void
}

export function ImportExportDialog({ open, onOpenChange, shifts, brands, platforms, campaigns, users, onSuccess }: ImportExportDialogProps) {
  const [importing, setImporting] = React.useState(false)
  const [importResult, setImportResult] = React.useState<any>(null)
  const { toast } = useToast()

  const handleExport = () => {
    const brandMap = new Map(brands.map(b => [b.id, b.name]))
    const platformMap = new Map(platforms.map(p => [p.id, p.name]))
    const campaignMap = new Map(campaigns.map(c => [c.id, c.name]))
    const userMap = new Map(users.map(u => [u.id, u.full_name]))
    
    exportShiftsToExcel(shifts, brandMap, platformMap, campaignMap, userMap)
    toast({ title: 'Success', description: 'Shifts exported to Excel', variant: 'success' })
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    const brandMap = new Map(brands.map(b => [b.name, b.id]))
    const platformMap = new Map(platforms.map(p => [p.name, p.id]))
    const campaignMap = new Map(campaigns.map(c => [c.name, c.id]))
    const userMap = new Map(users.map(u => [u.email, u.id]))

    try {
      const result = await importShiftsFromExcel(file, brandMap, platformMap, campaignMap, userMap)
      setImportResult(result)
      
      if (result.success) {
        toast({ title: 'Import Ready', description: `${result.validRows} shifts ready to import` })
      } else {
        toast({ title: 'Validation Errors', description: `${result.invalidRows} rows have errors`, variant: 'destructive' })
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to parse file', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  const confirmImport = async () => {
    if (!importResult?.validShifts) return
    
    setImporting(true)
    try {
      for (const shiftData of importResult.validShifts) {
        await shiftService.create(shiftData)
      }
      toast({ title: 'Success', description: `Imported ${importResult.validRows} shifts`, variant: 'success' })
      onSuccess()
      onOpenChange(false)
      setImportResult(null)
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to import shifts', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import / Export Shifts</DialogTitle>
          <DialogDescription>Upload or download shift schedules in Excel format</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="export">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4 py-4">
            <p className="text-sm text-gray-600">Export all shifts to Excel for external editing or backup.</p>
            <div className="flex gap-2">
              <Button onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export All Shifts ({shifts.length})
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-4 py-4">
            <div>
              <p className="text-sm text-gray-600 mb-4">Upload an Excel file to import multiple shifts at once.</p>
              <div className="flex gap-2 mb-4">
                <Button variant="outline" onClick={downloadExcelTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <label className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">Choose file</span>
                  <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
                </label>
                <p className="text-xs text-gray-500 mt-2">XLSX or XLS files only</p>
              </div>

              {importing && <p className="text-sm text-gray-600">Processing file...</p>}

              {importResult && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Import Summary</span>
                    {importResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Total Rows</p>
                      <p className="text-xl font-bold">{importResult.totalRows}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Valid</p>
                      <p className="text-xl font-bold text-green-600">{importResult.validRows}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Errors</p>
                      <p className="text-xl font-bold text-red-600">{importResult.invalidRows}</p>
                    </div>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="mt-3 max-h-48 overflow-y-auto">
                      <p className="text-sm font-medium text-red-900 mb-2">Errors Found:</p>
                      {importResult.errors.slice(0, 10).map((err: any, i: number) => (
                        <div key={i} className="text-xs text-red-700">
                          Row {err.row}: {err.field} - {err.message}
                        </div>
                      ))}
                      {importResult.errors.length > 10 && (
                        <p className="text-xs text-gray-500 mt-2">...and {importResult.errors.length - 10} more errors</p>
                      )}
                    </div>
                  )}

                  {importResult.validRows > 0 && (
                    <Button onClick={confirmImport} disabled={importing} className="w-full mt-4">
                      {importing ? 'Importing...' : `Import ${importResult.validRows} Valid Shifts`}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setImportResult(null) }}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
