'use client';

import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
} from '@mui/material';

/**
 * 通知許可ダイアログコンポーネント
 */
interface NotificationPermissionDialogProps {
  open: boolean;
  isSubscribed: boolean;
  onClose: () => void;
  onRequestPermission: () => void;
}

export default function NotificationPermissionDialog({
  open,
  isSubscribed,
  onClose,
  onRequestPermission,
}: NotificationPermissionDialogProps) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>バッチ完了通知</DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          マイリスト登録バッチが完了したときに通知を受け取ることができます。
        </Typography>
        {isSubscribed ? (
          <Typography variant="body2" color="success.main" sx={{ mt: 2 }}>
            ✓ 通知は既に有効になっています
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            通知を有効にするには、ブラウザの許可が必要です。
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>キャンセル</Button>
        {!isSubscribed && (
          <Button onClick={onRequestPermission} variant="contained">
            通知を有効にする
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
