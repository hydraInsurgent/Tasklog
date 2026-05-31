import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HabitCard from '@/components/HabitCard'
import { Habit, Task } from '@/lib/api'

const habitTask: Task = {
  id: 1,
  title: 'Meditate',
  isCompleted: false,
  deadline: null,
  dueStatus: 'none',
  priority: 4,
  description: null,
  projectId: null,
  createdAt: '2026-05-01T00:00:00Z',
  completedAt: null,
  labels: [],
  recurrence: null,
  seriesId: null,
  isRecurring: false,
  isHabit: true,
  weeklyTarget: null,
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    task: habitTask,
    currentStreak: 3,
    doneToday: false,
    recentCheckIns: [],
    weeklyTarget: null,
    thisWeekCount: null,
    recentWeeks: null,
    ...overrides,
  }
}

describe('HabitCard', () => {
  it('renders the title and streak count', () => {
    render(<HabitCard habit={makeHabit({ currentStreak: 5 })} onToggle={jest.fn()} pending={false} />)
    expect(screen.getByText('Meditate')).toBeInTheDocument()
    expect(screen.getByText('5 days')).toBeInTheDocument()
  })

  it('shows "No streak yet" when the streak is zero', () => {
    render(<HabitCard habit={makeHabit({ currentStreak: 0 })} onToggle={jest.fn()} pending={false} />)
    expect(screen.getByText('No streak yet')).toBeInTheDocument()
  })

  it('renders a 7-day dot row', () => {
    const { container } = render(
      <HabitCard habit={makeHabit()} onToggle={jest.fn()} pending={false} />,
    )
    // Each day exposes an aria-label like "2026-05-28" (and " (done)" when checked).
    const dots = container.querySelectorAll('[aria-label*="-"]')
    expect(dots.length).toBe(7)
  })

  it('shows "Mark done today" when not done and "Done today" when done', () => {
    const { rerender } = render(
      <HabitCard habit={makeHabit({ doneToday: false })} onToggle={jest.fn()} pending={false} />,
    )
    expect(screen.getByRole('button', { name: /mark done today/i })).toBeInTheDocument()

    rerender(<HabitCard habit={makeHabit({ doneToday: true })} onToggle={jest.fn()} pending={false} />)
    expect(screen.getByRole('button', { name: /done today/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onToggle with the habit when the button is clicked', async () => {
    const onToggle = jest.fn()
    const habit = makeHabit()
    render(<HabitCard habit={habit} onToggle={onToggle} pending={false} />)
    await userEvent.click(screen.getByRole('button', { name: /mark done today/i }))
    expect(onToggle).toHaveBeenCalledWith(habit)
  })

  it('disables the toggle while a check-in is pending', () => {
    render(<HabitCard habit={makeHabit()} onToggle={jest.fn()} pending={true} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  // --- Frequency habits ("x times a week", #75) ---

  function makeFrequencyHabit(overrides: Partial<Habit> = {}): Habit {
    return {
      task: { ...habitTask, weeklyTarget: 3 },
      currentStreak: 2,
      doneToday: false,
      recentCheckIns: [],
      weeklyTarget: 3,
      thisWeekCount: 1,
      recentWeeks: [
        { weekStart: '2026-05-04', count: 3, status: 'met' },
        { weekStart: '2026-05-11', count: 1, status: 'partial' },
        { weekStart: '2026-05-18', count: 0, status: 'none' },
      ],
      ...overrides,
    }
  }

  it('renders a frequency habit with weekly progress, target, and a WEEK streak', () => {
    render(<HabitCard habit={makeFrequencyHabit()} onToggle={jest.fn()} pending={false} />)
    expect(screen.getByText('Meditate')).toBeInTheDocument()
    expect(screen.getByText('3x per week')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('2 weeks')).toBeInTheDocument()
  })

  it('offers a check-in (not "mark done today") any day for a frequency habit', () => {
    render(<HabitCard habit={makeFrequencyHabit({ doneToday: false })} onToggle={jest.fn()} pending={false} />)
    expect(screen.getByRole('button', { name: /check in/i })).toBeInTheDocument()
  })
})
