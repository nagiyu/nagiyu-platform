'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import type { AlertResponse } from '../types/alert';

interface AlertDeleteConfirmDialogProps {
  open: boolean;
  alert: AlertResponse | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const OPERATOR_LABELS: Record<string, string> = {
  gte: '以上 (>=)',
  lte: '以下 (<=)',
};

const FREQUENCY_LABELS: Record<string, string> = {
  MINUTE_LEVEL: '1分間隔',
  HOURLY_LEVEL: '1時間間隔',
};

const MODE_LABELS: Record<string, string> = {
  Buy: '買い',
  Sell: '売り',
};

const getConditionText = (alert: AlertResponse): string => {
  if (alert.conditions.length === 1) {
    const condition = alert.conditions[0];
    if (!condition) {
      return '-';
    }
    return `価格 ${OPERATOR_LABELS[condition.operator] || condition.operator} ${condition.value.toLocaleString()}`;
  }

  if (alert.conditions.length === 2 && alert.logicalOperator) {
    const cond1 = alert.conditions[0];
    const cond2 = alert.conditions[1];
    if (!cond1 || !cond2) {
      return '-';
    }
    if (alert.logicalOperator === 'AND') {
      return `価格 ${cond1.value.toLocaleString()} ～ ${cond2.value.toLocaleString()}（範囲内）`;
    }
    return `価格 ${cond1.value.toLocaleString()} 以下 または ${cond2.value.toLocaleString()} 以上（範囲外）`;
  }

  return '-';
};

export default function AlertDeleteConfirmDialog({
  open,
  alert,
  submitting,
  onClose,
  onConfirm,
}: AlertDeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>アラートの削除</DialogTitle>
      <DialogContent>
        <Typography>
          以下のアラートを削除してもよろしいですか？
          <br />
          この操作は取り消せません。
        </Typography>
        {alert && (
          <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="body2">
              <strong>モード:</strong> {MODE_LABELS[alert.mode] || alert.mode}
            </Typography>
            <Typography variant="body2">
              <strong>ティッカー:</strong> {alert.symbol} - {alert.name}
            </Typography>
            <Typography variant="body2">
              <strong>条件:</strong> {getConditionText(alert)}
            </Typography>
            <Typography variant="body2">
              <strong>頻度:</strong> {FREQUENCY_LABELS[alert.frequency] || alert.frequency}
            </Typography>
            <Typography variant="body2">
              <strong>状態:</strong> {alert.enabled ? '有効' : '無効'}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button onClick={onConfirm} variant="contained" color="error" disabled={submitting}>
          {submitting ? <CircularProgress size={24} /> : '削除'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
