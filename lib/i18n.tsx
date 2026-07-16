'use client'

import * as React from 'react'

export type Language = 'en' | 'vi'
const dictionary = {
  en: {
    dashboard: 'Dashboard', calendar: 'Calendar', live: 'Live', reports: 'Reports', swaps: 'Swaps', analytics: 'Analytics', staff: 'Staff', brands: 'Brands', platforms: 'Platforms', campaigns: 'Campaigns', settings: 'Settings', profile: 'Profile',
    operationsCenter: 'Operations Center', signOut: 'Sign out', language: 'Language', english: 'English', vietnamese: 'Tiếng Việt',
    save: 'Save', cancel: 'Cancel', confirm: 'Confirm', resetFilters: 'Reset filters', loading: 'Loading…', host: 'Host', support: 'Support', technical: 'Technical', status: 'Status', actions: 'Actions',
    reportOcrReview: 'Report & OCR review', confirmed: 'Confirmed', needsReview: 'Needs review', validationError: 'Validation error', required: 'Required',
    calendarSubtitle: 'Operational center for livestream schedule management', reportsSubtitle: 'Live session reports and analytics', swapsTitle: 'Swap Requests', swapsSubtitle: 'Manage shift swap requests', analyticsTitle: 'Analytics & Performance', analyticsSubtitle: 'Track confirmed revenue, performance, and campaign metrics',
  },
  vi: {
    dashboard: 'Tổng quan', calendar: 'Lịch', live: 'Trực tiếp', reports: 'Báo cáo', swaps: 'Đổi ca', analytics: 'Phân tích', staff: 'Nhân sự', brands: 'Thương hiệu', platforms: 'Nền tảng', campaigns: 'Chiến dịch', settings: 'Cài đặt', profile: 'Hồ sơ',
    operationsCenter: 'Trung tâm vận hành', signOut: 'Đăng xuất', language: 'Ngôn ngữ', english: 'English', vietnamese: 'Tiếng Việt',
    save: 'Lưu', cancel: 'Hủy', confirm: 'Xác nhận', resetFilters: 'Đặt lại bộ lọc', loading: 'Đang tải…', host: 'Host', support: 'Hỗ trợ', technical: 'Kỹ thuật', status: 'Trạng thái', actions: 'Thao tác',
    reportOcrReview: 'Báo cáo & rà soát OCR', confirmed: 'Đã xác nhận', needsReview: 'Cần rà soát', validationError: 'Lỗi xác thực', required: 'Bắt buộc',
    calendarSubtitle: 'Trung tâm vận hành lịch livestream', reportsSubtitle: 'Báo cáo và phân tích phiên livestream', swapsTitle: 'Yêu cầu đổi ca', swapsSubtitle: 'Quản lý yêu cầu đổi ca', analyticsTitle: 'Phân tích hiệu suất', analyticsSubtitle: 'Theo dõi doanh thu, hiệu suất và chiến dịch đã xác nhận',
  },
} as const
type TranslationKey = keyof typeof dictionary.en
type Context = { language: Language; setLanguage: (language: Language) => void; t: (key: TranslationKey) => string }
const LanguageContext = React.createContext<Context | null>(null)

// Existing screens are progressively migrated to key-based calls. This bridge keeps
// shared legacy labels synchronized during the migration without duplicating copy in components.
const legacyVietnamese: Record<string, string> = {
  'Loading reports...': 'Đang tải báo cáo…', 'Loading calendar...': 'Đang tải lịch…', 'Loading shifts...': 'Đang tải ca trực…',
  'Filters': 'Bộ lọc', 'Filter': 'Lọc', 'Clear All Filters': 'Xóa tất cả bộ lọc', 'Reset filters': 'Đặt lại bộ lọc', 'New Shift': 'Tạo ca trực', 'Add Shift': 'Thêm ca trực', 'New Report': 'Tạo báo cáo', 'Submit Report': 'Gửi báo cáo', 'View Details': 'Xem chi tiết', 'Cancel': 'Hủy', 'Confirm & save report': 'Xác nhận và lưu báo cáo', 'Review dashboard': 'Rà soát dashboard',
  'Brand': 'Thương hiệu', 'Platform': 'Nền tảng', 'Campaign': 'Chiến dịch', 'Host': 'Host', 'Support': 'Hỗ trợ', 'Technical': 'Kỹ thuật', 'Status': 'Trạng thái', 'Actions': 'Thao tác', 'Date': 'Ngày', 'Time': 'Thời gian', 'Today': 'Hôm nay', 'Yesterday': 'Hôm qua', 'This month': 'Tháng này', 'Last month': 'Tháng trước', 'This quarter': 'Quý này', 'This year': 'Năm nay', 'Custom': 'Tùy chọn',
  'Scheduled': 'Đã lên lịch', 'Completed': 'Hoàn thành', 'Confirmed': 'Đã xác nhận', 'Needs review': 'Cần rà soát', 'Revenue': 'Doanh thu', 'Orders': 'Đơn hàng', 'Peak Viewers': 'Người xem cao nhất', 'Average Viewers': 'Người xem trung bình', 'Likes': 'Lượt thích', 'Comments': 'Bình luận', 'Shares': 'Chia sẻ', 'Role workload': 'Khối lượng công việc theo vai trò', 'Staff': 'Nhân sự',
  'Request Shift Swap': 'Yêu cầu đổi ca', 'Replacement Support': 'Người thay thế hỗ trợ', 'Replacement Technical': 'Người thay thế kỹ thuật', 'Reason for Swap Request': 'Lý do yêu cầu đổi ca', 'Submit Request': 'Gửi yêu cầu', 'Save': 'Lưu', 'Edit Shift': 'Chỉnh sửa ca trực', 'Create New Shift': 'Tạo ca trực mới', 'Duplicate Shift': 'Nhân bản ca trực',
}

function translateLegacyValue(value: string, language: Language) {
  if (language === 'vi') return legacyVietnamese[value] ?? value
  const english = Object.entries(legacyVietnamese).find(([, vietnamese]) => vietnamese === value)?.[0]
  return english ?? value
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<Language>('en')
  React.useEffect(() => { const saved = window.localStorage.getItem('livestream-ops-language'); if (saved === 'en' || saved === 'vi') setLanguageState(saved) }, [])
  const setLanguage = React.useCallback((next: Language) => { setLanguageState(next); window.localStorage.setItem('livestream-ops-language', next) }, [])
  React.useEffect(() => {
    const apply = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []; let node: Node | null
      while ((node = walker.nextNode())) nodes.push(node as Text)
      nodes.forEach(text => { const trimmed = text.nodeValue?.trim(); if (!trimmed) return; const translated = translateLegacyValue(trimmed, language); if (translated !== trimmed) text.nodeValue = text.nodeValue?.replace(trimmed, translated) ?? translated })
      if (root instanceof Element) [root, ...root.querySelectorAll('*')].forEach(element => ['placeholder', 'title', 'aria-label'].forEach(attribute => { const value = element.getAttribute(attribute); if (value) element.setAttribute(attribute, translateLegacyValue(value, language)) }))
    }
    apply(document.body)
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(apply)))
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [language])
  const value = React.useMemo(() => ({ language, setLanguage, t: (key: TranslationKey) => dictionary[language][key] }), [language, setLanguage])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useTranslation() { const context = React.useContext(LanguageContext); if (!context) throw new Error('useTranslation must be used inside LanguageProvider'); return context }

export function LocalizedPageHeading({ title, subtitle }: { title: TranslationKey; subtitle?: TranslationKey }) {
  const { t } = useTranslation()
  return <div><h1 className="text-3xl font-bold text-gray-900 mb-2">{t(title)}</h1>{subtitle && <p className="text-gray-600">{t(subtitle)}</p>}</div>
}
