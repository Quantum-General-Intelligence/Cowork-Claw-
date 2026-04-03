'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { SharedHeader } from '@/components/shared-header'
import { ArrowUp, Loader2, Sparkles, Settings, ChevronDown } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { Session } from '@/lib/session/types'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface OpenClawChatProps {
  user: Session['user'] | null
  authProvider: Session['authProvider'] | null
  initialStars?: number
  selectedOwner?: string
  selectedRepo?: string
}

const SUGGESTIONS = [
  { label: 'Fix a bug', prompt: 'Help me fix a bug in my project' },
  { label: 'Add a feature', prompt: 'Help me add a new feature' },
  { label: 'Refactor code', prompt: 'Help me refactor and improve code quality' },
  { label: 'Write tests', prompt: 'Help me write tests for my project' },
]

let messageIdCounter = 0
function generateMessageId() {
  return `msg-${Date.now()}-${++messageIdCounter}`
}

export function OpenClawChat({ user, initialStars, selectedOwner, selectedRepo }: OpenClawChatProps) {
  const searchParams = useSearchParams()
  const [conversationId, setConversationId] = useState<string | null>(searchParams.get('conversation'))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  // Load existing conversation on mount
  useEffect(() => {
    if (conversationId && messages.length === 0) {
      fetch(`/api/conversations/${conversationId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.messages) {
            setMessages(
              data.messages.map((m: { id: string; role: string; content: string }) => ({
                id: m.id,
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content,
              })),
            )
          }
        })
        .catch(() => {
          // Conversation not found, start fresh
          setConversationId(null)
        })
    }
  }, [conversationId]) // eslint-disable-line react-hooks/exhaustive-deps
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAutoScrolling = useRef(false)

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      isAutoScrolling.current = true
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => {
        isAutoScrolling.current = false
      }, 500)
    }
  }, [])

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom()
    }
  }, [messages, isAtBottom, scrollToBottom])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleScroll = () => {
      if (isAutoScrolling.current) return
      const { scrollTop, scrollHeight, clientHeight } = container
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 80)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return

      const userMessage: ChatMessage = { id: generateMessageId(), role: 'user', content: content.trim() }
      const assistantMessage: ChatMessage = { id: generateMessageId(), role: 'assistant', content: '' }

      const updatedMessages = [...messages, userMessage]
      setMessages([...updatedMessages, assistantMessage])
      setInput('')
      setIsStreaming(true)

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
            conversationId,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          throw new Error(errorData?.error || 'Failed to send message')
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let accumulated = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('e:')) {
              // Metadata line — contains conversationId
              try {
                const meta = JSON.parse(line.slice(2))
                if (meta.conversationId && !conversationId) {
                  setConversationId(meta.conversationId)
                  // Update URL without reload
                  window.history.replaceState(null, '', `/?conversation=${meta.conversationId}`)
                }
              } catch {
                // Skip
              }
            } else if (line.startsWith('0:')) {
              try {
                const text = JSON.parse(line.slice(2))
                accumulated += text
                setMessages((prev) => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { ...updated[updated.length - 1], content: accumulated }
                  return updated
                })
              } catch {
                // Skip malformed lines
              }
            }
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Something went wrong'
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `Sorry, ${errorMessage}. Please try again.`,
          }
          return updated
        })
      } finally {
        setIsStreaming(false)
      }
    },
    [messages, isStreaming],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isStreaming) {
        sendMessage(input)
      }
    }
  }

  const repoContext = selectedOwner && selectedRepo ? `${selectedOwner}/${selectedRepo}` : null

  const headerLeftActions = (
    <div className="flex items-center gap-2 min-w-0">
      <h1 className="text-lg font-semibold">Cowork</h1>
      {repoContext && <span className="text-sm text-muted-foreground truncate hidden sm:inline">/ {repoContext}</span>}
    </div>
  )

  const headerExtraActions = (
    <Link href="/new">
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
        <Settings className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Manual Mode</span>
      </Button>
    </Link>
  )

  return (
    <div className="flex-1 bg-background relative flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 p-3">
        <SharedHeader leftActions={headerLeftActions} extraActions={headerExtraActions} initialStars={initialStars} />
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto px-3 md:px-6">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6">
              <div className="text-center">
                <h2 className="text-2xl font-semibold mb-2">What would you like to build?</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Describe your task and OpenClaw will coordinate the right AI agents to get it done.
                  {repoContext && (
                    <>
                      {' '}
                      Working on <span className="font-medium text-foreground">{repoContext}</span>.
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion.label}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => sendMessage(suggestion.prompt)}
                    disabled={!user}
                  >
                    <Sparkles className="h-3 w-3" />
                    {suggestion.label}
                  </Button>
                ))}
              </div>

              {!user && <p className="text-xs text-muted-foreground">Sign in to start chatting with OpenClaw</p>}
            </div>
          ) : (
            <div className="py-4 space-y-6">
              {messages.map((message) => (
                <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'rounded-lg text-sm',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground px-4 py-2.5 max-w-[85%]'
                        : 'max-w-full w-full',
                    )}
                  >
                    {message.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <div className="text-sm">
                        {message.content ? (
                          <Streamdown
                            components={{
                              code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
                                <code className={`${className} !text-sm`} {...props}>
                                  {children}
                                </code>
                              ),
                              pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
                                <pre className="!text-sm bg-muted rounded-md p-3 overflow-x-auto my-2" {...props}>
                                  {children}
                                </pre>
                              ),
                              p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
                                <p className="mb-2 last:mb-0" {...props}>
                                  {children}
                                </p>
                              ),
                              ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
                                <ul className="list-disc ml-4 mb-2" {...props}>
                                  {children}
                                </ul>
                              ),
                              ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
                                <ol className="list-decimal ml-4 mb-2" {...props}>
                                  {children}
                                </ol>
                              ),
                              li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
                                <li className="mb-1" {...props}>
                                  {children}
                                </li>
                              ),
                              a: ({ children, href, ...props }: React.ComponentPropsWithoutRef<'a'>) => (
                                <a
                                  href={href}
                                  target={href?.startsWith('/') ? undefined : '_blank'}
                                  rel={href?.startsWith('/') ? undefined : 'noopener noreferrer'}
                                  className="text-primary hover:underline font-medium"
                                  {...props}
                                >
                                  {children}
                                </a>
                              ),
                              strong: ({ children, ...props }: React.ComponentPropsWithoutRef<'strong'>) => (
                                <strong className="font-semibold" {...props}>
                                  {children}
                                </strong>
                              ),
                            }}
                          >
                            {message.content}
                          </Streamdown>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>OpenClaw is thinking...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {!isAtBottom && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-background border border-border rounded-full p-2 shadow-md hover:bg-accent transition-colors z-10"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-border bg-background px-3 md:px-6 py-3">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <Card className="p-0 overflow-hidden">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  user
                    ? repoContext
                      ? `Ask OpenClaw to work on ${repoContext}...`
                      : 'Describe what you want to build...'
                    : 'Sign in to start chatting'
                }
                disabled={!user || isStreaming}
                className="border-0 focus-visible:ring-0 resize-none min-h-[52px] max-h-[200px] py-3.5 px-4 pr-14 text-sm"
                rows={1}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!input.trim() || isStreaming || !user}
                className="absolute right-2 bottom-2 h-8 w-8 p-0 rounded-lg"
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </Card>
          </form>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            OpenClaw coordinates Claude, Codex, Copilot, Cursor, Gemini, Pi &amp; more to accomplish your tasks
          </p>
        </div>
      </div>
    </div>
  )
}
