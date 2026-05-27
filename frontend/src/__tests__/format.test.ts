import { deadlineColorClass, formatDate, formatDeadline, hasTimeComponent, projectName, priorityMeta, PRIORITY_OPTIONS, describeRecurrence } from '@/lib/format'

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
})
