# OVERSTORY-CITYHOST — Research

Governing plan: [plan.md](plan.md).

Decision: `Cross-Origin-Embedder-Policy: require-corp`, not `credentialless`. Rationale: `require-corp` isolates the page in every evergreen engine, and every asset the city loads is same-origin, so nothing is blocked. `credentialless` is not supported by every engine. Alternatives considered: isolating every page, which would block the MCP App frames and web previews of other pages.

Decision: a new document at the isolation boundary. Rationale: isolation is fixed when a document loads, so a client navigation can neither gain nor drop it.
