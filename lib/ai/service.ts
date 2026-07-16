import OpenAI from 'openai'

// Create the OpenAI client only when an AI request is made. This keeps the
// rest of the application available when AI credentials are not configured.
const createOpenAIClient = () =>
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.EMERGENT_LLM_KEY,
  })

// Default model configuration
export const DEFAULT_MODEL = process.env.DEFAULT_AI_MODEL || 'gpt-5.4-mini'

// AI Service for chat completions
export class AIService {
  private client?: OpenAI
  private model: string

  constructor(model?: string) {
    this.model = model || DEFAULT_MODEL
  }

  private getClient() {
    this.client ??= createOpenAIClient()
    return this.client
  }

  /**
   * Send a chat message and get a streaming response
   * @param messages - Array of chat messages
   * @param options - Additional options (temperature, max_tokens, etc.)
   */
  async streamChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number
      max_tokens?: number
      top_p?: number
      frequency_penalty?: number
      presence_penalty?: number
    }
  ) {
    const stream = await this.getClient().chat.completions.create({
      model: this.model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2048,
      top_p: options?.top_p ?? 1,
      frequency_penalty: options?.frequency_penalty ?? 0,
      presence_penalty: options?.presence_penalty ?? 0,
    })

    return stream
  }

  /**
   * Send a chat message and get a non-streaming response
   * @param messages - Array of chat messages
   * @param options - Additional options
   */
  async sendChatCompletion(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: {
      temperature?: number
      max_tokens?: number
      top_p?: number
      frequency_penalty?: number
      presence_penalty?: number
    }
  ) {
    const response = await this.getClient().chat.completions.create({
      model: this.model,
      messages,
      stream: false,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2048,
      top_p: options?.top_p ?? 1,
      frequency_penalty: options?.frequency_penalty ?? 0,
      presence_penalty: options?.presence_penalty ?? 0,
    })

    return response.choices[0]?.message?.content || ''
  }

  /**
   * Change the model for this service instance
   * @param model - Model name (e.g., 'gpt-5.4', 'gpt-5.4-mini')
   */
  withModel(model: string) {
    this.model = model
    return this
  }
}

// Export singleton instance
export const aiService = new AIService()
