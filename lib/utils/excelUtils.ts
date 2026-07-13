import * as XLSX from 'xlsx'
import { Shift } from '@/lib/types/database.types'
import { format } from 'date-fns'

export interface ImportError {
  row: number
  field: string
  message: string
}

export interface ImportResult {
  success: boolean
  validShifts: Omit<Shift, 'id' | 'created_at' | 'updated_at'>[]
  errors: ImportError[]
  totalRows: number
  validRows: number
  invalidRows: number
}

// Export shifts to Excel
export function exportShiftsToExcel(
  shifts: Shift[],
  brands: Map<string, string>,
  platforms: Map<string, string>,
  campaigns: Map<string, string>,
  users: Map<string, string>
): void {
  const data = shifts.map(shift => ({
    'Date': shift.date,
    'Start Time': shift.start_time,
    'End Time': shift.end_time,
    'Brand': brands.get(shift.brand_id) || shift.brand_id,
    'Platform': platforms.get(shift.platform_id) || shift.platform_id,
    'Campaign': shift.campaign_id ? (campaigns.get(shift.campaign_id) || shift.campaign_id) : '',
    'Host': shift.host_id ? (users.get(shift.host_id) || shift.host_id) : '',
    'Support': shift.support_id ? (users.get(shift.support_id) || shift.support_id) : '',
    'Status': shift.status,
    'Live Link': shift.live_link || '',
    'Notes': shift.product_notes || '',
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Shifts')

  // Auto-size columns
  const maxWidth = 50
  const colWidths = Object.keys(data[0] || {}).map(key => ({
    wch: Math.min(
      maxWidth,
      Math.max(
        key.length,
        ...data.map(row => String(row[key as keyof typeof row] || '').length)
      )
    )
  }))
  ws['!cols'] = colWidths

  XLSX.writeFile(wb, `shifts_export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
}

// Generate Excel template
export function downloadExcelTemplate(): void {
  const template = [
    {
      'Date': '2024-08-01',
      'Start Time': '09:00',
      'End Time': '13:00',
      'Brand': 'TechGear Pro',
      'Platform': 'TikTok Shop',
      'Campaign': 'Summer Sale 2024',
      'Host': 'host@example.com',
      'Support': 'support@example.com',
      'Status': 'scheduled',
      'Live Link': 'https://tiktok.com/live',
      'Notes': 'Focus on electronics',
    },
  ]

  const ws = XLSX.utils.json_to_sheet(template)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')

  // Add instructions sheet
  const instructions = [
    { Field: 'Date', Format: 'YYYY-MM-DD', Required: 'Yes', Example: '2024-08-01' },
    { Field: 'Start Time', Format: 'HH:MM', Required: 'Yes', Example: '09:00' },
    { Field: 'End Time', Format: 'HH:MM', Required: 'Yes', Example: '13:00' },
    { Field: 'Brand', Format: 'Text', Required: 'Yes', Example: 'TechGear Pro' },
    { Field: 'Platform', Format: 'Text', Required: 'Yes', Example: 'TikTok Shop' },
    { Field: 'Campaign', Format: 'Text', Required: 'No', Example: 'Summer Sale' },
    { Field: 'Host', Format: 'Email', Required: 'No', Example: 'host@example.com' },
    { Field: 'Support', Format: 'Email', Required: 'No', Example: 'support@example.com' },
    { Field: 'Status', Format: 'scheduled/live/completed/cancelled', Required: 'No', Example: 'scheduled' },
    { Field: 'Live Link', Format: 'URL', Required: 'No', Example: 'https://...' },
    { Field: 'Notes', Format: 'Text', Required: 'No', Example: 'Product notes' },
  ]
  const wsInstructions = XLSX.utils.json_to_sheet(instructions)
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

  XLSX.writeFile(wb, 'shift_import_template.xlsx')
}

// Import shifts from Excel
export async function importShiftsFromExcel(
  file: File,
  brandsMap: Map<string, string>, // name -> id
  platformsMap: Map<string, string>, // name -> id
  campaignsMap: Map<string, string>, // name -> id
  usersMap: Map<string, string> // email -> id
): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet)

        const validShifts: Omit<Shift, 'id' | 'created_at' | 'updated_at'>[] = []
        const errors: ImportError[] = []

        jsonData.forEach((row: any, index) => {
          const rowNumber = index + 2 // Excel rows start at 1, plus header
          const rowErrors: ImportError[] = []

          // Validate required fields
          if (!row['Date']) {
            rowErrors.push({ row: rowNumber, field: 'Date', message: 'Date is required' })
          }
          if (!row['Start Time']) {
            rowErrors.push({ row: rowNumber, field: 'Start Time', message: 'Start time is required' })
          }
          if (!row['End Time']) {
            rowErrors.push({ row: rowNumber, field: 'End Time', message: 'End time is required' })
          }
          if (!row['Brand']) {
            rowErrors.push({ row: rowNumber, field: 'Brand', message: 'Brand is required' })
          }
          if (!row['Platform']) {
            rowErrors.push({ row: rowNumber, field: 'Platform', message: 'Platform is required' })
          }

          // Lookup IDs
          const brandId = brandsMap.get(row['Brand'])
          const platformId = platformsMap.get(row['Platform'])
          const campaignId = row['Campaign'] ? campaignsMap.get(row['Campaign']) : undefined
          const hostId = row['Host'] ? usersMap.get(row['Host']) : undefined
          const supportId = row['Support'] ? usersMap.get(row['Support']) : undefined

          if (row['Brand'] && !brandId) {
            rowErrors.push({ row: rowNumber, field: 'Brand', message: `Brand '${row['Brand']}' not found` })
          }
          if (row['Platform'] && !platformId) {
            rowErrors.push({ row: rowNumber, field: 'Platform', message: `Platform '${row['Platform']}' not found` })
          }
          if (row['Campaign'] && !campaignId) {
            rowErrors.push({ row: rowNumber, field: 'Campaign', message: `Campaign '${row['Campaign']}' not found` })
          }
          if (row['Host'] && !hostId) {
            rowErrors.push({ row: rowNumber, field: 'Host', message: `Host '${row['Host']}' not found` })
          }
          if (row['Support'] && !supportId) {
            rowErrors.push({ row: rowNumber, field: 'Support', message: `Support '${row['Support']}' not found` })
          }

          if (rowErrors.length > 0) {
            errors.push(...rowErrors)
          } else {
            validShifts.push({
              date: row['Date'],
              start_time: row['Start Time'],
              end_time: row['End Time'],
              brand_id: brandId!,
              platform_id: platformId!,
              campaign_id: campaignId,
              host_id: hostId,
              support_id: supportId,
              status: row['Status'] || 'scheduled',
              live_link: row['Live Link'] || undefined,
              product_notes: row['Notes'] || undefined,
            })
          }
        })

        resolve({
          success: errors.length === 0,
          validShifts,
          errors,
          totalRows: jsonData.length,
          validRows: validShifts.length,
          invalidRows: errors.length,
        })
      } catch (error) {
        resolve({
          success: false,
          validShifts: [],
          errors: [{ row: 0, field: 'File', message: 'Failed to parse Excel file' }],
          totalRows: 0,
          validRows: 0,
          invalidRows: 0,
        })
      }
    }

    reader.readAsBinaryString(file)
  })
}
