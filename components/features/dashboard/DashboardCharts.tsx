'use client'

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/currency'

interface DashboardChartsProps {
  trend: Array<{ date: string; revenue: number; orders: number }>
  statusSummary: Array<{ status: string; shifts: number }>
  revenueLabel: string
  ordersLabel: string
  revenueTrendLabel: string
  shiftStatusSummaryLabel: string
  noDataLabel: string
}

/** Client-only recharts block, lazy-loaded so KPI cards render without the recharts chunk. */
export function DashboardCharts({
  trend,
  statusSummary,
  revenueLabel,
  ordersLabel,
  revenueTrendLabel,
  shiftStatusSummaryLabel,
  noDataLabel,
}: DashboardChartsProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{revenueTrendLabel}</CardTitle></CardHeader>
        <CardContent className="h-72">
          {trend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value, _name, item) => [String(item.dataKey) === 'revenue' ? formatCurrency(Number(value)) : value, item.name]} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#16a34a" name={revenueLabel} />
                <Line type="monotone" dataKey="orders" stroke="#2563eb" name={ordersLabel} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{noDataLabel}</div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{shiftStatusSummaryLabel}</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusSummary}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="shifts" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
