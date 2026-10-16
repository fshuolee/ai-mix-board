import React from 'react';

/** Keep canvas notices in normal flow below the chrome, so simultaneous or wrapped notices never overlap. */
const CanvasOverlayStack: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div className="canvas-overlay-stack" onPointerDown={event => event.stopPropagation()}>
    {children}
  </div>
);

export default CanvasOverlayStack;
