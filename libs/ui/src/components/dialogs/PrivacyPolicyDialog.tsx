'use client';

import { privacyPolicySections } from '../../data/privacyPolicyData';
import type { LegalSection } from '../../types/legal';
import LegalDialog from './LegalDialog';

export interface PrivacyPolicyDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;
  /**
   * Callback fired when the dialog should be closed
   */
  onClose: () => void;
  /**
   * 差し替えプライバシーポリシーデータ（省略時はグローバル privacyPolicySections を使用）
   */
  sections?: LegalSection[];
}

export default function PrivacyPolicyDialog({ open, onClose, sections }: PrivacyPolicyDialogProps) {
  return (
    <LegalDialog
      open={open}
      onClose={onClose}
      title="プライバシーポリシー"
      sections={sections ?? privacyPolicySections}
    />
  );
}
