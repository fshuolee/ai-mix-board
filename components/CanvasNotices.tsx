import React from 'react';
import { ClipboardCheck, Loader2, ShieldCheck, X } from 'lucide-react';

const TOAST_TONE_CLASSES = {
  info: 'border-blue-500/40 text-blue-200',
  success: 'border-emerald-500/40 text-emerald-200',
  warning: 'border-amber-500/40 text-amber-200',
} as const;
export type ToastTone = keyof typeof TOAST_TONE_CLASSES;

interface CanvasNoticesProps {
  deletingCount: number;
  error: string | null;
  toast: { message: string; tone: ToastTone } | null;
  rescueCount: number;
  isBoardEmpty: boolean;
  onDismissError: () => void;
  onRescue: () => void;
  onDismissRescue: () => void;
}

/** Render inside CanvasOverlayStack to share flow and wrapping with the model selector. */
const CanvasNotices: React.FC<CanvasNoticesProps> = ({
  deletingCount, error, toast, rescueCount, isBoardEmpty,
  onDismissError, onRescue, onDismissRescue,
}) => (
  <>
    {/* Floating Deletion In-Progress Banner */}
    {deletingCount > 0 && (
      <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-gray-950/95 border border-red-500/50 text-red-300 shadow-2xl backdrop-blur-md animate-fadeIn select-none pointer-events-none">
        <Loader2 className="w-4 h-4 shrink-0 animate-spin text-red-400" />
        <span className="text-xs font-semibold tracking-wide text-white">
          正在刪除 {deletingCount} 個節點...
        </span>
      </div>
    )}

    {/* Error Alert Banner */}
    {error && (
      <div
        role="alert"
        className="pointer-events-auto bg-red-600/90 backdrop-blur-md text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-2xl border border-red-400 flex items-center gap-2 animate-fadeIn"
        onPointerDown={e => e.stopPropagation()}
      >
        <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
        <button
          onClick={onDismissError}
          aria-label="關閉錯誤提示"
          className="ml-2 shrink-0 text-white/80 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )}

    {/* Floating Status / Toast notification */}
    {toast && (
      <div
        role={toast.tone === 'warning' ? 'alert' : 'status'}
        className={`flex items-center gap-2 px-4 py-2 bg-gray-900/90 backdrop-blur-xl border text-xs font-medium rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-none ${TOAST_TONE_CLASSES[toast.tone]}`}
      >
        <ClipboardCheck className="w-4 h-4 shrink-0" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{toast.message}</span>
      </div>
    )}

    {/* Proactive Lost Assets Detected Pill/Banner */}
    {rescueCount > 0 && (
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-900/95 backdrop-blur-xl border border-amber-500/50 hover:border-amber-400 text-amber-200 text-xs font-medium rounded-2xl shadow-2xl transition-all">
        <div className="p-1 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30 shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1 basis-40 [overflow-wrap:anywhere]">
          <span className="font-semibold text-white">
            {isBoardEmpty
              ? `畫布為空，但發現 ${rescueCount} 個可救回的圖片資源`
              : `發現 ${rescueCount} 個未放置的專案圖片`}
          </span>
        </div>
        <button
          onClick={onRescue}
          className="ml-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer whitespace-nowrap"
        >
          立即救回
        </button>
        <button
          onClick={onDismissRescue}
          className="shrink-0 p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors ml-1"
          title="關閉提示"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )}

  </>
);

export default CanvasNotices;
