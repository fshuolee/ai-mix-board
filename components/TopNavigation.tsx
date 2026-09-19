import React, { useState, useRef, useCallback } from 'react';
import {
  Folder,
  ChevronDown,
  Sparkles,
  Settings,
  Type,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Video,
  Volume2,
} from 'lucide-react';
import { ProjectMetadata, GoogleUserProfile, SyncStatus, ModalityType } from '../types';
import { signInWithGooglePopup } from '../services/googleAuthService';
import { t, Locale } from '../services/i18n';
import ProjectMenu from './ProjectMenu';

interface TopNavigationProps {
  projects: ProjectMetadata[];
  currentProject: ProjectMetadata | null;
  onSelectProject: (project: ProjectMetadata) => void;
  onRenameProject?: (project: ProjectMetadata, name: string) => Promise<void>;
  onDeleteProject?: (project: ProjectMetadata) => Promise<void>;
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
  onRenameProject,
  onDeleteProject,
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
  const projectTriggerRef = useRef<HTMLButtonElement>(null);
  const closeProjectMenu = useCallback(() => setProjectDropdownOpen(false), []);

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

        {/* Project Selector: trigger here, menu rendered in a portal by ProjectMenu */}
        <button
          ref={projectTriggerRef}
          onClick={() => !isProjectLoading && setProjectDropdownOpen(open => !open)}
          disabled={isProjectLoading}
          aria-haspopup="menu"
          aria-expanded={projectDropdownOpen}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all shadow-sm cursor-pointer ${
            isProjectLoading
              ? 'bg-blue-950/40 border-blue-500/50 text-blue-200 cursor-wait'
              : projectDropdownOpen
              ? 'bg-gray-800 border-gray-600 text-white'
              : 'bg-gray-900/90 hover:bg-gray-800 border-gray-700/80 text-white'
          }`}
          title={isProjectLoading ? t('nav.statusLoading', locale) : t('nav.projects', locale)}
        >
          {isProjectLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-blue-400" />
          )}
          <span className="max-w-[140px] truncate font-semibold">
            {isProjectLoading
              ? `${currentProject?.name || 'Project'} (${t('nav.statusLoading', locale)})`
              : currentProject?.name || t('nav.projects', locale)}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-gray-400 transition-transform ${isProjectLoading ? 'opacity-40' : ''} ${
              projectDropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <ProjectMenu
          isOpen={projectDropdownOpen}
          anchorRef={projectTriggerRef}
          onClose={closeProjectMenu}
          projects={projects}
          currentProject={currentProject}
          user={user}
          locale={locale}
          isProjectLoading={isProjectLoading}
          onSelectProject={onSelectProject}
          onOpenProjectModal={onOpenProjectModal}
          onOpenAuthModal={onOpenAuthModal}
          onRenameProject={onRenameProject}
          onDeleteProject={onDeleteProject}
          isSyncingAssets={isSyncingAssets}
          onSyncAssetsToDrive={onSyncAssetsToDrive}
          unuploadedAssetCount={unuploadedAssetCount}
          onOpenRescueModal={onOpenRescueModal}
          rescuableAssetCount={rescuableAssetCount}
          projectPassword={projectPassword}
          onOpenPasswordModal={onOpenPasswordModal}
        />

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

