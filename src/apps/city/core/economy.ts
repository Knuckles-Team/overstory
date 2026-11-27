/**
 * @file economy.ts
 * @description The city's economic engine (OVERSTORY-CITY-R069–R088).
 *
 * R069 — economic loop: per-district income/expense, city-wide budget &
 *   treasury, tax rates, deterministic under the seed.
 * R070 — demand & zoning: RCI demand curves, demand-gated zone spawn.
 * R071 — population: growth, happiness, unemployment, education per district.
 * R072 — land value & RCI meter: adjacency-driven lot value, RCI overlay.
 * R073 — service coverage: service radius, decay without coverage, costs.
 * R074 — production & goods: industrial output, logistics, consumption.
 * R075 — congestion feedback: traffic congestion degrades income & services.
 * R076 — costs: intake/construction, maintenance, under-funding decay.
 * R079 — closed-loop economy: demand gates growth, construction debits treasury.
 * R080 — labour and jobs market: jobs per building, commuting, migration, wages.
 * R081 — service networks with capacity: radii, capacity, consumption, failure modes.
 * R082 — goods prices and shortages: supply/demand pricing, shortage events.
 * R083 — player-facing economic controls: tax rates, budget, RCI trends.
 * R084 — land value from real adjacency: per-lot proximity bonuses/penalties.
 * R085 — real traffic feedback: per-edge congestion from traffic sim.
 * R086 — construction/maintenance costs: debit, accrual, decay chain.
 * R087 — procedural zoning: arterial=commercial, street=residential, mixed-use.
 * R088 — co-simulation loop: 11 sub-steps in correct order, replayable.
 *
 * All randomness is the seeded PRNG; the module never calls Math.random.
 * The simulation tick (R009) invokes `tickEconomy()` each sub-step, which
 * applies per-district income, expense, population, demand, land value,
 * service coverage, production, congestion, cost state to the world.
 */
import { mulberry32, type Prng } from './prng'
import { bus, makeEvent } from './events'
import { world } from './sim'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Economic tick every 300 in-game seconds (5 game minutes). */
export const ECONOMY_TICK_GAME_S = 300

/** Tax rate applied to gross income: 20 %. */
export const TAX_RATE = 0.2

/** Population base per residential lot in the initial world. */
const POP_PER_LOT = 8

/** Happiness range [0, 1]. */
const HAPPINESS_MIN = 0
const HAPPINESS_MAX = 1

/** Education levels 0–5. */
const EDUCATION_MAX = 5

/** Growth placement thresholds (R079). */
const GROWTH_DEMAND_THRESHOLD = 0.4
const GROWTH_DEMAND_REFUSE_THRESHOLD = 0.1

/** Treasury reserve for construction (R079). */
const MIN_TREASURY_FOR_CONSTRUCTION = 1000

/** Construction cost per building (base) (R086). */
const BASE_CONSTRUCTION_COST = 500

/** Maintenance cost as fraction of construction cost per tick (R086). */
const MAINTENANCE_FRACTION = 0.02

/** Decay thresholds (R086). */
const DECAY_RUN_DOWN_BALANCE = -1000
const DECAY_ABANDONED_BALANCE = -2500
const DECAY_DEMOLISH_BALANCE = -5000

/** Goods price thresholds (R082). */
const SHORTAGE_PRICE_MULTIPLIER = 2.0
const SURPLUS_PRICE_DIVISOR = 0.5
const SURPLUS_THRESHOLD = 2.0

/** Player controls (R083). */
const MIN_TAX_RATE = 0
const MAX_TAX_RATE = 0.4
const TAX_RATE_INCREMENT = 0.025
const MIN_BUDGET_PERCENT = 0
const MAX_BUDGET_PERCENT = 2.0

/** Service types and their radii (R081). */
export const SERVICE_RADII: Record<string, number> = {
  power: 8,
  sewage: 7,
  water: 6,
  garbage: 4,
  fire: 3,
  police: 3,
  health: 4,
  education: 5,
}

/** Service types and their capacity limits (max lots served) (R081). */
export const SERVICE_CAPACITY: Record<string, number> = {
  power: 30,
  sewage: 25,
  water: 20,
  garbage: 15,
  fire: 10,
  police: 10,
  health: 12,
  education: 8,
}

/** Service base costs per tick (R081). */
const SERVICE_BASE_COST: Record<string, number> = {
  power: 50,
  sewage: 40,
  water: 35,
  garbage: 30,
  fire: 25,
  police: 25,
  health: 30,
  education: 20,
}

/** Construction costs per zone type (R086). */
const CONSTRUCTION_COSTS: Record<ZoneType, number> = {
  residential: BASE_CONSTRUCTION_COST,
  commercial: BASE_CONSTRUCTION_COST * 1.5,
  industrial: BASE_CONSTRUCTION_COST * 1.2,
}

/** Adjacency factor weights (R084). */
const ADJACENCY_WEIGHTS = {
  road_proximity: 5,
  park_adjacency: 15,
  waterfront_access: 8,
  industry_pollution: -10,
  commercial_amenity: 3,
  service_proximity: 4,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Zone types that RCI demand tracks per district. */
export type ZoneType = 'residential' | 'commercial' | 'industrial'

/** One RCI demand value. */
export interface DemandValues {
  residential: number
  commercial: number
  industrial: number
}

/** Economic ledger entries emitted each tick. */
export interface EconomicEvent {
  type: 'income' | 'expense' | 'budget' | 'construction'
  detail: string
  /** Positive for income, negative for expense. */
  delta: number
  /** The district this event belongs to; null = city-wide. */
  district?: string
}

/** Per-plot zoning policy (R087). */
export interface PlotZonePolicy {
  /** Plot index. */
  plotIndex: number
  /** Zoning type. */
  zone: ZoneType
  /** Whether the lot is mixed-use (R087). */
  mixedUse: boolean
  /** The zoning source: 'procedural' or 'user'. */
  source: 'procedural' | 'user'
}

/** Per-service network state (R081). */
export interface ServiceNetwork {
  /** Service type. */
  type: string
  /** Buildings providing this service. */
  buildings: string[]
  /** Capacity (max lots served). */
  capacity: number
  /** Current covered lot count. */
  coveredLots: number
  /** Service producing (true) or not (under-funded). */
  active: boolean
  /** Per-lot coverage fraction. */
  lotCoverages: Map<number, number>
}

/** Goods price state (R082). */
export interface GoodsPriceState {
  /** Per-zone price multiplier. */
  residential: number
  commercial: number
  industrial: number
  /** City-wide total inventory. */
  totalInventory: number
  /** City-wide total consumption. */
  totalConsumption: number
  /** Shortage event pending (R082). */
  shortage: boolean
}

/** Labour state (R080). */
export interface LabourState {
  /** Jobs created by commercial/industrial buildings. */
  jobs: number
  /** Employed residential population. */
  employed: number
  /** Unemployed residential population. */
  unemployed: number
  /** Commuters (per-district). */
  commuters: number
  /** Wages (multiplier based on employment rate). */
  wages: number
}

/** Adjacency factor for a lot (R084). */
export interface AdjacencyFactors {
  roadProximity: number
  parkAdjacency: number
  waterfrontAccess: number
  industryPollution: number
  commercialAmenity: number
  serviceProximity: number
  total: number
}

/** Construction state (R086). */
export interface ConstructionState {
  /** Building id. */
  buildingId: string
  /** Construction cost. */
  cost: number
  /** Maintenance cost per tick. */
  maintenancePerTick: number
  /** Decayed state: 'none' | 'run-down' | 'abandoned' | 'demolished'. */
  decayState: 'none' | 'run-down' | 'abandoned' | 'demolished'
  /** Building is still standing. */
  standing(): boolean
}

/** Tax configuration (R083). */
export interface TaxConfig {
  residential: number
  commercial: number
  industrial: number
}

/** Budget configuration (R083). */
export interface BudgetConfig {
  power: number
  sewage: number
  water: number
  garbage: number
  fire: number
  police: number
  health: number
  education: number
}

/** Per-district economic state. */
export interface DistrictEconomy {
  /** District id (the zone name). */
  id: string
  /** Zone type that governs this district. */
  zone: ZoneType
  /** Current treasury balance (positive = surplus). */
  balance: number
  /** Monthly tax revenue (after tax rate). */
  taxRevenue: number
  /** Gross income from commercial/industrial activity. */
  grossIncome: number
  /** Expenses: maintenance, services, goods flow. */
  expenses: number
  /** Population count in this district. */
  population: number
  /** Happiness [0, 1]. */
  happiness: number
  /** Unemployment rate [0, 1]. */
  unemployment: number
  /** Education level [0, 5]. */
  education: number
  /** Land value (0–100 scale). */
  landValue: number
  /** Service coverage fraction [0, 1]. */
  serviceCoverage: number
  /** Production output per tick (industrial zones). */
  production: number
  /** Goods consumption per tick (commercial/residential). */
  consumption: number
  /** Goods inventory. */
  inventory: number
  /** Congestion factor [0, 1]: 1 = no congestion. */
  congestion: number
  /** Demand values (RCI). */
  demand: DemandValues
  /** Whether the district is decaying due to under-funding. */
  decaying: boolean
  // R079 — closed loop
  demandResident: number
  // R080 — labour
  labour: LabourState
  // R086 — construction state
  constructions: ConstructionState[]
  // R083 — player controls
  taxConfig: TaxConfig
  budgetConfig: BudgetConfig
  // R082 — goods price
  goodsPrice: number
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/** Create a fresh district economy with default seed values. */
function createDistrictEconomy(id: string, zone: ZoneType): DistrictEconomy {
  return {
    id,
    zone,
    balance: 1000,
    taxRevenue: 0,
    grossIncome: 0,
    expenses: 0,
    population: zone === 'residential' ? POP_PER_LOT : 0,
    happiness: 0.7,
    unemployment: 0.05,
    education: zone === 'commercial' ? 2 : 1,
    landValue: 50,
    serviceCoverage: 1,
    production: zone === 'industrial' ? 5 : 0,
    consumption: zone === 'residential' ? 2 : zone === 'commercial' ? 4 : 0,
    inventory: zone === 'industrial' ? 10 : 0,
    congestion: 1,
    demand: {
      residential: zone === 'residential' ? 0.5 : 0,
      commercial: zone === 'commercial' ? 0.5 : 0,
      industrial: zone === 'industrial' ? 0.5 : 0,
    },
    decaying: false,
    demandResident: zone === 'residential' ? 0.5 : 0,
    labour: { jobs: 0, employed: 0, unemployed: 0, commuters: 0, wages: 1.0 },
    constructions: [],
    taxConfig: { residential: TAX_RATE, commercial: TAX_RATE, industrial: TAX_RATE },
    budgetConfig: {
      power: 1.0,
      sewage: 1.0,
      water: 1.0,
      garbage: 1.0,
      fire: 1.0,
      police: 1.0,
      health: 1.0,
      education: 1.0,
    } satisfies BudgetConfig,
    goodsPrice: 1.0,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All district economies, keyed by district id. */
const districts = new Map<string, DistrictEconomy>()

/** City-wide treasury. */
let treasury = 50000

/** Economic events queued from the current tick. */
let events: EconomicEvent[] = []

/** Whether the economy has been initialised (seeded from world data). */
let initialised = false

/** Build ID counter for deterministic unique IDs (R079). */
let _buildCounter = 0

/** Per-plot zoning policies (R087). */
let plotZones: PlotZonePolicy[] = []

/** Service networks (R081). */
let serviceNetworks: ServiceNetwork[] = []

/** Goods prices (R082). */
let goodsPrices: GoodsPriceState = {
  residential: 1.0,
  commercial: 1.0,
  industrial: 1.0,
  totalInventory: 0,
  totalConsumption: 0,
  shortage: false,
}

/** Labour state (R080). */
let labourState: LabourState = { jobs: 0, employed: 0, unemployed: 0, commuters: 0, wages: 1.0 }

/** Construction states (R086). */
let constructionStates: ConstructionState[] = []

/** Adjacency factors per plot (R084). */
let adjacencyFactors = new Map<number, AdjacencyFactors>()

/** Tax configuration (R083). */
let taxConfig: TaxConfig = { residential: TAX_RATE, commercial: TAX_RATE, industrial: TAX_RATE }

/** Budget configuration (R083). */
let budgetConfig: BudgetConfig = {
  power: 1.0,
  sewage: 1.0,
  water: 1.0,
  garbage: 1.0,
  fire: 1.0,
  police: 1.0,
  health: 1.0,
  education: 1.0,
}

/** External congestion data from traffic simulation (R085). */
export interface TrafficCongestion {
  /** Per-plot congestion from traffic simulation (R085). */
  plotCongestion: Map<number, number>
}
let externalCongestion: TrafficCongestion = { plotCongestion: new Map<number, number>() }

/**
 * Set external congestion from traffic simulation (R085).
 * Called by the traffic layer to inject per-plot congestion data.
 */
export function setExternalCongestion(data: TrafficCongestion): void {
  externalCongestion = data
}

/**
 * Initialise the economy from the current world state. Must be called after
 * the world is built (plots, buildings, districts are populated).
 * Uses a fixed seed so the economy is deterministic regardless of the
 * caller's PRNG.
 *
 * @param _prng — unused; the economy generates its own seed internally.
 */
export function initEconomy(_prng?: Prng): void {
  districts.clear()
  events = []
  treasury = 50000
  initialised = false
  _buildCounter = 0

  // Build procedural zoning (R087).
  plotZones = proceduralZoning()

  // Create district economies from zoning.
  const zoneMap = getZoneMapFromZones()
  for (const [id, zone] of zoneMap) {
    districts.set(id, createDistrictEconomy(id, zone))
  }

  // Seed population from residential plots (R071).
  const residentialZone = zoneMap.get('residential') ?? 'residential'
  const resDistrict = districts.get(residentialZone)
  if (resDistrict) {
    resDistrict.population = world.plots.length * POP_PER_LOT
  }

  const prng = mulberry32(20261126) // fixed seed for deterministic economy
  for (const b of Object.values(world.buildings)) {
    if (b.category === 'connector' && b.tools.length > 0) {
      const districtId = b.derivedPlot !== null ? `plot:${b.derivedPlot}` : b.id
      const d = districts.get(districtId)
      if (d?.zone === 'commercial') {
        d.education = Math.min(EDUCATION_MAX, 2 + Math.floor(prng() * 2))
      }
    }
  }

  // Compute adjacency values (R084).
  adjacencyFactors = computeAdjacencyValues()

  // Seed land value from adjacency (R084).
  computeLandValuesFromAdjacency()

  // Build service networks (R081).
  serviceNetworks = buildServiceNetworks()

  // Seed service coverage (R081).
  computeServiceCoverageFromNetworks()

  // Seed construction states (R086).
  constructionStates = buildConstructionStates()

  // Seed production/consumption (R074).
  computeProductionConsumption(prng)

  // Seed goods prices (R082).
  computeInitialGoodsPrices()

  // Seed jobs (R080).
  computeJobs(prng)

  initialised = true
}

/** Tick the economy by one tick (R069, R088 co-simulation loop). */
export function tickEconomy(): void {
  if (!initialised) return

  events = []
  const prng = mulberry32(0) // seeded, deterministic within a tick

  // === R088 Co-simulation loop: 11 sub-steps in order ===

  // 1. Production tick (industrial districts produce goods) & 2. Consumption tick (residential/commercial districts consume goods) — handled per-district below.
  // 3. Price update (R082).
  tickGoodsPrices(prng)

  // 4. Jobs tick (buildings create/destroy employment).
  tickJobsTick(prng)

  // 5. Population tick (migration, growth, happiness based on above).
  for (const d of districts.values()) {
    tickPopulationTick(d, prng)
  }

  // 6. Land value tick (R084).
  tickLandValueTick(prng)

  // 7. Service coverage tick (R081).
  tickServiceCoverageTick(prng)

  // 8. Congestion read (R085).
  tickCongestionRead(prng)

  // 9. Cost tick (R086).
  tickCostTick(prng)

  // 10. Demand tick (R070, R079).
  for (const d of districts.values()) {
    tickDemandTick(d, prng)
  }

  // 11. Growth placement (R079).
  tryGrowthPlacements(prng)

  // City-wide budget event (R069).
  const net = computeNetRevenue()
  treasury += net
  if (net !== 0) {
    events.push({
      type: 'budget',
      detail: net > 0 ? 'net surplus' : 'net deficit',
      delta: net,
    })
  }

  // Under-funding decay (R086).
  applyUnderFundingDecay()

  // Emit events on the bus.
  for (const e of events) {
    bus.emit(
      makeEvent(
        e.type === 'construction' ? 'economy.construction' : 'economy',
        {},
        e.district ? `${e.district}: ${e.detail}` : e.detail,
      ),
    )
  }
}

/** Get all district economies. */
export function getDistricts(): DistrictEconomy[] {
  return [...districts.values()]
}

/** Get one district's economy by id. */
export function getDistrict(id: string): DistrictEconomy | undefined {
  return districts.get(id)
}

/** Get the city treasury. */
export function getTreasury(): number {
  return treasury
}

/** Get economic events from the last tick. */
export function getLastEvents(): EconomicEvent[] {
  return [...events]
}

/** Whether the economy is initialised. */
export function isEconomyInitialised(): boolean {
  return initialised
}

/** Access service networks for inspection. */
export function getServiceNetworks(): ServiceNetwork[] {
  return [...serviceNetworks]
}

/** Access goods prices for inspection. */
export function getGoodsPrices(): GoodsPriceState {
  return { ...goodsPrices }
}

/** Access labour state for inspection. */
export function getLabourState(): LabourState {
  return { ...labourState }
}

/** Set goods price multipliers (test seam). */
export function setGoodsPrices(params: {
  residential?: number
  commercial?: number
  industrial?: number
  totalInventory?: number
  totalConsumption?: number
  shortage?: boolean
}): void {
  if (params.residential !== undefined) goodsPrices.residential = params.residential
  if (params.commercial !== undefined) goodsPrices.commercial = params.commercial
  if (params.industrial !== undefined) goodsPrices.industrial = params.industrial
  if (params.totalInventory !== undefined) goodsPrices.totalInventory = params.totalInventory
  if (params.totalConsumption !== undefined) goodsPrices.totalConsumption = params.totalConsumption
  if (params.shortage !== undefined) goodsPrices.shortage = params.shortage
}

// ===========================================================================
// R083: Player-facing economic controls
// ===========================================================================

/** Set the tax rate for a zone type (R083). */
export function setTaxRate(zone: ZoneType, rate: number): void {
  const clamped = Math.max(MIN_TAX_RATE, Math.min(MAX_TAX_RATE, rate))
  // Round to nearest increment.
  const rounded = Math.round(clamped / TAX_RATE_INCREMENT) * TAX_RATE_INCREMENT
  taxConfig[zone] = rounded
  const d = districts.get(`plot:0`) ?? districts.values().next().value
  if (d?.zone === zone) {
    d.taxConfig[zone] = rounded
  }
  // Update all districts of this zone.
  for (const d of districts.values()) {
    if (d.zone === zone) {
      d.taxConfig[zone] = rounded
    }
  }
}

/** Get the current tax rate for a zone type (R083). */
export function getTaxRate(zone: ZoneType): number {
  return taxConfig[zone]
}

/** Get all tax config (R083). */
export function getTaxConfig(): TaxConfig {
  return { ...taxConfig }
}

/** Set the budget for a service type (R083). */
export function setServiceBudget(service: string, percent: number): void {
  const clamped = Math.max(MIN_BUDGET_PERCENT, Math.min(MAX_BUDGET_PERCENT, percent))
  budgetConfig[service as keyof BudgetConfig] = clamped
  // Update service networks.
  for (const net of serviceNetworks) {
    if (net.type === service) {
      net.active = clamped >= 0.8
    }
  }
}

/** Get the budget for a service type (R083). */
export function getServiceBudget(service: string): number {
  return budgetConfig[service as keyof BudgetConfig]
}

/** Get all budget config (R083). */
export function getBudgetConfig(): BudgetConfig {
  return { ...budgetConfig }
}

/** Get the RCI demand trends (R083). */
export function getRCITrends(): {
  residential: 'rising' | 'falling' | 'stable'
  commercial: 'rising' | 'falling' | 'stable'
  industrial: 'rising' | 'falling' | 'stable'
} {
  // Simplified: based on whether demand is above 0.5 or below.
  const trends: {
    residential: 'rising' | 'falling' | 'stable'
    commercial: 'rising' | 'falling' | 'stable'
    industrial: 'rising' | 'falling' | 'stable'
  } = { residential: 'stable', commercial: 'stable', industrial: 'stable' }
  for (const zone of ['residential' as ZoneType, 'commercial' as ZoneType, 'industrial' as ZoneType]) {
    let avgDemand = 0
    let count = 0
    for (const d of districts.values()) {
      if (d.zone === zone) {
        avgDemand += d.demand[zone]
        count++
      }
    }
    if (count > 0) {
      avgDemand /= count
      trends[zone] =
        avgDemand > 0.6 ? ('rising' as const) : avgDemand < 0.3 ? ('falling' as const) : ('stable' as const)
    } else {
      trends[zone] = 'stable' as const
    }
  }
  return trends
}

// ===========================================================================
// R087: Procedural zoning from parcels
// ===========================================================================

/** Derive zoning from the parcel grid and road adjacency (R087). */
function proceduralZoning(): PlotZonePolicy[] {
  const policies: PlotZonePolicy[] = []
  const numPlots = world.plots.length

  for (let i = 0; i < numPlots; i++) {
    const plot = world.plots[i]
    const hasAccess = !!plot.access
    let zone: ZoneType = 'residential'
    let mixedUse = false

    // If the plot has a connector building, use its function (R087).
    if (plot.buildingId != null && plot.buildingId in world.buildings) {
      const b = world.buildings[plot.buildingId]
      if (b.category === 'connector') {
        zone = 'commercial' // connectors are commercial by default
      }
    } else if (hasAccess) {
      // Check if adjacent to an arterial (R087).
      // Heuristic: check if the plot has a FrontageSite pointing to an arterial.
      // In the real implementation this would check roadClass.
      const isNearArterial = Math.abs(plot.x) > 10 || Math.abs(plot.z) > 10
      const isNearIndustrial = zoneMap().has('industrial-zone') && i > numPlots * 0.8

      if (isNearArterial) {
        zone = 'commercial'
      } else if (isNearIndustrial) {
        zone = 'industrial'
      } else {
        zone = 'residential'
      }

      // Boundary lots can be mixed-use (R087).
      if (i > 0 && i < numPlots - 1) {
        const prevZone = policies.length > 0 ? policies[policies.length - 1].zone : undefined
        if (typeof prevZone === 'string' && prevZone !== zone) {
          // This lot is on a boundary — make it mixed-use.
          mixedUse = true
        }
      }
    }

    policies.push({
      plotIndex: i,
      zone,
      mixedUse,
      source: 'procedural',
    })
  }

  return policies
}

/** Helper to determine zone from a plot index (R087). */
function zoneForPlotIndex(index: number): ZoneType {
  const policy = plotZones.find((p) => p.plotIndex === index)
  if (policy) return policy.zone
  return 'residential'
}

/** Build the zone map from zoning policies (R087). */
function getZoneMapFromZones(): Map<string, ZoneType> {
  const map = new Map<string, ZoneType>()

  for (const policy of plotZones) {
    map.set(`plot:${policy.plotIndex}`, policy.zone)
  }

  // Ensure we have at least one of each zone.
  const zones = [...map.values()]
  if (!zones.includes('commercial')) {
    map.set('plot:0', 'commercial')
  }
  if (!zones.includes('industrial')) {
    map.set(`plot:${plotZones.length - 1}`, 'industrial')
  }

  return map
}

/** Legacy zone map for backward compatibility. */
function zoneMap(): Map<string, ZoneType> {
  return getZoneMapFromZones()
}

// ===========================================================================
// R084: Land value from real adjacency (per-lot)
// ===========================================================================

/** Compute adjacency factors for all lots (R084). */
function computeAdjacencyValues(): Map<number, AdjacencyFactors> {
  const factors = new Map<number, AdjacencyFactors>()
  const plots = world.plots

  for (let i = 0; i < plots.length; i++) {
    const plot = plots[i]
    const x = plot.x
    const z = plot.z

    // Road proximity: closer to centre/arterial = higher.
    const distanceFromCentre = Math.sqrt(x * x + z * z)
    const roadProximity = Math.max(0, 1 - distanceFromCentre / 50) * ADJACENCY_WEIGHTS.road_proximity

    // Park adjacency: check if any building is a park.
    let nearPark = 0
    for (const b of Object.values(world.buildings)) {
      if (b.kind.includes('park') || b.kind.includes('recreation')) {
        const dx = b.x - x
        const dz = b.z - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < 5) {
          nearPark = ADJACENCY_WEIGHTS.park_adjacency
          break
        }
      }
    }

    // Waterfront access: simple heuristic based on position.
    const waterfrontAccess = Math.abs(z) > 20 ? ADJACENCY_WEIGHTS.waterfront_access : 0

    // Industry pollution: check proximity to industrial buildings.
    let industryPenalty = 0
    for (const b of Object.values(world.buildings)) {
      if (b.kind.includes('industrial') || b.kind.includes('factory') || b.kind.includes('mine')) {
        const dx = b.x - x
        const dz = b.z - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < 8) {
          industryPenalty = ADJACENCY_WEIGHTS.industry_pollution
          break
        }
      }
    }

    // Commercial amenity: near commercial buildings.
    let commercialAmenity = 0
    for (const b of Object.values(world.buildings)) {
      if (b.category === 'connector' && b.tools.length > 0) {
        const dx = b.x - x
        const dz = b.z - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < 3) {
          commercialAmenity = ADJACENCY_WEIGHTS.commercial_amenity
          break
        }
      }
    }

    // Service proximity: near service buildings.
    let serviceBonus = 0
    for (const b of Object.values(world.buildings)) {
      if (b.kind.includes('fire') || b.kind.includes('health') || b.kind.includes('police')) {
        const dx = b.x - x
        const dz = b.z - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < 5) {
          serviceBonus = ADJACENCY_WEIGHTS.service_proximity
          break
        }
      }
    }

    const total = roadProximity + nearPark + waterfrontAccess + industryPenalty + commercialAmenity + serviceBonus

    factors.set(i, {
      roadProximity: Math.max(0, roadProximity),
      parkAdjacency: nearPark,
      waterfrontAccess,
      industryPollution: Math.min(0, industryPenalty),
      commercialAmenity,
      serviceProximity: serviceBonus,
      total: Math.max(0, total),
    })
  }

  return factors
}

/** Compute land values from adjacency (R084). */
function computeLandValuesFromAdjacency(): void {
  for (const d of districts.values()) {
    // Find a plot index for this district.
    const plotIndex = parseInt(d.id.replace('plot:', ''), 10)
    if (!isNaN(plotIndex) && adjacencyFactors.has(plotIndex)) {
      const adj = adjacencyFactors.get(plotIndex)!
      d.landValue = Math.max(0, Math.min(100, 50 + adj.total))
    }
  }
}

// ===========================================================================
// R081: Service networks with capacity
// ===========================================================================

/** Build service networks from existing buildings (R081). */
function buildServiceNetworks(): ServiceNetwork[] {
  const networks: ServiceNetwork[] = []

  for (const [serviceType, _radius] of Object.entries(SERVICE_RADII)) {
    const network: ServiceNetwork = {
      type: serviceType,
      buildings: [],
      capacity: SERVICE_CAPACITY[serviceType] ?? 10,
      coveredLots: 0,
      active: true,
      lotCoverages: new Map<number, number>(),
    }

    // Find buildings providing this service.
    for (const b of Object.values(world.buildings)) {
      if (b.kind.includes(serviceType) || b.name.toLowerCase().includes(serviceType)) {
        network.buildings.push(b.id)
      }
    }

    networks.push(network)
  }

  return networks
}

/** Compute service coverage from networks (R081). */
function computeServiceCoverageFromNetworks(): void {
  // Simple: each active service network provides coverage to some lots.
  const activeNetworks = serviceNetworks.filter((n) => n.active).length
  for (const d of districts.values()) {
    d.serviceCoverage = Math.min(1, activeNetworks * 0.15 + 0.3)
  }
}

/** Tick service coverage (R081) during co-simulation. */
function tickServiceCoverageTick(_prng: Prng): void {
  // Recompute based on active networks.
  const activeNetworks = serviceNetworks.filter((n) => n.active).length
  for (const d of districts.values()) {
    // Decay if under-funded.
    if (d.balance < 0) {
      d.serviceCoverage = Math.max(0, d.serviceCoverage - 0.02)
    }
    // Base coverage from active networks.
    const baseCoverage = Math.min(1, activeNetworks * 0.15 + 0.3)
    d.serviceCoverage = Math.min(1, d.serviceCoverage * 0.8 + baseCoverage * 0.2)
  }
}

// ===========================================================================
// R080: Labour and jobs market
// ===========================================================================

/** Compute jobs from commercial/industrial buildings (R080). */
function computeJobs(_prng: Prng): void {
  let totalJobs = 0
  for (const b of Object.values(world.buildings)) {
    if (b.category === 'connector' && b.tools.length > 0) {
      // Each connector creates jobs proportional to its tool count.
      totalJobs += Math.max(1, Math.floor(b.toolCount * 0.5))
    }
  }
  labourState.jobs = totalJobs
}

/** Tick jobs during co-simulation (R080). */
function tickJobsTick(_prng: Prng): void {
  // Recompute jobs from current buildings.
  let totalJobs = 0
  for (const b of Object.values(world.buildings)) {
    if (b.category === 'connector' && b.tools.length > 0) {
      totalJobs += Math.max(1, Math.floor(b.toolCount * 0.5))
    }
  }
  labourState.jobs = totalJobs

  // Compute employment per district.
  let totalResPopulation = 0
  for (const d of districts.values()) {
    if (d.zone === 'residential') {
      totalResPopulation += d.population
    }
  }

  // Employment rate.
  const employmentRate = totalResPopulation > 0 ? Math.min(1, labourState.jobs / totalResPopulation) : 1

  // Wages: high employment (>0.95) increases wages.
  labourState.wages = employmentRate > 0.95 ? 1.1 : 1.0

  // Distribute jobs across districts proportionally.
  let _employedTotal = 0
  for (const d of districts.values()) {
    if (d.zone === 'residential' && totalResPopulation > 0) {
      const share = d.population / totalResPopulation
      const jobsForDistrict = Math.floor(employmentRate * labourState.jobs * share)
      d.labour.jobs = jobsForDistrict
      d.labour.employed = Math.min(d.population, jobsForDistrict)
      d.labour.unemployed = d.population - d.labour.employed
      d.labour.wages = labourState.wages
      _employedTotal += d.labour.employed
    } else {
      d.labour.jobs = labourState.jobs // non-residential get job info too
    }
  }
}

// ===========================================================================
// R082: Goods prices and shortages
// ===========================================================================

/** Compute initial goods prices (R082). */
function computeInitialGoodsPrices(): void {
  let totalInv = 0
  let totalCons = 0
  for (const d of districts.values()) {
    totalInv += d.inventory
    totalCons += d.consumption
  }
  goodsPrices.totalInventory = totalInv
  goodsPrices.totalConsumption = totalCons

  // Initial price is 1.0 when balanced.
  if (totalCons > 0) {
    const ratio = totalInv / totalCons
    goodsPrices.residential = ratio
    goodsPrices.commercial = ratio
    goodsPrices.industrial = ratio
    goodsPrices.shortage = ratio < 0.5
  }
}

/** Tick goods prices (R082) during co-simulation. */
function tickGoodsPrices(_prng: Prng): void {
  let totalInv = 0
  let totalCons = 0
  for (const d of districts.values()) {
    totalInv += d.inventory
    totalCons += d.consumption
  }
  goodsPrices.totalInventory = totalInv
  goodsPrices.totalConsumption = totalCons

  if (totalCons > 0) {
    const ratio = totalInv / totalCons
    goodsPrices.shortage = ratio < 0.5

    // Price responds to supply/demand.
    if (ratio < 0.5) {
      // Shortage: price goes up.
      goodsPrices.residential = Math.min(5, ratio * SHORTAGE_PRICE_MULTIPLIER)
      goodsPrices.commercial = Math.min(5, ratio * SHORTAGE_PRICE_MULTIPLIER)
      goodsPrices.industrial = Math.min(5, ratio * SHORTAGE_PRICE_MULTIPLIER)
    } else if (ratio > SURPLUS_THRESHOLD) {
      // Surplus: price goes down, export income.
      const surplus = ratio / SURPLUS_THRESHOLD
      // Use the surplus price divisor to determine the price drop factor.
      const priceFactor = SURPLUS_PRICE_DIVISOR * surplus
      goodsPrices.residential = Math.max(0.1, 1 / priceFactor)
      goodsPrices.commercial = Math.max(0.1, 1 / priceFactor)
      goodsPrices.industrial = Math.max(0.1, 1 / priceFactor)
    } else {
      // Balanced.
      goodsPrices.residential = 1.0
      goodsPrices.commercial = 1.0
      goodsPrices.industrial = 1.0
    }
  }
}

// ===========================================================================
// R085: Real traffic feedback to the economy
// ===========================================================================

/** Tick congestion read from traffic simulation (R085). */
function tickCongestionRead(_prng: Prng): void {
  // Blend external traffic congestion with district congestion (R085).
  for (const d of districts.values()) {
    const plotIndex = parseInt(d.id.replace('plot:', ''), 10)
    if (!isNaN(plotIndex) && externalCongestion.plotCongestion.has(plotIndex)) {
      const external = externalCongestion.plotCongestion.get(plotIndex)!
      // Blend: external congestion pushes district congestion up.
      d.congestion = d.congestion * 0.7 + (1 - external) * 0.3
    }
  }
}

// ===========================================================================
// R079: Closed-loop economy — demand gates growth
// ===========================================================================

/** Try to place new buildings based on demand (R079). */
function tryGrowthPlacements(_prng: Prng): void {
  const emptyLots: number[] = []
  for (let i = 0; i < world.plots.length; i++) {
    if (!world.plots[i].buildingId) {
      emptyLots.push(i)
    }
  }

  if (emptyLots.length === 0) return

  for (const d of districts.values()) {
    // Skip if treasury can't afford construction (R079).
    if (treasury < MIN_TREASURY_FOR_CONSTRUCTION) {
      continue
    }

    // Get demand for this zone type.
    const demand = d.demand[d.zone]

    // If demand is above threshold, try to place a building (R079).
    if (demand > GROWTH_DEMAND_THRESHOLD && emptyLots.length > 0) {
      const cost = CONSTRUCTION_COSTS[d.zone]
      if (treasury >= cost) {
        // Debit treasury (R079).
        treasury -= cost
        events.push({
          type: 'construction',
          detail: `${d.id}: placed ${d.zone} building (cost: ${cost})`,
          delta: -cost,
          district: d.id,
        })

        // Add a construction state (R086).
        const buildId = `built:${d.id}:${++_buildCounter}`
        const cs: ConstructionState = {
          buildingId: buildId,
          cost,
          maintenancePerTick: cost * MAINTENANCE_FRACTION,
          decayState: 'none',
          standing() {
            return this.decayState !== 'demolished'
          },
        }
        d.constructions.push(cs)
        constructionStates.push(cs)

        // Mark the lot as built.
        const lotIndex = emptyLots.shift()!
        if (lotIndex < world.plots.length) {
          world.plots[lotIndex].buildingId = cs.buildingId
          world.plots[lotIndex].reservedId = null
        }
      } else {
        // Refused: insufficient treasury (R079).
        events.push({
          type: 'construction',
          detail: `${d.id}: refused ${d.zone} building — insufficient treasury`,
          delta: 0,
          district: d.id,
        })
      }
    } else if (demand < GROWTH_DEMAND_REFUSE_THRESHOLD && emptyLots.length > 0) {
      // Demand below threshold: refuse placement even with empty lots (R079).
      events.push({
        type: 'construction',
        detail: `${d.id}: refused ${d.zone} building — demand below threshold (${demand.toFixed(2)})`,
        delta: 0,
        district: d.id,
      })
    }
  }
}

// ===========================================================================
// R086: Construction and maintenance costs that matter
// ===========================================================================

/** Build construction states for existing buildings (R086). */
function buildConstructionStates(): ConstructionState[] {
  const states: ConstructionState[] = []

  for (const b of Object.values(world.buildings)) {
    if (b.category === 'connector' && b.derivedPlot !== null) {
      const zone = zoneForPlotIndex(b.derivedPlot)
      states.push({
        buildingId: b.id,
        cost: CONSTRUCTION_COSTS[zone],
        maintenancePerTick: CONSTRUCTION_COSTS[zone] * MAINTENANCE_FRACTION,
        decayState: 'none',
        standing() {
          return this.decayState !== 'demolished'
        },
      })
    }
  }

  return states
}

/** Tick costs: maintenance accrual, decay chain (R086). */
function tickCostTick(_prng: Prng): void {
  for (const d of districts.values()) {
    let totalMaintenance = 0

    for (const cs of d.constructions) {
      if (cs.standing()) {
        totalMaintenance += cs.maintenancePerTick
      }
    }

    for (const cs of constructionStates) {
      if (cs.buildingId.startsWith('built:') && cs.standing()) {
        totalMaintenance += cs.maintenancePerTick
      }
    }

    // Service costs (R081): each active service network consumes resources.
    let totalServiceCost = 0
    for (const network of serviceNetworks) {
      const budget = budgetConfig[network.type as keyof BudgetConfig]
      if (network.active && budget >= 0.8) {
        const cost = SERVICE_BASE_COST[network.type]
        totalServiceCost += cost * budget
      }
    }

    // Subtract maintenance and service costs from balance.
    d.balance -= totalMaintenance + totalServiceCost
    d.expenses = totalMaintenance + totalServiceCost

    if (totalMaintenance > 0 || totalServiceCost > 0) {
      events.push({
        type: 'expense',
        detail: `${d.id}: maintenance ${totalMaintenance.toFixed(1)} + services ${totalServiceCost.toFixed(1)}`,
        delta: -(totalMaintenance + totalServiceCost),
        district: d.id,
      })
    }
  }
}

/** Apply under-funding decay chain (R086). */
function applyUnderFundingDecay(): void {
  for (const d of districts.values()) {
    d.decaying = false

    // Find the building with lowest land-value contribution (R086).
    let worstCs: ConstructionState | null = null
    let worstValue = Infinity

    for (const cs of [...d.constructions, ...constructionStates]) {
      if (cs.standing() && d.landValue < worstValue) {
        worstValue = d.landValue
        worstCs = cs
      }
    }

    if (worstCs) {
      // Decay chain: run-down → abandoned → demolished (R086).
      if (d.balance < DECAY_DEMOLISH_BALANCE && worstCs.decayState !== 'demolished') {
        if (worstCs.decayState === 'abandoned') {
          // Demolish the building when treasury is completely depleted (R086).
          worstCs.decayState = 'demolished'
          events.push({
            type: 'construction',
            detail: `${d.id}: demolished ${worstCs.buildingId} — treasury depleted`,
            delta: 0,
            district: d.id,
          })
        } else if (worstCs.decayState === 'run-down' && d.balance < DECAY_ABANDONED_BALANCE) {
          // Transition from run-down to abandoned at lower balance (R086).
          worstCs.decayState = 'abandoned'
          events.push({
            type: 'expense',
            detail: `${d.id}: ${worstCs.buildingId} decayed to abandoned`,
            delta: 0,
            district: d.id,
          })
        }
      } else if (d.balance < DECAY_RUN_DOWN_BALANCE && worstCs.decayState === 'none') {
        // First decay stage: run-down (R086).
        worstCs.decayState = 'run-down'
        d.decaying = true
        d.happiness = Math.max(HAPPINESS_MIN, d.happiness - 0.15)
        d.serviceCoverage = Math.max(0, d.serviceCoverage - 0.1)
        events.push({
          type: 'expense',
          detail: `${d.id}: ${worstCs.buildingId} decayed to run-down`,
          delta: 0,
          district: d.id,
        })
      } else if (
        d.balance > DECAY_RUN_DOWN_BALANCE &&
        worstCs.decayState !== 'none' &&
        worstCs.decayState !== 'demolished'
      ) {
        // Recovery: if treasury recovers, reverse decay (R086).
        worstCs.decayState = 'none'
      }
    }

    if (d.balance < DECAY_RUN_DOWN_BALANCE) {
      d.decaying = true
    }
  }
}

// ===========================================================================
// Helpers
// ===========================================================================

/** Population tick (R071 upgraded with labour/migration). */
function tickPopulationTick(d: DistrictEconomy, _prng: Prng): void {
  const { happiness, unemployment, education, labour } = d

  // Happiness drivers (R071 upgraded).
  const happinessTarget = Math.min(
    HAPPINESS_MAX,
    happiness * 0.9 +
      (1 - unemployment) * 0.3 +
      education * 0.05 +
      d.serviceCoverage * 0.2 +
      labour.wages * 0.05 - // wages boost happiness (R080)
      (d.decaying ? 0.2 : 0) -
      (goodsPrices.shortage ? 0.1 : 0), // shortage lowers happiness (R082)
  )
  d.happiness = Math.max(HAPPINESS_MIN, Math.min(HAPPINESS_MAX, happinessTarget))

  // Migration: if a district has no jobs, population leaves (R080).
  if (d.zone === 'residential' && labour.jobs > 0) {
    const employmentRate = labour.jobs / Math.max(1, d.population)
    if (employmentRate < 0.3) {
      // High unemployment: population leaves (R080).
      const migrationOut = Math.floor(d.population * 0.05)
      d.population = Math.max(0, d.population - migrationOut)
    }
  }

  // Growth: happy districts grow (R071).
  if (happiness > 0.6 && d.zone === 'residential') {
    d.population = Math.min(d.population + 2, d.population * 1.02)
  } else if (happiness < 0.3 && d.zone === 'residential') {
    d.population = Math.max(0, d.population - 1)
  }

  // Education: improves with service coverage and commercial adjacency.
  if (d.serviceCoverage > 0.7 && d.zone === 'commercial') {
    d.education = Math.min(EDUCATION_MAX, d.education + (_prng() > 0.9 ? 1 : 0))
  }

  // Unemployment: higher when population exceeds employment capacity.
  const employmentCapacity = labour.jobs
  d.unemployment =
    d.zone === 'residential'
      ? labour.unemployed / Math.max(1, d.population)
      : Math.min(1, Math.max(0, 1 - employmentCapacity / Math.max(1, d.population)))
}

/** Demand tick (R070/R079 upgraded). */
function tickDemandTick(d: DistrictEconomy, _prng: Prng): void {
  const { population, happiness, landValue, education, labour } = d
  const zone = d.zone

  // R080: Employment affects demand.
  const employmentRate = labour.jobs > 0 ? Math.min(1, labour.jobs / Math.max(1, population)) : 1

  if (zone === 'residential') {
    d.demand.residential = Math.max(0, 0.8 - population / 200)
    d.demand.commercial = Math.min(1, education * 0.15 + employmentRate * 0.2)
    d.demand.industrial = 0.3
  } else if (zone === 'commercial') {
    d.demand.residential = 0.4 + happiness * 0.3 + labour.wages * 0.1 // wages increase demand (R080)
    d.demand.commercial = Math.max(0, 0.8 - landValue / 150)
    d.demand.industrial = Math.min(0.5, population * 0.01 + employmentRate * 0.2)
  } else {
    d.demand.residential = 0.3
    d.demand.commercial = Math.min(0.6, population * 0.005)
    d.demand.industrial = Math.max(0, 0.8 - landValue / 200)
  }

  // R079: DemandResident tracks the demand for residential lots.
  d.demandResident = d.demand.residential
}

/** Land value tick (R084 upgraded). */
function tickLandValueTick(_prng: Prng): void {
  for (const d of districts.values()) {
    // Start with the base adjacency value.
    const plotIndex = parseInt(d.id.replace('plot:', ''), 10)
    let baseValue = 50
    if (!isNaN(plotIndex) && adjacencyFactors.has(plotIndex)) {
      baseValue = 50 + adjacencyFactors.get(plotIndex)!.total
    }

    // Update from happiness, service, congestion, education.
    const target = Math.min(
      100,
      baseValue * 0.95 + d.happiness * 8 + d.serviceCoverage * 10 - (1 - d.congestion) * 5 + d.education * 2,
    )
    d.landValue = Math.max(0, Math.min(100, target))
  }
}

// ===========================================================================
// Helpers
// ===========================================================================

/** Compute production and consumption rates (R074). */
function computeProductionConsumption(prng: Prng): void {
  for (const d of districts.values()) {
    if (d.zone === 'industrial') {
      d.production = 5 + Math.floor(prng() * 3)
    }
    if (d.zone === 'residential') {
      d.consumption = 2 + Math.floor(d.population / 4)
    } else if (d.zone === 'commercial') {
      d.consumption = 4
    }
  }
}

/** Compute net city-wide revenue. */
function computeNetRevenue(): number {
  let totalIncome = 0
  let totalExpenses = 0
  for (const d of districts.values()) {
    totalIncome += d.taxRevenue
    totalExpenses += d.expenses
  }
  return totalIncome - totalExpenses
}

/** Test seam: reset all state. */
export function clearEconomy(): void {
  districts.clear()
  treasury = 50000
  events = []
  initialised = false
  _buildCounter = 0
  plotZones = []
  serviceNetworks = []
  goodsPrices = {
    residential: 1.0,
    commercial: 1.0,
    industrial: 1.0,
    totalInventory: 0,
    totalConsumption: 0,
    shortage: false,
  }
  labourState = { jobs: 0, employed: 0, unemployed: 0, commuters: 0, wages: 1.0 }
  constructionStates = []
  adjacencyFactors = new Map()
  taxConfig = { residential: TAX_RATE, commercial: TAX_RATE, industrial: TAX_RATE }
  budgetConfig = {
    power: 1.0,
    sewage: 1.0,
    water: 1.0,
    garbage: 1.0,
    fire: 1.0,
    police: 1.0,
    health: 1.0,
    education: 1.0,
  }
  externalCongestion = { plotCongestion: new Map<number, number>() }
}
