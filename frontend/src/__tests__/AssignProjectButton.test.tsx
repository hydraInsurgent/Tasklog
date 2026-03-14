import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssignProjectButton from '@/components/AssignProjectButton'
import { assignTaskProject } from '@/lib/api'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

jest.mock('@/lib/api', () => ({
  assignTaskProject: jest.fn(),
}))

const mockedAssign = assignTaskProject as jest.MockedFunction<typeof assignTaskProject>

const projects = [
  { id: 1, name: 'Work', createdAt: '2024-01-01T00:00:00Z' },
  { id: 2, name: 'Personal', createdAt: '2024-01-01T00:00:00Z' },
]

describe('AssignProjectButton', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders with the current project pre-selected', () => {
    render(
      <AssignProjectButton taskId={1} currentProjectId={2} projects={projects} />
    )

    expect(screen.getByRole('combobox')).toHaveValue('2')
  })

  it('shows an inline error when the API call fails', async () => {
    mockedAssign.mockRejectedValue(new Error('Network error'))
    render(
      <AssignProjectButton taskId={1} currentProjectId={null} projects={projects} />
    )

    await userEvent.selectOptions(screen.getByRole('combobox'), '1')

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to update project')
    })
  })
})
