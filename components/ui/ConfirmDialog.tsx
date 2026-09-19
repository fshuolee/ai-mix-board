import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ModalButton, ModalTone, ButtonVariant } from './Modal';
import { t, getLocale } from '../../services/i18n';

/**
 * Confirmation dialog built on Modal, plus a promise-based `useConfirm()` hook so
 * call sites read like `if (await confirm({...}))` instead of `window.confirm`.
 *
 * Cancel is always present, always focused first, and is what Escape / backdrop resolve to.
 */

export interface ConfirmAction {
  key: string;
  label: React.ReactNode;
  variant?: ButtonVariant;
  icon?: React.ReactNode;
}

export interface ConfirmOptions {
  title: React.ReactNode;
  message?: React.ReactNode;
  /** Optional list rendered in a scrollable box under the message (file names, board names…). */
  details?: string[];
  /** Header icon tone; defaults to amber for confirmations, red when the single action is destructive. */
  tone?: ModalTone;
  icon?: React.ReactNode;
  /** Explicit choices. When omitted a single `confirm` action is shown. */
  actions?: ConfirmAction[];
  /** Label for the implicit single action (ignored when `actions` is given). */
  confirmLabel?: React.ReactNode;
  /** Styles the implicit single action as destructive. */
  destructive?: boolean;
  cancelLabel?: React.ReactNode;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  isOpen: boolean;
  /** Resolves with the chosen action key, or null for cancel / Escape / backdrop. */
  onChoose: (key: string | null) => void;
  /** Keeps the dialog open with buttons disabled while an action runs. */
  busy?: boolean;
  /** Shown in the footer while busy (e.g. progress text). */
  busyLabel?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onChoose,
  title,
  message,
  details,
  tone,
  icon,
  actions,
  confirmLabel,
  destructive = false,
  cancelLabel,
  busy = false,
  busyLabel,
}) => {
  const locale = getLocale();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const resolvedActions: ConfirmAction[] = actions ?? [
    {
      key: 'confirm',
      label: confirmLabel ?? (destructive ? t('common.delete', locale) : t('common.confirm', locale)),
      variant: destructive ? 'destructive' : 'primary',
      icon: destructive ? <Trash2 /> : undefined,
    },
  ];
  const resolvedTone: ModalTone = tone ?? (destructive ? 'red' : 'amber');
  const cancel = () => onChoose(null);

  return (
    <Modal isOpen={isOpen} onClose={cancel} size="md" busy={busy} initialFocusRef={cancelRef}>
      <ModalHeader title={title} icon={icon ?? <AlertTriangle />} tone={resolvedTone} hideClose />
      {(message || (details && details.length > 0)) && (
        <ModalBody className="px-6 py-5 space-y-3">
          {message && <p className="text-sm text-gray-300 leading-relaxed">{message}</p>}
          {details && details.length > 0 && (
            <ul className="max-h-36 overflow-y-auto bg-gray-950/60 px-3 py-2 rounded-xl border border-gray-800 text-xs font-mono text-gray-300 space-y-1">
              {details.map((line, i) => (
                <li key={i} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </ModalBody>
      )}
      <ModalFooter className={busy ? 'justify-between' : ''}>
        {busy && (
          <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{busyLabel}</span>
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <ModalButton ref={cancelRef} variant="ghost" onClick={cancel} disabled={busy}>
            {cancelLabel ?? t('common.cancel', locale)}
          </ModalButton>
          {resolvedActions.map(action => (
            <ModalButton
              key={action.key}
              variant={action.variant ?? 'secondary'}
              icon={action.icon}
              onClick={() => onChoose(action.key)}
              disabled={busy}
            >
              {action.label}
            </ModalButton>
          ))}
        </div>
      </ModalFooter>
    </Modal>
  );
};

type ConfirmFn = (options: ConfirmOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Mount once near the root; `useConfirm()` anywhere below returns the promise-based confirm. */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [request, setRequest] = useState<{ options: ConfirmOptions; resolve: (key: string | null) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>(options => {
    return new Promise(resolve => {
      // A new request supersedes any pending one, which resolves as cancelled.
      setRequest(prev => {
        prev?.resolve(null);
        return { options, resolve };
      });
    });
  }, []);

  const handleChoose = (key: string | null) => {
    request?.resolve(key);
    setRequest(null);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request && <ConfirmDialog isOpen {...request.options} onChoose={handleChoose} />}
    </ConfirmContext.Provider>
  );
};

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
