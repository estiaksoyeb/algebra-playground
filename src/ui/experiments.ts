import { navigate } from './router';

/** Hand-off of a saved experiment from the list into the playground workspace. */
let pending: { id: string } | null = null;

export function requestOpenExperiment(id: string): void {
  pending = { id };
}

export function takePendingExperiment(id?: string): string | null {
  if (!pending) return null;
  if (id && pending.id !== id) return null;
  const p = pending.id;
  pending = null;
  return p;
}

/** Go to the tool workspace with ?exp=<id> (white-listed in the workspace). */
export function openExperiment(tool: string, id: string): void {
  requestOpenExperiment(id);
  navigate(`/playground/${tool}`, { query: { exp: id } });
}
