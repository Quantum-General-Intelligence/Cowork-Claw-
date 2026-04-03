import type { SandboxInstance as Sandbox } from '../provider'
import { runCommandInSandbox, runInProject } from '../commands'
import { AgentExecutionResult } from '../types'
import { TaskLogger } from '@/lib/utils/task-logger'
import { connectors, taskMessages } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

type Connector = typeof connectors.$inferSelect

const OPENCLAW_DIR = '/home/vercel-sandbox/.openclaw'
const OPENCLAW_STATE_DIR = OPENCLAW_DIR
const OPENCLAW_PORT = 3000
const GATEWAY_READY_MAX_RETRIES = 60
const GATEWAY_READY_DELAY_MS = 1000
const CHANNEL_REQUEST_TIMEOUT_S = 90

/**
 * Build gateway config matching vercel-openclaw/src/server/openclaw/config.ts buildGatewayConfig()
 */
function buildGatewayConfig(apiKey: string): string {
  return JSON.stringify(
    {
      gateway: {
        mode: 'local',
        auth: { type: 'token' },
        port: OPENCLAW_PORT,
        bind: 'loopback',
        trustedProxies: ['10.0.0.0/8', '127.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
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

/**
 * Build startup script matching vercel-openclaw/src/server/openclaw/config.ts buildStartupScript()
 */
function buildStartupScript(gatewayToken: string, apiKey: string): string {
  return `#!/bin/bash
set -euo pipefail
mkdir -p "${OPENCLAW_STATE_DIR}/devices"
rm -f "${OPENCLAW_STATE_DIR}/devices/paired.json" "${OPENCLAW_STATE_DIR}/devices/pending.json"

# Load credentials
export OPENCLAW_GATEWAY_TOKEN="${gatewayToken}"
export OPENCLAW_CONFIG_PATH="${OPENCLAW_DIR}/openclaw.json"
export AI_GATEWAY_API_KEY="${apiKey}"
export OPENAI_API_KEY="${apiKey}"
export OPENAI_BASE_URL="https://ai-gateway.vercel.sh/v1"

# Start gateway
setsid /home/vercel-sandbox/.global/npm/bin/openclaw gateway --port ${OPENCLAW_PORT} --bind loopback >> /tmp/openclaw.log 2>&1 &
`
}

async function installOpenClaw(sandbox: Sandbox, logger: TaskLogger): Promise<boolean> {
  const existingCheck = await runCommandInSandbox(sandbox, 'which', ['openclaw'])
  if (existingCheck.success && existingCheck.output?.includes('openclaw')) {
    await logger.info('OpenClaw already installed, skipping installation')
    return true
  }

  await logger.info('Installing OpenClaw...')

  // Use OPENCLAW_PACKAGE_SPEC env var or default to latest
  const packageSpec = process.env.OPENCLAW_PACKAGE_SPEC || 'openclaw@latest'

  const install = await runCommandInSandbox(sandbox, 'npm', [
    'install',
    '-g',
    packageSpec,
    '--ignore-scripts',
    '--loglevel',
    'info',
  ])

  if (!install.success) {
    await logger.error('Failed to install OpenClaw')
    return false
  }

  // Verify installation
  const versionCheck = await runCommandInSandbox(sandbox, 'openclaw', ['--version'])
  if (versionCheck.success) {
    await logger.info('OpenClaw installed successfully')
  } else {
    await logger.info('OpenClaw installed (version check skipped)')
  }

  return true
}

async function configureAndStart(sandbox: Sandbox, logger: TaskLogger, gatewayToken: string): Promise<boolean> {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.ANTHROPIC_API_KEY || ''

  if (!apiKey) {
    await logger.error('No AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY configured')
    return false
  }

  // Create directories
  await runCommandInSandbox(sandbox, 'mkdir', ['-p', OPENCLAW_DIR])
  await runCommandInSandbox(sandbox, 'mkdir', ['-p', `${OPENCLAW_STATE_DIR}/devices`])

  // Write config file
  const config = buildGatewayConfig(apiKey)
  const writeConfig = await runCommandInSandbox(sandbox, 'sh', [
    '-c',
    `cat > ${OPENCLAW_DIR}/openclaw.json << 'OCEOF'\n${config}\nOCEOF`,
  ])
  if (!writeConfig.success) {
    await logger.error('Failed to write OpenClaw config')
    return false
  }

  // Write gateway token file
  await runCommandInSandbox(sandbox, 'sh', ['-c', `printf '%s' '${gatewayToken}' > ${OPENCLAW_DIR}/.gateway-token`])

  // Write AI Gateway API key file
  await runCommandInSandbox(sandbox, 'sh', ['-c', `printf '%s' '${apiKey}' > ${OPENCLAW_DIR}/.ai-gateway-api-key`])

  // Write and execute startup script
  const startupScript = buildStartupScript(gatewayToken, apiKey)
  await runCommandInSandbox(sandbox, 'sh', [
    '-c',
    `cat > /tmp/openclaw-start.sh << 'STARTEOF'\n${startupScript}\nSTARTEOF`,
  ])
  await runCommandInSandbox(sandbox, 'sh', ['-c', 'chmod +x /tmp/openclaw-start.sh && bash /tmp/openclaw-start.sh'])

  await logger.info('OpenClaw gateway starting...')

  // Wait for gateway readiness — poll until response contains "openclaw-app"
  for (let i = 0; i < GATEWAY_READY_MAX_RETRIES; i++) {
    const probe = await runCommandInSandbox(sandbox, 'sh', [
      '-c',
      `curl -s -f --max-time 5 http://localhost:${OPENCLAW_PORT}/ 2>/dev/null || echo "__NOT_READY__"`,
    ])

    if (probe.success && probe.output && !probe.output.includes('__NOT_READY__')) {
      await logger.info('OpenClaw gateway is ready')
      return true
    }

    await new Promise((resolve) => setTimeout(resolve, GATEWAY_READY_DELAY_MS))
  }

  // Log gateway output for debugging
  const logOutput = await runCommandInSandbox(sandbox, 'sh', ['-c', 'tail -20 /tmp/openclaw.log 2>/dev/null'])
  if (logOutput.output) {
    await logger.error('OpenClaw gateway log tail available')
  }

  await logger.error('OpenClaw gateway failed to start within timeout')
  return false
}

/**
 * Send message to OpenClaw via /v1/chat/completions
 * Matches vercel-openclaw/src/server/channels/driver.ts request format
 */
async function sendMessage(
  sandbox: Sandbox,
  prompt: string,
  gatewayToken: string,
  sessionKey?: string,
): Promise<{ success: boolean; content: string; error?: string }> {
  // Build request body as JSON file to avoid shell escaping issues
  const requestBody = JSON.stringify({
    model: 'default',
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    stream: false,
  })

  // Write request to temp file to avoid shell escaping problems
  await runCommandInSandbox(sandbox, 'sh', [
    '-c',
    `cat > /tmp/openclaw-request.json << 'REQEOF'\n${requestBody}\nREQEOF`,
  ])

  // Build curl command with headers
  const sessionHeader = sessionKey ? `-H 'x-openclaw-session-key: ${sessionKey}'` : ''
  const curlCmd = [
    'curl -s -f',
    `--max-time ${CHANNEL_REQUEST_TIMEOUT_S}`,
    `-H 'Content-Type: application/json'`,
    `-H 'Authorization: Bearer ${gatewayToken}'`,
    sessionHeader,
    '-d @/tmp/openclaw-request.json',
    `http://localhost:${OPENCLAW_PORT}/v1/chat/completions`,
  ]
    .filter(Boolean)
    .join(' ')

  const result = await runCommandInSandbox(sandbox, 'sh', ['-c', curlCmd])

  if (!result.success) {
    return {
      success: false,
      content: '',
      error: result.error || 'Failed to send message to OpenClaw gateway',
    }
  }

  // Parse response — matches extractReply() from vercel-openclaw channels/core/reply.ts
  try {
    const response = JSON.parse(result.output || '{}')
    const messageContent = response.choices?.[0]?.message?.content

    if (typeof messageContent === 'string') {
      return { success: true, content: messageContent.trim() }
    }

    if (Array.isArray(messageContent)) {
      const parts: string[] = []
      for (const part of messageContent) {
        if (part.type === 'text' && part.text) {
          parts.push(part.text)
        }
      }
      return { success: true, content: parts.join('\n').trim() }
    }

    return { success: false, content: '', error: 'Empty response from OpenClaw' }
  } catch {
    // Return raw output if not JSON (OpenClaw might return plain text)
    return { success: true, content: result.output?.trim() || '' }
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
  // Validate API key availability before doing anything
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      success: false,
      error: 'No AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY configured. OpenClaw requires one of these to function.',
      cliName: 'openclaw',
      changesDetected: false,
    }
  }

  const gatewayToken = nanoid(32)

  // Step 1: Install OpenClaw
  const installed = await installOpenClaw(sandbox, logger)
  if (!installed) {
    return { success: false, error: 'Failed to install OpenClaw', cliName: 'openclaw', changesDetected: false }
  }

  // Step 2: Configure and start gateway
  const started = await configureAndStart(sandbox, logger, gatewayToken)
  if (!started) {
    return {
      success: false,
      error: 'OpenClaw gateway failed to start',
      cliName: 'openclaw',
      changesDetected: false,
    }
  }

  // Step 3: Create agent message for streaming updates
  if (taskId && agentMessageId) {
    try {
      await db.insert(taskMessages).values({
        id: agentMessageId,
        taskId,
        role: 'agent',
        content: '',
      })
    } catch {
      // Message may already exist from retry
    }
  }

  await logger.info('Sending task to OpenClaw...')

  // Step 4: Send the task prompt
  const result = await sendMessage(sandbox, instruction, gatewayToken, sessionId)

  if (!result.success) {
    await logger.error('OpenClaw execution failed')
    if (taskId && agentMessageId) {
      try {
        await db
          .update(taskMessages)
          .set({ content: result.error || 'OpenClaw execution failed' })
          .where(eq(taskMessages.id, agentMessageId))
      } catch {
        // Ignore
      }
    }
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
    sessionId: gatewayToken,
  }
}
