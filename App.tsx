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
  tryFetchLocalGcloudToken,
  isLocalEnvironment,
  handleOAuthCallback,
} from './services/googleAuthService';
import {
  listProjects,
  createProject,
  uploadAssetToDrive,
  ensureAssetsFolder,
} from './services/googleDriveService';
import {
  saveGraphToSheet,
  loadGraphFromSheet,
} from './services/googleSheetsService';
import { DEFAULT_MODEL_ID, getModelById } from './services/modelsConfig';

import NodeRenderer from './components/NodeRenderer';
import TopNavigation from './components/TopNavigation';
import BoardTabs from './components/BoardTabs';
import ModelSelectorModal from './components/ModelSelectorModal';
import ProjectModal from './components/ProjectModal';
import AuthSettingsModal from './components/AuthSettingsModal';
import { Sparkles, Loader2, UploadCloud } from 'lucide-react';

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

  // Sync & Generation state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedNodesClipboard, setCopiedNodesClipboard] = useState<CanvasNode[]>([]);

  // Modals state
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragInfoRef = useRef<{
    type: 'pan' | 'drag_node';
    startX: number;
    startY: number;
    nodes?: Map<string, { x: number; y: number }>;
  } | null>(null);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);

  // Filter nodes for the current active board
  const currentBoardId = activeBoardId || boards[0]?.id || DEFAULT_BOARD_ID;
  const currentBoardNodes = allNodes.filter(n => (n.boardId || boards[0]?.id || DEFAULT_BOARD_ID) === currentBoardId);

  // 1. Listen for Google Auth changes, handle OAuth redirect callback, and auto-detect gcloud login
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

    if (!isLocalEnvironment()) {
      return () => unsubscribe();
    }

    const checkGcloud = async () => {
      if (!getCurrentUser()) {
        await tryFetchLocalGcloudToken().catch(() => {});
      }
    };

    checkGcloud();

    // Check on window focus (local dev only)
    window.addEventListener('focus', checkGcloud);

    // Poll every 3 seconds if not authenticated yet (until user logs in)
    const pollTimer = setInterval(() => {
      if (!getCurrentUser()) {
        checkGcloud();
      }
    }, 3000);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', checkGcloud);
      clearInterval(pollTimer);
    };
  }, []);

  // 2. Load projects when user logs in or changes
  const loadProjects = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setSyncStatus('offline');
      return;
    }

    setIsLoadingProjects(true);
    try {
      const list = await listProjects(token);
      setProjects(list);

      // If no project exists yet, create default project
      if (list.length === 0) {
        const newProj = await createProject(token, '預設畫布專案');
        setProjects([newProj]);
        setCurrentProject(newProj);
      } else if (!currentProject) {
        setCurrentProject(list[0]);
      }
    } catch (err: any) {
      console.error('Failed to load projects from Google Drive:', err);
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
  }, [currentProject]);

  useEffect(() => {
    if (user) {
      loadProjects();
    } else {
      setProjects([]);
      setCurrentProject(null);
      setSyncStatus('offline');
    }
  }, [user]);

  // 3. Load multi-board graph data from Google Sheet when current project changes
  useEffect(() => {
    if (!currentProject || !currentProject.spreadsheetId) return;

    const token = getAccessToken();
    if (!token) return;

    let isMounted = true;
    isInitialLoadRef.current = true;
    setSyncStatus('saving');

    loadGraphFromSheet(token, currentProject.spreadsheetId)
      .then(loadedData => {
        if (!isMounted) return;

        const loadedBoards = loadedData.boards.length > 0
          ? loadedData.boards
          : [{ id: DEFAULT_BOARD_ID, name: 'MAIN', createdAt: new Date().toISOString() }];

        const initialBoardId = loadedBoards[0].id;

        setBoards(loadedBoards);
        setActiveBoardId(initialBoardId);
        setAllNodes(loadedData.nodes);
        setViewports(loadedData.viewports);
        setSelectedModels(loadedData.selectedModels);
        setSelectedNodeIds(new Set());

        const initialView = loadedData.viewports[initialBoardId] || { x: 0, y: 0, zoom: 1 };
        setView(initialView);

        const initialModel = loadedData.selectedModels[initialBoardId] || DEFAULT_MODEL_ID;
        setSelectedModelId(initialModel);

        setSyncStatus('saved');
        setLastSavedAt(new Date());

        setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 500);
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
      if (isInitialLoadRef.current) return;
      const token = getAccessToken();
      if (!token || !currentProject?.spreadsheetId) {
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
    [currentProject?.spreadsheetId]
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

  // Multi-Board Operations: Switch, Add, Rename, Delete
  const handleSelectBoard = (newBoardId: string) => {
    if (newBoardId === currentBoardId) return;

    // Persist current board's view and model
    const updatedViewports = { ...viewports, [currentBoardId]: view };
    const updatedModels = { ...selectedModels, [currentBoardId]: selectedModelId };
    setViewports(updatedViewports);
    setSelectedModels(updatedModels);

    setActiveBoardId(newBoardId);
    setSelectedNodeIds(new Set());

    const targetView = updatedViewports[newBoardId] || { x: 0, y: 0, zoom: 1 };
    setView(targetView);

    const targetModel = updatedModels[newBoardId] || DEFAULT_MODEL_ID;
    setSelectedModelId(targetModel);

    triggerAutoSave(allNodes, boards, updatedViewports, updatedModels);
  };

  const handleAddBoard = (name?: string) => {
    const newId = `board_${Date.now()}`;
    const newName = name?.trim() || `Board ${boards.length + 1}`;
    const newBoard: BoardMetadata = {
      id: newId,
      name: newName,
      createdAt: new Date().toISOString(),
    };

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

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      updateNodesAndSave(prev => prev.filter(n => n.id !== nodeId));
      setSelectedNodeIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    },
    [updateNodesAndSave]
  );

  // Canvas View & Interactions
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.node-renderer')) return;

    if (selectedNodeIds.size > 0) {
      setSelectedNodeIds(new Set());
    }

    dragInfoRef.current = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
    };
    canvasRef.current?.classList.add('cursor-grabbing');
  };

  const handleNodeDragStart = (e: React.PointerEvent, nodeId: string) => {
    const draggedNodes = selectedNodeIds.has(nodeId)
      ? currentBoardNodes.filter(n => selectedNodeIds.has(n.id))
      : ([currentBoardNodes.find(n => n.id === nodeId)].filter(Boolean) as CanvasNode[]);

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
    } else if (dragInfoRef.current.type === 'drag_node' && dragInfoRef.current.nodes) {
      dragInfoRef.current.nodes.forEach((startPos, id) => {
        updateNode(id, {
          x: startPos.x + dx / view.zoom,
          y: startPos.y + dy / view.zoom,
        });
      });
    }
  };

  const handlePointerUp = () => {
    if (dragInfoRef.current?.type === 'pan') {
      setViewports(prev => ({ ...prev, [currentBoardId]: view }));
    }
    dragInfoRef.current = null;
    canvasRef.current?.classList.remove('cursor-grabbing');
  };

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
        const width = img.width > 480 ? 480 : img.width;
        const height = img.width > 480 ? (480 / img.width) * img.height : img.height;
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

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') {
        return;
      }
      e.preventDefault();
      const initialCoords = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);

      // Check if copying existing canvas nodes from in-app clipboard
      if (copiedNodesClipboard.length > 0) {
        copiedNodesClipboard.forEach((node, idx) => {
          const shift = (idx + 1) * 30;
          const newId = (Date.now() + idx).toString();
          if (node.type === 'image') {
            const imgNode = node as ImageNode;
            addNode({
              ...imgNode,
              id: newId,
              x: imgNode.x + shift,
              y: imgNode.y + shift,
              boardId: currentBoardId,
              content: imgNode.content,
              driveFileId: imgNode.driveFileId,
              createdAt: Date.now(),
            });
          } else {
            const txtNode = node as TextNode;
            addNode({
              ...txtNode,
              id: newId,
              x: txtNode.x + shift,
              y: txtNode.y + shift,
              boardId: currentBoardId,
              createdAt: Date.now(),
            });
          }
        });
        return;
      }

      // Check pasted plain text
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

      // Check pasted image
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
    [currentBoardNodes, copiedNodesClipboard, handleUploadImageFile, addNode, currentBoardId, view]
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
          const width = img.width > 480 ? 480 : img.width;
          const height = img.width > 480 ? (480 / img.width) * img.height : img.height;
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

      // Copy with Cmd+C / Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        const selected = currentBoardNodes.filter(n => selectedNodeIds.has(n.id));
        if (selected.length > 0) {
          setCopiedNodesClipboard(selected);
        }
      }

      // Delete with Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        if (selectedNodeIds.size > 0) {
          updateNodesAndSave(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
          setSelectedNodeIds(new Set());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExecute, handleDuplicateNode, selectedNodeIds, currentBoardNodes, updateNodesAndSave]);

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
        onResetZoom={() => {
          const newView = { x: 0, y: 0, zoom: 1 };
          setView(newView);
          setViewports(prev => ({ ...prev, [currentBoardId]: newView }));
        }}
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
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleCanvasDoubleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
                onNodeUpdate={updateNode}
                onSelect={handleSelectNode}
                onDragStart={handleNodeDragStart}
                onDuplicateNode={handleDuplicateNode}
                onDeleteNode={handleDeleteNode}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Multi-Board Switcher Tabs Bar (Bottom-Left) */}
      <BoardTabs
        boards={boards}
        activeBoardId={currentBoardId}
        onSelectBoard={handleSelectBoard}
        onAddBoard={handleAddBoard}
        onRenameBoard={handleRenameBoard}
        onDeleteBoard={handleDeleteBoard}
        allNodes={allNodes}
      />

      {/* Floating Bottom Right Action Bar */}
      <div
        className="absolute bottom-6 right-6 z-20 flex items-center gap-3"
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
