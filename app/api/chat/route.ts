import { NextRequest } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'

const ORCHESTRATOR_SYSTEM_PROMPT = `You are OpenClaw, the AI orchestrator for the Cowork-Claw platform. You coordinate a team of AI coding agents to accomplish tasks for the user.

Your role:
- Understand what the user wants to accomplish
- Break complex tasks into sub-tasks
- Recommend which agent(s) should handle each sub-task
- Explain your plan before executing
- Ask clarifying questions when the task is ambiguous

Available agents and their strengths:
- **Claude**: Best for complex reasoning, architecture decisions, multi-file refactors, and MCP tool use
- **Codex**: Strong at code generation with OpenAI models, good for greenfield code
- **Copilot**: GitHub-native, good for tasks tightly integrated with GitHub workflows
- **Cursor**: Excellent at targeted code editing with file detection and advanced configuration
- **Gemini**: Good for research, analysis, and tasks requiring broad knowledge
- **OpenCode**: Versatile open-source code generation supporting multiple model backends

When the user describes a task:
1. Analyze the task complexity and requirements
2. If simple: recommend a single agent and explain why
3. If complex: break it into sub-tasks and assign each to the best agent
4. Always explain your reasoning
5. Ask which repository to work on if not already specified

Be conversational, concise, and helpful. You are the user's AI team lead — they tell you what they want, and you coordinate the team to deliver it.

When responding about agent assignments, format them clearly:
- **Agent**: task description

Keep responses focused and actionable. Don't over-explain — the user can ask follow-up questions.`

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { messages } = await req.json()

  // Determine API endpoint and key
  const aiGatewayKey = process.env.AI_GATEWAY_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!aiGatewayKey && !anthropicKey) {
    return Response.json(
      {
        error: 'No API key configured. Set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY in your environment.',
      },
      { status: 503 },
    )
  }

  const useGateway = !!aiGatewayKey
  const apiUrl = useGateway ? 'https://ai-gateway.vercel.sh/v1/messages' : 'https://api.anthropic.com/v1/messages'
  const apiKey = useGateway ? aiGatewayKey! : anthropicKey!

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20241022',
      max_tokens: 4096,
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Anthropic API error:', error)
    return new Response('Failed to generate response', { status: 500 })
  }

  // Transform Anthropic SSE stream to AI SDK data stream format
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader()
      if (!reader) {
        controller.close()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue

              try {
                const event = JSON.parse(data)
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                  // AI SDK data stream format: "0:" prefix with JSON-encoded string
                  controller.enqueue(encoder.encode(`0:${JSON.stringify(event.delta.text)}\n`))
                }
              } catch {
                // Skip malformed events
              }
            }
          }
        }
      } catch (error) {
        console.error('Stream error:', error)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}
