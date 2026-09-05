import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  ChevronDown,
  Plus,
  FileSpreadsheet,
  HardDrive,
  Sparkles,
  Settings,
  LogIn,
  Type,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Check,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Download,
} from 'lucide-react';
import { ProjectMetadata, GoogleUserProfile, SyncStatus } from '../types';
import { getModelById } from '../services/modelsConfig';
import { signInWithGooglePopup } from '../services/googleAuthService';

interface TopNavigationProps {
  projects: ProjectMetadata[];
  currentProject: ProjectMetadata | null;
  onSelectProject: (project: ProjectMetadata) => void;
  onOpenProjectModal: () => void;
  onOpenModelModal: () => void;
  onOpenAuthModal: () => void;
  selectedModelId: string;
  user: GoogleUserProfile | null;
  syncStatus: SyncStatus;
  lastSavedAt?: Date | null;
  isProjectLoading?: boolean;
  onAddTextNode: () => void;
  onUploadImage: (file: File) => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onClearCanvas: () => void;
  onExportBoardImage?: () => void;
  onDownloadAllImages?: () => void;
}

const TopNavigation: React.FC<TopNavigationProps> = ({
  projects,
  currentProject,
  onSelectProject,
  onOpenProjectModal,
  onOpenModelModal,
  onOpenAuthModal,
  selectedModelId,
  user,
  syncStatus,
  lastSavedAt,
  isProjectLoading = false,
  onAddTextNode,
  onUploadImage,
  onResetZoom,
  onZoomIn,
  onZoomOut,
  onClearCanvas,
  onExportBoardImage,
  onDownloadAllImages,
}) => {
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false);
  const [isDirectLoggingIn, setIsDirectLoggingIn] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const downloadDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modelInfo = getModelById(selectedModelId);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
      if (downloadDropdownRef.current && !downloadDropdownRef.current.contains(e.target as Node)) {
        setDownloadDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDirectGoogleLogin = async (hintEmail?: string) => {
    if (isDirectLoggingIn) return;
    setIsDirectLoggingIn(true);
    try {
      await signInWithGooglePopup(undefined, hintEmail || user?.email);
    } catch (err: any) {
      console.warn('Direct Google popup login failed', err);
      // Only open auth settings modal if Client ID is missing or invalid config
      const isMissingConfig =
        err?.message?.includes('Client ID') ||
        err?.message?.includes('尚未設定') ||
        err?.message?.includes('origin_mismatch');
      if (isMissingConfig) {
        onOpenAuthModal();
      }
    } finally {
      setIsDirectLoggingIn(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadImage(file);
      e.target.value = '';
    }
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-2.5 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/80 shadow-lg select-none">
      {/* Left Section: Logo & Project Switcher */}
      <div className="flex items-center gap-3">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 pr-2 border-r border-gray-800/80">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-md">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-sm text-white tracking-wide leading-none hidden sm:inline">
            AI MIX
          </span>
        </div>

        {/* Project Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => !isProjectLoading && setProjectDropdownOpen(!projectDropdownOpen)}
            disabled={isProjectLoading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all shadow-sm ${
              isProjectLoading
                ? 'bg-blue-950/40 border-blue-500/50 text-blue-200 cursor-wait'
                : 'bg-gray-900/90 hover:bg-gray-800 border-gray-700/80 text-white'
            }`}
            title={isProjectLoading ? '專案資料載入中...' : '切換或管理專案'}
          >
            {isProjectLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="max-w-[140px] truncate font-semibold">
              {isProjectLoading
                ? `${currentProject?.name || '專案'} (載入中)`
                : currentProject?.name || '選擇專案'}
            </span>
            <ChevronDown className={`w-3 h-3 text-gray-400 ${isProjectLoading ? 'opacity-40' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {projectDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
              <div className="p-2 border-b border-gray-800 bg-gray-950/50 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">專案列表 (Google Drive)</span>
                <button
                  onClick={() => {
                    setProjectDropdownOpen(false);
                    onOpenProjectModal();
                  }}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  <span>新增專案</span>
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto p-1.5 space-y-1">
                {projects.map(p => {
                  const isCurrent = p.id === currentProject?.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        onSelectProject(p);
                        setProjectDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                        isCurrent
                          ? 'bg-blue-600 text-white font-medium'
                          : 'text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Folder className={`w-3.5 h-3.5 ${isCurrent ? 'text-white' : 'text-emerald-400'}`} />
                        <span className="truncate">{p.name}</span>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Quick links to Google Drive & Google Sheet */}
              {currentProject && (
                <div className="p-2 border-t border-gray-800 bg-gray-950/80 flex items-center justify-around text-xs">
                  {currentProject.webViewLink && (
                    <a
                      href={currentProject.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-300 hover:text-white"
                      title="開啟專案 Drive 資料夾"
                    >
                      <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Drive 資料夾</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {currentProject.sheetViewLink && (
                    <a
                      href={currentProject.sheetViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-300 hover:text-emerald-300"
                      title="開啟專案 Google Sheet"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Google Sheet</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Compact Sync Status Pill with Tooltip */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-900/60 border border-gray-800 text-xs cursor-help select-none"
          title={
            isProjectLoading || syncStatus === 'loading'
              ? '專案資料讀取中...'
              : syncStatus === 'saving'
              ? '正在儲存同步至 Google Sheet...'
              : syncStatus === 'saved'
              ? `已同步至雲端 (${lastSavedAt ? lastSavedAt.toLocaleTimeString() : '就緒'})`
              : syncStatus === 'error'
              ? '雲端同步錯誤，請檢查帳號權限'
              : '本機離線暫存模式'
          }
        >
          {isProjectLoading || syncStatus === 'loading' ? (
            <>
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
              <span className="text-blue-300 text-[11px]">讀取中</span>
            </>
          ) : syncStatus === 'saving' ? (
            <>
              <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
              <span className="text-amber-300 text-[11px]">同步中</span>
            </>
          ) : syncStatus === 'saved' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-gray-300 text-[11px]">已同步</span>
            </>
          ) : syncStatus === 'error' ? (
            <>
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-red-300 text-[11px]">錯誤</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
              <span className="text-gray-400 text-[11px]">離線</span>
            </>
          )}
        </div>
      </div>

      {/* Center Section: Compact Single-Line Model Selector */}
      <div className="flex items-center">
        <button
          onClick={onOpenModelModal}
          disabled={isProjectLoading}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-sm transition-all group ${
            isProjectLoading
              ? 'opacity-60 cursor-not-allowed bg-gray-900/90 border-gray-800 text-gray-400'
              : 'bg-gray-900/90 hover:bg-gray-850 border-gray-700/80 hover:border-gray-600 text-white'
          }`}
          title={`目前模型：${modelInfo.name} (${modelInfo.tag}) · 點擊切換`}
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-semibold text-white max-w-[180px] truncate">
            {modelInfo.name}
          </span>
          {modelInfo.badge && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-500/15 text-amber-300 font-medium border border-amber-500/25">
              {modelInfo.badge}
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-gray-400 group-hover:text-gray-200 transition-colors" />
        </button>
      </div>

      {/* Right Section: Canvas Controls & Account */}
      <div className="flex items-center gap-2">
        {/* Canvas Toolbar Capsule */}
        <div className="flex items-center gap-0.5 bg-gray-900/90 border border-gray-800 rounded-xl p-1 shadow-sm">
          <button
            onClick={onAddTextNode}
            disabled={isProjectLoading}
            className={`p-1.5 rounded-lg transition-colors ${
              isProjectLoading
                ? 'opacity-40 cursor-not-allowed text-gray-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            title="新增文字節點 (雙擊畫布亦可)"
          >
            <Type className="w-4 h-4 text-blue-400" />
          </button>

          <button
            onClick={() => !isProjectLoading && fileInputRef.current?.click()}
            disabled={isProjectLoading}
            className={`p-1.5 rounded-lg transition-colors ${
              isProjectLoading
                ? 'opacity-40 cursor-not-allowed text-gray-500'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
            title="上傳圖片 (Ctrl+V 貼上亦可)"
          >
            <ImageIcon className="w-4 h-4 text-purple-400" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="w-px h-4 bg-gray-800 mx-0.5" />

          {/* Zoom controls */}
          <button
            onClick={onZoomOut}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="縮小"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetZoom}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="最適視角 / 符合畫面 (快速鍵 F)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onZoomIn}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="放大"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-gray-800 mx-0.5" />

          {/* Export / Download Menu */}
          {(onExportBoardImage || onDownloadAllImages) && (
            <div className="relative" ref={downloadDropdownRef}>
              <button
                onClick={() => !isProjectLoading && setDownloadDropdownOpen(prev => !prev)}
                disabled={isProjectLoading}
                className={`flex items-center gap-0.5 p-1.5 rounded-lg transition-colors ${
                  isProjectLoading
                    ? 'opacity-40 cursor-not-allowed text-gray-500'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
                title="畫布下載與匯出"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${downloadDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {downloadDropdownOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800 mb-1">
                    匯出與下載
                  </div>

                  {onExportBoardImage && (
                    <button
                      onClick={() => {
                        setDownloadDropdownOpen(false);
                        onExportBoardImage();
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-cyan-600/20 text-gray-200 hover:text-cyan-300 transition-colors flex items-center gap-2.5 group"
                    >
                      <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-xs text-white group-hover:text-cyan-300">
                          匯出畫布 (PNG)
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          整幅畫布拼接輸出
                        </div>
                      </div>
                    </button>
                  )}

                  {onDownloadAllImages && (
                    <button
                      onClick={() => {
                        setDownloadDropdownOpen(false);
                        onDownloadAllImages();
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-emerald-600/20 text-gray-200 hover:text-emerald-300 transition-colors flex items-center gap-2.5 group mt-0.5"
                    >
                      <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-xs text-white group-hover:text-emerald-300">
                          下載所有圖片
                        </div>
                        <div className="text-[10px] text-gray-400 truncate">
                          打包下載原始圖檔
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onClearCanvas}
            disabled={isProjectLoading}
            className={`p-1.5 rounded-lg transition-colors ${
              isProjectLoading
                ? 'opacity-40 cursor-not-allowed text-gray-500'
                : 'text-gray-400 hover:text-red-400 hover:bg-gray-800'
            }`}
            title="清空畫布"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* User Account / Settings Button */}
        {user ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={user.isExpired ? () => handleDirectGoogleLogin(user.email) : onOpenAuthModal}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all shadow-sm ${
                user.isExpired
                  ? 'border-amber-500/50 bg-amber-950/40 text-amber-200 hover:border-amber-400 hover:bg-amber-900/40'
                  : 'border-emerald-500/40 bg-gray-900/90 text-white hover:border-emerald-400'
              }`}
              title={user.isExpired ? 'Google 憑證已過期，點擊立即重新連線' : 'Google 帳號與 API 金鑰設定'}
            >
              <div className="relative flex items-center justify-center">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className={`w-5 h-5 rounded-full border ${user.isExpired ? 'border-amber-400' : 'border-emerald-400'}`}
                  />
                ) : (
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-white ${
                      user.isExpired ? 'bg-amber-600' : 'bg-emerald-600'
                    }`}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {user.isExpired && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-gray-950 animate-pulse" />
                )}
              </div>
              <span className="hidden sm:inline text-xs font-medium max-w-[100px] truncate">
                {user.name}
              </span>
              {user.isExpired ? (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                  {isDirectLoggingIn && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  <span>重新連線</span>
                </span>
              ) : (
                <Settings className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
            {user.isExpired && (
              <button
                onClick={onOpenAuthModal}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors border border-gray-800"
                title="帳號與 API 設定"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleDirectGoogleLogin()}
              disabled={isDirectLoggingIn}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white border border-blue-500 shadow-sm transition-all text-xs font-semibold"
              title="一鍵登入 Google (授權 Google Drive & Sheets)"
            >
              {isDirectLoggingIn ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>登入中...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>登入 Google</span>
                </>
              )}
            </button>
            <button
              onClick={onOpenAuthModal}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors border border-gray-800"
              title="進階帳號與 API 設定"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default TopNavigation;
