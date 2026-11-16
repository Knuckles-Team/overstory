/**
 * @file routes.ts
 * @description The City app's one page. `APP_ROUTES` is merged into the one
 * route registry (`src/lib/nav-registry.ts`), so this literal is the only
 * place the city page is declared (OVERSTORY-CITY-R001).
 */
import { lazy } from 'react'
import { Building2 } from 'lucide-react'
import type { RouteDef } from '@/lib/nav-registry'

export const APP_ROUTES: readonly RouteDef[] = [
  {
    id: 'apps.city',
    path: '/apps/city',
    label: 'Arbora City',
    section: 'apps',
    blurb:
      'See the platform as a living city: every fleet connector is a building, every agent walks a day/night cycle.',
    icon: Building2,
    minRole: 'user',
    capability: 'app:city',
    mobile: 'adapted',
    element: lazy(() => import('./components/CityPage')),
  },
]
