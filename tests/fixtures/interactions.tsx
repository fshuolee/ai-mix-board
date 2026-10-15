import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from '../../App';
import NodeRenderer, { nodeObjectUrlCache } from '../../components/NodeRenderer';
import { CensoredUnlockModal } from '../../components/CensoredOverlay';
import * as clipboard from '../../services/clipboardService';
import { storeImage } from '../../services/dbService';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { NodeInfoModal } from '../../components/NodeInfoModal';
import BoardTabs from '../../components/BoardTabs';

function BoardTabsFixture() {
  const [boards, setBoards] = React.useState(() => Array.from({ length: 30 }, (_, index) => ({ id: `fixture-board-${index}`, name: `Board ${index + 1}`, createdAt: new Date().toISOString() })));
  const [activeBoardId, setActiveBoardId] = React.useState(boards[0].id);
  return <ConfirmProvider><BoardTabs boards={boards} activeBoardId={activeBoardId} onSelectBoard={setActiveBoardId}
    onAddBoard={noop} onRenameBoard={(id, name) => setBoards(previous => previous.map(board => board.id === id ? { ...board, name } : board))}
    onDeleteBoard={noop} allNodes={[]} /></ConfirmProvider>;
}

function EditableImageFixture() {
  const [isLocked, setLocked] = React.useState(false);
  Object.assign(window, { setImageLocked: setLocked });
  const [image, setImage] = React.useState({ ...node, id: 'fixture-edit-image', type: 'image' as const, content: 'fixture-edit-image', width: 320, height: 240 });
  Object.assign(window, { editedImageNode: image });
  return <NodeRenderer node={image} isLocked={isLocked} zoom={1} isSelected onSelect={noop} onDragStart={noop}
    onNodeUpdate={(_, updates) => setImage(previous => ({ ...previous, ...updates } as typeof previous))} />;
}

const root = createRoot(document.getElementById('root')!);
const node = { id: 'fixture-node', x: 0, y: 0, width: 160, height: 120, rotation: 0, content: '', type: 'video' as const };
const noop = () => {};

// Expose real components and services to browser tests without Google account access.
Object.assign(window, {
  renderGeneratedImageApp: async () => {
    await import('../../index.css');
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 120;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 0, 160, 120);
    await storeImage('fixture-generated-image', await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!))));
    ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 160, 120);
    Object.assign(window, { generatedVariantData: canvas.toDataURL('image/png'), generationRequests: 0 });
    localStorage.setItem('ai_mix_board_api_key', 'fixture-key');
    const realFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('generativelanguage.googleapis.com') && url.includes('generateContent')) {
        (window as any).generationRequests++;
        if ((window as any).failVariantGeneration) return new Response(JSON.stringify({ error: { message: 'Fixture generation failed' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: canvas.toDataURL('image/png').split(',')[1] } }] } }] }), { headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };
    sessionStorage.setItem('ai_mix_board_clipboard', JSON.stringify({ clipId: 'fixture-generation', timestamp: Date.now(), nodes: [{
      id: 'fixture-generated-image', type: 'image', content: 'fixture-generated-image', x: 0, y: 0, width: 160, height: 120, rotation: 0,
      generationPrompt: 'Generate a colored square', generationModelId: 'gemini-3.1-flash-image', generationModel: 'Fixture model',
      generationSourceIds: ['fixture-prompt'], generationSourceDetails: [{ id: 'fixture-prompt', type: 'text', content: 'Generate a colored square' }], generationParams: { seed: 42 }, status: 'idle',
    }] }));
    flushSync(() => root.render(<ConfirmProvider><App /></ConfirmProvider>));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    (document.activeElement as HTMLElement)?.blur?.();
    const data = new DataTransfer(); data.setData('text/plain', JSON.stringify({ __aimix_copy_id: 'fixture-generation' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  },
  renderEditableImage: async () => {
    await import('../../index.css');
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 120;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await storeImage('fixture-edit-image', await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!))));
    root.render(<EditableImageFixture />);
    await new Promise(resolve => requestAnimationFrame(resolve));
  },
  seedLegacyNodeCache: (id: string, url: string) => nodeObjectUrlCache.set(id, url),
  clipboard,
  storeImage,
  renderBoardTabs: async () => {
    await import('../../index.css');
    root.render(<BoardTabsFixture />);
  },
  renderNodeInfo: () => root.render(
    <NodeInfoModal isOpen node={{ ...node, type: 'image', generationModel: 'Fixture Model', generationParams: { seed: 42, aspect_ratio: '16:9' } }}
      onClose={() => Object.assign(window, { nodeInfoClosed: true })}
      onApplyNodeParams={params => Object.assign(window, { appliedNodeParams: params })} />
  ),
  renderImage: () => root.render(
    <div style={{ position: 'relative', margin: 100 }}>
      <NodeRenderer node={{ ...node, id: 'fixture-image', type: 'image', content: 'fixture-image' }} zoom={1} isSelected onNodeUpdate={noop} onSelect={noop} onDragStart={noop}
        onCopyNode={async image => { Object.assign(window, { lastCopyResult: await clipboard.copyNodesToClipboard([image]) }); }} />
    </div>
  ),
  renderApp: () => root.render(<ConfirmProvider><App /></ConfirmProvider>),
  renderVideo: () => root.render(<NodeRenderer node={{ ...node, content: new URL('./sample.webm', import.meta.url).href }} zoom={1} isSelected={false} onNodeUpdate={noop} onSelect={noop} onDragStart={noop} />),
  renderPassword: (isOpen: boolean, projectPassword: string) => root.render(
    <CensoredUnlockModal isOpen={isOpen} projectPassword={projectPassword} boardName="Fixture" onClose={noop} onUnlock={() => true} onSetProjectPassword={async () => {}} />
  ),
});
