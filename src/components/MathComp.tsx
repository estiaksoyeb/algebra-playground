import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathProps {
  tex: string;
  display?: boolean;
  className?: string;
  /** accessible text alternative; if omitted the tex is hidden from AT */
  label?: string;
}

/**
 * Renders a trusted LaTeX string (from curriculum or our own generators) with KaTeX.
 * We never render user-entered strings as HTML: this component only receives LaTeX
 * produced by our math engine or authored curriculum content.
 */
export function MathView({ tex, display = false, className, label }: MathProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        output: 'html',
        trust: false,
      });
    } catch {
      return null;
    }
  }, [tex, display]);

  if (html === null) {
    return <span className={className}>{tex}</span>;
  }
  return (
    <span
      className={`math-${display ? 'block' : 'inline'} ${className ?? ''}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Display math in a horizontally scrollable block (safe for narrow screens). */
export function MathBlock({ tex, label }: { tex: string; label?: string }) {
  return (
    <div className="math-display">
      <MathView tex={tex} display label={label} />
    </div>
  );
}
