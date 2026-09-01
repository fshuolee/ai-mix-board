
import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { CanvasNode, ImageNode, TextNode } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { blobToBase64 } from './utils/canvasUtils';
import { generateImageFromNodes } from './services/geminiService';
import { storeImage, deleteImage } from './services/dbService';
import NodeRenderer from './components/NodeRenderer';

const checkOverlap = (rect1: {x:number, y:number, width: number, height: number}, rect2: {x:number, y:number, width: number, height: number}) => {
    const padding = 20; // Add some padding
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
    let angle = Math.random() * 2 * Math.PI; // Start at a random angle
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
        if (angle > (Math.PI * 2)) {
            angle -= Math.PI * 2;
            radius += radiusIncrement;
        }
        x = startX + radius * Math.cos(angle);
        y = startY + radius * Math.sin(angle);
        attempt++;
    }

    // Fallback if no position is found
    return { x: startX, y: startY + height + 50 };
};


const App: React.FC = () => {
  const [nodes, setNodes] = useLocalStorage<CanvasNode[]>('infinity-canvas-nodes', []);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragInfoRef = useRef<{ type: 'pan' | 'drag_node', startX: number, startY: number, nodes?: Map<string, {x:number, y:number}> } | null>(null);

  const updateNode = useCallback((id: string, updates: Partial<CanvasNode>) => {
    setNodes(prevNodes => prevNodes.map(n => n.id === id ? { ...n, ...updates } : n));
  }, [setNodes]);

  const addNode = useCallback(<T extends CanvasNode,>(newNode: T) => {
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeIds(new Set([newNode.id]));
  }, [setNodes]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left-click
    if ((e.target as HTMLElement).closest('.node-renderer')) return;
    
    // Deselect all nodes when clicking on canvas background
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
      : [nodes.find(n => n.id === nodeId)].filter(Boolean) as CanvasNode[];

    const nodesMap = new Map(draggedNodes.map(n => [n.id, { x: n.x, y: n.y }]));

    dragInfoRef.current = {
        type: 'drag_node',
        startX: e.clientX,
        startY: e.clientY,
        nodes: nodesMap
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfoRef.current) return;
    
    const dx = e.clientX - dragInfoRef.current.startX;
    const dy = e.clientY - dragInfoRef.current.startY;

    if (dragInfoRef.current.type === 'pan') {
      setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
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
    
    setView({ x: newX, y: newY, zoom: clampedZoom });
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
    if (!canvasRef.current) return {x: 0, y: 0};
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - view.x) / view.zoom;
    const y = (clientY - rect.top - view.y) / view.zoom;
    return {x, y};
  }
  
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node-id]')) return;

    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    const newNodeId = Date.now().toString();
    const newNode: TextNode = {
        id: newNodeId, type: 'text', x, y,
        width: 200, height: 60, rotation: 0,
        content: "Type here...",
    };
    addNode(newNode);

    requestAnimationFrame(() => {
        const nodeElement = canvasRef.current?.querySelector(`[data-node-id='${newNodeId}']`);
        if (nodeElement) {
            nodeElement.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        }
    });
  };

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    e.preventDefault();
    const initialCoords = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);

    const text = e.clipboardData?.getData('text/plain');
    if (text) {
      const width = 200, height = 100;
      const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, nodes);
      addNode({
        id: Date.now().toString(), type: 'text', x, y,
        width, height, rotation: 0,
        content: text,
      });
      return;
    }

    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const id = Date.now().toString();
            await storeImage(id, file);

            const base64 = await blobToBase64(file);
            const img = new Image();
            img.onload = () => {
                const width = img.width > 500 ? 500 : img.width;
                const height = img.width > 500 ? (500 / img.width) * img.height : img.height;
                const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, nodes);
                addNode({
                    id, type: 'image', x, y,
                    width, height, rotation: 0,
                    content: id,
                });
            };
            img.src = base64;
          }
          return;
        }
      }
    }
  }, [addNode, view, nodes]);

  const handleExecute = useCallback(async () => {
    if (isGenerating || selectedNodeIds.size === 0) return;
    setIsGenerating(true);
    setError(null);
    try {
      const selectedNodes = nodes.filter(n => selectedNodeIds.has(n.id));
      const newImageBlob = await generateImageFromNodes(selectedNodes);
      
      const initialCoords = getCanvasCoords(window.innerWidth / 2, window.innerHeight / 2);
      
      const img = new Image();
      const objectUrl = URL.createObjectURL(newImageBlob);
      img.onload = async () => {
        const id = Date.now().toString();
        await storeImage(id, newImageBlob);

        const width = img.width > 500 ? 500 : img.width;
        const height = img.width > 500 ? (500/img.width) * img.height : img.height;
        const { x, y } = findOpenPosition(initialCoords.x, initialCoords.y, width, height, nodes);
        addNode({
            id, type: 'image', x, y,
            width, height, rotation: 0,
            content: id
        });
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;

    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, selectedNodeIds, nodes, addNode, view.x, view.y, view.zoom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.shiftKey) {
        handleExecute();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
          if (document.activeElement?.tagName === 'TEXTAREA') return;
          const nodesToDelete = nodes.filter(n => selectedNodeIds.has(n.id));
          nodesToDelete.forEach(node => {
              if (node.type === 'image') {
                  deleteImage(node.content).catch(err => console.error("Failed to delete image from DB:", err));
              }
          });
          setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
          setSelectedNodeIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExecute, selectedNodeIds, setNodes, nodes]);


  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  return (
    <div className="w-screen h-screen relative select-none overflow-hidden" ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={handleCanvasDoubleClick}
    >
      <div className="absolute inset-0 bg-gray-900 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px]"></div>
      <div 
        className="absolute top-0 left-0" 
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
        {nodes.map(node => (
          <div key={node.id} className="node-renderer">
            <NodeRenderer 
              node={node} 
              zoom={view.zoom}
              isSelected={selectedNodeIds.has(node.id)} 
              onNodeUpdate={updateNode}
              onSelect={handleSelectNode}
              onDragStart={handleNodeDragStart}
            />
          </div>
        ))}
      </div>
      <div 
        className="absolute bottom-5 right-5 z-10"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleExecute}
          disabled={isGenerating || selectedNodeIds.size === 0}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full shadow-lg hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2"
          aria-label="Generate image from selected nodes"
        >
          {isGenerating ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          )}
          <span>Execute</span>
          <span className="text-xs opacity-70">(Shift+Enter)</span>
        </button>
      </div>
       {error && (
        <div 
          role="alert" 
          className="absolute top-5 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-md shadow-lg z-20"
          onPointerDown={(e) => e.stopPropagation()}
        >
            {error}
        </div>
      )}
    </div>
  );
};

export default App;
