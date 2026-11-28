# OVERSTORY-CITYHOST — Overstory hosts the arbora-city package

Owner: overstory. Cross-repo IDs: `CITY-PACKAGE-R001.1`, `CITY-PACKAGE-R001.4`, `CITY-PACKAGE-R002.1`, `CITY-PACKAGE-R002.3`, `CITY-PACKAGE-R003.3`, `CITY-SOURCE-R001.3`, `CITY-SOURCE-R002`, `CITY-RUNTIME-R001.3`.
Public provenance: this specification. All required detail is below.

## Delivery mapping

Component: Arbora City host page
Depends-on: CITY-PACKAGE-R001.4, CITY-SOURCE-R002, CITY-PACKAGE-R002.1

## Outcome

The city engine lives in the arbora-city package. Overstory keeps the page shell, the navigation, the WebMCP tools and the host gateway that carries the city's Arbora operations. The city page is cross-origin isolated so the engine can share snapshots between threads, and every other page behaves as before.

## User Scenarios & Testing

### User Story 1 - The city opens inside overstory from the package (Priority: P1)

An operator opens Arbora City from the navigation. They see the same city that every other host shows, because one package draws it.

**Acceptance Scenarios**:

1. **Given** a signed-in operator, **When** they open `/apps/city`, **Then** the page mounts the package engine over the Arbora source and the kit from `/city-kit/`.
2. **Given** the city page, **When** the operator leaves it, **Then** the engine and the source are disposed once.

### User Story 2 - The city reaches Arbora only through the host (Priority: P1)

The browser never talks to Arbora directly. The host carries only the operations the package lists, and strips secrets.

**Acceptance Scenarios**:

1. **Given** the city page, **When** the engine reads `events.list`, **Then** the host calls Arbora as the bound actor and returns the result.
2. **Given** a request for an unlisted operation, **When** it reaches the host, **Then** the host refuses `OP_NOT_ALLOWED` and calls nothing.

### User Story 3 - The city page is isolated and other pages are not (Priority: P2)

The engine needs shared memory for smooth frames. Other pages hold MCP App frames and popups that isolation would break.

**Acceptance Scenarios**:

1. **Given** the built server, **When** the operator opens `/apps/city`, **Then** `crossOriginIsolated` is true.
2. **Given** the city page, **When** the operator follows the nav link to `/chat`, **Then** a new document loads and it is not isolated.

### User Story 4 - The cutover leaves no second copy (Priority: P2)

A maintainer must find the city code in one place. Old trailers must still resolve.

**Acceptance Scenarios**:

1. **Given** the cutover commit, **When** the spec gates run, **Then** no `OVERSTORY-CITY-` row remains and every old ID resolves through an alias.

### Edge Cases

- A build without the package operation list refuses every city call with `UNAVAILABLE`.
- A failed live read shows `Degraded`, never the demo city.
- A browser without `SharedArrayBuffer` support uses `transfer` snapshots on the same page.
- An external source added to the CSP settings must answer with CORS or a cross-origin resource policy on the city page.

## Requirements

- **FR-001**: The city route, its surface and its sandbox stay in overstory. Rows: `OVERSTORY-CITYHOST-R001`, `OVERSTORY-CITYHOST-R001.1`.
- **FR-002**: Overstory depends on the package and fetches the kit at build. Rows: `OVERSTORY-CITYHOST-R002`.
- **FR-003**: The page mounts and disposes the engine with one call each. Rows: `OVERSTORY-CITYHOST-R003`.
- **FR-004**: The browser transport posts to the host gateway only. Rows: `OVERSTORY-CITYHOST-R004`.
- **FR-005**: Every operator capability is a WebMCP tool over the engine handle. Rows: `OVERSTORY-CITYHOST-R005`.
- **FR-006**: The gateway allowlists the package operations and strips secret-named keys. Rows: `OVERSTORY-CITYHOST-R006`, `OVERSTORY-CITYHOST-R006.1`.
- **FR-007**: Only the city document is cross-origin isolated. Rows: `OVERSTORY-CITYHOST-R007`, `OVERSTORY-CITYHOST-R007.1`, `OVERSTORY-CITYHOST-R007.2`, `OVERSTORY-CITYHOST-R007.3`, `OVERSTORY-CITYHOST-R007.4`.
- **FR-008**: The moved code and specs leave overstory with one alias per row. Rows: `OVERSTORY-CITYHOST-R008`.

## Success Criteria

- **SC-001**: On the city page `crossOriginIsolated` is true; on every other page it is false. Rows: `OVERSTORY-CITYHOST-R007.4`.
- **SC-002**: Zero operations outside the package list reach Arbora. Rows: `OVERSTORY-CITYHOST-R006`.
- **SC-003**: Zero engine files remain in overstory after the cutover. Rows: `OVERSTORY-CITYHOST-R008`.

## Assumptions

- arbora-city publishes `0.1.0` with the exports of `CITY-PACKAGE-R001.1` before `R002` lands.
- The engine reports `snapshotTransport` in `PerfSample` (`CITY-RUNTIME-R001.3`).
- Every asset the city page loads is same-origin, as the CSP already requires.

## Why a new spec

`OVERSTORY-CITY` described the engine, the scene library and the host together. The engine moved to arbora-city (`CITY-PACKAGE-R002`). The host part needs its own spec so the cutover can delete `specs/arbora-city/` in one change. The search `git grep -n "apps/city\|scene3d\|city-assets" -- specs` found the host rows `OVERSTORY-CITY-R001`, `R001.1`, `R003`, `R016`, `R017`, `R018` and `R034`, and the `OVERSTORY-DESIGN-R012` test-spec entries. This spec restates the host rows against the package, and `R008` aliases each one here.

## Scope and interfaces

Owned: the route and surface, the sandbox posture, the package dependency and kit fetch, the mount and dispose, the browser transport, the WebMCP tools, the host gateway, the isolation headers and the navigation boundary, and the cutover. Not owned: the engine, the sources, the operation list and the kit (arbora-city), and the operations (arbora).
