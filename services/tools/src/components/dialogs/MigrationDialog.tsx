'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  Typography,
} from '@mui/material';

const STORAGE_KEY = 'tools-migration-dialog-shown';

export default function MigrationDialog() {
  // 初期表示状態を計算（SSR時はfalse）
  const [open, setOpen] = useState<boolean>(() => {
    // SSR時はlocalStorageが存在しないためfalse
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const hasShown = localStorage.getItem(STORAGE_KEY);
      // フラグが存在しない場合のみダイアログを表示
      return !hasShown;
    } catch (error) {
      console.error('Failed to read migration dialog flag from localStorage:', error);
      // LocalStorageアクセスエラーの場合は表示しない（プライベートモード等）
      return false;
    }
  });
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(true);

  const handleClose = () => {
    // 「今後表示しない」がONの場合のみLocalStorageに保存
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch (error) {
        console.error('Failed to save migration dialog flag to localStorage:', error);
        // 保存エラーは無視（プライベートモード等）
      }
    }
    setOpen(false);
  };

  // 背景クリックを無効化するため、onCloseを制御
  const handleBackdropClick = (_event: object, reason: 'backdropClick' | 'escapeKeyDown') => {
    // 背景クリックやESCキーでは閉じない
    if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
      return;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleBackdropClick}
      disableEscapeKeyDown={true}
      aria-labelledby="migration-dialog-title"
      aria-describedby="migration-dialog-description"
    >
      <DialogTitle id="migration-dialog-title">Toolsアプリが新しくなりました</DialogTitle>
      <DialogContent id="migration-dialog-description">
        <Typography variant="body1" paragraph>
          このアプリは以前のバージョンから大幅にアップデートされました。
        </Typography>
        <Typography variant="body1" paragraph>
          以前のバージョンをインストールされている方は、お手数ですが以下の手順で再インストールをお願いします。
        </Typography>
        <Typography variant="body1" component="div" paragraph>
          <ol style={{ paddingLeft: '1.5rem', margin: 0 }}>
            <li>旧バージョンのアプリをアンインストール</li>
            <li>このページから新バージョンを再インストール</li>
          </ol>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          ※ データはすべて端末内に保存されており、外部に送信されることはありません。
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 3, pb: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
          }
          label="今後表示しない"
        />
        <Button onClick={handleClose} variant="contained" fullWidth>
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
