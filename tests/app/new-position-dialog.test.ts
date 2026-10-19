// @vitest-environment jsdom
/** New position: editing a suggested row's text drops its source label and quote, which supported the old text. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { NewPositionDialog } from '../../integration-demo/NewPositionDialog';

afterEach(cleanup);

describe('New position dialog', () => {
  it('an edited suggested row loses "From description" and its quoted sentence', () => {
    render(createElement(NewPositionDialog, { onClose: () => {}, onCreate: () => {} }));
    const input = screen.getByRole('textbox', { name: 'Nice to have 1' });
    const row = input.closest('.np-row')!;
    expect(input).toHaveProperty('value', 'PyTorch');
    expect(row.textContent).toContain('From description');
    expect(row.querySelector('q')?.textContent).toBe('PyTorch and real-time processing are a plus.');

    fireEvent.change(input, { target: { value: 'JAX' } });
    expect(input).toHaveProperty('value', 'JAX');
    expect(row.textContent).not.toContain('From description');
    expect(row.textContent).not.toContain('AI suggestion');
    expect(row.querySelector('q')).toBeNull();
  });

  it('an edited AI suggestion loses its label too', () => {
    render(createElement(NewPositionDialog, { onClose: () => {}, onCreate: () => {} }));
    const input = screen.getByRole('textbox', { name: 'Nice to have 3' });
    const row = input.closest('.np-row')!;
    expect(row.textContent).toContain('AI suggestion');
    fireEvent.change(input, { target: { value: 'Pose tracking' } });
    expect(row.textContent).not.toContain('AI suggestion');
    expect(row.querySelector('q')).toBeNull();
  });
});
