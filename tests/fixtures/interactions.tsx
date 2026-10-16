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
import type { ImageNode } from '../../types';
import { getVariantOrphanFiles, trashVariantFiles } from '../../services/variantDeletionService';
import { appendImageVariant, getImageVariants, selectImageVariant, removeImageVariant } from '../../utils/imageVariants';
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

// Local preview uses generated landscape swatches; all controls are the real Info component.
function makePreviewNode(): ImageNode {
  const palettes = [
    ['#bdd7dc', '#f9d9a0', '#849eaa', '#466879', '#233f50'],
    ['#cbabc6', '#f0d2b4', '#967a9e', '#605b80', '#353a59'],
    ['#95b8ba', '#e8d9ac', '#6b9992', '#3b706e', '#204949'],
    ['#e2bda5', '#ffe4aa', '#be8e87', '#855e70', '#4b405c'],
    ['#a2bdde', '#e7dbce', '#8199bf', '#526a9c', '#2e4672'],
    ['#c3c9b5', '#f4dfb3', '#98a28b', '#667969', '#3b554b'],
  ];
  const variants = palettes.map((colors, index) => {
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 640;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors[1]; ctx.beginPath(); ctx.arc(700 - index * 30, 170 + index * 8, 42, 0, Math.PI * 2); ctx.fill();
    for (let layer = 0; layer < 3; layer++) {
      ctx.fillStyle = colors[layer + 2]; ctx.beginPath(); ctx.moveTo(0, 640);
      for (let x = 0; x <= 960; x += 60) ctx.lineTo(x, 330 + layer * 90 + Math.sin(x / 150 + index + layer * 2) * (90 - layer * 15));
      ctx.lineTo(960, 640); ctx.closePath(); ctx.fill();
    }
    return { id: `preview-variant-${index}`, content: canvas.toDataURL('image/png'), width: 480, height: 320,
      createdAt: Date.now() - (palettes.length - index) * 60000, originalFileName: `landscape-${index + 1}.png`,
      generationModel: 'Gemini 3.1 Flash Image', generationModelId: 'gemini-3.1-flash-image', generationPrompt: '層疊山巒、晨光與寧靜的色彩。', generationParams: { aspectRatio: '3:2' } };
  });
  return { ...variants[0], id: 'variants-preview', type: 'image', x: 0, y: 0, rotation: 0, activeVariantId: variants[0].id, variants };
}
function VariantsPreviewFixture() {
  const [node, setNode] = React.useState(makePreviewNode);
  const [open, setOpen] = React.useState(true);
  return <main className="min-h-screen bg-gray-950 flex items-center justify-center">
    <button className="px-5 py-3 rounded-xl border border-gray-700 text-sm text-gray-300" onClick={() => setOpen(true)}>開啟圖片版本</button>
    <NodeInfoModal isOpen={open} node={node} onClose={() => setOpen(false)}
      onSelectVariant={(_, id) => setNode(previous => selectImageVariant(previous, id))}
      onDeleteVariant={(_, id) => setNode(previous => removeImageVariant(previous, id))}
      onRetryNode={() => setNode(previous => {
        const versions = getImageVariants(previous);
        return appendImageVariant(previous, { ...versions[versions.length - 1], id: crypto.randomUUID(), createdAt: Date.now() });
      })} />
  </main>;
}

function CloudVariantFixture({ initialNode }: { initialNode: ImageNode }) {
  const [image, setImage] = React.useState(initialNode);
  Object.assign(window, { cloudVariantNode: image });
  return <NodeInfoModal isOpen node={image} onClose={noop}
    getVariantDeleteFiles={(_, variantId) => getVariantOrphanFiles([image], image.id, variantId)}
    onDeleteVariant={async (_, variantId, choice) => {
      if (choice === 'trash') await trashVariantFiles([image], image.id, variantId, 'fixture-token');
      setImage(previous => removeImageVariant(previous, variantId));
    }} />;
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
  renderCloudVariants: async () => {
    await import('../../index.css');
    const sample = makePreviewNode();
    const firstId = 'drive_variant_' + 'q'.repeat(24);
    const secondId = 'drive_variant_' + 'r'.repeat(24);
    const variants = sample.variants!.slice(0, 2).map((variant, index) => ({ ...variant, content: index ? secondId : firstId, driveFileId: index ? secondId : firstId }));
    for (let index = 0; index < variants.length; index++) {
      await storeImage(variants[index].driveFileId!, await (await fetch(sample.variants![index].content)).blob());
    }
    Object.assign(window, { cloudVariantRequests: [], failCloudVariantDelete: false });
    const realFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/drive/v3/files/') && init?.method === 'PATCH') {
        (window as any).cloudVariantRequests.push({ url, body: JSON.parse(init.body as string) });
        return new Response((window as any).failCloudVariantDelete ? JSON.stringify({ error: { message: 'Fixture trash refused' } }) : '{}',
          { status: (window as any).failCloudVariantDelete ? 403 : 200 });
      }
      return realFetch(input, init);
    };
    root.render(<CloudVariantFixture key={crypto.randomUUID()} initialNode={{ ...sample, ...variants[0], id: 'cloud-fixture', variants, activeVariantId: variants[0].id }} />);
  },
  renderVariantsPreview: async () => {
    await import('../../index.css');
    root.render(<VariantsPreviewFixture />);
  },
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
    flushSync(() => root.render(<EditableImageFixture />));
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

if (new URLSearchParams(window.location.search).has('variants-preview')) (window as any).renderVariantsPreview();
