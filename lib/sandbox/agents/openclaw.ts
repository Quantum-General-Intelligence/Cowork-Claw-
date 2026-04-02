import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox, runInProject } from '../commands'
import { AgentExecutionResult } from '../types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors, taskMessages } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/utils/id'
import { nanoid } from 'nanoid'

type Connector = typeof connectors.$inferSelect

const OPENCLAW_DIR = '/home/vercel-sandbox/.openclaw'
const OPENCLAW_PORT = 3000
const GATEWAY_READY_MAX_RETRIES = 60
const GATEWAY_READY_DELAY_MS = 1000

function buildOpenClawConfig(apiKey: string, gatewayToken: string): string {
  return JSON.stringify(
    {
      gateway: {
        mode: 'local',
        auth: { type: 'token' },
        port: OPENCLAW_PORT,
        bind: 'loopback',
        trustedProxies: ['127.0.0.0/8'],
      },
      agent: {
        defaults: {
          primaryModel: 'vercel-ai-gateway/anthropic/claude-sonnet-4-6',
        },
      },
      apiGateway: {
        baseUrl: 'https://ai-gateway.vercel.sh/v1',
        apiKey,
      },
    },
    null,
    2,
  )
}

async function installOpenClaw(sandbox: Sandbox, logger: TaskLogger): Promise<boolean> {
  // Check if already installed
  const existingCheck = await runCommandInSandbox(sandbox, 'which', ['openclaw'])
  if (existingCheck.success && existingCheck.output?.includes('openclaw')) {
    await logger.info('OpenClaw already installed, skipping installation')
    return true
  }

  await logger.info('Installing OpenClaw...')
  const install = await runCommandInSandbox(sandbox, 'npm', [
    'install',
    '-g',
    'openclaw@latest',
    '--ignore-scripts',
    '--loglevel',
    'info',
  ])

  if (!install.success) {
    await logger.error('Failed to install OpenClaw')
    return false
  }

  await logger.info('OpenClaw installed successfully')
  return true
}

async function configureOpenClaw(sandbox: Sandbox, logger: TaskLogger, gatewayToken: string): Promise<boolean> {
  const apiKey = process.env.AI_GATEWAY_API_KEY || ''

  // Create config directory
  await runCommandInSandbox(sandbox, 'mkdir', ['-p', OPENCLAW_DIR])

  // Write config file
  const config = buildOpenClawConfig(apiKey, gatewayToken)
  const writeConfig = await runCommandInSandbox(sandbox, 'sh', [
    '-c',
    `cat > ${OPENCLAW_DIR}/openclaw.json << 'OCEOF'\n${config}\nOCEOF`,
  ])
  if (!writeConfig.success) {
    await logger.error('Failed to write OpenClaw config')
    return false
  }

  // Write gateway token
  const writeToken = await runCommandInSandbox(sandbox, 'sh', [
    '-c',
    `echo -n "${gatewayToken}" > ${OPENCLAW_DIR}/.gateway-token`,
  ])
  if (!writeToken.success) {
    await logger.error('Failed to write gateway token')
    return false
  }

  // Write AI Gateway API key
  if (apiKey) {
    await runCommandInSandbox(sandbox, 'sh', ['-c', `echo -n "${apiKey}" > ${OPENCLAW_DIR}/.ai-gateway-api-key`])
  }

  await logger.info('OpenClaw configured')
  return true
}

async function startGateway(sandbox: Sandbox, logger: TaskLogger, gatewayToken: string): Promise<boolean> {
  await logger.info('Starting OpenClaw gateway...')

  // Start gateway in background
  const startCmd = [
    `export OPENCLAW_GATEWAY_TOKEN="${gatewayToken}"`,
    `export OPENCLAW_CONFIG_PATH="${OPENCLAW_DIR}/openclaw.json"`,
    process.env.AI_GATEWAY_API_KEY ? `export AI_GATEWAY_API_KEY="${process.env.AI_GATEWAY_API_KEY}"` : '',
    process.env.AI_GATEWAY_API_KEY ? `export OPENAI_API_KEY="${process.env.AI_GATEWAY_API_KEY}"` : '',
    'export OPENAI_BASE_URL="https://ai-gateway.vercel.sh/v1"',
    `setsid openclaw gateway --port ${OPENCLAW_PORT} --bind loopback >> /tmp/openclaw.log 2>&1 &`,
  ]
    .filter(Boolean)
    .join(' && ')

  await runCommandInSandbox(sandbox, 'sh', ['-c', startCmd])

  // Wait for gateway readiness
  await logger.info('Waiting for OpenClaw gateway to be ready...')
  for (let i = 0; i < GATEWAY_READY_MAX_RETRIES; i++) {
    const probe = await runCommandInSandbox(sandbox, 'sh', [
      '-c',
      `curl -s -f --max-time 5 http://localhost:${OPENCLAW_PORT}/ 2>/dev/null || echo "NOT_READY"`,
    ])

    if (probe.success && probe.output && !probe.output.includes('NOT_READY')) {
      await logger.info('OpenClaw gateway is ready')
      return true
    }

    // Wait before retry
    await new Promise((resolve) => setTimeout(resolve, GATEWAY_READY_DELAY_MS))
  }

  await logger.error('OpenClaw gateway failed to start within timeout')
  return false
}

async function sendMessage(
  sandbox: Sandbox,
  prompt: string,
  gatewayToken: string,
  sessionKey?: string,
): Promise<{ success: boolean; content: string; error?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${gatewayToken}`,
  }
  if (sessionKey) {
    headers['x-openclaw-session-key'] = sessionKey
  }

  const headerArgs = Object.entries(headers)
    .map(([k, v]) => `-H '${k}: ${v}'`)
    .join(' ')

  // Escape prompt for shell
  const escapedPrompt = prompt.replace(/'/g, "'\\''").replace(/\n/g, '\\n')

  const body = JSON.stringify({
    model: 'default',
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    stream: false,
  })

  const curlCmd = `curl -s -f --max-time 300 ${headerArgs} -d '${body.replace(/'/g, "'\\''")}' http://localhost:${OPENCLAW_PORT}/v1/chat/completions`

  const result = await runCommandInSandbox(sandbox, 'sh', ['-c', curlCmd])

  if (!result.success) {
    return { success: false, content: '', error: result.error || 'Failed to send message to OpenClaw' }
  }

  try {
    const response = JSON.parse(result.output || '{}')
    const choice = response.choices?.[0]?.message?.content

    if (typeof choice === 'string') {
      return { success: true, content: choice }
    }

    if (Array.isArray(choice)) {
      const textParts = choice.filter((p: { type: string }) => p.type === 'text').map((p: { text: string }) => p.text)
      return { success: true, content: textParts.join('\n') }
    }

    return { success: false, content: '', error: 'Unexpected response format' }
  } catch {
    return { success: false, content: '', error: 'Failed to parse OpenClaw response' }
  }
}

export async function executeOpenClawInSandbox(
  sandbox: Sandbox,
  instruction: string,
  logger: TaskLogger,
  selectedModel?: string,
  mcpServers?: Connector[],
  isResumed?: boolean,
  sessionId?: string,
  taskId?: string,
  agentMessageId?: string,
): Promise<AgentExecutionResult> {
  const gatewayToken = nanoid(32)

  // Step 1: Install
  const installed = await installOpenClaw(sandbox, logger)
  if (!installed) {
    return { success: false, error: 'Failed to install OpenClaw', cliName: 'openclaw', changesDetected: false }
  }

  // Step 2: Configure
  const configured = await configureOpenClaw(sandbox, logger, gatewayToken)
  if (!configured) {
    return { success: false, error: 'Failed to configure OpenClaw', cliName: 'openclaw', changesDetected: false }
  }

  // Step 3: Start gateway
  const started = await startGateway(sandbox, logger, gatewayToken)
  if (!started) {
    return { success: false, error: 'OpenClaw gateway failed to start', cliName: 'openclaw', changesDetected: false }
  }

  // Step 4: Create agent message for streaming updates
  if (taskId && agentMessageId) {
    try {
      await db.insert(taskMessages).values({
        id: agentMessageId,
        taskId,
        role: 'agent',
        content: '',
      })
    } catch {
      // Message may already exist
    }
  }

  await logger.info('Sending task to OpenClaw...')

  // Step 5: Send the task
  const result = await sendMessage(sandbox, instruction, gatewayToken, sessionId)

  if (!result.success) {
    await logger.error('OpenClaw execution failed')
    return {
      success: false,
      error: result.error || 'OpenClaw failed to process the task',
      cliName: 'openclaw',
      changesDetected: false,
    }
  }

  // Update the agent message with the response
  if (taskId && agentMessageId && result.content) {
    try {
      await db.update(taskMessages).set({ content: result.content }).where(eq(taskMessages.id, agentMessageId))
    } catch {
      // Ignore update errors
    }
  }

  await logger.success('OpenClaw execution completed')

  // Check for git changes
  const gitStatus = await runInProject(sandbox, 'git', ['status', '--porcelain'])
  const changesDetected = gitStatus.success && (gitStatus.output?.trim().length ?? 0) > 0

  return {
    success: true,
    agentResponse: result.content,
    cliName: 'openclaw',
    changesDetected,
    sessionId: gatewayToken, // Reuse token as session ID for follow-ups
  }
}
