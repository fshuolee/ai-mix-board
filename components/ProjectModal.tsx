import React, { useState } from 'react';
import { FolderPlus, Folder, FileSpreadsheet, X, Check, Loader2, HardDrive } from 'lucide-react';
import { ProjectMetadata } from '../types';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectMetadata[];
  currentProjectId?: string;
  onSelectProject: (project: ProjectMetadata) => void;
  onCreateProject: (name: string) => Promise<void>;
  isLoading: boolean;
}

const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onSelectProject,
  onCreateProject,
  isLoading,
}) => {
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isCreating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCreating, onClose]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      await onCreateProject(newProjectName.trim());
      setNewProjectName('');
      onClose();
    } catch (err: any) {
      setError(err.message || '建立專案失敗');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl shadow-lg">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">專案管理 (Google Drive)</h2>
              <p className="text-xs text-gray-400">
                存放於個人雲端硬碟 <code className="text-emerald-300 font-mono">My Drive / ai-mix-board /</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Create Project Form */}
          <form onSubmit={handleCreate} className="space-y-3 p-4 bg-gray-800/60 border border-gray-700/80 rounded-xl">
            <label className="block text-sm font-semibold text-gray-200">
              建立新專案資料夾 & Google Sheet
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="例如：概念角色設計、遊戲場景生成..."
                disabled={isCreating}
                className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={isCreating || !newProjectName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg shadow-md transition-all shrink-0"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>建立中...</span>
                  </>
                ) : (
                  <>
                    <FolderPlus className="w-4 h-4" />
                    <span>建立專案</span>
                  </>
                )}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <p className="text-[11px] text-gray-400">
              系統將於 Google Drive 自動建立專案資料夾、<code className="text-gray-300">assets/</code> 資源夾與對應 Google Sheet 節點資料表。
            </p>
          </form>

          {/* Project List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-300 flex items-center justify-between">
              <span>現有專案列表 ({projects.length})</span>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
            </h3>

            {projects.length === 0 && !isLoading ? (
              <div className="text-center py-8 text-gray-400 bg-gray-800/30 rounded-xl border border-gray-800">
                <Folder className="w-10 h-10 mx-auto mb-2 text-gray-500 opacity-50" />
                <p className="text-sm">尚未建立任何專案</p>
                <p className="text-xs text-gray-500 mt-1">請在上方輸入專案名稱開始第一個畫布</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map(p => {
                  const isCurrent = p.id === currentProjectId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        onSelectProject(p);
                        onClose();
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-blue-950/40 border-blue-500 shadow-md'
                          : 'bg-gray-800/50 border-gray-700/70 hover:bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-2 rounded-lg ${
                            isCurrent ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          <Folder className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-white truncate">
                              {p.name}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.2 rounded font-medium">
                                目前使用中
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                            {p.spreadsheetId && (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                <span>Google Sheet 已就緒</span>
                              </span>
                            )}
                            {p.updatedAt && (
                              <span>更新於: {new Date(p.updatedAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {p.webViewLink && (
                          <a
                            href={p.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 text-xs flex items-center gap-1"
                            title="在 Google Drive 中開啟"
                          >
                            <Folder className="w-4 h-4" />
                          </a>
                        )}
                        {p.sheetViewLink && (
                          <a
                            href={p.sheetViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="p-1.5 text-emerald-400 hover:text-emerald-300 rounded-lg hover:bg-gray-700 text-xs flex items-center gap-1"
                            title="在 Google Sheets 中開啟"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-950/60 flex items-center justify-end text-xs text-gray-400">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectModal;
