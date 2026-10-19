// @vitest-environment jsdom
/** The Comeet handoff dialog: a failed Confirm leaves a retry, never a stuck or falsely successful dialog. */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSources } from '../../cli/load-sources';
import { buildAssessmentStore } from '../../integration-demo/assessments';
import { createSimulatedComeet } from '../../integration-demo/comeet';
import { HandoffDialog } from '../../integration-demo/HandoffDialog';
import { buildDataset } from '../../pipeline';
import { SEEDED } from '../../view/activity';
import { DATA_DIR } from '../helpers';

const activity = { entries: SEEDED, people: new Map(), held: [], ready: true, unreadable: false, backend: 'memory' };
const mocks = vi.hoisted(() => ({ refreshActivity: vi.fn() }));
vi.mock('../../view/actionStore', () => ({
  refreshActivity: mocks.refreshActivity,
  useActivityState: () => activity,
}));

beforeEach(() => {
  mocks.refreshActivity.mockReset();
  mocks.refreshActivity.mockResolvedValue(activity);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const store = buildAssessmentStore(buildDataset(loadSources(DATA_DIR)));

function renderDialog() {
  const person = store.result('JOB001').candidates.find((c) => c.candidate.fullName === 'Priya Anand')!;
  const entry = store.get(person.candidate.candidateKey, 'JOB001')!;
  const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0, people: store.dataset.candidates });
  const onHandedOff = vi.fn();
  render(
    <HandoffDialog entry={entry} version={store.version} comeet={comeet} onClose={vi.fn()} onOpenComeet={vi.fn()} onHandedOff={onHandedOff} />,
  );
  return { comeet, onHandedOff, position: comeet.positionFor('JOB001')! };
}

describe('HandoffDialog when Confirm fails', () => {
  it('offers a retry when the history read fails, sends nothing, and succeeds on retry', async () => {
    const user = userEvent.setup();
    mocks.refreshActivity.mockRejectedValueOnce(new Error('Review: IndexedDB read failed'));
    const { comeet, onHandedOff, position } = renderDialog();
    const handoff = vi.spyOn(comeet, 'handoff');

    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Could not read the saved history, so nothing was sent.')).toBeTruthy();
    expect(handoff).not.toHaveBeenCalled();
    expect(screen.queryByText('Adding…')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(onHandedOff).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText(`Added to ${position.name} as Sourced.`)).toBeTruthy();
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(onHandedOff).toHaveBeenCalledTimes(1);
  });

  it('says Comeet did not answer, and offers a retry, when the handoff call itself fails', async () => {
    const user = userEvent.setup();
    const { comeet, onHandedOff } = renderDialog();
    const handoff = vi.spyOn(comeet, 'handoff').mockRejectedValueOnce(new Error('network down'));

    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Comeet did not answer. Check Comeet before trying again.')).toBeTruthy();
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('Adding…')).toBeNull();
    expect(screen.queryByText(/as Sourced\./)).toBeNull();
    expect(onHandedOff).not.toHaveBeenCalled();
  });
});
