/**
 * @file ShareDialog.tsx
 * @description Ownership and sharing of one dashboard (OVERSTORY-DASH-R012). It shows the
 * owner and the caller's access level from `dashboard.access.get`; only the owner may
 * grant or revoke reader or editor access through `dashboard.share`. A reader or editor
 * sees the grants and no controls to change them.
 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { StatusMessage } from '@/components/ui/status-message'
import { ServedState } from '@/components/served/ServedState'
import type { ServedReply } from '@/lib/arbora-api/served'
import type { ArboraDashboardStore, DashboardAccess, DashboardGrant } from '@/lib/dashboards/store-arbora'

const ROLE_LABEL: Record<string, string> = { view: 'Reader', edit: 'Editor', owner: 'Owner' }

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role
}

type Subject = 'user' | 'group'

function GrantRow({
  grant,
  canChange,
  onRevoke,
}: {
  grant: DashboardGrant
  canChange: boolean
  onRevoke: () => void
}) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>
        <span className="font-mono">{grant.principal_or_group}</span> · {roleLabel(grant.role)}
      </span>
      {canChange && (
        <Button size="sm" variant="outline" aria-label={`Revoke ${grant.principal_or_group}`} onClick={onRevoke}>
          Revoke
        </Button>
      )}
    </li>
  )
}

export function ShareDialog({
  store,
  dashboardId,
  open,
  onOpenChange,
}: {
  store: ArboraDashboardStore
  dashboardId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [access, setAccess] = useState<ServedReply<DashboardAccess> | null>(null)
  const [subject, setSubject] = useState<Subject>('user')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'view' | 'edit'>('view')
  const [outcome, setOutcome] = useState<ServedReply<DashboardGrant[]> | null>(null)

  const refresh = useCallback(async () => {
    setAccess(await store.access(dashboardId))
  }, [store, dashboardId])
  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const change = async (target: string, grantRole: 'view' | 'edit', action: 'grant' | 'revoke', kind: Subject) => {
    const reply = await store.share(
      dashboardId,
      kind === 'user' ? { grantee: target } : { group: target },
      grantRole,
      action,
    )
    setOutcome(reply)
    if (reply.kind === 'ready') {
      setName('')
      await refresh()
    }
  }

  const isOwner = access?.kind === 'ready' && access.result.role === 'owner'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share dashboard</DialogTitle>
          <DialogDescription>Who owns this dashboard and who may read or edit it.</DialogDescription>
        </DialogHeader>
        {!access && <StatusMessage status="loading" />}
        {access && access.kind !== 'ready' && <ServedState reply={access} what="The dashboard access" />}
        {access?.kind === 'ready' && (
          <div className="space-y-3">
            <p className="text-sm">
              Owner: <span className="font-mono">{access.result.owner}</span>
            </p>
            <p className="text-sm">Your access: {roleLabel(access.result.role)}</p>
            {access.result.grants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isOwner || access.result.role === 'edit'
                  ? 'No one else has access.'
                  : 'The grants are not shown to readers.'}
              </p>
            ) : (
              <ul className="space-y-1" aria-label="Access grants">
                {access.result.grants.map((grant) => (
                  <GrantRow
                    key={grant.principal_or_group}
                    grant={grant}
                    canChange={isOwner}
                    onRevoke={() => {
                      void change(grant.principal_or_group, grant.role === 'edit' ? 'edit' : 'view', 'revoke', 'user')
                    }}
                  />
                ))}
              </ul>
            )}
            {isOwner && (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const target = name.trim()
                  if (target) void change(target, role, 'grant', subject)
                }}
              >
                <label className="flex flex-col gap-1 text-xs">
                  Grant to
                  <select
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value as Subject)
                    }}
                  >
                    <option value="user">A person</option>
                    <option value="group">A group</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Name
                  <Input
                    value={name}
                    maxLength={256}
                    onChange={(e) => {
                      setName(e.target.value)
                    }}
                    className="h-9 w-48"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Access
                  <select
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value as 'view' | 'edit')
                    }}
                  >
                    <option value="view">Reader</option>
                    <option value="edit">Editor</option>
                  </select>
                </label>
                <Button type="submit" size="sm" disabled={name.trim().length === 0}>
                  Grant access
                </Button>
              </form>
            )}
            {outcome && outcome.kind !== 'ready' && <ServedState reply={outcome} what="The access change" />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
