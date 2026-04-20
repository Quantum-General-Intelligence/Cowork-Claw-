# Cowork-Claw

An internal platform for a developer team: dispatch coding agents (Claude Code, OpenAI's Codex CLI, GitHub Copilot CLI, Cursor CLI, Google Gemini CLI, and opencode) against shared repositories from a single control plane. Every team member has a **persistent Linux account** on a company VPS where tasks run, CLIs are authenticated once, and artifacts persist between runs.

![Cowork-Claw Screenshot](screenshot.png)

## Features

- **Multi-Agent Support**: Choose from Claude Code, OpenAI Codex CLI, GitHub Copilot CLI, Cursor CLI, Google Gemini CLI, or opencode to execute coding tasks
- **User Authentication**: Secure sign-in with email, Google, or GitHub via [Supabase Auth](https://supabase.com/docs/guides/auth)
- **Multi-User Support**: Each user has their own tasks, API keys, and GitHub connection
- **Persistent Linux Environments**: Every team member gets a dedicated Linux account on the company VPS; CLI logins, repo checkouts and caches survive across tasks
- **Embedded Web Terminal**: Interactive CLI logins (`claude login`, `gh auth login`, …) via a browser-side `ttyd` iframe
- **AI Gateway Integration**: Built for seamless integration with [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) for model routing and observability
- **AI-Generated Branch Names**: Automatically generates descriptive Git branch names using AI SDK 5 + AI Gateway
- **Task Management**: Track task progress with real-time updates
- **Persistent Storage**: Tasks stored in Postgres
- **Git Integration**: Automatically creates branches and commits changes
- **Modern UI**: Clean, responsive interface built with Next.js and Tailwind CSS
- **MCP Server Support**: Connect MCP servers to Claude Code for extended capabilities (Claude only)

## Quick Start

For detailed setup instructions, see the [Local Development Setup](#local-development-setup) section below.

```bash
git clone https://github.com/vercel-labs/coding-agent-template.git
cd coding-agent-template
pnpm install
# Set up .env.local with required variables (see .env.example)
pnpm db:push
pnpm dev
```

## Usage

1. **Sign In**: Authenticate with email, Google, or GitHub
2. **Create a Task**: Enter a repository URL and describe what you want the AI to do
3. **Monitor Progress**: Watch real-time logs as the agent works
4. **Review Results**: See the changes made and the branch created
5. **Manage Tasks**: View all your tasks in the sidebar with status updates

## Execution Environment

Tasks run inside each team member's **persistent Linux account** on the
company VPS. Every member has a home directory, installed coding CLIs, and
saved CLI logins that survive across tasks.

- **Coding tasks** check the target repository out into
  `~/projects/<owner>/<repo>` on the first run and reuse that working copy on
  every subsequent task. Follow-up messages continue in the same directory.
- **Non-coding tasks** get a fresh `~/tasks/<taskId>/` working directory.
  Files written under that path are automatically registered as downloadable
  artifacts on the task detail page.
- **CLI logins** (`claude login`, `gh auth login`, etc.) are interactive and
  performed once via the embedded web terminal on `/settings/environment`.
  After that, every task the user launches inherits those logins.
- The Linux account is shared across all of a user's tasks, so caches
  (`~/.cache`, `node_modules`, `~/.npm`) are preserved between runs.

## How It Works

1. **Task Creation**: When you submit a task, it's stored in the database
2. **AI Branch Name Generation**: AI SDK 5 + AI Gateway automatically generates a descriptive branch name based on your task (non-blocking using Next.js 15's `after()`)
3. **Environment Dispatch**: The app connects to the company VPS as root and runs the task via `sudo -u <linux-user>` in the user's home directory
4. **Agent Execution**: Your chosen coding agent (Claude Code, Codex CLI, GitHub Copilot CLI, Cursor CLI, Gemini CLI, or opencode) analyzes your prompt and makes changes
5. **Git Operations**: Changes are committed and pushed to the AI-generated branch
6. **Artifacts**: Any files the task writes outside the repo workdir are surfaced as downloadable artifacts — the user's home directory itself persists for the next task

## AI Branch Name Generation

The system automatically generates descriptive Git branch names using AI SDK 5 and Vercel AI Gateway. This feature:

- **Non-blocking**: Uses Next.js 15's `after()` function to generate names without delaying task creation
- **Descriptive**: Creates meaningful branch names like `feature/user-authentication-A1b2C3` or `fix/memory-leak-parser-X9y8Z7`
- **Conflict-free**: Adds a 6-character alphanumeric hash to prevent naming conflicts
- **Fallback**: Gracefully falls back to timestamp-based names if AI generation fails
- **Context-aware**: Uses task description, repository name, and agent context for better names

### Branch Name Examples

- `feature/add-user-auth-K3mP9n` (for "Add user authentication with JWT")
- `fix/resolve-memory-leak-B7xQ2w` (for "Fix memory leak in image processing")
- `chore/update-deps-M4nR8s` (for "Update all project dependencies")
- `docs/api-endpoints-F9tL5v` (for "Document REST API endpoints")

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: PostgreSQL with Drizzle ORM
- **AI SDK**: AI SDK 5 with Vercel AI Gateway integration
- **AI Agents**: Claude Code, OpenAI Codex CLI, GitHub Copilot CLI, Cursor CLI, Google Gemini CLI, opencode
- **Runtime**: Persistent per-user Linux accounts on a shared company VPS, driven via `ssh2` + `sudo -u`
- **Authentication**: Supabase Auth (email / Google / GitHub)
- **Git**: Automated branching and commits with AI-generated branch names

## MCP Server Support

Connect MCP Servers to extend Claude Code with additional tools and integrations. **Currently only works with Claude Code agent.**

### How to Add MCP Servers

1. Go to the "Connectors" tab and click "Add MCP Server"
2. Enter server details (name, base URL, optional OAuth credentials)
3. If using OAuth, ensure `ENCRYPTION_KEY` is set in your environment variables

**Note**: `ENCRYPTION_KEY` is required when using MCP servers with OAuth authentication.

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/vercel-labs/coding-agent-template.git
cd coding-agent-template
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

Create a `.env.local` file with your values:

#### Required Environment Variables (App Infrastructure)

These are set once by you (the app developer) and are used for core infrastructure:

- `POSTGRES_URL`: Your PostgreSQL connection string
- `ENCRYPTION_KEY`: 32-byte hex string for encrypting user API keys and tokens (generate with: `openssl rand -hex 32`)
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Your Supabase project's anon/publishable key

#### User Authentication (Required)

Authentication is handled entirely by [Supabase Auth](https://supabase.com/docs/guides/auth).
Configure which providers (email, Google, GitHub) are enabled on your project in
the Supabase dashboard, then expose them to the UI via `NEXT_PUBLIC_AUTH_PROVIDERS`.

- `NEXT_PUBLIC_AUTH_PROVIDERS`: Comma-separated list of providers to show on `/auth`
  - `"email"` - Email + password
  - `"google"` - Sign in with Google (must be enabled in Supabase)
  - `"github"` - Sign in with GitHub (must be enabled in Supabase)
  - Default: `"email,google,github"`

**GitHub API access**: When users sign in with GitHub (or connect GitHub from
their profile via Supabase identity linking), the `provider_token` returned by
Supabase is persisted server-side and used for GitHub API calls (listing repos,
creating PRs, etc.). Make sure the Supabase GitHub provider is configured with
the `repo` scope.

**Optional:** Set `NEXT_PUBLIC_GITHUB_CLIENT_ID` to the client ID of the GitHub
OAuth app Supabase is using. When set, the "Reconfigure GitHub access" action
deep-links to the OAuth app settings on github.com so users can re-grant org
or repository access without a full reconnect.

#### API Keys (Optional - Can be per-user)

These API keys can be set globally (fallback for all users) or left unset to require users to provide their own:

- `ANTHROPIC_API_KEY`: Anthropic API key for Claude agent (users can override in their profile)
- `AI_GATEWAY_API_KEY`: AI Gateway API key for branch name generation and Codex (users can override)
- `CURSOR_API_KEY`: For Cursor agent support (users can override)
- `GEMINI_API_KEY`: For Google Gemini agent support (users can override)
- `OPENAI_API_KEY`: For Codex and OpenCode agents (users can override)

> **Note**: Users can provide their own API keys in their profile settings, which take precedence over global environment variables.

#### GitHub Repository Access

Users authenticate with their own GitHub accounts through Supabase. No shared `GITHUB_TOKEN` is required.

**How Authentication Works:**
- **Sign in with GitHub**: Users get immediate repository access via the OAuth token Supabase returns, which the app encrypts and stores server-side.
- **Sign in with Email or Google**: Users can later connect a GitHub account from their profile via Supabase identity linking to enable repository access.
- **Identity Linking**: Primary and linked GitHub identities both hydrate the same `accounts`/`users` record, so users never end up with duplicate accounts.

#### Optional Environment Variables

- `NPM_TOKEN`: For private npm packages
- `MAX_MESSAGES_PER_DAY`: Maximum number of tasks + follow-ups per user per day (default: `5`)
- `TERMINAL_PROXY_URL`: Public base URL of the ttyd reverse proxy used by the web-terminal ("Log in" buttons in `/settings/environment`)

### 4. Configure Supabase Auth Providers

OAuth providers are configured directly in Supabase — you do **not** need to create or manage OAuth apps in this codebase.

1. Open your Supabase project dashboard → **Authentication → Providers**.
2. Enable the providers you want to offer (Email, Google, GitHub, …).
3. For **GitHub**, create a GitHub OAuth App at [GitHub Developer Settings](https://github.com/settings/developers):
   - **Homepage URL**: `http://localhost:3000` (or your production URL)
   - **Authorization callback URL**: the callback URL shown in the Supabase GitHub provider settings (looks like `https://<project-ref>.supabase.co/auth/v1/callback`)
   - Copy the client ID and secret into the Supabase GitHub provider form.
   - Scopes: request `repo` so that the `provider_token` can be used for GitHub API access.
4. Add `http://localhost:3000/auth/callback` (and your production equivalent) to **Authentication → URL Configuration → Redirect URLs** in Supabase.

### 5. Set up the database

Generate and run database migrations:

```bash
pnpm db:generate
pnpm db:push
```

### 6. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development

### Database Operations

```bash
# Generate migrations
pnpm db:generate

# Push schema changes
pnpm db:push

# Open Drizzle Studio
pnpm db:studio
```

### Running the App

```bash
# Development
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Security Considerations

- **Environment Variables**: Never commit `.env` files to version control. All sensitive data should be stored in environment variables.
- **API Keys**: Rotate your API keys regularly and use the principle of least privilege.
- **Database Access**: Ensure your PostgreSQL database is properly secured with strong credentials.
- **Linux Isolation**: Each team member runs as a dedicated Linux user on the company VPS; tasks never share a working directory across users and the app connects as root only to dispatch `sudo -u <user>` commands.
- **User Authentication**: Each user authenticates with their own identity via Supabase and uses their own GitHub token for repository access - no shared credentials.
- **Encryption**: All sensitive data (tokens, API keys) is encrypted at rest.

