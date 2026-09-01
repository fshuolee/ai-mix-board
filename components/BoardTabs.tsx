import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  Check,
  X,
  LayoutGrid,
} from 'lucide-react';
import { BoardMetadata, CanvasNode } from '../types';

interface BoardTabsProps {
  boards: BoardMetadata[];
  activeBoardId: string;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: (name?: string) => void;
  onRenameBoard: (boardId: string, newName: string) => void;
  onDeleteBoard: (boardId: string) => void;
  allNodes: CanvasNode[];
}

const BoardTabs: React.FC<BoardTabsProps> = ({
  boards,
  activeBoardId,
  onSelectBoard,
  onAddBoard,
  onRenameBoard,
  onDeleteBoard,
  allNodes,
}) => {
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [menuOpenBoardId, setMenuOpenBoardId] = useState<string | null>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingBoardId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingBoardId]);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenBoardId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStartRename = (board: BoardMetadata) => {
    setEditingBoardId(board.id);
    setEditingName(board.name);
    setMenuOpenBoardId(null);
  };

  const handleSaveRename = (boardId: string) => {
    if (editingName.trim()) {
      onRenameBoard(boardId, editingName.trim());
    }
    setEditingBoardId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, boardId: string) => {
    if (e.key === 'Enter') {
      handleSaveRename(boardId);
    } else if (e.key === 'Escape') {
      setEditingBoardId(null);
    }
  };

  const getNodeCountForBoard = (boardId: string) => {
    const defaultBoardId = boards[0]?.id || 'default';
    return allNodes.filter(n => (n.boardId || defaultBoardId) === boardId).length;
  };

  return (
    <div
      className="absolute bottom-6 left-6 z-20 flex items-center max-w-[calc(100vw-360px)] select-none"
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 p-1.5 bg-gray-950/85 backdrop-blur-xl border border-gray-800/90 rounded-2xl shadow-2xl overflow-x-auto scrollbar-none">
        {/* Boards Label / Icon */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-gray-400 border-r border-gray-800/80 mr-0.5 shrink-0">
          <LayoutGrid className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-gray-300 hidden md:inline">畫布</span>
        </div>

        {/* Board Tabs List */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {boards.map((board) => {
            const isActive = board.id === activeBoardId;
            const isEditing = board.id === editingBoardId;
            const nodeCount = getNodeCountForBoard(board.id);

            return (
              <div
                key={board.id}
                className="relative group shrink-0"
              >
                {isEditing ? (
                  <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded-xl border border-blue-500 shadow-inner">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => handleKeyDown(e, board.id)}
                      onBlur={() => handleSaveRename(board.id)}
                      className="bg-transparent text-xs text-white font-medium focus:outline-none w-24 px-1"
                    />
                    <button
                      onClick={() => handleSaveRename(board.id)}
                      className="p-0.5 text-emerald-400 hover:text-emerald-300"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingBoardId(null)}
                      className="p-0.5 text-gray-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onSelectBoard(board.id)}
                    onDoubleClick={() => handleStartRename(board)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                        : 'text-gray-300 hover:text-white hover:bg-gray-850 bg-gray-900/60 border border-gray-800/80'
                    }`}
                    title="雙擊可重新命名畫布"
                  >
                    <span className="max-w-[120px] truncate">{board.name}</span>

                    {/* Node count pill */}
                    <span
                      className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-medium ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {nodeCount}
                    </span>

                    {/* Options Menu Trigger */}
                    <div
                      onClick={e => {
                        e.stopPropagation();
                        setMenuOpenBoardId(menuOpenBoardId === board.id ? null : board.id);
                      }}
                      className={`p-0.5 rounded-md hover:bg-white/20 text-gray-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity ${
                        menuOpenBoardId === board.id ? 'opacity-100' : ''
                      }`}
                    >
                      <MoreVertical className="w-3 h-3" />
                    </div>
                  </button>
                )}

                {/* Context Menu */}
                {menuOpenBoardId === board.id && (
                  <div
                    ref={menuRef}
                    className="absolute bottom-full left-0 mb-2 w-36 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-1 z-50 animate-fadeIn"
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleStartRename(board)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg text-left transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                      <span>重新命名</span>
                    </button>
                    {boards.length > 1 && (
                      <button
                        onClick={() => {
                          setMenuOpenBoardId(null);
                          if (window.confirm(`確定要刪除畫布 "${board.name}" 嗎？畫布上的節點將會一併移除。`)) {
                            onDeleteBoard(board.id);
                          }
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/50 rounded-lg text-left transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>刪除畫布</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add New Board Button */}
        <button
          onClick={() => onAddBoard()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-600/10 border border-dashed border-blue-500/40 hover:border-blue-400 transition-all shrink-0 ml-1"
          title="新增畫布 (Board)"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">新增畫布</span>
        </button>
      </div>
    </div>
  );
};

export default BoardTabs;
