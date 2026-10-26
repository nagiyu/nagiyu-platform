'use client';

import { useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, Box } from '@mui/material';
import { Button, TextField } from '@nagiyu/ui';
import { useEnterSubmit } from '@nagiyu/react';

type CreateItemDialogProps = {
  open: boolean;
  title: string;
  label: string;
  /** 開くたびに入力欄へ入れる値。名前変更で現在名を見せるときに使う。 */
  initialValue?: string;
  /** 確定ボタンの文言。 */
  submitLabel?: string;
  onClose: () => void;
  onCreate: (name: string) => void;
};

export function CreateItemDialog({
  open,
  title,
  label,
  initialValue = '',
  submitLabel = '作成',
  onClose,
  onCreate,
}: CreateItemDialogProps) {
  const [name, setName] = useState(initialValue);
  const [wasOpen, setWasOpen] = useState(open);

  // 閉じても親が同じインスタンスを使い回すため、開くたびに初期値へ戻す。
  // effect で戻すと、開いた直後の 1 フレームだけ前回の入力が見えてしまう。
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initialValue);
    }
  }

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName(initialValue);
    onClose();
  };

  // 名前入力でエンターキーを押したときに作成を実行するハンドラ
  // TextField の onKeyDown は HTMLInputElement | HTMLTextAreaElement 型を受け取るため型引数を明示する
  const handleNameEnterDown = useEnterSubmit<HTMLInputElement | HTMLTextAreaElement>(handleCreate, {
    disabled: !name.trim(),
  });

  const handleClose = () => {
    setName(initialValue);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <TextField
            autoFocus
            fullWidth
            label={label}
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="sm"
            onKeyDown={handleNameEnterDown}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} variant="ghost">
          キャンセル
        </Button>
        <Button onClick={handleCreate} variant="solid" disabled={!name.trim()}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
