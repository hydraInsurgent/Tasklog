import {
  moodShift,
  energyEod,
  rolloverCandidates,
  timeOfDayLabel,
  dayFraction,
  emptyPlan,
  MindItem,
} from '@/lib/journal'
import { MoodCheckinDto } from '@/lib/api'

function checkin(over: Partial<MoodCheckinDto>): MoodCheckinDto {
  return { id: 1, checkinAt: '2026-07-02T07:42:00', words: ['hopeful'], energy: 8, mocLevel: 310, ...over }
}

describe('moodShift', () => {
  it('is null with no check-ins', () => {
    expect(moodShift([])).toBeNull()
  })

  it('has no destination with a single check-in', () => {
    expect(moodShift([checkin({})])).toEqual({ from: 'hopeful', to: null })
  })

  it('derives from first and last check-in words', () => {
    const shift = moodShift([
      checkin({}),
      checkin({ id: 2, checkinAt: '2026-07-02T13:00:00', words: ['busy'] }),
      checkin({ id: 3, checkinAt: '2026-07-02T21:30:00', words: ['drained', 'okay'] }),
    ])
    expect(shift).toEqual({ from: 'hopeful', to: 'drained' })
  })
})

describe('energyEod', () => {
  it('is null until a second check-in exists (a morning reading is not an EOD)', () => {
    expect(energyEod([])).toBeNull()
    expect(energyEod([checkin({})])).toBeNull()
  })

  it('reads the last check-in', () => {
    expect(energyEod([checkin({}), checkin({ id: 2, energy: 2 })])).toBe(2)
  })
})

describe('rolloverCandidates', () => {
  const y: MindItem[] = [
    { text: 'Career Kit feedback', cleared: false },
    { text: 'Blog publish', cleared: true },
  ]

  it('is empty with no yesterday entry', () => {
    expect(rolloverCandidates(undefined, [])).toEqual([])
  })

  it('surfaces only uncleared items', () => {
    // Cleared yesterday = consciously closed; it does not haunt today.
    expect(rolloverCandidates(y, [])).toEqual(['Career Kit feedback'])
  })

  it('drops items today already adopted or rewrote', () => {
    expect(rolloverCandidates(y, [{ text: 'Career Kit feedback', cleared: false }])).toEqual([])
  })
})

describe('date helpers', () => {
  it('timeOfDayLabel formats HH:mm from a local ISO string', () => {
    expect(timeOfDayLabel('2026-07-02T07:05:00')).toBe('07:05')
    expect(timeOfDayLabel('2026-07-02T21:42:00')).toBe('21:42')
  })

  it('dayFraction maps the local clock onto 0..1 for the arc x-axis', () => {
    expect(dayFraction('2026-07-02T00:00:00')).toBe(0)
    expect(dayFraction('2026-07-02T12:00:00')).toBeCloseTo(0.5)
    expect(dayFraction('2026-07-02T18:00:00')).toBeCloseTo(0.75)
  })
})

describe('emptyPlan', () => {
  it('has all three buckets, empty', () => {
    expect(emptyPlan()).toEqual({ buckets: { non_negotiable: [], if_energy: [], easy_wins: [] } })
  })
})
