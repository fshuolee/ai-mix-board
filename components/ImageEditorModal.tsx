import React, { useEffect, useRef, useState } from 'react';
import { Crop, Eraser, Pencil, RotateCcw, Undo2, Redo2, Loader2 } from 'lucide-react';
import type { ImageCrop, ImageEdits, ImagePoint, ImageStroke, ImageNode } from '../types';
import { loadNodeImage } from '../services/imageInputService';
import { fetchImageBlob } from '../services/atlasCloudService';
import { Modal, ModalHeader } from './ui/Modal';
import { IMAGE_EDITOR_CONFIG as config, clampUnit, cropFromDrag, hasImageEdits, renderEditedImage, roundCoordinate } from '../utils/imageEditing';

type Tool = ImageStroke['tool'] | 'crop';
type Corner = 'nw' | 'ne' | 'sw' | 'se';
interface Gesture {
  pointerId: number;
  start: ImagePoint;
  base: ImageEdits;
  next: ImageEdits;
  action: 'draw' | 'crop' | 'move';
  anchor?: ImagePoint;
}
interface Props {
  sourceUrl: string;
  sourceNode: ImageNode;
  initialEdits?: ImageEdits;
  onClose: () => void;
  onSave: (edits?: ImageEdits) => void;
}
const EMPTY_EDITS: ImageEdits = { strokes: [] };
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const TOOL_OPTIONS = [
  { value: 'pen' as const, label: '標注', Icon: Pencil },
  { value: 'eraser' as const, label: '擦除', Icon: Eraser },
  { value: 'crop' as const, label: '裁切', Icon: Crop },
];

export function ImageEditorModal({ sourceUrl, sourceNode, initialEdits, onClose, onSave }: Props) {
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(config.defaultColor);
  const [brushWidth, setBrushWidth] = useState(config.defaultBrushWidth);
  const [ratio, setRatio] = useState('free');
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ImageEdits[]>([initialEdits || EMPTY_EDITS]);
  const [position, setPosition] = useState(0);
  const [preview, setPreview] = useState<ImageEdits | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const edits = preview || history[position];
  const selectedRatio = config.cropRatios.find(option => option.value === ratio)?.ratio;

  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    loadNodeImage(sourceNode, sourceUrl, fetchImageBlob).then(loaded => {
      if (cancelled) { loaded.release(); return; }
      release = loaded.release; setImage(loaded.image);
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; release?.(); };
  }, [sourceUrl]);

  useEffect(() => {
    if (!image) return;
    const frame = requestAnimationFrame(() => {
      try {
        // Keep the full source visible while cropping so excluded areas can be restored.
        const rendered = renderEditedImage(image, edits, false);
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = rendered.width; canvas.height = rendered.height;
          canvas.getContext('2d')?.drawImage(rendered, 0, 0);
        }
      } catch (err) { setError((err as Error).message); }
    });
    return () => cancelAnimationFrame(frame);
  }, [image, edits]);

  function commit(next: ImageEdits) {
    setHistory(previous => [...previous.slice(0, position + 1), next]);
    setPosition(position + 1);
    setPreview(null);
    setError('');
  }
  function pointAt(event: React.PointerEvent): ImagePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: roundCoordinate(clampUnit((event.clientX - rect.left) / rect.width)),
      y: roundCoordinate(clampUnit((event.clientY - rect.top) / rect.height)) };
  }
  function startGesture(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !image || gesture.current) return;
    event.preventDefault(); event.stopPropagation();
    const point = pointAt(event);
    const base = history[position];
    const corner = (event.target as HTMLElement).dataset.cropHandle as Corner | undefined;
    const crop = base.crop;
    let action: Gesture['action'] = tool === 'crop' ? 'crop' : 'draw';
    let anchor = point;
    if (tool === 'crop' && crop) {
      if (corner) {
        anchor = { x: corner.endsWith('w') ? crop.x + crop.width : crop.x,
          y: corner.startsWith('n') ? crop.y + crop.height : crop.y };
      } else if (point.x > crop.x && point.x < crop.x + crop.width && point.y > crop.y && point.y < crop.y + crop.height) {
        action = 'move';
      }
    }
    const next: ImageEdits = action === 'draw'
      ? { ...base, strokes: [...base.strokes, { tool: tool as ImageStroke['tool'], color, width: brushWidth, points: [point] }] }
      : base;
    gesture.current = { pointerId: event.pointerId, start: point, base, next, action, anchor };
    setPreview(next); setIsDrawing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveGesture(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId || !image) return;
    event.preventDefault();
    const point = pointAt(event);
    if (current.action === 'draw') {
      const strokes = current.next.strokes;
      const lastStroke = strokes[strokes.length - 1];
      const previousPoint = lastStroke.points[lastStroke.points.length - 1];
      if (Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < config.minPointDistance) return;
      current.next = { ...current.next, strokes: [...strokes.slice(0, -1), { ...lastStroke, points: [...lastStroke.points, point] }] };
    } else {
      let crop: ImageCrop;
      if (current.action === 'move') {
        const original = current.base.crop!;
        crop = { ...original, x: roundCoordinate(Math.max(0, Math.min(1 - original.width, original.x + point.x - current.start.x))),
          y: roundCoordinate(Math.max(0, Math.min(1 - original.height, original.y + point.y - current.start.y))) };
      } else {
        crop = cropFromDrag(current.anchor!, point, image.naturalWidth, image.naturalHeight, selectedRatio);
      }
      current.next = { ...current.base, crop };
    }
    setPreview(current.next);
  }
  function endGesture(event: React.PointerEvent<HTMLDivElement>, cancel = false) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!cancel) moveGesture(event);
    gesture.current = null; setIsDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const crop = current.next.crop;
    if (cancel || (current.action === 'crop' && crop && (crop.width < config.minCropSize || crop.height < config.minCropSize))) {
      setPreview(null);
    } else if (current.next !== current.base) {
      commit(current.next);
    } else setPreview(null);
  }
  function changeRatio(value: string) {
    setRatio(value);
    const fixedRatio = config.cropRatios.find(option => option.value === value)?.ratio;
    if (!fixedRatio || !image) return;
    const crop = edits.crop || { x: 0, y: 0, width: 1, height: 1 };
    const normalizedRatio = fixedRatio * image.naturalHeight / image.naturalWidth;
    const width = Math.min(crop.width, crop.height * normalizedRatio);
    const height = width / normalizedRatio;
    commit({ ...edits, crop: { x: roundCoordinate(crop.x + (crop.width - width) / 2), y: roundCoordinate(crop.y + (crop.height - height) / 2),
      width: roundCoordinate(width), height: roundCoordinate(height) } });
  }
  function save() {
    try {
      if (JSON.stringify(edits).length > config.maxSerializedLength) throw new Error('標注內容過多，請復原部分筆畫後再套用。');
      // Exercise export before saving so inaccessible images never produce a misleading preview.
      renderEditedImage(image!, edits).toDataURL('image/png');
      onSave(hasImageEdits(edits) ? edits : undefined);
    } catch (err) { setError((err as Error).message || '無法套用修改'); }
  }
  const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border border-gray-700 hover:bg-gray-700 disabled:opacity-35 disabled:cursor-not-allowed';
  return <Modal isOpen onClose={onClose} size="4xl" tall closeOnBackdrop={false}>
    <ModalHeader title="編輯圖片" subtitle="修改獨立保存，生成時使用修改後的圖片；原圖隨時可還原。" icon={<Pencil />} />
    <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-800 shrink-0">
      {TOOL_OPTIONS.map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={tool === value}
        className={`${buttonClass} ${tool === value ? 'bg-blue-600/25 text-blue-300 border-blue-500' : 'text-gray-300'}`}
        disabled={isDrawing} onClick={() => setTool(value)}><Icon className="w-4 h-4" />{label}</button>)}
      {tool === 'crop' ? <>
        <select aria-label="裁切比例" value={ratio} disabled={isDrawing} onChange={event => changeRatio(event.target.value)} className="bg-gray-800 rounded-lg border border-gray-700 px-2 py-2 text-xs">
          {config.cropRatios.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <button className={buttonClass} disabled={!edits.crop || isDrawing} onClick={() => commit({ strokes: edits.strokes })}>重設裁切</button>
      </> : <>
        {tool === 'pen' && <input type="color" aria-label="標注顏色" value={color} onChange={event => setColor(event.target.value)} className="w-9 h-8 rounded cursor-pointer bg-gray-800" />}
        <label className="flex items-center gap-2 text-xs text-gray-300">筆刷大小
          <input aria-label="筆刷大小" type="range" min={config.minBrushWidth} max={config.maxBrushWidth} step={config.brushStep} value={brushWidth}
            onChange={event => setBrushWidth(Number(event.target.value))} className="w-24 accent-blue-500" />
        </label>
      </>}
    </div>
    <div className="px-5 py-4 overflow-auto min-h-0 flex flex-col items-center gap-3">
      <p className="text-xs text-gray-400 self-start">{tool === 'crop' ? '拖曳建立裁切範圍，拖動框內移動，拖動四角調整大小。' : tool === 'eraser' ? '拖曳將圖片與標注局部擦成透明。' : '在圖片上拖曳標注。'}</p>
      {!image ? <div className="h-48 flex items-center gap-2 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" />載入圖片...</div> :
        <div className="relative inline-flex max-w-full overflow-hidden shrink-0" style={{ touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={event => endGesture(event)} onPointerCancel={event => endGesture(event, true)}>
          <canvas ref={canvasRef} aria-label="圖片編輯畫布" className="image-transparency-grid block max-w-full max-h-[48vh] w-auto h-auto" />
          {edits.crop && <div className="absolute border-2 border-blue-400 pointer-events-none" style={{ left: `${edits.crop.x * 100}%`, top: `${edits.crop.y * 100}%`,
            width: `${edits.crop.width * 100}%`, height: `${edits.crop.height * 100}%`, boxShadow: '0 0 0 9999px rgb(0 0 0 / 55%)' }}>
            {tool === 'crop' && CORNERS.map(corner => <span key={corner} data-crop-handle={corner} className="absolute w-4 h-4 bg-white border-2 border-blue-500 pointer-events-auto rounded-sm"
              style={{ left: corner.endsWith('w') ? '-8px' : undefined, right: corner.endsWith('e') ? '-8px' : undefined,
                top: corner.startsWith('n') ? '-8px' : undefined, bottom: corner.startsWith('s') ? '-8px' : undefined,
                cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }} />)}
          </div>}
        </div>}
      {error && <p role="alert" className="text-sm text-red-300 self-start">{error}</p>}
    </div>
    <div className="flex flex-wrap gap-2 items-center px-5 py-4 border-t border-gray-800 shrink-0">
      <button aria-label="復原" className={buttonClass} disabled={!position || isDrawing} onClick={() => { setPosition(position - 1); setPreview(null); }}><Undo2 className="w-4 h-4" />復原</button>
      <button aria-label="重做" className={buttonClass} disabled={position === history.length - 1 || isDrawing} onClick={() => { setPosition(position + 1); setPreview(null); }}><Redo2 className="w-4 h-4" />重做</button>
      <button className={buttonClass} disabled={!hasImageEdits(edits) || isDrawing} onClick={() => commit(EMPTY_EDITS)}><RotateCcw className="w-4 h-4" />清除所有修改</button>
      <div className="flex-1" />
      <button className={buttonClass} onClick={onClose}>取消</button>
      <button className={`${buttonClass} bg-blue-600 hover:bg-blue-500 text-white border-blue-500`} disabled={!image || isDrawing} onClick={save}>套用修改</button>
    </div>
  </Modal>;
}
