/**
 * @file PwaInstallPrompt.tsx
 * @description The Markets app's PWA install affordance (OVERSTORY-R001.2.4):
 * the shell offers the install prompt when the browser defers it, and
 * consumes it on click. The web manifest lives in index.html; this
 * component adds no theme or app state of its own.
 */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

/** The minimal surface of the browser's deferred install event. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onBefore = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferred) return null

  const offer = () => {
    void deferred.prompt()
    setDeferred(null)
  }

  return (
    <Button variant="outline" size="sm" onClick={offer}>
      Install app
    </Button>
  )
}
