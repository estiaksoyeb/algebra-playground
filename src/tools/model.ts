/**
 * Tool model interface. Each model has:
 * - a pure state type S
 * - pure functions to derive its symbolic form from S
 * - pure validated operations returning either a new state or an error
 *
 * Views (React/SVG) receive S and derive every visual element from it, so the
 * equation and the picture can never drift apart.
 */
import { Expr } from '../math/expression';

export interface SymbolicView {
  /** LaTeX for the current symbolic representation */
  latex: string;
  /** plain text alternative for screen readers */
  text: string;
  /** Optional expression tree for advanced tools */
  expr?: Expr;
}

export interface Description {
  title: string;
  lines: string[];
}

export interface ToolModel<S> {
  id: string;
  label: string;
  defaultState: () => S;
  symbolic: (s: S) => SymbolicView;
  /**
   * Learner-facing explanation card. `locale` lets a model translate its prose while every
   * number and variable inside it stays ASCII. Omitted → English, which is what tests and
   * the English UI use.
   */
  describe: (s: S, locale?: string) => Description;
}
