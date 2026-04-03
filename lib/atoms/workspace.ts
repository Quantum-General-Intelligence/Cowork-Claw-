import { atomWithStorage } from 'jotai/utils'

// Active workspace ID — null means personal workspace
export const activeWorkspaceIdAtom = atomWithStorage<string | null>('active-workspace-id', null)
