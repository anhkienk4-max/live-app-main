import { NextRequest } from 'next/server'
import { aiService } from '@/lib/ai/service'

export const runtime = 'edge'

/**
 * POST /api/ai/chat
 * 
 * Request body:
 * {
 *   messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>,
 *   model?: string,
 *   temperature?: number,
 *   max_tokens?: number,
 *   stream?: boolean (default: true)
 * }
 * 
 * Response: Server-Sent Events stream or JSON
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, model, temperature, max_tokens, stream = true } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create AI service instance with custom model if provided
    const service = model ? aiService.withModel(model) : aiService

    if (stream) {
      // Streaming response
      const completionStream = await service.streamChatCompletion(messages, {
        temperature,
        max_tokens,
      })

      // Create a TransformStream to convert OpenAI stream to SSE format
      const encoder = new TextEncoder()
      const customStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of completionStream) {
              const content = chunk.choices[0]?.delta?.content || ''
              if (content) {
                const data = `data: ${JSON.stringify({ content })}\n\n`
                controller.enqueue(encoder.encode(data))
              }
            }
            // Send done signal
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          } catch (error) {
            controller.error(error)
          }
        },
      })

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    } else {
      // Non-streaming response
      const content = await service.sendChatCompletion(messages, {
        temperature,
        max_tokens,
      })

      return new Response(
        JSON.stringify({ content }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json' } 
        }
      )
    }
  } catch (error: any) {
    console.error('AI Chat API Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    )
  }
}
