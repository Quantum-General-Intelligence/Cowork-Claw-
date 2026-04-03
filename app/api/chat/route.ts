import { NextRequest, after } from 'next/server'
import { getServerSession } from '@/lib/session/get-server-session'
import { db } from '@/lib/db/client'
import { tasks, conversations, conversationMessages } from '@/lib/db/schema'
import { generateId } from '@/lib/utils/id'
import { eq } from 'drizzle-orm'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { getUserApiKeys } from '@/lib/api-keys/user-keys'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { getGitHubUser } from '@/lib/github/client'
import { getMaxSandboxDuration } from '@/lib/db/settings'

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
- **Orchestrate**: Auto-select the best agent(s) and coordinate multi-agent execution

When the user has clearly described a task AND confirmed they want to proceed, use the create_task tool.
If the task is ambiguous, ask clarifying questions first.
Always confirm the repository URL before creating a task.

Keep responses focused and actionable. You are the user's AI team lead.`

// Pre-fetch everything needed for task execution BEFORE the stream starts
// This avoids losing request context inside after()
async function prefetchTaskContext(userId: string) {
  const [apiKeys, githubToken, githubUser, maxDuration] = await Promise.all([
    getUserApiKeys(),
    getUserGitHubToken(),
    getGitHubUser(),
    getMaxSandboxDuration(userId),
  ])
  return { apiKeys, githubToken, githubUser, maxDuration }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Rate limiting
  const rateLimit = await checkRateLimit(session.user.id)
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: `Rate limit exceeded. ${rateLimit.remaining} of ${rateLimit.total} remaining. Resets at ${rateLimit.resetAt.toISOString()}`,
      },
      { status: 429 },
    )
  }

  const { messages, conversationId: existingConversationId } = await req.json()

  // Get or create conversation for persistence
  let conversationId = existingConversationId
  if (!conversationId) {
    const [conv] = await db
      .insert(conversations)
      .values({
        id: generateId(12),
        userId: session.user.id,
        title: messages[messages.length - 1]?.content?.slice(0, 100) || 'New conversation',
      })
      .returning()
    conversationId = conv.id
  } else {
    // Update conversation timestamp
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))
  }

  // Save user message
  const lastUserMessage = messages[messages.length - 1]
  if (lastUserMessage?.role === 'user') {
    await db.insert(conversationMessages).values({
      id: generateId(12),
      conversationId,
      role: 'user',
      content: lastUserMessage.content,
    })
  }

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

  // Pre-fetch task context while we still have request context
  const taskContext = await prefetchTaskContext(session.user.id)

  // Define the create_task tool
  const tools = [
    {
      name: 'create_task',
      description:
        'Create and execute a coding task that dispatches an AI agent to work on a repository. The task will start executing immediately in a sandbox.',
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
            description: 'Which agent to assign. Use "orchestrate" for complex tasks needing multiple agents.',
          },
        },
        required: ['prompt', 'repoUrl', 'selectedAgent'],
      },
    },
  ]

  // First API call — get Claude's response (may include tool_use)
  const firstResponse = await fetch(apiUrl, {
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

  if (!firstResponse.ok) {
    const error = await firstResponse.text()
    console.error('API error:', error)
    return Response.json({ error: 'Failed to generate response' }, { status: 500 })
  }

  // Process stream, handle tool calls, and produce final output
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const reader = firstResponse.body?.getReader()
      if (!reader) {
        controller.close()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let currentToolName = ''
      let currentToolInput = ''
      let toolUseId = ''
      let hasToolCall = false
      let fullAssistantResponse = '' // Accumulate for DB persistence

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
                  toolUseId = event.content_block.id || ''
                  currentToolInput = ''
                  hasToolCall = true
                }
              }

              if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta' && event.delta.text) {
                  fullAssistantResponse += event.delta.text
                  controller.enqueue(encoder.encode(`0:${JSON.stringify(event.delta.text)}\n`))
                }
                if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
                  currentToolInput += event.delta.partial_json
                }
              }

              if (event.type === 'content_block_stop' && currentToolName === 'create_task' && hasToolCall) {
                // Execute the tool — create and trigger a real task
                let toolResultContent = ''
                try {
                  const toolArgs = JSON.parse(currentToolInput)
                  const taskId = generateId()

                  // Insert task into DB with proper user settings
                  await db.insert(tasks).values({
                    id: taskId,
                    userId: session.user!.id,
                    prompt: toolArgs.prompt,
                    repoUrl: toolArgs.repoUrl,
                    selectedAgent: toolArgs.selectedAgent || 'orchestrate',
                    status: 'pending',
                    progress: 0,
                    installDependencies: false,
                    maxDuration: taskContext.maxDuration,
                    keepAlive: false,
                    enableBrowser: false,
                  })

                  // Trigger async task execution directly via shared executor
                  after(async () => {
                    try {
                      const { processTaskWithTimeout } = await import('@/lib/tasks/executor')
                      await processTaskWithTimeout(
                        taskId,
                        toolArgs.prompt,
                        toolArgs.repoUrl,
                        taskContext.maxDuration,
                        toolArgs.selectedAgent || 'orchestrate',
                        undefined,
                        false,
                        false,
                        false,
                        {
                          apiKeys: taskContext.apiKeys,
                          githubToken: taskContext.githubToken,
                          githubUser: taskContext.githubUser,
                        },
                      )
                    } catch (execError) {
                      console.error('Task execution failed:', execError)
                    }
                  })

                  toolResultContent = `Task created successfully. Task ID: ${taskId}. Agent: ${toolArgs.selectedAgent}. The agent is now working on the task.`

                  // Stream task creation confirmation to user
                  controller.enqueue(
                    encoder.encode(
                      `0:${JSON.stringify(`\n\n---\n\n**Task dispatched** to **${toolArgs.selectedAgent}**\n\n[View task progress](/tasks/${taskId})\n\n`)}\n`,
                    ),
                  )
                } catch (toolError) {
                  console.error('Task creation failed:', toolError)
                  toolResultContent = `Failed to create task: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`
                  controller.enqueue(
                    encoder.encode(
                      `0:${JSON.stringify('\n\n---\n\n**Failed to create task.** Please try again or use [Manual Mode](/new).\n\n')}\n`,
                    ),
                  )
                }

                // Send tool_result back to Claude for continued conversation
                const continuationMessages = [
                  ...messages.map((m: { role: string; content: string }) => ({
                    role: m.role,
                    content: m.content,
                  })),
                  {
                    role: 'assistant',
                    content: [
                      {
                        type: 'tool_use',
                        id: toolUseId,
                        name: 'create_task',
                        input: JSON.parse(currentToolInput || '{}'),
                      },
                    ],
                  },
                  {
                    role: 'user',
                    content: [{ type: 'tool_result', tool_use_id: toolUseId, content: toolResultContent }],
                  },
                ]

                // Second API call — get Claude's response after tool execution
                const continuationResponse = await fetch(apiUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-5-20241022',
                    max_tokens: 2048,
                    system: ORCHESTRATOR_SYSTEM_PROMPT,
                    tools,
                    messages: continuationMessages,
                    stream: true,
                  }),
                })

                if (continuationResponse.ok) {
                  const contReader = continuationResponse.body?.getReader()
                  if (contReader) {
                    let contBuffer = ''
                    while (true) {
                      const { done: contDone, value: contValue } = await contReader.read()
                      if (contDone) break

                      contBuffer += decoder.decode(contValue, { stream: true })
                      const contLines = contBuffer.split('\n')
                      contBuffer = contLines.pop() || ''

                      for (const contLine of contLines) {
                        if (!contLine.startsWith('data: ')) continue
                        const contData = contLine.slice(6).trim()
                        if (contData === '[DONE]') continue

                        try {
                          const contEvent = JSON.parse(contData)
                          if (contEvent.type === 'content_block_delta' && contEvent.delta?.type === 'text_delta') {
                            controller.enqueue(encoder.encode(`0:${JSON.stringify(contEvent.delta.text)}\n`))
                          }
                        } catch {
                          // Skip
                        }
                      }
                    }
                  }
                }

                currentToolName = ''
                currentToolInput = ''
                toolUseId = ''
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (error) {
        console.error('Stream error:', error)
      } finally {
        // Persist assistant response to conversation
        if (fullAssistantResponse && conversationId) {
          try {
            await db.insert(conversationMessages).values({
              id: generateId(12),
              conversationId,
              role: 'assistant',
              content: fullAssistantResponse,
            })
          } catch {
            // Don't fail the stream if DB persistence fails
          }
        }
        // Send conversationId as final metadata so client can track it
        controller.enqueue(encoder.encode(`e:${JSON.stringify({ conversationId })}\n`))
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
