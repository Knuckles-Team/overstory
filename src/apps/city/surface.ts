/**
 * @file surface.ts
 * @description The City {@link AppSurface} (OVERSTORY-CITY-R001). The
 * surface declares the WebMCP page binding that carries the city tools
 * (R034); it ships no Atlas renderers. The surface exists so the shell
 * can place the app.
 */
import { Building2 } from 'lucide-react'
import { appCapability, type AppSurface } from '@/lib/apps/contract'
import { APP_ROUTES } from './routes'

export const citySurface: AppSurface = {
  id: 'city',
  label: 'Arbora City',
  blurb: 'The platform as a living city: fleet connectors as buildings, agents on a day/night cycle.',
  icon: Building2,
  routes: APP_ROUTES,
  capability: appCapability('city'),
  webmcpPageIds: ['apps.city'],
  atlasRenderers: [],
  client: 'src/apps/city/api.ts',
}
