import { useEffect, useState } from 'react'
import { CLASSES_UNAVAILABLE, readGraphClasses, type ClassesState } from './graph-read'

/**
 * Read the class hierarchy of the composed schema once per schema digest (OVERSTORY-APPS-R030.11.2).
 * A refused or absent read only means the view colors by the hash of the type string and says so.
 */
export function useGraphClasses(active: boolean): ClassesState | null {
  const [state, setState] = useState<ClassesState | null>(null)
  useEffect(() => {
    if (!active) return
    const abort = new AbortController()
    readGraphClasses(abort.signal)
      .then((next) => {
        if (!abort.signal.aborted) setState(next)
      })
      .catch(() => {
        if (!abort.signal.aborted) setState({ status: 'unavailable', notice: CLASSES_UNAVAILABLE })
      })
    return () => {
      abort.abort()
    }
  }, [active])
  return state
}
