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
  lastSavedAt: Date | null;
  onAddTextNode: () => void;
  onUploadImage: (file: File) => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onClearCanvas: () => void;
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
  onAddTextNode,
  onUploadImage,
  onResetZoom,
  onZoomIn,
  onZoomOut,
  onClearCanvas,
}) => {
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [isDirectLoggingIn, setIsDirectLoggingIn] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const modelInfo = getModelById(selectedModelId);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDirectGoogleLogin = async () => {
    setIsDirectLoggingIn(true);
    try {
      await signInWithGooglePopup();
    } catch (err: any) {
      console.warn('Direct Google popup login failed, opening modal', err);
      onOpenAuthModal();
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
        <div className="flex items-center gap-2 pr-2 border-r border-gray-800">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-md">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block">
            <div className="font-bold text-sm text-white tracking-wide leading-none">
              AI MIX BOARD
            </div>
            <div className="text-[10px] text-gray-400 font-mono leading-tight">Drive & Sheets</div>
          </div>
        </div>

        {/* Project Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-900/90 hover:bg-gray-800 border border-gray-700/80 text-white text-sm font-medium transition-all shadow-sm"
          >
            <Folder className="w-4 h-4 text-emerald-400" />
            <span className="max-w-[160px] truncate font-semibold">
              {currentProject?.name || '選擇專案'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
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

        {/* Sync Status Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-900/60 border border-gray-800 text-[11px]">
          {syncStatus === 'saving' ? (
            <>
              <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
              <span className="text-amber-300">同步至 Sheet 中...</span>
            </>
          ) : syncStatus === 'saved' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-gray-300">
                {lastSavedAt ? `已同步 (${lastSavedAt.toLocaleTimeString()})` : 'Google Sheet 已就緒'}
              </span>
            </>
          ) : syncStatus === 'error' ? (
            <>
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-red-300">同步錯誤</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="text-gray-400">離線暫存</span>
            </>
          )}
        </div>
      </div>

      {/* Center Section: Model Selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenModelModal}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-gray-900 to-gray-850 hover:from-gray-850 hover:to-gray-800 border border-gray-700/80 text-white shadow-sm transition-all group"
        >
          <div className="p-1 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 group-hover:scale-105 transition-transform">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-white">{modelInfo.name}</span>
              {modelInfo.badge && (
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                  {modelInfo.badge}
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-400 leading-tight">
              {modelInfo.tag} · 點擊切換模型
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 ml-1" />
        </button>
      </div>

      {/* Right Section: Canvas Controls & Account */}
      <div className="flex items-center gap-2">
        {/* Quick Add Node Buttons */}
        <div className="flex items-center gap-1 bg-gray-900/90 border border-gray-800 rounded-xl p-1 shadow-sm">
          <button
            onClick={onAddTextNode}
            className="flex items-center gap-1 px-2.5 py-1 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg text-xs font-medium transition-colors"
            title="新增文字節點 (雙擊畫布亦可)"
          >
            <Type className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">文字</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg text-xs font-medium transition-colors"
            title="上傳圖片 (Ctrl+V 貼上亦可)"
          >
            <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">圖片</span>
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
            title="重設縮放 (100%)"
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

          <button
            onClick={onClearCanvas}
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="清空畫布"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* User Account / Settings Button */}
        {user ? (
          <button
            onClick={onOpenAuthModal}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-emerald-500/40 bg-gray-900/90 text-white hover:border-emerald-400 transition-all shadow-sm"
            title="Google 帳號與 API 金鑰設定"
          >
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-5 h-5 rounded-full border border-emerald-400"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-[10px] text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="hidden sm:inline text-xs font-medium max-w-[100px] truncate">
              {user.name}
            </span>
            <Settings className="w-3.5 h-3.5 text-gray-400" />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDirectGoogleLogin}
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
