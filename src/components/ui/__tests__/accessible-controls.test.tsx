import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

const UI_DIR = resolve(import.meta.dirname, '..')
const CSS = readFileSync(resolve(UI_DIR, '../../index.css'), 'utf-8')

describe('controls expose names and visible focus (OVERSTORY-DESIGN-R003)', () => {
  // spec: OVERSTORY-DESIGN-R003
  it('keeps a global ring-token focus-visible outline as the fallback for every control', () => {
    expect(CSS).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ring\)/)
  })

  // spec: OVERSTORY-DESIGN-R003
  it('never removes the outline in a primitive without a replacement focus ring', () => {
    const offenders: string[] = []
    for (const file of readdirSync(UI_DIR).filter((name) => name.endsWith('.tsx'))) {
      const lines = readFileSync(resolve(UI_DIR, file), 'utf-8').split('\n')
      lines.forEach((line, index) => {
        const removesOutline = /(?<![\w:-])(?:focus-visible:)?outline-(?:none|hidden)|focus:outline-hidden/.test(line)
        // Menu items show roving focus with a filled highlight; hover-card content is not focusable.
        const replaced = /ring|focus:bg-accent/.test(line) || file === 'hover-card.tsx'
        if (removesOutline && !replaced) offenders.push(`${file}:${index + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })

  // spec: OVERSTORY-DESIGN-R003
  it('resolves an accessible name for labelled form controls and icon buttons', () => {
    render(
      <div>
        <Button aria-label="Close panel" />
        <Input aria-label="Search" />
        <Textarea aria-label="Notes" />
        <Checkbox aria-label="Include archived" />
        <Switch aria-label="Compact density" />
      </div>,
    )
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Include archived' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Compact density' })).toBeTruthy()
  })

  // spec: OVERSTORY-DESIGN-R003
  it('names the dialog, traps focus inside it and restores focus to the trigger on close', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Open settings</button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Change appearance.</DialogDescription>
          <button type="button">Apply</button>
        </DialogContent>
      </Dialog>,
    )
    const trigger = screen.getByRole('button', { name: 'Open settings' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    for (let step = 0; step < 6; step += 1) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
