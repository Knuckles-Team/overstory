# Research: graph exploration comparison

This record compares the graph viewer of a lakehouse ontology tool with the rows of `OVERSTORY-APPS-R030.10` to `R030.13`. The comparison names the source because it is research and holds no requirement.

## What the source builds

- The instance viewer uses a WebGL renderer over an in-memory graph model with a force layout. It runs 100 layout iterations on first load and 30 on a group toggle.
- It saves positions before a group toggle and re-places new nodes near their neighbors with a 40-unit jitter. It does not tween: a toggle redraws the layout.
- It collapses nodes into group super-nodes and cluster super-nodes. A double click expands one. There is no growth animation.
- The only animated motion is a 400 ms camera move to a selected node and its neighbors, and 160 ms fades of side panels.
- A node reducer applies type filters, highlight rings, a community color mode, a five-step metric heat scale and a shape-validity ring.
- It detects communities in the browser and ranks nodes by degree, PageRank and betweenness in the browser. It finds paths and shows them by highlight.
- A second viewer uses SVG with a force simulation for smaller graphs, with drag, pin and zoom.

## Where the rows go further

| Source behavior | Row |
|---|---|
| Layout redraw with no tween | R030.10.2 tweens every node over 600 ms, seeds from current positions and runs the layout in a worker |
| Double click toggles a super-node | R030.10.3 grows neighbors at the clicked node with staggered scale and fade; R030.10.4 collapses back with a reverse tween |
| 400 ms camera move only | R030.10.5 adds hover and select fades of the non-neighborhood and a cross-fade between nodes |
| No interruption model, no reduced motion | R030.10.6 samples the running tween, commits state first and keeps feedback with motion off |
| Browser computes communities and metrics | R030.12 asks the engine; the browser only draws |
| Loads the whole graph | R030.10.3 reads one bounded neighborhood per click through `eg.graph.GetNeighborhood` (MEDULLA-DURABLE-KERNEL-R876) |
| Color by node type string | R030.11 colors by ontology class that rolls up to a core class, with shape and legend as extra channels |
| No stated scale limits | R030.13 sets budgets, a worker layout, label and edge thinning and a clustered start |

## Capability map of the whole tool

| Capability of the source | Owner and row |
|---|---|
| Ontology generation from table metadata | MEDULLA-INGEST-WORKER-R002 (drafts checked before admission); MEDULLA-DECISION-ENGINE-R033 |
| Mapping from tables to graph | MEDULLA-UNIFIED-DATA-PLANE-R005 (relational mappings to virtual graphs) |
| Triple store in the lakehouse | One engine with virtual graph sources: MEDULLA-UNIFIED-DATA-PLANE; no second store |
| Standards ontology import | MEDULLA-TYPED-PACKS (pack import and roll-up) |
| Business glossary | MEDULLA-TYPED-PACKS-R801 |
| Reasoning | MEDULLA-FEDERATED-QUERY, MEDULLA-DECISION-ENGINE-R048 and R109 |
| Shape validation and data quality | MEDULLA-FEDERATED-QUERY-R005.1; ring in R030.12.4 |
| Community detection | MEDULLA-FEDERATED-QUERY-R060 and R063; overlay in R030.12.2 |
| Centrality and path finding | engine compute operations; overlays in R030.12.2 and R030.12.3 |
| Cohorts | MEDULLA-UNIFIED-DATA-PLANE-R701 |
| Tool server for assistants | ARBORA-FLEET (intent tools) and ARBORA-OPS |
| Graph viewer | R030.10 to R030.13 |
| Visual rule editor and visual mapping designer | No row. These are candidates for a later owner decision. |
