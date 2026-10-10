'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LegalSections from '../legal';
import type { LegalSection } from '../../types/legal';

interface LegalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  sections: LegalSection[];
}

/**
 * 利用規約・プライバシーポリシーのダイアログ枠。
 * 両ダイアログで枠・タイトル・閉じるボタンを揃えるための内部部品で、公開 API には含めない。
 */
export default function LegalDialog({ open, onClose, title, sections }: LegalDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pr: 1,
        }}
      >
        {title}
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <LegalSections sections={sections} />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="contained" color="primary">
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
