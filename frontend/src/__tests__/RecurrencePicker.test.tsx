import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecurrencePicker from '@/components/RecurrencePicker'

// 2026-05-27 is a Wednesday, day-of-month 27 - used to check the weekday/day-of-month
// defaults the picker seeds when switching to weekly/monthly.
const DEADLINE = '2026-05-27'

describe('RecurrencePicker', () => {
  it('disables and hints when there is no deadline', () => {
    render(<RecurrencePicker value={null} onChange={jest.fn()} />)
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByText(/set a deadline/i)).toBeInTheDocument()
  })

  it('emits FREQ=DAILY when Daily is selected', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'daily')
    expect(onChange).toHaveBeenCalledWith('FREQ=DAILY')
  })

  it('seeds the deadline weekday when switching to Weekly', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'weekly')
    // 2026-05-27 is a Wednesday.
    expect(onChange).toHaveBeenCalledWith('FREQ=WEEKLY;BYDAY=WE')
    expect(screen.getByRole('button', { name: 'Wednesday' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('seeds the deadline day-of-month when switching to Monthly', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value={null} onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'monthly')
    expect(onChange).toHaveBeenCalledWith('FREQ=MONTHLY;BYMONTHDAY=27')
  })

  it('renders the initial rule (weekly Monday pre-selected)', () => {
    render(<RecurrencePicker value="FREQ=WEEKLY;BYDAY=MO" onChange={jest.fn()} deadline={DEADLINE} />)
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('emits null when set back to "Does not repeat"', async () => {
    const onChange = jest.fn()
    render(<RecurrencePicker value="FREQ=DAILY" onChange={onChange} deadline={DEADLINE} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'none')
    expect(onChange).toHaveBeenCalledWith(null)
  })
})
