export type UserRole = 'admin' | 'leader' | 'staff'
export type SystemPermission = 'admin' | 'leader' | 'member'
export type OperationalRole = 'host' | 'support' | 'technical'

export type ShiftStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'

export type SwapStatus = 'pending' | 'approved' | 'rejected'

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  phone?: string
  role: UserRole
  /** Legacy role retained while authentication is still mocked. */
  system_permission?: SystemPermission
  operational_roles?: OperationalRole[]
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
  campaign_url?: string
  platform_source?: string
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
  technical_id?: string
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
  confirmed_at?: string
  confirmed_by?: string
  metrics_confirmed?: boolean
  gmv?: number
  viewers?: number
  product_clicks?: number
  ctr?: number
  cvr?: number
  average_order_value?: number
  live_duration_minutes?: number
  ocr_review?: OcrReviewData
  created_at: string
  updated_at: string
}

export interface ReportImage {
  id: string
  report_id: string
  image_url: string
  storage_path?: string
  original_name?: string
  mime_type?: string
  size_bytes?: number
  image_type: ReportImageCategory
  created_at: string
}

export type ReportImageCategory = 'dashboard' | 'livestream' | 'host' | 'support' | 'technical' | 'voucher' | 'product' | 'other'

export type OcrConfidence = 'high' | 'medium' | 'low'

export interface OcrMetricValue {
  value: number
  confidence: OcrConfidence
  needs_review: boolean
}

export interface OcrReviewData {
  status: 'not_started' | 'pending_review' | 'confirmed'
  metrics: Partial<Record<'revenue' | 'gmv' | 'orders' | 'viewers' | 'product_clicks' | 'ctr' | 'cvr' | 'average_order_value' | 'live_duration_minutes', OcrMetricValue>>
}

export interface SwapRequest {
  id: string
  shift_id: string
  requester_id: string
  new_host_id?: string
  new_support_id?: string
  new_technical_id?: string
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
