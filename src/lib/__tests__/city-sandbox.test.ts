import { describe, expect, it } from 'vitest'
import { isAnonymousCitySandboxRoute, isCitySandbox } from '../city-sandbox'

describe('anonymous city sandbox posture', () => {
  // spec: OVERSTORY-CITY-R001.1
  it('requires an explicit development flag and a loopback origin', () => {
    expect(isCitySandbox(undefined)).toBe(false)
    expect(isCitySandbox('true')).toBe(false)
    expect(isCitySandbox('1', 'localhost')).toBe(true)
    expect(isCitySandbox('1', 'example.com')).toBe(false)
    expect(isAnonymousCitySandboxRoute('apps.city', true)).toBe(true)
    expect(isAnonymousCitySandboxRoute('knowledge.graph', true)).toBe(false)
    expect(isAnonymousCitySandboxRoute('apps.city', false)).toBe(false)
  })
})
