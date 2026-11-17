import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onClose: () => void;
  /** Tailwind max-width class for the dialog box. */
  width?: string;
  /** When set, body and footer are wrapped in a form with this submit handler. */
  onSubmit?: (e: React.FormEvent) => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Sign-headed dialog: yellow title band, scrolling body, fixed action foot. */
export const Dialog: React.FC<DialogProps> = ({
  title,
  subtitle,
  icon,
  onClose,
  width = 'max-w-lg',
  onSubmit,
  footer,
  children
}) => {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    box?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !box) return;
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === box)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  const inner = (
    <>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </>
  );

  return createPortal(
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal ${width} outline-none`}
      >
        <div className="modal-head">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="pic">{icon}</span>
            <div className="min-w-0">
              <h2 id={titleId} className="modal-title">
                {title}
              </h2>
              {subtitle && <p className="modal-sub">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-clear btn-icon shrink-0" aria-label="Close">
            <X />
          </button>
        </div>
        {onSubmit ? (
          <form onSubmit={onSubmit} className="flex flex-col min-h-0 flex-1">
            {inner}
          </form>
        ) : (
          inner
        )}
      </div>
    </div>,
    document.body
  );
};
