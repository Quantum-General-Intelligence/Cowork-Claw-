-- New tables for the persistent-user-environments architecture.
-- Made idempotent so deployments that re-run migrations don't fail on
-- already-present rows (drizzle-kit regenerated a superset by mistake).

CREATE TABLE IF NOT EXISTS "user_environments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"linux_username" text NOT NULL,
	"home_dir" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"provisioned_at" timestamp,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_env_clis" (
	"id" text PRIMARY KEY NOT NULL,
	"environment_id" text NOT NULL,
	"cli" text NOT NULL,
	"installed" boolean DEFAULT false NOT NULL,
	"authenticated" boolean DEFAULT false NOT NULL,
	"auth_method" text,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "terminal_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"linux_username" text NOT NULL,
	"cli" text NOT NULL,
	"port" integer NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'starting' NOT NULL,
	"pid" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"closed_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "environment_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workdir" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "use_persistent_env" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_environments" ADD CONSTRAINT "user_environments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_environments" ADD CONSTRAINT "user_environments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_env_clis" ADD CONSTRAINT "user_env_clis_environment_id_user_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."user_environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "terminal_sessions" ADD CONSTRAINT "terminal_sessions_environment_id_user_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."user_environments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_environments_user_workspace_idx" ON "user_environments" USING btree ("user_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_environments_linux_username_idx" ON "user_environments" USING btree ("linux_username");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_env_clis_env_cli_idx" ON "user_env_clis" USING btree ("environment_id","cli");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "terminal_sessions_user_idx" ON "terminal_sessions" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "terminal_sessions_port_idx" ON "terminal_sessions" USING btree ("port");
