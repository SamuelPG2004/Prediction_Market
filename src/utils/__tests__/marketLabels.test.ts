import { describe, expect, it } from 'vitest'
import { translateMarketLabel, translateOutcomeLabel } from '../marketLabels.ts'

describe('translateMarketLabel', () => {
  it('traduce nombres de mercado conocidos, sin importar mayúsculas', () => {
    expect(translateMarketLabel('Match Winner')).toBe('Ganador del partido')
    expect(translateMarketLabel('FULL TIME RESULT')).toBe('Resultado final')
    expect(translateMarketLabel('Total Games')).toBe('Juegos totales')
    expect(translateMarketLabel('Handicap Sets')).toBe('Hándicap de sets')
  })

  it('traduce el tramo del partido y lo pospone', () => {
    expect(translateMarketLabel('1st Set: Total Games')).toBe(
      'Juegos totales · 1er set',
    )
    expect(translateMarketLabel('2nd Half: Total Goals')).toBe(
      'Goles totales · 2ª parte',
    )
    expect(translateMarketLabel('3rd Quarter: Winner')).toBe(
      'Ganador · 3er cuarto',
    )
  })

  it('traduce el tramo aunque el mercado interior sea desconocido', () => {
    expect(translateMarketLabel('1st Period: Puck Line')).toBe(
      'Puck Line · 1er periodo',
    )
  })

  it('traduce el sufijo Odd/Even', () => {
    expect(translateMarketLabel('Total Games Odd/Even')).toBe(
      'Juegos totales: par/impar',
    )
  })

  it('reescribe mercados acotados a un participante', () => {
    expect(translateMarketLabel('Beatrise Zeltina - Total Games')).toBe(
      'Beatrise Zeltina · Juegos totales',
    )
  })

  it('no confunde un enfrentamiento con un mercado acotado', () => {
    expect(translateMarketLabel('Equipo A - Equipo B')).toBe('Equipo A - Equipo B')
  })

  it('devuelve intacta una etiqueta desconocida', () => {
    expect(translateMarketLabel('Exotic Special')).toBe('Exotic Special')
  })

  it('entiende el vocabulario del feed en vivo (guion y singular)', () => {
    expect(translateMarketLabel('3rd Set - Total Game')).toBe(
      'Juegos totales · 3er set',
    )
    expect(translateMarketLabel('3rd Set - Winner Of Match Set')).toBe(
      'Ganador · 3er set',
    )
    expect(translateMarketLabel('Game - Total Odd/Even Point')).toBe(
      'Partido · Puntos: par/impar',
    )
  })

  it('separa el mercado pegado al nombre del participante', () => {
    expect(translateMarketLabel('Katie Volynets Handicap Game')).toBe(
      'Katie Volynets · Hándicap de juegos',
    )
    expect(
      translateMarketLabel('2nd Set - Katie Volynets Handicap Game'),
    ).toBe('Katie Volynets · Hándicap de juegos · 2º set')
    // La clave más larga gana: no se trocea "Individual Total Point".
    expect(
      translateMarketLabel('LA Clippers Virtual Individual Total Point'),
    ).toBe('LA Clippers Virtual · Total individual de puntos')
  })
})

describe('translateOutcomeLabel', () => {
  it('traduce Over/Under conservando la línea', () => {
    expect(translateOutcomeLabel('Over (17.5)')).toBe('Más de 17.5')
    expect(translateOutcomeLabel('Under (2.5)')).toBe('Menos de 2.5')
  })

  it('traduce los resultados fijos', () => {
    expect(translateOutcomeLabel('Draw')).toBe('Empate')
    expect(translateOutcomeLabel('Odd')).toBe('Impar')
    expect(translateOutcomeLabel('Even')).toBe('Par')
    expect(translateOutcomeLabel('Yes')).toBe('Sí')
  })

  it('deja intactos los nombres de participantes, con o sin hándicap', () => {
    expect(translateOutcomeLabel('Lan Mi (-7)')).toBe('Lan Mi (-7)')
    expect(translateOutcomeLabel('Real Oviedo')).toBe('Real Oviedo')
  })
})
