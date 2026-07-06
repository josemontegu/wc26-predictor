import { describe, it, expect } from 'vitest'
import { scorePrediction, scorePoints, type ScoringConfig } from './scoring'

// The pool's live configuration: right result = 2, exact = +4 (→ 6 total),
// advancing = 4, penalties dropped (0).
const CONFIG: ScoringConfig = {
  points_tendency: 2,
  points_exact: 4,
  points_advance: 4,
  points_penalties: 0,
}

const pick = (h: number, a: number, adv: string, pens = false) => ({
  home_score: h,
  away_score: a,
  advancing_team: adv,
  penalties: pens,
})
const result = (
  h: number | null,
  a: number | null,
  adv: string | null,
  pens: boolean | null = false,
) => ({ home_score: h, away_score: a, advancing_team: adv, went_to_penalties: pens })

describe('scorePrediction — components', () => {
  it('awards nothing for an unplayed match (null scores)', () => {
    const s = scorePrediction(pick(2, 1, 'BRA'), result(null, null, null, null), CONFIG)
    expect(s).toEqual({
      rightResult: false,
      exact: false,
      advancingRight: false,
      penaltiesRight: false,
      points: 0,
    })
  })

  it('exact score → result + exact + advancing = 10 (perfect match)', () => {
    const s = scorePrediction(pick(2, 1, 'BRA'), result(2, 1, 'BRA'), CONFIG)
    expect(s.rightResult).toBe(true)
    expect(s.exact).toBe(true)
    expect(s.advancingRight).toBe(true)
    expect(s.points).toBe(2 + 4 + 4) // 10
  })

  it('right result, wrong score, right advancing → 2 + 4 = 6', () => {
    const s = scorePrediction(pick(3, 1, 'BRA'), result(2, 1, 'BRA'), CONFIG)
    expect(s.rightResult).toBe(true)
    expect(s.exact).toBe(false)
    expect(s.advancingRight).toBe(true)
    expect(s.points).toBe(6)
  })

  it('wrong result but right team advances (upset called via penalties) → 4', () => {
    // Predicted a 1–1 draw with BRA advancing; match ended 2–1 to BRA.
    const s = scorePrediction(pick(1, 1, 'BRA'), result(2, 1, 'BRA'), CONFIG)
    expect(s.rightResult).toBe(false)
    expect(s.advancingRight).toBe(true)
    expect(s.points).toBe(4)
  })

  it('everything wrong → 0', () => {
    const s = scorePrediction(pick(0, 1, 'ARG'), result(2, 1, 'BRA'), CONFIG)
    expect(s.points).toBe(0)
    expect(s.rightResult).toBe(false)
    expect(s.advancingRight).toBe(false)
  })

  it('a draw is a right result only when the actual match is drawn', () => {
    expect(scorePrediction(pick(1, 1, 'BRA'), result(0, 0, 'BRA'), CONFIG).rightResult).toBe(true)
    expect(scorePrediction(pick(2, 2, 'BRA'), result(1, 0, 'BRA'), CONFIG).rightResult).toBe(false)
  })

  it('exact always implies a right result', () => {
    const s = scorePrediction(pick(0, 0, 'BRA'), result(0, 0, 'BRA'), CONFIG)
    expect(s.exact).toBe(true)
    expect(s.rightResult).toBe(true)
  })
})

describe('scorePrediction — round multiplier', () => {
  it('multiplies the whole total (QF ×3 on a perfect match → 30)', () => {
    expect(scorePoints(pick(2, 1, 'BRA'), result(2, 1, 'BRA'), CONFIG, 3)).toBe(30)
  })

  it('Final ×5 on a right-result-only pick → 2 × 5 = 10', () => {
    // Right result, wrong score, and no advancing credit (advancing team differs).
    expect(scorePoints(pick(3, 1, 'BRA'), result(2, 1, 'ARG'), CONFIG, 5)).toBe(10)
  })

  it('defaults to ×1 when no multiplier is given', () => {
    expect(scorePoints(pick(2, 1, 'BRA'), result(2, 1, 'BRA'), CONFIG)).toBe(10)
  })
})

describe('scorePrediction — penalties component', () => {
  const withPens: ScoringConfig = { ...CONFIG, points_penalties: 1 }

  it('rewards correctly calling a shootout when configured', () => {
    // Drawn match that went to penalties; player called a (non-exact) draw + pens.
    const s = scorePrediction(pick(2, 2, 'BRA', true), result(1, 1, 'BRA', true), withPens, 1)
    expect(s.penaltiesRight).toBe(true)
    expect(s.exact).toBe(false)
    // advancing(4) + result(2) + penalties(1) = 7
    expect(s.points).toBe(7)
  })

  it('penalties call unknown until the match is played (null → not rewarded)', () => {
    const s = scorePrediction(pick(1, 1, 'BRA', true), result(1, 1, 'BRA', null), withPens, 1)
    expect(s.penaltiesRight).toBe(false)
  })

  it('the live config (points_penalties = 0) never adds penalty points', () => {
    const s = scorePrediction(pick(2, 2, 'BRA', true), result(1, 1, 'BRA', true), CONFIG, 1)
    expect(s.penaltiesRight).toBe(true) // correctly called
    expect(s.points).toBe(6) // but worth 0 → advancing(4) + result(2)
  })
})

describe('scorePrediction — advancing edge cases', () => {
  it('no credit when the result has no advancing team recorded yet', () => {
    expect(scorePrediction(pick(2, 1, 'BRA'), result(2, 1, null), CONFIG).advancingRight).toBe(false)
  })

  it('advancing can be the losing side (penalty upset) and still score', () => {
    // Drawn match, ARG advanced on penalties; player called a (non-exact) draw + ARG through.
    const s = scorePrediction(pick(2, 2, 'ARG'), result(1, 1, 'ARG', true), CONFIG)
    expect(s.advancingRight).toBe(true)
    expect(s.exact).toBe(false)
    expect(s.points).toBe(6) // result(2) + advancing(4)
  })
})
