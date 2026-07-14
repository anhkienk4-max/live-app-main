import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.EMERGENT_LLM_KEY || "demo",
});

const DEFAULT_MODEL = process.env.DEFAULT_AI_MODEL || "gpt-4o-mini";

/**
 * POST /api/ai/chat
 * Streams or returns AI chat completions.
 */
router.post("/ai/chat", async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens, stream = true } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "Messages array is required" });
      return;
    }

    const selectedModel = model || DEFAULT_MODEL;

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const completionStream = await openai.chat.completions.create({
        model: selectedModel,
        messages,
        stream: true,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 2048,
      });

      for await (const chunk of completionStream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const completion = await openai.chat.completions.create({
        model: selectedModel,
        messages,
        stream: false,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 2048,
      });

      const content = completion.choices[0]?.message?.content || "";
      res.json({ content });
    }
  } catch (error: any) {
    req.log?.error({ err: error }, "AI Chat error");
    res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
});

export default router;
