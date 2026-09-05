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
  ChevronLeft,
  ChevronRight,
  Search,
  ListFilter,
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
  disabled?: boolean;
}

const BoardTabs: React.FC<BoardTabsProps> = ({
  boards,
  activeBoardId,
  onSelectBoard,
  onAddBoard,
  onRenameBoard,
  onDeleteBoard,
  allNodes,
  disabled = false,
}) => {
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [menuOpenBoardId, setMenuOpenBoardId] = useState<string | null>(null);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (editingBoardId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingBoardId]);

  // Check scroll bounds
  const updateScrollBounds = () => {
    const el = scrollContainerRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    }
  };

  useEffect(() => {
    updateScrollBounds();
    window.addEventListener('resize', updateScrollBounds);
    return () => window.removeEventListener('resize', updateScrollBounds);
  }, [boards]);

  // Auto-scroll active board into view
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      const activeElement = el.querySelector(`[data-board-tab-id="${activeBoardId}"]`) as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
    updateScrollBounds();
  }, [activeBoardId]);

  // Close context menu & overview on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenBoardId(null);
      }
      if (overviewRef.current && !overviewRef.current.contains(e.target as Node)) {
        setIsOverviewOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleScroll = (delta: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
      setTimeout(updateScrollBounds, 200);
    }
  };

  const handleWheelScroll = (e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      if (Math.abs(e.deltaX) > 0) {
        scrollContainerRef.current.scrollLeft += e.deltaX;
      } else {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
      updateScrollBounds();
    }
  };

  const handleStartRename = (board: BoardMetadata) => {
    setEditingBoardId(board.id);
    setEditingName(board.name);
    setMenuOpenBoardId(null);
    setIsOverviewOpen(false);
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

  const filteredBoards = boards.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className={`absolute bottom-6 left-6 z-20 flex items-center max-w-[calc(100vw-360px)] select-none transition-opacity duration-200 ${
        disabled ? 'pointer-events-none opacity-40' : ''
      }`}
      onPointerDown={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 p-1.5 bg-gray-950/90 backdrop-blur-2xl border border-gray-800/90 rounded-2xl shadow-2xl relative max-w-full">
        {/* All Boards Overview Dropdown Trigger */}
        <div className="relative" ref={overviewRef}>
          <button
            onClick={() => setIsOverviewOpen(prev => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all border shrink-0 ${
              isOverviewOpen
                ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border-transparent'
            }`}
            title="查看所有畫布清單 / 搜尋畫布"
          >
            <LayoutGrid className="w-4 h-4 text-blue-400" />
            <span className="hidden sm:inline">畫布</span>
            <span className="px-1.5 py-0.2 text-[10px] bg-gray-800 text-gray-400 rounded-full font-mono">
              {boards.length}
            </span>
          </button>

          {/* Overview List Modal / Dropdown */}
          {isOverviewOpen && (
            <div className="absolute bottom-full left-0 mb-3 w-80 max-h-96 bg-gray-900/95 backdrop-blur-2xl border border-gray-700/80 rounded-2xl shadow-2xl p-2 z-50 flex flex-col animate-fadeIn">
              {/* Search & Header */}
              <div className="p-2 border-b border-gray-800 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
                    <ListFilter className="w-4 h-4 text-blue-400" />
                    <span>所有畫布清單 ({boards.length})</span>
                  </div>
                  <button
                    onClick={() => {
                      onAddBoard();
                      setIsOverviewOpen(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增</span>
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="搜尋畫布名稱..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-950/80 border border-gray-800 rounded-xl text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Vertical Scrollable List */}
              <div className="overflow-y-auto max-h-60 p-1 space-y-1 mt-1 scrollbar-thin">
                {filteredBoards.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-500">無相符畫布</div>
                ) : (
                  filteredBoards.map((b, idx) => {
                    const isActive = b.id === activeBoardId;
                    const count = getNodeCountForBoard(b.id);
                    return (
                      <div
                        key={b.id}
                        onClick={() => {
                          onSelectBoard(b.id);
                          setIsOverviewOpen(false);
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-colors group ${
                          isActive
                            ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300 font-semibold'
                            : 'hover:bg-gray-800 text-gray-300 hover:text-white border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <span className="text-[10px] text-gray-500 font-mono w-4">
                            {idx + 1}.
                          </span>
                          <span className="truncate">{b.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-800/80 text-gray-400 font-mono">
                            {count} 個物件
                          </span>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleStartRename(b);
                            }}
                            className="p-1 text-gray-400 hover:text-blue-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="重新命名"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-gray-800/80 mx-0.5 shrink-0" />

        {/* Scroll Left Button */}
        {canScrollLeft && (
          <button
            onClick={() => handleScroll(-180)}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors shrink-0"
            title="向左滾動畫布分頁"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Horizontal Scrollable Tabs */}
        <div
          ref={scrollContainerRef}
          onScroll={updateScrollBounds}
          onWheel={handleWheelScroll}
          className="flex items-center gap-1 overflow-x-auto scrollbar-none max-w-[calc(100vw-520px)] scroll-smooth py-0.5 px-0.5"
        >
          {boards.map((board) => {
            const isActive = board.id === activeBoardId;
            const isEditing = board.id === editingBoardId;
            const nodeCount = getNodeCountForBoard(board.id);

            return (
              <div
                key={board.id}
                data-board-tab-id={board.id}
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
                    title={`${board.name} (雙擊可重新命名)`}
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

        {/* Scroll Right Button */}
        {canScrollRight && (
          <button
            onClick={() => handleScroll(180)}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors shrink-0"
            title="向右滾動畫布分頁"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Add New Board Button */}
        <button
          onClick={() => onAddBoard()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-600/10 border border-dashed border-blue-500/40 hover:border-blue-400 transition-all shrink-0 ml-1"
          title="新增畫布 (Board)"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">新增</span>
        </button>
      </div>
    </div>
  );
};

export default BoardTabs;
