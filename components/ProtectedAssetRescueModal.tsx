import React, { useEffect } from 'react';
import AssetRescueModal from './AssetRescueModal';
import { ConfirmProvider } from './ui/ConfirmDialog';

type Props = React.ComponentProps<typeof AssetRescueModal> & { isLocked: boolean };

/** Remove all rescue portals, including pending confirmations with file names, when access is revoked. */
export default function ProtectedAssetRescueModal({ isLocked, onClose, ...props }: Props) {
  useEffect(() => { if (isLocked) onClose(); }, [isLocked, onClose]);
  if (isLocked || !props.isOpen) return null;
  return <ConfirmProvider><AssetRescueModal {...props} onClose={onClose} /></ConfirmProvider>;
}
