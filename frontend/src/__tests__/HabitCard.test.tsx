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
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    task: habitTask,
    currentStreak: 3,
    doneToday: false,
    recentCheckIns: [],
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
})
