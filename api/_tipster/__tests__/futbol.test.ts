import { describe, expect, it } from 'vitest'
import {
  formaParaPrompt,
  parsearBusquedaEquipos,
  parsearUltimosEventos,
  variantesDeBusqueda,
} from '../futbol.ts'

// Fragmentos REALES de TheSportsDB (capturados 2026-09-08), reducidos a los
// campos que usan los parsers.

const BUSQUEDA_REAL_SOCIEDAD = {
  teams: [
    {
      idTeam: '133724',
      strTeam: 'Real Sociedad',
      strTeamAlternate: 'Sociedad',
      strSport: 'Soccer',
    },
  ],
}

const ULTIMOS_CRYSTAL_PALACE = {
  results: [
    {
      idEvent: '2594457',
      strEvent: 'Crystal Palace vs Middlesbrough',
      strLeague: 'EFL Cup',
      dateEvent: '2026-09-08',
      intHomeScore: '3',
      intAwayScore: '0',
      idHomeTeam: '133632',
      idAwayTeam: '133628',
    },
    {
      idEvent: '2594000',
      strEvent: 'Arsenal vs Crystal Palace',
      strLeague: 'English Premier League',
      dateEvent: '2026-09-02',
      intHomeScore: '2',
      intAwayScore: '2',
      idHomeTeam: '133604',
      idAwayTeam: '133632',
    },
    {
      idEvent: '2593000',
      strEvent: 'Crystal Palace vs Chelsea',
      strLeague: 'English Premier League',
      dateEvent: '2026-08-28',
      intHomeScore: '0',
      intAwayScore: '1',
      idHomeTeam: '133632',
      idAwayTeam: '133610',
    },
  ],
}

describe('variantesDeBusqueda', () => {
  it('quita las siglas de club iniciales como segunda variante', () => {
    expect(variantesDeBusqueda('SC Heerenveen')).toEqual(['SC Heerenveen', 'Heerenveen'])
  })

  it('sin siglas devuelve solo el nombre tal cual', () => {
    expect(variantesDeBusqueda('Real Sociedad')).toEqual(['Real Sociedad'])
  })
})

describe('parsearBusquedaEquipos', () => {
  it('encuentra el equipo por nombre exacto (sin acentos ni mayúsculas)', () => {
    expect(parsearBusquedaEquipos(BUSQUEDA_REAL_SOCIEDAD, 'real sociedad')).toEqual({
      id: '133724',
      nombre: 'Real Sociedad',
    })
  })

  it('casa también por nombre alternativo', () => {
    expect(parsearBusquedaEquipos(BUSQUEDA_REAL_SOCIEDAD, 'Sociedad')).toEqual({
      id: '133724',
      nombre: 'Real Sociedad',
    })
  })

  it('descarta deportes que no son fútbol', () => {
    const body = {
      teams: [{ idTeam: '1', strTeam: 'Real Sociedad', strSport: 'Basketball' }],
    }
    expect(parsearBusquedaEquipos(body, 'Real Sociedad')).toBeNull()
  })

  it('respuestas malformadas devuelven null sin lanzar', () => {
    expect(parsearBusquedaEquipos(null, 'x')).toBeNull()
    expect(parsearBusquedaEquipos({ teams: null }, 'x')).toBeNull()
    expect(parsearBusquedaEquipos({ teams: [42] }, 'x')).toBeNull()
  })
})

describe('parsearUltimosEventos', () => {
  it('calcula el resultado desde el punto de vista del equipo consultado', () => {
    const partidos = parsearUltimosEventos(ULTIMOS_CRYSTAL_PALACE, '133632')
    expect(partidos.map((p) => p.resultado)).toEqual(['G', 'E', 'P'])
    expect(partidos[0]).toEqual({
      fecha: '2026-09-08',
      torneo: 'EFL Cup',
      partido: 'Crystal Palace vs Middlesbrough',
      marcador: '3-0',
      resultado: 'G',
    })
  })

  it('descarta partidos sin marcador (aún no jugados) o de otros equipos', () => {
    const body = {
      results: [
        {
          strEvent: 'A vs B',
          dateEvent: '2026-09-10',
          intHomeScore: null,
          intAwayScore: null,
          idHomeTeam: '133632',
          idAwayTeam: '2',
        },
        {
          strEvent: 'C vs D',
          dateEvent: '2026-09-01',
          intHomeScore: '1',
          intAwayScore: '0',
          idHomeTeam: '3',
          idAwayTeam: '4',
        },
      ],
    }
    expect(parsearUltimosEventos(body, '133632')).toEqual([])
  })

  it('respuesta malformada devuelve lista vacía', () => {
    expect(parsearUltimosEventos(null, '1')).toEqual([])
    expect(parsearUltimosEventos({ results: 'no' }, '1')).toEqual([])
  })
})

describe('formaParaPrompt', () => {
  it('marca explícitamente a los equipos sin datos para que la IA no invente', () => {
    const texto = formaParaPrompt([
      {
        nombreAzuro: 'Crystal Palace',
        forma: {
          equipo: 'Crystal Palace',
          racha: 'G-E-P',
          ultimos: parsearUltimosEventos(ULTIMOS_CRYSTAL_PALACE, '133632'),
        },
      },
      { nombreAzuro: 'SC Telstar', forma: null },
    ])
    expect(texto).toContain('racha G-E-P')
    expect(texto).toContain('SC Telstar: SIN datos de forma reciente (no los inventes).')
  })
})
