'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { Button, Link } from '@nagiyu/ui';
import type { SafetyResource } from '@nagiyu/livetalk-core';

export interface SafetyModalProps {
  open: boolean;
  resources: SafetyResource[];
  onClose: () => void;
}

/**
 * セーフティ介入モーダル（Phase 2d / Issue #3250）。
 *
 * 自殺・自傷・希死念慮を示す発言を検出した場合、または AI 応答が Moderation で
 * フラグされた場合に表示される。
 *
 * - キャラ（桃瀬ひより）の口調で心配を伝えるメッセージは chat-usecase 側で
 *   テキスト/音声として送出済み。このモーダルはリソース案内専用。
 * - 閉じるボタンで通常会話に戻れる（リソースを確認した上で）。
 *
 * @see docs/services/livetalk/external-design.md SCR-008
 */
export default function SafetyModal({ open, resources, onClose }: SafetyModalProps) {
  const emergencyResource = resources.find((r) => r.phone === '119');
  const otherResources = resources.filter((r) => r.phone !== '119');

  return (
    <Dialog open={open} fullWidth maxWidth="sm" aria-labelledby="safety-modal-title">
      <DialogTitle id="safety-modal-title" sx={{ pb: 1 }}>
        相談できる場所があるよ
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          一人で抱え込まないで。話を聞いてくれる専門家がいるから、連絡してみてね。
        </Typography>

        <List disablePadding sx={{ mb: 2 }}>
          {otherResources.map((resource) => (
            <ListItem key={resource.name} disablePadding sx={{ mb: 1 }}>
              <Box
                sx={{
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1.5,
                  width: '100%',
                }}
              >
                <ListItemText
                  primary={
                    <Typography variant="subtitle2" component="span">
                      {resource.name}
                    </Typography>
                  }
                  secondary={
                    <Box component="span" sx={{ display: 'block' }}>
                      <Typography variant="body2" component="span" color="text.secondary">
                        {resource.description}
                      </Typography>
                      <Typography
                        variant="body2"
                        component="span"
                        sx={{ display: 'block', fontWeight: 'bold', mt: 0.5 }}
                      >
                        📞{' '}
                        <Link href={`tel:${resource.phone}`} data-testid={`tel-${resource.name}`}>
                          {resource.phone}
                        </Link>
                      </Typography>
                      {resource.url && (
                        <Typography variant="body2" component="span" sx={{ display: 'block' }}>
                          <Link
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`url-${resource.name}`}
                          >
                            詳細はこちら
                          </Link>
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </Box>
            </ListItem>
          ))}
        </List>

        {emergencyResource && (
          <Box
            sx={{
              bgcolor: 'error.light',
              color: 'error.contrastText',
              p: 2,
              borderRadius: 1,
              textAlign: 'center',
            }}
            data-testid="emergency-box"
          >
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {emergencyResource.name}
            </Typography>
            <Typography variant="body2">{emergencyResource.description}</Typography>
            <Typography variant="h6" component="div" sx={{ mt: 0.5, fontWeight: 'bold' }}>
              <Link href={`tel:${emergencyResource.phone}`} data-testid="emergency-tel">
                {emergencyResource.phone}
              </Link>
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button
          variant="outline"
          color="primary"
          onClick={onClose}
          data-testid="safety-modal-close"
        >
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
