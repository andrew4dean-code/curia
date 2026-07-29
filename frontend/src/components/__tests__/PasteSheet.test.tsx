import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasteSheet } from '../PasteSheet';

const MOOMOO =
  'Transaction Reminder: [Order Filled] 1 contract of $TQQQ 260724 70.00P$ was sold at 1.49 on Jul 21, 2026 12:30:16 ET . [Moomoo US]';

function stubClipboard(text: string | Error) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: vi.fn(() => (text instanceof Error ? Promise.reject(text) : Promise.resolve(text))) },
  });
}

describe('PasteSheet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- remove the stub between tests
    delete navigator.clipboard;
  });

  it('reads the clipboard on open and shows what it understood', async () => {
    stubClipboard(MOOMOO);
    render(<PasteSheet onUse={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('paste-read')).toBeInTheDocument());
    const read = screen.getByTestId('paste-read');
    expect(read).toHaveTextContent('Sold to open');
    expect(read).toHaveTextContent('TQQQ');
    expect(read).toHaveTextContent('$70 PUT');
    expect(read).toHaveTextContent('$1.49 / share');
    expect(read).toHaveTextContent('$149.00'); // 1.49 x 100 x 1 contract
  });

  it('still works when the browser refuses the clipboard', async () => {
    // iOS Safari can deny readText outright. The textarea is always there, so the sheet
    // does not change shape depending on which way that went.
    stubClipboard(new Error('denied'));
    render(<PasteSheet onUse={vi.fn()} onCancel={vi.fn()} />);
    const box = await screen.findByLabelText('Confirmation');
    fireEvent.change(box, { target: { value: MOOMOO } });
    expect(screen.getByTestId('paste-read')).toHaveTextContent('TQQQ');
  });

  it('hands the parsed confirmation back, not the raw text', async () => {
    stubClipboard(MOOMOO);
    const onUse = vi.fn();
    render(<PasteSheet onUse={onUse} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('paste-read')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Fill the ticket/ }));
    expect(onUse).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'TQQQ', optType: 'PUT', strike: 70, premium: 1.49, side: 'SOLD' }),
    );
  });

  it('offers to settle, not to sell, when the contract was bought', async () => {
    stubClipboard('1 contract of $TQQQ 260724 70.00P$ was bought at 0.30');
    render(<PasteSheet onUse={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('paste-read')).toBeInTheDocument());
    expect(screen.getByTestId('paste-read')).toHaveTextContent('Bought to close');
    expect(screen.getByRole('button', { name: /Settle this contract/ })).toBeInTheDocument();
  });

  it('says so plainly when it cannot read the text, and stays disabled', async () => {
    stubClipboard('');
    render(<PasteSheet onUse={vi.fn()} onCancel={vi.fn()} />);
    const box = await screen.findByLabelText('Confirmation');
    fireEvent.change(box, { target: { value: 'my shopping list' } });
    expect(screen.getByTestId('paste-miss')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fill the ticket/ })).toBeDisabled();
  });

  it('shows nothing at all before anything has been pasted', async () => {
    stubClipboard('');
    render(<PasteSheet onUse={vi.fn()} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Confirmation')).toBeInTheDocument());
    expect(screen.queryByTestId('paste-miss')).toBeNull(); // an empty box is not an error
    expect(screen.queryByTestId('paste-read')).toBeNull();
  });

  it('reports a caller problem differently from a parse failure', async () => {
    stubClipboard(MOOMOO);
    render(<PasteSheet onUse={vi.fn()} onCancel={vi.fn()} problem="No single open contract to close." />);
    await waitFor(() => expect(screen.getByTestId('paste-problem')).toBeInTheDocument());
    expect(screen.queryByTestId('paste-miss')).toBeNull(); // the text parsed fine
  });
});
