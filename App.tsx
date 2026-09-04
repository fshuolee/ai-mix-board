import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { blobToBase64 } from './utils/canvasUtils';
import { generateFromNodes } from './services/geminiService';
import { storeImage } from './services/dbService';
import {
  subscribeAuth,
  getCurrentUser,
  getAccessToken,
  refreshGoogleToken,
  tryFetchLocalGcloudToken,
  isLocalEnvironment,
  handleOAuthCallback,
} from './services/googleAuthService';
import {
  listProjects,
  createProject,
  uploadAssetToDrive,
  deleteAssetFromDrive,
  ensureAssetsFolder,
} from './services/googleDriveService';
import {
  saveGraphToSheet,
  loadGraphFromSheet,
} from './services/googleSheetsService';
import { DEFAULT_MODEL_ID, getModelById, migrateOldModelId } from './services/modelsConfig';

import NodeRenderer from './components/NodeRenderer';
import TopNavigation from './components/TopNavigation';
import BoardTabs from './components/BoardTabs';
import ModelSelectorModal from './components/ModelSelectorModal';
import ProjectModal from './components/ProjectModal';
import AuthSettingsModal from './components/AuthSettingsModal';
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
import { Sparkles, Loader2, UploadCloud, Trash2, ClipboardCheck } from 'lucide-react';

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
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

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

  // Orphan Asset Deletion Confirmation Modal state
  const [orphanAssetModal, setOrphanAssetModal] = useState<{
    isOpen: boolean;
    orphanFiles: { fileId: string; fileName: string }[];
    onConfirmDelete: () => void;
    onKeepInDrive: () => void;
  } | null>(null);

  // Sync & Generation state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedNodesClipboard, setCopiedNodesClipboard] = useState<CanvasNode[]>([]);
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
  } | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);
  const loadedProjectIdRef = useRef<string | null>(null);

  // Filter nodes for the current active board
  const currentBoardId = activeBoardId || boards[0]?.id || DEFAULT_BOARD_ID;
  const currentBoardNodes = allNodes.filter(n => (n.boardId || boards[0]?.id || DEFAULT_BOARD_ID) === currentBoardId);

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

    // Proactively verify or refresh on window focus and visibility change
    const checkAndMaintainAuth = () => {
      const u = getCurrentUser();
      if (u) {
        if (u.isExpired || u.expiresAt <= Date.now() + 180000) {
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
        if (!getCurrentUser()) {
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
        setCurrentProject(prev => {
          if (!prev || !list.some(p => p.id === prev.id)) {
            return list[0];
          }
          return prev;
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
    setSyncStatus('saving');

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

        setTimeout(() => {
          if (isMounted) {
            isInitialLoadRef.current = false;
          }
        }, 300);
      })
      .catch(err => {
        if (!isMounted) return;
        console.error('Failed to load graph from Google Sheet:', err);
        setSyncStatus('error');
        isInitialLoadRef.current = false;
      });

    return () => {
      isMounted = false;
    };
  }, [currentProject?.id, currentProject?.spreadsheetId]);

  // 4. Auto-save graph to Google Sheet (Debounced)
  const triggerAutoSave = useCallback(
    (
      currentAllNodes: CanvasNode[],
      currentBoards: BoardMetadata[],
      currentViewports: Record<string, ViewportState>,
      currentModels: Record<string, string>
    ) => {
      if (isInitialLoadRef.current || !currentProject || loadedProjectIdRef.current !== currentProject.id) return;
      const token = getAccessToken();
      if (!token || !currentProject.spreadsheetId) {
        setSyncStatus('offline');
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      setSyncStatus('saving');

      saveTimerRef.current = setTimeout(async () => {
        try {
          await saveGraphToSheet(
            token,
            currentProject.spreadsheetId,
            currentAllNodes,
            currentBoards,
            currentViewports,
            currentModels
          );
          setSyncStatus('saved');
          setLastSavedAt(new Date());
        } catch (err) {
          console.error('Failed to auto-save to Google Sheet:', err);
          setSyncStatus('error');
        }
      }, 1000);
    },
    [currentProject?.id, currentProject?.spreadsheetId]
  );

  // Trigger auto-save whenever nodes change
  const updateNodesAndSave = useCallback(
    (updater: (prev: CanvasNode[]) => CanvasNode[]) => {
      setAllNodes(prevAll => {
        const nextAll = updater(prevAll);
        const updatedViewports = { ...viewports, [currentBoardId]: view };
        const updatedModels = { ...selectedModels, [currentBoardId]: selectedModelId };
        triggerAutoSave(nextAll, boards, updatedViewports, updatedModels);
        return nextAll;
      });
    },
    [triggerAutoSave, boards, viewports, selectedModels, currentBoardId, view, selectedModelId]
  );

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
    <T extends CanvasNode>(newNode: T) => {
      const nodeWithBoard: CanvasNode = {
        ...newNode,
        boardId: newNode.boardId || currentBoardId,
      };
      updateNodesAndSave(prev => [...prev, nodeWithBoard]);
      setSelectedNodeIds(new Set([newNode.id]));
    },
    [updateNodesAndSave, currentBoardId]
  );

  // Multi-Board Handlers
  const handleSelectBoard = (newBoardId: string) => {
    if (newBoardId === activeBoardId) return;

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
    const updatedBoards = boards.map(b => (b.id === boardId ? { ...b, name: newName, updatedAt: new Date().toISOString() } : b));
    setBoards(updatedBoards);
    triggerAutoSave(allNodes, updatedBoards, viewports, selectedModels);
  };

  const handleDeleteBoard = (boardId: string) => {
    if (boards.length <= 1) return;

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
  };

  // Duplicate node: creates a new node pointing to the EXACT same asset without cloning file
  const handleDuplicateNode = useCallback(
    (nodeToDuplicate: CanvasNode) => {
      const newId = Date.now().toString();
      const shift = 30;

      if (nodeToDuplicate.type === 'image') {
        const img = nodeToDuplicate as ImageNode;
        const duplicatedImageNode: ImageNode = {
          ...img,
          id: newId,
          x: img.x + shift,
          y: img.y + shift,
          boardId: currentBoardId,
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
          boardId: currentBoardId,
          createdAt: Date.now(),
        };
        addNode(duplicatedTextNode);
      }
    },
    [addNode, currentBoardId]
  );

  const handleDeleteNodes = useCallback(
    (nodeIdsToDelete: string[]) => {
      if (nodeIdsToDelete.length === 0) return;
      const deleteSet = new Set(nodeIdsToDelete);

      // Find deleted ImageNodes
      const deletedImageNodes = allNodes.filter(
        n => deleteSet.has(n.id) && n.type === 'image' && (n as ImageNode).driveFileId
      ) as ImageNode[];

      // Check which driveFileIds will have 0 references across ALL boards in the project
      const remainingNodes = allNodes.filter(n => !deleteSet.has(n.id));
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

      const executeCanvasDelete = () => {
        updateNodesAndSave(prev => prev.filter(n => !deleteSet.has(n.id)));
        setSelectedNodeIds(prev => {
          const next = new Set(prev);
          nodeIdsToDelete.forEach(id => next.delete(id));
          return next;
        });
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
          onConfirmDelete: async () => {
            setOrphanAssetModal(null);
            if (token) {
              for (const orphan of orphanList) {
                await deleteAssetFromDrive(token, orphan.fileId);
              }
            }
            executeCanvasDelete();
          },
          onKeepInDrive: () => {
            setOrphanAssetModal(null);
            executeCanvasDelete();
          },
        });
      } else {
        executeCanvasDelete();
      }
    },
    [allNodes, updateNodesAndSave]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      handleDeleteNodes([nodeId]);
    },
    [handleDeleteNodes]
  );

  // Canvas View & Interactions (Marquee Box Selection & Multi-Node Dragging)
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.node-renderer')) return;

    // Pan mode with spacebar, middle mouse (button 1), or right click (button 2)
    if (isSpacePressed || e.button === 1 || e.button === 2) {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {}
      dragInfoRef.current = {
        type: 'pan',
        startX: e.clientX,
        startY: e.clientY,
      };
      canvasRef.current?.classList.add('cursor-grabbing');
      return;
    }

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
        initialSelection: new Set(selectedNodeIds),
      };
      setMarqueeBox({
        startX: e.clientX,
        startY: e.clientY,
        curX: e.clientX,
        curY: e.clientY,
      });
    }
  };

  const handleNodeDragStart = (e: React.PointerEvent, nodeId: string) => {
    let targetSelection: Set<string>;
    if (e.shiftKey) {
      targetSelection = new Set(selectedNodeIds);
      if (targetSelection.has(nodeId)) {
        targetSelection.delete(nodeId);
      } else {
        targetSelection.add(nodeId);
      }
      setSelectedNodeIds(targetSelection);
    } else if (!selectedNodeIds.has(nodeId)) {
      targetSelection = new Set([nodeId]);
      setSelectedNodeIds(targetSelection);
    } else {
      targetSelection = selectedNodeIds;
    }

    const draggedNodes = currentBoardNodes.filter(n => targetSelection.has(n.id));
    const nodesMap = new Map(draggedNodes.map(n => [n.id, { x: n.x, y: n.y }]));

    dragInfoRef.current = {
      type: 'drag_node',
      startX: e.clientX,
      startY: e.clientY,
      nodes: nodesMap,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfoRef.current) return;

    const dx = e.clientX - dragInfoRef.current.startX;
    const dy = e.clientY - dragInfoRef.current.startY;

    if (dragInfoRef.current.type === 'pan') {
      const newView = { ...view, x: view.x + dx, y: view.y + dy };
      setView(newView);
      dragInfoRef.current.startX = e.clientX;
      dragInfoRef.current.startY = e.clientY;
    } else if (dragInfoRef.current.type === 'marquee') {
      dragInfoRef.current.curX = e.clientX;
      dragInfoRef.current.curY = e.clientY;
      setMarqueeBox({
        startX: dragInfoRef.current.startX,
        startY: dragInfoRef.current.startY,
        curX: e.clientX,
        curY: e.clientY,
      });

      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const sx1 = Math.min(dragInfoRef.current.startX, e.clientX) - rect.left;
      const sy1 = Math.min(dragInfoRef.current.startY, e.clientY) - rect.top;
      const sx2 = Math.max(dragInfoRef.current.startX, e.clientX) - rect.left;
      const sy2 = Math.max(dragInfoRef.current.startY, e.clientY) - rect.top;

      const worldMinX = (sx1 - view.x) / view.zoom;
      const worldMinY = (sy1 - view.y) / view.zoom;
      const worldMaxX = (sx2 - view.x) / view.zoom;
      const worldMaxY = (sy2 - view.y) / view.zoom;

      const nextSelection = new Set<string>(dragInfoRef.current.isShift ? dragInfoRef.current.initialSelection : []);
      currentBoardNodes.forEach(node => {
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
      setSelectedNodeIds(nextSelection);
    } else if (dragInfoRef.current.type === 'drag_node' && dragInfoRef.current.nodes) {
      dragInfoRef.current.nodes.forEach((startPos, id) => {
        updateNode(id, {
          x: Math.round(startPos.x + dx / view.zoom),
          y: Math.round(startPos.y + dy / view.zoom),
        });
      });
    }
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e && canvasRef.current && typeof e.pointerId === 'number') {
      try {
        if (canvasRef.current.hasPointerCapture?.(e.pointerId)) {
          canvasRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {}
    }
    if (dragInfoRef.current?.type === 'pan') {
      setViewports(prev => ({ ...prev, [currentBoardId]: view }));
    }
    dragInfoRef.current = null;
    setMarqueeBox(null);
    canvasRef.current?.classList.remove('cursor-grabbing');
  };

  // Global pointerup fallback ensuring drag gestures are always cleaned up properly
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (dragInfoRef.current) {
        if (dragInfoRef.current.type === 'pan') {
          setViewports(prev => ({ ...prev, [currentBoardId]: view }));
        }
        dragInfoRef.current = null;
        setMarqueeBox(null);
        canvasRef.current?.classList.remove('cursor-grabbing');
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [currentBoardId, view]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const newZoom = e.deltaY > 0 ? view.zoom / zoomFactor : view.zoom * zoomFactor;
    const clampedZoom = Math.max(0.1, Math.min(5, newZoom));

    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - view.x) / view.zoom;
    const worldY = (mouseY - view.y) / view.zoom;

    const newX = mouseX - worldX * clampedZoom;
    const newY = mouseY - worldY * clampedZoom;

    const newView = { x: newX, y: newY, zoom: clampedZoom };
    setView(newView);
    setViewports(prev => ({ ...prev, [currentBoardId]: newView }));
  };

  const handleSelectNode = (id: string, shiftKey: boolean) => {
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
  };

  const getCanvasCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - view.x) / view.zoom;
    const y = (clientY - rect.top - view.y) / view.zoom;
    return { x, y };
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
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
        if (token && currentProject?.folderId) {
          try {
            const assetsFolderId =
              currentProject.assetsFolderId ||
              (await ensureAssetsFolder(token, currentProject.folderId));
            const uploaded = await uploadAssetToDrive(
              token,
              assetsFolderId,
              file,
              file.name || `image_${id}.png`
            );
            driveFileId = uploaded.fileId;
            driveViewLink = uploaded.webViewLink;
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
    [currentBoardNodes, currentProject, addNode, currentBoardId, view]
  );

  // Drag-and-Drop Image Files onto Canvas
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

    setCopiedNodesClipboard(selectedNodes);
    await copyNodesToClipboard(selectedNodes);
    showToast(`已剪下 ${selectedNodes.length} 個物件`);
    handleDeleteNodes(Array.from(selectedNodeIds));
  }, [selectedNodeIds, currentBoardNodes, handleDeleteNodes, showToast]);

  const handleCopy = useCallback(async () => {
    if (selectedNodeIds.size === 0) return;
    const selectedNodes = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
    if (selectedNodes.length === 0) return;

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

    updateNodesAndSave(prev => [...prev, ...newPastedNodes]);
    setSelectedNodeIds(newSelectedIds);
    return true;
  }, [copiedNodesClipboard, currentBoardId, getCanvasCoords, updateNodesAndSave]);

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

  // Execute Generation
  const handleExecute = useCallback(async () => {
    if (isGenerating || selectedNodeIds.size === 0) return;
    setIsGenerating(true);
    setError(null);

    const token = getAccessToken();
    const selectedNodes = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));

    try {
      const result = await generateFromNodes(selectedNodes, selectedModelId);
      const initialCoords = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);

      if (result.type === 'image') {
        const newImageBlob = result.blob;
        const id = Date.now().toString();

        await storeImage(id, newImageBlob);

        let driveFileId = id;
        let driveViewLink: string | undefined;

        // Upload generated image asset to Google Drive project assets folder
        if (token && currentProject?.folderId) {
          try {
            const assetsFolderId =
              currentProject.assetsFolderId ||
              (await ensureAssetsFolder(token, currentProject.folderId));
            const uploaded = await uploadAssetToDrive(
              token,
              assetsFolderId,
              newImageBlob,
              `gemini_gen_${id}.png`
            );
            driveFileId = uploaded.fileId;
            driveViewLink = uploaded.webViewLink;
          } catch (uploadErr) {
            console.warn('Drive upload failed for generated image:', uploadErr);
          }
        }

        const base64 = await blobToBase64(newImageBlob);
        const img = new Image();
        img.onload = () => {
          const defaultSize = getDefaultNodeSize();
          const fitted = fitDimensions(img.width, img.height, defaultSize.width, defaultSize.height, false);
          const width = fitted.width;
          const height = fitted.height;
          const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, currentBoardNodes);

          addNode({
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
            originalFileName: `generated_${id}.png`,
            driveViewLink,
            createdAt: Date.now(),
          });
        };
        img.src = base64;
      } else {
        // Text output from reasoning model
        const width = 280;
        const height = 140;
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
          content: result.text,
          createdAt: Date.now(),
        });
      }
    } catch (err: any) {
      console.error('Generation Error:', err);
      setError(err.message || '生成失敗，請檢查 API Key 或選取節點。');
    } finally {
      setIsGenerating(false);
    }
  }, [
    isGenerating,
    selectedNodeIds,
    currentBoardNodes,
    selectedModelId,
    currentProject,
    addNode,
    currentBoardId,
    view,
  ]);

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
      // Space key for panning cursor
      if (e.code === 'Space' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        setIsSpacePressed(true);
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

      // Select All (Cmd+A / Ctrl+A)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        e.preventDefault();
        setSelectedNodeIds(new Set(currentBoardNodes.map(n => n.id)));
      }

      // Escape to Deselect All & Close Context Menu
      if (e.key === 'Escape') {
        setSelectedNodeIds(new Set());
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
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleExecute, handleDuplicateNode, handleCut, handleCopy, handleDeleteNodes, fitToView, selectedNodeIds, currentBoardNodes, updateMultipleNodes]);

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
  };

  const canvasFileInputRef = useRef<HTMLInputElement>(null);

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (!selectedNodeIds.has(nodeId)) {
        setSelectedNodeIds(new Set([nodeId]));
      }

      setContextMenu({
        isOpen: true,
        position: { x: e.clientX, y: e.clientY },
        targetType: 'node',
      });
    },
    [selectedNodeIds]
  );

  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
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

  const currentModelInfo = getModelById(selectedModelId);

  return (
    <div className="w-screen h-screen relative select-none overflow-hidden bg-gray-950 font-sans text-gray-100">
      {/* Top Navigation Bar */}
      <TopNavigation
        projects={projects}
        currentProject={currentProject}
        onSelectProject={p => setCurrentProject(p)}
        onOpenProjectModal={() => setIsProjectModalOpen(true)}
        onOpenModelModal={() => setIsModelModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        selectedModelId={selectedModelId}
        user={user}
        syncStatus={syncStatus}
        lastSavedAt={lastSavedAt}
        onAddTextNode={() => {
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
          const newView = { ...view, zoom: Math.min(5, view.zoom * 1.2) };
          setView(newView);
          setViewports(prev => ({ ...prev, [currentBoardId]: newView }));
        }}
        onZoomOut={() => {
          const newView = { ...view, zoom: Math.max(0.1, view.zoom / 1.2) };
          setView(newView);
          setViewports(prev => ({ ...prev, [currentBoardId]: newView }));
        }}
        onClearCanvas={() => {
          if (window.confirm('確定要清空目前畫布上的所有節點嗎？')) {
            updateNodesAndSave(prev => prev.filter(n => (n.boardId || boards[0]?.id || DEFAULT_BOARD_ID) !== currentBoardId));
            setSelectedNodeIds(new Set());
          }
        }}
      />

      {/* Infinite Canvas with Drag-and-Drop Image File Support */}
      <div
        className="w-full h-full relative overflow-hidden"
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleCanvasDoubleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onContextMenu={handleCanvasContextMenu}
      >
        {/* Canvas Background Grid */}
        <div className="absolute inset-0 bg-gray-950 bg-[linear-gradient(to_right,#37415125_1px,transparent_1px),linear-gradient(to_bottom,#37415125_1px,transparent_1px)] bg-[size:20px_20px]" />

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
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {currentBoardNodes.map(node => (
            <div key={node.id} className="node-renderer">
              <NodeRenderer
                node={node}
                zoom={view.zoom}
                isSelected={selectedNodeIds.has(node.id)}
                isMultiSelecting={selectedNodeIds.size > 1}
                onNodeUpdate={updateNode}
                onSelect={handleSelectNode}
                onDragStart={handleNodeDragStart}
                onDuplicateNode={handleDuplicateNode}
                onDeleteNode={handleDeleteNode}
                onContextMenu={handleNodeContextMenu}
              />
            </div>
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
        />
      </div>

      {/* Floating Bottom Right Action Bar */}
      <div
        className={`absolute bottom-6 right-6 z-20 flex items-center gap-3 ${
          marqueeBox ? 'pointer-events-none select-none' : ''
        }`}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Model quick indicator */}
        <button
          onClick={() => setIsModelModalOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-2.5 rounded-full bg-gray-900/90 backdrop-blur-md border border-gray-700 text-xs text-gray-300 hover:text-white hover:border-gray-500 shadow-xl transition-all"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold">{currentModelInfo.name}</span>
          <span className="text-[10px] text-gray-400">({currentModelInfo.tag})</span>
        </button>

        {/* Execute Button */}
        <button
          onClick={handleExecute}
          disabled={isGenerating || selectedNodeIds.size === 0}
          className="px-6 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-full shadow-2xl shadow-blue-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2.5 border border-blue-400/30 text-sm active:scale-95"
          aria-label="Generate from selected nodes"
        >
          {isGenerating ? (
            <>
              <Loader2 className="animate-spin h-5 w-5 text-white" />
              <span>AI 生成中...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 text-amber-300" />
              <span>
                {selectedNodeIds.size === 0
                  ? '請選取節點'
                  : `生成合成 (${selectedNodeIds.size})`}
              </span>
              <span className="text-xs opacity-75 hidden sm:inline">(Shift+Enter)</span>
            </>
          )}
        </button>
      </div>

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
                <h3 className="text-base font-bold text-white">清理 Google Drive 雲端檔案</h3>
                <p className="text-xs text-gray-400">檢測到無引用的圖片資產</p>
              </div>
            </div>

            <p className="text-sm text-gray-300 leading-relaxed">
              您刪除的節點包含 <span className="font-semibold text-white">{orphanAssetModal.orphanFiles.length}</span> 個在所有畫布中已無任何其他節點引用的圖片檔案。是否要同步從 Google Drive 雲端硬碟中刪除，以釋放雲端儲存空間？
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

            <div className="flex items-center justify-end gap-2.5 mt-2">
              <button
                onClick={orphanAssetModal.onKeepInDrive}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-xl transition-colors border border-gray-700"
              >
                保留在 Drive
              </button>
              <button
                onClick={orphanAssetModal.onConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-red-600/30 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>從 Drive 刪除</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Redesigned Multi-Selection Bar HUD */}
      <div className={marqueeBox ? 'pointer-events-none select-none' : ''}>
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
          if (window.confirm('確定要清空目前畫布上的所有節點嗎？')) {
            updateNodesAndSave(prev => prev.filter(n => (n.boardId || boards[0]?.id || DEFAULT_BOARD_ID) !== currentBoardId));
            setSelectedNodeIds(new Set());
          }
        }}
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
          const updatedModels = { ...selectedModels, [currentBoardId]: id };
          setSelectedModels(updatedModels);
          triggerAutoSave(allNodes, boards, viewports, updatedModels);
        }}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        projects={projects}
        currentProjectId={currentProject?.id}
        onSelectProject={p => setCurrentProject(p)}
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
    </div>
  );
};

export default App;
