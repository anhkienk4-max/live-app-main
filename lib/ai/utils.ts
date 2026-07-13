/**
 * AI Utility Functions
 * Helper functions for AI operations
 */

import { ChatMessage } from './types'

/**
 * Create a system message
 */
export function createSystemMessage(content: string): ChatMessage {
  return { role: 'system', content }
}

/**
 * Create a user message
 */
export function createUserMessage(content: string): ChatMessage {
  return { role: 'user', content }
}

/**
 * Create an assistant message
 */
export function createAssistantMessage(content: string): ChatMessage {
  return { role: 'assistant', content }
}

/**
 * Build a conversation with system prompt and messages
 */
export function buildConversation(
  systemPrompt: string,
  messages: ChatMessage[]
): ChatMessage[] {
  return [createSystemMessage(systemPrompt), ...messages]
}

/**
 * Truncate text to a maximum length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Sanitize user input for AI prompts
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 10000) // Limit length
}

/**
 * Format number for prompts
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Format currency for prompts
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

/**
 * Calculate engagement rate
 */
export function calculateEngagementRate(data: {
  likes: number
  comments: number
  shares: number
  viewers: number
}): number {
  const totalEngagement = data.likes + data.comments + data.shares
  return data.viewers > 0 ? (totalEngagement / data.viewers) * 100 : 0
}

/**
 * Calculate conversion rate
 */
export function calculateConversionRate(orders: number, viewers: number): number {
  return viewers > 0 ? (orders / viewers) * 100 : 0
}

/**
 * Extract key metrics from report data
 */
export function extractReportMetrics(report: any) {
  return {
    revenue: report.revenue || 0,
    orders: report.orders || 0,
    peak_viewers: report.peak_viewer || 0,
    avg_viewers: report.average_viewer || 0,
    engagement_rate: calculateEngagementRate({
      likes: report.likes || 0,
      comments: report.comments || 0,
      shares: report.shares || 0,
      viewers: report.average_viewer || 1,
    }),
    conversion_rate: calculateConversionRate(
      report.orders || 0,
      report.average_viewer || 1
    ),
  }
}
