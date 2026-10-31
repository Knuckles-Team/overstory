# Concept Registry — overstory

> **Prefix**: `CONCEPT:OVERSTORY-*`
> **Version**: 0.17.0
> **Bridge**: [`CONCEPT:MERISTEM-ECO.messaging.native-backend-abstraction`](https://github.com/Knuckles-Team/agent-utilities/blob/main/docs/concepts.md) (Unified Toolkit Ingestion)

---

## Project-Specific Concepts

| Concept ID | Name | Description |
|------------|------|-------------|
| `CONCEPT:WU-OS.governance.webui` | Core API Client | Primary API client for Arbora for Pydantic AI Agents |
| `CONCEPT:WU-OS.governance.webui-2` | MCP Server | Model Context Protocol server entry point |
| `CONCEPT:WU-OS.governance.webui-3` | A2A Agent | Agent-to-Agent protocol server |

## Cross-Project References (from agent-utilities)

| Concept ID | Name | Origin |
|------------|------|--------|
| `CONCEPT:MERISTEM-ECO.messaging.native-backend-abstraction` | Unified Toolkit Ingestion | agent-utilities |
| `CONCEPT:MERISTEM-ORCH.adapter.hot-cache-invalidation` | Confidence-Gated Router | agent-utilities |
| `CONCEPT:MERISTEM-OS.config.secrets-authentication` | Prompt Injection Defense | agent-utilities |
| `CONCEPT:MERISTEM-OS.state.cognitive-scheduler-preemption` | Cognitive Scheduler | agent-utilities |
| `CONCEPT:MERISTEM-OS.governance.reactive-multi-axis-budget` | Guardrail Engine | agent-utilities |
| `CONCEPT:MERISTEM-OS.governance.wasm-micro-agent-sandbox` | Audit Logging | agent-utilities |
| `CONCEPT:MERISTEM-KG.query.object-graph-mapper` | Knowledge Graph Core | agent-utilities |

## Synergy with agent-utilities

This project integrates with `agent-utilities` via `CONCEPT:MERISTEM-ECO.messaging.native-backend-abstraction` (Unified Toolkit Ingestion). The `overstory` MCP server registers its tools with the agent-utilities FastMCP middleware, enabling automatic discovery, telemetry, and Knowledge Graph ingestion of all OVERSTORY-* concepts.
