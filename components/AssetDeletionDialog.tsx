import React from 'react';
import { Trash2 } from 'lucide-react';
import type { AssetDeletionChoice, AssetDeletionFile } from '../types';
import { getLocale, t } from '../services/i18n';
import { ConfirmDialog } from './ui/ConfirmDialog';

/** Keep node and variant deletion choices together so simplifying their UI cannot remove storage choices. */
export function AssetDeletionDialog({ isOpen, files, onChoose, busy = false, busyLabel, variant = false, error }: {
  isOpen: boolean;
  files: AssetDeletionFile[];
  onChoose: (choice: AssetDeletionChoice) => void;
  busy?: boolean;
  busyLabel?: string;
  variant?: boolean;
  error?: string;
}) {
  const locale = getLocale();
  return <ConfirmDialog isOpen={isOpen}
    title={variant ? '刪除此版本？' : t('asset.orphanTitle', locale)} icon={<Trash2 />} tone="amber"
    message={error ? <span role="alert" className="text-red-300">{error}</span> : variant
      ? (files.length ? '選擇是否一併移至 Google Drive 垃圾桶。' : '共用檔案或未上傳的圖片，只移除版本。')
      : t('asset.orphanMessage', locale).replace('{count}', String(files.length))}
    details={files.map(file => file.fileName)}
    actions={[
      { key: 'keep', label: variant ? '只移除版本' : t('asset.keepInDrive', locale), variant: 'primary' },
      { key: 'trash', label: t('asset.trashInDrive', locale), variant: 'destructive', icon: <Trash2 />, disabled: !files.length },
    ]}
    busy={busy} busyLabel={busyLabel} onChoose={key => onChoose(key as AssetDeletionChoice)} />;
}
