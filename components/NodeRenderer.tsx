
import React, { useRef, useState, useEffect } from 'react';
import type { CanvasNode, TextNode, ImageNode } from '../types';
import { getImage } from '../services/dbService';

interface NodeRendererProps {
  node: CanvasNode;
  zoom: number;
  isSelected: boolean;
  onNodeUpdate: (id: string, updates: Partial<CanvasNode>) => void;
  onSelect: (id: string, shiftKey: boolean) => void;
  onDragStart: (e: React.PointerEvent, nodeId: string) => void;
}

const NodeRenderer: React.FC<NodeRendererProps> = ({ node, zoom, isSelected, onNodeUpdate, onSelect, onDragStart }) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (node.type === 'image') {
      let objectUrl: string;
      getImage((node as ImageNode).content)
        .then(blob => {
          if (blob) {
            objectUrl = URL.createObjectURL(blob);
            setImageUrl(objectUrl);
          } else {
            setImageUrl(null); // Handle case where image is not found
          }
        })
        .catch(err => {
            console.error("Failed to load image from DB", err);
            setImageUrl(null);
        });

      return () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    }
  }, [node.id, node.content, node.type]);


  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.target === resizeHandleRef.current) return;
    e.stopPropagation();
    onSelect(node.id, e.shiftKey);
    onDragStart(e, node.id);
  };
  
  const handleDoubleClick = () => {
    if (node.type === 'text') {
        setIsEditing(true);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onNodeUpdate(node.id, { content: e.target.value });
  };
  
  const handleTextBlur = () => {
    setIsEditing(false);
  };

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = node.width;
    const startHeight = node.height;

    const doResize = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / zoom;
      const dy = (moveEvent.clientY - startY) / zoom;
      onNodeUpdate(node.id, {
        width: Math.max(20, startWidth + dx),
        height: Math.max(20, startHeight + dy),
      });
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', doResize);
      window.removeEventListener('pointerup', stopResize);
    };

    window.addEventListener('pointermove', doResize);
    window.addEventListener('pointerup', stopResize);
  };

  const commonStyle: React.CSSProperties = {
    width: `${node.width}px`,
    height: `${node.height}px`,
    transform: `translate(${node.x}px, ${node.y}px)`,
    outline: isSelected ? `2px solid #3b82f6` : 'none',
    outlineOffset: '4px',
  };

  return (
    <div
      ref={nodeRef}
      className="absolute bg-gray-800 border border-gray-600 rounded-lg shadow-lg cursor-grab active:cursor-grabbing"
      style={commonStyle}
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      data-node-id={node.id}
    >
      {node.type === 'text' && (
        isEditing ? (
            <textarea
                value={(node as TextNode).content}
                onChange={handleTextChange}
                onBlur={handleTextBlur}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="w-full h-full p-2 text-white bg-transparent border-0 rounded-lg resize-none focus:ring-0 focus:outline-none"
                style={{ fontSize: `${16 * (1/zoom)}px` }}
            />
        ) : (
            <div className="w-full h-full p-2 overflow-hidden whitespace-pre-wrap">
                {(node as TextNode).content}
            </div>
        )
      )}
      {node.type === 'image' && imageUrl && (
        <img
          src={imageUrl}
          alt="User content"
          className="w-full h-full object-contain rounded-lg"
          draggable={false}
        />
      )}
      {isSelected && (
        <div
            ref={resizeHandleRef}
            className="absolute -bottom-2 -right-2 w-4 h-4 bg-blue-500 border-2 border-gray-900 rounded-full cursor-nwse-resize"
            onPointerDown={startResize}
        />
      )}
    </div>
  );
};

export default NodeRenderer;