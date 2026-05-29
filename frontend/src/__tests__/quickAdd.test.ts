import { parseQuickAdd, QuickAddProject } from '@/lib/quickAdd'

// Fixed reference date: Wednesday 27 May 2026, 09:00 local. Injected so date/recurrence
// parsing is deterministic regardless of when the suite runs.
const REF = new Date(2026, 4, 27, 9, 0, 0)
const projects: QuickAddProject[] = [
  { id: 1, name: 'Work' },
  { id: 2, name: 'Personal' },
]

const parse = (text: string) => parseQuickAdd(text, projects, REF)

describe('parseQuickAdd - tokens', () => {
  it('extracts #project (known), @label, pN and cleans the title', () => {
    const r = parse('Buy milk #Work @urgent p1')
    expect(r.projectName).toBe('Work')
    expect(r.labelNames).toEqual(['urgent'])
    expect(r.priority).toBe(1)
    expect(r.cleanedTitle).toBe('Buy milk')
    expect(r.deadline).toBeUndefined()
    expect(r.recurrence).toBeUndefined()
  })

  it('recognizes an unknown #project (created downstream) and strips it from the title', () => {
    const r = parse('plan #Holiday trip')
    expect(r.projectName).toBe('Holiday') // returned as-is; resolve-or-create happens on submit
    expect(r.cleanedTitle).not.toContain('#Holiday')
    expect(r.cleanedTitle).toBe('plan trip')
  })

  it('collects multiple @labels', () => {
    const r = parse('task @home @errand')
    expect(r.labelNames).toEqual(['home', 'errand'])
    expect(r.cleanedTitle).toBe('task')
  })

  it('the last pN wins', () => {
    expect(parse('x p3 p1').priority).toBe(1)
  })

  it('plain title - nothing recognized', () => {
    const r = parse('just a normal task')
    expect(r.cleanedTitle).toBe('just a normal task')
    expect(r.tokens).toHaveLength(0)
    expect(r.deadline).toBeUndefined()
    expect(r.recurrence).toBeUndefined()
  })
})

describe('parseQuickAdd - dates (chrono)', () => {
  it('date-only phrase -> YYYY-MM-DD (no time)', () => {
    const r = parse('report friday')
    expect(r.deadline).toBe('2026-05-29') // the Friday after Wed 27 May
    expect(r.cleanedTitle).toBe('report')
  })

  it('explicit time -> timed deadline', () => {
    const r = parse('call tomorrow at 4pm')
    expect(r.deadline).toBe('2026-05-28T16:00')
    expect(r.cleanedTitle).toBe('call')
  })

  it('absolute date', () => {
    const r = parse('submit taxes jan 27')
    expect(r.deadline).toBe('2026-01-27')
  })

  it('relative offset "in 3 days"', () => {
    expect(parse('ping in 3 days').deadline).toBe('2026-05-30')
  })
})

describe('parseQuickAdd - recurrence', () => {
  const cases: [string, string][] = [
    ['water plants every day', 'FREQ=DAILY'],
    ['x every 3 days', 'FREQ=DAILY;INTERVAL=3'],
    ['standup every weekday', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
    ['gym every monday and wednesday', 'FREQ=WEEKLY;BYDAY=MO,WE'],
    ['review every other monday', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO'],
    ['board meeting every 3rd thursday', 'FREQ=MONTHLY;BYDAY=3TH'],
    ['payroll every last friday', 'FREQ=MONTHLY;BYDAY=-1FR'],
    ['rent every 1st', 'FREQ=MONTHLY;BYMONTHDAY=1'],
    ['report every last day', 'FREQ=MONTHLY;BYMONTHDAY=-1'],
    ['sync every week', 'FREQ=WEEKLY;BYDAY=WE'], // anchored to the ref weekday (Wed)
    ['bill every month', 'FREQ=MONTHLY;BYMONTHDAY=27'], // anchored to the ref day
  ]
  it.each(cases)('parses "%s"', (text, rule) => {
    expect(parse(text).recurrence).toBe(rule)
  })

  it('strips the recurrence phrase from the title', () => {
    expect(parse('water plants every day').cleanedTitle).toBe('water plants')
  })

  it('end condition: until <date> -> UNTIL', () => {
    expect(parse('standup every day until friday').recurrence).toBe('FREQ=DAILY;UNTIL=20260529')
  })

  it('end condition: [for] N times -> COUNT', () => {
    expect(parse('habit every day for 5 times').recurrence).toBe('FREQ=DAILY;COUNT=5')
  })
})

describe('parseQuickAdd - combined', () => {
  it('parses a full Todoist-style line', () => {
    const r = parse('Send email to Mark #Work @urgent p1 every week')
    expect(r.projectName).toBe('Work')
    expect(r.labelNames).toEqual(['urgent'])
    expect(r.priority).toBe(1)
    expect(r.recurrence).toBe('FREQ=WEEKLY;BYDAY=WE')
    expect(r.cleanedTitle).toBe('Send email to Mark')
  })

  it('recurrence takes "friday" so a separate one-off date is not double-claimed', () => {
    // "every friday" is recurrence; there is no leftover one-off date.
    const r = parse('drinks every friday')
    expect(r.recurrence).toBe('FREQ=WEEKLY;BYDAY=FR')
    expect(r.deadline).toBeUndefined()
    expect(r.cleanedTitle).toBe('drinks')
  })

  it('bare multi-weekday list -> those days once, ending on the last (the user case)', () => {
    const r = parse('Email to mark on friday and saturday #Personal')
    // Weekly on Fri+Sat, anchored this Friday, ending this Saturday (so it stops after Sat).
    expect(r.recurrence).toBe('FREQ=WEEKLY;BYDAY=FR,SA;UNTIL=20260530')
    expect(r.deadline).toBe('2026-05-29')
    expect(r.projectName).toBe('Personal')
    expect(r.cleanedTitle).toBe('Email to mark')
  })

  it('"every <weekdays>" stays an ongoing repeat (no end date)', () => {
    expect(parse('drinks every friday and saturday').recurrence).toBe('FREQ=WEEKLY;BYDAY=FR,SA')
  })

  it('a single bare weekday is a one-off date, not a repeat', () => {
    const r = parse('report friday')
    expect(r.recurrence).toBeUndefined()
    expect(r.deadline).toBe('2026-05-29')
  })

  it('reports recognized token spans in order', () => {
    const r = parse('Buy milk #Work p2')
    expect(r.tokens.map((t) => t.type)).toEqual(['project', 'priority'])
    // spans point at the real substrings
    for (const t of r.tokens) {
      expect('Buy milk #Work p2'.slice(t.start, t.end)).toBe(t.text)
    }
  })
})
