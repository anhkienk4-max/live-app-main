'use client'

import { useState, useCallback } from 'react'
import { ChatMessage, ChatCompletionRequest } from './types'

interface UseAIChatOptions {
  initialMessages?: ChatMessage[]
  systemMessage?: string
  model?: string
  temperature?: number
  maxTokens?: number
  onError?: (error: Error) => void
}

export interface UseAIChatReturn {
  messages: ChatMessage[]
  isLoading: boolean
  error: Error | null
  sendMessage: (content: string) => Promise<void>
  streamMessage: (content: string) => Promise<void>
  clearMessages: () => void
  setMessages: (messages: ChatMessage[]) => void
}

export type { UseAIChatOptions }

/**
 * Reusable hook for AI chat functionality
 * 
 * @example
 * ```tsx
 * const { messages, isLoading, sendMessage } = useAIChat({
 *   systemMessage: 'You are a helpful assistant for livestream operations.',
 *   model: 'gpt-5.4-mini'
 * })
 * 
 * // Non-streaming
 * await sendMessage('Help me write a shift report')
 * 
 * // Streaming
 * await streamMessage('Help me write a shift report')
 * ```
 */
export function useAIChat(options: UseAIChatOptions = {}): UseAIChatReturn {
  const {
    initialMessages = [],
    systemMessage,
    model,
    temperature,
    maxTokens,
    onError,
  } = options

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Send a message and get a non-streaming response
   */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return

      setIsLoading(true)
      setError(null)

      const userMessage: ChatMessage = { role: 'user', content }
      const newMessages = [...messages, userMessage]

      // Add system message if provided
      const messagesToSend = systemMessage
        ? [{ role: 'system' as const, content: systemMessage }, ...newMessages]
        : newMessages

      setMessages(newMessages)

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messagesToSend,
            model,
            temperature,
            max_tokens: maxTokens,
            stream: false,
          } as ChatCompletionRequest),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to get AI response')
        }

        const data = await response.json()
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.content,
        }

        setMessages([...newMessages, assistantMessage])
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(err.toString())
        setError(error)
        onError?.(error)
      } finally {
        setIsLoading(false)
      }
    },
    [messages, systemMessage, model, temperature, maxTokens, onError]
  )

  /**
   * Send a message and get a streaming response
   */
  const streamMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return

      setIsLoading(true)
      setError(null)

      const userMessage: ChatMessage = { role: 'user', content }
      const newMessages = [...messages, userMessage]

      // Add system message if provided
      const messagesToSend = systemMessage
        ? [{ role: 'system' as const, content: systemMessage }, ...newMessages]
        : newMessages

      setMessages(newMessages)

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messagesToSend,
            model,
            temperature,
            max_tokens: maxTokens,
            stream: true,
          } as ChatCompletionRequest),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to get AI response')
        }

        // Process SSE stream
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let assistantContent = ''

        if (!reader) {
          throw new Error('Response body is null')
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue

              try {
                const parsed = JSON.parse(data)
                assistantContent += parsed.content
                
                // Update messages with streaming content
                setMessages([
                  ...newMessages,
                  { role: 'assistant', content: assistantContent },
                ])
              } catch (e) {
                // Ignore parse errors for malformed chunks
              }
            }
          }
        }
      } catch (err: any) {
        const error = err instanceof Error ? err : new Error(err.toString())
        setError(error)
        onError?.(error)
      } finally {
        setIsLoading(false)
      }
    },
    [messages, systemMessage, model, temperature, maxTokens, onError]
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    streamMessage,
    clearMessages,
    setMessages,
  }
}
