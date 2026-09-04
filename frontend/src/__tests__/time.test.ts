import {
  daySegment, layoutDay, secondsOnDay, dayTotalSeconds, perActivityTotals,
  mondayOf, dayColumns, PX_PER_MIN, MIN_BLOCK_PX,
} from '@/lib/time'
import { TimeEntry } from '@/lib/api'

// Local Date constructors (month is 0-based). All math is local-time, matching storage.
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)
const NOW = new Date(2026, 5, 8, 12, 0, 0) // 8 Jun 2026, 12:00 local

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 1, taskId: 1, taskTitle: 'T', description: null, projectId: null, projectColor: null,
    clientId: null, clientName: null, clientColor: null,
    startedAt: '2026-06-08T09:00:00', endedAt: '2026-06-08T10:30:00', durationSeconds: 5400,
    ...over,
  }
}

describe('daySegment', () => {
  it('positions a same-day interval by minutes-from-midnight', () => {
    const seg = daySegment('2026-06-08T09:00:00', '2026-06-08T10:30:00', day(2026, 6, 8), NOW)!
    expect(seg.topPx).toBeCloseTo(540 * PX_PER_MIN) // 09:00 = 540 min
    expect(seg.heightPx).toBeCloseTo(90 * PX_PER_MIN) // 90 min
    expect(seg.startMin).toBe(540)
    expect(seg.endMin).toBe(630)
  })

  it('clamps a tiny interval to the minimum block height', () => {
    const seg = daySegment('2026-06-08T09:00:00', '2026-06-08T09:02:00', day(2026, 6, 8), NOW)!
    expect(seg.heightPx).toBe(MIN_BLOCK_PX)
  })

  it('splits a midnight-crossing interval across both day columns', () => {
    const s = '2026-06-07T23:30:00', e = '2026-06-08T00:30:00'
    const d7 = daySegment(s, e, day(2026, 6, 7), NOW)!
    expect(d7.startMin).toBe(1410) // 23:30
    expect(d7.endMin).toBe(1440) // clamped to midnight
    const d8 = daySegment(s, e, day(2026, 6, 8), NOW)!
    expect(d8.startMin).toBe(0)
    expect(d8.endMin).toBe(30)
  })

  it('measures a running interval to now', () => {
    const seg = daySegment('2026-06-08T11:00:00', null, day(2026, 6, 8), NOW)!
    expect(seg.endMin).toBe(720) // 12:00 = now
    expect(seg.heightPx).toBeCloseTo(60 * PX_PER_MIN)
  })

  it('returns null when the interval does not touch the day', () => {
    expect(daySegment('2026-06-08T09:00:00', '2026-06-08T10:00:00', day(2026, 6, 9), NOW)).toBeNull()
  })
})

describe('secondsOnDay + dayTotalSeconds', () => {
  it('counts only the overlap with the day', () => {
    expect(secondsOnDay('2026-06-08T09:00:00', '2026-06-08T10:30:00', day(2026, 6, 8), NOW)).toBe(5400)
    // midnight-crossing: 30 min on the 7th
    expect(secondsOnDay('2026-06-07T23:30:00', '2026-06-08T00:30:00', day(2026, 6, 7), NOW)).toBe(1800)
  })

  it('sums all entries on a day', () => {
    const entries = [entry(), entry({ id: 2, startedAt: '2026-06-08T14:00:00', endedAt: '2026-06-08T14:30:00' })]
    expect(dayTotalSeconds(entries, day(2026, 6, 8), NOW)).toBe(5400 + 1800)
  })
})

describe('perActivityTotals', () => {
  it('groups + sums by task, sorted descending', () => {
    const entries = [
      entry({ id: 1, taskId: 1, taskTitle: 'A', startedAt: '2026-06-08T09:00:00', endedAt: '2026-06-08T09:30:00' }), // 30m
      entry({ id: 2, taskId: 2, taskTitle: 'B', startedAt: '2026-06-08T10:00:00', endedAt: '2026-06-08T12:00:00' }), // 120m
      entry({ id: 3, taskId: 1, taskTitle: 'A', startedAt: '2026-06-08T13:00:00', endedAt: '2026-06-08T13:30:00' }), // 30m
    ]
    const totals = perActivityTotals(entries, [day(2026, 6, 8)], NOW)
    expect(totals).toEqual([
      { key: 't2', title: 'B', seconds: 7200 },
      { key: 't1', title: 'A', seconds: 3600 },
    ])
  })

  it('groups task-free entries by their description', () => {
    const entries = [
      entry({ id: 1, taskId: null, taskTitle: '', description: 'Sleep', startedAt: '2026-06-08T00:00:00', endedAt: '2026-06-08T06:00:00' }),
      entry({ id: 2, taskId: null, taskTitle: '', description: 'Sleep', startedAt: '2026-06-08T13:00:00', endedAt: '2026-06-08T14:00:00' }),
    ]
    const totals = perActivityTotals(entries, [day(2026, 6, 8)], NOW)
    expect(totals).toEqual([{ key: 'dsleep', title: 'Sleep', seconds: 7 * 3600 }])
  })
})

describe('layoutDay (push-down so short blocks do not overlap)', () => {
  const D = day(2026, 6, 8)

  it('pushes a colliding short block below the previous one', () => {
    // Two 1-min entries back-to-back: each forced to MIN_BLOCK_PX, so they would overlap.
    const entries = [
      entry({ id: 1, startedAt: '2026-06-08T09:00:00', endedAt: '2026-06-08T09:01:00' }),
      entry({ id: 2, startedAt: '2026-06-08T09:01:00', endedAt: '2026-06-08T09:02:00' }),
    ]
    const laid = layoutDay(entries, D, NOW)
    expect(laid).toHaveLength(2)
    // Second block starts no higher than the first block's bottom -> no overlap.
    expect(laid[1].topPx).toBeGreaterThanOrEqual(laid[0].topPx + laid[0].heightPx)
  })

  it('leaves well-separated blocks at their real positions', () => {
    const entries = [
      entry({ id: 1, startedAt: '2026-06-08T09:00:00', endedAt: '2026-06-08T10:00:00' }),
      entry({ id: 2, startedAt: '2026-06-08T14:00:00', endedAt: '2026-06-08T15:00:00' }),
    ]
    const laid = layoutDay(entries, D, NOW)
    expect(laid[0].topPx).toBeCloseTo(540 * PX_PER_MIN) // 09:00, unshifted
    expect(laid[1].topPx).toBeCloseTo(840 * PX_PER_MIN) // 14:00, unshifted (real gap preserved)
  })
})

describe('mondayOf + dayColumns', () => {
  it('mondayOf returns the Monday of the week', () => {
    const m = mondayOf(day(2026, 6, 10)) // some Wednesday-ish
    expect(m.getDay()).toBe(1) // Monday
    expect(m.getTime()).toBeLessThanOrEqual(day(2026, 6, 10).getTime())
  })

  it('dayColumns: 1 for day, 7 (Mon-first) for week', () => {
    expect(dayColumns(day(2026, 6, 10), 'day')).toHaveLength(1)
    const week = dayColumns(day(2026, 6, 10), 'week')
    expect(week).toHaveLength(7)
    expect(week[0].getDay()).toBe(1) // starts Monday
  })
})
