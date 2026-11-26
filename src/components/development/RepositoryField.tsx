import { useState, type SyntheticEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** A repository name as arbora bounds it: 1 to 256 characters. */
export function validRepository(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length >= 1 && trimmed.length <= 256 ? trimmed : null
}

/** Asks which repository a development view reads; sends nothing until submitted. */
export function RepositoryField({
  onSelect,
  label = 'Repository',
}: {
  onSelect: (repository: string) => void
  label?: string
}) {
  const [value, setValue] = useState('')
  function submit(event: SyntheticEvent) {
    event.preventDefault()
    const repository = validRepository(value)
    if (repository) onSelect(repository)
  }
  return (
    <form className="flex items-center gap-2" onSubmit={submit}>
      <Input
        aria-label={label}
        placeholder="owner/name"
        value={value}
        maxLength={256}
        onChange={(event) => {
          setValue(event.target.value)
        }}
        className="h-9 max-w-sm"
      />
      <Button type="submit" size="sm" disabled={validRepository(value) === null}>
        Load
      </Button>
    </form>
  )
}
