import React, { useState, useEffect } from 'react';
import {
  Key,
  HardDrive,
  FileSpreadsheet,
  X,
  Check,
  LogOut,
  LogIn,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Terminal,
  Copy,
} from 'lucide-react';
import {
  getCurrentUser,
  getCustomClientId,
  setCustomClientId,
  signInWithGooglePopup,
  signOutGoogle,
  setManualAccessToken,
  tryFetchLocalGcloudToken,
  isLocalEnvironment,
} from '../services/googleAuthService';
import { getEffectiveApiKey, setCustomApiKey } from '../services/geminiService';
import { GoogleUserProfile } from '../types';

interface AuthSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: GoogleUserProfile | null;
  onAuthChange: () => void;
}

const AuthSettingsModal: React.FC<AuthSettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onAuthChange,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [gcloudLoading, setGcloudLoading] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getEffectiveApiKey());
      setClientId(getCustomClientId());
      setError(null);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSigningIn) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSigningIn, onClose]);

  if (!isOpen) return null;

  const handleSaveKeys = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomApiKey(apiKey);
    setCustomClientId(clientId);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
    onAuthChange();
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setError(null);
    try {
      if (clientId.trim()) {
        setCustomClientId(clientId);
      }
      await signInWithGooglePopup(clientId.trim() || undefined);
      onAuthChange();
    } catch (err: any) {
      setError(err.message || 'Google 登入失敗');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setError(null);
    try {
      await setManualAccessToken(manualToken.trim());
      setManualToken('');
      onAuthChange();
    } catch (err: any) {
      setError(err.message || '設定 Token 失敗');
    }
  };

  const handleFetchLocalGcloud = async () => {
    setGcloudLoading(true);
    setError(null);
    try {
      const res = await tryFetchLocalGcloudToken();
      if (res.success) {
        onAuthChange();
      } else {
        setError(res.error || '無法從本地 gcloud 取得有效 Drive Token。');
      }
    } catch (err: any) {
      setError(err.message || 'gcloud 取得失敗');
    } finally {
      setGcloudLoading(false);
    }
  };

  const handleCopyGcloudCmd = () => {
    navigator.clipboard.writeText('gcloud auth login --enable-gdrive-access');
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleSignOut = () => {
    signOutGoogle();
    onAuthChange();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-xl shadow-lg">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Google 帳號與 API 金鑰設定</h2>
              <p className="text-xs text-gray-400">
                連接 Google Drive / Sheets 雲端存取與 Gemini AI 核心金鑰
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3.5 bg-red-950/70 border border-red-700 rounded-xl text-red-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <span className="leading-relaxed whitespace-pre-wrap">{error}</span>
              </div>
              {error.includes('--enable-gdrive-access') && (
                <div className="flex items-center justify-between bg-black/50 p-2 rounded-lg border border-red-800/80 font-mono text-[11px] text-gray-200">
                  <span>gcloud auth login --enable-gdrive-access</span>
                  <button
                    onClick={handleCopyGcloudCmd}
                    className="flex items-center gap-1 px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-white rounded text-[10px]"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedCmd ? '已複製！' : '複製指令'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Section 1: Google Account Connection */}
          <div className="p-4 bg-gray-800/60 border border-gray-700/80 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-emerald-400" />
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Google 雲端硬碟 & 試算表連線</h3>
              </div>
              {user ? (
                <span className="flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  已連線 Google Drive
                </span>
              ) : (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                  尚未連線 (離線暫存模式)
                </span>
              )}
            </div>

            {user ? (
              <div className="flex items-center justify-between p-3 bg-gray-900/80 rounded-lg border border-gray-700">
                <div className="flex items-center gap-3">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt={user.name}
                      className="w-10 h-10 rounded-full border border-gray-600"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-sm">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-sm text-white">{user.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{user.email}</div>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-700/60 text-red-300 rounded-lg text-xs transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>中斷連線</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-300 leading-relaxed">
                  點擊下方按鈕以連接 Google 帳號，系統將在您的 Google Drive 建立{' '}
                  <code className="text-emerald-300 font-mono">My Drive / ai-mix-board /</code> 並將畫布節點即時儲存至 Google Sheet。
                </p>

                {/* gcloud helper prompt (Only shown in local dev) */}
                {isLocalEnvironment() && (
                  <div className="p-3 bg-gray-950/60 border border-gray-800 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-300">
                      <span className="font-semibold flex items-center gap-1.5 text-emerald-400">
                        <Terminal className="w-4 h-4" />
                        使用本機 gcloud 授權 (本地開發推薦)
                      </span>
                      <button
                        onClick={handleCopyGcloudCmd}
                        className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedCmd ? '已複製！' : '複製指令'}</span>
                      </button>
                    </div>
                    <div className="p-2 bg-black/60 rounded border border-gray-800 font-mono text-[11px] text-emerald-300">
                      gcloud auth login --enable-gdrive-access
                    </div>
                    <p className="text-[11px] text-gray-400">
                      在終端機執行上述指令完成授權後，點擊下方「讀取本機 gcloud Token」即可自動登入。
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isSigningIn}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg shadow-md transition-all"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{isSigningIn ? '登入中...' : '網頁 Google OAuth 登入'}</span>
                  </button>

                  {isLocalEnvironment() && (
                    <button
                      onClick={handleFetchLocalGcloud}
                      disabled={gcloudLoading}
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg shadow-md transition-all"
                    >
                      <Terminal className="w-4 h-4" />
                      <span>{gcloudLoading ? '檢測中...' : '讀取本機 gcloud Token'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Gemini API Key */}
          <form onSubmit={handleSaveKeys} className="p-4 bg-gray-800/60 border border-gray-700/80 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">Gemini API Key 設定</h3>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <span>取得免費 API Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                GEMINI_API_KEY (可直接在專案 <code className="text-gray-300">.env</code> 檔案填寫或在此貼上)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                autoComplete="current-password"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Optional OAuth Client ID */}
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Google OAuth 2.0 Web Client ID (選填，若使用網頁 OAuth 登入)
              </label>
              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="例如: 244200756201-xxxx.apps.googleusercontent.com"
                autoComplete="off"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-emerald-400">
                {saveSuccess && '✓ 金鑰設定已成功儲存！'}
              </span>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>儲存設定</span>
              </button>
            </div>
          </form>

          {/* Section 3: Direct Access Token (Optional Advanced Fallback) */}
          <div className="p-4 bg-gray-800/40 border border-gray-800 rounded-xl space-y-2">
            <h4 className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
              <span>進階：手動貼上 OAuth Access Token (含 Drive 權限)</span>
            </h4>
            <form onSubmit={handleManualTokenSubmit} className="flex gap-2">
              <input
                type="password"
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                placeholder="ya29.a0..."
                autoComplete="current-password"
                className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-white font-mono text-xs placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!manualToken.trim()}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors shrink-0"
              >
                套用 Token
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthSettingsModal;
