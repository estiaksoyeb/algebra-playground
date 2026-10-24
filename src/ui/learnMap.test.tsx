import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LearnMapPage } from './LearnPage';
import { WorldIcon } from '../components/icons';
import { __resetSessionForTests } from './useAppSession';
import { __resetStorageMemoForTests } from './useSession';
import { getStorage, resetStorage } from '../storage/repositories';
import { CURRICULUM } from '../content/curriculum';

/**
 * The learning-path map is mostly presentation, but two of its behaviours are invisible to a
 * screenshot and easy to regress: world icons must be *symbols* (never the icon identifier as
 * text), and every world must expand independently.
 */

beforeEach(async () => {
  vi.restoreAllMocks();
  __resetSessionForTests();
  resetStorage();
  __resetStorageMemoForTests();
  const repos = await getStorage();
  await repos.clearAll();
});

async function renderMap() {
  const view = render(<LearnMapPage />);
  // The map waits for stored progress; the worlds appear once the session has data.
  await screen.findByRole('heading', { level: 1, name: /learning path/i });
  await waitFor(() => expect(screen.getAllByTestId(/^world-(?!icon-)/).length).toBe(CURRICULUM.worlds.length));
  return view;
}

/** The expand/collapse button that belongs to one world section. */
function toggle(worldId: string) {
  return within(screen.getByTestId(`world-${worldId}`)).getByRole('button', { name: /(show|hide) lessons/i });
}

function lessonList(worldId: string): HTMLElement | null {
  return document.getElementById(`world-list-${worldId}`);
}

describe('Learn map — world icons', () => {
  it('renders a real icon for every world and never the icon identifier as text', async () => {
    const { container } = await renderMap();
    expect(CURRICULUM.worlds.length).toBeGreaterThan(0);
    // Prose is allowed to say "balanced"; it is not allowed to print the identifier "balance".
    const prose = Array.from(container.querySelectorAll('p, h1, h2, a, button, span'))
      .filter((el) => !el.closest('[data-testid^="world-icon-"]'))
      .map((el) => el.textContent ?? '')
      .join(' ');
    for (const world of CURRICULUM.worlds) {
      const icon = screen.getByTestId(`world-icon-${world.id}`);
      expect(icon.querySelector('svg'), `world ${world.id} must draw an svg`).not.toBeNull();
      expect(icon).toHaveTextContent('');
      // The identifier is data, not copy: it must not appear as a word anywhere on the page.
      expect(prose, `world ${world.id} leaks its identifier`).not.toMatch(new RegExp(`(?<![\\w-])${world.icon}(?![\\w-])`));
    }
  });

  it('falls back to a symbol when an identifier is unknown', () => {
    // A typo in content must still draw a symbol rather than leaking the string.
    const { container } = render(<WorldIcon icon="not-a-real-icon" />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('Learn map — expansion state', () => {
  it('starts with the world of the next lesson open', async () => {
    await renderMap();
    const first = CURRICULUM.worlds[0].id;
    expect(lessonList(first)).not.toBeNull();
    expect(toggle(first)).toHaveAttribute('aria-expanded', 'true');
    expect(toggle(CURRICULUM.worlds[1].id)).toHaveAttribute('aria-expanded', 'false');
  });

  it('opening a second world keeps the first one open', async () => {
    const user = userEvent.setup();
    await renderMap();
    const [w1, w2] = CURRICULUM.worlds;
    await user.click(toggle(w2.id));
    expect(toggle(w1.id)).toHaveAttribute('aria-expanded', 'true');
    expect(toggle(w2.id)).toHaveAttribute('aria-expanded', 'true');
    expect(lessonList(w1.id)).not.toBeNull();
    expect(lessonList(w2.id)).not.toBeNull();
  });

  it('closing one world leaves the other one open', async () => {
    const user = userEvent.setup();
    await renderMap();
    const [w1, w2] = CURRICULUM.worlds;
    await user.click(toggle(w2.id));
    await user.click(toggle(w2.id));
    expect(toggle(w2.id)).toHaveAttribute('aria-expanded', 'false');
    expect(toggle(w1.id)).toHaveAttribute('aria-expanded', 'true');
    expect(lessonList(w1.id)).not.toBeNull();
  });

  it('closing a world that is not the default leaves the default open', async () => {
    const user = userEvent.setup();
    await renderMap();
    const [w1, w2] = CURRICULUM.worlds;
    await user.click(toggle(w2.id));
    await user.click(toggle(w2.id));
    expect(toggle(w1.id)).toHaveAttribute('aria-expanded', 'true');
  });

  it('does not remount the other worlds when one expands', async () => {
    const user = userEvent.setup();
    await renderMap();
    const [w1, w2] = CURRICULUM.worlds;
    const before = screen.getByTestId(`world-${w1.id}`);
    const lesson = screen.getByTestId(`lesson-${CURRICULUM.lessons.find((l) => l.world === w1.id)!.id}`);
    await user.click(toggle(w2.id));
    expect(screen.getByTestId(`world-${w1.id}`)).toBe(before);
    expect(screen.getByTestId(`lesson-${CURRICULUM.lessons.find((l) => l.world === w1.id)!.id}`)).toBe(lesson);
    expect(window.location.hash).toBe('');
  });

  it('expanding does not navigate away', async () => {
    const user = userEvent.setup();
    await renderMap();
    const hash = window.location.hash;
    await user.click(toggle(CURRICULUM.worlds[2].id));
    expect(window.location.hash).toBe(hash);
    expect(screen.getByRole('heading', { level: 1, name: /learning path/i })).toBeInTheDocument();
  });
});

describe('Learn map — lesson cards', () => {
  it('keeps the lesson title and its metadata on separate elements', async () => {
    await renderMap();
    const lesson = CURRICULUM.lessons.find((l) => l.id === 'w1-l1-counting')!;
    const card = screen.getByTestId(`lesson-${lesson.id}`);
    const title = card.querySelector('.lesson-card-title')!;
    const meta = card.querySelector('.lesson-card-meta')!;
    expect(title).toHaveTextContent(lesson.title);
    expect(meta).not.toHaveTextContent(lesson.title.trim());
    expect(meta).toHaveTextContent(`${lesson.estimatedMinutes} min`);
    expect(meta).toHaveTextContent(`${lesson.exercises.length} exercises`);
    // The title's text ends before the metadata begins.
    expect(title.textContent!.endsWith('min')).toBe(false);
  });

  it('keeps lesson links, order and the locked note working', async () => {
    await renderMap();
    const lessons = CURRICULUM.lessons.filter((l) => l.world === CURRICULUM.worlds[0].id).sort((a, b) => a.order - b.order);
    const links = lessons.map((l) => screen.getByTestId(`lesson-${l.id}`));
    links.forEach((link, i) => expect(link).toHaveAttribute('href', `#/learn/${lessons[i].id}`));
    // Locked lessons stay openable and say why, in their own block.
    const locked = links.find((l) => l.getAttribute('data-locked') === 'true');
    if (locked) expect(locked.querySelector('.lesson-card-note')).toHaveTextContent(/finish the earlier lesson/i);
  });

  it('long world titles are not truncated or concatenated with the icon identifier', async () => {
    await renderMap();
    const long = CURRICULUM.worlds.find((w) => w.id === 'negatives')!;
    const heading = screen.getByRole('heading', { level: 2, name: new RegExp(long.title) });
    expect(heading).toHaveTextContent(`World ${long.number}`);
    expect(heading).toHaveTextContent(long.title.trim());
    expect(heading.textContent).not.toContain(long.icon);
  });
});
