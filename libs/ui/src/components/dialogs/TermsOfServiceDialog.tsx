'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { termSections } from '../../data/termsOfServiceData';
import type { TermSection, TermContent } from '../../data/termsOfServiceData';

export interface TermsOfServiceDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;
  /**
   * Callback fired when the dialog should be closed
   */
  onClose: () => void;
}

// Re-export types for backward compatibility
export type { TermSection, TermContent };

export default function TermsOfServiceDialog({ open, onClose }: TermsOfServiceDialogProps) {
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
        利用規約
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
        {termSections.map((section, sectionIndex) => (
          <Box key={sectionIndex} sx={{ mb: 4 }}>
            <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
              第{sectionIndex + 1}条（{section.title}）
            </Typography>
            {section.contents.map((content, contentIndex) => (
              <Box key={contentIndex} sx={{ mb: 2 }}>
                <Typography variant="body1" paragraph>
                  {content.mainContent}
                </Typography>
                {content.subItems && (
                  <Box component="ol" sx={{ pl: 3, mt: 1 }}>
                    {content.subItems.map((item, itemIndex) => (
                      <Box component="li" key={itemIndex} sx={{ mb: 1 }}>
                        <Typography variant="body2">{item}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="contained" color="primary">
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
