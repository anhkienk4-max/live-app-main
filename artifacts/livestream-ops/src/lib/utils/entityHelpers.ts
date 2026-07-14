/**
 * Shared Entity Helpers
 * Reusable functions for getting entity names, colors, and display data
 * Used across Calendar, Reports, Live, Swaps, and Shifts components
 */

import { Brand, Platform, Campaign, User } from '@/lib/types/database.types'

/**
 * Get brand name from ID
 */
export function getBrandName(brandId: string, brands: Brand[]): string {
  return brands.find((b) => b.id === brandId)?.name || 'Unknown Brand'
}

/**
 * Get brand color from ID
 */
export function getBrandColor(brandId: string, brands: Brand[]): string {
  return brands.find((b) => b.id === brandId)?.color || '#2563EB'
}

/**
 * Get platform name from ID
 */
export function getPlatformName(platformId: string, platforms: Platform[]): string {
  return platforms.find((p) => p.id === platformId)?.name || 'Unknown Platform'
}

/**
 * Get campaign name from ID
 */
export function getCampaignName(campaignId: string | undefined, campaigns: Campaign[]): string {
  if (!campaignId) return 'N/A'
  return campaigns.find((c) => c.id === campaignId)?.name || 'N/A'
}

/**
 * Get user name from ID
 */
export function getUserName(userId: string | undefined, users: User[]): string {
  if (!userId) return 'Unassigned'
  return users.find((u) => u.id === userId)?.full_name || 'Unassigned'
}

/**
 * Get user email from ID
 */
export function getUserEmail(userId: string | undefined, users: User[]): string {
  if (!userId) return ''
  return users.find((u) => u.id === userId)?.email || ''
}

/**
 * Get status color class
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-100 text-blue-800'
    case 'live':
      return 'bg-red-100 text-red-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'cancelled':
      return 'bg-gray-100 text-gray-800'
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'approved':
      return 'bg-green-100 text-green-800'
    case 'rejected':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

/**
 * Format shift time range
 */
export function formatShiftTime(startTime: string, endTime: string): string {
  return `${startTime} - ${endTime}`
}

/**
 * Get priority color for swap requests
 */
export function getPriorityColor(priority: 'high' | 'medium' | 'low'): string {
  switch (priority) {
    case 'high':
      return 'border-l-red-500 bg-red-50'
    case 'medium':
      return 'border-l-yellow-500 bg-yellow-50'
    case 'low':
      return 'border-l-blue-500 bg-blue-50'
    default:
      return 'border-l-gray-500 bg-gray-50'
  }
}
