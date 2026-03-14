import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompleteTaskButton from '@/components/CompleteTaskButton'
import { completeTask } from '@/lib/api'
import { useRouter } from 'next/navigation'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

jest.mock('@/lib/api', () => ({
  completeTask: jest.fn(),
}))

const mockedComplete = completeTask as jest.MockedFunction<typeof completeTask>
const mockedUseRouter = useRouter as jest.Mock

describe('CompleteTaskButton', () => {
  const mockRefresh = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseRouter.mockReturnValue({ refresh: mockRefresh })
  })

  it('renders "Mark complete" when the task is incomplete', () => {
    render(
      <CompleteTaskButton taskId={1} taskTitle="Buy milk" isCompleted={false} />
    )

    expect(screen.getByRole('button')).toHaveAccessibleName(/mark complete: buy milk/i)
  })

  it('renders "Mark incomplete" when the task is completed', () => {
    render(
      <CompleteTaskButton taskId={1} taskTitle="Buy milk" isCompleted={true} />
    )

    expect(screen.getByRole('button')).toHaveAccessibleName(/mark incomplete: buy milk/i)
  })

  it('calls router.refresh after successfully toggling completion', async () => {
    mockedComplete.mockResolvedValue({} as any)
    render(
      <CompleteTaskButton taskId={1} taskTitle="Buy milk" isCompleted={false} />
    )

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1)
    })
  })

  it('shows an inline error when the API call fails', async () => {
    mockedComplete.mockRejectedValue(new Error('Network error'))
    render(
      <CompleteTaskButton taskId={1} taskTitle="Buy milk" isCompleted={false} />
    )

    await userEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to update task')
    })
  })
})
