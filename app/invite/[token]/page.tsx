import { db } from '@/lib/db/client'
import { workspaceInvites, workspaceMembers, workspaces } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { eq, and, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { generateId } from '@/lib/utils/id'
import { provisionUserEnvAsync } from '@/lib/company/provision-user'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Accept Invite - Cowork-Claw',
}

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function AcceptInvitePage({ params }: PageProps) {
  const session = await getServerSession()
  const { token } = await params

  if (!session?.user?.id) {
    redirect(`/?redirect=/invite/${token}`)
  }

  // Find invite
  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.token, token), isNull(workspaceInvites.acceptedAt)))
    .limit(1)

  if (!invite) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold mb-2">Invite not found</h1>
          <p className="text-sm text-muted-foreground">This invite may have expired or been used.</p>
        </div>
      </div>
    )
  }

  if (new Date() > invite.expiresAt) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-lg font-semibold mb-2">Invite expired</h1>
          <p className="text-sm text-muted-foreground">Ask the workspace admin for a new invite.</p>
        </div>
      </div>
    )
  }

  await db.insert(workspaceMembers).values({
    id: generateId(12),
    workspaceId: invite.workspaceId,
    userId: session.user.id,
    role: invite.role,
  })

  await db.update(workspaceInvites).set({ acceptedAt: new Date() }).where(eq(workspaceInvites.id, invite.id))

  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, invite.workspaceId)).limit(1)

  // Kick off Linux-user provisioning on the VPS in the background. If the
  // workspace uses persistent envs we redirect the user to an onboarding
  // progress page that polls /api/environments/me; otherwise straight home.
  if (workspace?.usePersistentEnv) {
    after(() =>
      provisionUserEnvAsync({
        userId: session.user.id,
        workspaceId: invite.workspaceId,
      }),
    )
    redirect(`/onboarding/environment?workspace=${workspace.id}`)
  }

  redirect(`/?workspace=${workspace?.id || ''}`)
}
