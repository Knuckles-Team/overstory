/**
 * @file graphFacts.ts
 * @description The typed graph facts the city is derived from
 * (OVERSTORY-CITY-R035). The shapes mirror what the served neighbourhood
 * read returns (R021). The bundled neighbourhood is a labelled simulated
 * fixture with neutral ids: it exists so the derivation is testable and so
 * the city has something honest to show when the served read is absent. It
 * names no user, business, product or connector.
 */

/** One graph node: a fact with a class, a domain and a creation sequence. */
export interface GraphNode {
  id: string
  /** The ontology class; the mapping registry (R035) turns it into a form. */
  cls: string
  label: string
  /** The business domain: the zoning key. */
  domain: string
  /** The owner node (organization for a connector, connector for an app). */
  parent?: string
  /** Importance; heavier nodes grow taller. */
  weight: number
  /** Creation sequence: growth processes nodes in this order (R039). */
  seq: number
}

/** One graph edge: a relationship the road network is built from. */
export interface GraphEdge {
  id: string
  from: string
  to: string
  /** The relationship kind (see the road-class table, R036). */
  kind: string
  /** The edge weight or observed traffic. */
  weight: number
}

/** The stored memory counts per modality (the Hall of Records, R038). */
export interface RecordCount {
  modality: string
  count: number
}

export interface GraphFacts {
  /** Always `simulated` for the bundled neighbourhood; `live` when served. */
  provenance: 'simulated' | 'live'
  nodes: GraphNode[]
  edges: GraphEdge[]
  records: RecordCount[]
}

let seq = 0
function n(id: string, cls: string, domain: string, weight: number, parent?: string): GraphNode {
  return { id, cls, label: id, domain, parent, weight, seq: seq++ }
}

/** The labelled bundled neighbourhood: neutral ids, covers every starting class. */
export const BUNDLED_FACTS: GraphFacts = {
  provenance: 'simulated',
  nodes: [
    n('org-1', 'Organization', 'ops', 5),
    n('org-2', 'Organization', 'data', 3),
    n('conn-1', 'Connector', 'ops', 4, 'org-1'),
    n('conn-2', 'Connector', 'data', 3, 'org-2'),
    n('conn-3', 'Connector', 'data', 2, 'org-2'),
    n('app-1', 'ConnectorApp', 'ops', 2, 'conn-1'),
    n('app-2', 'ConnectorApp', 'ops', 1, 'conn-1'),
    n('agent-1', 'Agent', 'ops', 2, 'org-1'),
    n('agent-2', 'Agent', 'data', 1, 'org-2'),
    n('skill-1', 'Skill', 'ops', 1, 'org-1'),
    n('flow-1', 'Workflow', 'data', 2, 'org-2'),
    n('doc-1', 'Document', 'data', 1, 'org-2'),
    n('series-1', 'TimeSeries', 'data', 2, 'org-2'),
    n('mail-1', 'Message', 'ops', 1, 'org-1'),
  ],
  edges: [
    { id: 'e1', from: 'conn-1', to: 'app-1', kind: 'contains', weight: 5 },
    { id: 'e2', from: 'conn-1', to: 'app-2', kind: 'contains', weight: 1 },
    { id: 'e3', from: 'agent-1', to: 'conn-1', kind: 'uses', weight: 8 },
    { id: 'e4', from: 'agent-2', to: 'conn-2', kind: 'uses', weight: 2 },
    { id: 'e5', from: 'agent-1', to: 'conn-2', kind: 'uses', weight: 1 },
    { id: 'e6', from: 'flow-1', to: 'skill-1', kind: 'invokes', weight: 3 },
    { id: 'e7', from: 'doc-1', to: 'series-1', kind: 'relates', weight: 1 },
    { id: 'e8', from: 'mail-1', to: 'agent-1', kind: 'notifies', weight: 4 },
  ],
  records: [
    { modality: 'graph', count: 120 },
    { modality: 'document', count: 40 },
    { modality: 'vector', count: 300 },
    { modality: 'timeseries', count: 15 },
    { modality: 'media', count: 5 },
  ],
}
