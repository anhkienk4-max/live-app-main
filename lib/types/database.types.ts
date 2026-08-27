export type UserRole = 'admin' | 'leader' | 'staff'
export type SystemPermission = 'admin' | 'leader' | 'member'
export type OperationalRole = 'host' | 'support' | 'technical'
export type AccountStatus = 'pending_email_verification' | 'pending_approval' | 'rejected' | 'active'

export type ShiftStatus = 'scheduled' | 'preparing' | 'live' | 'paused' | 'completed' | 'cancelled'
export type RegistrationStatus =
  | 'available'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'manually_assigned'
  | 'removed'
export type ShiftStaffIdentityMatchMethod = 'exact' | 'normalized' | 'manual'
export type ShiftRegistrationReviewAction = 'approve' | 'reject'
export type ReportStatus = 'draft' | 'in_review' | 'confirmed' | 'reopened' | 'archived'
export type KnowledgeStatus = 'active' | 'inactive' | 'draft'
export type CampaignStatus = 'draft' | 'active' | 'completed' | 'cancelled'

export type SwapStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'approved' | 'completed'
export type SwapMode = 'replacement' | 'move' | 'exchange'

export interface LifecycleMetadata {
  deleted_at?: string
  deleted_by?: string
  archived_at?: string
  archived_by?: string
  deletion_reason?: string
}

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'soft_delete'
  | 'restore'
  | 'archive'
  | 'unarchive'
  | 'confirm'
  | 'unconfirm'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'unassign'
  | 'register'
  | 'cancel_registration'
  | 'lock'
  | 'reopen'
  | 'import'
  | 'export'
  | 'ocr_run'
  | 'ocr_rerun'
  | 'ocr_reset'
  | 'upload'
  | 'remove_upload'
  | 'account_registered'
  | 'email_verified'
  | 'email_auto_verified_mock'
  | 'account_approved'
  | 'account_rejected'
  | 'role_assigned'
  | 'login_success'
  | 'login_failed'

export type AuditModule =
  | 'calendar'
  | 'live'
  | 'reports'
  | 'staff'
  | 'brands'
  | 'platforms'
  | 'campaigns'
  | 'swaps'
  | 'imports'
  | 'settings'

export interface AuditRelatedRecord {
  entity_type: string
  entity_id: string
  entity_name: string
  count?: number
}

export interface AuditLog {
  id: string
  timestamp: string
  actor_id: string
  actor_name: string
  actor_role: SystemPermission
  module: AuditModule
  action: AuditAction
  entity_type: string
  entity_id: string
  entity_name: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  reason?: string
  source: 'manual' | 'excel_import' | 'google_sheets' | 'system' | 'ocr' | 'upload'
  status: 'success' | 'failed'
  correlation_id: string
  related_records?: AuditRelatedRecord[]
  entity_exists: boolean
  admin_note?: string
  review_status?: 'unreviewed' | 'reviewed' | 'action_required' | 'resolved'
  handling_reason?: string
}

export interface DeletionImpact {
  entity_type: string
  entity_id: string
  entity_name: string
  action: 'delete' | 'soft_delete' | 'archive' | 'cancel' | 'reopen'
  consequence: string
  reversible: boolean
  related_records: AuditRelatedRecord[]
}

export interface BulkShiftDeletionOutcome {
  shift_id: string
  shift_title?: string
  success: boolean
  error_code?: string
  error_message?: string
}

export interface BulkShiftDeletionResult {
  outcomes: BulkShiftDeletionOutcome[]
  succeeded: number
  failed: number
}


export interface User extends LifecycleMetadata {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  /** Future Supabase Storage path. Mock mode stores metadata only. */
  avatar_storage_path?: string
  phone?: string
  role: UserRole
  /** Legacy role retained while authentication is still mocked. */
  system_permission?: SystemPermission
  operational_roles?: OperationalRole[]
  department?: string
  status: 'active' | 'inactive'
  account_status?: AccountStatus
  email_verified?: boolean
  auth_provider?: 'email' | 'google'
  join_date: string
  created_at: string
  updated_at: string
}

export interface Brand extends LifecycleMetadata {
  id: string
  name: string
  logo_url?: string
  color?: string
  description?: string
  category?: string
  status?: KnowledgeStatus
  contact_person?: string
  contact_email?: string
  contact_phone?: string
  brand_guideline?: string
  tone_of_voice?: string
  key_products?: string[]
  mandatory_claims?: string[]
  restricted_claims?: string[]
  dos?: string[]
  donts?: string[]
  asset_links?: string[]
  notes?: string
  updated_by?: string
  created_at: string
  updated_at: string
}

export interface Platform extends LifecycleMetadata {
  id: string
  name: string
  icon?: string
  logo_url?: string
  platform_type?: string
  platform_url?: string
  status?: KnowledgeStatus
  account_information?: string
  policy_notes?: string
  livestream_rules?: string[]
  content_restrictions?: string[]
  technical_requirements?: string[]
  report_requirements?: string[]
  external_links?: string[]
  updated_by?: string
  created_at: string
  updated_at: string
}

export interface Campaign extends LifecycleMetadata {
  id: string
  name: string
  brand_id: string
  start_date: string
  end_date: string
  type?: string
  notes?: string
  campaign_url?: string
  website_url?: string | null
  website_title?: string | null
  website_preview_image?: string | null
  website_embed_enabled?: boolean
  platform_source?: string
  platform_ids?: string[]
  status?: CampaignStatus
  owner_id?: string
  created_at: string
  updated_at: string
}

export interface Shift extends LifecycleMetadata {
  id: string
  date: string
  start_time: string
  end_time: string
  start_at?: string
  end_at?: string
  end_date?: string
  crosses_midnight?: boolean
  duration_minutes?: number
  brand_id: string
  platform_id: string
  campaign_id?: string
  title?: string
  studio?: string
  host_id?: string
  support_id?: string
  technical_id?: string
  host_names?: string[]
  assistant_names?: string[]
  technical_names?: string[]
  required_host_count?: number
  required_support_count?: number
  required_technical_count?: number
  registration_locked?: boolean
  registration_cutoff_at?: string
  allow_multi_role?: boolean
  import_batch_id?: string
  status: ShiftStatus
  live_link?: string
  product_notes?: string
  updated_by?: string
  created_at: string
  updated_at: string
}

export interface DashboardUpdate extends LifecycleMetadata {
  id: string
  shift_id: string
  time: string
  revenue: number
  gmv?: number
  orders: number
  peak_viewers: number
  current_viewers: number
  total_views?: number
  total_viewers?: number
  likes?: number
  comments?: number
  shares?: number
  screenshot_url?: string
  dashboard_platform?: ReportDashboardPlatform
  normalized_metrics?: Partial<Record<ReportMetricKey, ReportMetricValue>>
  ocr_review?: OcrReviewData
  raw_ocr_output?: string
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface FinalReportRecap {
  traffic_summary?: string
  platform_vouchers?: string
  shop_vouchers?: string
  best_performing_time_slots?: string
  customer_product_gift_interest?: string
  main_comment_topics?: string
  live_price_feedback?: string
  top_selling_products?: string
  live_issues?: string
}

export interface Report extends LifecycleMetadata {
  id: string
  shift_id: string
  revenue: number
  orders: number
  peak_viewer: number
  average_viewer: number
  likes?: number
  comments: number
  shares: number
  top_products?: string[]
  insights_good?: string
  insights_improvement?: string
  final_recap?: FinalReportRecap
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
  dashboard_platform?: ReportDashboardPlatform
  normalized_metrics?: NormalizedReportMetrics
  platform_metrics?: NormalizedReportMetrics
  raw_ocr_output?: string
  ocr_review?: OcrReviewData
  status?: ReportStatus
  submitted_by?: string
  reviewed_by?: string
  reviewed_at?: string
  review_notes?: string
  version_number?: number
  updated_by?: string
  revisions?: ReportRevision[]
  created_at: string
  updated_at: string
}

export interface ReportRevision {
  version: number
  created_at: string
  created_by: string
  status: ReportStatus
  reason?: string
  event: 'create' | 'save' | 'ocr_run' | 'ocr_rerun' | 'confirm' | 'reopen' | 'upload_image' | 'remove_image' | 'archive'
  metrics: {
    normalized?: NormalizedReportMetrics
    platform?: NormalizedReportMetrics
    revenue: number
    orders: number
    peak_viewer: number
    average_viewer: number
  }
  ocr_review?: OcrReviewData
  final_recap?: FinalReportRecap
  image_references: string[]
}

export interface ReportImage extends LifecycleMetadata {
  id: string
  report_id: string
  image_url: string
  storage_path?: string
  original_name?: string
  mime_type?: string
  size_bytes?: number
  image_type: ReportImageCategory
  uploaded_by?: string
  created_at: string
}

export type ReportImageCategory = 'dashboard' | 'livestream' | 'host' | 'support' | 'technical' | 'voucher' | 'product' | 'other'

export type LiveReportImageCategory =
  | 'key_visual'
  | 'live_session'
  | 'other'

export interface LiveReportImage {
  id: string
  report_id?: string
  category: LiveReportImageCategory
  title?: string
  description?: string
  captured_at?: string
  file_url: string
  thumbnail_url?: string
  file_name: string
  mime_type: string
  size_bytes: number
  sort_order: number
  is_cover: boolean
  uploaded_by?: string
  created_at: string
}

export type OcrConfidence = 'high' | 'medium' | 'low'
export type OcrMetricStatus = 'confirmed' | 'accepted' | 'review_required' | 'low_confidence' | 'rejected' | 'manual' | 'empty'
export type OcrExtractionStrategy = 'anchor_card' | 'normalized_roi' | 'legacy_relative'
export type OcrEvidenceSourceFamily =
  | 'anchor_aligned_card_crop'
  | 'normalized_roi_ocr'
  | 'legacy_full_image_ocr'
export type TikTokLayoutFamily =
  | 'standard'
  | 'wide_desktop'
  | 'cropped_kpi_panel'
  | 'camera_perspective'
  | 'composite_duplicate'

export type ReportDashboardPlatform = 'tiktok_shop' | 'shopee_live' | 'other'

export type ReportMetricKey =
  | 'revenue'
  | 'gmv'
  | 'orders'
  | 'buyers'
  | 'items_sold'
  | 'total_views'
  | 'engaged_viewers'
  | 'peak_concurrent_viewers'
  | 'average_view_duration_seconds'
  | 'product_clicks'
  | 'ctr'
  | 'conversion_rate'
  | 'average_order_value'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'new_followers'
  | 'live_duration_seconds'
  | 'started_at'
  | 'ended_at'
  | 'current_viewers'
  | 'impressions'
  | 'gmv_per_hour'
  | 'gpm'
  | 'click_rate'
  | 'live_ctr'
  | 'advertising_cost'
  | 'sku_orders'
  | 'ctor'
  | 'roi_gmv_max'
  | 'estimated_gmv'
  | 'sales'
  | 'add_to_cart'
  | 'comment_rate'
  | 'average_basket_size'
  | 'pcu'
  | 'click_to_order_rate'
  | 'total_viewers'

export type ReportMetricValue = number | string | null
export type NormalizedReportMetrics = Partial<Record<ReportMetricKey, ReportMetricValue>>

export interface OcrMetricValue {
  value: ReportMetricValue
  candidate_value?: ReportMetricValue
  normalized_value?: ReportMetricValue
  raw_ocr_label?: string
  corrected_source_label?: string
  raw_ocr_value?: string
  corrected_display_value?: string
  confidence: OcrConfidence
  needs_review: boolean
  original_label?: string
  raw_value?: string
  normalized_key?: ReportMetricKey
  unit?: string
  bounding_box?: { x: number; y: number; width: number; height: number }
  label_box?: { x: number; y: number; width: number; height: number }
  value_box?: { x: number; y: number; width: number; height: number }
  pairing_reason?: string
  pair_score?: number
  source?:
    | 'raw_text_exact'
    | 'raw_text_sequence'
    | 'card_exact'
    | 'word_box_exact'
    | 'spatial_fallback'
    | 'image_ocr'
    | 'local_tesseract_text'
    | 'ai_vision'
    | 'hybrid_agreement'
    | 'trusted_text'
    | 'manual'
    | 'imported'
  status?: OcrMetricStatus
  rejection_reason?: string
  label_confidence?: number
  value_confidence?: number
  spatial_score?: number
  label_source?: 'ocr_text' | 'platform_layout'
  value_source_pass?: 'label' | 'numeric' | 'card'
  conflict_warning?: string
  strategy?: OcrExtractionStrategy
  preprocessing_pass?: string
  evidence_source_family?: OcrEvidenceSourceFamily
  evidence_group?: string
  supporting_word_boxes?: Array<{ x: number; y: number; width: number; height: number }>
  strategy_candidates?: Array<{
    strategy: OcrExtractionStrategy
    raw_text: string
    value_candidate: ReportMetricValue
    confidence: OcrConfidence
    card_ownership: ReportMetricKey
    preprocessing_pass?: string
    evidence_source_family?: OcrEvidenceSourceFamily
    evidence_group?: string
    supporting_word_boxes?: Array<{ x: number; y: number; width: number; height: number }>
    rejection_reason?: string
  }>
  confirmed_by?: string
  confirmed_at?: string
  manual_edit?: {
    original_value?: string
    normalized_ocr_value?: ReportMetricValue
    manual_value: ReportMetricValue
    edited_by: string
    edited_at: string
  }
}

export interface OcrReviewData {
  status: 'waiting' | 'processing' | 'unavailable' | 'review_required' | 'confirmed' | 'failed'
  source_platform?: ReportDashboardPlatform
  engine?: 'tesseract.js'
  recognition_language?: 'eng' | 'vie' | 'eng+vie'
  overall_confidence?: number
  crop_box?: OcrCropBox
  original_dimensions?: { width: number; height: number }
  processed_dimensions?: { width: number; height: number }
  region_diagnostics?: OcrRegionDiagnostics
  metrics: Partial<Record<ReportMetricKey, OcrMetricValue>>
  discarded_conflicts?: Array<{
    canonical_key: ReportMetricKey
    selected_source?: OcrMetricValue['source']
    discarded_source?: OcrMetricValue['source']
    selected_value?: ReportMetricValue
    discarded_value?: ReportMetricValue
    reason: string
  }>
  missing_metric_keys?: ReportMetricKey[]
  unmapped_fields?: Array<{
    original_label: string
    original_value: string
    normalized_key?: ReportMetricKey
    confidence: OcrConfidence
    bounding_box?: { x: number; y: number; width: number; height: number }
    source?:
      | 'raw_text_exact'
      | 'raw_text_sequence'
      | 'card_exact'
      | 'word_box_exact'
      | 'spatial_fallback'
      | 'image_ocr'
      | 'local_tesseract_text'
      | 'ai_vision'
      | 'hybrid_agreement'
      | 'trusted_text'
      | 'manual'
      | 'imported'
    rejection_reason?: string
  }>
  raw_output?: string
  raw_diagnostic_output?: string | null
  diagnostic_export?: OcrDiagnosticExport
  error_message?: string
}

export interface OcrRuntimeDiagnostics {
  runtime_id: string
  browser: {
    name: string
    version: string
    user_agent: string
    operating_system: string
    device_pixel_ratio: number
    viewport: { width: number; height: number }
  }
  image: {
    decoded_width: number
    decoded_height: number
    canvas_width: number
    canvas_height: number
  }
  tesseract: {
    package_version: string
    core_version: string
    language: 'eng+vie'
    language_data_version: string
    language_data_source: string
    worker_path: string
    core_path: string
    cache_method: 'none'
    asset_sha256: Record<string, string>
    worker_parameters: Record<string, string>
  }
  preprocessing_pipeline: string[]
  selected_roi?: OcrCropBox
  normalized_roi_dimensions?: { width: number; height: number }
}

export interface OcrDiagnosticExport {
  schema_version: '1'
  generated_at: string
  source_platform: ReportDashboardPlatform
  runtime?: OcrRuntimeDiagnostics
  raw_ocr_text: string
  strategy_text?: Partial<Record<OcrExtractionStrategy, string>>
  words: OcrRecognizedWord[]
  card_diagnostics: NonNullable<OcrImageRecognition['pass_output']['card_diagnostics']>
  region_diagnostics?: OcrRegionDiagnostics
  candidates: Array<{
    canonical_key: ReportMetricKey
    metric: OcrMetricValue
  }>
  selected_metrics: OcrReviewData['metrics']
  discarded_conflicts: NonNullable<OcrReviewData['discarded_conflicts']>
  missing_metric_keys: ReportMetricKey[]
}

export interface OcrCropBox {
  left: number
  top: number
  width: number
  height: number
}

export interface OcrPoint {
  x: number
  y: number
}

export interface OcrDashboardCandidate {
  id: string
  platform: Exclude<ReportDashboardPlatform, 'other'>
  crop_box: OcrCropBox
  bounding_box: { x: number; y: number; width: number; height: number }
  quadrilateral: [OcrPoint, OcrPoint, OcrPoint, OcrPoint]
  confidence: number
  anchor_labels: string[]
  anchor_keys: ReportMetricKey[]
  anchor_count: number
  kpi_completeness: number
  area_ratio: number
  aspect_ratio: number
  ocr_readability: number
  source_method: 'anchor_similarity' | 'anchor_affine' | 'anchor_homography' | 'anchor_and_color' | 'anchor_cluster' | 'color_contour' | 'manual_crop' | 'legacy_layout'
  perspective_correction_applied: boolean
  layout_family?: TikTokLayoutFamily
}

export interface OcrRegionDiagnostics {
  original_dimensions: { width: number; height: number }
  platform_candidates: Array<{
    platform: Exclude<ReportDashboardPlatform, 'other'>
    anchor_count: number
    confidence: number
  }>
  dashboard_candidates: OcrDashboardCandidate[]
  selected_candidate_id?: string
  selected_roi?: OcrCropBox
  normalized_roi_dimensions?: { width: number; height: number }
  perspective_correction_applied: boolean
  ambiguous: boolean
  selection_required: boolean
  selection_reason: 'dominant_candidate' | 'manual_crop' | 'ambiguous_candidates' | 'low_confidence' | 'no_candidate' | 'legacy_fallback'
  fallback_usage?: 'none' | 'legacy_full_image_layout'
}

export interface OcrRecognizedWord {
  text: string
  confidence: number
  line_id: string
  block_index: number
  line_index: number
  platform: ReportDashboardPlatform
  source: 'image_ocr'
  pass: 'label' | 'numeric' | 'card'
  evidence_source_family?: OcrEvidenceSourceFamily
  evidence_group?: string
  bounding_box: { x: number; y: number; width: number; height: number }
  x0?: number
  y0?: number
  x1?: number
  y1?: number
  centerX?: number
  centerY?: number
  width?: number
  height?: number
}

export interface OcrImageRecognition {
  engine: 'tesseract.js'
  language: 'eng+vie'
  text: string
  pass_output: {
    label: string
    numeric: string
    card?: Record<string, string[]>
    card_labels?: Record<string, string[]>
    card_diagnostics?: Record<string, Array<{
      text: string
      confidence: number
      preprocessing_pass: string
      evidence_source_family?: OcrEvidenceSourceFamily
      evidence_group?: string
      bounding_box: { x: number; y: number; width: number; height: number }
    }>>
    strategy_text?: Partial<Record<OcrExtractionStrategy, string>>
  }
  confidence: number
  words: OcrRecognizedWord[]
  crop_box: OcrCropBox
  original_dimensions: { width: number; height: number }
  processed_dimensions: { width: number; height: number }
  region_diagnostics?: OcrRegionDiagnostics
  runtime_diagnostics?: OcrRuntimeDiagnostics
}

export interface SwapRequest extends LifecycleMetadata {
  id: string
  // Legacy single-shift field kept for compatibility; mirrors source_shift_id for replacement/move
  shift_id: string
  requester_id: string
  operational_role?: OperationalRole
  // Canonical swap fields
  mode?: SwapMode
  source_shift_id?: string
  target_shift_id?: string | null
  source_registration_id?: string
  counterpart_registration_id?: string | null
  counterpart_id?: string | null
  // Legacy assignment fields kept nullable for compat
  original_staff_id?: string
  replacement_staff_id?: string
  new_host_id?: string
  new_support_id?: string
  new_technical_id?: string
  reason: string
  notes?: string
  approval_history?: Array<{
    action: 'created' | 'accepted' | 'rejected' | 'cancelled' | 'approved' | 'completed'
    actor_id: string
    mode?: SwapMode
    requester_id?: string
    counterpart_id?: string | null
    replacement_staff_id?: string | null
    source_registration_id?: string
    counterpart_registration_id?: string | null
    source_shift_id?: string
    target_shift_id?: string | null
    operational_role?: OperationalRole
    from_status?: SwapStatus | null
    to_status?: SwapStatus
    reason?: string
    at: string
    notes?: string
  }>
  status: SwapStatus
  approved_by?: string
  approved_at?: string
  responded_at?: string
  responded_by?: string
  completed_at?: string
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

export interface ShiftRegistration {
  id: string
  shift_id: string
  user_id: string
  operational_role: OperationalRole
  status: RegistrationStatus
  source: 'self_registration' | 'manual_assignment' | 'legacy_assignment'
  requested_at: string
  reviewed_by?: string
  reviewed_at?: string
  review_notes?: string
  cancelled_at?: string
  imported_name?: string
  match_method?: ShiftStaffIdentityMatchMethod
  created_at: string
  updated_at: string
}

export interface ShiftRegistrationReviewResult {
  registration_id: string
  action: ShiftRegistrationReviewAction
  success: boolean
  registration?: ShiftRegistration
  error_code?: string
  error_message?: string
}

export type ScheduleImportSource = 'excel' | 'google_sheets'
export type ScheduleImportStatus = 'previewed' | 'confirmed' | 'failed' | 'cancelled'
export type ScheduleImportRowOutcome =
  | 'pending'
  | 'imported'
  | 'validation_failed'
  | 'duplicate_skipped'
  | 'warning'
  | 'retryable'

export interface ScheduleImportRow {
  row_number: number
  date: string
  start_time: string
  end_time: string
  end_date?: string
  crosses_midnight?: boolean
  duration_minutes?: number
  brand_name: string
  platform_name: string
  campaign_name?: string
  title: string
  studio?: string
  host_names?: string[]
  assistant_names?: string[]
  technical_names?: string[]
  required_host_count: number | string
  required_support_count: number | string
  required_technical_count: number | string
  notes?: string
  warnings: string[]
  errors: string[]
}

export interface ScheduleImportBatch extends LifecycleMetadata {
  id: string
  source: ScheduleImportSource
  source_name: string
  status: ScheduleImportStatus
  total_rows: number
  valid_rows: number
  invalid_rows: number
  warning_rows: number
  imported_rows?: number
  duplicate_rows?: number
  failed_rows?: number
  retryable_rows?: number
  preview_rows?: ScheduleImportRow[]
  created_by: string
  created_at: string
  confirmed_at?: string
}

export interface ScheduleImportBatchRow {
  id: string
  batch_id: string
  row_number: number
  outcome: ScheduleImportRowOutcome
  shift_id?: string
  source_row: ScheduleImportRow
  failure_code?: string
  created_at: string
  updated_at: string
}

export interface ScheduleChangeLog {
  id: string
  timestamp: string
  actor_id: string
  action: string
  shift_id: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  source: 'manual' | 'excel_import' | 'google_sheets' | 'system'
  reason?: string
  status: 'success' | 'failed'
}

export interface PersonalSettings {
  language: 'en' | 'vi'
  timezone: string
  date_format: string
  notifications_enabled: boolean
  default_calendar_view: 'month' | 'week' | 'day' | 'list'
  preferred_roles: OperationalRole[]
}

export interface OperationalSettings {
  registration_cutoff_hours: number
  auto_lock_filled_shifts: boolean
  allow_multi_role_per_shift: boolean
  require_registration_approval: boolean
  team_notifications_enabled: boolean
  swap_approval_required: boolean
  require_report_review: boolean
  report_reminder_hours: number
  default_host_count: number
  default_support_count: number
  default_technical_count: number
}
