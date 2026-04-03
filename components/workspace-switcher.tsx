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
import { ChevronDown, Plus, Users } from 'lucide-react'
import { useAtom } from 'jotai'
import { activeWorkspaceIdAtom } from '@/lib/atoms/workspace'
import Link from 'next/link'

interface WorkspaceItem {
  id: string
  name: string
  slug: string
  role: string
}

export function WorkspaceSwitcher() {
  const [activeId, setActiveId] = useAtom(activeWorkspaceIdAtom)
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([])

  useEffect(() => {
    fetch('/api/workspaces')
      .then((res) => (res.ok ? res.json() : { workspaces: [] }))
      .then((data) => setWorkspaces(data.workspaces || []))
      .catch(() => setWorkspaces([]))
  }, [])

  const activeWorkspace = workspaces.find((w) => w.id === activeId)
  const label = activeWorkspace?.name || 'Personal'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs font-medium px-2">
          <Users className="h-3 w-3" />
          <span className="max-w-[100px] truncate">{label}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={() => setActiveId(null)} className="text-xs">
          Personal
        </DropdownMenuItem>

        {workspaces.length > 0 && <DropdownMenuSeparator />}

        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} onClick={() => setActiveId(ws.id)} className="text-xs">
            <span className="truncate">{ws.name}</span>
            {ws.id === activeId && <span className="ml-auto text-primary">*</span>}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-xs">
          <Link href="/workspaces">
            <Plus className="h-3 w-3 mr-1.5" />
            Manage Workspaces
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
