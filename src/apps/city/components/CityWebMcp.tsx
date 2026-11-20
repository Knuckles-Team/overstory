/**
 * @file CityWebMcp.tsx
 * @description Registers the city's WebMCP tools while the city page is
 * mounted (OVERSTORY-CITY-R034, constitution R-IV), bound to the page's
 * own action seam and live read context — the same seam the UI consumes.
 * The set retires with the page: no tool survives the city route.
 */
import { useMemo } from 'react'
import { useWebMcpToolSet } from '@/lib/webmcp/provider'
import { createCityTools, type CityToolController } from '../webmcp'

export function CityWebMcp({ controller }: { controller: CityToolController }): null {
  const tools = useMemo(() => createCityTools(controller), [controller])
  useWebMcpToolSet(tools)
  return null
}
