import { NextRequest } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks, insertTaskSchema } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { eq } from 'drizzle-orm'

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
- **Pi**: Extensible coding agent framework with 15+ LLM providers and stateful sessions
- **OpenClaw**: Full AI agent runtime with skills (web search, vision, worker-sandboxes)

When the user wants to execute a task, you have a tool called "create_task" to dispatch it. Use it when:
- The user has clearly described what they want done
- You know which repository to work on
- You've confirmed the approach with the user

When responding about agent assignments, format them clearly:
- **Agent**: task description

Keep responses focused and actionable. You are the user's AI team lead.`

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
      { error: 'No API key configured. Set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY.' },
      { status: 503 },
    )
  }

  const useGateway = !!aiGatewayKey
  const apiUrl = useGateway ? 'https://ai-gateway.vercel.sh/v1/messages' : 'https://api.anthropic.com/v1/messages'
  const apiKey = useGateway ? aiGatewayKey! : anthropicKey!

  // Define the create_task tool for Anthropic API
  const tools = [
    {
      name: 'create_task',
      description:
        'Create a coding task that dispatches an AI agent to work on a repository. Use this when the user has confirmed what they want done.',
      input_schema: {
        type: 'object' as const,
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed description of the coding task for the agent',
          },
          repoUrl: {
            type: 'string',
            description: 'GitHub repository URL (e.g., https://github.com/owner/repo)',
          },
          selectedAgent: {
            type: 'string',
            enum: ['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode', 'openclaw', 'orchestrate', 'pi'],
            description: 'Which agent to assign the task to',
          },
        },
        required: ['prompt', 'repoUrl', 'selectedAgent'],
      },
    },
  ]

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
      tools,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('API error:', error)
    return new Response('Failed to generate response', { status: 500 })
  }

  // Transform Anthropic SSE stream to our format, handling tool calls
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
      let currentToolName = ''
      let currentToolInput = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const event = JSON.parse(data)

              if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'tool_use') {
                  currentToolName = event.content_block.name || ''
                  currentToolInput = ''
                  // Send tool start indicator
                  controller.enqueue(
                    encoder.encode(`0:${JSON.stringify(`\n\n🔧 Dispatching task with ${currentToolName}...\n\n`)}\n`),
                  )
                }
              }

              if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta' && event.delta.text) {
                  controller.enqueue(encoder.encode(`0:${JSON.stringify(event.delta.text)}\n`))
                }
                if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
                  currentToolInput += event.delta.partial_json
                }
              }

              if (event.type === 'content_block_stop' && currentToolName === 'create_task') {
                // Execute the tool call — create a real task
                try {
                  const toolArgs = JSON.parse(currentToolInput)
                  const taskId = generateId()

                  await db.insert(tasks).values({
                    id: taskId,
                    userId: session.user!.id,
                    prompt: toolArgs.prompt,
                    repoUrl: toolArgs.repoUrl,
                    selectedAgent: toolArgs.selectedAgent || 'orchestrate',
                    status: 'pending',
                    progress: 0,
                    installDependencies: false,
                    maxDuration: 300,
                    keepAlive: false,
                    enableBrowser: false,
                  })

                  controller.enqueue(
                    encoder.encode(
                      `0:${JSON.stringify(`\n\n✅ Task created! Agent **${toolArgs.selectedAgent}** is working on it.\n\n[View Task](/tasks/${taskId})\n\n`)}\n`,
                    ),
                  )
                } catch (toolError) {
                  controller.enqueue(
                    encoder.encode(`0:${JSON.stringify('\n\n❌ Failed to create task. Please try again.\n\n')}\n`),
                  )
                }

                currentToolName = ''
                currentToolInput = ''
              }
            } catch {
              // Skip malformed events
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
