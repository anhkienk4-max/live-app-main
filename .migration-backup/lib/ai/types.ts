/**
 * AI Chat Message Types
 */

export type MessageRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: MessageRole
  content: string
}

export interface ChatCompletionRequest {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  stream?: boolean
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
}

export interface ChatCompletionResponse {
  content: string
}

export interface ChatStreamChunk {
  content: string
}

/**
 * Available OpenAI Models
 */
export const OPENAI_MODELS = {
  // GPT-5 Series (via Emergent Universal Key)
  GPT_5_5: 'gpt-5.5',
  GPT_5_4: 'gpt-5.4',
  GPT_5_4_MINI: 'gpt-5.4-mini',
  GPT_5_2: 'gpt-5.2',
  GPT_5_1: 'gpt-5.1',
  GPT_5: 'gpt-5',
  GPT_5_MINI: 'gpt-5-mini',
  GPT_5_NANO: 'gpt-5-nano',
  
  // GPT-4 Series
  GPT_4: 'gpt-4',
  GPT_4O: 'gpt-4o',
  GPT_4_1: 'gpt-4.1',
  GPT_4_1_MINI: 'gpt-4.1-mini',
  GPT_4_1_NANO: 'gpt-4.1-nano',
  
  // O-Series (Reasoning Models)
  O3: 'o3',
  O3_PRO: 'o3-pro',
  O4_MINI: 'o4-mini',
  O1: 'o1',
} as const

export type OpenAIModel = typeof OPENAI_MODELS[keyof typeof OPENAI_MODELS]

/**
 * AI Service Configuration
 */
export interface AIServiceConfig {
  model?: OpenAIModel
  temperature?: number
  maxTokens?: number
  systemMessage?: string
}
