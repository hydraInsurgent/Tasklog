import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QuickAddInput from '@/components/QuickAddInput'

const projects = [{ id: 1, name: 'Work' }, { id: 2, name: 'Personal' }]
const labels = [{ id: 1, name: 'urgent' }, { id: 2, name: 'home' }]

// Controlled harness so typing updates the value the component renders.
function Harness({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial)
  return <QuickAddInput value={v} onChange={setV} projects={projects} labels={labels} />
}

describe('QuickAddInput', () => {
  it('renders a tint span behind a recognized #project token', () => {
    const { container } = render(
      <QuickAddInput value="buy paint #Work" onChange={() => {}} projects={projects} labels={labels} />,
    )
    const tint = container.querySelector('.bg-indigo-100')
    expect(tint).not.toBeNull()
    expect(tint).toHaveTextContent('#Work')
  })

  it('does not tint an unknown #project', () => {
    const { container } = render(
      <QuickAddInput value="trip #Holiday" onChange={() => {}} projects={projects} labels={labels} />,
    )
    expect(container.querySelector('.bg-indigo-100')).toBeNull()
  })

  it('autosuggests a project when typing #', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('textbox'), 'plan #Wo')
    // The clickable suggestion is the button inside the option row.
    const btn = await screen.findByRole('button', { name: /Work/ })
    await userEvent.click(btn)
    // The token is completed (symbol + name + trailing space).
    expect(screen.getByRole('textbox')).toHaveValue('plan #Work ')
  })

  it('autosuggests a label when typing @', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('textbox'), 'task @ur')
    expect(await screen.findByRole('option', { name: /urgent/ })).toBeInTheDocument()
  })

  it('navigates suggestions with arrow keys and selects with Enter', async () => {
    render(<Harness />)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, 'plan #') // matches both Work and Personal (active = Work)
    await userEvent.keyboard('{ArrowDown}') // -> Personal
    await userEvent.keyboard('{Enter}') // select highlighted
    expect(box).toHaveValue('plan #Personal ')
  })

  it('shows a Repeat chip for a recurrence (captures repeat, not just dates)', () => {
    render(<QuickAddInput value="sync every week" onChange={() => {}} projects={projects} labels={labels} />)
    // The "Repeat" type label only appears in the captured-chips row.
    expect(screen.getByText('Repeat')).toBeInTheDocument()
  })

  it('removes (unlinks) a captured token via its chip', async () => {
    render(<Harness />)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, 'buy paint #Work')
    const remove = await screen.findByRole('button', { name: /Remove Project #Work/i })
    await userEvent.click(remove)
    expect(box).toHaveValue('buy paint')
  })
})
