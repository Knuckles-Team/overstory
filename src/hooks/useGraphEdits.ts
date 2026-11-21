import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import type { GraphNode, GraphRelationship } from '@/components/knowledge-graph/graph-read'
import { sendGraphEdit, type GraphEditLogEntry, type GraphEditRequest, type GraphEditResult } from '@/lib/graph-edit'

interface Options {
  setNodes: Dispatch<SetStateAction<GraphNode[]>>
  setRelationships: Dispatch<SetStateAction<GraphRelationship[]>>
}

/**
 * Graph edit handlers that go through Arbora. Local state follows the engine
 * verdict: a node changes only after an `applied` verdict, a refusal leaves it
 * untouched and shows the engine's reason, and every edit is logged.
 */
export function useGraphEdits({ setNodes, setRelationships }: Options) {
  const [log, setLog] = useState<GraphEditLogEntry[]>([])
  const [lastResult, setLastResult] = useState<GraphEditResult | null>(null)
  const sequence = useRef(0)

  const submit = useCallback(async (request: GraphEditRequest): Promise<GraphEditResult> => {
    const result = await sendGraphEdit(request)
    sequence.current += 1
    setLog((prev) => [{ sequence: sequence.current, request, result }, ...prev])
    setLastResult(result)
    if (result.verdict !== 'applied') toast.error(`Edit ${result.verdict}: ${result.reason}`)
    return result
  }, [])

  const onUpdateNode = useCallback(
    (id: string, properties: Record<string, unknown>) => {
      void submit({ kind: 'update', id, properties }).then((result) => {
        if (result.verdict !== 'applied') return
        setNodes((prev) =>
          prev.map((n) => (n.id === id ? { ...n, properties: { ...n.properties, ...properties } } : n)),
        )
      })
    },
    [submit, setNodes],
  )

  const onDeleteNode = useCallback(
    (id: string) => {
      void submit({ kind: 'delete', id }).then((result) => {
        if (result.verdict !== 'applied') return
        setNodes((prev) => prev.filter((n) => n.id !== id))
        setRelationships((prev) => prev.filter((e) => e.source !== id && e.target !== id))
      })
    },
    [submit, setNodes, setRelationships],
  )

  const onAddNode = useCallback(
    (labels: string[], properties: Record<string, unknown>) => {
      void submit({ kind: 'add', labels, properties }).then((result) => {
        const id = result.id
        if (result.verdict !== 'applied' || !id) return
        setNodes((prev) => [...prev, { id, labels, properties }])
      })
    },
    [submit, setNodes],
  )

  return { onUpdateNode, onDeleteNode, onAddNode, log, lastResult }
}
