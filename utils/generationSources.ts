import type { CanvasNode } from '../types';

/** Prefer the saved recipe, so a later edit/removal of an input cannot silently change regeneration. */
export function getGenerationSources(target: CanvasNode, nodes: CanvasNode[]): CanvasNode[] {
  const details = target.generationSourceDetails;
  const ids = target.generationSourceIds || details?.map(detail => detail.id) || [];
  const sources = ids.flatMap(id => {
    const saved = details?.find(detail => detail.id === id);
    const existing = nodes.find(node => node.id === id);
    if (saved && (saved.content || saved.driveFileId)) {
      const content = saved.type === 'text' ? saved.content : saved.driveFileId || saved.content;
      return [{ ...(existing || target), ...saved, id, type: saved.type, content, width: existing?.width || target.width,
        height: existing?.height || target.height, status: 'idle', variants: undefined, activeVariantId: undefined } as CanvasNode];
    }
    return existing ? [existing] : [];
  });
  if (!sources.length && target.generationPrompt) sources.push({ ...target, id: `prompt_${target.id}`, type: 'text', content: target.generationPrompt });
  return sources;
}
