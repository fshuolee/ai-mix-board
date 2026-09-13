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
  Check,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Lock,
  Video,
  Volume2,
} from 'lucide-react';
import { ProjectMetadata, GoogleUserProfile, SyncStatus, ModalityType } from '../types';
import { getModelById } from '../services/modelsConfig';
import { signInWithGooglePopup } from '../services/googleAuthService';
import { t, Locale } from '../services/i18n';

interface TopNavigationProps {
  projects: ProjectMetadata[];
  currentProject: ProjectMetadata | null;
  onSelectProject: (project: ProjectMetadata) => void;
  onOpenProjectModal: () => void;
  onOpenModelModal: () => void;
  onOpenAuthModal: () => void;
  selectedModelId: string;
  activeModality?: ModalityType;
  onSelectModality?: (modality: 'text' | 'image' | 'video' | 'audio') => void;
  locale?: Locale;
  onToggleLocale?: () => void;
  user: GoogleUserProfile | null;
  syncStatus: SyncStatus;
  lastSavedAt?: Date | null;
  isProjectLoading?: boolean;
  isSyncingAssets?: boolean;
  onSyncAssetsToDrive?: () => void;
  unuploadedAssetCount?: number;
  onOpenRescueModal?: () => void;
  rescuableAssetCount?: number;
  projectPassword?: string;
  onOpenPasswordModal?: () => void;
  isCurrentBoardLocked?: boolean;
}

const TopNavigation: React.FC<TopNavigationProps> = ({
  projects,
  currentProject,
  onSelectProject,
  onOpenProjectModal,
  onOpenModelModal,
  onOpenAuthModal,
  selectedModelId,
  activeModality = 'image',
  onSelectModality,
  locale = 'zh-TW',
  onToggleLocale,
  user,
  syncStatus,
  lastSavedAt,
  isProjectLoading = false,
  isSyncingAssets = false,
  onSyncAssetsToDrive,
  unuploadedAssetCount = 0,
  onOpenRescueModal,
  rescuableAssetCount = 0,
  projectPassword,
  onOpenPasswordModal,
  isCurrentBoardLocked = false,
}) => {
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [isDirectLoggingIn, setIsDirectLoggingIn] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
            title={isProjectLoading ? t('nav.statusLoading', locale) : t('nav.projects', locale)}
          >
            {isProjectLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="max-w-[140px] truncate font-semibold">
              {isProjectLoading
                ? `${currentProject?.name || 'Project'} (${t('nav.statusLoading', locale)})`
                : currentProject?.name || t('nav.projects', locale)}
            </span>
            <ChevronDown className={`w-3 h-3 text-gray-400 ${isProjectLoading ? 'opacity-40' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {projectDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
              <div className="p-2 border-b border-gray-800 bg-gray-950/50 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">{t('nav.projects', locale)} (Google Drive)</span>
                <button
                  onClick={() => {
                    setProjectDropdownOpen(false);
                    onOpenProjectModal();
                  }}
                  className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  <span>{t('nav.newProject', locale)}</span>
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
                      title={t('nav.driveFolder', locale)}
                    >
                      <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('nav.driveFolder', locale)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {currentProject.sheetViewLink && (
                    <a
                      href={currentProject.sheetViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-gray-300 hover:text-emerald-300"
                      title={t('nav.googleSheet', locale)}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t('nav.googleSheet', locale)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Rescue lost assets button */}
              {onOpenRescueModal && (
                <div className="p-2 border-t border-gray-800 bg-gray-950/40">
                  <button
                    onClick={() => {
                      setProjectDropdownOpen(false);
                      onOpenRescueModal();
                    }}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 text-indigo-300 text-xs font-medium transition-colors cursor-pointer"
                    title={t('nav.rescueTip', locale)}
                  >
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{t('nav.rescueAssets', locale)}</span>
                    </div>
                    {rescuableAssetCount > 0 ? (
                      <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                        {rescuableAssetCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              )}

              {/* Project Password Configuration */}
              {onOpenPasswordModal && (
                <div className="p-2 border-t border-gray-800 bg-gray-950/40">
                  <button
                    onClick={() => {
                      setProjectDropdownOpen(false);
                      onOpenPasswordModal();
                    }}
                    className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-700/60 text-gray-300 hover:text-white text-xs font-medium transition-colors"
                    title={t('nav.projectPassword', locale)}
                  >
                    <div className="flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t('nav.projectPassword', locale)}</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                      {projectPassword ? t('nav.passwordSet', locale) : t('nav.passwordNotSet', locale)}
                    </span>
                  </button>
                </div>
              )}

              {/* Sync images button */}
              {user && onSyncAssetsToDrive && (
                <div className="p-2 border-t border-gray-800 bg-gray-950/60">
                  <button
                    onClick={() => {
                      setProjectDropdownOpen(false);
                      onSyncAssetsToDrive();
                    }}
                    disabled={isSyncingAssets}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/50 text-emerald-300 text-xs font-medium transition-colors disabled:opacity-50"
                    title={t('nav.syncImages', locale)}
                  >
                    {isSyncingAssets ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                        <span>{t('nav.syncingImages', locale)}</span>
                      </>
                    ) : (
                      <>
                        <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                        <span>
                          {t('nav.syncImages', locale)}
                          {unuploadedAssetCount > 0 ? ` (${t('nav.unuploadedCount', locale).replace('{count}', String(unuploadedAssetCount))})` : ''}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Compact Sync Status Pill with Tooltip */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-900/60 border border-gray-800 text-xs cursor-help select-none"
          title={
            isSyncingAssets
              ? t('nav.syncingImages', locale)
              : isProjectLoading || syncStatus === 'loading'
              ? t('nav.statusLoading', locale)
              : syncStatus === 'saving'
              ? t('nav.statusSyncing', locale)
              : syncStatus === 'saved'
              ? `${t('nav.statusSynced', locale)} (${lastSavedAt ? lastSavedAt.toLocaleTimeString() : 'OK'})`
              : syncStatus === 'error'
              ? t('nav.statusError', locale)
              : t('nav.statusOffline', locale)
          }
        >
          {isSyncingAssets || syncStatus === 'saving' ? (
            <>
              <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />
              <span className="text-emerald-400 text-[11px] font-medium">{t('nav.statusSyncing', locale)}</span>
            </>
          ) : isProjectLoading || syncStatus === 'loading' ? (
            <>
              <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
              <span className="text-blue-300 text-[11px]">{t('nav.statusLoading', locale)}</span>
            </>
          ) : syncStatus === 'saved' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-gray-300">{t('nav.statusSynced', locale)}</span>
            </>
          ) : syncStatus === 'error' ? (
            <>
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-red-300 text-[11px]">{t('nav.statusError', locale)}</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
              <span className="text-gray-400 text-[11px]">{t('nav.statusOffline', locale)}</span>
            </>
          )}
        </div>

        {/* Quick Rescue Button if lost assets found */}
        {rescuableAssetCount > 0 && onOpenRescueModal && (
          <button
            onClick={onOpenRescueModal}
            className="hidden md:flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-500/60 text-indigo-300 text-[11px] hover:bg-indigo-900 transition-colors shadow-sm cursor-pointer"
            title={t('nav.rescueTip', locale)}
          >
            <ShieldCheck className="w-3 h-3 text-indigo-400" />
            <span>{t('nav.rescueCount', locale).replace('{count}', String(rescuableAssetCount))}</span>
          </button>
        )}
      </div>

      {/* Center Section: Multi-Modality Switcher & Inspector Trigger */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 pointer-events-auto">
        <div className="flex items-center p-1 bg-gray-900/90 backdrop-blur-md border border-gray-800 rounded-2xl shadow-sm">
          {/* 1. Text */}
          <button
            onClick={() => onSelectModality?.('text')}
            disabled={isProjectLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeModality === 'text'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
            title={t('modality.text', locale)}
          >
            <Type className="w-3.5 h-3.5" />
            <span>{t('modality.text', locale)}</span>
          </button>

          {/* 2. Image */}
          <button
            onClick={() => onSelectModality?.('image')}
            disabled={isProjectLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeModality === 'image'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
            title={t('modality.image', locale)}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{t('modality.image', locale)}</span>
          </button>

          {/* 3. Video */}
          <button
            onClick={() => onSelectModality?.('video')}
            disabled={isProjectLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeModality === 'video'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
            title={t('modality.video', locale)}
          >
            <Video className="w-3.5 h-3.5" />
            <span>{t('modality.video', locale)}</span>
          </button>

          {/* 4. Audio */}
          <button
            onClick={() => onSelectModality?.('audio')}
            disabled={isProjectLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeModality === 'audio'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
            }`}
            title={t('modality.audio', locale)}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{t('modality.audio', locale)}</span>
          </button>
        </div>
      </div>

      {/* Right Section: User Avatar & Settings Trigger (Rightmost) */}
      <div className="flex items-center gap-2">
        {user ? (
          <button
            onClick={user.isExpired ? () => handleDirectGoogleLogin(user.email) : onOpenAuthModal}
            className={`relative p-0.5 rounded-full border transition-all shadow-sm active:scale-95 cursor-pointer ${
              user.isExpired
                ? 'border-amber-500/80 bg-amber-950/40 hover:border-amber-400 ring-2 ring-amber-500/30'
                : 'border-emerald-500/60 bg-gray-900/90 hover:border-emerald-400 ring-1 ring-emerald-500/20'
            }`}
            title={user.isExpired ? `${user.name} (${t('nav.reconnect', locale)})` : `${user.name} (${t('nav.settings', locale)})`}
            aria-label="User profile and settings"
          >
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white ${
                  user.isExpired ? 'bg-amber-600' : 'bg-emerald-600'
                }`}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            {user.isExpired && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-gray-950 animate-pulse" />
            )}
          </button>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="p-1.5 rounded-xl border border-gray-800 bg-gray-900/90 hover:bg-gray-800 text-gray-300 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center"
            title={t('nav.settings', locale)}
            aria-label="Settings and Google Login"
          >
            <Settings className="w-4 h-4 text-gray-400 hover:text-gray-200" />
          </button>
        )}
      </div>
    </header>
  );
};

export default TopNavigation;

