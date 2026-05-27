import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecurrencePicker from '@/components/RecurrencePicker'

// 2026-05-27 is a Wednesday, day-of-month 27 (the 4th Wednesday) - used to check the
// weekday / day-of-month / nth-weekday defaults the picker seeds when switching modes.
const DEADLINE = '2026-05-27'

// The mode <select> is labelled "Repeat (optional)"; scope queries to it so the
// conditional sub-control selects (Ends, Monthly type, etc.) don't make it ambiguous.
const modeSelect = () => screen.getByRole('combobox', { name: /repeat/i })

describe('RecurrencePicker', () => {
  it('disables and hints when there is no deadline', () => {
    render(<RecurrencePicker value={null} onChange={jest.fn()} />)
    expect(modeSelect()).toBeDisabled()
    expect(screen.getByText(/set a deadline/i)).toBeInTheDocument()
  })

  it('emits FREQ=DAILY when Daily is selected', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(modeSelect(), 'daily')
    expect(onChange).toHaveBeenCalledWith('FREQ=DAILY')
  })

  it('seeds the deadline weekday when switching to Weekly', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(modeSelect(), 'weekly')
    expect(onChange).toHaveBeenCalledWith('FREQ=WEEKLY;BYDAY=WE') // 2026-05-27 is a Wednesday
    expect(screen.getByRole('button', { name: 'Wednesday' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('seeds the deadline day-of-month when switching to Monthly', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(modeSelect(), 'monthly')
    expect(onChange).toHaveBeenCalledWith('FREQ=MONTHLY;BYMONTHDAY=27')
  })

  it('builds an nth-weekday rule (seeded from the deadline: 4th Wednesday)', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(modeSelect(), 'monthly')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /monthly recurrence type/i }), 'nthWeekday')
    // 2026-05-27 is the 4th Wednesday, so the seeded nth-weekday rule is 4WE.
    expect(onChange).toHaveBeenLastCalledWith('FREQ=MONTHLY;BYDAY=4WE')
  })

  it('builds a last-day rule', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(modeSelect(), 'monthly')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /monthly recurrence type/i }), 'lastDay')
    expect(onChange).toHaveBeenLastCalledWith('FREQ=MONTHLY;BYMONTHDAY=-1')
  })

  it('appends COUNT when "after N times" is chosen', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(modeSelect(), 'daily')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^ends$/i }), 'afterN')
    // Default end count is 5.
    expect(onChange).toHaveBeenLastCalledWith('FREQ=DAILY;COUNT=5')
  })

  it('renders the initial rule (weekly Monday pre-selected)', () => {
    render(<RecurrencePicker value="FREQ=WEEKLY;BYDAY=MO" onChange={jest.fn()} deadline={DEADLINE} />)
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reads an nth-weekday rule back into the controls', () => {
    render(<RecurrencePicker value="FREQ=MONTHLY;BYDAY=-1FR" onChange={jest.fn()} deadline={DEADLINE} />)
    expect(screen.getByRole('combobox', { name: /which occurrence/i })).toHaveValue('-1')
    expect(screen.getByRole('combobox', { name: /weekday/i })).toHaveValue('FR')
  })

  it('emits null when set back to "Does not repeat"', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value="FREQ=DAILY" onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(modeSelect(), 'none')
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
