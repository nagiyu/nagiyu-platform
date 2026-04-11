'use client';

import { type MouseEvent, useState } from 'react';
import {
  Checkbox,
  FormControlLabel,
  FormGroup,
  IconButton,
  Paper,
  Popover,
  Tooltip,
} from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import type { ColumnDefinition } from '../../constants/highlightTableColumns';
import type { ColumnVisibilityMap } from '../../hooks/useColumnVisibility';

type ColumnVisibilityButtonProps = {
  /** オプション列（固定列を除いた列定義の配列） */
  columns: ColumnDefinition[];
  /** 各列の現在の表示状態（id → boolean のマップ） */
  visibilityMap: ColumnVisibilityMap;
  /** 列の表示状態をトグルするコールバック関数 */
  onToggle: (id: string) => void;
};

/**
 * 列表示切り替えボタン + ポップオーバーコンポーネント
 *
 * アイコンボタンをクリックするとポップオーバーが開き、
 * オプション列のチェックボックスリストを表示する。
 * チェック変更時にコールバックを呼び出す。
 * ポップオーバー外クリックで閉じる。
 */
export function ColumnVisibilityButton({
  columns,
  visibilityMap,
  onToggle,
}: ColumnVisibilityButtonProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title="列設定">
        <IconButton size="small" onClick={handleOpen} aria-label="列設定">
          <ViewColumnIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Paper sx={{ p: 1 }}>
          <FormGroup>
            {columns.map((col) => (
              <FormControlLabel
                key={col.id}
                control={
                  <Checkbox
                    size="small"
                    checked={visibilityMap[col.id] ?? false}
                    onChange={() => onToggle(col.id)}
                  />
                }
                label={col.label}
              />
            ))}
          </FormGroup>
        </Paper>
      </Popover>
    </>
  );
}
