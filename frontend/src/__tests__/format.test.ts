import { deadlineColorClass, formatDate, projectName } from '@/lib/format'

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
