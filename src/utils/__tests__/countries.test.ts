import { describe, expect, it } from 'vitest'
import { countryDisplay } from '../countries.ts'

describe('countryDisplay', () => {
  it('traduce países ISO con su bandera de flagcdn y emoji de reserva', () => {
    expect(countryDisplay('Germany')).toEqual({
      label: 'Alemania',
      flagUrl: 'https://flagcdn.com/w40/de.png',
      fallback: '🇩🇪',
    })
    expect(countryDisplay('Saudi Arabia').label).toBe('Arabia Saudí')
    expect(countryDisplay('United States').label).toBe('Estados Unidos')
  })

  it('resuelve naciones constituyentes y ámbitos supranacionales', () => {
    expect(countryDisplay('England')).toEqual({
      label: 'Inglaterra',
      flagUrl: 'https://flagcdn.com/w40/gb-eng.png',
      fallback: '🌍',
    })
    expect(countryDisplay('International Tournaments')).toEqual({
      label: 'Torneos internacionales',
      flagUrl: null,
      fallback: '🌍',
    })
  })

  it('traduce el sufijo de ámbito conservando el país base', () => {
    expect(countryDisplay('Germany Amateur')).toEqual({
      label: 'Alemania Aficionado',
      flagUrl: 'https://flagcdn.com/w40/de.png',
      fallback: '🇩🇪',
    })
  })

  it('deja intacto lo que no reconoce, con globo en vez de bandera inventada', () => {
    expect(countryDisplay('ATP')).toEqual({
      label: 'ATP',
      flagUrl: null,
      fallback: '🌐',
    })
  })

  it('no distingue mayúsculas ni espacios sobrantes', () => {
    expect(countryDisplay('  spain ').label).toBe('España')
  })
})
