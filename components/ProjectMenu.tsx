import React, { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Folder,
  Plus,
  Search,
  Check,
  MoreVertical,
  Pencil,
  Trash2,
  HardDrive,
  FileSpreadsheet,
  ExternalLink,
  ShieldCheck,
  Lock,
  Loader2,
  LogIn,
} from 'lucide-react';
import { ProjectMetadata, GoogleUserProfile } from '../types';
import { t, Locale, formatRelativeTime } from '../services/i18n';

/** Layout constants shared by the menu and its per-row options popover. */
const MENU_WIDTH = 320;
const MENU_GAP = 6;
const OPTIONS_WIDTH = 176;
const VIEWPORT_MARGIN = 8;
/** Below this many projects the search box is just noise. */
const SEARCH_THRESHOLD = 6;

interface ProjectMenuProps {
  isOpen: boolean;
  /** Element the menu is anchored under (the trigger button in the header). */
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  projects: ProjectMetadata[];
  currentProject: ProjectMetadata | null;
  user: GoogleUserProfile | null;
  locale: Locale;
  isProjectLoading: boolean;
  onSelectProject: (project: ProjectMetadata) => void;
  onOpenProjectModal: () => void;
  onOpenAuthModal: () => void;
  onRenameProject?: (project: ProjectMetadata, name: string) => Promise<void>;
  onDeleteProject?: (project: ProjectMetadata) => Promise<void>;
  isSyncingAssets: boolean;
  onSyncAssetsToDrive?: () => void;
  unuploadedAssetCount: number;
  onOpenRescueModal?: () => void;
  rescuableAssetCount: number;
  projectPassword?: string;
  onOpenPasswordModal?: () => void;
}

interface OptionsState {
  project: ProjectMetadata;
  top: number;
  left: number;
}

/** Clamp a viewport `left` so a popover of `width` stays inside the window. */
const clampLeft = (left: number, width: number) =>
  Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN));

/**
 * Uniform row for actions that target the current project.
 * `trailing` carries the row's status: an external-link mark, a count badge, or a short label.
 */
const ActionRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  title?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}> = ({ icon, label, trailing, title, href, onClick, disabled }) => {
  const className =
    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-wait cursor-pointer';
  const body = (
    <>
      <span className="shrink-0 text-gray-400">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing && <span className="shrink-0 flex items-center">{trailing}</span>}
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={title}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} title={title}>
      {body}
    </button>
  );
};

const CountBadge: React.FC<{ count: number; tone: 'amber' | 'indigo' }> = ({ count, tone }) => (
  <span
    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
      tone === 'amber' ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/25 text-indigo-200'
    }`}
  >
    {count}
  </span>
);

/**
 * Project switcher + current-project actions, rendered in a portal so it always
 * sits above the sub-toolbar regardless of the header's stacking context.
 */
const ProjectMenu: React.FC<ProjectMenuProps> = ({
  isOpen,
  anchorRef,
  onClose,
  projects,
  currentProject,
  user,
  locale,
  isProjectLoading,
  onSelectProject,
  onOpenProjectModal,
  onOpenAuthModal,
  onRenameProject,
  onDeleteProject,
  isSyncingAssets,
  onSyncAssetsToDrive,
  unuploadedAssetCount,
  onOpenRescueModal,
  rescuableAssetCount,
  projectPassword,
  onOpenPasswordModal,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<OptionsState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Id of the project whose rename is still uncommitted; cleared before the input unmounts so a trailing blur is a no-op. */
  const renameSessionRef = useRef<string | null>(null);

  const showSearch = projects.length >= SEARCH_THRESHOLD;
  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? projects.filter(p => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);

  const openOptions = (project: ProjectMetadata, trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    setOptions({
      project,
      top: rect.bottom + 4,
      left: clampLeft(rect.right - OPTIONS_WIDTH, OPTIONS_WIDTH),
    });
  };

  const startRename = (project: ProjectMetadata) => {
    setOptions(null);
    setRenameValue(project.name);
    renameSessionRef.current = project.id;
    setRenamingId(project.id);
  };

  const cancelRename = () => {
    renameSessionRef.current = null;
    setRenamingId(null);
  };

  const commitRename = async (project: ProjectMetadata) => {
    if (renameSessionRef.current !== project.id) return;
    const name = renameValue.trim();
    cancelRename();
    if (!name || name === project.name || !onRenameProject) return;
    setBusyId(project.id);
    try {
      await onRenameProject(project, name);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async (project: ProjectMetadata) => {
    setOptions(null);
    if (!onDeleteProject) return;
    if (!window.confirm(t('nav.deleteProjectConfirm', locale).replace('{name}', project.name))) return;
    setBusyId(project.id);
    try {
      await onDeleteProject(project);
    } finally {
      setBusyId(null);
    }
  };

  // Anchor under the trigger each time the menu opens.
  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + MENU_GAP,
      left: clampLeft(rect.left, MENU_WIDTH),
    });
  }, [isOpen, anchorRef]);

  // Reset transient state whenever the menu closes.
  useEffect(() => {
    if (isOpen) return;
    setQuery('');
    setOptions(null);
    renameSessionRef.current = null;
    setRenamingId(null);
  }, [isOpen]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select();
  }, [renamingId]);

  // Outside click closes the options popover first, then the menu itself.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (optionsRef.current?.contains(target)) return;
      // The row's own trigger toggles the popover in its click handler.
      if ((target as HTMLElement).closest?.('[data-project-options-trigger]')) return;
      if (options) {
        setOptions(null);
        if (menuRef.current?.contains(target)) return;
      }
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (options) setOptions(null);
      else if (renamingId) cancelRename();
      else onClose();
    };
    const handleViewportChange = () => onClose();
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isOpen, options, renamingId, onClose, anchorRef]);

  if (!isOpen || !position) return null;

  const canDelete = projects.length > 1;
  const passwordSet = Boolean(projectPassword);

  return createPortal(
    <>
      <div
        ref={menuRef}
        role="menu"
        style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
        className="fixed z-50 flex flex-col bg-gray-900/95 backdrop-blur-2xl border border-gray-700/80 rounded-2xl shadow-2xl text-gray-200 animate-fadeIn overflow-hidden"
      >
        {/* Header: title, count, create */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-100">
            <span>{t('nav.projectMenuTitle', locale)}</span>
            {projects.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium bg-gray-800 text-gray-400 rounded-full">
                {projects.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenProjectModal();
            }}
            disabled={!user}
            className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('nav.newProject', locale)}</span>
          </button>
        </div>

        {showSearch && (
          <div className="relative mx-3 mb-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('nav.searchProjects', locale)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-950/80 border border-gray-800 rounded-xl text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Project list */}
        <div className="max-h-64 overflow-y-auto px-1.5 pb-1.5 space-y-0.5 scrollbar-thin">
          {!user ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAuthModal();
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-3 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer text-left"
            >
              <LogIn className="w-4 h-4 shrink-0 text-blue-400" />
              <span>{t('nav.loginToUseProjects', locale)}</span>
            </button>
          ) : projects.length === 0 ? (
            <div className="px-2.5 py-4 text-center text-xs text-gray-500">{t('nav.noProjectsYet', locale)}</div>
          ) : filteredProjects.length === 0 ? (
            <div className="px-2.5 py-4 text-center text-xs text-gray-500">{t('nav.noMatchProjects', locale)}</div>
          ) : (
            filteredProjects.map(p => {
              const isCurrent = p.id === currentProject?.id;
              const isRenaming = renamingId === p.id;
              const isBusy = busyId === p.id;
              const updated = formatRelativeTime(p.updatedAt, locale);
              return (
                <div
                  key={p.id}
                  role="menuitem"
                  onClick={() => {
                    if (isRenaming || isBusy) return;
                    onSelectProject(p);
                    onClose();
                  }}
                  className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs transition-colors ${
                    isRenaming || isBusy ? 'cursor-default' : 'cursor-pointer'
                  } ${
                    isCurrent
                      ? 'bg-blue-600/20 border border-blue-500/40 text-blue-200'
                      : 'border border-transparent text-gray-300 hover:bg-gray-800 hover:text-white'
                  } ${options?.project.id === p.id ? 'bg-gray-800' : ''}`}
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 shrink-0 text-blue-400 animate-spin" />
                  ) : (
                    <Folder className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-blue-400' : 'text-gray-500'}`} />
                  )}

                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onBlur={() => commitRename(p)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename(p);
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            cancelRename();
                          }
                        }}
                        className="w-full px-1.5 py-0.5 text-xs bg-gray-950 border border-blue-500 rounded-md text-white focus:outline-none"
                      />
                    ) : (
                      <>
                        <div className={`truncate ${isCurrent ? 'font-semibold' : ''}`}>{p.name}</div>
                        {updated && (
                          <div className="text-[10px] text-gray-500 truncate">
                            {t('nav.updatedAt', locale).replace('{time}', updated)}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {isCurrent && !isRenaming && <Check className="w-3.5 h-3.5 shrink-0 text-blue-400" />}

                  {!isRenaming && (
                    <button
                      type="button"
                      data-project-options-trigger="true"
                      onClick={e => {
                        e.stopPropagation();
                        if (options?.project.id === p.id) setOptions(null);
                        else openOptions(p, e.currentTarget);
                      }}
                      disabled={isBusy || isProjectLoading}
                      className={`p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-opacity cursor-pointer disabled:cursor-not-allowed ${
                        options?.project.id === p.id
                          ? 'opacity-100 bg-gray-700 text-white'
                          : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                      }`}
                      title={t('nav.projectOptions', locale)}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Actions on the current project */}
        {currentProject && (
          <div className="border-t border-gray-800 px-1.5 py-1.5">
            <div className="px-2.5 pt-1 pb-1.5 text-[10px] text-gray-500 truncate">
              {t('nav.currentProject', locale)}
            </div>
            {currentProject.webViewLink && (
              <ActionRow
                icon={<HardDrive className="w-4 h-4" />}
                label={t('nav.driveFolder', locale)}
                href={currentProject.webViewLink}
                trailing={<ExternalLink className="w-3 h-3 text-gray-500" />}
              />
            )}
            {currentProject.sheetViewLink && (
              <ActionRow
                icon={<FileSpreadsheet className="w-4 h-4" />}
                label={t('nav.googleSheet', locale)}
                href={currentProject.sheetViewLink}
                trailing={<ExternalLink className="w-3 h-3 text-gray-500" />}
              />
            )}
            {user && onSyncAssetsToDrive && (
              <ActionRow
                icon={
                  isSyncingAssets ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  ) : (
                    <HardDrive className="w-4 h-4" />
                  )
                }
                label={isSyncingAssets ? t('nav.syncingImages', locale) : t('nav.syncImages', locale)}
                onClick={() => {
                  onClose();
                  onSyncAssetsToDrive();
                }}
                disabled={isSyncingAssets}
                trailing={
                  !isSyncingAssets && unuploadedAssetCount > 0 ? (
                    <CountBadge count={unuploadedAssetCount} tone="amber" />
                  ) : undefined
                }
              />
            )}
            {onOpenRescueModal && (
              <ActionRow
                icon={<ShieldCheck className="w-4 h-4" />}
                label={t('nav.rescueAssets', locale)}
                title={t('nav.rescueTip', locale)}
                onClick={() => {
                  onClose();
                  onOpenRescueModal();
                }}
                trailing={
                  rescuableAssetCount > 0 ? <CountBadge count={rescuableAssetCount} tone="indigo" /> : undefined
                }
              />
            )}
            {onOpenPasswordModal && (
              <ActionRow
                icon={<Lock className={`w-4 h-4 ${passwordSet ? 'text-amber-400' : ''}`} />}
                label={t('nav.projectPassword', locale)}
                onClick={() => {
                  onClose();
                  onOpenPasswordModal();
                }}
                trailing={
                  <span className={`text-[10px] ${passwordSet ? 'text-amber-300' : 'text-gray-500'}`}>
                    {passwordSet ? t('nav.passwordSet', locale) : t('nav.passwordNotSet', locale)}
                  </span>
                }
              />
            )}
          </div>
        )}
      </div>

      {/* Per-project options popover */}
      {options && (
        <div
          ref={optionsRef}
          role="menu"
          style={{ top: options.top, left: options.left, width: OPTIONS_WIDTH }}
          className="fixed z-50 p-1.5 bg-gray-900/95 backdrop-blur-xl border border-gray-700/80 rounded-xl shadow-2xl text-xs text-gray-200 animate-fadeIn"
        >
          <button
            type="button"
            onClick={() => startRename(options.project)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-gray-300 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-gray-400" />
            <span>{t('nav.renameProject', locale)}</span>
          </button>
          {options.project.webViewLink && (
            <a
              href={options.project.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOptions(null)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-gray-300 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-gray-400" />
              <span className="flex-1">{t('nav.driveFolder', locale)}</span>
              <ExternalLink className="w-3 h-3 text-gray-500" />
            </a>
          )}
          {options.project.sheetViewLink && (
            <a
              href={options.project.sheetViewLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOptions(null)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-gray-300 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-gray-400" />
              <span className="flex-1">{t('nav.googleSheet', locale)}</span>
              <ExternalLink className="w-3 h-3 text-gray-500" />
            </a>
          )}
          <button
            type="button"
            onClick={() => confirmDelete(options.project)}
            disabled={!canDelete}
            title={canDelete ? undefined : t('nav.deleteLastProjectTip', locale)}
            className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 pt-2 rounded-lg text-left text-red-400 hover:text-red-300 hover:bg-red-950/50 border-t border-gray-800/80 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('nav.deleteProject', locale)}</span>
          </button>
        </div>
      )}
    </>,
    document.body,
  );
};

export default ProjectMenu;
