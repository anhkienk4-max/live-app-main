# AI Integration Documentation

## ⚠️ Current Status: Infrastructure Ready (Requires Own OpenAI Key)

The AI integration infrastructure is complete, but currently configured for use with **your own OpenAI API key**.

### Why Not Using Emergent Universal Key?

The Emergent Universal Key (configured outside the repository) works with the `emergentintegrations` Python library, which is not compatible with Next.js/Node.js applications.

**To use the Emergent Universal Key, you would need:**
- A Python backend (FastAPI recommended)
- The `emergentintegrations` library
- This will be available after Phase 2 (Supabase integration) if you choose to add a Python API layer

### Current Setup: Using Personal OpenAI Key

**Option 1: Use Your Own OpenAI Key (Immediate)**

## Configuration

### Environment Variables

Located in `/app/.env.local`:

```env
# AI Integration
# Option 1: Use your own OpenAI key
OPENAI_API_KEY=sk-your-openai-key-here

# Option 2: Emergent Universal Key (requires Python backend)
# EMERGENT_LLM_KEY=sk-your-emergent-key-here

DEFAULT_AI_MODEL=gpt-5.4-mini
```

**To use your own OpenAI key:**
1. Get your API key from https://platform.openai.com/api-keys
2. Replace `sk-your-openai-key-here` with your actual key
3. Restart the development server

**Note**: Replace the placeholder `OPENAI_API_KEY` value with your actual key to enable AI features.

### Default Model

**gpt-5.4-mini** - Optimized for speed and cost-efficiency during development.

## Available Files

### 1. AI Service Layer
**Location**: `/app/lib/services/aiService.ts`

Core service for interacting with OpenAI API:

```typescript
import { aiService } from '@/lib/services/aiService'

// Streaming chat completion
const stream = await aiService.streamChatCompletion([
  { role: 'system', content: 'You are a helpful assistant' },
  { role: 'user', content: 'Hello!' }
])

// Non-streaming chat completion
const response = await aiService.sendChatCompletion([
  { role: 'user', content: 'Hello!' }
])

// Use different model
const customService = aiService.withModel('gpt-5.4')
```

### 2. API Route
**Location**: `/app/app/api/ai/chat/route.ts`

RESTful API endpoint for chat completions:

```typescript
POST /api/ai/chat

Request Body:
{
  messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }>,
  model?: string,           // Optional: Override default model
  temperature?: number,     // Optional: 0-2, default 0.7
  max_tokens?: number,      // Optional: default 2048
  stream?: boolean          // Optional: default true
}

Response (Streaming):
Server-Sent Events (SSE) stream with chunks:
data: {"content": "Hello"}
data: {"content": " there"}
data: [DONE]

Response (Non-Streaming):
{
  content: "Full response text"
}
```

### 3. React Hook
**Location**: `/app/lib/hooks/useAIChat.ts`

Reusable React hook for chat functionality:

```typescript
import { useAIChat } from '@/lib/hooks/useAIChat'

function MyComponent() {
  const { 
    messages, 
    isLoading, 
    error,
    sendMessage,      // Non-streaming
    streamMessage,    // Streaming
    clearMessages 
  } = useAIChat({
    systemMessage: 'You are a helpful assistant',
    model: 'gpt-5.4-mini',
    temperature: 0.7,
    maxTokens: 2048
  })

  const handleSend = async (userInput: string) => {
    // For streaming responses
    await streamMessage(userInput)
    
    // OR for non-streaming
    await sendMessage(userInput)
  }

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={i}>{msg.role}: {msg.content}</div>
      ))}
      {isLoading && <div>Loading...</div>}
      {error && <div>Error: {error.message}</div>}
    </div>
  )
}
```

### 4. TypeScript Types
**Location**: `/app/lib/types/ai.types.ts`

Type definitions for AI integration:

```typescript
import { ChatMessage, OPENAI_MODELS, OpenAIModel } from '@/lib/types/ai.types'

// Use available models
const model: OpenAIModel = OPENAI_MODELS.GPT_5_4_MINI

// Message structure
const message: ChatMessage = {
  role: 'user',
  content: 'Hello!'
}
```

## Available Models

Via Emergent Universal Key:

### GPT-5 Series (Recommended)
- `gpt-5.5` - Most capable
- `gpt-5.4` - Highly capable (recommended for production)
- `gpt-5.4-mini` - **DEFAULT** - Fast and cost-effective
- `gpt-5.2` - Previous generation
- `gpt-5`, `gpt-5-mini`, `gpt-5-nano` - Variants

### GPT-4 Series
- `gpt-4`, `gpt-4o`
- `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`

### O-Series (Reasoning Models)
- `o3`, `o3-pro`, `o4-mini`, `o1`

## Future AI Features (Post-Supabase Integration)

The following AI features are planned for future implementation:

1. **AI Assistant Chat Widget**
   - Global chat widget accessible from all pages
   - Context-aware help based on current page
   - Keyboard shortcut (e.g., Cmd+Shift+A)

2. **Smart Report Writing**
   - AI-assisted report generation
   - Auto-fill insights based on metrics
   - Suggest improvements

3. **Shift Note Generator**
   - Generate professional shift notes
   - Summarize key events
   - Extract action items

4. **Analytics Insights**
   - Natural language queries for data
   - Automated trend analysis
   - Performance recommendations

5. **Smart Search Enhancement**
   - Semantic search across all entities
   - Natural language queries
   - Intelligent suggestions

## Usage Examples

### Example 1: Simple Chat

```typescript
const { streamMessage, messages } = useAIChat()

await streamMessage('Help me write a professional shift report')
console.log(messages) // [{ role: 'user', ... }, { role: 'assistant', ... }]
```

### Example 2: Custom System Prompt

```typescript
const { streamMessage } = useAIChat({
  systemMessage: `You are an AI assistant for a livestream operations team.
  Help with writing reports, analyzing metrics, and providing insights.
  Always be concise and professional.`
})
```

### Example 3: Direct API Call

```typescript
const response = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Summarize this data: ...' }
    ],
    model: 'gpt-5.4-mini',
    temperature: 0.7,
    stream: false
  })
})

const data = await response.json()
console.log(data.content)
```

### Example 4: Using AI Service Directly (Server-Side)

```typescript
// In API route or server component
import { aiService } from '@/lib/services/aiService'

export async function POST(req: Request) {
  const content = await aiService.sendChatCompletion([
    { role: 'user', content: 'Generate a shift summary' }
  ])
  
  return Response.json({ summary: content })
}
```

## Testing the Integration

### Test via cURL:

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Say hello!"}
    ],
    "stream": false
  }'
```

### Test Streaming:

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Count to 5 slowly"}
    ],
    "stream": true
  }'
```

## Credits & Billing

- Credits are deducted from your Emergent balance
- View balance: Profile → Universal Key → Balance
- Top up: Profile → Universal Key → Add Balance
- Enable auto top-up to avoid interruptions

## Security Notes

- API keys are stored in `.env.local` (not committed to git)
- AI endpoints are server-side only (Next.js API routes)
- Client-side code never exposes the API key
- Always validate and sanitize user inputs before sending to AI

## Troubleshooting

### "API key not found" error
- Check `.env.local` has `OPENAI_API_KEY` or `EMERGENT_LLM_KEY`
- Restart development server after adding env vars

### "Model not found" error
- Verify model name matches available models list
- Check for typos in model name

### Streaming not working
- Ensure `stream: true` in request
- Check response headers include `text/event-stream`
- Verify `X-Accel-Buffering: no` header is set

### Credits depleted
- Check balance in Profile → Universal Key
- Top up balance or enable auto top-up
- Consider switching to personal OpenAI key if preferred

## Next Steps

1. ✅ **Infrastructure Complete** - AI service layer, API routes, and hooks are ready
2. ⏳ **Complete Phase 1** - Finish livestream operations system
3. ⏳ **Supabase Integration** - Migrate from mock data to real database
4. ⏳ **Implement AI Features** - Add chat widgets, smart tools, and AI-powered enhancements

## Support

For issues with the Emergent Universal Key or AI integration, refer to the main application documentation or contact support.
