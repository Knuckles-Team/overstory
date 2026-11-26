/**
 * @file served-state.tsx
 * @description Renders every non-ready state of a served Arbora operation with
 * distinct text, so an unavailable operation is never read as an empty answer
 * (OVERSTORY-DECIDE-R009.1, OVERSTORY-DECIDE-R010.1).
 */
import { StatusMessage } from '@/components/ui/status-message'
import type { ServedReply } from '@/lib/arbora-api/served'

type NotReady = Exclude<ServedReply<unknown>, { kind: 'ready' }>

/** Short operator wording for the operation that did not answer. */
export function ServedState({ reply, what }: { reply: NotReady; what: string }) {
  if (reply.kind === 'unavailable')
    return (
      <StatusMessage
        status="stale"
        label="Unavailable."
        detail={`${what} is not served yet, so nothing is shown. This is not an empty result.`}
      />
    )
  if (reply.kind === 'denied')
    return <StatusMessage status="denied" label="Denied." detail={`You may not read ${what}.`} />
  if (reply.kind === 'pending')
    return (
      <StatusMessage status="pending" label="Pending confirmation." detail={`${what} waits for a confirmation.`} />
    )
  return <StatusMessage status="error" label="Error." detail={`${what} could not be read (${reply.code}).`} />
}
