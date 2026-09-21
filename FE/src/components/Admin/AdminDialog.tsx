import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import shared from '../../pages/Admin/admin-shared.module.css';

interface AdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  busy?: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}

/** Form dialog used across the admin pages, styled with the shared admin dialog classes. */
export const AdminDialog: React.FC<AdminDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  busy = false,
  submitDisabled = false,
  onSubmit,
  children,
}) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className={shared.dialogOverlay} />
      <Dialog.Content className={shared.dialogContent}>
        <Dialog.Title className={shared.dialogTitle}>{title}</Dialog.Title>
        <Dialog.Description className={shared.dialogDescription}>{description ?? ' '}</Dialog.Description>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className={shared.formGrid}>{children}</div>
          <div className={shared.dialogActions}>
            <Dialog.Close asChild>
              <button type="button" className="btn-outline">Hủy</button>
            </Dialog.Close>
            <button type="submit" className="btn-neon-orange" disabled={busy || submitDisabled}>
              {busy ? 'Đang xử lý...' : submitLabel}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);
