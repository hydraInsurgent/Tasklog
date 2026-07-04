import { render, screen, fireEvent } from '@testing-library/react'
import FeelingsWheelModal from '@/components/journal/FeelingsWheelModal'

// The drill-down interaction (#85): one level at a time, tap zooms in, a pick logs
// the word AND resets the wheel to the cores (ready for the next feeling).

function setup() {
  const onSave = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(<FeelingsWheelModal onSave={onSave} onClose={onClose} />)
  return { onSave, onClose }
}

// matchMedia isn't in jsdom; the modal asks it about prefers-reduced-motion.
beforeAll(() => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
})

describe('FeelingsWheelModal drill-down', () => {
  it('starts at the seven cores', () => {
    setup()
    for (const core of ['Happy', 'Sad', 'Angry', 'Fearful', 'Bad', 'Surprised', 'Disgusted']) {
      expect(screen.getByLabelText(new RegExp(`^${core} - open`))).toBeInTheDocument()
    }
  })

  it('tapping a core zooms into its shades', () => {
    setup()
    fireEvent.click(screen.getByLabelText(/^Happy - open/))
    expect(screen.getByLabelText(/^Optimistic - open/)).toBeInTheDocument()
    // Center now offers to pick the level you're standing on.
    expect(screen.getByLabelText('Pick Happy')).toBeInTheDocument()
  })

  it('picking a leaf logs the word and resets to the cores', () => {
    setup()
    fireEvent.click(screen.getByLabelText(/^Happy - open/))
    fireEvent.click(screen.getByLabelText(/^Optimistic - open/))
    fireEvent.click(screen.getByLabelText('Pick Hopeful')) // leaf: tap IS the pick

    // Chip logged...
    expect(screen.getByLabelText('Remove Hopeful')).toBeInTheDocument()
    // ...and the wheel is back at the cores for the next feeling.
    expect(screen.getByLabelText(/^Fearful - open/)).toBeInTheDocument()
  })

  it('center pick works mid-level and derives the MoC from picks', () => {
    setup()
    fireEvent.click(screen.getByLabelText(/^Happy - open/))
    fireEvent.click(screen.getByLabelText('Pick Happy')) // center pick at depth 1

    expect(screen.getByLabelText('Remove Happy')).toHaveTextContent('540') // Happy's level rides the chip
  })

  it('back steps out one ring without picking', () => {
    setup()
    fireEvent.click(screen.getByLabelText(/^Happy - open/))
    fireEvent.click(screen.getByLabelText('Back one level'))
    expect(screen.getByLabelText(/^Happy - open/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Remove/)).not.toBeInTheDocument()
  })

  it('save sends picked words lowercased with the derived level', async () => {
    const { onSave } = setup()
    fireEvent.click(screen.getByLabelText(/^Happy - open/))
    fireEvent.click(screen.getByLabelText(/^Optimistic - open/))
    fireEvent.click(screen.getByLabelText('Pick Hopeful'))
    fireEvent.click(screen.getByLabelText('Save check-in'))

    expect(onSave).toHaveBeenCalledWith(['hopeful'], 5, 310)
  })
})
