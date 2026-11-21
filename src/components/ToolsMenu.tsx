import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Settings2Icon } from 'lucide-react'

import { PromptInputButton } from '@/components/ai-elements/prompt-input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getToolIcon } from '@/lib/tool-icons'

/** Built-in tool metadata reported by the backend configuration. */
export interface BuiltinTool {
  name: string
  id: string
}

export function updateEnabledTools(enabled: string[], toolId: string, checked: boolean): string[] {
  if (!checked) return enabled.filter((id) => id !== toolId)
  return enabled.includes(toolId) ? enabled : [...enabled, toolId]
}

interface ToolsMenuProps {
  availableTools: BuiltinTool[]
  enabledTools: string[]
  setEnabledTools: Dispatch<SetStateAction<string[]>>
}

/** The per-model tools dropdown in the composer toolbar: icon on the left, switch on the right. */
export function ToolsMenu({ availableTools, enabledTools, setEnabledTools }: ToolsMenuProps): ReactNode {
  if (availableTools.length === 0) return null
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <PromptInputButton variant="outline" aria-label="Configure tools">
              <Settings2Icon className="size-4" />
            </PromptInputButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Tools</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        {availableTools.map((tool) => (
          <DropdownMenuSwitchItem
            key={tool.id}
            checked={enabledTools.includes(tool.id)}
            onCheckedChange={(checked) => {
              setEnabledTools((prev) => updateEnabledTools(prev, tool.id, checked))
            }}
            onSelect={(event) => {
              event.preventDefault()
            }}
          >
            <span aria-hidden="true">{getToolIcon(tool.id)}</span>
            <span className="text-sm">{tool.name}</span>
          </DropdownMenuSwitchItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
