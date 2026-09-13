import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Map, X, Maximize2, ZoomIn, ZoomOut, ChevronDown, ChevronUp } from 'lucide-react';
import { CanvasNode, ViewportState } from '../types';

export interface MinimapProps {
  nodes: CanvasNode[];
  selectedNodeIds: Set<string>;
  viewport: ViewportState;
  onPanTo: (worldX: number, worldY: number) => void;
  onResetZoom?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

const MAP_WIDTH = 210;
const MAP_HEIGHT = 140;
const PADDING = 300; // World coordinate padding around content

export const Minimap: React.FC<MinimapProps> = ({
  nodes,
  selectedNodeIds,
  viewport,
  onPanTo,
  onResetZoom,
  onZoomIn,
  onZoomOut,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  // 1. Calculate World Bounds (combining all nodes and visible screen area)
  const bounds = useMemo(() => {
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 900;

    const viewWorldLeft = -viewport.x / viewport.zoom;
    const viewWorldTop = -viewport.y / viewport.zoom;
    const viewWorldWidth = screenWidth / viewport.zoom;
    const viewWorldHeight = screenHeight / viewport.zoom;
    const viewWorldRight = viewWorldLeft + viewWorldWidth;
    const viewWorldBottom = viewWorldTop + viewWorldHeight;

    let minX = viewWorldLeft;
    let minY = viewWorldTop;
    let maxX = viewWorldRight;
    let maxY = viewWorldBottom;

    nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    });

    // Apply safety padding
    minX -= PADDING;
    minY -= PADDING;
    maxX += PADDING;
    maxY += PADDING;

    const worldWidth = Math.max(1000, maxX - minX);
    const worldHeight = Math.max(800, maxY - minY);

    // Uniform scale preserving aspect ratio inside minimap
    const scale = Math.min(MAP_WIDTH / worldWidth, MAP_HEIGHT / worldHeight);

    // Center content within minimap box
    const offsetX = (MAP_WIDTH - worldWidth * scale) / 2;
    const offsetY = (MAP_HEIGHT - worldHeight * scale) / 2;

    return {
      minX,
      minY,
      worldWidth,
      worldHeight,
      scale,
      offsetX,
      offsetY,
      viewWorldLeft,
      viewWorldTop,
      viewWorldWidth,
      viewWorldHeight,
    };
  }, [nodes, viewport]);

  // Coordinate transformation helpers
  const worldToMap = useCallback(
    (wx: number, wy: number) => {
      return {
        x: bounds.offsetX + (wx - bounds.minX) * bounds.scale,
        y: bounds.offsetY + (wy - bounds.minY) * bounds.scale,
      };
    },
    [bounds]
  );

  const mapToWorld = useCallback(
    (mx: number, my: number) => {
      return {
        x: bounds.minX + (mx - bounds.offsetX) / bounds.scale,
        y: bounds.minY + (my - bounds.offsetY) / bounds.scale,
      };
    },
    [bounds]
  );

  // Viewport box dimensions in minimap pixels
  const viewRect = useMemo(() => {
    const topLeft = worldToMap(bounds.viewWorldLeft, bounds.viewWorldTop);
    const w = Math.max(6, bounds.viewWorldWidth * bounds.scale);
    const h = Math.max(6, bounds.viewWorldHeight * bounds.scale);
    return {
      x: topLeft.x,
      y: topLeft.y,
      w,
      h,
    };
  }, [bounds, worldToMap]);

  // Handle click or drag on minimap to pan canvas
  const handleMapPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const mapX = Math.max(0, Math.min(MAP_WIDTH, clientX - rect.left));
      const mapY = Math.max(0, Math.min(MAP_HEIGHT, clientY - rect.top));

      // Target world coordinate to center on
      const targetWorld = mapToWorld(mapX, mapY);
      onPanTo(targetWorld.x, targetWorld.y);
    },
    [mapToWorld, onPanTo]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    handleMapPointer(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (e: PointerEvent) => {
      handleMapPointer(e.clientX, e.clientY);
    };

    const onPointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDragging, handleMapPointer]);

  // Collapsed State: floating action button in corner
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-16 right-4 z-20 p-2.5 bg-gray-900/90 hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-700/80 rounded-xl shadow-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-medium"
        title="開啟畫布小地圖 (Minimap)"
      >
        <Map className="w-4 h-4 text-blue-400" />
        <span className="hidden sm:inline font-mono text-[11px] text-gray-400">
          {Math.round(viewport.zoom * 100)}%
        </span>
      </button>
    );
  }

  return (
    <div
      className="fixed top-16 right-4 z-20 bg-gray-950/92 border border-gray-800/90 rounded-2xl shadow-2xl backdrop-blur-xl select-none animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800/80 bg-gray-900/60 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-gray-300">
          <Map className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-semibold tracking-wide">畫布全景</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-gray-400 px-1 py-0.5 rounded bg-gray-800/60">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800/80 transition-colors cursor-pointer"
            title="收合小地圖"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Minimap Canvas Surface */}
      <div
        ref={mapRef}
        onPointerDown={handlePointerDown}
        style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
        className="relative bg-gray-950/90 cursor-crosshair overflow-hidden"
      >
        {/* Subtle grid background */}
        <div
          className="absolute inset-0 opacity-15 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
            backgroundSize: '16px 16px',
          }}
        />

        {/* Mini Nodes */}
        {nodes.map(node => {
          const mapPos = worldToMap(node.x, node.y);
          const mapW = Math.max(3, node.width * bounds.scale);
          const mapH = Math.max(3, node.height * bounds.scale);
          const isSelected = selectedNodeIds.has(node.id);

          return (
            <div
              key={node.id}
              style={{
                left: `${mapPos.x}px`,
                top: `${mapPos.y}px`,
                width: `${mapW}px`,
                height: `${mapH}px`,
                transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
              }}
              className={`absolute rounded-[2px] pointer-events-none transition-colors ${
                isSelected
                  ? 'bg-amber-400 ring-1 ring-amber-300 z-10'
                  : node.type === 'image'
                  ? 'bg-blue-500/80'
                  : 'bg-purple-500/80'
              }`}
            />
          );
        })}

        {/* Visible Screen Viewport Box */}
        <div
          style={{
            left: `${viewRect.x}px`,
            top: `${viewRect.y}px`,
            width: `${viewRect.w}px`,
            height: `${viewRect.h}px`,
          }}
          className="absolute border border-blue-400/90 bg-blue-500/15 pointer-events-none rounded-[3px] shadow-[0_0_8px_rgba(59,130,246,0.3)]"
        />
      </div>

      {/* Mini Controls Footer */}
      <div className="flex items-center justify-between px-2 py-1 bg-gray-900/60 border-t border-gray-800/60 text-[11px]">
        {onResetZoom && (
          <button
            onClick={onResetZoom}
            className="px-1.5 py-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors flex items-center gap-1"
            title="符合畫面 (快速鍵 F)"
          >
            <Maximize2 className="w-3 h-3 text-gray-300" />
            <span>全景</span>
          </button>
        )}

        <div className="flex items-center gap-0.5">
          {onZoomOut && (
            <button
              onClick={onZoomOut}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title="縮小"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
          )}
          {onZoomIn && (
            <button
              onClick={onZoomIn}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title="放大"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Minimap;
