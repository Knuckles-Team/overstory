// spec: OVERSTORY-CITY-R069, OVERSTORY-CITY-R070, OVERSTORY-CITY-R071, OVERSTORY-CITY-R072, OVERSTORY-CITY-R073, OVERSTORY-CITY-R074, OVERSTORY-CITY-R075, OVERSTORY-CITY-R076, OVERSTORY-CITY-R079, OVERSTORY-CITY-R080, OVERSTORY-CITY-R081, OVERSTORY-CITY-R082, OVERSTORY-CITY-R083, OVERSTORY-CITY-R084, OVERSTORY-CITY-R085, OVERSTORY-CITY-R086, OVERSTORY-CITY-R087, OVERSTORY-CITY-R088, OVERSTORY-CITY-R089, OVERSTORY-CITY-R090, OVERSTORY-CITY-R091, OVERSTORY-CITY-R092, OVERSTORY-CITY-R093, OVERSTORY-CITY-R094, OVERSTORY-CITY-R095, OVERSTORY-CITY-R096, OVERSTORY-CITY-R097, OVERSTORY-CITY-R098, OVERSTORY-CITY-R099, OVERSTORY-CITY-R100

/**
 * @file economy.ts
 * @description The city's economic engine (OVERSTORY-CITY-R069–R100).
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
 * R089 — typed jobs: per-job-type production, wage dynamics, shortage detection.
 * R090 — production chains: goods types, supply/demand matching, satisfaction index.
 * R091 — inter-district migration: employment-driven migration pressure, net migration.
 * R095 — transit system: bus/train routes, ridership, fare revenue, congestion relief.
 * R099 — weather system: weather types, intensity, economic effects per weather.
 * R100 — extended co-simulation loop: 20 sub-steps in correct order, replayable.
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
// R101 — Demand markers
// ---------------------------------------------------------------------------

/** Demand markers for empty lots (R101). */
export interface DemandMarker {
  plotIndex: number
  zoneType: 'residential' | 'commercial' | 'industrial'
  demand: number
}

/** Demand markers active this tick (R101). */
export let demandMarkers: DemandMarker[] = []

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

/** City growth archetypes — building families per zone (R079.2, R087). */
interface CityArchetype {
  zone: ZoneType
  form: string
  family: string
  jobs: number
  maintenanceFraction: number
}

/** Residential building families. */
const RESIDENTIAL_ARCHETYPES: CityArchetype[] = [
  { zone: 'residential', form: 'house', family: 'house', jobs: 0, maintenanceFraction: 0.02 },
  { zone: 'residential', form: 'apartment', family: 'apartment', jobs: 0, maintenanceFraction: 0.025 },
]

/** Commercial building families. */
const COMMERCIAL_ARCHETYPES: CityArchetype[] = [
  { zone: 'commercial', form: 'store', family: 'store', jobs: 2, maintenanceFraction: 0.03 },
  { zone: 'commercial', form: 'mall', family: 'gateway', jobs: 5, maintenanceFraction: 0.04 },
  { zone: 'commercial', form: 'restaurant', family: 'studio', jobs: 3, maintenanceFraction: 0.03 },
]

/** Industrial building families. */
const INDUSTRIAL_ARCHETYPES: CityArchetype[] = [
  { zone: 'industrial', form: 'factory', family: 'workshop', jobs: 4, maintenanceFraction: 0.03 },
  { zone: 'industrial', form: 'warehouse', family: 'storehouse', jobs: 2, maintenanceFraction: 0.025 },
]

/** All city archetype families by zone (R087). */
const CITY_ARCHETYPES: Record<ZoneType, CityArchetype[]> = {
  residential: RESIDENTIAL_ARCHETYPES,
  commercial: COMMERCIAL_ARCHETYPES,
  industrial: INDUSTRIAL_ARCHETYPES,
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
  /** Radius in world units (R081). */
  radius: number
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
  /** Budget multiplier (R113) — used by the 2D renderer for circle radius. */
  budget: number
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
  // R090 — production chains
  goodsSatisfactionIndex?: number
  // R099 — weather effects
  fireRiskModifier?: number
  agricultureBonus?: number
}

// ---------------------------------------------------------------------------
// R089 — Typed Jobs
// ---------------------------------------------------------------------------

/** Job types available in the city. */
export type JobType = 'retail' | 'office' | 'industrial' | 'service'

/** Per-job-type wage multipliers (R089). */
export interface JobTypeWage {
  retail: number
  office: number
  industrial: number
  service: number
}

/** Per-job-type job shortage tracking (R089). */
export interface JobShortageTicks {
  retail: number
  office: number
  industrial: number
  service: number
}

// ---------------------------------------------------------------------------
// R090 — Production Chains
// ---------------------------------------------------------------------------

/** Goods types produced and consumed by buildings (R090). */
export type GoodsType = 'raw_materials' | 'food' | 'equipment' | 'technology'

/** A goods profile: what a building produces or consumes (R090). */
export interface GoodsProfile {
  type: GoodsType
  rate: number // goods per tick
}

/** Building-level goods profile: what it produces and consumes (R090). */
export interface BuildingGoodsProfile {
  produces: GoodsProfile[]
  consumes: GoodsProfile[]
}

// ---------------------------------------------------------------------------
// R095 — Transit
// ---------------------------------------------------------------------------

/** A transit route connecting districts (R095). */
export interface TransitRoute {
  id: string
  type: 'bus' | 'train'
  /** Connected district ids. */
  districts: string[]
  /** Capacity (commuters per tick). */
  capacity: number
  /** Current riders. */
  riders: number
  /** Fare revenue per tick. */
  fareRevenue: number
}

// ---------------------------------------------------------------------------
// R099 — Weather
// ---------------------------------------------------------------------------

/** Current weather conditions (R099). */
export interface WeatherState {
  type: 'clear' | 'rain' | 'wind' | 'fog'
  intensity: number // 0..1
  /** Days since weather changed. */
  age: number
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
  /** The selected city archetype (R079.2). */
  archetype?: string
  /** Construction progress 0→100 (R079.2). */
  progress?: number
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
  // R089 — typed jobs
  jobProduction: Record<string, number>
  jobShortageTicks: JobShortageTicks
  wages: JobTypeWage
  // R090 — production chains
  goodsSatisfaction: number
  // R091 — inter-district migration
  migrationNet: number
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
    // R089 — typed jobs
    jobProduction: {},
    jobShortageTicks: { retail: 0, office: 0, industrial: 0, service: 0 },
    wages: { retail: 1.0, office: 1.0, industrial: 1.0, service: 1.0 },
    // R090 — production chains
    goodsSatisfaction: 1.0,
    // R091 — inter-district migration
    migrationNet: 0,
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

/**
 * Look up a plot's zone policy override (R112).
 * Returns undefined when no override is set.
 */
function getPlotZoneOverride(plotIndex: number): 'residential' | 'commercial' | 'industrial' | 'mixed' | undefined {
  return plotZones.find((p) => p.plotIndex === plotIndex)?.zone
}

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

/** Per-job-type wage multipliers (R089). */
let jobTypeWages: JobTypeWage = { retail: 1.0, office: 1.0, industrial: 1.0, service: 1.0 }

/** Per-job-type shortage tick counters (R089). */
let jobShortageTicks: JobShortageTicks = { retail: 0, office: 0, industrial: 0, service: 0 }

/** Construction states (R086). */
export let constructionStates: ConstructionState[] = []

/** Policy changes recorded for consequence timeline (R111). */
export interface PolicyChange {
  tick: number
  type: 'tax' | 'budget'
  zone?: string
  oldValue: number
  newValue: number
  effectSummary?: string
}

export let policyTimeline: PolicyChange[] = []

/** Projected treasury over next 50 ticks (R114). */
export let projectedTreasury: number[] = []

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

/** Transit routes (R095). */
let transitRoutes: TransitRoute[] = []

/** Fare revenue per commuter per tick (R095). */
const FARE_PER_TICK = 2

/** Congestion reduction per transit route (R095). */
const CONGESTION_REDUCTION_PER_ROUTE = 0.05

/** Weather state (R099). */
let weatherState: WeatherState = { type: 'clear', intensity: 0, age: 0 }

/** Character scaling state (R100). */
let characterScale = 1.0

/** Character behaviour log (R100). */
let characterBehaviourLog: string[] = []

/** Traffic density per plot (R100). */
let trafficDensityPerPlot = new Map<number, number>()

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

/**
 * Tick the economy: extended co-simulation loop (R100).
 * 20 sub-steps in order, each emitting events on the bus.
 */
export function tickEconomy(): void {
  if (!initialised) return

  events = []
  const prng = mulberry32(0) // seeded, deterministic within a tick

  // === R100 Extended co-simulation loop: 20 sub-steps ===

  // 1. Production tick (industrial districts produce goods)
  {
    for (const d of districts.values()) {
      if (d.zone === 'industrial') {
        d.inventory += d.production
        d.production = Math.max(0, d.production + (prng() - 0.5) * 2)
      }
    }
    bus.emit(makeEvent('economy.production', {}, 'production tick complete'))
  }

  // 2. Consumption tick (match goods to consumers)
  {
    for (const d of districts.values()) {
      if (d.zone === 'residential' || d.zone === 'commercial') {
        d.inventory = Math.max(0, d.inventory - d.consumption)
        if (d.inventory <= 0 && d.consumption > 0) {
          // R106: When goods shortage exists, goods vehicles deliver to resolve it
          if (goodsPrices.shortage) {
            // Reduced happiness impact when deliveries are active
            d.happiness = Math.max(HAPPINESS_MIN, d.happiness - 0.005)
            // Deliver goods: reduce shortage and replenish inventory
            const deliveredAmount = Math.min(1, goodsPrices.totalInventory / 10)
            goodsPrices.shortage = false
            goodsPrices.totalInventory += deliveredAmount
          } else {
            // No delivery available — full impact
            d.happiness = Math.max(HAPPINESS_MIN, d.happiness - 0.02)
          }
        }
      }
    }
    bus.emit(makeEvent('economy.consumption', {}, 'consumption tick complete'))
  }

  // 3. Price update (R082)
  {
    tickGoodsPrices(prng)
    bus.emit(makeEvent('economy.price_update', {}, 'price update complete'))
  }

  // 4. Jobs tick — typed jobs (R089)
  {
    computeJobsTyped(prng)
    bus.emit(makeEvent('economy.jobs_typed', {}, 'typed jobs tick complete'))
  }

  // 5. Wage update (R089)
  {
    tickWages(prng)
    bus.emit(makeEvent('economy.wage_update', {}, 'wage update complete'))
  }

  // 6. Population tick — migration, growth, happiness (R091)
  {
    tickMigration(prng)
    for (const d of districts.values()) {
      tickPopulationTick(d, prng)
    }
    bus.emit(makeEvent('economy.population', {}, 'population tick complete'))
  }

  // 7. Character scaling (R100)
  {
    tickCharacterScaling(prng)
  }

  // 8. Character behaviour (R100)
  {
    tickCharacterBehaviour(prng)
  }

  // 9. Land value tick (R084)
  {
    tickLandValueTick(prng)
    bus.emit(makeEvent('economy.land_value', {}, 'land value tick complete'))
  }

  // 10. Service coverage tick (R081)
  {
    tickServiceCoverageTick(prng)
    bus.emit(makeEvent('economy.service_coverage', {}, 'service coverage tick complete'))
  }

  // 11. Traffic density tick (R100)
  {
    tickTrafficDensity(prng)
    bus.emit(makeEvent('economy.traffic_density', {}, 'traffic density tick complete'))
  }

  // 12. Transit tick (R095)
  {
    tickTransit(prng)
  }

  // 13. Congestion tick (R085)
  {
    tickCongestionRead(prng)
    // Apply transit congestion reduction
    for (const d of districts.values()) {
      const transitReduction = transitRoutes.length * CONGESTION_REDUCTION_PER_ROUTE
      d.congestion = Math.max(0, Math.min(1, d.congestion + transitReduction))
    }
    bus.emit(makeEvent('economy.congestion', {}, 'congestion tick complete'))
  }

  // 14. Cost tick (R086)
  {
    tickCostTick(prng)
    bus.emit(makeEvent('economy.cost', {}, 'cost tick complete'))
  }

  // 15. Weather tick (R099)
  {
    tickWeather()
    bus.emit(
      makeEvent(
        'economy.weather',
        {},
        `weather: ${weatherState.type} (intensity ${weatherState.intensity.toFixed(2)})`,
      ),
    )
  }

  // 16. Demand tick (R070/R079)
  {
    for (const d of districts.values()) {
      tickDemandTick(d, prng)
    }
    bus.emit(makeEvent('economy.demand', {}, 'demand tick complete'))
  }

  // 17. Growth placement (R079).
  {
    tryGrowthPlacements(prng)
    bus.emit(makeEvent('economy.growth', {}, 'growth placement complete'))
  }

  // 18. Remove completed constructions from economic tracking (R079.2).
  // The visual completion happens in sim.ts's completeConstruction, but the
  // economy needs to remove completed constructions from its cost/decay tracking.
  {
    let removed = 0
    for (let i = constructionStates.length - 1; i >= 0; i--) {
      const cs = constructionStates[i]
      // Check if this construction has been visually completed (no plot or plot has no construction).
      const plotIdx = findPlotForConstruction(cs)
      if (plotIdx >= 0 && world.plots[plotIdx].construction === null) {
        constructionStates.splice(i, 1)
        removed++
      }
    }
    if (removed > 0) {
      bus.emit(
        makeEvent('economy.construction', {}, `${removed} constructions completed, removed from economic tracking`),
      )
    }
  }

  // 18. Construction decay (R086, R079.2).
  // Only active (non-completed) constructions contribute to maintenance costs.
  {
    for (const cs of constructionStates) {
      if (cs.decayState === 'run-down' && cs.standing()) {
        // Run-down buildings consume extra maintenance
        const extraCost = cs.maintenancePerTick * 0.5
        for (const d of districts.values()) {
          for (const dc of d.constructions) {
            if (dc.buildingId === cs.buildingId) {
              d.balance -= extraCost
              break
            }
          }
        }
      }
    }
    bus.emit(makeEvent('economy.construction', {}, 'construction decay tick complete'))
  }

  // 19. Event emission (extend existing)
  {
    // Emit economy events on the bus
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

  // 20. Treasury update (R069)
  {
    const net = computeNetRevenue()
    treasury += net

    // R102: compute economic health for all buildings
    computeBuildingEconomicHealth()

    if (net !== 0) {
      events.push({
        type: 'budget',
        detail: net > 0 ? 'net surplus' : 'net deficit',
        delta: net,
      })
    }

    // R114: project treasury over next 50 ticks
    projectedTreasury = projectTreasury(50)

    // Under-funding decay (R086)
    applyUnderFundingDecay()

    // Final treasury update event
    bus.emit(makeEvent('economy.treasury', {}, `treasury update: ${treasury}`))
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

/** Access per-job-type wage multipliers (R089). */
export function getJobTypeWages(): JobTypeWage {
  return { ...jobTypeWages }
}

/** Access per-job-type shortage ticks (R089). */
export function getJobShortageTicks(): JobShortageTicks {
  return { ...jobShortageTicks }
}

/** Access transit routes (R095). */
export function getTransitRoutes(): TransitRoute[] {
  return [...transitRoutes]
}

/** Access weather state (R099). */
export function getWeatherState(): WeatherState {
  return { ...weatherState }
}

/** Access character scale (R100). */
export function getCharacterScale(): number {
  return characterScale
}

/** Access traffic density per plot (R100). */
export function getTrafficDensityPerPlot(): Map<number, number> {
  return new Map(trafficDensityPerPlot)
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
  const oldValue = taxConfig[zone]
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
  // R111: record policy change
  policyTimeline.push({ tick: world.absGameS, type: 'tax', zone, oldValue, newValue: rounded })
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
  const oldValue = budgetConfig[service as keyof BudgetConfig]
  budgetConfig[service as keyof BudgetConfig] = clamped
  // Update service networks.
  for (const net of serviceNetworks) {
    if (net.type === service) {
      net.active = clamped >= 0.8
    }
  }
  // R111: record policy change
  policyTimeline.push({ tick: world.absGameS, type: 'budget', zone: service, oldValue, newValue: clamped })
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

  for (const [serviceType, radius] of Object.entries(SERVICE_RADII)) {
    const network: ServiceNetwork = {
      type: serviceType,
      radius,
      buildings: [],
      capacity: SERVICE_CAPACITY[serviceType] ?? 10,
      coveredLots: 0,
      active: true,
      lotCoverages: new Map<number, number>(),
      budget: 1.0, // default full budget
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

/**
 * Tick jobs during co-simulation (R080).
 * @deprecated — use computeJobsTyped() / tickWages() in the R100 20-step loop. Kept for backward compat.
 */
export function tickJobsTick(_prng: Prng): void {
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
// R089: Typed Jobs
// ===========================================================================

/** Job archetype building kinds that produce typed jobs (R089). */
const INDUSTRIAL_BUILDING_KINDS = new Set([
  'industrial',
  'factory',
  'mine',
  'ore-plant',
  'oil-gas-plant',
  'datacenter',
  'warehouse',
])

const RETAIL_BUILDING_KINDS = new Set(['store', 'mall', 'restaurant', 'cafe'])

const SERVICE_BUILDING_KINDS = new Set(['fire', 'police', 'health', 'education'])

/**
 * Compute typed jobs from all buildings in the world (R089).
 * Sums per-job-type jobs into `labourState` and populates each district's
 * `jobProduction`.
 */
export function computeJobsTyped(_prng?: Prng): void {
  const jobProduction: Record<string, number> = {}
  const totalJobsTyped: JobTypeWage = { retail: 0, office: 0, industrial: 0, service: 0 }

  for (const b of Object.values(world.buildings)) {
    const kind = b.kind || ''
    const category = b.category
    const toolCount = b.toolCount || 0

    // Connector buildings with tools → office jobs
    if (category === 'connector' && b.tools.length > 0) {
      const officeJobs = Math.ceil(toolCount * 0.3)
      totalJobsTyped.office += officeJobs
      const distId = b.derivedPlot !== null ? `plot:${b.derivedPlot}` : b.id
      jobProduction[distId] = (jobProduction[distId] ?? 0) + officeJobs
      continue
    }

    // Industrial buildings → industrial jobs
    if (INDUSTRIAL_BUILDING_KINDS.has(kind)) {
      const industrialJobs = Math.ceil(toolCount * 0.5)
      totalJobsTyped.industrial += industrialJobs
      const distId = b.derivedPlot !== null ? `plot:${b.derivedPlot}` : b.id
      jobProduction[distId] = (jobProduction[distId] ?? 0) + industrialJobs
      continue
    }

    // Retail buildings → retail jobs
    if (RETAIL_BUILDING_KINDS.has(kind)) {
      const retailJobs = Math.ceil(toolCount * 0.2)
      totalJobsTyped.retail += retailJobs
      const distId = b.derivedPlot !== null ? `plot:${b.derivedPlot}` : b.id
      jobProduction[distId] = (jobProduction[distId] ?? 0) + retailJobs
      continue
    }

    // Service buildings → service jobs (2 per building)
    if (SERVICE_BUILDING_KINDS.has(kind)) {
      const serviceJobs = 2
      totalJobsTyped.service += serviceJobs
      const distId = b.derivedPlot !== null ? `plot:${b.derivedPlot}` : b.id
      jobProduction[distId] = (jobProduction[distId] ?? 0) + serviceJobs
    }
  }

  labourState.jobs = totalJobsTyped.office + totalJobsTyped.industrial + totalJobsTyped.retail + totalJobsTyped.service

  // Distribute typed jobs to districts
  for (const d of districts.values()) {
    d.jobProduction = { ...jobProduction }
  }
}

/**
 * Update per-job-type wages based on consecutive shortage ticks (R089).
 * After 3 consecutive shortage ticks, increase wage for that type by 5% compound.
 * Reset shortageTicks when the type is no longer in shortage.
 */
function tickWages(_prng?: Prng): void {
  const totalDemand: JobTypeWage = { retail: 0, office: 0, industrial: 0, service: 0 }
  let totalResPopulation = 0

  for (const d of districts.values()) {
    if (d.zone === 'residential') {
      totalResPopulation += d.population
    }
  }

  // Total labour force per district = 80% of residential population
  const totalLabourForce = totalResPopulation * 0.8

  // Demand is proportional to population needing each job type
  if (totalLabourForce > 0) {
    totalDemand.retail = Math.ceil(totalLabourForce * 0.3)
    totalDemand.office = Math.ceil(totalLabourForce * 0.25)
    totalDemand.industrial = Math.ceil(totalLabourForce * 0.25)
    totalDemand.service = Math.ceil(totalLabourForce * 0.2)
  }

  for (const jobType of ['retail', 'office', 'industrial', 'service'] as JobType[]) {
    // Aggregate supply from district-level jobProduction
    let totalSupplyForType = 0
    for (const d of districts.values()) {
      totalSupplyForType += d.jobProduction[jobType] ?? 0
    }
    const demand = totalDemand[jobType]

    if (demand > totalSupplyForType) {
      // In shortage — increment tick counter
      if (jobShortageTicks[jobType] < 3) {
        jobShortageTicks[jobType] += 1
      }
      if (jobShortageTicks[jobType] >= 3) {
        // Increase wage by 5% compound
        jobTypeWages[jobType] = Math.round(jobTypeWages[jobType] * 1.05 * 100) / 100
      }
    } else {
      // No longer in shortage — reset counter
      jobShortageTicks[jobType] = 0
    }
  }
}

/**
 * Compute employment rate per district for each job type (R089).
 * @deprecated — called from tickEconomy 20-step loop instead. Kept for backward compat.
 */
export function computeEmploymentTyped(): void {
  let totalResPopulation = 0
  for (const d of districts.values()) {
    if (d.zone === 'residential') {
      totalResPopulation += d.population
    }
  }

  for (const d of districts.values()) {
    if (d.zone === 'residential' && totalResPopulation > 0) {
      const labourForce = Math.ceil(d.population * 0.8)
      const localJobs = Object.values(d.jobProduction).reduce((s, v) => s + v, 0)
      d.labour.employed = Math.min(d.population, Math.max(0, localJobs))
      d.labour.unemployed = d.population - d.labour.employed

      // Per-district employment rate
      if (labourForce > 0) {
        d.unemployment = 1 - d.labour.employed / labourForce
      }
    }
  }
}

// ===========================================================================
// R090: Production Chains
// ===========================================================================

/**
 * Compute production chains: goods produced by industrial districts,
 * goods consumed by commercial districts, satisfaction index (R090).
 */
export function computeProductionChains(prng: Prng): void {
  const production: Record<string, number> = {}
  const consumption: Record<string, number> = {}

  for (const b of Object.values(world.buildings)) {
    const kind = b.kind || ''
    const category = b.category

    // Industrial buildings produce goods based on kind
    if (INDUSTRIAL_BUILDING_KINDS.has(kind)) {
      const baseProd = 2 + Math.floor(prng() * 3)
      let goodsType: GoodsType = 'raw_materials'
      if (kind.includes('data') || kind.includes('tech')) goodsType = 'technology'
      else if (kind.includes('food') || kind.includes('restaurant') || kind.includes('cafe')) goodsType = 'food'
      else if (kind.includes('equip') || kind.includes('factory')) goodsType = 'equipment'
      production[goodsType] = (production[goodsType] ?? 0) + baseProd
    }

    // Commercial buildings consume goods
    if (RETAIL_BUILDING_KINDS.has(kind) || (category === 'connector' && b.tools.length > 0)) {
      const baseCons = 1 + Math.floor(prng() * 2)
      consumption.food = consumption.food + baseCons
      consumption.equipment = consumption.equipment + Math.ceil(baseCons * 0.5)
    }
  }

  // Match supply to demand for each goods type
  let totalSatisfaction = 0
  let commercialDistrictCount = 0

  for (const d of districts.values()) {
    if (d.zone === 'commercial') {
      commercialDistrictCount++
      const neededFood = consumption.food
      const neededEquip = consumption.equipment
      const producedFood = production.food
      const producedEquip = production.equipment

      const satisfactionFood = neededFood > 0 ? Math.min(1, producedFood / neededFood) : 1
      const satisfactionEquip = neededEquip > 0 ? Math.min(1, producedEquip / neededEquip) : 1
      d.goodsSatisfaction = (satisfactionFood + satisfactionEquip) / 2
      totalSatisfaction += d.goodsSatisfaction
    }
  }

  // Consumer satisfaction index = average of all commercial districts' goodsSatisfaction
  const consumerSatisfactionIndex = commercialDistrictCount > 0 ? totalSatisfaction / commercialDistrictCount : 1

  // Emit the goods_chain event
  bus.emit(
    makeEvent('economy.goods_chain', {}, `consumer satisfaction index: ${consumerSatisfactionIndex.toFixed(3)}`),
  )

  // Store in labourState for access
  labourState.goodsSatisfactionIndex = consumerSatisfactionIndex
}

// ===========================================================================
// R091: Inter-district Migration
// ===========================================================================

/**
 * Compute inter-district migration based on employment pressure (R091).
 */
function tickMigration(_prng: Prng): void {
  // Find the district with highest employment rate and happiness > 0.6
  let bestDest: DistrictEconomy | null = null
  let bestEmploymentRate = 0

  for (const d of districts.values()) {
    if (d.happiness > 0.6) {
      const employmentRate = d.labour.employed / Math.max(1, d.population)
      if (employmentRate > bestEmploymentRate) {
        bestEmploymentRate = employmentRate
        bestDest = d
      }
    }
  }

  for (const d of districts.values()) {
    d.migrationNet = 0

    if (d.zone !== 'residential') continue

    const employmentRate = d.labour.jobs > 0 ? d.labour.employed / Math.max(1, d.population) : 0

    // Migration out: high unemployment
    let migrationOut = 0
    if (employmentRate < 0.1) {
      migrationOut = Math.floor(d.population * 0.05)
    } else if (employmentRate < 0.3) {
      migrationOut = Math.floor(d.population * 0.02)
    }

    // Migration in: attracted to high-employment, high-happiness district with spare capacity
    let migrationIn = 0
    if (bestDest && bestDest !== d && bestEmploymentRate < 0.9) {
      const totalResPopulation = [...districts.values()]
        .filter((dd) => dd.zone === 'residential')
        .reduce((s, dd) => s + dd.population, 0)
      if (totalResPopulation > 0) {
        migrationIn = Math.floor(migrationOut * 0.3) + 1
      }
    }

    d.migrationNet = migrationIn - migrationOut
    d.population = Math.max(0, d.population + d.migrationNet)
  }

  // Emit migration events
  for (const d of districts.values()) {
    if (d.migrationNet !== 0) {
      bus.emit(
        makeEvent('economy.migration', {}, `${d.id}: migration net ${d.migrationNet > 0 ? '+' : ''}${d.migrationNet}`),
      )
    }
  }
}

// ===========================================================================
// R095: Transit System
// ===========================================================================

/**
 * Initialize transit routes (R095).
 * Creates one bus route connecting core districts and one train route.
 */
export function initTransit(): void {
  transitRoutes = []

  const districtIds = [...districts.keys()]

  // Bus route connecting core districts (plot:0, plot:1, plot:2)
  const coreDistricts = districtIds.filter((id) => id.startsWith('plot:') && parseInt(id.replace('plot:', ''), 10) < 3)
  if (coreDistricts.length >= 2) {
    transitRoutes.push({
      id: 'bus-core',
      type: 'bus',
      districts: coreDistricts,
      capacity: 100,
      riders: 0,
      fareRevenue: 0,
    })
  }

  // Train route connecting industrial zone to core (last plot to plot:0)
  if (coreDistricts.length > 0 && districtIds.length > 1) {
    const lastPlot = districtIds[districtIds.length - 1]
    transitRoutes.push({
      id: 'train-industrial',
      type: 'train',
      districts: [coreDistricts[0], lastPlot],
      capacity: 200,
      riders: 0,
      fareRevenue: 0,
    })
  }
}

/**
 * Tick transit system: compute ridership, fare revenue, congestion reduction (R095).
 */
function tickTransit(_prng: Prng): void {
  if (transitRoutes.length === 0) return

  const resTotal = [...districts.values()]
    .filter((d) => d.zone === 'residential')
    .reduce((s, d) => s + d.population, 0)

  let totalRiders = 0
  let totalFareRevenue = 0

  for (const route of transitRoutes) {
    // Ridership = floor(residential_population / transit_routes.length)
    const ridership = Math.floor(resTotal / transitRoutes.length)
    const cappedRiders = Math.min(ridership, route.capacity)
    route.riders = cappedRiders

    // Fare revenue
    const fare = cappedRiders * FARE_PER_TICK
    route.fareRevenue = fare
    totalRiders += cappedRiders
    totalFareRevenue += fare
  }

  // Add fare revenue to treasury
  if (totalFareRevenue > 0) {
    treasury += totalFareRevenue
    events.push({
      type: 'income',
      detail: `transit fare revenue: ${totalFareRevenue}`,
      delta: totalFareRevenue,
    })
  }

  // Compute congestion reduction
  const congestionReduction = transitRoutes.length * CONGESTION_REDUCTION_PER_ROUTE
  bus.emit(
    makeEvent(
      'economy.transit',
      {},
      `transit: ${totalRiders} riders, ${totalFareRevenue} fare, congestion reduction ${congestionReduction.toFixed(2)}`,
    ),
  )
}

// ===========================================================================
// R099: Weather System
// ===========================================================================

/** Weather transition probabilities (R099). */
const WEATHER_TRANSITIONS: Record<string, string[]> = {
  clear: ['rain', 'wind', 'fog', 'clear'],
  rain: ['clear', 'wind', 'fog', 'rain'],
  wind: ['clear', 'rain', 'fog', 'wind'],
  fog: ['clear', 'rain', 'wind', 'fog'],
}

/**
 * Tick weather: update state and apply economic effects (R099).
 */
export function tickWeather(): void {
  weatherState.age += 1

  // Every 20 ticks, with probability 0.15, change weather
  if (weatherState.age % 20 === 0) {
    const prng = mulberry32(0)
    if (prng() < 0.15) {
      const transitions = WEATHER_TRANSITIONS[weatherState.type] ?? ['clear']
      const newType = transitions[Math.floor(prng() * transitions.length)]
      weatherState.type = newType as WeatherState['type']
      weatherState.age = 0

      // Set intensity based on type
      if (newType === 'rain') {
        weatherState.intensity = Math.min(1, prng() * 0.5 + 0.5)
      } else if (newType === 'wind') {
        weatherState.intensity = prng() * 0.8
      } else if (newType === 'fog') {
        weatherState.intensity = prng() * 0.6
      } else {
        weatherState.intensity = 0
      }
    }
  }

  // Apply weather effects via the congestion factor and production multipliers
  // Effects are capped at +/-20% from base
  const effects = getWeatherEffectModifiers()

  for (const d of districts.values()) {
    // Apply traffic modifier (affects congestion)
    if (effects.trafficModifier !== 0) {
      d.congestion = Math.max(0.8, Math.min(1, d.congestion + effects.trafficModifier))
    }
  }

  // Store weather effects in labourState for other systems to consume
  labourState.fireRiskModifier = (labourState.fireRiskModifier ?? 0) + effects.fireRisk
  labourState.agricultureBonus = (labourState.agricultureBonus ?? 0) + effects.agricultureBonus
}

/**
 * Get current weather economic effect modifiers (R099).
 */
function getWeatherEffectModifiers(): {
  trafficModifier: number
  fireRisk: number
  agricultureBonus: number
  constructionCostModifier: number
  serviceDelay: number
} {
  switch (weatherState.type) {
    case 'rain':
      return {
        trafficModifier: -0.15,
        fireRisk: 0.01,
        agricultureBonus: 0.1,
        constructionCostModifier: 0,
        serviceDelay: 0.05,
      }
    case 'wind':
      return {
        trafficModifier: 0,
        fireRisk: 0,
        agricultureBonus: 0,
        constructionCostModifier: 0.05,
        serviceDelay: 0,
      }
    case 'fog':
      // Visual only — no economic effect
      return {
        trafficModifier: 0,
        fireRisk: 0,
        agricultureBonus: 0,
        constructionCostModifier: 0,
        serviceDelay: 0,
      }
    case 'clear':
    default:
      return {
        trafficModifier: 0,
        fireRisk: 0,
        agricultureBonus: 0,
        constructionCostModifier: 0,
        serviceDelay: 0,
      }
  }
}

// ===========================================================================
// R100: Extended Co-simulation — Character Scaling & Behaviour
// ===========================================================================

/**
 * Tick character scaling: adjust simulation scale based on city state (R100).
 */
function tickCharacterScaling(_prng: Prng): void {
  // Scale based on average happiness and employment
  let totalHappiness = 0
  let totalEmployment = 0
  let count = 0

  for (const d of districts.values()) {
    if (d.zone === 'residential') {
      totalHappiness += d.happiness
      totalEmployment += d.labour.employed / Math.max(1, d.population)
      count++
    }
  }

  if (count > 0) {
    const avgHappiness = totalHappiness / count
    const avgEmployment = totalEmployment / count
    // Scale factor: 0.8 to 1.2 based on city health
    characterScale = 0.8 + (avgHappiness * 0.2 + avgEmployment * 0.2)
    characterScale = Math.max(0.5, Math.min(2.0, characterScale))
  }

  bus.emit(makeEvent('economy.character_scaling', {}, `character scaling: ${characterScale.toFixed(3)}`))
}

/**
 * Tick character behaviour: simulate citizen actions (R100).
 */
function tickCharacterBehaviour(_prng: Prng): void {
  characterBehaviourLog = []

  for (const d of districts.values()) {
    if (d.zone === 'residential' && d.population > 0) {
      // Citizens work, consume, and provide services based on employment
      const employmentRate = d.labour.employed / Math.max(1, d.population)

      if (employmentRate > 0.5) {
        characterBehaviourLog.push(`${d.id}: citizens working (employment ${employmentRate.toFixed(2)})`)
      } else if (employmentRate < 0.2) {
        characterBehaviourLog.push(`${d.id}: citizens idle (employment ${employmentRate.toFixed(2)})`)
      }
    }
  }

  bus.emit(
    makeEvent('economy.character_behaviour', {}, `character behaviour: ${characterBehaviourLog.length} activities`),
  )
}

// ===========================================================================
// R100: Traffic Density
// ===========================================================================

/**
 * Tick traffic density based on commuter count and transit (R100).
 */
function tickTrafficDensity(_prng: Prng): void {
  trafficDensityPerPlot = new Map()

  for (const d of districts.values()) {
    const plotIndex = parseInt(d.id.replace('plot:', ''), 10)
    if (!isNaN(plotIndex)) {
      // Traffic proportional to population and inversely proportional to transit
      const baseDensity = d.population / 100
      const transitReduction = transitRoutes.length * CONGESTION_REDUCTION_PER_ROUTE
      trafficDensityPerPlot.set(plotIndex, Math.max(0, baseDensity * (1 - transitReduction)))
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

  // R105: Apply external congestion from traffic simulation to commercial districts.
  // Average the external congestion across all plots that have it, then dampen
  // commercial district congestion further based on the average.
  {
    let sumExternal = 0
    let count = 0
    for (const val of externalCongestion.plotCongestion.values()) {
      sumExternal += val
      count++
    }
    if (count > 0) {
      const avgExternalCongestion = sumExternal / count
      for (const d of districts.values()) {
        if (d.zone === 'commercial') {
          d.congestion *= 1 - avgExternalCongestion * 0.5
          d.congestion = Math.max(0, Math.min(1, d.congestion))
        }
      }
    }
  }
}

// ===========================================================================
// R079: Closed-loop economy — demand gates growth
// ===========================================================================

/**
 * City growth: demand-gated building placement (R079, R087, R079.2).
 * The economy calls this every tick. It:
 * 1. Picks an archetype from the zone's catalog (R087)
 * 2. Finds an empty lot near the district
 * 3. Creates scaffolding (construction state with progress 0→100)
 * 4. On completion, creates a real building in world.buildings
 * 5. Emits construction events (progress, complete)
 *
 * Returns the list of new constructions placed this tick.
 */
function tryGrowthPlacements(prng: Prng): void {
  const emptyLots: number[] = []
  for (let i = 0; i < world.plots.length; i++) {
    if (!world.plots[i].buildingId && !world.plots[i].construction) {
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
      // R112: check plot zone override — if the lot has a zone policy,
      // only place buildings matching that zone.
      const lotIndex = emptyLots.shift()!
      const plotZone = getPlotZoneOverride(lotIndex)
      const effectiveZone = (plotZone ?? d.zone) as 'residential' | 'commercial' | 'industrial'

      const cost = CONSTRUCTION_COSTS[effectiveZone]
      if (treasury >= cost) {
        // Debit treasury (R079).
        treasury -= cost

        // Select an archetype from the zone's catalog (R087).
        const archetypes = CITY_ARCHETYPES[effectiveZone]
        const archetype = archetypes[Math.floor(prng() * archetypes.length)]

        // Add a construction state (R079, R087).
        const buildId = `built:${d.id}:${++_buildCounter}`
        const cs: ConstructionState = {
          buildingId: buildId,
          cost,
          maintenancePerTick: Math.round(cost * archetype.maintenanceFraction * 100) / 100,
          decayState: 'none',
          /** The archetype selected for this building (R079.2). */
          archetype: archetype.form,
          /** Construction progress 0→100 (R079.2). */
          progress: 0,
          standing() {
            return this.decayState !== 'demolished'
          },
        }
        d.constructions.push(cs)
        constructionStates.push(cs)

        // Mark the lot as under construction (not yet built).
        if (lotIndex < world.plots.length) {
          world.plots[lotIndex].buildingId = cs.buildingId
          world.plots[lotIndex].reservedId = null
          world.plots[lotIndex].construction = { connectorId: buildId, progress: 0, lastMilestone: 0 }
        }

        // Emit the construction start event (R079.2).
        events.push({
          type: 'construction',
          detail: `${d.id}: placed ${effectiveZone} building (scaffolding, cost: ${cost})`,
          delta: -cost,
          district: d.id,
        })

        bus.emit(
          makeEvent(
            'construction.progress',
            { building: buildId },
            `Scaffolding raised at ${effectiveZone} ${archetype.form} ${buildId}`,
          ),
        )
      } else {
        // Deferred: treasury insufficient (R114).
        bus.emit(
          makeEvent(
            'economy.construction_deferred',
            { building: d.id, detail: `treasury ${Math.round(treasury)} insufficient for cost ${cost}` },
            `Construction of ${effectiveZone} building deferred: treasury ${Math.round(treasury)} insufficient`,
          ),
        )
        events.push({
          type: 'construction',
          detail: `${d.id}: refused ${effectiveZone} building — insufficient treasury`,
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

    // R111: High tax rates reduce commercial growth (cascade effect).
    if (d.taxConfig.commercial > 0.3) {
      // High commercial tax reduces demand and income growth each tick
      d.demand.commercial *= 0.95
      d.grossIncome *= 0.98
    }

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

/** Compute economic health for all world buildings (R102). */
export function computeBuildingEconomicHealth(): void {
  if (!world.initialized) return
  const buildings = Object.values(world.buildings)

  // Precompute per-zone total foot traffic (R108).
  const zoneTraffic: Record<string, number> = {}
  for (const b of buildings) {
    const zone = b.role ?? ''
    zoneTraffic[zone] = (zoneTraffic[zone] ?? 0) + (b.footTraffic ?? 0)
  }

  for (const b of buildings) {
    // Base health from fresh status (new buildings are healthier)
    let health = 0.5 + (b.fresh > 0 ? 0.3 : 0)

    // Foot traffic bonus (R108): individual building foot traffic.
    const footTraffic = b.footTraffic ?? 0
    health = Math.min(1, health + Math.min(0.2, footTraffic / 250))

    // District-wide bonus: sum of all commercial activity in this zone.
    const totalZoneTraffic = zoneTraffic[b.role ?? ''] ?? 0
    health += Math.min(0.15, totalZoneTraffic / 1000)

    // Zone bonus from district economic health.
    const districtEconomy = getDistrict(b.role)
    if (districtEconomy) {
      health += districtEconomy.happiness * 0.1
    }

    // Congestion penalty for commercial zones (R105).
    if (districtEconomy && districtEconomy.zone === 'commercial') {
      health *= districtEconomy.congestion
    }

    // Clamp
    b.economicHealth = Math.max(0, Math.min(1, health))
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

  // R101: set demand markers on empty lots when demand is high
  if (d.demand[d.zone] > 0.5) {
    for (let i = 0; i < world.plots.length; i++) {
      const plot = world.plots[i]
      if (plot.buildingId === null) {
        let matchesZone = false
        if (d.zone === 'residential' && (plot.zone === 'residential' || !plot.zone)) matchesZone = true
        if (d.zone === 'commercial' && (plot.zone === 'commercial' || !plot.zone)) matchesZone = true
        if (d.zone === 'industrial' && (plot.zone === 'industrial' || !plot.zone)) matchesZone = true
        if (matchesZone) {
          demandMarkers.push({ plotIndex: i, zoneType: d.zone as any, demand: d.demand[d.zone] })
        }
      }
    }
  }
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
    // R105: gross income for commercial districts is reduced by congestion
    if (d.zone === 'commercial') {
      d.grossIncome = d.population * 0.5 // base commercial income proportional to population
      d.taxRevenue = d.grossIncome * d.congestion * d.taxConfig.commercial
    } else if (d.zone === 'industrial') {
      d.grossIncome = d.production * 2
      d.taxRevenue = d.grossIncome * d.taxConfig.industrial
    } else {
      d.taxRevenue = d.population * 0.1 * d.taxConfig.residential
    }

    totalIncome += d.taxRevenue
    totalExpenses += d.expenses
  }

  // R108: add foot traffic bonus to commercial district income
  if (world.commercialFootTraffic > 0) {
    for (const d of districts.values()) {
      if (d.zone === 'commercial') {
        const commercialBldgs = Object.values(world.buildings).filter(
          b => b.role === d.id && (b.kind.includes('store') || b.kind.includes('restaurant')),
        )
        if (commercialBldgs.length > 0) {
          totalIncome += world.commercialFootTraffic * 2 * (1 / commercialBldgs.length)
        }
      }
    }
  }

  return totalIncome - totalExpenses
}

/** Project treasury balance over next N ticks (R114). */
export function projectTreasury(n: number): number[] {
  const projection = [treasury]
  for (let i = 0; i < n; i++) {
    const net = computeNetRevenue()
    projection.push(projection[projection.length - 1] + net)
  }
  return projection
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
  jobTypeWages = { retail: 1.0, office: 1.0, industrial: 1.0, service: 1.0 }
  jobShortageTicks = { retail: 0, office: 0, industrial: 0, service: 0 }
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
  // R095 — transit
  transitRoutes = []
  // R099 — weather
  weatherState = { type: 'clear', intensity: 0, age: 0 }
  // R100 — character scaling
  characterScale = 1.0
  characterBehaviourLog = []
  trafficDensityPerPlot = new Map<number, number>()
}

/**
 * Find the plot index for a construction state (R079.2).
 * Searches world.plots for a plot where buildingId matches the construction's id.
 */
function findPlotForConstruction(cs: ConstructionState): number {
  for (let i = 0; i < world.plots.length; i++) {
    if (world.plots[i].buildingId === cs.buildingId) {
      return i
    }
  }
  return -1
}
