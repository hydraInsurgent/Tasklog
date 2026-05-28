import { deadlineColorClass, formatDate, formatDeadline, hasTimeComponent, projectName, priorityMeta, PRIORITY_OPTIONS, describeRecurrence, lastNDays } from '@/lib/format'

describe('deadlineColorClass', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    // Pin "now" to UTC midnight so date arithmetic is clean and predictable.
    jest.setSystemTime(new Date('2026-03-14T00:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns muted zinc for null (no deadline)', () => {
    expect(deadlineColorClass(null)).toBe('text-zinc-400')
  })

  it('returns red for a past deadline', () => {
    expect(deadlineColorClass('2026-03-13')).toBe('text-red-500 font-medium')
  })

  it('returns yellow for a deadline exactly today (boundary: diff = 0)', () => {
    // diff = 0 is not < 0, so it falls into the ≤ 3 branch.
    expect(deadlineColorClass('2026-03-14')).toBe('text-yellow-500 font-medium')
  })

  it('returns yellow for a deadline 3 days out (boundary: diff = 3)', () => {
    expect(deadlineColorClass('2026-03-17')).toBe('text-yellow-500 font-medium')
  })

  it('returns muted zinc for a deadline 4 days out (just outside warning range)', () => {
    expect(deadlineColorClass('2026-03-18')).toBe('text-zinc-500')
  })
})

describe('formatDate', () => {
  it('formats an ISO datetime string to a readable local date', () => {
    // Use noon UTC to avoid any midnight timezone boundary ambiguity.
    expect(formatDate('2026-03-20T12:00:00.000Z')).toBe('20 Mar 2026')
  })
})

describe('projectName', () => {
  const projects = [
    { id: 1, name: 'Work' },
    { id: 2, name: 'Personal' },
  ]

  it('returns "Inbox" for null projectId', () => {
    expect(projectName(null, projects)).toBe('Inbox')
  })

  it('returns the matching project name when found', () => {
    expect(projectName(1, projects)).toBe('Work')
  })

  it('returns "Unknown" when no project matches the id', () => {
    expect(projectName(99, projects)).toBe('Unknown')
  })
})

describe('priorityMeta', () => {
  it('P1-P3 have a dot color, P4 has none', () => {
    expect(priorityMeta(1).dotColor).toBeTruthy()
    expect(priorityMeta(2).dotColor).toBeTruthy()
    expect(priorityMeta(3).dotColor).toBeTruthy()
    expect(priorityMeta(4).dotColor).toBeNull()
  })

  it('labels are P1..P4', () => {
    expect(priorityMeta(1).label).toBe('P1')
    expect(priorityMeta(4).label).toBe('P4')
  })

  it('falls back to P4 (none) for out-of-range values', () => {
    expect(priorityMeta(0).label).toBe('P4')
    expect(priorityMeta(99).dotColor).toBeNull()
  })

  it('PRIORITY_OPTIONS lists all four in order P1..P4', () => {
    expect(PRIORITY_OPTIONS.map((o) => o.value)).toEqual([1, 2, 3, 4])
  })
})

describe('hasTimeComponent', () => {
  it('is false for a midnight (date-only) deadline', () => {
    expect(hasTimeComponent('2026-06-01T00:00:00')).toBe(false)
  })
  it('is false for a bare date string', () => {
    expect(hasTimeComponent('2026-06-01')).toBe(false)
  })
  it('is true for a non-midnight time', () => {
    expect(hasTimeComponent('2026-06-01T15:00:00')).toBe(true)
  })
})

describe('formatDeadline', () => {
  it('shows date only for a midnight deadline', () => {
    expect(formatDeadline('2026-06-01T00:00:00')).toBe('1 Jun 2026')
  })
  it('appends the time for a timed deadline', () => {
    // The exact time string is locale-formatted; assert it includes the date and a time.
    const out = formatDeadline('2026-06-01T15:00:00')
    expect(out).toContain('1 Jun 2026')
    expect(out).toMatch(/3[:.]00/)
  })
})

describe('describeRecurrence', () => {
  it('returns empty string for null', () => {
    expect(describeRecurrence(null)).toBe('')
  })
  it('describes daily', () => {
    expect(describeRecurrence('FREQ=DAILY')).toBe('Every day')
  })
  it('describes every N days', () => {
    expect(describeRecurrence('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days')
  })
  it('describes weekly with ordered weekdays', () => {
    // Input out of order normalizes to week order.
    expect(describeRecurrence('FREQ=WEEKLY;BYDAY=FR,MO,WE')).toBe('Weekly on Mon, Wed, Fri')
  })
  it('describes monthly with an ordinal', () => {
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('Monthly on the 15th')
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=1')).toBe('Monthly on the 1st')
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=22')).toBe('Monthly on the 22nd')
  })
  it('falls back to "Repeats" for an unrecognised rule', () => {
    expect(describeRecurrence('FREQ=YEARLY')).toBe('Repeats')
  })

  // v2.15.0 advanced forms
  it('describes nth-weekday and last weekday', () => {
    expect(describeRecurrence('FREQ=MONTHLY;BYDAY=3TH')).toBe('Monthly on the 3rd Thursday')
    expect(describeRecurrence('FREQ=MONTHLY;BYDAY=-1FR')).toBe('Monthly on the last Friday')
  })
  it('describes last day and from-end day', () => {
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=-1')).toBe('Monthly on the last day')
    expect(describeRecurrence('FREQ=MONTHLY;BYMONTHDAY=-2')).toBe('Monthly on the 2nd-to-last day')
  })
  it('describes weekly/monthly intervals', () => {
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe('Every 2 weeks on Mon')
    expect(describeRecurrence('FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1')).toBe('Every 3 months on the 1st')
  })
  it('appends end conditions', () => {
    expect(describeRecurrence('FREQ=DAILY;COUNT=5')).toBe('Every day, for 5 times')
    expect(describeRecurrence('FREQ=DAILY;COUNT=1')).toBe('Every day, for 1 time')
    expect(describeRecurrence('FREQ=DAILY;UNTIL=20261231')).toBe('Every day, until 31 Dec 2026')
  })
})

describe('lastNDays', () => {
  // A fixed local "today" so the window is deterministic.
  const today = new Date(2026, 4, 28) // 28 May 2026 (month is 0-based)

  it('returns N days oldest-first ending today', () => {
    const days = lastNDays([], 7, today)
    expect(days).toHaveLength(7)
    expect(days[0].date).toBe('2026-05-22')
    expect(days[6].date).toBe('2026-05-28')
    expect(days[6].isToday).toBe(true)
    expect(days[0].isToday).toBe(false)
  })

  it('marks a day done when a check-in falls on it (ignoring the time component)', () => {
    const days = lastNDays(['2026-05-28T00:00:00', '2026-05-26T09:30:00'], 7, today)
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.done]))
    expect(byDate['2026-05-28']).toBe(true)
    expect(byDate['2026-05-26']).toBe(true)
    expect(byDate['2026-05-27']).toBe(false)
  })

  it('ignores check-ins outside the window', () => {
    const days = lastNDays(['2026-05-01T00:00:00'], 7, today)
    expect(days.every((d) => !d.done)).toBe(true)
  })
})
