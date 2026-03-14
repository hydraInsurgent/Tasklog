import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DeleteTaskButton from '@/components/DeleteTaskButton'
import { deleteTask } from '@/lib/api'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({
  deleteTask: jest.fn(),
}))

const mockedDelete = deleteTask as jest.MockedFunction<typeof deleteTask>

describe('DeleteTaskButton', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the delete button with the correct aria-label', () => {
    render(<DeleteTaskButton taskId={1} taskTitle="Buy milk" />)

    expect(screen.getByRole('button')).toHaveAccessibleName(/delete task: buy milk/i)
  })

  it('shows an inline error when the API call fails', async () => {
    mockedDelete.mockRejectedValue(new Error('Network error'))
    render(<DeleteTaskButton taskId={1} taskTitle="Buy milk" />)

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to delete task')
    })
  })
})
