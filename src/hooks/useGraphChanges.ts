/**
 * Subscription to the engine change feed for the graph view (OVERSTORY-APPS-R030.8.2, .3, .4).
 *
 * One authorized snapshot opens the feed, then the hook reads pages after the held cursor. A refused
 * cursor ends in a fresh snapshot. A denied read withdraws the subscription and reports revocation.
 * Without published limits no request is made at all. The timer is injected, so a test steps it.
 */
import { useEffect, useRef, useState } from 'react'
import {
  acceptSnapshot,
  effectOf,
  idleFeed,
  readGraphChanges,
  readGraphSnapshot,
  receivePage,
  refuseCursor,
  revokeFeed,
  type ChangeEffect,
  type FeedState,
  type LiveLimitsState,
} from '@/lib/graph-changes'

export const FEED_POLL_MS = 1500

export interface Scheduler {
  after: (run: () => void, ms: number) => () => void
}

export const browserScheduler: Scheduler = {
  after: (run, ms) => {
    const handle = setTimeout(run, ms)
    return () => {
      clearTimeout(handle)
    }
  },
}

export interface GraphChangesOptions {
  active: boolean
  limits: LiveLimitsState
  /** Called with what the committed events ask of the view. */
  onEffect: (effect: ChangeEffect) => void
  /** Called once when a denied read withdraws the subscription. */
  onRevoked: () => void
  scheduler?: Scheduler
}

export function useGraphChanges({
  active,
  limits,
  onEffect,
  onRevoked,
  scheduler = browserScheduler,
}: GraphChangesOptions) {
  const [feed, setFeed] = useState<FeedState>(idleFeed)
  const callbacks = useRef({ onEffect, onRevoked })
  callbacks.current = { onEffect, onRevoked }
  const ready = limits.status === 'ready'

  useEffect(() => {
    if (!active || !ready) {
      setFeed(!active ? idleFeed() : { phase: 'unavailable', reason: limits.status === 'ready' ? '' : limits.notice })
      return
    }
    const abort = new AbortController()
    let cancel: () => void = () => undefined
    let state: FeedState = idleFeed()
    const publish = (next: FeedState) => {
      state = next
      setFeed(next)
    }
    const stop = () => {
      abort.abort()
    }
    const later = (run: () => Promise<void>) => {
      cancel = scheduler.after(() => {
        void run()
      }, FEED_POLL_MS)
    }
    const open = async () => {
      const reply = await readGraphSnapshot(abort.signal)
      if (abort.signal.aborted) return
      if (reply.kind === 'denied') {
        revoke()
        return
      }
      if (reply.kind !== 'ready') {
        publish({ phase: 'unavailable', reason: reply.code })
        return
      }
      const next = acceptSnapshot(state, reply.result, limits)
      publish(next)
      if (next.phase === 'resnapshot') {
        later(open)
        return
      }
      later(poll)
    }
    const revoke = () => {
      publish(revokeFeed())
      stop()
      callbacks.current.onRevoked()
    }
    const poll = async () => {
      if (state.phase !== 'live') return
      const reply = await readGraphChanges(state.cursor, abort.signal)
      if (abort.signal.aborted) return
      if (reply.kind === 'denied') {
        revoke()
        return
      }
      if (reply.kind === 'error') {
        const next = refuseCursor(state, reply.code)
        publish(next)
        if (next.phase === 'resnapshot') await open()
        else later(poll)
        return
      }
      if (reply.kind !== 'ready') {
        publish({ phase: 'unavailable', reason: reply.code })
        return
      }
      const outcome = receivePage(state, reply.result, limits)
      publish(outcome.state)
      if (outcome.apply.length > 0) callbacks.current.onEffect(effectOf(outcome.apply))
      later(poll)
    }
    void open()
    return () => {
      cancel()
      stop()
    }
  }, [active, ready, limits, scheduler])

  return feed
}
