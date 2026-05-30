import { occursOn, nextDueOnOrAfter } from '@/lib/recurrence'

// May 2026: 29 = Fri, 30 = Sat, 28 = Thu, 31 = Sun.
const fri = new Date(2026, 4, 29)
const sat = new Date(2026, 4, 30)
const thu = new Date(2026, 4, 28)
const sun = new Date(2026, 4, 31)

describe('occursOn', () => {
  it('treats no rule as daily (every day scheduled)', () => {
    expect(occursOn(null, fri)).toBe(true)
    expect(occursOn(undefined, thu)).toBe(true)
    expect(occursOn('FREQ=DAILY', thu)).toBe(true)
  })

  it('weekly BYDAY matches only the listed weekdays', () => {
    const rule = 'FREQ=WEEKLY;BYDAY=FR,SA'
    expect(occursOn(rule, fri)).toBe(true)
    expect(occursOn(rule, sat)).toBe(true)
    expect(occursOn(rule, thu)).toBe(false)
    expect(occursOn(rule, sun)).toBe(false)
  })

  it('monthly day-of-month + last-day', () => {
    expect(occursOn('FREQ=MONTHLY;BYMONTHDAY=29', fri)).toBe(true) // 29 May
    expect(occursOn('FREQ=MONTHLY;BYMONTHDAY=29', sat)).toBe(false)
    expect(occursOn('FREQ=MONTHLY;BYMONTHDAY=-1', new Date(2026, 4, 31))).toBe(true) // last day of May
  })

  it('monthly nth-weekday (last Friday of May 2026 = the 29th)', () => {
    expect(occursOn('FREQ=MONTHLY;BYDAY=-1FR', fri)).toBe(true)
    expect(occursOn('FREQ=MONTHLY;BYDAY=-1FR', new Date(2026, 4, 22))).toBe(false) // 22nd is also a Fri but not the last
  })

  it('nextDueOnOrAfter finds the next scheduled day', () => {
    // From Thursday, the next Fri/Sat day is Friday the 29th.
    const next = nextDueOnOrAfter('FREQ=WEEKLY;BYDAY=FR,SA', thu)
    expect(next && next.getDate()).toBe(29)
  })
})
