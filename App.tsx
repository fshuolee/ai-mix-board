import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type {
  CanvasNode,
  ImageNode,
  TextNode,
  BoardMetadata,
  ProjectMetadata,
  GoogleUserProfile,
  SyncStatus,
  ViewportState,
} from './types';
import {
  blobToBase64,
  downloadSingleNode,
  batchDownloadNodes,
  exportBoardToPng,
} from './utils/canvasUtils';
import { generateFromNodes } from './services/geminiService';
import { getImage, storeImage, isDriveFileId, deleteMultipleImages } from './services/dbService';
import {
  subscribeAuth,
  getCurrentUser,
  getAccessToken,
  getValidAccessToken,
  refreshGoogleToken,
  tryFetchLocalGcloudToken,
  isLocalEnvironment,
  handleOAuthCallback,
  isAuthPopupInProgress,
  signInWithGooglePopup,
} from './services/googleAuthService';
import {
  listProjects,
  createProject,
  uploadAssetToDrive,
  deleteAssetFromDrive,
  ensureAssetsFolder,
  getFileParentFolderId,
  syncUnuploadedImageNodes,
  healProjectImageNodes,
} from './services/googleDriveService';
import {
  saveGraphToSheet,
  loadGraphFromSheet,
  isSheetsRateLimited,
  getSheetsRateLimitRemainingSeconds,
} from './services/googleSheetsService';
import { DEFAULT_MODEL_ID, getModelById, migrateOldModelId } from './services/modelsConfig';

import NodeRenderer, { nodeObjectUrlCache } from './components/NodeRenderer';
import TopNavigation from './components/TopNavigation';
import BoardTabs from './components/BoardTabs';
import ModelSelectorModal from './components/ModelSelectorModal';
import ProjectModal from './components/ProjectModal';
import AuthSettingsModal from './components/AuthSettingsModal';
import AssetRescueModal from './components/AssetRescueModal';
import ContextMenu from './components/ContextMenu';
import MultiSelectionBar from './components/MultiSelectionBar';
import {
  getDefaultNodeSize,
  setDefaultNodeSize,
  resetNodesAspectRatio,
  applyOptimalSizeToNodes,
  autoArrangeNodes,
  fitDimensions,
} from './services/nodeSizingService';
import { copyNodesToClipboard } from './services/clipboardService';
import {
  RescuableAsset,
  scanForLostAssets,
  restoreAssetsToCanvas,
} from './services/assetRescueService';
import {
  Sparkles,
  Loader2,
  UploadCloud,
  Trash2,
  ClipboardCheck,
  Folder,
  AlertCircle,
  RotateCw,
  LogIn,
  ExternalLink,
  ShieldCheck,
  X,
} from 'lucide-react';

const checkOverlap = (
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
) => {
  const padding = 20;
  return (
    rect1.x < rect2.x + rect2.width + padding &&
    rect1.x + rect1.width + padding > rect2.x &&
    rect1.y < rect2.y + rect2.height + padding &&
    rect1.y + rect1.height + padding > rect2.y
  );
};

const findOpenPosition = (
  startX: number,
  startY: number,
  width: number,
  height: number,
  nodes: CanvasNode[]
): { x: number; y: number } => {
  let x = startX;
  let y = startY;
  let attempt = 0;
  const maxAttempts = 100;
  let radius = 150;
  const radiusIncrement = 50;
  let angle = Math.random() * 2 * Math.PI;
  const angleIncrement = Math.PI / 8;

  while (attempt < maxAttempts) {
    let hasCollision = false;
    const newNodeRect = { x, y, width, height };
    for (const node of nodes) {
      const existingNodeRect = { x: node.x, y: node.y, width: node.width, height: node.height };
      if (checkOverlap(newNodeRect, existingNodeRect)) {
        hasCollision = true;
        break;
      }
    }

    if (!hasCollision) {
      return { x, y };
    }

    angle += angleIncrement;
    if (angle > Math.PI * 2) {
      angle -= Math.PI * 2;
      radius += radiusIncrement;
    }
    x = startX + radius * Math.cos(angle);
    y = startY + radius * Math.sin(angle);
    attempt++;
  }

  return { x: startX, y: startY + height + 50 };
};

const DEFAULT_BOARD_ID = 'board_main';

const App: React.FC = () => {
  // Auth state
  const [user, setUser] = useState<GoogleUserProfile | null>(getCurrentUser());

  // Projects state
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(() => {
    try {
      const u = getCurrentUser();
      if (!u) return null;
      const email = u.email;
      const raw = email ? localStorage.getItem(`ai_mix_board_last_project_meta_${email}`) : null;
      const fallback = localStorage.getItem('ai_mix_board_last_project_meta');
      const item = raw || fallback;
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  });
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingProjectData, setIsLoadingProjectData] = useState(false);
  const [projectDataError, setProjectDataError] = useState<string | null>(null);
  const [retryProjectLoadTrigger, setRetryProjectLoadTrigger] = useState(0);

  const isProjectBusy = isLoadingProjectData || (isLoadingProjects && !currentProject);

  // Multi-Board state
  const [boards, setBoards] = useState<BoardMetadata[]>([
    { id: DEFAULT_BOARD_ID, name: 'MAIN', createdAt: new Date().toISOString() },
  ]);
  const [activeBoardId, setActiveBoardId] = useState<string>(DEFAULT_BOARD_ID);
  const [allNodes, setAllNodes] = useState<CanvasNode[]>([]);
  const [viewports, setViewports] = useState<Record<string, ViewportState>>({});
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});

  // Active Canvas View & Selection
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);

  // Drag-and-drop file upload onto canvas state
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false);

  // Marquee Box Selection state
  const [marqueeBox, setMarqueeBox] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const isSpacePressedRef = useRef(false);
  isSpacePressedRef.current = isSpacePressed;

  // Manage body classes for instant global cursor and user-select behavior
  useEffect(() => {
    if (isSpacePressed) {
      document.body.classList.add('space-pan-active');
    } else {
      document.body.classList.remove('space-pan-active');
      document.body.classList.remove('space-pan-dragging');
    }
  }, [isSpacePressed]);

  useEffect(() => {
    if (isPanning) {
      document.body.classList.add('space-pan-dragging');
    } else {
      document.body.classList.remove('space-pan-dragging');
    }
  }, [isPanning]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('space-pan-active');
      document.body.classList.remove('space-pan-dragging');
    };
  }, []);

  // Orphan Asset Deletion Confirmation Modal state
  const [orphanAssetModal, setOrphanAssetModal] = useState<{
    isOpen: boolean;
    orphanFiles: { fileId: string; fileName: string }[];
    isDeleting?: boolean;
    deletingIndex?: number;
    onConfirmDelete: () => void;
    onKeepInDrive: () => void;
  } | null>(null);
  const [deletingNodeIds, setDeletingNodeIds] = useState<Set<string>>(new Set());

  // Sync & Generation state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const isGenerating = activeJobCount > 0;
  const [error, setError] = useState<string | null>(null);
  const [copiedNodesClipboard, setCopiedNodesClipboard] = useState<CanvasNode[]>([]);
  const [cutNodeIds, setCutNodeIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  // Modals state
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isRescueModalOpen, setIsRescueModalOpen] = useState(false);
  const [isScanningRescue, setIsScanningRescue] = useState(false);
  const [rescuableAssets, setRescuableAssets] = useState<RescuableAsset[]>([]);
  const [isRescueBannerDismissed, setIsRescueBannerDismissed] = useState(false);
  const [isSyncingAssets, setIsSyncingAssets] = useState(false);
  const unuploadedAssetCount = useMemo(() => {
    if (isLoadingProjectData) return 0;
    return allNodes.filter(
      n => n.type === 'image' && n.status !== 'generating' && n.status !== 'error' && (!n.driveFileId || !isDriveFileId(n.driveFileId))
    ).length;
  }, [allNodes, isLoadingProjectData]);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    targetType: 'node' | 'canvas';
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    targetType: 'canvas',
  });

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragInfoRef = useRef<{
    type: 'pan' | 'drag_node' | 'marquee';
    startX: number;
    startY: number;
    curX?: number;
    curY?: number;
    isShift?: boolean;
    initialSelection?: Set<string>;
    nodes?: Map<string, { x: number; y: number }>;
    currentPositions?: Map<string, { x: number; y: number }>;
  } | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const loadedProjectIdRef = useRef<string | null>(null);

  // Filter nodes for the current active board
  const currentBoardId = activeBoardId || boards[0]?.id || DEFAULT_BOARD_ID;
  const currentBoardNodes = useMemo(() => {
    const filtered = allNodes.filter(n => (n.boardId || boards[0]?.id || DEFAULT_BOARD_ID) === currentBoardId);
    // Fallback: If filtered is empty, but allNodes has nodes and there is only 1 board,
    // show all nodes so nodes are NEVER hidden due to a boardId mismatch!
    if (filtered.length === 0 && allNodes.length > 0 && boards.length <= 1) {
      return allNodes;
    }
    return filtered;
  }, [allNodes, boards, currentBoardId]);

  // Performance & State synchronization refs
  const allNodesRef = useRef(allNodes);
  allNodesRef.current = allNodes;
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  const viewportsRef = useRef(viewports);
  viewportsRef.current = viewports;
  const selectedModelsRef = useRef(selectedModels);
  selectedModelsRef.current = selectedModels;
  const currentBoardIdRef = useRef(currentBoardId);
  currentBoardIdRef.current = currentBoardId;
  const viewRef = useRef(view);
  viewRef.current = view;
  const selectedModelIdRef = useRef(selectedModelId);
  selectedModelIdRef.current = selectedModelId;
  const selectedNodeIdsRef = useRef(selectedNodeIds);
  selectedNodeIdsRef.current = selectedNodeIds;
  const isProjectBusyRef = useRef(isProjectBusy);
  isProjectBusyRef.current = isProjectBusy;
  const currentProjectRef = useRef(currentProject);
  currentProjectRef.current = currentProject;

  // 1. Listen for Google Auth changes, handle OAuth redirect callback, and maintain active login state
  useEffect(() => {
    const unsubscribe = subscribeAuth(newUser => {
      setUser(newUser);
    });

    // Handle OAuth redirect callback (PKCE code or implicit hash token)
    handleOAuthCallback().then(res => {
      if (res.success && res.profile) {
        setUser(res.profile);
      }
    }).catch(err => console.warn('OAuth callback error', err));

    // Proactively verify or refresh on window focus and visibility change (throttled & non-intrusive)
    let lastFocusCheck = 0;
    const checkAndMaintainAuth = () => {
      if (isAuthPopupInProgress()) return;

      const now = Date.now();
      if (now - lastFocusCheck < 10000) return; // At most once every 10 seconds
      lastFocusCheck = now;

      const u = getCurrentUser();
      if (u) {
        // Only trigger proactive refresh if NOT already expired, but expiring soon (< 3 min)
        if (!u.isExpired && u.expiresAt > now && u.expiresAt <= now + 180000) {
          refreshGoogleToken().catch(() => {});
        }
      } else if (isLocalEnvironment()) {
        tryFetchLocalGcloudToken().catch(() => {});
      }
    };

    window.addEventListener('focus', checkAndMaintainAuth);
    document.addEventListener('visibilitychange', checkAndMaintainAuth);

    // Initial check
    checkAndMaintainAuth();

    // In local environment, poll every 5 seconds if not authenticated yet to auto-detect gcloud
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    if (isLocalEnvironment()) {
      pollTimer = setInterval(() => {
        if (!getCurrentUser() && !isAuthPopupInProgress()) {
          tryFetchLocalGcloudToken().catch(() => {});
        }
      }, 5000);
    }

    return () => {
      unsubscribe();
      window.removeEventListener('focus', checkAndMaintainAuth);
      document.removeEventListener('visibilitychange', checkAndMaintainAuth);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  // 2. Load Google Drive Projects
  const loadProjects = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setSyncStatus('offline');
      return;
    }

    setIsLoadingProjects(true);
    setError(null);

    try {
      const list = await listProjects(token);
      setProjects(list);
      if (list.length > 0) {
        let savedProjectId: string | null = null;
        try {
          const email = getCurrentUser()?.email;
          if (email) {
            savedProjectId = localStorage.getItem(`ai_mix_board_last_project_${email}`);
          }
          if (!savedProjectId) {
            savedProjectId = localStorage.getItem('ai_mix_board_last_project');
          }
        } catch (e) {
          console.warn('Failed to read last project from localStorage:', e);
        }

        const matchedProject = savedProjectId ? list.find(p => p.id === savedProjectId) : null;

        setCurrentProject(prev => {
          if (prev && list.some(p => p.id === prev.id)) {
            const fresh = list.find(p => p.id === prev.id);
            return fresh || prev;
          }
          return matchedProject || list[0];
        });
      } else {
        const defaultProject = await createProject(token, '預設畫布專案');
        setProjects([defaultProject]);
        setCurrentProject(defaultProject);
      }
    } catch (err: any) {
      console.error('Failed to list Google Drive projects:', err);
      const isScopeError = err.message?.includes('insufficient') || err.message?.includes('scopes') || err.message?.includes('PERMISSION_DENIED');
      if (isScopeError) {
        setError('Google Drive 權限不足。若使用 gcloud，請在終端機執行：gcloud auth login --enable-gdrive-access');
      } else {
        setError(`載入 Google Drive 專案失敗: ${err.message}`);
      }
      setSyncStatus('error');
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  const userEmail = user?.email;

  useEffect(() => {
    if (userEmail) {
      loadProjects();
    } else {
      setProjects([]);
      setCurrentProject(null);
      setSyncStatus('offline');
    }
  }, [userEmail, loadProjects]);

  // Persist last used project to localStorage
  useEffect(() => {
    if (currentProject) {
      try {
        const email = user?.email || getCurrentUser()?.email;
        if (email) {
          localStorage.setItem(`ai_mix_board_last_project_${email}`, currentProject.id);
          localStorage.setItem(`ai_mix_board_last_project_meta_${email}`, JSON.stringify(currentProject));
        }
        localStorage.setItem('ai_mix_board_last_project', currentProject.id);
        localStorage.setItem('ai_mix_board_last_project_meta', JSON.stringify(currentProject));
      } catch (e) {
        console.warn('Failed to persist last project to localStorage:', e);
      }
    }
  }, [currentProject, user?.email]);

  // 3. Load multi-board graph data from Google Sheet when current project changes
  useEffect(() => {
    if (!currentProject || !currentProject.spreadsheetId) return;

    const token = getAccessToken();
    if (!token) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    let isMounted = true;
    isInitialLoadRef.current = true;
    loadedProjectIdRef.current = null;
    setIsLoadingProjectData(true);
    setProjectDataError(null);
    setSyncStatus('loading');

    loadGraphFromSheet(token, currentProject.spreadsheetId)
      .then(loadedData => {
        if (!isMounted) return;

        const loadedBoards = loadedData.boards.length > 0
          ? loadedData.boards
          : [{ id: DEFAULT_BOARD_ID, name: 'MAIN', createdAt: new Date().toISOString() }];

        let savedBoardId: string | null = null;
        try {
          savedBoardId = localStorage.getItem(`ai_mix_board_last_board_${currentProject.id}`);
        } catch {}

        const initialBoardId = (savedBoardId && loadedBoards.some(b => b.id === savedBoardId))
          ? savedBoardId
          : loadedBoards[0].id;

        setBoards(loadedBoards);
        setActiveBoardId(initialBoardId);
        setAllNodes(loadedData.nodes);
        setViewports(loadedData.viewports);
        const migratedModels: Record<string, string> = {};
        Object.entries(loadedData.selectedModels || {}).forEach(([bId, mId]) => {
          migratedModels[bId] = migrateOldModelId(mId);
        });
        setSelectedModels(migratedModels);
        setSelectedNodeIds(new Set());

        const initialView = loadedData.viewports[initialBoardId] || { x: 0, y: 0, zoom: 1 };
        setView(initialView);

        const initialModel = migratedModels[initialBoardId] || DEFAULT_MODEL_ID;
        setSelectedModelId(initialModel);

        setSyncStatus('saved');
        setLastSavedAt(new Date());
        loadedProjectIdRef.current = currentProject.id;
        setIsLoadingProjectData(false);

        setTimeout(() => {
          if (isMounted) {
            isInitialLoadRef.current = false;
          }
        }, 300);

        // Non-destructively auto-heal any unlinked image nodes from Drive
        healProjectImageNodes(
          token,
          currentProject.folderId,
          currentProject.spreadsheetId,
          currentProject.assetsFolderId,
          loadedData.nodes
        ).then(({ healedNodes, healedCount }) => {
          if (isMounted && healedCount > 0) {
            setAllNodes(healedNodes);
            allNodesRef.current = healedNodes;
          }
        }).catch(err => console.warn('Auto-healing nodes non-destructively failed:', err));
      })
      .catch(err => {
        if (!isMounted) return;
        console.error('Failed to load graph from Google Sheet:', err);
        setProjectDataError(err.message || '載入專案資料失敗');
        setSyncStatus('error');
        setIsLoadingProjectData(false);
        isInitialLoadRef.current = false;
      });

    return () => {
      isMounted = false;
    };
  }, [currentProject?.id, currentProject?.spreadsheetId, user?.accessToken, retryProjectLoadTrigger]);

  const handleRetryLoadProject = useCallback(() => {
    setRetryProjectLoadTrigger(c => c + 1);
  }, []);

  const handleReconnectFromCanvas = useCallback(async () => {
    try {
      await signInWithGooglePopup(undefined, user?.email);
      setRetryProjectLoadTrigger(c => c + 1);
    } catch (err: any) {
      console.warn('Reconnect failed from canvas overlay:', err);
    }
  }, [user?.email]);

  // 4. Auto-save graph to Google Sheet (Debounced & Concurrency-Controlled)
  const isSavingSheetRef = useRef(false);
  const pendingSaveRef = useRef<{
    nodes: CanvasNode[];
    boards: BoardMetadata[];
    viewports: Record<string, ViewportState>;
    models: Record<string, string>;
    allowEmpty: boolean;
  } | null>(null);

  const triggerAutoSave = useCallback(
    (
      currentAllNodes: CanvasNode[],
      currentBoards: BoardMetadata[],
      currentViewports: Record<string, ViewportState>,
      currentModels: Record<string, string>,
      allowEmptyNodes: boolean = false
    ) => {
      const proj = currentProjectRef.current;
      if (isProjectBusyRef.current || isInitialLoadRef.current || !proj || loadedProjectIdRef.current !== proj.id) return;
      const token = getAccessToken();
      if (!token || !proj.spreadsheetId) {
        setSyncStatus('offline');
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // Filter out generating placeholders so sheets only receives finalized nodes
      const persistableNodes = currentAllNodes.filter(n => n.status !== 'generating');

      // Safety check: do not auto-save 0 nodes unless explicitly permitted by deliberate user action
      if (persistableNodes.length === 0 && !allowEmptyNodes) {
        console.warn('triggerAutoSave skipped: 0 persistable nodes and allowEmptyNodes is false.');
        return;
      }

      setSyncStatus('saving');

      // Stash latest state in pending ref
      pendingSaveRef.current = {
        nodes: persistableNodes,
        boards: currentBoards,
        viewports: currentViewports,
        models: currentModels,
        allowEmpty: allowEmptyNodes,
      };

      const executeSave = async () => {
        if (isSavingSheetRef.current) {
          // A save is currently in-flight; it will trigger pendingSave upon completion
          return;
        }

        if (isSheetsRateLimited()) {
          const waitSec = getSheetsRateLimitRemainingSeconds();
          console.warn(`[AutoSave] Rate limit in effect. Postponing save by ${waitSec}s.`);
          saveTimerRef.current = setTimeout(executeSave, Math.max(2000, waitSec * 1000));
          return;
        }

        const args = pendingSaveRef.current;
        if (!args) return;
        pendingSaveRef.current = null;

        isSavingSheetRef.current = true;
        try {
          const currentToken = getAccessToken() || token;
          await saveGraphToSheet(
            currentToken,
            proj.spreadsheetId!,
            args.nodes,
            args.boards,
            args.viewports,
            args.models,
            args.allowEmpty
          );
          setSyncStatus('saved');
          setLastSavedAt(new Date());
        } catch (err) {
          console.error('Failed to auto-save to Google Sheet:', err);
          setSyncStatus('error');
        } finally {
          isSavingSheetRef.current = false;
          // If modifications occurred while this save was executing, schedule the pending save
          if (pendingSaveRef.current) {
            saveTimerRef.current = setTimeout(executeSave, 1500);
          }
        }
      };

      const delay = isSheetsRateLimited()
        ? Math.max(3000, getSheetsRateLimitRemainingSeconds() * 1000)
        : 2500;

      saveTimerRef.current = setTimeout(executeSave, delay);
    },
    []
  );

  // Trigger auto-save whenever nodes change
  const updateNodesAndSave = useCallback(
    (updater: (prev: CanvasNode[]) => CanvasNode[], allowEmptyNodes: boolean = false) => {
      if (isProjectBusyRef.current) return;
      setAllNodes(prevAll => {
        const nextAll = updater(prevAll);
        const updatedViewports = { ...viewportsRef.current, [currentBoardIdRef.current]: viewRef.current };
        const updatedModels = { ...selectedModelsRef.current, [currentBoardIdRef.current]: selectedModelIdRef.current };
        triggerAutoSave(nextAll, boardsRef.current, updatedViewports, updatedModels, allowEmptyNodes);
        return nextAll;
      });
    },
    [triggerAutoSave]
  );

  // Background asset sync engine: uploads any locally-stored image nodes to Google Drive
  const runBackgroundAssetSync = useCallback(
    async (token: string, project: ProjectMetadata, nodesToSync: CanvasNode[]) => {
      const activeToken = (await getValidAccessToken()) || token;
      const folderId =
        project.folderId || (await getFileParentFolderId(activeToken, project.spreadsheetId));
      if (!folderId) return;

      setIsSyncingAssets(true);
      try {
        const { updatedNodes, syncedCount, resolvedAssetsFolderId } = await syncUnuploadedImageNodes(
          activeToken,
          folderId,
          project.assetsFolderId,
          nodesToSync
        );

        const hasChanges = JSON.stringify(updatedNodes) !== JSON.stringify(nodesToSync);
        if (hasChanges) {
          if (resolvedAssetsFolderId && project.assetsFolderId !== resolvedAssetsFolderId) {
            setCurrentProject(prev => (prev ? { ...prev, assetsFolderId: resolvedAssetsFolderId } : prev));
          }
          // Update nodes state and trigger auto-save to Google Sheet
          updateNodesAndSave(() => updatedNodes);
          if (syncedCount > 0) {
            showToast(`已成功將 ${syncedCount} 張畫布圖片同步上傳至 Google Drive 專案資料夾！`);
          }
        }
      } catch (err) {
        console.warn('Background asset sync error:', err);
      } finally {
        setIsSyncingAssets(false);
      }
    },
    [updateNodesAndSave, showToast]
  );

  const handleSyncAssetsToDrive = useCallback(async () => {
    const activeToken = (await getValidAccessToken()) || getAccessToken();
    const proj = currentProjectRef.current;
    if (!activeToken || !proj) {
      showToast('請先登入 Google 帳號以同步圖片至雲端硬碟');
      return;
    }
    const nodes = allNodesRef.current;
    const pendingCount = nodes.filter(
      n => n.type === 'image' && n.status !== 'generating' && (!n.driveFileId || !isDriveFileId(n.driveFileId))
    ).length;

    if (pendingCount === 0) {
      showToast('目前所有圖片均已同步儲存於 Google Drive！');
      return;
    }

    showToast(`開始同步 ${pendingCount} 張圖片至 Google Drive...`);
    await runBackgroundAssetSync(activeToken, proj, nodes);
  }, [runBackgroundAssetSync, showToast]);

  // Reactive background asset sync: whenever project data is ready, auto-backup unuploaded images
  useEffect(() => {
    if (!currentProject || isLoadingProjectData || isInitialLoadRef.current) return;
    const token = getAccessToken();
    if (!token) return;

    if (unuploadedAssetCount > 0 && !isSyncingAssets) {
      const timer = setTimeout(() => {
        runBackgroundAssetSync(token, currentProject, allNodesRef.current);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentProject?.id, isLoadingProjectData, unuploadedAssetCount, isSyncingAssets, runBackgroundAssetSync]);

  const updateNode = useCallback(
    (id: string, updates: Partial<CanvasNode>) => {
      updateNodesAndSave(prevNodes =>
        prevNodes.map(n => (n.id === id ? ({ ...n, ...updates, updatedAt: Date.now() } as CanvasNode) : n))
      );
    },
    [updateNodesAndSave]
  );

  const updateMultipleNodes = useCallback(
    (batchUpdates: { id: string; updates: Partial<CanvasNode> }[]) => {
      const updateMap = new Map(batchUpdates.map(u => [u.id, u.updates]));
      updateNodesAndSave(prevNodes =>
        prevNodes.map(n => {
          const upd = updateMap.get(n.id);
          return upd ? ({ ...n, ...upd, updatedAt: Date.now() } as CanvasNode) : n;
        })
      );
    },
    [updateNodesAndSave]
  );

  const addNode = useCallback(
    <T extends CanvasNode>(newNode: T, autoSelect: boolean = true) => {
      const nodeWithBoard: CanvasNode = {
        ...newNode,
        boardId: newNode.boardId || currentBoardIdRef.current,
      };
      updateNodesAndSave(prev => [...prev, nodeWithBoard]);
      if (autoSelect) {
        setSelectedNodeIds(new Set([newNode.id]));
      }
    },
    [updateNodesAndSave]
  );

  // Multi-Board Handlers
  const handleSelectBoard = (newBoardId: string) => {
    if (isProjectBusy || newBoardId === activeBoardId) return;

    if (currentProject) {
      try {
        localStorage.setItem(`ai_mix_board_last_board_${currentProject.id}`, newBoardId);
      } catch {}
    }

    const updatedViewports = { ...viewports, [currentBoardId]: view };
    const updatedModels = { ...selectedModels, [currentBoardId]: selectedModelId };

    setViewports(updatedViewports);
    setSelectedModels(updatedModels);

    setActiveBoardId(newBoardId);
    setSelectedNodeIds(new Set());

    const targetView = updatedViewports[newBoardId] || { x: 0, y: 0, zoom: 1 };
    setView(targetView);

    const targetModel = migrateOldModelId(updatedModels[newBoardId] || DEFAULT_MODEL_ID);
    setSelectedModelId(targetModel);
  };

  const handleAddBoard = (name?: string) => {
    if (isProjectBusy) return;
    const newId = `board_${Date.now()}`;
    const newName = name?.trim() || `Board ${boards.length + 1}`;
    const newBoard: BoardMetadata = {
      id: newId,
      name: newName,
      createdAt: new Date().toISOString(),
    };

    if (currentProject) {
      try {
        localStorage.setItem(`ai_mix_board_last_board_${currentProject.id}`, newId);
      } catch {}
    }

    const updatedBoards = [...boards, newBoard];
    const updatedViewports = { ...viewports, [currentBoardId]: view, [newId]: { x: 0, y: 0, zoom: 1 } };
    const updatedModels = { ...selectedModels, [currentBoardId]: selectedModelId, [newId]: DEFAULT_MODEL_ID };

    setBoards(updatedBoards);
    setViewports(updatedViewports);
    setSelectedModels(updatedModels);
    setActiveBoardId(newId);
    setView({ x: 0, y: 0, zoom: 1 });
    setSelectedModelId(DEFAULT_MODEL_ID);
    setSelectedNodeIds(new Set());

    triggerAutoSave(allNodes, updatedBoards, updatedViewports, updatedModels);
  };

  const handleRenameBoard = (boardId: string, newName: string) => {
    if (isProjectBusy) return;
    const updatedBoards = boards.map(b => (b.id === boardId ? { ...b, name: newName, updatedAt: new Date().toISOString() } : b));
    setBoards(updatedBoards);
    triggerAutoSave(allNodes, updatedBoards, viewports, selectedModels);
  };

  const handleDeleteBoard = (boardId: string) => {
    if (isProjectBusy) return;
    if (boards.length <= 1) {
      showToast('畫布至少需保留一個分頁，無法刪除！');
      return;
    }

    const targetBoard = boards.find(b => b.id === boardId);
    const boardName = targetBoard?.name || '畫布分頁';

    const updatedBoards = boards.filter(b => b.id !== boardId);
    const updatedNodes = allNodes.filter(n => (n.boardId || boards[0]?.id) !== boardId);
    const remainingViewports = { ...viewports };
    delete remainingViewports[boardId];
    const remainingModels = { ...selectedModels };
    delete remainingModels[boardId];

    setBoards(updatedBoards);
    setAllNodes(updatedNodes);
    setViewports(remainingViewports);
    setSelectedModels(remainingModels);

    if (currentBoardId === boardId) {
      const nextActiveId = updatedBoards[0].id;
      if (currentProject) {
        try {
          localStorage.setItem(`ai_mix_board_last_board_${currentProject.id}`, nextActiveId);
        } catch {}
      }
      setActiveBoardId(nextActiveId);
      setView(remainingViewports[nextActiveId] || { x: 0, y: 0, zoom: 1 });
      setSelectedModelId(remainingModels[nextActiveId] || DEFAULT_MODEL_ID);
      setSelectedNodeIds(new Set());
    }

    triggerAutoSave(updatedNodes, updatedBoards, remainingViewports, remainingModels);
    showToast(`已成功刪除畫布分頁「${boardName}」`);
  };

  // Duplicate node: creates a new node pointing to the EXACT same asset without cloning file
  const handleDuplicateNode = useCallback(
    (nodeToDuplicate: CanvasNode) => {
      const newId = Date.now().toString();
      const shift = 30;
      const boardId = currentBoardIdRef.current;

      if (nodeToDuplicate.type === 'image') {
        const img = nodeToDuplicate as ImageNode;
        const duplicatedImageNode: ImageNode = {
          ...img,
          id: newId,
          x: img.x + shift,
          y: img.y + shift,
          boardId,
          content: img.content,
          driveFileId: img.driveFileId,
          originalFileName: img.originalFileName,
          driveViewLink: img.driveViewLink,
          createdAt: Date.now(),
        };
        addNode(duplicatedImageNode);
      } else {
        const txt = nodeToDuplicate as TextNode;
        const duplicatedTextNode: TextNode = {
          ...txt,
          id: newId,
          x: txt.x + shift,
          y: txt.y + shift,
          boardId,
          createdAt: Date.now(),
        };
        addNode(duplicatedTextNode);
      }
    },
    [addNode]
  );

  const handleDeleteNodes = useCallback(
    (nodeIdsToDelete: string[]) => {
      if (nodeIdsToDelete.length === 0) return;
      const deleteSet = new Set(nodeIdsToDelete);
      const curAllNodes = allNodesRef.current;

      // Immediately set deleting status on all target nodes
      setDeletingNodeIds(new Set(nodeIdsToDelete));

      // Find deleted ImageNodes
      const deletedImageNodes = curAllNodes.filter(
        n => deleteSet.has(n.id) && n.type === 'image' && (n as ImageNode).driveFileId
      ) as ImageNode[];

      // Check which driveFileIds will have 0 references across ALL boards in the project
      const remainingNodes = curAllNodes.filter(n => !deleteSet.has(n.id));
      const orphanMap = new Map<string, string>();

      deletedImageNodes.forEach(img => {
        const fileId = img.driveFileId!;
        const remainingCount = remainingNodes.filter(
          n => n.type === 'image' && (n as ImageNode).driveFileId === fileId
        ).length;

        if (remainingCount === 0 && !orphanMap.has(fileId)) {
          orphanMap.set(fileId, img.originalFileName || `asset_${fileId.slice(0, 6)}.png`);
        }
      });

      const executeCanvasDelete = (orphanCleanedCount?: number) => {
        updateNodesAndSave(prev => prev.filter(n => !deleteSet.has(n.id)), true);
        setSelectedNodeIds(prev => {
          const next = new Set(prev);
          nodeIdsToDelete.forEach(id => next.delete(id));
          return next;
        });
        setDeletingNodeIds(new Set());
        if (orphanCleanedCount && orphanCleanedCount > 0) {
          showToast(`已成功刪除 ${nodeIdsToDelete.length} 個節點，並將 ${orphanCleanedCount} 個檔案移至雲端垃圾桶！`);
        } else {
          showToast(`已成功刪除 ${nodeIdsToDelete.length} 個節點`);
        }
      };

      if (orphanMap.size > 0) {
        const token = getAccessToken();
        const orphanList = Array.from(orphanMap.entries()).map(([fileId, fileName]) => ({
          fileId,
          fileName,
        }));

        setOrphanAssetModal({
          isOpen: true,
          orphanFiles: orphanList,
          isDeleting: false,
          deletingIndex: -1,
          onConfirmDelete: async () => {
            setOrphanAssetModal(prev => (prev ? { ...prev, isDeleting: true, deletingIndex: 0 } : null));
            if (token) {
              for (let i = 0; i < orphanList.length; i++) {
                setOrphanAssetModal(prev => (prev ? { ...prev, deletingIndex: i } : null));
                try {
                  await deleteAssetFromDrive(token, orphanList[i].fileId);
                } catch (delErr) {
                  console.warn('Failed to delete orphan file from Drive:', orphanList[i].fileId, delErr);
                }
              }
            }
            setOrphanAssetModal(null);
            executeCanvasDelete(orphanList.length);
          },
          onKeepInDrive: () => {
            setOrphanAssetModal(null);
            executeCanvasDelete();
            showToast(`已自畫布移除 ${nodeIdsToDelete.length} 個節點 (保留雲端檔案)`);
          },
        });
      } else {
        executeCanvasDelete();
      }
    },
    [updateNodesAndSave, showToast]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      handleDeleteNodes([nodeId]);
    },
    [handleDeleteNodes]
  );

  // Canvas View & Interactions (Marquee Box Selection & Multi-Node Dragging)
  const rafIdRef = useRef<number | null>(null);
  const pointerPosRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const wheelSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isProjectBusyRef.current) return;

    // Pan mode with spacebar (any mouse button), middle mouse (button 1), or right click (button 2)
    if (isSpacePressedRef.current || e.button === 1 || e.button === 2) {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {}
      dragInfoRef.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
      };
      setIsPanning(true);
      return;
    }

    if ((e.target as HTMLElement).closest('.node-renderer')) return;

    if (e.button === 0) {
      // Capture pointer so marquee selection continues smoothly even when
      // moving over bottom toolbars, tabs, or outside canvas area
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {}

      // Marquee box selection on left click empty canvas
      if (!e.shiftKey) {
        setSelectedNodeIds(new Set());
      }
      dragInfoRef.current = {
        type: 'marquee',
        startX: e.clientX,
        startY: e.clientY,
        curX: e.clientX,
        curY: e.clientY,
        isShift: e.shiftKey,
        initialSelection: new Set(selectedNodeIdsRef.current),
      };
      setMarqueeBox({
        startX: e.clientX,
        startY: e.clientY,
        curX: e.clientX,
        curY: e.clientY,
      });
    }
  }, []);

  const handleNodeDragStart = useCallback((e: React.PointerEvent, nodeId: string) => {
    if (isSpacePressedRef.current) return;
    const currentSelected = selectedNodeIdsRef.current;
    let targetSelection: Set<string>;
    if (e.shiftKey) {
      targetSelection = new Set(currentSelected);
      if (targetSelection.has(nodeId)) {
        targetSelection.delete(nodeId);
      } else {
        targetSelection.add(nodeId);
      }
      setSelectedNodeIds(targetSelection);
    } else if (!currentSelected.has(nodeId)) {
      targetSelection = new Set([nodeId]);
      setSelectedNodeIds(targetSelection);
    } else {
      targetSelection = currentSelected;
    }

    // Only update ref, do not trigger a React state change if selection hasn't changed
    selectedNodeIdsRef.current = targetSelection;

    const cBoardId = currentBoardIdRef.current;
    const bId = boardsRef.current[0]?.id || DEFAULT_BOARD_ID;
    const cNodes = allNodesRef.current.filter(n => (n.boardId || bId) === cBoardId);
    const draggedNodes = cNodes.filter(n => targetSelection.has(n.id));
    const nodesMap = new Map(draggedNodes.map(n => [n.id, { x: n.x, y: n.y }]));

    dragInfoRef.current = {
      type: 'drag_node',
      startX: e.clientX,
      startY: e.clientY,
      nodes: nodesMap,
    };
  }, []);

  const processPointerMove = useCallback(() => {
    rafIdRef.current = null;
    const pos = pointerPosRef.current;
    const drag = dragInfoRef.current;
    if (!pos || !drag) return;

    const dx = pos.clientX - drag.startX;
    const dy = pos.clientY - drag.startY;

    if (drag.type === 'pan') {
      const curView = viewRef.current;
      const newView = { ...curView, x: curView.x + dx, y: curView.y + dy };
      viewRef.current = newView;
      setView(newView);
      drag.startX = pos.clientX;
      drag.startY = pos.clientY;
    } else if (drag.type === 'marquee') {
      drag.curX = pos.clientX;
      drag.curY = pos.clientY;
      setMarqueeBox({
        startX: drag.startX,
        startY: drag.startY,
        curX: pos.clientX,
        curY: pos.clientY,
      });

      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const sx1 = Math.min(drag.startX, pos.clientX) - rect.left;
      const sy1 = Math.min(drag.startY, pos.clientY) - rect.top;
      const sx2 = Math.max(drag.startX, pos.clientX) - rect.left;
      const sy2 = Math.max(drag.startY, pos.clientY) - rect.top;

      const curView = viewRef.current;
      const worldMinX = (sx1 - curView.x) / curView.zoom;
      const worldMinY = (sy1 - curView.y) / curView.zoom;
      const worldMaxX = (sx2 - curView.x) / curView.zoom;
      const worldMaxY = (sy2 - curView.y) / curView.zoom;

      const nextSelection = new Set<string>(drag.isShift ? drag.initialSelection : []);
      const cBoardId = currentBoardIdRef.current;
      const bId = boardsRef.current[0]?.id || DEFAULT_BOARD_ID;
      const cNodes = allNodesRef.current.filter(n => (n.boardId || bId) === cBoardId);

      cNodes.forEach(node => {
        const nodeMaxX = node.x + node.width;
        const nodeMaxY = node.y + node.height;
        const isInsideOrIntersect =
          node.x <= worldMaxX &&
          nodeMaxX >= worldMinX &&
          node.y <= worldMaxY &&
          nodeMaxY >= worldMinY;
        if (isInsideOrIntersect) {
          nextSelection.add(node.id);
        }
      });

      const currentSelected = selectedNodeIdsRef.current;
      let changed = nextSelection.size !== currentSelected.size;
      if (!changed) {
        for (const id of nextSelection) {
          if (!currentSelected.has(id)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        setSelectedNodeIds(nextSelection);
        selectedNodeIdsRef.current = nextSelection;
      }
    } else if (drag.type === 'drag_node' && drag.nodes) {
      const curView = viewRef.current;
      const posMap = new Map<string, { x: number; y: number }>();
      drag.nodes.forEach((startPos, id) => {
        posMap.set(id, {
          x: Math.round(startPos.x + dx / curView.zoom),
          y: Math.round(startPos.y + dy / curView.zoom),
        });
      });

      // Instead of setAllNodes, we directly mutate the DOM styles for smooth 60fps drag
      posMap.forEach((pos, id) => {
        const el = document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;
        if (el) {
          el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        }
      });
      drag.currentPositions = posMap;
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragInfoRef.current) return;
      pointerPosRef.current = { clientX: e.clientX, clientY: e.clientY };
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(processPointerMove);
      }
    },
    [processPointerMove]
  );

  const handlePointerUp = useCallback(
    (e?: React.PointerEvent) => {
      if (e && canvasRef.current && typeof e.pointerId === 'number') {
        try {
          if (canvasRef.current.hasPointerCapture?.(e.pointerId)) {
            canvasRef.current.releasePointerCapture(e.pointerId);
          }
        } catch {}
      }

      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        processPointerMove();
      }

      const lastDrag = dragInfoRef.current;
      if (lastDrag?.type === 'pan') {
        setViewports(prev => ({ ...prev, [currentBoardIdRef.current]: viewRef.current }));
      } else if (lastDrag?.type === 'drag_node') {
        if (lastDrag.currentPositions) {
          const finalPositions = lastDrag.currentPositions;
          setAllNodes(prev => {
            const nextNodes = prev.map(n => {
              const newPos = finalPositions.get(n.id);
              return newPos ? { ...n, x: newPos.x, y: newPos.y } : n;
            });
            setTimeout(() => {
               triggerAutoSave(nextNodes, boardsRef.current, viewportsRef.current, selectedModelsRef.current);
            }, 0);
            return nextNodes;
          });
        }
      }

      dragInfoRef.current = null;
      setMarqueeBox(null);
      setIsPanning(false);
      canvasRef.current?.classList.remove('cursor-grabbing');
    },
    [processPointerMove, triggerAutoSave]
  );

  // Global pointerup fallback ensuring drag gestures are always cleaned up properly
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (dragInfoRef.current) {
        handlePointerUp();
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [handlePointerUp]);

  // Canvas Native Wheel & Pinch-to-Zoom / Pan Handler with { passive: false }
  // Attaching directly with { passive: false } guarantees that e.preventDefault()
  // stops the browser from zooming the outer UI/page on trackpad pinch.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const handleCanvasWheel = (e: WheelEvent) => {
      e.preventDefault();
      const isPinchOrCtrl = e.ctrlKey || e.metaKey;

      if (isPinchOrCtrl) {
        // Smooth exponential zoom for pinch gesture or Ctrl/Cmd + wheel
        const normalizedDelta = Math.max(-80, Math.min(80, e.deltaY));
        const zoomFactor = Math.exp(-normalizedDelta * 0.003);
        const curView = viewRef.current;
        const newZoom = Math.max(0.1, Math.min(5, curView.zoom * zoomFactor));

        const rect = canvasEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - curView.x) / curView.zoom;
        const worldY = (mouseY - curView.y) / curView.zoom;

        const newX = mouseX - worldX * newZoom;
        const newY = mouseY - worldY * newZoom;

        const newView = { x: newX, y: newY, zoom: newZoom };
        viewRef.current = newView;
        setView(newView);

        if (wheelSaveTimerRef.current) clearTimeout(wheelSaveTimerRef.current);
        wheelSaveTimerRef.current = setTimeout(() => {
          setViewports(prev => ({ ...prev, [currentBoardIdRef.current]: newView }));
        }, 150);
      } else {
        // Two-finger trackpad panning or Shift+wheel horizontal panning
        let dx = -e.deltaX;
        let dy = -e.deltaY;
        if (e.shiftKey && dx === 0) {
          dx = -e.deltaY;
          dy = 0;
        }
        const curView = viewRef.current;
        const newView = { ...curView, x: curView.x + dx, y: curView.y + dy };
        viewRef.current = newView;
        setView(newView);

        if (wheelSaveTimerRef.current) clearTimeout(wheelSaveTimerRef.current);
        wheelSaveTimerRef.current = setTimeout(() => {
          setViewports(prev => ({ ...prev, [currentBoardIdRef.current]: newView }));
        }, 150);
      }
    };

    canvasEl.addEventListener('wheel', handleCanvasWheel, { passive: false });
    return () => {
      canvasEl.removeEventListener('wheel', handleCanvasWheel);
    };
  }, []);

  // Global prevention of outer browser UI zoom (e.g. pinch gesture outside canvas, Safari gestures)
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    const preventGesture = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });
    document.addEventListener('gestureend', preventGesture, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  const handleSelectNode = useCallback((id: string, shiftKey: boolean) => {
    if (isSpacePressedRef.current) return;
    setSelectedNodeIds(prev => {
      const newSelection = new Set(prev);
      if (shiftKey) {
        newSelection.has(id) ? newSelection.delete(id) : newSelection.add(id);
      } else {
        if (prev.size === 1 && prev.has(id)) {
          return prev;
        }
        return new Set([id]);
      }
      return newSelection;
    });
  }, []);

  const getCanvasCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - view.x) / view.zoom;
    const y = (clientY - rect.top - view.y) / view.zoom;
    return { x, y };
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (isProjectBusy || isSpacePressedRef.current || isSpacePressed) return;
    if ((e.target as HTMLElement).closest('[data-node-id]')) return;

    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    const newNodeId = Date.now().toString();
    const newNode: TextNode = {
      id: newNodeId,
      type: 'text',
      x,
      y,
      width: 220,
      height: 70,
      rotation: 0,
      boardId: currentBoardId,
      content: '點此輸入提示詞或文字...',
      createdAt: Date.now(),
    };
    addNode(newNode);
  };

  // Upload image file at specific canvas coords (or center if omitted)
  const handleUploadImageFile = useCallback(
    async (file: File, targetCoords?: { x: number; y: number }) => {
      if (isProjectBusy) return;
      const token = getAccessToken();
      const initialCoords = targetCoords || getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);
      const id = Date.now().toString();

      // Store locally in IndexedDB first for instant UI response
      await storeImage(id, file);

      const base64 = await blobToBase64(file);
      const img = new Image();
      img.onload = async () => {
        const defaultSize = getDefaultNodeSize();
        const fitted = fitDimensions(img.width, img.height, defaultSize.width, defaultSize.height, false);
        const width = fitted.width;
        const height = fitted.height;
        const { x, y } = targetCoords || findOpenPosition(initialCoords.x, initialCoords.y, width, height, currentBoardNodes);

        let driveFileId = id;
        let driveViewLink: string | undefined;

        // If connected to Google Drive, upload file into project's assets folder
        const activeToken = (await getValidAccessToken()) || getAccessToken() || token;
        const targetProj = currentProjectRef.current || currentProject;
        const projFolderId =
          targetProj?.folderId ||
          (activeToken && targetProj?.spreadsheetId
            ? await getFileParentFolderId(activeToken, targetProj.spreadsheetId)
            : null);

        if (activeToken && projFolderId) {
          try {
            const assetsFolderId =
              targetProj?.assetsFolderId ||
              (await ensureAssetsFolder(activeToken, projFolderId));
            const uploaded = await uploadAssetToDrive(
              activeToken,
              assetsFolderId,
              file,
              file.name || `image_${id}.png`
            );
            driveFileId = uploaded.fileId;
            driveViewLink = uploaded.webViewLink;

            if (driveFileId !== id) {
              await storeImage(driveFileId, file, undefined, true);
              await storeImage(id, file, undefined, true);
              nodeObjectUrlCache.set(driveFileId, base64);
              nodeObjectUrlCache.set(id, base64);
            }
          } catch (uploadErr) {
            console.warn('Upload to Google Drive assets failed, stored locally:', uploadErr);
          }
        }

        const newNode: ImageNode = {
          id,
          type: 'image',
          x,
          y,
          width,
          height,
          rotation: 0,
          boardId: currentBoardId,
          content: driveFileId,
          driveFileId,
          originalFileName: file.name,
          driveViewLink,
          createdAt: Date.now(),
        };

        addNode(newNode);
      };
      img.src = base64;
    },
    [isProjectBusy, currentBoardNodes, currentProject, addNode, currentBoardId, view]
  );

  // Drag-and-Drop Image Files onto Canvas
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isProjectBusy) return;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFileOver(true);
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFileOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFileOver(false);
    if (isProjectBusy) return;

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const dropCoords = getCanvasCoords(e.clientX, e.clientY);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const offset = i * 35;
      const targetCoords = { x: dropCoords.x + offset, y: dropCoords.y + offset };
      await handleUploadImageFile(file, targetCoords);
    }
  };

  const handleCut = useCallback(async () => {
    if (selectedNodeIds.size === 0) return;
    const selectedNodes = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    if (selectedNodes.length === 0) return;

    // Set clipboard and mark nodes as cut (semi-transparent ghosted)
    // Professional behavior: DO NOT delete yet, and NEVER prompt or touch cloud files!
    setCopiedNodesClipboard(selectedNodes);
    setCutNodeIds(new Set(selectedNodeIds));
    await copyNodesToClipboard(selectedNodes);
    showToast(`已剪下 ${selectedNodes.length} 個物件 (前往目標位置按 Cmd+V 貼上)`);
  }, [selectedNodeIds, currentBoardNodes, showToast]);

  const handleCopy = useCallback(async () => {
    if (selectedNodeIds.size === 0) return;
    const selectedNodes = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    if (selectedNodes.length === 0) return;

    setCutNodeIds(new Set()); // Cancel any pending cut
    setCopiedNodesClipboard(selectedNodes);
    const res = await copyNodesToClipboard(selectedNodes);
    if (res.message) {
      showToast(res.message);
    }
  }, [selectedNodeIds, currentBoardNodes, showToast]);

  const handlePasteNodes = useCallback((targetCoords?: { x: number; y: number }) => {
    let nodesToPaste = copiedNodesClipboard;
    if (nodesToPaste.length === 0) {
      try {
        const stored = sessionStorage.getItem('ai_mix_board_clipboard');
        if (stored) nodesToPaste = JSON.parse(stored);
      } catch {}
    }
    if (!nodesToPaste || nodesToPaste.length === 0) return false;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodesToPaste.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    });

    const origCenterX = (minX + maxX) / 2;
    const origCenterY = (minY + maxY) / 2;
    const targetCenter = targetCoords || getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);

    const newSelectedIds = new Set<string>();
    const newPastedNodes: CanvasNode[] = [];
    const isMovingCut = cutNodeIds.size > 0;
    const cutIdsSnapshot = new Set(cutNodeIds);

    nodesToPaste.forEach((node, idx) => {
      const newId = `${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`;
      const relX = node.x - origCenterX;
      const relY = node.y - origCenterY;

      const pastedNode: CanvasNode = {
        ...node,
        id: newId,
        x: Math.round(targetCenter.x + relX),
        y: Math.round(targetCenter.y + relY),
        boardId: currentBoardId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      newPastedNodes.push(pastedNode);
      newSelectedIds.add(newId);
    });

    if (isMovingCut) {
      // Complete the Cut -> Paste move: remove original cut nodes and insert new ones.
      // Cloud storage is 100% preserved because the assets are simply moved to their new destination.
      updateNodesAndSave(prev => [
        ...prev.filter(n => !cutIdsSnapshot.has(n.id)),
        ...newPastedNodes,
      ]);
      setCutNodeIds(new Set());
      showToast(`已移動 ${newPastedNodes.length} 個物件`);
    } else {
      updateNodesAndSave(prev => [...prev, ...newPastedNodes]);
      showToast(`已貼上 ${newPastedNodes.length} 個物件`);
    }

    setSelectedNodeIds(newSelectedIds);
    return true;
  }, [copiedNodesClipboard, cutNodeIds, currentBoardId, getCanvasCoords, updateNodesAndSave, showToast]);

  const handlePasteFromContextMenu = useCallback(async () => {
    const coords = getCanvasCoords(contextMenu.position.x, contextMenu.position.y);
    const didPasteNodes = handlePasteNodes(coords);
    if (didPasteNodes) {
      showToast('已貼上物件');
      return;
    }

    // Fallback: try reading system clipboard
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const file = new File([blob], `pasted_${Date.now()}.png`, { type });
              await handleUploadImageFile(file, coords);
              showToast('已貼上圖片');
              return;
            }
          }
        }
      }
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          addNode({
            id: Date.now().toString(),
            type: 'text',
            x: coords.x,
            y: coords.y,
            width: 220,
            height: 100,
            rotation: 0,
            boardId: currentBoardId,
            content: text.trim(),
            createdAt: Date.now(),
          });
          showToast('已貼上文字');
          return;
        }
      }
    } catch (err) {
      console.warn('Clipboard paste failed:', err);
    }
  }, [contextMenu.position, getCanvasCoords, handlePasteNodes, handleUploadImageFile, addNode, currentBoardId, showToast]);

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        return;
      }
      e.preventDefault();

      // 1. Try pasting copied canvas nodes first (cross-board supported)
      if (copiedNodesClipboard.length > 0 || sessionStorage.getItem('ai_mix_board_clipboard')) {
        const didPaste = handlePasteNodes();
        if (didPaste) return;
      }

      // 2. Check pasted plain text
      const initialCoords = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);
      const text = e.clipboardData?.getData('text/plain');
      if (text) {
        const width = 220;
        const height = 100;
        const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, currentBoardNodes);
        addNode({
          id: Date.now().toString(),
          type: 'text',
          x,
          y,
          width,
          height,
          rotation: 0,
          boardId: currentBoardId,
          content: text,
          createdAt: Date.now(),
        });
        return;
      }

      // 3. Check pasted image
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              await handleUploadImageFile(file);
            }
            return;
          }
        }
      }
    },
    [copiedNodesClipboard, handlePasteNodes, getCanvasCoords, currentBoardNodes, addNode, currentBoardId, handleUploadImageFile]
  );

  // Execute Generation (Concurrent & Non-blocking)
  const handleExecute = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    setError(null);

    // 1. Snapshot selection and environment for this generation job
    const capturedSelectedNodes = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    if (capturedSelectedNodes.length === 0) return;

    const hasImageSelection = capturedSelectedNodes.some(n => n.type === 'image');
    let capturedModelId = selectedModelId;
    let modelInfo = getModelById(capturedModelId);

    // If reference images are passed but model doesn't support image output, route to image generation model
    if (hasImageSelection && !modelInfo.capabilities.supportsImageOutput) {
      capturedModelId = DEFAULT_MODEL_ID;
      modelInfo = getModelById(capturedModelId);
      showToast(`選取了參考圖，已自動使用多模態生圖模型 (${modelInfo.name}) 生成圖像`);
    }

    const capturedBoardId = currentBoardId;
    const token = getAccessToken();

    // 2. Build prompt snippet / summary for the placeholder card
    const textSnippets = capturedSelectedNodes
      .filter(n => n.type === 'text')
      .map(n => (n as TextNode).content.trim())
      .filter(Boolean);
    const imageCount = capturedSelectedNodes.filter(n => n.type === 'image').length;

    let promptSnippet = '';
    if (textSnippets.length > 0) {
      promptSnippet = textSnippets.join('; ');
      if (imageCount > 0) {
        promptSnippet += ` (+${imageCount} 張圖)`;
      }
    } else if (imageCount > 0) {
      promptSnippet = `${imageCount} 張參考圖片合成`;
    } else {
      promptSnippet = 'AI 圖像合成生成';
    }

    if (promptSnippet.length > 80) {
      promptSnippet = promptSnippet.slice(0, 77) + '...';
    }

    // 3. Determine open position for the placeholder node
    const defaultSize = getDefaultNodeSize();
    const placeholderWidth = defaultSize.width || 384;
    const placeholderHeight = defaultSize.height || 384;

    const initialCoords = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);
    let anchorX = initialCoords.x;
    let anchorY = initialCoords.y;

    if (capturedSelectedNodes.length > 0) {
      // Place right next to the selected nodes
      const maxX = Math.max(...capturedSelectedNodes.map(n => n.x + n.width));
      const avgY = capturedSelectedNodes.reduce((acc, n) => acc + n.y, 0) / capturedSelectedNodes.length;
      anchorX = maxX + 40;
      anchorY = avgY;
    }

    const { x, y } = findOpenPosition(
      anchorX,
      anchorY,
      placeholderWidth,
      placeholderHeight,
      currentBoardNodes
    );

    const jobId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 4. Create and place the placeholder node immediately
    const placeholderNode: ImageNode = {
      id: jobId,
      type: 'image',
      x,
      y,
      width: placeholderWidth,
      height: placeholderHeight,
      rotation: 0,
      boardId: capturedBoardId,
      content: '',
      status: 'generating',
      generationPrompt: promptSnippet,
      generationModel: modelInfo?.name || capturedModelId,
      generationModelId: capturedModelId,
      generationSourceIds: capturedSelectedNodes.map(n => n.id),
      createdAt: Date.now(),
    };

    // Add placeholder without deselecting user's current selection,
    // so they can immediately send another job or modify prompt!
    addNode(placeholderNode, false);
    setActiveJobCount(c => c + 1);

    // 5. Run async generation in the background without blocking the user
    (async () => {
      try {
        const result = await generateFromNodes(capturedSelectedNodes, capturedModelId);

        if (result.type === 'image') {
          const newImageBlob = result.blob;
          await storeImage(jobId, newImageBlob);

          let driveFileId = jobId;
          let driveViewLink: string | undefined;

          // Upload generated image asset to Google Drive project assets folder if connected
          const activeToken = (await getValidAccessToken()) || getAccessToken() || token;
          const targetProj = currentProjectRef.current || currentProject;
          const projFolderId =
            targetProj?.folderId ||
            (activeToken && targetProj?.spreadsheetId
              ? await getFileParentFolderId(activeToken, targetProj.spreadsheetId)
              : null);

          if (activeToken && projFolderId) {
            try {
              const assetsFolderId =
                targetProj?.assetsFolderId ||
                (await ensureAssetsFolder(activeToken, projFolderId));
              const uploaded = await uploadAssetToDrive(
                activeToken,
                assetsFolderId,
                newImageBlob,
                `gemini_gen_${jobId}.png`
              );
              driveFileId = uploaded.fileId;
              driveViewLink = uploaded.webViewLink;

              if (driveFileId !== jobId) {
                await storeImage(driveFileId, newImageBlob, undefined, true);
                await storeImage(jobId, newImageBlob, undefined, true);
              }
            } catch (uploadErr) {
              console.warn('Drive upload failed for generated image:', uploadErr);
            }
          }

          // Pre-populate memory ObjectURL cache so image displays with zero delay/flicker
          const objectUrl = URL.createObjectURL(newImageBlob);
          nodeObjectUrlCache.set(driveFileId, objectUrl);
          nodeObjectUrlCache.set(jobId, objectUrl);

          const base64 = await blobToBase64(newImageBlob);
          const img = new Image();
          img.onload = () => {
            const fitted = fitDimensions(img.width, img.height, defaultSize.width, defaultSize.height, false);
            updateNodesAndSave(prev => {
              const exists = prev.some(n => n.id === jobId);
              if (!exists) return prev; // User deleted the node while generating
              return prev.map(node => {
                if (node.id !== jobId) return node;
                return {
                  ...node,
                  width: fitted.width,
                  height: fitted.height,
                  content: driveFileId,
                  driveFileId,
                  originalFileName: `generated_${jobId}.png`,
                  driveViewLink,
                  status: 'idle',
                  errorMessage: undefined,
                  updatedAt: Date.now(),
                };
              });
            });
          };
          img.src = base64;
        } else {
          // Text output from reasoning model
          updateNodesAndSave(prev => {
            const exists = prev.some(n => n.id === jobId);
            if (!exists) return prev;
            return prev.map(node => {
              if (node.id !== jobId) return node;
              return {
                ...node,
                type: 'text',
                content: result.text,
                status: 'idle',
                errorMessage: undefined,
                updatedAt: Date.now(),
              };
            });
          });
        }
      } catch (err: any) {
        console.error('Generation Error for job:', jobId, err);
        const errorMsg = err.message || '生成失敗，請檢查 API Key 或選取節點。';
        updateNodesAndSave(prev => {
          const exists = prev.some(n => n.id === jobId);
          if (!exists) return prev;
          return prev.map(node => {
            if (node.id !== jobId) return node;
            return {
              ...node,
              status: 'error',
              errorMessage: errorMsg,
              generationPrompt: (node as ImageNode).generationPrompt || promptSnippet,
              generationModel: (node as ImageNode).generationModel || (modelInfo?.name || capturedModelId),
              generationModelId: (node as ImageNode).generationModelId || capturedModelId,
              generationSourceIds: (node as ImageNode).generationSourceIds || capturedSelectedNodes.map(n => n.id),
              updatedAt: Date.now(),
            };
          });
        });
      } finally {
        setActiveJobCount(c => Math.max(0, c - 1));
      }
    })();
  }, [
    selectedNodeIds,
    currentBoardNodes,
    selectedModelId,
    currentProject,
    addNode,
    currentBoardId,
    getCanvasCoords,
    updateNodesAndSave,
  ]);

  // Retry a failed generation node
  const handleRetryNode = useCallback(
    async (nodeId: string) => {
      const targetNode = allNodesRef.current.find(n => n.id === nodeId);
      if (!targetNode || targetNode.status !== 'error') return;

      setError(null);

      // 1. Identify model to use
      let targetModelId = targetNode.generationModelId || selectedModelId;
      let modelInfo = getModelById(targetModelId);
      if (targetNode.type === 'image' && !modelInfo.capabilities.supportsImageOutput) {
        targetModelId = DEFAULT_MODEL_ID;
        modelInfo = getModelById(targetModelId);
      }

      // 2. Identify source nodes
      const sourceIds = new Set(targetNode.generationSourceIds || []);
      let sourceNodes = allNodesRef.current.filter(n => sourceIds.has(n.id));

      // If source nodes no longer exist, use the saved prompt snippet as fallback text input
      if (sourceNodes.length === 0 && targetNode.generationPrompt) {
        const syntheticPromptNode: TextNode = {
          id: `prompt_${nodeId}`,
          type: 'text',
          x: targetNode.x,
          y: targetNode.y,
          width: 200,
          height: 50,
          rotation: 0,
          content: targetNode.generationPrompt,
          boardId: targetNode.boardId,
          createdAt: Date.now(),
        };
        sourceNodes = [syntheticPromptNode];
      }

      if (sourceNodes.length === 0) {
        showToast('找不到此節點當初生成時的輸入內容或提示詞，無法重試');
        return;
      }

      // 3. Mark node as generating & clear error
      updateNodesAndSave(prev =>
        prev.map(n => {
          if (n.id !== nodeId) return n;
          return {
            ...n,
            status: 'generating',
            errorMessage: undefined,
            generationModel: modelInfo?.name || targetModelId,
            generationModelId: targetModelId,
            updatedAt: Date.now(),
          };
        })
      );

      setActiveJobCount(c => c + 1);
      showToast('已開始重試生成節點...');

      // 4. Run async generation
      (async () => {
        const token = getAccessToken();
        const defaultSize = getDefaultNodeSize();

        try {
          const result = await generateFromNodes(sourceNodes, targetModelId);

          if (result.type === 'image') {
            const newImageBlob = result.blob;
            await storeImage(nodeId, newImageBlob);

            let driveFileId = nodeId;
            let driveViewLink: string | undefined;

            const activeToken = (await getValidAccessToken()) || getAccessToken() || token;
            const targetProj = currentProjectRef.current || currentProject;
            const projFolderId =
              targetProj?.folderId ||
              (activeToken && targetProj?.spreadsheetId
                ? await getFileParentFolderId(activeToken, targetProj.spreadsheetId)
                : null);

            if (activeToken && projFolderId) {
              try {
                const assetsFolderId =
                  targetProj?.assetsFolderId ||
                  (await ensureAssetsFolder(activeToken, projFolderId));
                const uploaded = await uploadAssetToDrive(
                  activeToken,
                  assetsFolderId,
                  newImageBlob,
                  `gemini_gen_${nodeId}.png`
                );
                driveFileId = uploaded.fileId;
                driveViewLink = uploaded.webViewLink;

                if (driveFileId !== nodeId) {
                  await storeImage(driveFileId, newImageBlob, undefined, true);
                  await storeImage(nodeId, newImageBlob, undefined, true);
                }
              } catch (uploadErr) {
                console.warn('Drive upload failed for retried image:', uploadErr);
              }
            }

            const objectUrl = URL.createObjectURL(newImageBlob);
            nodeObjectUrlCache.set(driveFileId, objectUrl);
            nodeObjectUrlCache.set(nodeId, objectUrl);

            const base64 = await blobToBase64(newImageBlob);
            const img = new Image();
            img.onload = () => {
              const fitted = fitDimensions(img.width, img.height, defaultSize.width, defaultSize.height, false);
              updateNodesAndSave(prev => {
                const exists = prev.some(n => n.id === nodeId);
                if (!exists) return prev;
                return prev.map(node => {
                  if (node.id !== nodeId) return node;
                  return {
                    ...node,
                    width: fitted.width,
                    height: fitted.height,
                    content: driveFileId,
                    driveFileId,
                    originalFileName: `generated_${nodeId}.png`,
                    driveViewLink,
                    status: 'idle',
                    errorMessage: undefined,
                    updatedAt: Date.now(),
                  };
                });
              });
              showToast('節點重試生成成功！');
            };
            img.src = base64;
          } else {
            // Text output
            updateNodesAndSave(prev => {
              const exists = prev.some(n => n.id === nodeId);
              if (!exists) return prev;
              return prev.map(node => {
                if (node.id !== nodeId) return node;
                return {
                  ...node,
                  type: 'text',
                  content: result.text,
                  status: 'idle',
                  errorMessage: undefined,
                  updatedAt: Date.now(),
                };
              });
            });
            showToast('節點重試生成成功！');
          }
        } catch (err: any) {
          console.error('Retry generation error for node:', nodeId, err);
          const errorMsg = err.message || '重試失敗，請檢查 API Key 或網路設定。';
          updateNodesAndSave(prev => {
            const exists = prev.some(n => n.id === nodeId);
            if (!exists) return prev;
            return prev.map(node => {
              if (node.id !== nodeId) return node;
              return {
                ...node,
                status: 'error',
                errorMessage: errorMsg,
                updatedAt: Date.now(),
              };
            });
          });
          showToast('重試生成失敗：' + (err.message || '未知錯誤'));
        } finally {
          setActiveJobCount(c => Math.max(0, c - 1));
        }
      })();
    },
    [selectedModelId, currentProject, updateNodesAndSave, showToast]
  );

  // Retry all selected nodes that are in error state
  const handleRetrySelectedErrorNodes = useCallback(() => {
    const errorNodes = currentBoardNodes.filter(n => selectedNodeIds.has(n.id) && n.status === 'error');
    if (errorNodes.length === 0) return;
    errorNodes.forEach(n => handleRetryNode(n.id));
  }, [currentBoardNodes, selectedNodeIds, handleRetryNode]);

  const fitToView = useCallback((targetNodes?: CanvasNode[]) => {
    const nodesToFit = targetNodes && targetNodes.length > 0
      ? targetNodes
      : (selectedNodeIds.size > 0
          ? currentBoardNodes.filter(n => selectedNodeIds.has(n.id))
          : currentBoardNodes);

    if (!canvasRef.current || nodesToFit.length === 0) {
      const defaultView = { x: 0, y: 0, zoom: 1 };
      setView(defaultView);
      setViewports(prev => ({ ...prev, [currentBoardId]: defaultView }));
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodesToFit.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });

    const contentWidth = Math.max(20, maxX - minX);
    const contentHeight = Math.max(20, maxY - minY);
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;

    const rect = canvasRef.current.getBoundingClientRect();
    const screenWidth = rect.width || window.innerWidth;
    const screenHeight = rect.height || window.innerHeight;

    const paddingX = Math.min(120, screenWidth * 0.1);
    const paddingY = Math.min(100, screenHeight * 0.1);
    const availableWidth = Math.max(50, screenWidth - paddingX * 2);
    const availableHeight = Math.max(50, screenHeight - paddingY * 2);

    const zoomX = availableWidth / contentWidth;
    const zoomY = availableHeight / contentHeight;
    const optimalZoom = Math.min(zoomX, zoomY, 1.2);
    const clampedZoom = Math.max(0.04, Math.min(3, optimalZoom));

    const newX = (screenWidth / 2) - (contentCenterX * clampedZoom);
    const newY = (screenHeight / 2) - (contentCenterY * clampedZoom);

    const newView: ViewportState = {
      x: Math.round(newX),
      y: Math.round(newY),
      zoom: parseFloat(clampedZoom.toFixed(3)),
    };

    setView(newView);
    setViewports(prev => ({ ...prev, [currentBoardId]: newView }));
  }, [currentBoardNodes, selectedNodeIds, currentBoardId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputActive =
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'INPUT' ||
        (document.activeElement as HTMLElement)?.isContentEditable;

      const isAnyModalOpen =
        isModelModalOpen ||
        isProjectModalOpen ||
        isAuthModalOpen ||
        isRescueModalOpen ||
        Boolean(orphanAssetModal?.isOpen);

      // Space key for panning cursor - completely enter pan mode
      if (e.code === 'Space' && !isInputActive && !isAnyModalOpen) {
        e.preventDefault();
        if (!isSpacePressedRef.current) {
          isSpacePressedRef.current = true;
          setIsSpacePressed(true);
        }
        return;
      }

      // Execute with Shift+Enter
      if (e.key === 'Enter' && e.shiftKey) {
        handleExecute();
      }

      // Duplicate selected with Cmd+D / Ctrl+D
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const selected = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
        selected.forEach(node => handleDuplicateNode(node));
      }

      // Cut with Cmd+X / Ctrl+X
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault();
        handleCut();
      }

      // Copy with Cmd+C / Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        handleCopy();
      }

      // Paste with Cmd+V / Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        // Native paste event handled by window.addEventListener('paste', handlePaste)
      }

      // Delete with Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        if (selectedNodeIds.size > 0) {
          handleDeleteNodes(Array.from(selectedNodeIds));
        }
      }

      // Fit to View (F key or Shift+1)
      if (
        (e.shiftKey && e.key === '!') ||
        (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey)
      ) {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault();
        fitToView();
      }

      // Zoom in / out / reset via Cmd/Ctrl + '+', '-', '0' (preventing browser UI zoom)
      if ((e.metaKey || e.ctrlKey) && !isInputActive) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const newZoom = Math.min(5, viewRef.current.zoom * 1.2);
          const newView = { ...viewRef.current, zoom: newZoom };
          viewRef.current = newView;
          setView(newView);
          setViewports(prev => ({ ...prev, [currentBoardIdRef.current]: newView }));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          const newZoom = Math.max(0.1, viewRef.current.zoom / 1.2);
          const newView = { ...viewRef.current, zoom: newZoom };
          viewRef.current = newView;
          setView(newView);
          setViewports(prev => ({ ...prev, [currentBoardIdRef.current]: newView }));
        } else if (e.key === '0') {
          e.preventDefault();
          const newView = { ...viewRef.current, zoom: 1 };
          viewRef.current = newView;
          setView(newView);
          setViewports(prev => ({ ...prev, [currentBoardIdRef.current]: newView }));
        }
      }

      // Select All (Cmd+A / Ctrl+A)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault();
        setSelectedNodeIds(new Set(currentBoardNodes.map(n => n.id)));
      }

      // Escape to Deselect All & Close Context Menu & Cancel Cut
      if (e.key === 'Escape') {
        setSelectedNodeIds(new Set());
        setCutNodeIds(new Set());
        setContextMenu(prev => ({ ...prev, isOpen: false }));
      }

      // Auto Arrange (Alt+G)
      if (e.altKey && e.key.toLowerCase() === 'g') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault();
        const selected = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
        if (selected.length > 1) {
          autoArrangeNodes(selected, 'grid', updateMultipleNodes);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        setIsSpacePressed(false);
        if (!dragInfoRef.current || dragInfoRef.current.type !== 'pan') {
          setIsPanning(false);
        }
      }
    };

    const handleBlur = () => {
      isSpacePressedRef.current = false;
      setIsSpacePressed(false);
      setIsPanning(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleExecute, handleDuplicateNode, handleCut, handleCopy, handleDeleteNodes, fitToView, selectedNodeIds, currentBoardNodes, updateMultipleNodes, isModelModalOpen, isProjectModalOpen, isAuthModalOpen, isRescueModalOpen, orphanAssetModal]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleCreateProject = async (name: string) => {
    const token = getAccessToken();
    if (!token) {
      throw new Error('請先登入 Google 帳號以在 Drive 建立專案');
    }
    const created = await createProject(token, name);
    setProjects(prev => [created, ...prev]);
    setCurrentProject(created);
    try {
      const email = user?.email || getCurrentUser()?.email;
      if (email) {
        localStorage.setItem(`ai_mix_board_last_project_${email}`, created.id);
        localStorage.setItem(`ai_mix_board_last_project_meta_${email}`, JSON.stringify(created));
      }
      localStorage.setItem('ai_mix_board_last_project', created.id);
      localStorage.setItem('ai_mix_board_last_project_meta', JSON.stringify(created));
    } catch {}
  };

  const handleSelectProject = useCallback((p: ProjectMetadata) => {
    if (currentProject?.id === p.id) return;
    setCurrentProject(p);
    try {
      const email = user?.email || getCurrentUser()?.email;
      if (email) {
        localStorage.setItem(`ai_mix_board_last_project_${email}`, p.id);
        localStorage.setItem(`ai_mix_board_last_project_meta_${email}`, JSON.stringify(p));
      }
      localStorage.setItem('ai_mix_board_last_project', p.id);
      localStorage.setItem('ai_mix_board_last_project_meta', JSON.stringify(p));
    } catch (e) {
      console.warn('Failed to save selected project to localStorage:', e);
    }
  }, [currentProject?.id, user?.email]);

  const canvasFileInputRef = useRef<HTMLInputElement>(null);

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (isSpacePressedRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      if (!selectedNodeIdsRef.current.has(nodeId)) {
        setSelectedNodeIds(new Set([nodeId]));
      }

      setContextMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        targetType: 'node',
      });
    },
    []
  );

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    if (isSpacePressedRef.current) return;
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      targetType: 'canvas',
    });
  }, []);

  const handleAutoArrange = useCallback(
    (layout: 'grid' | 'horizontal' | 'vertical') => {
      const selected = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
      if (selected.length === 0) return;
      autoArrangeNodes(selected, layout, updateMultipleNodes);
    },
    [currentBoardNodes, selectedNodeIds, updateMultipleNodes]
  );

  const handleResetAspect = useCallback(() => {
    const selected = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    if (selected.length === 0) return;
    resetNodesAspectRatio(selected, updateMultipleNodes);
  }, [currentBoardNodes, selectedNodeIds, updateMultipleNodes]);

  const handleApplyDefaultSize = useCallback(() => {
    const selected = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    if (selected.length === 0) return;
    applyOptimalSizeToNodes(selected, updateMultipleNodes);
  }, [currentBoardNodes, selectedNodeIds, updateMultipleNodes]);

  const handleSaveAsDefaultSize = useCallback(() => {
    const selected = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    if (selected.length === 0) return;
    const firstNode = selected[0];
    setDefaultNodeSize({ width: firstNode.width, height: firstNode.height });
  }, [currentBoardNodes, selectedNodeIds]);

  const handleBringToFront = useCallback(() => {
    const idSet = new Set(selectedNodeIds);
    updateNodesAndSave(prevNodes => {
      const remaining = prevNodes.filter(n => !idSet.has(n.id));
      const moving = prevNodes.filter(n => idSet.has(n.id));
      return [...remaining, ...moving];
    });
  }, [selectedNodeIds, updateNodesAndSave]);

  const handleSendToBack = useCallback(() => {
    const idSet = new Set(selectedNodeIds);
    updateNodesAndSave(prevNodes => {
      const moving = prevNodes.filter(n => idSet.has(n.id));
      const remaining = prevNodes.filter(n => !idSet.has(n.id));
      return [...moving, ...remaining];
    });
  }, [selectedNodeIds, updateNodesAndSave]);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    const toDuplicate = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    const newNodes: CanvasNode[] = toDuplicate.map(node => {
      const newId = `${node.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      return {
        ...node,
        id: newId,
        x: node.x + 30,
        y: node.y + 30,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    updateNodesAndSave(prev => [...prev, ...newNodes]);
    setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
  }, [selectedNodeIds, currentBoardNodes, updateNodesAndSave]);

  const handleSelectAll = useCallback(() => {
    setSelectedNodeIds(new Set(currentBoardNodes.map(n => n.id)));
  }, [currentBoardNodes]);

  // Download & Export Handlers
  const handleDownloadSingleNode = useCallback(
    async (node: CanvasNode) => {
      showToast(`正在準備下載 ${node.type === 'image' ? '圖片' : '文字'}...`);
      try {
        const ok = await downloadSingleNode(node);
        if (ok) {
          showToast('檔案已開始下載');
        } else {
          showToast('無法下載：找不到檔案資源');
        }
      } catch (err) {
        console.error('Download single node error:', err);
        showToast('下載失敗，請稍後再試');
      }
    },
    [showToast]
  );

  const handleDownloadSelectedNodes = useCallback(async () => {
    const selected = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    if (selected.length === 0) return;
    showToast(`正在準備批次下載 ${selected.length} 個物件...`);
    try {
      const { successCount, failCount } = await batchDownloadNodes(selected);
      if (failCount === 0) {
        showToast(`已完成下載 ${successCount} 個檔案`);
      } else {
        showToast(`下載完成：成功 ${successCount} 個，失敗 ${failCount} 個`);
      }
    } catch (err) {
      console.error('Batch download error:', err);
      showToast('批次下載發生錯誤');
    }
  }, [currentBoardNodes, selectedNodeIds, showToast]);

  const handleExportBoardImage = useCallback(async () => {
    if (currentBoardNodes.length === 0) {
      showToast('目前畫布沒有物件，無法匯出');
      return;
    }
    showToast('正在產生畫布完整圖片 (PNG)...');
    try {
      const currentBoard = boards.find(b => b.id === currentBoardId);
      const boardName = currentBoard?.name || 'Canvas';
      const ok = await exportBoardToPng(currentBoardNodes, boardName, {
        projectName: currentProject?.name,
      });
      if (ok) {
        showToast('畫布完整圖片已成功匯出並下載！');
      } else {
        showToast('畫布圖片匯出失敗');
      }
    } catch (err) {
      console.error('Export board image error:', err);
      showToast('匯出畫布圖片時發生錯誤');
    }
  }, [currentBoardNodes, boards, currentBoardId, currentProject?.name, showToast]);

  const handleDownloadAllBoardImages = useCallback(async () => {
    const images = currentBoardNodes.filter(n => n.type === 'image');
    if (images.length === 0) {
      showToast('目前畫布沒有圖片可供下載');
      return;
    }
    showToast(`開始下載畫布中的 ${images.length} 張圖片...`);
    try {
      const { successCount, failCount } = await batchDownloadNodes(images);
      if (failCount === 0) {
        showToast(`已成功下載 ${images.length} 張圖片`);
      } else {
        showToast(`下載完成：成功 ${successCount} 張，失敗 ${failCount} 張`);
      }
    } catch (err) {
      console.error('Download all images error:', err);
      showToast('批次下載圖片時發生錯誤');
    }
  }, [currentBoardNodes, showToast]);

  // Scan for lost/unreferenced assets from Local IndexedDB and Google Drive
  const handleScanLostAssets = useCallback(
    async (silent: boolean = false) => {
      const activeToken = (await getValidAccessToken()) || getAccessToken();
      const proj = currentProjectRef.current;
      setIsScanningRescue(true);

      try {
        const discovered = await scanForLostAssets(
          allNodesRef.current,
          activeToken,
          proj?.folderId,
          proj?.spreadsheetId,
          proj?.assetsFolderId
        );
        setRescuableAssets(discovered);

        if (!silent) {
          setIsRescueModalOpen(true);
          if (discovered.length === 0) {
            showToast('未發現任何遺失或未使用的圖片資源');
          }
        }
      } catch (err: any) {
        console.warn('Scan lost assets failed:', err);
        if (!silent) {
          showToast('掃描遺失資源時發生錯誤');
        }
      } finally {
        setIsScanningRescue(false);
      }
    },
    [showToast]
  );

  // Restore selected rescued assets onto canvas
  const handleRestoreRescuedAssets = useCallback(
    async (selectedAssets: RescuableAsset[]) => {
      if (selectedAssets.length === 0) return;
      const activeToken = (await getValidAccessToken()) || getAccessToken();
      const proj = currentProjectRef.current;
      const boardId = currentBoardIdRef.current;

      const canvasCenter = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);

      const { restoredNodes } = await restoreAssetsToCanvas(
        selectedAssets,
        currentBoardNodes,
        boardId,
        canvasCenter,
        activeToken,
        proj?.folderId,
        proj?.assetsFolderId
      );

      if (restoredNodes.length > 0) {
        updateNodesAndSave(prev => [...prev, ...restoredNodes]);
        setSelectedNodeIds(new Set(restoredNodes.map(n => n.id)));
        const restoredSourceIds = new Set(selectedAssets.map(a => a.id));
        setRescuableAssets(prev => prev.filter(a => !restoredSourceIds.has(a.id)));
        setIsRescueModalOpen(false);
        showToast(`已成功救回 ${restoredNodes.length} 個圖片節點至畫布！`);
      }
    },
    [currentBoardNodes, getCanvasCoords, updateNodesAndSave, showToast]
  );

  // Delete local cached assets from IndexedDB
  const handleDeleteLocalAssets = useCallback(
    async (assetIds: string[]) => {
      if (assetIds.length === 0) return;
      try {
        await deleteMultipleImages(assetIds);
        const deletedSet = new Set(assetIds);
        setRescuableAssets(prev => prev.filter(a => !deletedSet.has(a.id)));
        showToast(`已成功清理 ${assetIds.length} 個本機暫存快取！`);
      } catch (err) {
        console.error('Failed to delete local assets:', err);
        showToast('清理本機快取時發生錯誤');
      }
    },
    [showToast]
  );

  // Proactive lost asset check (scan only, non-destructive)
  useEffect(() => {
    if (isLoadingProjectData || !currentProject?.id) return;
    const timer = setTimeout(async () => {
      handleScanLostAssets(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [currentProject?.id, isLoadingProjectData, handleScanLostAssets]);

  return (
    <div className="w-screen h-screen relative select-none overflow-hidden bg-gray-950 font-sans text-gray-100">
      {/* Top Navigation Bar */}
      <TopNavigation
        projects={projects}
        currentProject={currentProject}
        onSelectProject={handleSelectProject}
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onOpenModelModal={() => setIsModelModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        selectedModelId={selectedModelId}
        user={user}
        syncStatus={syncStatus}
        lastSavedAt={lastSavedAt}
        isProjectLoading={isProjectBusy}
        isSyncingAssets={isSyncingAssets}
        onSyncAssetsToDrive={handleSyncAssetsToDrive}
        unuploadedAssetCount={unuploadedAssetCount}
        onOpenRescueModal={() => handleScanLostAssets(false)}
        rescuableAssetCount={rescuableAssets.length}
        onAddTextNode={() => {
          if (isProjectBusy) return;
          const coords = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);
          addNode({
            id: Date.now().toString(),
            type: 'text',
            x: coords.x,
            y: coords.y,
            width: 220,
            height: 70,
            rotation: 0,
            boardId: currentBoardId,
            content: '輸入文字提示詞...',
            createdAt: Date.now(),
          });
        }}
        onUploadImage={file => handleUploadImageFile(file)}
        onResetZoom={fitToView}
        onZoomIn={() => {
          if (isProjectBusy) return;
          const newView = { ...view, zoom: Math.min(5, view.zoom * 1.2) };
          setView(newView);
          setViewports(prev => ({ ...prev, [currentBoardId]: newView }));
        }}
        onZoomOut={() => {
          if (isProjectBusy) return;
          const newView = { ...view, zoom: Math.max(0.1, view.zoom / 1.2) };
          setView(newView);
          setViewports(prev => ({ ...prev, [currentBoardId]: newView }));
        }}
        onClearCanvas={() => {
          if (isProjectBusy) return;
          if (currentBoardNodes.length === 0) {
            showToast('目前畫布已無任何節點');
            return;
          }
          if (window.confirm(`確定要清空目前畫布上的所有 ${currentBoardNodes.length} 個節點嗎？`)) {
            handleDeleteNodes(currentBoardNodes.map(n => n.id));
          }
        }}
        onExportBoardImage={handleExportBoardImage}
        onDownloadAllImages={handleDownloadAllBoardImages}
      />

      {/* Infinite Canvas with Drag-and-Drop Image File Support */}
      <div
        className={`w-full h-full relative overflow-hidden select-none ${
          isPanning
            ? 'cursor-grabbing canvas-is-panning'
            : isSpacePressed
            ? 'cursor-grab canvas-space-pan'
            : ''
        }`}
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleCanvasDoubleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleCanvasContextMenu}
      >
        {/* Canvas Background Grid */}
        <div className="absolute inset-0 bg-gray-950 bg-[linear-gradient(to_right,#37415125_1px,transparent_1px),linear-gradient(to_bottom,#37415125_1px,transparent_1px)] bg-[size:20px_20px]" />

        {/* Project Switching / Loading Overlay */}
        {isLoadingProjectData && currentProject && (
          <div className="absolute inset-0 z-40 bg-gray-950/75 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fadeIn select-none pointer-events-auto">
            <div className="max-w-md w-full bg-gray-900/95 border border-gray-700/80 rounded-3xl p-7 shadow-2xl flex flex-col items-center text-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600/30 to-indigo-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-inner">
                  <Folder className="w-8 h-8 text-blue-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 p-1.5 bg-gray-900 rounded-full border border-gray-700 shadow-md">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-widest font-mono">
                  切換專案畫布
                </div>
                <h3 className="text-lg font-bold text-white mt-1 truncate max-w-[320px]">
                  {currentProject.name}
                </h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  正在從 Google Drive 與 Google Sheet 同步畫布節點、分頁與最新排版...
                </p>
              </div>

              <div className="w-full bg-gray-800/80 rounded-full h-1.5 overflow-hidden my-1">
                <div className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 h-full w-full animate-indeterminate rounded-full" />
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>載入完成後即可安全編輯，請稍候</span>
              </div>
            </div>
          </div>
        )}

        {/* Initial Connecting to Google Drive Overlay */}
        {isLoadingProjects && !currentProject && (
          <div className="absolute inset-0 z-40 bg-gray-950/75 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fadeIn select-none pointer-events-auto">
            <div className="max-w-md w-full bg-gray-900/95 border border-gray-700/80 rounded-3xl p-7 shadow-2xl flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-inner">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              </div>

              <div>
                <div className="text-[11px] font-semibold text-indigo-400 uppercase tracking-widest font-mono">
                  Google Drive 連線
                </div>
                <h3 className="text-lg font-bold text-white mt-1">
                  正在讀取專案列表
                </h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  正在掃描 Google Drive 中的專案資料夾與 Google Sheet 試算表...
                </p>
              </div>

              <div className="w-full bg-gray-800/80 rounded-full h-1.5 overflow-hidden my-1">
                <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full w-full animate-indeterminate rounded-full" />
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                <span>初始化畫布環境中，請稍候...</span>
              </div>
            </div>
          </div>
        )}

        {/* Project Load Error Overlay */}
        {projectDataError && !isLoadingProjectData && (
          <div className="absolute inset-0 z-40 bg-gray-950/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-fadeIn select-none pointer-events-auto">
            <div className="max-w-md w-full bg-gray-900/95 border border-red-500/50 rounded-3xl p-7 shadow-2xl flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-400">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">專案畫布載入失敗</h3>
                <p className="text-xs text-red-300/90 mt-2 leading-relaxed max-h-24 overflow-y-auto">
                  {projectDataError}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                {projectDataError.includes('401') || projectDataError.includes('UNAUTHENTICATED') || user?.isExpired ? (
                  <button
                    onClick={handleReconnectFromCanvas}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-lg shadow-amber-600/30 flex items-center gap-2 transition-colors"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>重新連線 Google 帳號</span>
                  </button>
                ) : (
                  <button
                    onClick={handleRetryLoadProject}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-colors"
                  >
                    <RotateCw className="w-4 h-4" />
                    <span>重新載入專案</span>
                  </button>
                )}

                {projects.length > 1 && (
                  <button
                    onClick={() => setIsProjectModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium border border-gray-700 transition-colors"
                  >
                    切換其他專案
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Drag Over Overlay Indicator */}
        {isDraggingFileOver && (
          <div className="absolute inset-4 z-40 bg-blue-600/15 backdrop-blur-[2px] border-3 border-dashed border-blue-400 rounded-3xl flex flex-col items-center justify-center gap-3 pointer-events-none animate-pulse shadow-2xl">
            <div className="p-4 bg-gray-900/90 border border-blue-500/50 text-white rounded-2xl shadow-2xl flex items-center gap-3.5">
              <div className="p-3 bg-blue-600/30 rounded-xl text-blue-400 border border-blue-500/40">
                <UploadCloud className="w-8 h-8" />
              </div>
              <div>
                <div className="font-bold text-sm text-white">放開以將圖片新增至目前畫布</div>
                <div className="text-xs text-blue-300 font-mono mt-0.5">
                  支援 PNG, JPG, WEBP, GIF 等格式拖放放置
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nodes Layer */}
        <div
          className={`absolute top-0 left-0 ${isSpacePressed ? 'pointer-events-none' : ''}`}
          style={{
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {currentBoardNodes.map(node => (
            <NodeRenderer
              key={node.id}
              node={node}
              zoom={view.zoom}
              isSelected={selectedNodeIds.has(node.id)}
              isCut={cutNodeIds.has(node.id)}
              isMultiSelecting={selectedNodeIds.size > 1}
              isSpacePressed={isSpacePressed}
              onNodeUpdate={updateNode}
              onSelect={handleSelectNode}
              onDragStart={handleNodeDragStart}
              onDuplicateNode={handleDuplicateNode}
              onDeleteNode={handleDeleteNode}
              onDownloadNode={handleDownloadSingleNode}
              onRetryNode={handleRetryNode}
              isDeleting={deletingNodeIds.has(node.id)}
              onContextMenu={handleNodeContextMenu}
            />
          ))}
        </div>

        {/* Marquee Selection Rectangle Overlay */}
        {marqueeBox && (
          <div
            className="absolute pointer-events-none z-30 bg-blue-500/15 border border-blue-400/80 rounded-md shadow-sm"
            style={{
              left: `${Math.min(marqueeBox.startX, marqueeBox.curX)}px`,
              top: `${Math.min(marqueeBox.startY, marqueeBox.curY)}px`,
              width: `${Math.abs(marqueeBox.curX - marqueeBox.startX)}px`,
              height: `${Math.abs(marqueeBox.curY - marqueeBox.startY)}px`,
            }}
          />
        )}
      </div>

      {/* Multi-Board Switcher Tabs Bar (Bottom-Left) */}
      <div className={marqueeBox ? 'pointer-events-none select-none' : ''}>
        <BoardTabs
          boards={boards}
          activeBoardId={currentBoardId}
          onSelectBoard={handleSelectBoard}
          onAddBoard={handleAddBoard}
          onRenameBoard={handleRenameBoard}
          onDeleteBoard={handleDeleteBoard}
          allNodes={allNodes}
          disabled={isProjectBusy}
        />
      </div>

      {/* Floating Bottom Right Action Bar */}
      <div
        className={`absolute bottom-6 right-6 z-20 flex items-center gap-3 ${
          marqueeBox ? 'pointer-events-none select-none' : ''
        }`}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Primary Generate Floating CTA */}
        <button
          onClick={handleExecute}
          disabled={isProjectBusy || selectedNodeIds.size === 0}
          className={`px-5 py-3 text-white font-medium rounded-2xl shadow-2xl transition-all duration-200 flex items-center gap-2 text-xs select-none ${
            selectedNodeIds.size > 0
              ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-blue-600/30 border border-blue-400/30 active:scale-95 cursor-pointer'
              : 'bg-gray-900/80 border border-gray-800 text-gray-500 cursor-not-allowed opacity-60'
          }`}
          title={
            selectedNodeIds.size === 0
              ? '選取畫布上的節點後即可進行 AI 生成 (Shift+Enter)'
              : '以 Gemini 進行合成生成 (Shift+Enter)'
          }
          aria-label="Generate from selected nodes"
        >
          <Sparkles className={`w-4 h-4 ${selectedNodeIds.size > 0 ? 'text-amber-300' : 'text-gray-500'}`} />
          <span>
            {selectedNodeIds.size === 0
              ? '生成'
              : `生成 (${selectedNodeIds.size})`}
          </span>
          {activeJobCount > 0 && (
            <span className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-200 text-[10px] font-mono border border-blue-400/30 shadow-sm animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-blue-300" />
              <span>{activeJobCount} 處理中</span>
            </span>
          )}
        </button>
      </div>

      {/* Floating Deletion In-Progress Banner */}
      {deletingNodeIds.size > 0 && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 rounded-full bg-gray-950/95 border border-red-500/50 text-red-300 shadow-2xl backdrop-blur-md animate-fadeIn select-none pointer-events-none">
          <Loader2 className="w-4 h-4 animate-spin text-red-400" />
          <span className="text-xs font-semibold tracking-wide text-white">
            正在刪除 {deletingNodeIds.size} 個節點...
          </span>
        </div>
      )}

      {/* Error Alert Banner */}
      {error && (
        <div
          role="alert"
          className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-md text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-2xl z-40 border border-red-400 flex items-center gap-2 animate-fadeIn"
          onPointerDown={e => e.stopPropagation()}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-2 text-white/80 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Orphan Asset Deletion Confirmation Modal */}
      {orphanAssetModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-gray-900 border border-gray-700/80 rounded-2xl p-6 max-w-md w-full shadow-2xl text-gray-100 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">移至 Google Drive 垃圾桶</h3>
                <p className="text-xs text-gray-400">檢測到無引用的圖片資產</p>
              </div>
            </div>

            <p className="text-sm text-gray-300 leading-relaxed">
              您刪除的節點包含 <span className="font-semibold text-white">{orphanAssetModal.orphanFiles.length}</span> 個在所有畫布中已無任何其他節點引用的圖片檔案。是否要將這些檔案移至 Google Drive 垃圾桶？（檔案將移至雲端垃圾桶，可隨時在 Google Drive 中還原）
            </p>

            <div className="max-h-32 overflow-y-auto bg-gray-950/60 p-2.5 rounded-xl border border-gray-800 space-y-1 text-xs font-mono text-gray-400">
              {orphanAssetModal.orphanFiles.map((f, i) => (
                <div key={i} className="truncate flex items-center gap-1.5">
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-300">{f.fileName}</span>
                  <span className="text-gray-500 text-[10px]">({f.fileId.slice(0, 8)}...)</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800">
              {orphanAssetModal.isDeleting ? (
                <div className="flex items-center gap-2 text-xs text-amber-300 font-medium animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>
                    正在移至垃圾桶 ({((orphanAssetModal.deletingIndex ?? 0) + 1)} / {orphanAssetModal.orphanFiles.length})...
                  </span>
                </div>
              ) : (
                <div className="text-xs text-gray-500 font-mono">
                  共 {orphanAssetModal.orphanFiles.length} 個檔案
                </div>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  onClick={orphanAssetModal.onKeepInDrive}
                  disabled={orphanAssetModal.isDeleting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-blue-600/30 disabled:opacity-50 cursor-pointer"
                >
                  保留在 Drive (建議)
                </button>
                <button
                  onClick={orphanAssetModal.onConfirmDelete}
                  disabled={orphanAssetModal.isDeleting}
                  className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-medium rounded-xl transition-colors border border-gray-700 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {orphanAssetModal.isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>移動中...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                      <span>移至雲端垃圾桶</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Redesigned Multi-Selection Bar HUD */}
      <div className={marqueeBox || isSpacePressed ? 'pointer-events-none select-none' : ''}>
        <MultiSelectionBar
          selectedNodes={currentBoardNodes.filter(n => selectedNodeIds.has(n.id))}
          onAutoArrange={handleAutoArrange}
          onResetAspect={handleResetAspect}
          onApplyDefaultSize={handleApplyDefaultSize}
          onSaveAsDefaultSize={handleSaveAsDefaultSize}
          onCopyToClipboard={handleCopy}
          onDuplicate={handleDuplicateSelected}
          onDelete={() => handleDeleteNodes(Array.from(selectedNodeIds))}
          onDeselectAll={() => setSelectedNodeIds(new Set())}
          onGenerate={handleExecute}
          onDownloadSelected={handleDownloadSelectedNodes}
          onRetrySelectedErrors={handleRetrySelectedErrorNodes}
        />
      </div>

      {/* Context Menu (Right Click) */}
      <ContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        targetType={contextMenu.targetType}
        selectedNodes={currentBoardNodes.filter(n => selectedNodeIds.has(n.id))}
        onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
        onAutoArrange={handleAutoArrange}
        onResetAspect={handleResetAspect}
        onApplyDefaultSize={handleApplyDefaultSize}
        onSaveAsDefaultSize={handleSaveAsDefaultSize}
        onCut={handleCut}
        onCopyToClipboard={handleCopy}
        onDuplicate={handleDuplicateSelected}
        onDelete={() => handleDeleteNodes(Array.from(selectedNodeIds))}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onGenerate={handleExecute}
        onPaste={handlePasteFromContextMenu}
        onAddText={() => {
          const coords = getCanvasCoords(contextMenu.position.x, contextMenu.position.y);
          addNode({
            id: Date.now().toString(),
            type: 'text',
            x: coords.x,
            y: coords.y,
            width: 220,
            height: 70,
            rotation: 0,
            boardId: currentBoardId,
            content: '點此輸入提示詞或文字...',
            createdAt: Date.now(),
          });
        }}
        onUploadImage={() => canvasFileInputRef.current?.click()}
        onSelectAll={handleSelectAll}
        onFitToScreen={fitToView}
        onClearCanvas={() => {
          if (isProjectBusy) return;
          if (currentBoardNodes.length === 0) {
            showToast('目前畫布已無任何節點');
            return;
          }
          if (window.confirm(`確定要清空目前畫布上的所有 ${currentBoardNodes.length} 個節點嗎？`)) {
            handleDeleteNodes(currentBoardNodes.map(n => n.id));
          }
        }}
        onDownloadNode={handleDownloadSelectedNodes}
        onExportBoardImage={handleExportBoardImage}
        onDownloadAllBoardImages={handleDownloadAllBoardImages}
        onRescueAssets={() => handleScanLostAssets(false)}
        onRetryNode={handleRetrySelectedErrorNodes}
      />

      {/* Floating Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-gray-900/95 backdrop-blur-xl border border-blue-500/40 text-blue-300 text-xs font-medium rounded-full shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 pointer-events-none select-none"
        >
          <ClipboardCheck className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hidden File Input for Canvas Context Menu */}
      <input
        ref={canvasFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) {
            const coords = getCanvasCoords(
              contextMenu.position.x || window.innerWidth / 2,
              contextMenu.position.y || window.innerHeight / 2
            );
            handleUploadImageFile(file, coords);
          }
          e.target.value = '';
        }}
      />

      {/* Modals */}
      <ModelSelectorModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        selectedModelId={selectedModelId}
        onSelectModel={id => {
          setSelectedModelId(id);
          setSelectedModels(prev => ({ ...prev, [currentBoardId]: id }));
          triggerAutoSave(allNodes, boards, viewports, { ...selectedModels, [currentBoardId]: id });
        }}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        projects={projects}
        currentProjectId={currentProject?.id}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        isLoading={isLoadingProjects}
      />

      <AuthSettingsModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        user={user}
        onAuthChange={() => {
          setUser(getCurrentUser());
          if (getCurrentUser()) {
            loadProjects();
          }
        }}
      />

      {/* Proactive Lost Assets Detected Pill/Banner */}
      {rescuableAssets.length > 0 && !isProjectBusy && !isRescueModalOpen && !isRescueBannerDismissed && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 bg-gray-900/95 backdrop-blur-xl border border-amber-500/50 hover:border-amber-400 text-amber-200 text-xs font-medium rounded-2xl shadow-2xl transition-all">
          <div className="p-1 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">
              {currentBoardNodes.length === 0
                ? `畫布為空，但發現 ${rescuableAssets.length} 個可救回的圖片資源`
                : `發現 ${rescuableAssets.length} 個未放置的專案圖片`}
            </span>
          </div>
          <button
            onClick={() => setIsRescueModalOpen(true)}
            className="ml-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer whitespace-nowrap"
          >
            立即救回
          </button>
          <button
            onClick={() => setIsRescueBannerDismissed(true)}
            className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors ml-1"
            title="關閉提示"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Asset Rescue Modal */}
      <AssetRescueModal
        isOpen={isRescueModalOpen}
        onClose={() => setIsRescueModalOpen(false)}
        assets={rescuableAssets}
        onRestore={handleRestoreRescuedAssets}
        isLoading={isScanningRescue}
        onRescan={() => handleScanLostAssets(false)}
        onDeleteLocalAssets={handleDeleteLocalAssets}
      />
    </div>
  );
};

export default App;
