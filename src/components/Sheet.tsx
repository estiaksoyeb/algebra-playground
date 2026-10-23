import { ReactNode, useEffect, useId, useRef } from 'react';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** optional footer actions */
  footer?: ReactNode;
}

/**
 * Accessible bottom sheet (mobile) / centered dialog (desktop).
 * Focus is moved into the sheet, Escape closes it, and background scrolling is locked
 * while open. Body content is rendered as normal React children (no raw HTML).
 */
export function Sheet({ open, title, onClose, children, footer }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusable = node?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && node) {
        const items = Array.from(
          node.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
        ).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="sheet-handle" aria-hidden="true" />
        <div className="row-between mb-0" style={{ marginBottom: 'var(--sp-3)' }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 'var(--fs-lg)' }}>
            {title}
          </h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close dialog">
            Close
          </button>
        </div>
        {children}
        {footer && <div className="btn-row mt-4">{footer}</div>}
      </div>
    </>
  );
}

/** Inline confirm dialog (accessible alertdialog) for destructive actions. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={danger ? 'btn btn-danger' : 'btn'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Sheet>
  );
}

export function EmptyState({ icon, title, children, level = 3 }: { icon?: ReactNode; title: string; children?: ReactNode; /** heading level; use 1 when the empty state is the whole page */ level?: 1 | 2 | 3 }) {
  const Heading = `h${level}` as 'h1' | 'h2' | 'h3';
  return (
    <div className="empty-state">
      {icon}
      <Heading style={{ color: 'var(--ink)' }}>{title}</Heading>
      {children}
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
