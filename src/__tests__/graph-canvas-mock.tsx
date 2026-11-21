interface CanvasProps {
  nodes: { id: string; labels: string[] }[]
  onAddNode: (labels: string[], properties: Record<string, unknown>) => void
  onDeleteNode: (id: string) => void
  onUpdateNode: (id: string, properties: Record<string, unknown>) => void
}

export function MockCanvas({ nodes, onAddNode, onDeleteNode, onUpdateNode }: CanvasProps) {
  return (
    <div>
      <ul aria-label="canvas nodes">
        {nodes.map((node) => (
          <li key={node.id}>{node.id}</li>
        ))}
      </ul>
      <button
        onClick={() => {
          onDeleteNode('node1')
        }}
      >
        mock-delete
      </button>
      <button
        onClick={() => {
          onAddNode(['Concept'], { name: 'fresh' })
        }}
      >
        mock-add
      </button>
      <button
        onClick={() => {
          onUpdateNode('node1', { name: 'renamed' })
        }}
      >
        mock-update
      </button>
    </div>
  )
}

export const canvasModule = () => ({ GraphCanvas: MockCanvas })
