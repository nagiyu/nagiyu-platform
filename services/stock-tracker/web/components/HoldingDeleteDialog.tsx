'use client';

import { Alert, Box, Typography } from '@mui/material';
import { ConfirmDialog } from '@nagiyu/ui';
import type { AlertResponse } from '../types/alert';

export interface HoldingDeleteTarget {
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currency: string;
}

export interface HoldingDeleteSellAlert {
  alertId: string;
  conditions: AlertResponse['conditions'];
}

export interface HoldingDeleteDialogProps {
  open: boolean;
  holding: HoldingDeleteTarget | null;
  /** 保有株式と一緒に削除される売りアラート。 */
  sellAlerts: HoldingDeleteSellAlert[];
  /** 削除処理の実行中。 */
  submitting: boolean;
  /** 売りアラートの取得中など、確定させてはいけない間 true にする。 */
  confirmDisabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const getOperatorLabel = (operator: string): string => {
  switch (operator) {
    case 'gte':
      return '以上';
    case 'lte':
      return '以下';
    default:
      return '条件不明';
  }
};

/**
 * 保有株式の削除確認ダイアログ。一覧画面と詳細カードの双方で同じ内容を出すために共通化している。
 */
export default function HoldingDeleteDialog({
  open,
  holding,
  sellAlerts,
  submitting,
  confirmDisabled = false,
  onClose,
  onConfirm,
}: HoldingDeleteDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      title="保有株式の削除"
      confirmDisabled={confirmDisabled}
      loading={submitting}
      onConfirm={onConfirm}
      onCancel={onClose}
    >
      <Typography>
        以下の保有株式を削除してもよろしいですか？
        <br />
        この操作は取り消せません。
      </Typography>
      {holding && (
        <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="body2">
            <strong>ティッカー:</strong> {holding.symbol}
          </Typography>
          <Typography variant="body2">
            <strong>銘柄名:</strong> {holding.name}
          </Typography>
          <Typography variant="body2">
            <strong>保有数:</strong> {holding.quantity.toLocaleString()}
          </Typography>
          <Typography variant="body2">
            <strong>平均取得価格:</strong> {holding.averagePrice.toLocaleString()}{' '}
            {holding.currency}
          </Typography>
        </Box>
      )}
      {sellAlerts.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="warning" sx={{ mb: 1 }}>
            以下の売りアラートも合わせて削除されます。
          </Alert>
          <Box sx={{ p: 2, backgroundColor: 'warning.light', borderRadius: 1 }}>
            {sellAlerts.map((sellAlert, index) => {
              const conditionLabels = sellAlert.conditions.map(
                (condition) =>
                  `価格 ${condition.value.toLocaleString()} ${getOperatorLabel(condition.operator)}`
              );

              return (
                <Typography key={sellAlert.alertId} variant="body2">
                  {index + 1}. {holding?.symbol}（{conditionLabels.join(' / ')}）
                </Typography>
              );
            })}
          </Box>
        </Box>
      )}
    </ConfirmDialog>
  );
}
