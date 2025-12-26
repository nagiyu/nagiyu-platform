'use client';

import { useState, useEffect } from 'react';
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
import { getItem, setItem } from '@nagiyu/browser';

const STORAGE_KEY = 'tools-migration-dialog-shown';

export default function MigrationDialog() {
  // 初期表示状態は常にfalse（SSR/ハイドレーション対応）
  const [open, setOpen] = useState<boolean>(false);
  const [dontShowAgain, setDontShowAgain] = useState<boolean>(true);

  // クライアントサイドでLocalStorageをチェックしてダイアログの表示状態を更新
  useEffect(() => {
    // LocalStorageチェックを次のレンダリングサイクルまで遅延
    const timer = setTimeout(() => {
      try {
        const hasShown = getItem(STORAGE_KEY);
        // フラグが存在しない場合のみダイアログを表示
        if (!hasShown) {
          setOpen(true);
        }
      } catch (error) {
        console.error(
          '[MigrationDialog] Failed to read migration dialog flag from localStorage:',
          error
        );
        // LocalStorageアクセスエラーの場合でもダイアログを表示
        // (初回訪問の可能性が高いため、安全側に倒す)
        setOpen(true);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    // 「今後表示しない」がONの場合のみLocalStorageに保存
    if (dontShowAgain) {
      try {
        setItem(STORAGE_KEY, 'true');
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
