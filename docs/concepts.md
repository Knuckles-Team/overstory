# Concept Registry — overstory

> **Prefix**: `CONCEPT:OVERSTORY-*`
> **Version**: 0.17.0
> **Bridge**: [`CONCEPT:MERISTEM-ECO.messaging.native-backend-abstraction`](https://github.com/Knuckles-Team/meristem/blob/main/docs/concepts.md) (Unified Toolkit Ingestion)

---

## Project-Specific Concepts

| Concept ID | Name | Description |
|------------|------|-------------|
| `CONCEPT:WU-OS.governance.webui` | Core API Client | Primary API client for Arbora for Pydantic AI Agents |
| `CONCEPT:WU-OS.governance.webui-2` | MCP Server | Model Context Protocol server entry point |
| `CONCEPT:WU-OS.governance.webui-3` | A2A Agent | Agent-to-Agent protocol server |

## Cross-Project References (from meristem)

| Concept ID | Name | Origin |
|------------|------|--------|
| `CONCEPT:MERISTEM-ECO.messaging.native-backend-abstraction` | Unified Toolkit Ingestion | meristem |
| `CONCEPT:MERISTEM-ORCH.adapter.hot-cache-invalidation` | Confidence-Gated Router | meristem |
| `CONCEPT:MERISTEM-OS.config.secrets-authentication` | Prompt Injection Defense | meristem |
| `CONCEPT:MERISTEM-OS.state.cognitive-scheduler-preemption` | Cognitive Scheduler | meristem |
| `CONCEPT:MERISTEM-OS.governance.reactive-multi-axis-budget` | Guardrail Engine | meristem |
| `CONCEPT:MERISTEM-OS.governance.wasm-micro-agent-sandbox` | Audit Logging | meristem |
| `CONCEPT:MERISTEM-KG.query.object-graph-mapper` | Knowledge Graph Core | meristem |

## Synergy with meristem

This project integrates with `meristem` via `CONCEPT:MERISTEM-ECO.messaging.native-backend-abstraction` (Unified Toolkit Ingestion). The `overstory` MCP server registers its tools with the meristem FastMCP middleware, enabling automatic discovery, telemetry, and Knowledge Graph ingestion of all OVERSTORY-* concepts.
