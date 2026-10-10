'use client';

import { termSections } from '../../data/termsOfServiceData';
import type { LegalSection } from '../../types/legal';
import LegalDialog from './LegalDialog';

export interface TermsOfServiceDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;
  /**
   * Callback fired when the dialog should be closed
   */
  onClose: () => void;
  /**
   * 差し替え利用規約データ（省略時はグローバル termSections を使用）
   */
  sections?: LegalSection[];
}

export default function TermsOfServiceDialog({
  open,
  onClose,
  sections,
}: TermsOfServiceDialogProps) {
  return (
    <LegalDialog
      open={open}
      onClose={onClose}
      title="利用規約"
      sections={sections ?? termSections}
    />
  );
}
