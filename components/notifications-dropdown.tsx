'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Bell, CheckCircle, AlertCircle, GitPullRequest } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string | null
  actionUrl: string | null
  readAt: string | null
  createdAt: string
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  task_complete: CheckCircle,
  task_error: AlertCircle,
  pr_created: GitPullRequest,
  pr_merged: GitPullRequest,
}

export function NotificationsDropdown() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const fetchNotifications = () => {
      fetch('/api/notifications')
        .then((res) => (res.ok ? res.json() : { notifications: [], unreadCount: 0 }))
        .then((data) => {
          setNotifications(data.notifications || [])
          setUnreadCount(data.unreadCount || 0)
        })
        .catch(() => {})
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000) // Poll every 30s
    return () => clearInterval(interval)
  }, [])

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
    setUnreadCount(0)
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications</div>
        ) : (
          notifications.slice(0, 10).map((n) => {
            const Icon = TYPE_ICONS[n.type] || Bell
            return (
              <DropdownMenuItem key={n.id} asChild className="cursor-pointer">
                <Link href={n.actionUrl || '#'} className="flex items-start gap-2.5 px-3 py-2">
                  <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', !n.readAt && 'text-primary')} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs truncate', !n.readAt && 'font-medium')}>{n.title}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  {!n.readAt && <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                </Link>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
