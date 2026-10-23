import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaygroundPage } from './PlaygroundPage';
import { ToolWorkspace } from '../tools/ToolWorkspace';
import { __resetSessionForTests, useAppSession } from './useAppSession';
import { __resetStorageMemoForTests } from './useSession';
import { getStorage } from '../storage/repositories';
import { resetStorage } from '../storage/repositories';
import type { ExperimentRecord, Repos } from '../storage/repositories';

/**
 * Regression tests for the session facade and the saved-experiment lifecycle.
 *
 * Every test here pins down a bug that actually shipped during development and was
 * invisible to unit tests of the reducer alone. They are deliberately written against
 * the components (not the hooks) because each bug came from *where* a hook was called,
 * which is a property of the tree, not of the hook.
 */

let repos: Repos;

function experiment(overrides: Partial<ExperimentRecord> = {}): ExperimentRecord {
  const now = new Date().toISOString();
  return {
    id: 'exp-1',
    name: 'Balance one',
    tool: 'balance',
    state: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  __resetSessionForTests();
  resetStorage();
  __resetStorageMemoForTests();
  repos = await getStorage();
  await repos.clearAll();
});

describe('playground saved experiments', () => {
  it('deletes a saved experiment: confirms first, then removes the row and the stored record', async () => {
    const user = userEvent.setup();
    await repos.putExperiment(experiment());
    render(<PlaygroundPage />);

    await screen.findByText('Balance one');

    // First press only asks; nothing is deleted yet.
    await user.click(screen.getByRole('button', { name: 'Delete Balance one' }));
    expect(screen.getByText('Balance one')).toBeInTheDocument();
    expect(await repos.allExperiments()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete Balance one' })).toBeInTheDocument();
    expect(await repos.allExperiments()).toHaveLength(1);

    // Confirming removes the row *and* the record. This is the regression: a row that
    // owned its own useAppSession() facade could delete from a different session
    // instance than the list renders, so storage was emptied while the row stayed.
    await user.click(screen.getByRole('button', { name: 'Delete Balance one' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.queryByText('Balance one')).not.toBeInTheDocument());
    expect(await repos.allExperiments()).toHaveLength(0);
  });

  it('lists the saved experiment and keeps it until confirmed', async () => {
    await repos.putExperiment(experiment({ id: 'exp-a', name: 'Line one', tool: 'numberline' }));
    render(<PlaygroundPage />);
    await screen.findByText('Line one');
    expect(screen.getByRole('button', { name: 'Delete Line one' })).toBeInTheDocument();
  });
});

describe('session adoption', () => {
  it('every screen sees the same data once storage loads, including components mounting later', async () => {
    await repos.putExperiment(experiment({ id: 'exp-late', name: 'Late row' }));

    function Later() {
      const session = useAppSession();
      return <span data-testid="later-count">{session.state.data.experiments.length}</span>;
    }

    function App() {
      const session = useAppSession();
      return (
        <>
          <span data-testid="app-count">{session.state.data.experiments.length}</span>
          <Later />
        </>
      );
    }

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('app-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('later-count')).toHaveTextContent('1');
  });
});

describe('saved experiment workspace', () => {
  it('opens a saved experiment by id, showing its stored state rather than a fresh one', async () => {
    // `stateFromRaw` fills in defaults, so an empty stored object is a legitimate
    // experiment: what matters is that the loader found *something* and did not
    // report the experiment as missing while storage was still loading.
    await repos.putExperiment(experiment({ id: 'exp-open', name: 'Opening', tool: 'balance' }));

    await act(async () => {
      render(<ToolWorkspace tool="balance" experimentId="exp-open" />);
    });

    await waitFor(() => expect(screen.queryByText(/Opening your saved experiment/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/no longer exists/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('experiment-name')).toHaveValue('Opening'));
  });

  it('reports a genuinely missing experiment instead of spinning forever', async () => {
    await act(async () => {
      render(<ToolWorkspace tool="balance" experimentId="exp-does-not-exist" />);
    });
    await waitFor(() => expect(screen.queryByText(/Opening your saved experiment/i)).not.toBeInTheDocument());
    expect(screen.getByTestId('workspace-notice')).toHaveTextContent(/no longer exists/i);
  });
});
