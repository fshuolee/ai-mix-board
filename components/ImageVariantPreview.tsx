import React, { useEffect, useState } from 'react';
import type { ImageVariant } from '../types';
import { getOriginalImageBlob } from '../services/imageInputService';
import { getEditedImageBlob } from '../utils/imageEditing';
import { fetchImageBlob } from '../services/atlasCloudService';
import { Loader2 } from 'lucide-react';

export function ImageVariantPreview({ variant, className = '' }: { variant: ImageVariant; className?: string }) {
  const [source, setSource] = useState<{ variant: ImageVariant; url: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    setError('');
    getOriginalImageBlob({ ...variant, type: 'image', x: 0, y: 0, rotation: 0 }, undefined, fetchImageBlob)
      .then(blob => getEditedImageBlob(blob, variant.imageEdits)).then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob); setSource({ variant, url });
      }).catch(() => { if (!cancelled) setError('無法載入圖片'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [variant.content, variant.driveFileId, variant.imageEdits]);
  if (error) return <span className="text-xs text-gray-400 p-2">{error}</span>;
  if (!source || source.variant.content !== variant.content || source.variant.imageEdits !== variant.imageEdits) return <Loader2 className="w-5 h-5 animate-spin text-gray-500" />;
  return <img src={source.url} alt={variant.originalFileName || '圖片版本'} className={`image-transparency-grid object-contain ${className}`} draggable={false} />;
}
