import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompleteTaskButton from '@/components/CompleteTaskButton'
import { completeTask } from '@/lib/api'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({
  completeTask: jest.fn(),
}))

const mockedComplete = completeTask as jest.MockedFunction<typeof completeTask>

describe('CompleteTaskButton', () => {
  beforeEach(() => jest.clearAllMocks())

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
