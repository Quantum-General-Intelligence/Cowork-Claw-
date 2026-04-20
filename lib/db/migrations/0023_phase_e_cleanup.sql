-- Phase E cleanup: remove legacy ephemeral-sandbox columns and flip the
-- persistent-env flag on by default. Written idempotent so it's safe to
-- re-run on partially migrated databases.

ALTER TABLE "tasks" DROP COLUMN IF EXISTS "sandbox_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "sandbox_url";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "keep_alive";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "max_duration";--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "use_persistent_env" SET DEFAULT true;
