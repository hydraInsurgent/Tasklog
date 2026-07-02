import { FEELINGS_WHEEL, MOC_ANCHORS, deriveMoc, mocBand, WheelFeeling } from '@/lib/feelingsWheel'

// The wheel is data, not code - these tests pin its integrity so a future edit
// (adding a feeling, retuning a level) cannot silently break the derived score.

const anchorLevels = new Set(MOC_ANCHORS.map((a) => a.level))

function allFeelings(): { name: string; moc: number }[] {
  const out: { name: string; moc: number }[] = []
  const walk = (f: WheelFeeling) => {
    out.push({ name: f.name, moc: f.moc })
    f.children?.forEach(walk)
  }
  FEELINGS_WHEEL.forEach((core) => {
    out.push({ name: core.core, moc: core.moc })
    core.children.forEach(walk)
  })
  return out
}

describe('FEELINGS_WHEEL dataset', () => {
  it('carries the full Roberts wheel: 7 cores, 41 secondaries, 82 tertiaries', () => {
    expect(FEELINGS_WHEEL).toHaveLength(7)
    const secondaries = FEELINGS_WHEEL.flatMap((c) => c.children)
    expect(secondaries).toHaveLength(41)
    const tertiaries = secondaries.flatMap((s) => s.children ?? [])
    expect(tertiaries).toHaveLength(82)
  })

  it('assigns every feeling a valid Hawkins anchor level', () => {
    for (const f of allFeelings()) {
      expect(anchorLevels.has(f.moc)).toBe(true)
    }
  })

  it('gives every core a color for its sector', () => {
    for (const core of FEELINGS_WHEEL) {
      expect(core.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('keeps the locked cross-case: Proud sits in Happy but maps to Pride 175', () => {
    const happy = FEELINGS_WHEEL.find((c) => c.core === 'Happy')!
    const proud = happy.children.find((s) => s.name === 'Proud')
    expect(proud?.moc).toBe(175)
  })
})

describe('deriveMoc', () => {
  it('is null for no picks - an empty check-in has no score', () => {
    expect(deriveMoc([])).toBeNull()
  })

  it('averages picked levels, rounded', () => {
    expect(deriveMoc([310])).toBe(310)
    expect(deriveMoc([540, 125])).toBe(333)
  })
})

describe('mocBand', () => {
  it('maps null to none, never to low', () => {
    expect(mocBand(null)).toBe('none')
  })

  it('breaks at 200 (courage) and 340', () => {
    expect(mocBand(199)).toBe('low')
    expect(mocBand(200)).toBe('mid')
    expect(mocBand(339)).toBe('mid')
    expect(mocBand(340)).toBe('high')
  })
})
