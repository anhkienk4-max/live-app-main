'use client'

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { formatCurrency } from '@/lib/utils/currency'

interface DashboardChartsProps {
  trend: Array<{ date: string; revenue: number; orders: number }>
  statusSummary: Array<{ status: string; shifts: number }>
  revenueLabel: string
  ordersLabel: string
  revenueTrendLabel: string
  shiftStatusSummaryLabel: string
  noDataLabel: string
  notEnoughTrendDataLabel: string
  hideStatusSummary?: boolean
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
  notEnoughTrendDataLabel,
  hideStatusSummary,
}: DashboardChartsProps) {
  if (hideStatusSummary) {
    return (
      <div className="flex flex-col h-full">
        <div className={trend.length > 1 ? "h-[160px] sm:h-[180px] md:h-48" : ""}>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value, _name, item) => [String(item.dataKey) === 'revenue' ? formatCurrency(Number(value)) : value, item.name]} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line type="monotone" dataKey="revenue" stroke="var(--success)" name={revenueLabel} />
                <Line type="monotone" dataKey="orders" stroke="var(--primary)" name={ordersLabel} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-start justify-center text-sm text-muted-foreground p-4 bg-muted/20 border border-dashed rounded-md min-h-[96px] md:min-h-[104px]">
              {trend.length === 1 ? (
                <>
                  <div className="text-xl font-medium text-foreground mb-1">{formatCurrency(trend[0].revenue)}</div>
                  <div className="text-small">{notEnoughTrendDataLabel}</div>
                </>
              ) : (
                <div className="text-small text-center w-full">{noDataLabel}</div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-12 pt-4 border-t">
      <div className="lg:col-span-7 flex flex-col">
        <h3 className="text-sm font-semibold mb-4">{revenueTrendLabel}</h3>
        <div className={trend.length > 1 ? "h-[160px] sm:h-[180px] md:h-48" : ""}>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value, _name, item) => [String(item.dataKey) === 'revenue' ? formatCurrency(Number(value)) : value, item.name]} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line type="monotone" dataKey="revenue" stroke="var(--success)" name={revenueLabel} />
                <Line type="monotone" dataKey="orders" stroke="var(--primary)" name={ordersLabel} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-start justify-center text-sm text-muted-foreground p-4 bg-muted/20 border border-dashed rounded-md min-h-[96px] md:min-h-[104px]">
              {trend.length === 1 ? (
                <>
                  <div className="text-xl font-medium text-foreground mb-1">{formatCurrency(trend[0].revenue)}</div>
                  <div className="text-small">{notEnoughTrendDataLabel}</div>
                </>
              ) : (
                <div className="text-small text-center w-full">{noDataLabel}</div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="lg:col-span-5 flex flex-col">
        <h3 className="text-sm font-semibold mb-4">{shiftStatusSummaryLabel}</h3>
        <div className="h-[160px] sm:h-[180px] md:h-48">
          {statusSummary.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusSummary}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="status" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="shifts" fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
             <div className="flex flex-col h-full items-center justify-center text-sm text-muted-foreground p-4 bg-muted/20 border border-dashed rounded-md">
               <div className="text-small text-center w-full">{noDataLabel}</div>
             </div>
          )}
        </div>
      </div>
    </div>
  )
}
