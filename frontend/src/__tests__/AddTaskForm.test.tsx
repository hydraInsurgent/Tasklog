import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddTaskForm from '@/components/AddTaskForm'

const projects = [
  { id: 1, name: 'Work', createdAt: '2024-01-01T00:00:00Z' },
  { id: 2, name: 'Personal', createdAt: '2024-01-01T00:00:00Z' },
]

describe('AddTaskForm', () => {
  it('shows an error when submitted with an empty title', async () => {
    render(<AddTaskForm onAdd={jest.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /add task/i }))

    expect(screen.getByRole('alert')).toHaveTextContent('Title is required.')
  })

  it('calls onAdd with the trimmed title and correct projectId on valid submission', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined)
    render(<AddTaskForm onAdd={onAdd} projects={projects} defaultProjectId={1} />)

    await userEvent.type(screen.getByLabelText(/title/i), '  Buy milk  ')
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith('Buy milk', undefined, 1)
    })
  })

  it('clears title and deadline fields after successful submission', async () => {
    const onAdd = jest.fn().mockResolvedValue(undefined)
    render(<AddTaskForm onAdd={onAdd} />)

    const titleInput = screen.getByLabelText(/title/i)
    await userEvent.type(titleInput, 'Buy milk')
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))

    await waitFor(() => {
      expect(titleInput).toHaveValue('')
    })
  })

  it('shows an error message when onAdd throws', async () => {
    const onAdd = jest.fn().mockRejectedValue(new Error('Server error'))
    render(<AddTaskForm onAdd={onAdd} />)

    await userEvent.type(screen.getByLabelText(/title/i), 'Buy milk')
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error')
    })
  })

  it('syncs the selected project when defaultProjectId prop changes', async () => {
    const { rerender } = render(
      <AddTaskForm onAdd={jest.fn()} projects={projects} defaultProjectId={1} />
    )

    expect(screen.getByRole('combobox')).toHaveValue('1')

    rerender(<AddTaskForm onAdd={jest.fn()} projects={projects} defaultProjectId={2} />)

    expect(screen.getByRole('combobox')).toHaveValue('2')
  })
})
