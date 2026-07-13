export type UserRole = 'admin' | 'leader' | 'staff'

export type ShiftStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'

export type SwapStatus = 'pending' | 'approved' | 'rejected'

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  phone?: string
  role: UserRole
  department?: string
  status: 'active' | 'inactive'
  join_date: string
  created_at: string
  updated_at: string
}

export interface Brand {
  id: string
  name: string
  logo_url?: string
  color?: string
  created_at: string
  updated_at: string
}

export interface Platform {
  id: string
  name: string
  icon?: string
  created_at: string
  updated_at: string
}

export interface Campaign {
  id: string
  name: string
  brand_id: string
  start_date: string
  end_date: string
  type?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Shift {
  id: string
  date: string
  start_time: string
  end_time: string
  brand_id: string
  platform_id: string
  campaign_id?: string
  host_id?: string
  support_id?: string
  status: ShiftStatus
  live_link?: string
  product_notes?: string
  created_at: string
  updated_at: string
}

export interface DashboardUpdate {
  id: string
  shift_id: string
  time: string
  revenue: number
  orders: number
  peak_viewers: number
  current_viewers: number
  screenshot_url?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Report {
  id: string
  shift_id: string
  revenue: number
  orders: number
  peak_viewer: number
  average_viewer: number
  likes: number
  comments: number
  shares: number
  top_products?: string[]
  insights_good?: string
  insights_improvement?: string
  replay_url?: string
  dashboard_url?: string
  created_at: string
  updated_at: string
}

export interface ReportImage {
  id: string
  report_id: string
  image_url: string
  image_type: 'before_live' | 'dashboard' | 'product' | 'other'
  created_at: string
}

export interface SwapRequest {
  id: string
  shift_id: string
  requester_id: string
  new_host_id?: string
  new_support_id?: string
  reason: string
  status: SwapStatus
  approved_by?: string
  approved_at?: string
  created_at: string
  updated_at: string
}

export interface Settings {
  id: string
  key: string
  value: string
  created_at: string
  updated_at: string
}
