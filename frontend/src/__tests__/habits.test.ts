import { applyOptimisticCheckIn } from '@/lib/habits'
import { Habit, Task } from '@/lib/api'

const baseTask: Task = {
  id: 1,
  title: 'Gym',
  description: null,
  deadline: null,
  dueStatus: 'none',
  priority: 4,
  createdAt: '2026-05-01T00:00:00Z',
  isCompleted: false,
  completedAt: null,
  projectId: null,
  labels: [],
  recurrence: null,
  seriesId: null,
  isRecurring: false,
  isHabit: true,
  weeklyTarget: null,
}

const KEY = '2026-05-31'

// A frequency habit: target 4, current week empty, a 2-week streak going in.
function freqHabit(over: Partial<Habit> = {}): Habit {
  return {
    task: { ...baseTask, weeklyTarget: 4 },
    currentStreak: 2,
    doneToday: false,
    recentCheckIns: [],
    weeklyTarget: 4,
    thisWeekCount: 0,
    recentWeeks: [
      { weekStart: '2026-05-18', count: 4, status: 'met' },
      { weekStart: '2026-05-25', count: 0, status: 'none' }, // current week (last)
    ],
    ...over,
  }
}

describe('applyOptimisticCheckIn - frequency habit', () => {
  it('first check-in of the week: count 0->1, week streak +1, current cell -> partial', () => {
    const r = applyOptimisticCheckIn(freqHabit(), true, KEY)
    expect(r.doneToday).toBe(true)
    expect(r.thisWeekCount).toBe(1)
    expect(r.currentStreak).toBe(3) // crossed 0->1, so the week now counts
    expect(r.recentWeeks![1]).toMatchObject({ count: 1, status: 'partial' })
    expect(r.recentCheckIns).toEqual([KEY])
  })

  it('second check-in same week: count 1->2, streak unchanged, still partial', () => {
    const start = freqHabit({
      thisWeekCount: 1,
      currentStreak: 3,
      doneToday: false,
      recentWeeks: [
        { weekStart: '2026-05-18', count: 4, status: 'met' },
        { weekStart: '2026-05-25', count: 1, status: 'partial' },
      ],
    })
    const r = applyOptimisticCheckIn(start, true, KEY)
    expect(r.thisWeekCount).toBe(2)
    expect(r.currentStreak).toBe(3) // already counted this week, no double-bump
    expect(r.recentWeeks![1]).toMatchObject({ count: 2, status: 'partial' })
  })

  it('reaching the target flips the current cell to met', () => {
    const start = freqHabit({
      task: { ...baseTask, weeklyTarget: 2 },
      weeklyTarget: 2,
      thisWeekCount: 1,
      recentWeeks: [{ weekStart: '2026-05-25', count: 1, status: 'partial' }],
    })
    const r = applyOptimisticCheckIn(start, true, KEY)
    expect(r.thisWeekCount).toBe(2)
    expect(r.recentWeeks![0]).toMatchObject({ count: 2, status: 'met' })
  })

  it('undoing the only check-in of the week: count 1->0, streak -1, cell -> none', () => {
    const start = freqHabit({
      thisWeekCount: 1,
      currentStreak: 3,
      doneToday: true,
      recentCheckIns: [KEY],
      recentWeeks: [
        { weekStart: '2026-05-18', count: 4, status: 'met' },
        { weekStart: '2026-05-25', count: 1, status: 'partial' },
      ],
    })
    const r = applyOptimisticCheckIn(start, false, KEY)
    expect(r.thisWeekCount).toBe(0)
    expect(r.currentStreak).toBe(2)
    expect(r.recentWeeks![1]).toMatchObject({ count: 0, status: 'none' })
    expect(r.recentCheckIns).toEqual([])
  })
})

describe('applyOptimisticCheckIn - day-pattern habit', () => {
  it('shifts the day streak by one and leaves frequency fields untouched', () => {
    const dayHabit: Habit = {
      task: { ...baseTask, weeklyTarget: null, recurrence: 'FREQ=DAILY' },
      currentStreak: 2,
      doneToday: false,
      recentCheckIns: [],
      weeklyTarget: null,
      thisWeekCount: null,
      recentWeeks: null,
    }
    const r = applyOptimisticCheckIn(dayHabit, true, KEY)
    expect(r.doneToday).toBe(true)
    expect(r.currentStreak).toBe(3)
    expect(r.recentCheckIns).toEqual([KEY])
    expect(r.thisWeekCount).toBeNull()
    expect(r.recentWeeks).toBeNull()
  })
})
