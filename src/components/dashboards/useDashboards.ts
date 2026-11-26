/**
 * @file useDashboards.ts
 * @description State for the Dashboards page: the open dashboard with undo history,
 * the saved list, the save status, the pending approval, and the controller the WebMCP
 * tools use. User and agent edits share one path (OVERSTORY-DASH-R006, R008, R009).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  applyEdit,
  openDocument,
  redo as redoState,
  undo as undoState,
  type Actor,
  type HistoryState,
} from '@/lib/dashboards/history'
import { createDashboard, DashboardError, type Dashboard } from '@/lib/dashboards/model'
import { listNodeTypes, runPanelQuery } from '@/lib/dashboards/query'
import { createLocalStore, type DashboardStore, type SaveResult } from '@/lib/dashboards/store'
import {
  describeRemoteWrite,
  type ArboraDashboardStore,
  type DashboardListing,
  type DashboardRole,
} from '@/lib/dashboards/store-arbora'
import type { ServedReply } from '@/lib/arbora-api/served'
import type { DashboardController } from '@/lib/dashboards/tools'

export interface PendingApproval {
  message: string
}

/** What arbora reports about the open dashboard: who owns it and what the caller may do. */
export type AccessState =
  { kind: 'local' } | { kind: 'ready'; owner: string; role: DashboardRole } | { kind: 'unavailable' }

export function useDashboards(store?: DashboardStore, remote?: ArboraDashboardStore) {
  const storeRef = useRef<DashboardStore>(store ?? createLocalStore())
  const stateRef = useRef<HistoryState>(openDocument(null))
  const [state, setStateValue] = useState<HistoryState>(stateRef.current)
  const [saved, setSaved] = useState<Dashboard[]>(() => storeRef.current.list())
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)
  const [pending, setPending] = useState<PendingApproval | null>(null)
  const resolverRef = useRef<((approved: boolean) => void) | null>(null)
  const [access, setAccess] = useState<AccessState>({ kind: 'local' })
  const accessRef = useRef<AccessState>(access)
  const [remoteList, setRemoteList] = useState<ServedReply<DashboardListing[]> | null>(null)
  const writes = useRef<Promise<void>>(Promise.resolve())
  const readOnly = access.kind === 'ready' && access.role === 'view'

  const applyAccess = useCallback((next: AccessState) => {
    accessRef.current = next
    setAccess(next)
  }, [])

  const refreshRemote = useCallback(async () => {
    if (remote) setRemoteList(await remote.list())
  }, [remote])
  useEffect(() => {
    void refreshRemote()
  }, [refreshRemote])

  const persist = useCallback(
    (doc: Dashboard | null) => {
      if (!doc) return
      const local = storeRef.current.save(doc)
      setSaveResult(local)
      setSaved(storeRef.current.list())
      if (!remote) return
      // Remote writes run one after another so each sends the revision the previous one returned.
      writes.current = writes.current.then(async () => {
        const write = await remote.save(doc)
        setSaveResult(describeRemoteWrite(write, local.message))
        if (write.kind === 'saved') void refreshRemote()
      })
    },
    [remote, refreshRemote],
  )

  const commit = useCallback(
    (next: HistoryState) => {
      stateRef.current = next
      setStateValue(next)
      persist(next.doc)
    },
    [persist],
  )

  const edit = useCallback(
    (actor: Actor, label: string, change: (doc: Dashboard) => Dashboard): Dashboard => {
      const current = stateRef.current.doc
      if (!current) throw new Error('no dashboard is open')
      const role = accessRef.current
      if (role.kind === 'ready' && role.role === 'view')
        throw new DashboardError('this dashboard is read-only for you; ask the owner for edit access')
      const after = change(current)
      commit(applyEdit(stateRef.current, actor, label, after))
      return after
    },
    [commit],
  )

  const create = useCallback(
    (actor: Actor, title: string): Dashboard => {
      const doc = createDashboard(
        title,
        storeRef.current.list().map((d) => d.id),
      )
      applyAccess({ kind: 'local' })
      commit(applyEdit(stateRef.current, actor, `Created dashboard "${doc.title}"`, doc))
      return doc
    },
    [commit, applyAccess],
  )

  const open = useCallback(
    (doc: Dashboard) => {
      stateRef.current = openDocument(doc)
      setStateValue(stateRef.current)
      applyAccess({ kind: 'local' })
      if (!remote) return
      void remote.access(doc.id).then((reply) => {
        if (stateRef.current.doc?.id !== doc.id) return
        applyAccess(
          reply.kind === 'ready'
            ? { kind: 'ready', owner: reply.result.owner, role: reply.result.role }
            : { kind: 'unavailable' },
        )
      })
    },
    [remote, applyAccess],
  )

  /** Open a dashboard that arbora holds, with the owner and role it reports. */
  const openRemote = useCallback(
    async (id: string) => {
      if (!remote) return
      const reply = await remote.load(id)
      if (reply.kind !== 'ready') {
        setSaveResult({
          status: 'not-saved',
          message: `This dashboard could not be loaded from arbora (${reply.kind}).`,
        })
        return
      }
      stateRef.current = openDocument(reply.result.doc)
      setStateValue(stateRef.current)
      applyAccess({ kind: 'ready', owner: reply.result.owner, role: reply.result.role })
    },
    [remote, applyAccess],
  )

  const remove = useCallback(
    (id: string) => {
      const local = storeRef.current.remove(id)
      setSaveResult(local)
      setSaved(storeRef.current.list())
      if (remote) {
        writes.current = writes.current.then(async () => {
          const write = await remote.remove(id)
          setSaveResult(describeRemoteWrite(write, local.message))
          void refreshRemote()
        })
      }
      if (stateRef.current.doc?.id === id) {
        stateRef.current = openDocument(null)
        setStateValue(stateRef.current)
      }
    },
    [remote, refreshRemote],
  )

  const undo = useCallback(() => {
    commit(undoState(stateRef.current))
  }, [commit])
  const redo = useCallback(() => {
    commit(redoState(stateRef.current))
  }, [commit])

  const requestApproval = useCallback((message: string, signal?: AbortSignal): Promise<boolean> => {
    resolverRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      const finish = (approved: boolean) => {
        resolverRef.current = null
        setPending(null)
        resolve(approved)
      }
      resolverRef.current = finish
      setPending({ message })
      signal?.addEventListener('abort', () => {
        finish(false)
      })
    })
  }, [])

  const answer = useCallback((approved: boolean) => {
    resolverRef.current?.(approved)
  }, [])

  const controller = useMemo<DashboardController>(
    () => ({
      current: () => stateRef.current.doc,
      create: (title) => create('agent', title),
      edit: (label, change) => edit('agent', label, change),
      confirm: (message, signal) => requestApproval(message, signal),
      runQuery: (text, signal) =>
        runPanelQuery({ query: { kind: 'uql', text } }, stateRef.current.doc?.params ?? [], signal),
      listSources: listNodeTypes,
    }),
    [create, edit, requestApproval],
  )

  return {
    state,
    saved,
    saveResult,
    access,
    readOnly,
    remoteList,
    openRemote,
    pending,
    controller,
    edit,
    create,
    open,
    remove,
    undo,
    redo,
    requestApproval,
    answer,
  }
}
