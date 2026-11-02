# OVERSTORY data model

The app holds no store. These types define the contracts of the rows.

| Type | File | Fields | Row |
|---|---|---|---|
| `ChartSeriesInput` | src/apps/markets/chart-contract.ts | line points or complete OHLC bars | OVERSTORY-R002.1 |
| `VersionedOverlay` | src/apps/markets/chart-contract.ts | kind, strategy version, simulation flag | OVERSTORY-R002.1 |
| `ChartOverlay` | src/apps/markets/overlay-strategy.ts | kind, bar time, version, simulated | OVERSTORY-R010.1 |
| `PerformanceCard` | src/apps/markets/performance-card.ts | decimal string, method, currency, source, as-of | OVERSTORY-R011.1 |
| `StrategyRecommendation` | src/apps/markets/strategy-view.ts | evidence references or abstain reason | OVERSTORY-R012.1 |
| `DeliveryReceipt` | src/apps/markets/delivery-state.ts | event ID, state, channel | OVERSTORY-R013.1 |
| `CsvImportPreview` | src/apps/markets/csv-import.ts | digest, mapping, errors, counts | OVERSTORY-R014.1 |
| `CacheView` | src/apps/markets/offline-cache.ts | fact, stale flag, actions enabled | OVERSTORY-R015.1 |
