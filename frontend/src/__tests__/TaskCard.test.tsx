import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TaskCard from '@/components/TaskCard'
import { Task, Project } from '@/lib/api'

// next/link renders as a plain <a> tag in the jest + nextJest environment.

const baseTask: Task = {
  id: 1,
  title: 'Buy groceries',
  isCompleted: false,
  deadline: null,
  projectId: null,
  createdAt: '2026-03-14T00:00:00Z',
  completedAt: null,
  labels: [],
}

const projects: Project[] = [
  { id: 2, name: 'Work', createdAt: '2026-03-01T00:00:00Z' },
]

function makeProps(overrides: Partial<Parameters<typeof TaskCard>[0]> = {}) {
  return {
    task: baseTask,
    projects,
    activeView: 'all' as const,
    onComplete: jest.fn(),
    onDelete: jest.fn(),
    deletingId: null,
    completingId: null,
    isHiding: false,
    ...overrides,
  }
}

describe('TaskCard', () => {
  it('renders the task title as a link to /tasks/[id]', () => {
    render(<TaskCard {...makeProps()} />)
    const link = screen.getByRole('link', { name: /buy groceries/i })
    expect(link).toHaveAttribute('href', '/tasks/1')
  })

  it('renders an unchecked checkbox when task is not completed', () => {
    render(<TaskCard {...makeProps()} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('renders a checked checkbox when task is completed', () => {
    render(<TaskCard {...makeProps({ task: { ...baseTask, isCompleted: true } })} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('calls onComplete with the task id and true when the unchecked checkbox is clicked', async () => {
    const onComplete = jest.fn()
    render(<TaskCard {...makeProps({ onComplete })} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onComplete).toHaveBeenCalledWith(1, true)
  })

  it('hides the dropdown menu by default', () => {
    render(<TaskCard {...makeProps()} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the dropdown menu when the options button is clicked', async () => {
    render(<TaskCard {...makeProps()} />)
    await userEvent.click(screen.getByRole('button', { name: /options for/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('calls onDelete with the task id when Delete is clicked from the open menu', async () => {
    const onDelete = jest.fn()
    render(<TaskCard {...makeProps({ onDelete })} />)
    await userEvent.click(screen.getByRole('button', { name: /options for/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
    expect(onDelete).toHaveBeenCalledWith(1)
  })

  it('shows "No deadline" when the task has no deadline', () => {
    render(<TaskCard {...makeProps()} />)
    expect(screen.getByText('No deadline')).toBeInTheDocument()
  })

  it('shows the formatted deadline when the task has a deadline', () => {
    render(<TaskCard {...makeProps({ task: { ...baseTask, deadline: '2026-03-20T12:00:00.000Z' } })} />)
    expect(screen.getByText('20 Mar 2026')).toBeInTheDocument()
  })

  it('shows the project name when activeView is "all"', () => {
    render(<TaskCard {...makeProps({ task: { ...baseTask, projectId: 2 }, activeView: 'all' })} />)
    expect(screen.getByText('Work')).toBeInTheDocument()
  })

  it('hides the project name when activeView is "inbox"', () => {
    render(<TaskCard {...makeProps({ task: { ...baseTask, projectId: 2 }, activeView: 'inbox' })} />)
    expect(screen.queryByText('Work')).not.toBeInTheDocument()
  })

  it('applies a line-through style to the title when the task is completed and visible', () => {
    render(<TaskCard {...makeProps({ task: { ...baseTask, isCompleted: true }, isHiding: false })} />)
    expect(screen.getByRole('link', { name: /buy groceries/i })).toHaveClass('line-through')
  })
})
