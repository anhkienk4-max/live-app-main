/**
 * AI Module Index
 * Centralized exports for the AI module
 */

// Core service
export { aiService, AIService, openai, DEFAULT_MODEL } from './service'

// Types
export type {
  MessageRole,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatStreamChunk,
  OpenAIModel,
  AIServiceConfig,
} from './types'

export { OPENAI_MODELS } from './types'

// Hooks
export { useAIChat } from './hooks'
export type { UseAIChatOptions, UseAIChatReturn } from './hooks'

// Prompts
export * from './prompts'

// Utils
export * from './utils'
