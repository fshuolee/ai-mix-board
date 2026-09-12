import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, Eye, EyeOff, KeyRound, AlertCircle, X } from 'lucide-react';

export interface CensoredLockedIndicatorProps {
  onOpenUnlockModal: () => void;
  boardName?: string;
}

/**
 * Non-blocking indicator displayed on top of the blurred canvas.
 * Allows user to see that the canvas is censored and click to unlock without popping up a blocking modal automatically.
 */
export const CensoredLockedIndicator: React.FC<CensoredLockedIndicatorProps> = ({
  onOpenUnlockModal,
  boardName,
}) => {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none select-none">
      <button
        type="button"
        onClick={onOpenUnlockModal}
        className="pointer-events-auto flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gray-900/85 hover:bg-gray-900/95 border border-amber-500/40 hover:border-amber-400 text-amber-200 hover:text-white shadow-2xl backdrop-blur-lg transition-all transform hover:scale-105 cursor-pointer ring-1 ring-amber-500/20 group"
        title="點擊輸入密碼解鎖 (Alt+L)"
      >
        <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:bg-amber-500/30 transition-colors">
          <Lock className="w-4 h-4" />
        </div>
        <div className="text-left">
          <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5">
            <span>{boardName ? `畫布「${boardName}」已鎖定` : '機敏保護畫布已鎖定'}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              已保護
            </span>
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
            <span>點擊或按</span>
            <kbd className="px-1.5 py-0.2 rounded bg-gray-800 text-gray-300 font-mono text-[10px] border border-gray-700">
              Alt+L
            </kbd>
            <span>輸入密碼解鎖</span>
          </div>
        </div>
      </button>
    </div>
  );
};

export interface CensoredUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardName: string;
  projectPassword?: string;
  onUnlock: (password: string) => boolean; // returns true if success
  onSetProjectPassword: (password: string) => Promise<void>;
  onSwitchToSafeBoard?: () => void;
}

/**
 * Password unlock modal dialog.
 * Only shown when the user explicitly attempts to unlock (clicking indicator, pressing Alt+L, or clicking lock button).
 */
export const CensoredUnlockModal: React.FC<CensoredUnlockModalProps> = ({
  isOpen,
  onClose,
  boardName,
  projectPassword,
  onUnlock,
  onSetProjectPassword,
  onSwitchToSafeBoard,
}) => {
  const [inputPassword, setInputPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSettingPassword, setIsSettingPassword] = useState(!projectPassword);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsSettingPassword(!projectPassword);
      setErrorMessage('');
      setInputPassword('');
      setNewPassword('');
      setConfirmPassword('');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, projectPassword]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleUnlockSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputPassword) {
      setErrorMessage('請輸入密碼');
      return;
    }
    const success = onUnlock(inputPassword);
    if (!success) {
      setErrorMessage('密碼錯誤，請重新輸入');
      setInputPassword('');
      inputRef.current?.focus();
    } else {
      setErrorMessage('');
      onClose();
    }
  };

  const handleSetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      setErrorMessage('密碼不可為空白');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('兩次輸入的密碼不相符');
      return;
    }
    try {
      setIsSubmitting(true);
      setErrorMessage('');
      await onSetProjectPassword(newPassword.trim());
      onUnlock(newPassword.trim());
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || '密碼設定失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none bg-black/60 backdrop-blur-sm animate-fadeIn"
      onPointerDown={onClose}
    >
      {/* Floating Modal Card */}
      <div
        className="relative w-full max-w-md bg-gray-900/98 border border-gray-700/90 rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center animate-scaleIn border-t-amber-500/50"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/80 transition-colors cursor-pointer"
          title="關閉 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-inner">
          <Lock className="w-7 h-7" />
        </div>

        <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
          <span>機敏保護畫布</span>
          <span className="text-[11px] font-mono font-normal px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            已鎖定
          </span>
        </h3>

        <p className="text-xs text-gray-400 mt-1 mb-5">
          畫布 <span className="font-semibold text-gray-200">「{boardName}」</span> 已設定為機敏保護，需輸入專案密碼解鎖後方可檢視。
        </p>

        {isSettingPassword ? (
          /* Set Password Mode */
          <form onSubmit={handleSetPasswordSubmit} className="w-full space-y-3.5">
            <div className="text-left">
              <label className="block text-[11px] font-medium text-gray-300 mb-1">
                設定此專案的保護密碼 (將儲存於 Google Sheet)
              </label>
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="輸入新密碼..."
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                autoComplete="new-password"
              />
            </div>

            <div className="text-left">
              <label className="block text-[11px] font-medium text-gray-300 mb-1">
                再次確認密碼
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="再次輸入新密碼..."
                className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                autoComplete="new-password"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-400 px-1">
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="flex items-center gap-1.5 hover:text-gray-200 transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span className="text-[11px]">{showPassword ? '隱藏密碼' : '顯示明文'}</span>
              </button>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs text-left">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-medium text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '正在儲存密碼...' : '設定密碼並解鎖'}</span>
            </button>
          </form>
        ) : (
          /* Normal Unlock Mode */
          <form onSubmit={handleUnlockSubmit} className="w-full space-y-3.5">
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={inputPassword}
                onChange={e => {
                  setInputPassword(e.target.value);
                  if (errorMessage) setErrorMessage('');
                }}
                placeholder="輸入專案保護密碼..."
                className="w-full pl-3 pr-10 py-2.5 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-mono"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors p-1 cursor-pointer"
                title={showPassword ? '隱藏' : '顯示'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-1.5 p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs text-left">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex gap-2">
              {onSwitchToSafeBoard && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToSafeBoard();
                  }}
                  className="w-1/3 py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  返回主畫布
                </button>
              )}
              <button
                type="submit"
                className="flex-1 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-blue-500/25 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>解鎖畫布 (Enter)</span>
              </button>
            </div>
          </form>
        )}

        {/* Keyboard Shortcut and Session Tip */}
        <div className="mt-5 pt-3 border-t border-gray-800/80 w-full flex items-center justify-between text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 font-mono text-[10px]">
              Alt + L
            </span>
            <span>快速鎖定 / 解鎖</span>
          </span>
          <span className="text-gray-500">本輪解鎖後免重複輸入</span>
        </div>
      </div>
    </div>
  );
};

// Backwards compatibility alias
export const CensoredOverlay = CensoredUnlockModal;

interface PasswordManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPassword?: string;
  onSavePassword: (password: string) => Promise<void>;
}

export const PasswordManageModal: React.FC<PasswordManageModalProps> = ({
  isOpen,
  onClose,
  currentPassword,
  onSavePassword,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNewPassword(currentPassword || '');
      setConfirmPassword(currentPassword || '');
      setError('');
    }
  }, [isOpen, currentPassword]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      setError('密碼不可為空白');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('兩次輸入的密碼不一致');
      return;
    }
    try {
      setIsSaving(true);
      setError('');
      await onSavePassword(newPassword.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || '儲存失敗');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none"
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6 text-white animate-fadeIn">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold">專案機敏保護密碼</h3>
            <p className="text-[11px] text-gray-400">存於 Google Sheet (Settings)，套用於此專案所有機敏畫布</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs text-gray-300 mb-1 font-medium">
              {currentPassword ? '新密碼' : '設定保護密碼'}
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="輸入密碼..."
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-gray-300 mb-1 font-medium">再次確認密碼</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="再次輸入密碼..."
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400">
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="flex items-center gap-1 hover:text-gray-200 cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPassword ? '隱藏' : '顯示'}</span>
            </button>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/15 border border-red-500/30 p-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white shadow-md shadow-amber-600/20 cursor-pointer"
            >
              {isSaving ? '儲存中...' : '儲存密碼'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
