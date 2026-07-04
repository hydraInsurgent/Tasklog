import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PlanSection from '@/components/journal/PlanSection'
import { emptyPlan, PlanContent } from '@/lib/journal'
import { Task } from '@/lib/api'

function task(id: number, title: string, isCompleted = false): Task {
  return {
    id,
    title,
    description: null,
    deadline: null,
    dueStatus: 'none',
    priority: 4,
    createdAt: '2026-07-01T00:00:00',
    isCompleted,
    completedAt: isCompleted ? '2026-07-02T10:00:00' : null,
    projectId: null,
    labels: [],
    recurrence: null,
    seriesId: null,
    isRecurring: false,
    isHabit: false,
    weeklyTarget: null,
  } as Task
}

function setup(over: Partial<React.ComponentProps<typeof PlanSection>> = {}) {
  const props: React.ComponentProps<typeof PlanSection> = {
    title: "Today's plan",
    plan: emptyPlan(),
    tasksById: new Map(),
    unplanned: [],
    isToday: true,
    onChange: jest.fn(),
    onCreateTask: jest.fn().mockResolvedValue(task(42, 'call bank')),
    onToggleTask: jest.fn(),
    onSearch: jest.fn().mockResolvedValue([task(7, 'Dotnetarium slot')]),
    ...over,
  }
  render(<PlanSection {...props} />)
  return props
}

describe('PlanSection combobox', () => {
  it('shows matching tasks and an explicit create row while typing', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Add or find a task for the plan'), {
      target: { value: 'dotnet' },
    })

    expect(await screen.findByText('Dotnetarium slot')).toBeInTheDocument()
    // Creation is always an explicit row - never a bare-Enter side effect.
    expect(screen.getByText(/Create task/)).toBeInTheDocument()
  })

  it('adds an existing task to the selected bucket', async () => {
    const props = setup()
    fireEvent.change(screen.getByLabelText('Add or find a task for the plan'), {
      target: { value: 'dotnet' },
    })
    fireEvent.mouseDown(await screen.findByText('Dotnetarium slot'))

    const next = (props.onChange as jest.Mock).mock.calls[0][0] as PlanContent
    expect(next.buckets.non_negotiable).toEqual([7])
  })

  it('creates a task through the explicit create row and plans it', async () => {
    const props = setup()
    fireEvent.change(screen.getByLabelText('Add or find a task for the plan'), {
      target: { value: 'call bank' },
    })
    fireEvent.mouseDown(await screen.findByText(/Create task/))

    await waitFor(() => expect(props.onCreateTask).toHaveBeenCalledWith('call bank'))
    const next = (props.onChange as jest.Mock).mock.calls[0][0] as PlanContent
    expect(next.buckets.non_negotiable).toEqual([42])
  })

  it('renders a rolled-over marker for an open task on a past day', () => {
    setup({
      isToday: false,
      plan: { buckets: { non_negotiable: [7], if_energy: [], easy_wins: [] } },
      tasksById: new Map([[7, task(7, 'Dotnetarium slot')]]),
    })
    expect(screen.getByText('rolled over')).toBeInTheDocument()
  })

  it('shows the derived unplanned bucket read-only', () => {
    setup({ unplanned: [task(9, 'Fixed deploy script', true)] })
    expect(screen.getByText(/Unplanned, got done/)).toBeInTheDocument()
    expect(screen.getByText('Fixed deploy script')).toBeInTheDocument()
  })

  it('marks a deleted plan task instead of crashing', () => {
    setup({ plan: { buckets: { non_negotiable: [99], if_energy: [], easy_wins: [] } } })
    expect(screen.getByText('(deleted task)')).toBeInTheDocument()
  })
})
