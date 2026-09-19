import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Shared modal shell. Every dialog in the app renders through this so overlay,
 * sizing, Escape / backdrop dismissal, focus handling and ARIA wiring live in one place.
 *
 * Usage:
 *   <Modal isOpen={open} onClose={close} size="md">
 *     <ModalHeader icon={<Trash2 />} tone="amber" title="..." subtitle="..." onClose={close} />
 *     <ModalBody>...</ModalBody>
 *     <ModalFooter>...</ModalFooter>
 *   </Modal>
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
export type ModalTone = 'gray' | 'blue' | 'emerald' | 'amber' | 'red' | 'indigo' | 'brand';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
};

/** Icon chip colours for ModalHeader, keyed by semantic tone. */
const TONE_CLASS: Record<ModalTone, string> = {
  gray: 'bg-gray-800 text-gray-300 border-gray-700',
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  red: 'bg-red-500/10 text-red-400 border-red-500/25',
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
  brand: 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white border-transparent shadow-lg',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalContextValue {
  titleId: string;
  onClose: () => void;
  busy: boolean;
}
const ModalContext = React.createContext<ModalContextValue | null>(null);

/**
 * Stack of open modals (bottom → top). Only the topmost handles Escape / Tab, and app-level
 * shortcut handlers stand down while anything is on the stack.
 */
const openModalStack: symbol[] = [];
export const isAnyModalOpen = () => openModalStack.length > 0;

export interface ModalProps {
  isOpen: boolean;
  /** Called on Escape, backdrop click, the header close button and ModalFooter cancel. */
  onClose: () => void;
  size?: ModalSize;
  /** Dense browsers (model picker, asset rescue) get the taller 90vh cap. */
  tall?: boolean;
  /** While true the dialog cannot be dismissed (an async action is in flight). */
  busy?: boolean;
  /** Set false for dialogs that must be answered explicitly (defaults to true). */
  closeOnBackdrop?: boolean;
  /** Element to focus on open; defaults to an `autoFocus` element, then the first control that isn't the close button, then the panel. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Extra classes for the panel (e.g. a fixed height). */
  className?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  size = 'md',
  tall = false,
  busy = false,
  closeOnBackdrop = true,
  initialFocusRef,
  className = '',
  children,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const idRef = useRef(Symbol('modal'));

  useEffect(() => {
    if (!isOpen) return;
    const id = idRef.current;
    openModalStack.push(id);
    return () => {
      const index = openModalStack.indexOf(id);
      if (index !== -1) openModalStack.splice(index, 1);
    };
  }, [isOpen]);

  // Focus management: remember the opener, focus into the panel, restore on close.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstControl = panel
      ? (Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[]).find(
          el => !el.hasAttribute('data-modal-close')
        )
      : undefined;
    const target =
      initialFocusRef?.current ?? (panel?.querySelector('[autofocus]') as HTMLElement | null) ?? firstControl ?? panel;
    // Defer so the portal content is in the DOM and animations have started.
    const raf = requestAnimationFrame(() => target?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      previouslyFocused.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen, initialFocusRef]);

  // Escape closes; Tab cycles inside the panel. Capture phase so app-level shortcut
  // handlers on window never see keys meant for the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (openModalStack[openModalStack.length - 1] !== idRef.current) return;
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <ModalContext.Provider value={{ titleId, onClose, busy }}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
        onMouseDown={e => {
          // Only a press that starts on the backdrop itself dismisses; drags out of inputs never do.
          if (closeOnBackdrop && !busy && e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`w-full ${SIZE_CLASS[size]} ${tall ? 'max-h-[90vh]' : 'max-h-[85vh]'} flex flex-col bg-gray-900 border border-gray-700/80 rounded-2xl shadow-2xl overflow-hidden text-gray-100 outline-none ${className}`}
        >
          {children}
        </div>
      </div>
    </ModalContext.Provider>,
    document.body
  );
};

export interface ModalHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: ModalTone;
  /** Hide the close button for dialogs that must be answered via the footer. */
  hideClose?: boolean;
  /** Extra controls rendered between the title block and the close button. */
  children?: React.ReactNode;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ title, subtitle, icon, tone = 'blue', hideClose, children }) => {
  const ctx = React.useContext(ModalContext);
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-800 bg-gray-950/60 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className={`p-2 rounded-xl border shrink-0 [&>svg]:w-5 [&>svg]:h-5 ${TONE_CLASS[tone]}`}>{icon}</div>
        )}
        <div className="min-w-0">
          <h2 id={ctx?.titleId} className="text-base font-bold text-white leading-tight truncate">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        {!hideClose && ctx && (
          <button
            type="button"
            onClick={ctx.onClose}
            disabled={ctx.busy}
            aria-label="Close"
            data-modal-close="true"
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const ModalBody: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = 'p-6 space-y-4',
  children,
}) => <div className={`flex-1 min-h-0 overflow-y-auto ${className}`}>{children}</div>;

export const ModalFooter: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`flex items-center justify-end gap-2.5 px-6 py-4 border-t border-gray-800 bg-gray-950/40 shrink-0 ${className}`}>
    {children}
  </div>
);

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'warning' | 'ghost';

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-gray-200 hover:text-white border border-gray-700',
  destructive: 'bg-red-600/90 hover:bg-red-500 text-white shadow-lg shadow-red-600/20',
  warning: 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20',
  ghost: 'text-gray-400 hover:text-white hover:bg-gray-800',
};

/** Footer button with the app's shared sizing; use inside ModalFooter for consistent dialogs. */
export const ModalButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: React.ReactNode }
>(({ variant = 'secondary', icon, className = '', children, type = 'button', ...rest }, ref) => (
  <button
    ref={ref}
    type={type}
    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${BUTTON_CLASS[variant]} ${className}`}
    {...rest}
  >
    {icon && <span className="[&>svg]:w-3.5 [&>svg]:h-3.5 flex items-center">{icon}</span>}
    {children}
  </button>
));
ModalButton.displayName = 'ModalButton';
