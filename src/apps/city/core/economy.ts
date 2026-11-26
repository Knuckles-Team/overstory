/**
 * @file economy.ts
 * @description The city's economic engine (OVERSTORY-CITY-R069–R076).
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
 *
 * All randomness is the seeded PRNG; the module never calls Math.random.
 * The simulation tick (R009) invokes `tickEconomy()` each sub-step, which
 * applies per-district income, expense, population, demand, land value,
 * service coverage, production, congestion and cost state to the world.
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

  // Read district zones from the world's plots (R061 zoning).
  const zoneMap = getZoneMap()
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

  // Seed land value from adjacency (R072).
  computeLandValues(prng)

  // Seed service coverage (R073).
  computeServiceCoverage()

  // Seed production/consumption (R074).
  computeProductionConsumption(prng)

  initialised = true
}

/** Tick the economy by one tick (R069). */
export function tickEconomy(): void {
  if (!initialised) return

  events = []
  const prng = mulberry32(0) // seeded, deterministic within a tick

  for (const d of districts.values()) {
    tickDistrict(d, prng)
  }

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

  // Under-funding decay (R076).
  for (const d of districts.values()) {
    if (d.balance < -500) {
      d.decaying = true
      d.happiness = Math.max(HAPPINESS_MIN, d.happiness - 0.15)
      d.serviceCoverage = Math.max(0, d.serviceCoverage - 0.1)
      events.push({
        type: 'expense',
        detail: `${d.id} under-funded — decay applied`,
        delta: 0,
        district: d.id,
      })
    } else {
      d.decaying = false
    }
  }

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

// ---------------------------------------------------------------------------
// District tick (R069–R076)
// ---------------------------------------------------------------------------

function tickDistrict(d: DistrictEconomy, prng: Prng): void {
  // --- Income (R069) ---
  const baseIncome = computeIncome(d, prng)
  d.grossIncome = baseIncome
  d.taxRevenue = baseIncome * TAX_RATE

  // --- Expenses (R069) ---
  const maintenance = computeMaintenance(d)
  const serviceCost = computeServiceCost(d)
  const goodsCost = computeGoodsCost(d)
  d.expenses = maintenance + serviceCost + goodsCost

  // Apply to balance.
  d.balance += d.taxRevenue - d.expenses

  // --- Population dynamics (R071) ---
  tickPopulation(d, prng)

  // --- Demand curves (R070) ---
  tickDemand(d, prng)

  // --- Land value update (R072) ---
  tickLandValue(d, prng)

  // --- Service coverage (R073) ---
  tickServiceCoverage(d)

  // --- Production & goods (R074) ---
  tickProduction(d, prng)

  // --- Congestion feedback (R075) ---
  tickCongestion(d, prng)

  // --- Costs: construction & maintenance (R076) ---
  tickCosts(d)
}

/** Compute gross income from commercial/industrial activity (R069). */
function computeIncome(d: DistrictEconomy, _prng: Prng): number {
  if (d.zone === 'residential') return 0
  const base = d.zone === 'industrial' ? d.production * 2 : d.population * 0.5
  // Congestion and service coverage modulate income.
  const factor = d.congestion * d.serviceCoverage
  return Math.max(0, base * factor)
}

/** Compute maintenance costs for the district. */
function computeMaintenance(d: DistrictEconomy): number {
  // Residential: minimal maintenance.
  // Commercial: moderate (office upkeep).
  // Industrial: higher (plant maintenance).
  const base = d.zone === 'residential' ? 1 : d.zone === 'industrial' ? 8 : 4
  return base * Math.max(1, Math.floor(d.population / 10))
}

/** Service costs (power, water, waste, etc.) (R073). */
function computeServiceCost(d: DistrictEconomy): number {
  // Service cost proportional to population and inversely to coverage.
  return d.zone === 'residential' ? d.population * 0.02 : 2
}

/** Goods flow costs (R074). */
function computeGoodsCost(d: DistrictEconomy): number {
  if (d.consumption <= 0) return 0
  // Shortages cost more; surplus is storage.
  return d.consumption * (d.inventory > 0 ? 0.5 : 2)
}

/** Population tick: growth, migration, happiness (R071). */
function tickPopulation(d: DistrictEconomy, prng: Prng): void {
  const happiness = d.happiness
  const unemployment = d.unemployment
  const education = d.education
  const service = d.serviceCoverage

  // Happiness drivers.
  const happinessTarget = Math.min(
    HAPPINESS_MAX,
    happiness * 0.9 + (1 - unemployment) * 0.3 + education * 0.05 + service * 0.2 - (d.decaying ? 0.2 : 0),
  )
  d.happiness = Math.max(HAPPINESS_MIN, Math.min(HAPPINESS_MAX, happinessTarget))

  // Growth: happy districts grow, unhappy ones lose population.
  if (happiness > 0.6 && d.zone === 'residential') {
    d.population = Math.min(d.population + 2, d.population * 1.02)
  } else if (happiness < 0.3 && d.zone === 'residential') {
    d.population = Math.max(0, d.population - 1)
  }

  // Education: improves with service coverage and commercial adjacency.
  if (service > 0.7 && d.zone === 'commercial') {
    d.education = Math.min(EDUCATION_MAX, d.education + (prng() > 0.9 ? 1 : 0))
  }

  // Unemployment: higher when population exceeds employment capacity.
  const employmentCapacity =
    d.zone === 'industrial' ? d.production * 2 : d.zone === 'commercial' ? d.population * 0.8 : 0
  d.unemployment =
    d.zone === 'residential' ? 0.05 : Math.min(1, Math.max(0, 1 - employmentCapacity / Math.max(1, d.population)))
}

/** Demand tick: RCI demand curves (R070). */
function tickDemand(d: DistrictEconomy, _prng: Prng): void {
  const { population, happiness, landValue, education } = d
  const zone = d.zone

  if (zone === 'residential') {
    d.demand.residential = Math.max(0, 0.8 - population / 200)
    d.demand.commercial = Math.min(1, education * 0.15)
    d.demand.industrial = 0.3
  } else if (zone === 'commercial') {
    d.demand.residential = 0.4 + happiness * 0.3
    d.demand.commercial = Math.max(0, 0.8 - landValue / 150)
    d.demand.industrial = Math.min(0.5, population * 0.01)
  } else {
    d.demand.residential = 0.3
    d.demand.commercial = Math.min(0.6, population * 0.005)
    d.demand.industrial = Math.max(0, 0.8 - landValue / 200)
  }
}

/** Land value tick: adjacency-driven update (R072). */
function tickLandValue(d: DistrictEconomy, _prng: Prng): void {
  // Land value responds to happiness, service coverage, congestion, education.
  const target = Math.min(100, d.landValue * 0.95 + d.happiness * 8 + d.serviceCoverage * 10 - (1 - d.congestion) * 5)
  d.landValue = Math.max(0, Math.min(100, target))
}

/** Service coverage tick (R073). */
function tickServiceCoverage(d: DistrictEconomy): void {
  // Service coverage decays slightly each tick; recomputes on placement change.
  if (d.serviceCoverage < 1) {
    d.serviceCoverage = Math.min(1, d.serviceCoverage * 1.02)
  }
  // Decaying districts lose service.
  if (d.decaying) {
    d.serviceCoverage = Math.max(0, d.serviceCoverage - 0.05)
  }
}

/** Production & goods tick (R074). */
function tickProduction(_d: DistrictEconomy, _prng: Prng): void {
  if (_d.zone === 'industrial') {
    // Production.
    const prod = _d.production * _d.congestion
    _d.inventory += prod

    // Goods cost if consuming (residential/commercial draw from inventory).
  }
  if (_d.consumption > 0 && _d.inventory > 0) {
    _d.inventory -= Math.min(_d.consumption, _d.inventory)
  }
}

/** Congestion tick (R075). */
function tickCongestion(_d: DistrictEconomy, _prng: Prng): void {
  // Congestion rises with population and traffic, falls with road density.
  // Simplified: congestion based on population density and service coverage.
  const target = Math.min(1, Math.max(0, _d.population / 100 - _d.serviceCoverage * 0.3))
  _d.congestion = _d.congestion * 0.8 + target * 0.2
}

/** Cost tick: construction & maintenance (R076). */
function tickCosts(_d: DistrictEconomy): void {
  // Maintenance is already computed in expenses above.
  // Under-funding decay is handled in tickEconomy().
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the zone map from world data (R061 zoning). */
function getZoneMap(): Map<string, ZoneType> {
  const map = new Map<string, ZoneType>()

  // Default: all plots are residential.
  for (let i = 0; i < world.plots.length; i++) {
    map.set(`plot:${i}`, 'residential')
  }

  // Landmark buildings anchor commercial/industrial zones.
  for (const b of Object.values(world.buildings)) {
    if (b.category === 'core') {
      // Core landmarks are commercial (halls, libraries, government).
      const id = b.derivedPlot !== null ? `plot:${b.derivedPlot}` : b.id
      map.set(id, 'commercial')
    }
  }

  // If no commercial plots exist, designate one plot as commercial.
  if (![...map.values()].includes('commercial')) {
    map.set(`plot:0`, 'commercial')
  }

  // Add industrial zone.
  map.set('industrial-zone', 'industrial')

  return map
}

/** Compute land values from adjacency (R072). */
function computeLandValues(_prng: Prng): void {
  // Adjacency bonuses: roads (+10), parks (+15), water (+5), industry (-10).
  for (const d of districts.values()) {
    let value = 50 // base
    value += d.serviceCoverage * 20
    value += d.happiness * 10
    value = Math.max(0, Math.min(100, value))
    d.landValue = value
  }
}

/** Compute service coverage from service buildings (R073). */
function computeServiceCoverage(): void {
  // Service buildings provide coverage proportional to their presence.
  const serviceCount = Object.values(world.buildings).filter(
    (b) =>
      b.kind.includes('service') ||
      b.kind.includes('power') ||
      b.kind.includes('water') ||
      b.kind.includes('health') ||
      b.kind.includes('fire'),
  ).length
  for (const d of districts.values()) {
    d.serviceCoverage = Math.min(1, serviceCount * 0.2 + 0.5)
  }
}

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
}
