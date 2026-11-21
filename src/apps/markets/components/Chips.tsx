/**
 * @file Chips.tsx
 * @description A labelled group of toggle chips (`aria-pressed`), used for
 * timeframes, trends, quotes and layers. Arrow keys are not trapped: each
 * chip is an ordinary button in the tab order.
 */
import { cn } from '@/lib/utils'

export interface ChipOption<T extends string> {
  value: T
  label: string
}

export function Chips<T extends string>({
  label,
  options,
  selected,
  onToggle,
  disabledReasons,
}: {
  label: string
  options: readonly ChipOption<T>[]
  selected: ReadonlySet<T>
  onToggle: (value: T) => void
  /** Options that cannot be used, each with the reason it is unavailable. */
  disabledReasons?: Partial<Record<T, string>>
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const pressed = selected.has(option.value)
        const reason = disabledReasons?.[option.value]
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            disabled={reason !== undefined}
            title={reason}
            onClick={() => {
              onToggle(option.value)
            }}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:line-through',
              pressed
                ? 'border-primary bg-primary/15 text-foreground'
                : 'border-border/60 text-muted-foreground hover:bg-accent',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
