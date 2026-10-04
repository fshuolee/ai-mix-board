import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import NodeRenderer from '../../components/NodeRenderer';
import { CensoredUnlockModal } from '../../components/CensoredOverlay';
import * as clipboard from '../../services/clipboardService';
import { storeImage } from '../../services/dbService';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { NodeInfoModal } from '../../components/NodeInfoModal';

const root = createRoot(document.getElementById('root')!);
const node = { id: 'fixture-node', x: 0, y: 0, width: 160, height: 120, rotation: 0, content: '', type: 'video' as const };
const noop = () => {};

// Expose real components and services to browser tests without Google account access.
Object.assign(window, {
  clipboard,
  storeImage,
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
