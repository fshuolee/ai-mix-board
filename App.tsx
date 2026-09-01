import React, { useState, useRef, useEffect, useCallback } from 'react';
import type {
  CanvasNode,
  ImageNode,
  TextNode,
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
import ModelSelectorModal from './components/ModelSelectorModal';
import ProjectModal from './components/ProjectModal';
import AuthSettingsModal from './components/AuthSettingsModal';
import { Sparkles, Loader2 } from 'lucide-react';

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

const App: React.FC = () => {
  // Auth state
  const [user, setUser] = useState<GoogleUserProfile | null>(getCurrentUser());

  // Projects state
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectMetadata | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  // Canvas state
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);

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

  // 3. Load graph data from Google Sheet when current project changes
  useEffect(() => {
    if (!currentProject || !currentProject.spreadsheetId) return;

    const token = getAccessToken();
    if (!token) return;

    let isMounted = true;
    isInitialLoadRef.current = true;
    setSyncStatus('saving');

    loadGraphFromSheet(token, currentProject.spreadsheetId)
      .then(({ nodes: loadedNodes, viewport: loadedViewport, selectedModel: loadedModel }) => {
        if (!isMounted) return;
        setNodes(loadedNodes);
        if (loadedViewport) {
          setView(loadedViewport);
        }
        if (loadedModel) {
          setSelectedModelId(loadedModel);
        }
        setSyncStatus('saved');
        setLastSavedAt(new Date());
        // Allow auto-save after initial load is settled
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
      currentNodes: CanvasNode[],
      currentView: ViewportState,
      currentModel: string
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
            currentNodes,
            currentView,
            currentModel
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

  // Trigger auto-save whenever nodes, view, or model changes
  const updateNodesAndSave = useCallback(
    (updater: (prev: CanvasNode[]) => CanvasNode[]) => {
      setNodes(prev => {
        const next = updater(prev);
        triggerAutoSave(next, view, selectedModelId);
        return next;
      });
    },
    [triggerAutoSave, view, selectedModelId]
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
      updateNodesAndSave(prev => [...prev, newNode]);
      setSelectedNodeIds(new Set([newNode.id]));
    },
    [updateNodesAndSave]
  );

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
          // Point to the EXACT SAME Google Drive file ID without cloning file in Drive
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
          createdAt: Date.now(),
        };
        addNode(duplicatedTextNode);
      }
    },
    [addNode]
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

  // Canvas Interactions
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
      ? nodes.filter(n => selectedNodeIds.has(n.id))
      : ([nodes.find(n => n.id === nodeId)].filter(Boolean) as CanvasNode[]);

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
    if (dragInfoRef.current?.type === 'pan' || dragInfoRef.current?.type === 'drag_node') {
      triggerAutoSave(nodes, view, selectedModelId);
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
    triggerAutoSave(nodes, newView, selectedModelId);
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
      content: '點此輸入提示詞或文字...',
      createdAt: Date.now(),
    };
    addNode(newNode);
  };

  const handleUploadImageFile = useCallback(
    async (file: File) => {
      const token = getAccessToken();
      const initialCoords = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);
      const id = Date.now().toString();

      // Store locally in IndexedDB first for instant UI response
      await storeImage(id, file);

      const base64 = await blobToBase64(file);
      const img = new Image();
      img.onload = async () => {
        const width = img.width > 480 ? 480 : img.width;
        const height = img.width > 480 ? (480 / img.width) * img.height : img.height;
        const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, nodes);

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
    [nodes, currentProject, addNode, view]
  );

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
        const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, nodes);
        addNode({
          id: Date.now().toString(),
          type: 'text',
          x,
          y,
          width,
          height,
          rotation: 0,
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
    [nodes, copiedNodesClipboard, handleUploadImageFile, addNode, view]
  );

  // Execute Generation
  const handleExecute = useCallback(async () => {
    if (isGenerating || selectedNodeIds.size === 0) return;
    setIsGenerating(true);
    setError(null);

    const token = getAccessToken();
    const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));

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
          const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, nodes);

          addNode({
            id,
            type: 'image',
            x,
            y,
            width,
            height,
            rotation: 0,
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
        const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, nodes);
        addNode({
          id: Date.now().toString(),
          type: 'text',
          x,
          y,
          width,
          height,
          rotation: 0,
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
    nodes,
    selectedModelId,
    currentProject,
    addNode,
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
        const selected = nodes.filter(n => selectedNodeIds.has(n.id));
        selected.forEach(node => handleDuplicateNode(node));
      }

      // Copy with Cmd+C / Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return;
        const selected = nodes.filter(n => selectedNodeIds.has(n.id));
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
  }, [handleExecute, handleDuplicateNode, selectedNodeIds, nodes, updateNodesAndSave]);

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
            content: '輸入文字提示詞...',
            createdAt: Date.now(),
          });
        }}
        onUploadImage={handleUploadImageFile}
        onResetZoom={() => setView({ x: 0, y: 0, zoom: 1 })}
        onZoomIn={() => setView(v => ({ ...v, zoom: Math.min(5, v.zoom * 1.2) }))}
        onZoomOut={() => setView(v => ({ ...v, zoom: Math.max(0.1, v.zoom / 1.2) }))}
        onClearCanvas={() => {
          if (window.confirm('確定要清空畫布上的所有節點嗎？')) {
            updateNodesAndSave(() => []);
            setSelectedNodeIds(new Set());
          }
        }}
      />

      {/* Infinite Canvas */}
      <div
        className="w-full h-full relative overflow-hidden"
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleCanvasDoubleClick}
      >
        {/* Canvas Background Grid */}
        <div className="absolute inset-0 bg-gray-950 bg-[linear-gradient(to_right,#37415125_1px,transparent_1px),linear-gradient(to_bottom,#37415125_1px,transparent_1px)] bg-[size:20px_20px]" />

        {/* Nodes Layer */}
        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {nodes.map(node => (
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

      {/* Floating Bottom Action Bar */}
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
          triggerAutoSave(nodes, view, id);
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
