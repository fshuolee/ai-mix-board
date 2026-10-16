import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import App from '../../App';
import CanvasOverlayStack from '../../components/CanvasOverlayStack';
import CanvasNotices from '../../components/CanvasNotices';
import NodeRenderer, { nodeObjectUrlCache } from '../../components/NodeRenderer';
import { CensoredUnlockModal } from '../../components/CensoredOverlay';
import * as clipboard from '../../services/clipboardService';
import { storeImage } from '../../services/dbService';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { NodeInfoModal } from '../../components/NodeInfoModal';
import BoardTabs from '../../components/BoardTabs';
import AssetRescueModal from '../../components/AssetRescueModal';
import { type RescuableAsset } from '../../services/assetRescueService';

const rescueFixtureAssets: RescuableAsset[] = [
  { id: 'drive_good', source: 'drive', name: 'keep-choice.png', driveFileId: 'fixture-drive-good' },
  { id: 'drive_bad', source: 'drive', name: 'retry-choice.png', driveFileId: 'fixture-drive-bad' },
  { id: 'local-only', source: 'local', name: 'local-choice.png' },
];

function AssetRescueFixture() {
  const [assets, setAssets] = React.useState(rescueFixtureAssets);
  return <ConfirmProvider><AssetRescueModal isOpen onClose={noop} assets={assets} isLoading={false} onRescan={async () => {}}
    onRestore={async () => {}}
    onDiscardAssets={async selected => {
      const { discardRescuableAssets } = await import('../../services/assetRescueService');
      const result = await discardRescuableAssets(selected, 'fixture-token');
      setAssets(previous => previous.filter(asset => !result.discardedIds.includes(asset.id)));
      return result;
    }} /></ConfirmProvider>;
}

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
  renderAssetRescue: async () => {
    await import('../../index.css');
    for (const asset of rescueFixtureAssets) await storeImage(asset.driveFileId || asset.id, new Blob(['fixture-image']));
    Object.assign(window, { rescueTrashRequests: [] });
    const realFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
        (window as any).rescueTrashRequests.push({ url, method: init?.method, body: JSON.parse(String(init?.body)) });
        if ((window as any).holdRescueTrash) await new Promise(resolve => Object.assign(window, { releaseRescueTrash: resolve }));
        if (url.endsWith('fixture-drive-bad') && !(window as any).allowFailedRescue) return new Response(JSON.stringify({ error: { message: 'Fixture permission denied' } }), { status: 403 });
        return new Response('{}');
      }
      return realFetch(input, init);
    };
    root.render(<AssetRescueFixture />);
  },
  renderCanvasNotices: async () => {
    await import('../../index.css');
    root.render(<CanvasOverlayStack>
      <button className="pointer-events-auto px-3 py-2" data-model-selector>Model selection</button>
      <CanvasNotices deletingCount={3} error={'LongErrorWithoutSpaces'.repeat(12)}
        toast={{ tone: 'success', message: '已成功救回圖片節點至畫布！'.repeat(4) }} rescueCount={42} isBoardEmpty
        onRescue={() => Object.assign(window, { rescueClicked: true })}
        onDismissRescue={() => Object.assign(window, { rescueDismissed: true })}
        onDismissError={() => Object.assign(window, { errorDismissed: true })} />
    </CanvasOverlayStack>);
  },
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
