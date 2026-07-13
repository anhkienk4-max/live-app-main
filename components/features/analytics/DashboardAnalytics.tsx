'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, Users, Calendar } from 'lucide-react'

export function DashboardAnalytics() {
  const [timeRange, setTimeRange] = React.useState('7d')

  // Mock data - in production, fetch from API
  const revenueData = [
    { date: 'Mon', revenue: 15420, orders: 234 },
    { date: 'Tue', revenue: 18350, orders: 289 },
    { date: 'Wed', revenue: 22100, orders: 312 },
    { date: 'Thu', revenue: 19800, orders: 276 },
    { date: 'Fri', revenue: 25600, orders: 356 },
    { date: 'Sat', revenue: 31200, orders: 423 },
    { date: 'Sun', revenue: 28900, orders: 398 }
  ]

  const platformData = [
    { name: 'TikTok Shop', value: 45, color: '#2563EB' },
    { name: 'Shopee Live', value: 30, color: '#EC4899' },
    { name: 'Lazada Live', value: 15, color: '#8B5CF6' },
    { name: 'Facebook Live', value: 10, color: '#10B981' }
  ]

  const staffPerformance = [
    { name: 'Sarah J.', sessions: 28, revenue: 125000, avgViewers: 1850 },
    { name: 'Michael C.', sessions: 25, revenue: 118000, avgViewers: 1720 },
    { name: 'Emily D.', sessions: 22, revenue: 98000, avgViewers: 1560 },
    { name: 'David L.', sessions: 20, revenue: 87000, avgViewers: 1420 },
    { name: 'Jessica M.', sessions: 18, revenue: 76000, avgViewers: 1280 }
  ]

  const campaignData = [
    { name: 'Summer Sale', revenue: 245000, sessions: 45 },
    { name: 'New Collection', revenue: 189000, sessions: 32 },
    { name: 'Flash Sale', revenue: 156000, sessions: 28 },
    { name: 'Mega Deals', revenue: 134000, sessions: 24 }
  ]

  const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0)
  const totalOrders = revenueData.reduce((sum, d) => sum + d.orders, 0)
  const avgRevenue = totalRevenue / revenueData.length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold text-green-600">${(totalRevenue / 1000).toFixed(1)}k</div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">Last 7 days</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{totalOrders}</div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">Last 7 days</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Avg Daily Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">${(avgRevenue / 1000).toFixed(1)}k</div>
              <Calendar className="h-8 w-8 text-purple-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">7-day average</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Active Hosts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold">{staffPerformance.length}</div>
              <Users className="h-8 w-8 text-orange-600" />
            </div>
            <div className="text-xs text-gray-600 mt-2">This period</div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue & Orders Trend */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Revenue Trend</CardTitle>
              <Select value={timeRange} onValueChange={(value) => value && setTimeRange(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => `$${value}`} />
                <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders by Day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="orders" fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Platform Distribution & Campaign Performance */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Platform Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {platformData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={campaignData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip formatter={(value) => `$${value}`} />
                <Bar dataKey="revenue" fill="#8B5CF6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Staff Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Staff Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Host</th>
                  <th className="text-right p-3 font-semibold">Sessions</th>
                  <th className="text-right p-3 font-semibold">Total Revenue</th>
                  <th className="text-right p-3 font-semibold">Avg Viewers</th>
                  <th className="text-right p-3 font-semibold">Revenue/Session</th>
                </tr>
              </thead>
              <tbody>
                {staffPerformance.map((staff, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3">{staff.name}</td>
                    <td className="p-3 text-right">{staff.sessions}</td>
                    <td className="p-3 text-right text-green-600 font-semibold">
                      ${staff.revenue.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">{staff.avgViewers}</td>
                    <td className="p-3 text-right">
                      ${(staff.revenue / staff.sessions).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
