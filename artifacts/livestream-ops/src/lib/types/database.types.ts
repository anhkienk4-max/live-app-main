// ─── Permission & Role Types ───────────────────────────────────────────────────
/** System-level permission (who can do admin/leader actions) */
export type SystemPermission = 'admin' | 'leader' | 'member'

/** Operational role within a livestream shift */
export type OperationalRole = 'host' | 'support' | 'technical'

/** @deprecated Use SystemPermission. Kept for backward compat during migration. */
export type UserRole = SystemPermission

// ─── Status Types ─────────────────────────────────────────────────────────────
export type ShiftStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'
export type SwapStatus = 'pending' | 'approved' | 'rejected'

// ─── Core Entities ────────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  phone?: string
  /** System permission level */
  permission: SystemPermission
  /** @deprecated Use permission */
  role: SystemPermission
  /** One or more operational roles this person can perform */
  operational_roles: OperationalRole[]
  department?: string
  status: 'active' | 'inactive'
  join_date: string
  created_at: string
  updated_at: string
}

// ─── Brand (Knowledge Base) ───────────────────────────────────────────────────
export interface Brand {
  id: string
  name: string
  logo_url?: string
  color?: string

  // Knowledge base fields
  introduction?: string
  tone_of_voice?: string
  usp?: string                     // Unique Selling Proposition
  product_information?: string
  key_messages?: string
  dos?: string                     // Do's
  donts?: string                   // Don'ts
  important_notes?: string
  training_documents?: TrainingDocument[]
  drive_links?: DriveLink[]

  created_at: string
  updated_at: string
}

export interface TrainingDocument {
  id: string
  title: string
  url: string
  type: 'pdf' | 'video' | 'doc' | 'link' | 'other'
}

export interface DriveLink {
  id: string
  title: string
  url: string
}

// ─── Platform (Knowledge Base) ────────────────────────────────────────────────
export interface Platform {
  id: string
  name: string
  icon?: string

  // Knowledge base fields
  policies?: string
  livestream_rules?: string
  official_documents?: PlatformDocument[]
  penalty_rules?: string
  faq?: PlatformFAQ[]
  useful_links?: PlatformLink[]

  created_at: string
  updated_at: string
}

export interface PlatformDocument {
  id: string
  title: string
  url: string
}

export interface PlatformFAQ {
  id: string
  question: string
  answer: string
}

export interface PlatformLink {
  id: string
  title: string
  url: string
}

// ─── Campaign ─────────────────────────────────────────────────────────────────
export interface Campaign {
  id: string
  name: string
  brand_id: string
  start_date: string
  end_date: string
  type?: string
  notes?: string
  campaign_url?: string            // NEW: campaign landing/tracking URL
  imported_from?: 'manual' | 'excel' | 'api'  // NEW: import source tracking
  created_at: string
  updated_at: string
}

// ─── Shift ────────────────────────────────────────────────────────────────────
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
  technical_id?: string            // NEW: technical staff slot
  status: ShiftStatus
  live_link?: string
  product_notes?: string
  imported_from?: 'manual' | 'excel' | 'google_sheets'  // NEW: import source
  created_at: string
  updated_at: string
}

// ─── Dashboard Update (Live monitoring snapshots) ─────────────────────────────
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

// ─── Report & Images ──────────────────────────────────────────────────────────
export type ReportImageCategory =
  | 'dashboard'
  | 'livestream'
  | 'host'
  | 'support'
  | 'technical'
  | 'voucher'
  | 'product'
  | 'other'

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
  /** Updated to match new categorisation requirement */
  image_type: ReportImageCategory
  caption?: string
  created_at: string
}

// ─── Analytics (OCR Workflow) ─────────────────────────────────────────────────
export type OcrEntryStatus = 'pending_review' | 'confirmed' | 'rejected'

export interface AnalyticsEntry {
  id: string
  shift_id: string
  screenshot_url: string
  ocr_status: OcrEntryStatus
  /** Raw data extracted by OCR (or manually entered until OCR is implemented) */
  extracted_data: {
    revenue?: number
    orders?: number
    peak_viewers?: number
    current_viewers?: number
    likes?: number
    comments?: number
    shares?: number
    [key: string]: number | string | undefined
  }
  /** User-corrected / confirmed version of extracted_data */
  confirmed_data?: AnalyticsEntry['extracted_data']
  notes?: string
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
  updated_at: string
}

// ─── Swap Request ─────────────────────────────────────────────────────────────
export interface SwapRequest {
  id: string
  shift_id: string
  requester_id: string
  /** Which role slot is being swapped */
  role_slot: 'host' | 'support' | 'technical'
  /** The new person proposed to take the slot */
  new_assignee_id?: string
  /** @deprecated use new_assignee_id + role_slot */
  new_host_id?: string
  /** @deprecated use new_assignee_id + role_slot */
  new_support_id?: string
  reason: string
  status: SwapStatus
  approved_by?: string
  approved_at?: string
  created_at: string
  updated_at: string
}

// ─── App Settings ─────────────────────────────────────────────────────────────
export interface AppSettings {
  // System
  language: string           // e.g. 'en', 'vi', 'zh'
  theme: 'light' | 'dark' | 'system'
  timezone: string           // e.g. 'Asia/Ho_Chi_Minh'

  // Company
  company_name: string
  company_logo?: string
  company_email?: string

  // Notifications
  notify_shift_reminder: boolean
  notify_swap_request: boolean
  notify_report_due: boolean
  notify_channel: 'email' | 'in_app' | 'both'

  // Integrations
  google_sheets_api_key?: string
  google_sheets_spreadsheet_id?: string
  supabase_url?: string
  supabase_anon_key?: string
  ai_provider: 'openai' | 'anthropic' | 'gemini'
  ai_model?: string
  ai_api_key?: string         // stored encrypted in production

  // Backup / Import-Export
  auto_backup: boolean
  backup_frequency: 'daily' | 'weekly' | 'monthly'
  last_backup_at?: string
}

/** @deprecated Use AppSettings */
export interface Settings {
  id: string
  key: string
  value: string
  created_at: string
  updated_at: string
}
