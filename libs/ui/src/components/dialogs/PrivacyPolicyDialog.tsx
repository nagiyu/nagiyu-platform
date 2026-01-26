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
  Link,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { privacyPolicySections } from '../../data/privacyPolicyData';
import type { PolicySection, PolicySubContent, PolicyContent } from '../../data/privacyPolicyData';

export interface PrivacyPolicyDialogProps {
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
export type { PolicySection, PolicySubContent, PolicyContent };

export default function PrivacyPolicyDialog({ open, onClose }: PrivacyPolicyDialogProps) {
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
        プライバシーポリシー
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
        {privacyPolicySections.map((section, sectionIndex) => (
          <Box key={sectionIndex} sx={{ mb: 4 }}>
            <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
              第{sectionIndex + 1}条（{section.title}）
            </Typography>
            {section.contents.map((content, contentIndex) => (
              <Box key={contentIndex} sx={{ mb: 2 }}>
                <Typography variant="body1" paragraph>
                  {content.mainContent}
                </Typography>
                {content.subContents && (
                  <Box component="ol" sx={{ pl: 3, mt: 1 }}>
                    {content.subContents.map((subContent, subIndex) => (
                      <Box component="li" key={subIndex} sx={{ mb: 1 }}>
                        <Typography variant="body2">{subContent.subContent}</Typography>
                        {subContent.subItems && (
                          <Box component="ol" sx={{ pl: 2, mt: 0.5 }}>
                            {subContent.subItems.map((item, itemIndex) => (
                              <Box component="li" key={itemIndex} sx={{ mb: 0.5 }}>
                                <Typography variant="body2">{item}</Typography>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
                {content.link && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    <Link href={content.link} target="_blank" rel="noopener noreferrer">
                      {content.link}
                    </Link>
                  </Typography>
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
