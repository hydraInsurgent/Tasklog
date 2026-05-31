import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskDoneControl from '@/components/TaskDoneControl'
import { Task, Habit } from '@/lib/api'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Drink water',
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
    isHabit: false,
    weeklyTarget: null,
    ...overrides,
  }
}
const habit = (doneToday: boolean): Habit => ({ task: task({ isHabit: true }), currentStreak: 0, doneToday, recentCheckIns: [], weeklyTarget: null, thisWeekCount: null, recentWeeks: null })

describe('TaskDoneControl', () => {
  it('renders a completion checkbox for a normal task and fires onComplete', async () => {
    const onComplete = jest.fn()
    render(<TaskDoneControl task={task()} onComplete={onComplete} onCheckInToggle={jest.fn()} />)
    const cb = screen.getByRole('checkbox')
    await userEvent.click(cb)
    expect(onComplete).toHaveBeenCalledWith(1, true)
  })

  it('renders a check-in toggle (not a checkbox) for a habit, and fires onCheckInToggle', async () => {
    const onCheckInToggle = jest.fn()
    const onComplete = jest.fn()
    render(
      <TaskDoneControl
        task={task({ isHabit: true })}
        habit={habit(false)}
        onComplete={onComplete}
        onCheckInToggle={onCheckInToggle}
      />,
    )
    // No checkbox - habits are checked in, never completed.
    expect(screen.queryByRole('checkbox')).toBeNull()
    const toggle = screen.getByRole('button', { name: /check in/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)
    expect(onCheckInToggle).toHaveBeenCalledWith(1)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows the habit check-in as pressed when done today', () => {
    render(<TaskDoneControl task={task({ isHabit: true })} habit={habit(true)} onComplete={jest.fn()} onCheckInToggle={jest.fn()} />)
    expect(screen.getByRole('button', { name: /undo today's check-in/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
