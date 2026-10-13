const reasons: Record<string, string> = {
  STORAGE_ROUTE_NOT_CONFIGURED: 'Chưa có tuyến lưu trữ phù hợp với Brand/Platform/Nguồn vận hành.',
  CANONICAL_STORAGE_ROUTE_NOT_INITIALIZED: 'Tuyến lưu trữ chuẩn chưa được khởi tạo.',
  OPERATIONAL_FILE_CONFIDENTIAL_STORAGE_NOT_APPROVED: 'Tuyến lưu trữ này chưa được phê duyệt.',
  OPERATIONAL_FILE_CAMPAIGN_PLATFORM_MISMATCH: 'Campaign và Platform không khớp.',
  STORAGE_ROUTE_CONFIG_INVALID: 'Cấu hình tuyến lưu trữ không hợp lệ; cần kiểm tra thư mục gốc và phạm vi.',
  GOOGLE_DRIVE_ROOT_FOLDER_INVALID: 'Thư mục gốc Google Drive không hợp lệ.',
  GOOGLE_DRIVE_NOT_CONFIGURED: 'Google Drive chưa được cấu hình.',
  GOOGLE_DRIVE_AUTH_FAILED: 'Xác thực Google Drive thất bại.',
  GOOGLE_DRIVE_REAUTH_REQUIRED: 'Cần cấp lại quyền truy cập Google Drive.',
  GOOGLE_DRIVE_PERMISSION_DENIED: 'Tài khoản lưu trữ không có quyền truy cập thư mục.',
  OPERATIONAL_FILE_GATEWAY_FAILED: 'Dịch vụ lưu trữ chưa trả về kết quả hợp lệ; chưa xác định được nguyên nhân.',
}
export function scheduleArchiveFailureMessage(error: unknown, persistedRows: number): string {
  const value = error instanceof Error ? error.message : ''
  const code = /^[A-Z][A-Z0-9_]{1,100}$/.test(value) ? value : 'SCHEDULE_ARCHIVE_FAILED'
  return 'Đã ghi ' + persistedRows + ' dòng ca. Lưu file nguồn chưa hoàn tất: '
    + (reasons[code] ?? 'Không thể lưu file nguồn.') + ' [' + code + '] '
    + 'Các ca đã ghi không bị hoàn tác. Thử lại chỉ lưu file của cùng batch, không import lại ca.'
}
