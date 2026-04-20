import 'server-only'

import { db } from '@/lib/db/client'
import { userEnvClis, userEnvironments } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { execAsUser, execAsRoot } from './vps-client'
import type { UserEnvironment } from '@/lib/db/schema'

/**
 * Per-CLI check: is the binary present system-wide, and has *this user*
 * authenticated it in their home directory (by whatever mechanism that CLI uses)?
 *
 * CLIs are installed globally on the VPS during `scripts/install-vps-clis.sh`.
 * This module never installs CLIs per-user; it only inspects per-user auth state.
 */
export type SupportedCli = 'claude' | 'codex' | 'cursor' | 'gemini' | 'copilot' | 'opencode'

interface CliProbe {
  /** `which <binary>` to verify the CLI is installed system-wide. */
  binary: string
  /** Path inside the user's home that indicates a completed interactive login. */
  authMarkerPath: string
  /** How the CLI authenticates: api_key (env var), subscription (OAuth file), oauth (same). */
  defaultAuthMethod: 'api_key' | 'subscription' | 'oauth'
}

const PROBES: Record<SupportedCli, CliProbe> = {
  claude: {
    binary: 'claude',
    authMarkerPath: '.claude/.credentials.json',
    defaultAuthMethod: 'subscription',
  },
  codex: {
    binary: 'codex',
    authMarkerPath: '.codex/auth.json',
    defaultAuthMethod: 'api_key',
  },
  cursor: {
    binary: 'cursor-agent',
    authMarkerPath: '.cursor/config.json',
    defaultAuthMethod: 'api_key',
  },
  gemini: {
    binary: 'gemini',
    authMarkerPath: '.gemini/oauth_creds.json',
    defaultAuthMethod: 'oauth',
  },
  copilot: {
    binary: 'copilot',
    authMarkerPath: '.config/github-copilot/hosts.json',
    defaultAuthMethod: 'oauth',
  },
  opencode: {
    binary: 'opencode',
    authMarkerPath: '.opencode/config.json',
    defaultAuthMethod: 'api_key',
  },
}

async function checkBinaryInstalledOnHost(binary: string): Promise<boolean> {
  try {
    const r = await execAsRoot(`which '${binary.replace(/'/g, "'\\''")}' >/dev/null 2>&1`, {
      timeoutMs: 10000,
      maxRetries: 1,
    })
    return r.exitCode === 0
  } catch {
    return false
  }
}

async function checkAuthMarker(linuxUsername: string, relativePath: string): Promise<boolean> {
  try {
    const r = await execAsUser(linuxUsername, `test -s "$HOME/${relativePath.replace(/"/g, '\\"')}"`, {
      timeoutMs: 10000,
      maxRetries: 1,
    })
    return r.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Refresh the `user_env_clis` rows for a single environment.
 * Runs checks serially (a user has at most 6 CLIs and each check is <1s).
 */
export async function refreshCliStatus(env: UserEnvironment): Promise<void> {
  const now = new Date()

  for (const cli of Object.keys(PROBES) as SupportedCli[]) {
    const probe = PROBES[cli]
    const installed = await checkBinaryInstalledOnHost(probe.binary)
    const authenticated = installed ? await checkAuthMarker(env.linuxUsername, probe.authMarkerPath) : false

    await db
      .insert(userEnvClis)
      .values({
        id: `${env.id}-${cli}`,
        environmentId: env.id,
        cli,
        installed,
        authenticated,
        authMethod: probe.defaultAuthMethod,
        lastCheckedAt: now,
      })
      .onConflictDoUpdate({
        target: [userEnvClis.environmentId, userEnvClis.cli],
        set: {
          installed,
          authenticated,
          authMethod: probe.defaultAuthMethod,
          lastCheckedAt: now,
          updatedAt: now,
        },
      })
  }
}

/** Convenience: load all CLI status rows for an environment. */
export async function getCliStatus(environmentId: string) {
  return db.select().from(userEnvClis).where(eq(userEnvClis.environmentId, environmentId))
}

/** Reset a single CLI's auth state (delete the marker file). */
export async function resetCliAuth(env: UserEnvironment, cli: SupportedCli): Promise<void> {
  const probe = PROBES[cli]
  await execAsUser(env.linuxUsername, `rm -rf "$HOME/${probe.authMarkerPath.replace(/"/g, '\\"')}"`, {
    timeoutMs: 10000,
  })

  await db
    .update(userEnvClis)
    .set({ authenticated: false, lastCheckedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(userEnvClis.environmentId, env.id), eq(userEnvClis.cli, cli)))
}

export { PROBES as CLI_PROBES }
