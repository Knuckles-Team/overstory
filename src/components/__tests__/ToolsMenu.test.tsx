import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement } from 'react'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { getToolIcon } from '@/lib/tool-icons'

import { ToolsMenu, updateEnabledTools } from '../ToolsMenu'

const TOOLS = [
  { id: 'web_search', name: 'Web search' },
  { id: 'code_execution', name: 'Code execution' },
  { id: 'image_generation', name: 'Image generation' },
  { id: 'custom_thing', name: 'Custom thing' },
]

function Harness() {
  const [enabled, setEnabled] = useState<string[]>(['web_search'])
  return (
    <TooltipProvider>
      <ToolsMenu availableTools={TOOLS} enabledTools={enabled} setEnabledTools={setEnabled} />
    </TooltipProvider>
  )
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Configure tools' }))
}

function iconType(id: string): unknown {
  return (getToolIcon(id) as ReactElement).type
}

describe('ToolsMenu', () => {
  // spec: OVERSTORY-DESIGN-R014
  it('renders_icon_left_switch_right', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openMenu(user)
    const rows = screen.getAllByRole('menuitemcheckbox')
    expect(rows).toHaveLength(TOOLS.length)
    for (const row of rows) {
      expect(row.querySelector('svg')).not.toBeNull()
      expect(row.querySelector('[data-slot="switch"]')).not.toBeNull()
      expect(row.firstElementChild?.querySelector('svg')).not.toBeNull()
      expect(row.lastElementChild).toHaveAttribute('data-slot', 'switch')
    }
    expect(rows[0]).toHaveAttribute('aria-checked', 'true')
    expect(rows[1]).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  // spec: OVERSTORY-DESIGN-R014
  it('toggles_a_tool_and_keeps_menu_open', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openMenu(user)
    const row = screen.getByRole('menuitemcheckbox', { name: /Code execution/ })
    await user.click(row)
    expect(screen.getByRole('menuitemcheckbox', { name: /Code execution/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(TOOLS.length)
  })

  // spec: OVERSTORY-DESIGN-R014
  it('uses_known_icons_and_wrench_fallback', () => {
    const known = ['web_search', 'code_execution', 'image_generation'].map((id) => iconType(id))
    expect(new Set(known).size).toBe(3)
    const fallback = iconType('custom_thing')
    expect(known).not.toContain(fallback)
    expect(iconType('another_unknown')).toBe(fallback)
  })

  // spec: OVERSTORY-DESIGN-R014
  it('renders_nothing_without_tools_and_helper_is_pure', () => {
    const { container } = render(
      <TooltipProvider>
        <ToolsMenu availableTools={[]} enabledTools={[]} setEnabledTools={() => undefined} />
      </TooltipProvider>,
    )
    expect(container).toBeEmptyDOMElement()
    expect(updateEnabledTools(['a'], 'a', false)).toEqual([])
    expect(updateEnabledTools(['a'], 'a', true)).toEqual(['a'])
  })
})
