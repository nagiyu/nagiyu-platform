'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  IconButton,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import type { HoldingResponse } from '@/types/holding';
import type { AlertResponse } from '@/types/alert';

const ERROR_MESSAGES = {
  CREATE_HOLDING_ERROR: '保有株式の登録に失敗しました',
  UPDATE_HOLDING_ERROR: '保有株式の更新に失敗しました',
  DELETE_HOLDING_ERROR: '保有株式の削除に失敗しました',
  FETCH_SELL_ALERTS_ERROR: '売りアラート情報の取得に失敗しました',
  DELETE_SELL_ALERT_ERROR: '売りアラートの削除に失敗しました',
  DELETE_SELL_ALERT_PARTIAL_ERROR:
    '保有株式は削除しましたが、一部の売りアラートの削除に失敗しました',
  FETCH_SELL_ALERTS_LOG: '削除対象の売りアラート取得中にエラーが発生しました',
  REQUIRED_FIELD: 'この項目は必須です',
  INVALID_QUANTITY: '保有数は0.0001以上、1,000,000,000以下で入力してください',
  INVALID_AVERAGE_PRICE: '平均取得価格は0.01以上、1,000,000以下で入力してください',
} as const;

type HoldingFormData = {
  quantity: string;
  averagePrice: string;
  currency: string;
};

const CURRENCIES = ['USD', 'JPY', 'EUR', 'GBP'] as const;

interface HoldingCardProps {
  holding: HoldingResponse | null;
  tickerId: string;
  symbol: string;
  exchangeId: string;
  loading: boolean;
  error: string;
  onChanged: () => Promise<void>;
}

export default function HoldingCard({
  holding,
  tickerId,
  symbol,
  exchangeId,
  loading,
  error,
  onChanged,
}: HoldingCardProps) {
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [deleteDialogLoading, setDeleteDialogLoading] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string>('');
  const [localSuccess, setLocalSuccess] = useState<string>('');
  const [pendingSellAlerts, setPendingSellAlerts] = useState<
    Array<Pick<AlertResponse, 'alertId' | 'conditions'>>
  >([]);
  const [formData, setFormData] = useState<HoldingFormData>({
    quantity: '',
    averagePrice: '',
    currency: 'USD',
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof HoldingFormData, string>>>({});
  const canAddHolding = !loading && !holding;
  const displaySymbol = symbol || tickerId;

  const validateForm = (): boolean => {
    const nextErrors: Partial<Record<keyof HoldingFormData, string>> = {};

    if (!formData.quantity) {
      nextErrors.quantity = ERROR_MESSAGES.REQUIRED_FIELD;
    } else {
      const quantity = Number(formData.quantity);
      if (!Number.isFinite(quantity) || quantity < 0.0001 || quantity > 1_000_000_000) {
        nextErrors.quantity = ERROR_MESSAGES.INVALID_QUANTITY;
      }
    }

    if (!formData.averagePrice) {
      nextErrors.averagePrice = ERROR_MESSAGES.REQUIRED_FIELD;
    } else {
      const averagePrice = Number(formData.averagePrice);
      if (!Number.isFinite(averagePrice) || averagePrice < 0.01 || averagePrice > 1_000_000) {
        nextErrors.averagePrice = ERROR_MESSAGES.INVALID_AVERAGE_PRICE;
      }
    }

    if (!formData.currency) {
      nextErrors.currency = ERROR_MESSAGES.REQUIRED_FIELD;
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleOpenCreateModal = () => {
    setLocalError('');
    setLocalSuccess('');
    setFormErrors({});
    setFormData({
      quantity: '',
      averagePrice: '',
      currency: 'USD',
    });
    setCreateModalOpen(true);
  };

  const handleOpenEditModal = () => {
    if (!holding) {
      return;
    }
    setLocalError('');
    setLocalSuccess('');
    setFormErrors({});
    setFormData({
      quantity: String(holding.quantity),
      averagePrice: String(holding.averagePrice),
      currency: holding.currency,
    });
    setEditModalOpen(true);
  };

  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }
    setSubmitting(true);
    setLocalError('');
    try {
      const response = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tickerId,
          exchangeId,
          quantity: Number(formData.quantity),
          averagePrice: Number(formData.averagePrice),
          currency: formData.currency,
        }),
      });
      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || ERROR_MESSAGES.CREATE_HOLDING_ERROR);
      }
      setCreateModalOpen(false);
      setLocalSuccess('保有株式を登録しました');
      await onChanged();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : ERROR_MESSAGES.CREATE_HOLDING_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!holding || !validateForm()) {
      return;
    }
    setSubmitting(true);
    setLocalError('');
    try {
      const response = await fetch(`/api/holdings/${encodeURIComponent(holding.holdingId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: Number(formData.quantity),
          averagePrice: Number(formData.averagePrice),
          currency: formData.currency,
        }),
      });
      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || ERROR_MESSAGES.UPDATE_HOLDING_ERROR);
      }
      setEditModalOpen(false);
      setLocalSuccess('保有株式を更新しました');
      await onChanged();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : ERROR_MESSAGES.UPDATE_HOLDING_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!holding) {
      return;
    }
    setSubmitting(true);
    setLocalError('');
    try {
      const response = await fetch(`/api/holdings/${encodeURIComponent(holding.holdingId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || ERROR_MESSAGES.DELETE_HOLDING_ERROR);
      }

      const sellAlertDeleteResults = await Promise.allSettled(
        pendingSellAlerts.map(async (sellAlert) => {
          const alertDeleteResponse = await fetch(
            `/api/alerts/${encodeURIComponent(sellAlert.alertId)}`,
            {
              method: 'DELETE',
            }
          );
          if (!alertDeleteResponse.ok) {
            throw new Error(sellAlert.alertId);
          }
        })
      );

      const sellAlertDeleteFailed = sellAlertDeleteResults.some((result) => {
        if (result.status === 'rejected') {
          console.error(ERROR_MESSAGES.DELETE_SELL_ALERT_ERROR, result.reason);
          return true;
        }
        return false;
      });

      setDeleteDialogOpen(false);
      setPendingSellAlerts([]);
      if (sellAlertDeleteFailed) {
        setLocalError(ERROR_MESSAGES.DELETE_SELL_ALERT_PARTIAL_ERROR);
      } else {
        setLocalSuccess('保有株式を削除しました');
      }
      await onChanged();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : ERROR_MESSAGES.DELETE_HOLDING_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const getOperatorLabel = (operator: string): string => {
    if (operator === 'gte') {
      return '以上';
    }
    if (operator === 'lte') {
      return '以下';
    }
    return operator;
  };

  const handleOpenDeleteDialog = async () => {
    if (!holding) {
      return;
    }

    setDeleteDialogLoading(true);
    setLocalError('');
    try {
      const response = await fetch('/api/alerts');
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_SELL_ALERTS_ERROR);
      }

      const data = (await response.json()) as { alerts?: AlertResponse[] };
      const sellAlerts = (data.alerts ?? [])
        .filter((alert) => alert.tickerId === holding.tickerId && alert.mode === 'Sell')
        .map((alert) => ({
          alertId: alert.alertId,
          conditions: alert.conditions,
        }));
      setPendingSellAlerts(sellAlerts);
    } catch (e) {
      console.error(ERROR_MESSAGES.FETCH_SELL_ALERTS_LOG, e);
      setLocalError(ERROR_MESSAGES.FETCH_SELL_ALERTS_ERROR);
      setPendingSellAlerts([]);
    } finally {
      setDeleteDialogLoading(false);
      setDeleteDialogOpen(true);
    }
  };

  const handleFormChange = (field: keyof HoldingFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" component="h2">
            保有株式
          </Typography>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleOpenCreateModal}
            disabled={!canAddHolding}
          >
            追加
          </Button>
        </Stack>
        {localError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError('')}>
            {localError}
          </Alert>
        )}
        {localSuccess && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setLocalSuccess('')}>
            {localSuccess}
          </Alert>
        )}
        {loading && <CircularProgress size={24} />}
        {!loading && error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
        {!loading && !error && !holding && (
          <Typography variant="body2" color="text.secondary">
            保有なし
          </Typography>
        )}
        {!loading && !error && holding && (
          <>
            <Typography variant="body2">保有数量: {holding.quantity.toLocaleString()}</Typography>
            <Typography variant="body2">
              平均取得価格: {holding.averagePrice.toLocaleString()}
            </Typography>
            <Typography variant="body2">通貨: {holding.currency}</Typography>
            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
              <Tooltip title="編集">
                <IconButton
                  size="small"
                  color="warning"
                  aria-label="編集"
                  sx={{ border: (theme) => `1px solid ${theme.palette.warning.main}` }}
                  onClick={handleOpenEditModal}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="削除">
                <IconButton
                  size="small"
                  color="error"
                  aria-label="削除"
                  sx={{ border: (theme) => `1px solid ${theme.palette.error.main}` }}
                  onClick={() => void handleOpenDeleteDialog()}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        )}
      </CardContent>

      <Dialog
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>保有株式の登録</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="取引所" value={exchangeId} disabled />
            <TextField fullWidth label="ティッカー" value={displaySymbol} disabled />
            <TextField
              fullWidth
              label="保有数"
              type="number"
              value={formData.quantity}
              onChange={(e) => handleFormChange('quantity', e.target.value)}
              error={!!formErrors.quantity}
              helperText={formErrors.quantity}
              inputProps={{ step: '0.0001', min: '0.0001', max: '1000000000' }}
            />
            <TextField
              fullWidth
              label="平均取得価格"
              type="number"
              value={formData.averagePrice}
              onChange={(e) => handleFormChange('averagePrice', e.target.value)}
              error={!!formErrors.averagePrice}
              helperText={formErrors.averagePrice}
              inputProps={{ step: '0.01', min: '0.01', max: '1000000' }}
            />
            <FormControl fullWidth error={!!formErrors.currency}>
              <InputLabel id="holding-create-currency-label">通貨</InputLabel>
              <Select
                labelId="holding-create-currency-label"
                value={formData.currency}
                label="通貨"
                onChange={(e) => handleFormChange('currency', e.target.value)}
              >
                {CURRENCIES.map((currency) => (
                  <MenuItem key={currency} value={currency}>
                    {currency}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateModalOpen(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button onClick={() => void handleCreate()} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editModalOpen} onClose={() => setEditModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>保有株式の編集</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="取引所" value={exchangeId} disabled />
            <TextField fullWidth label="ティッカー" value={displaySymbol} disabled />
            <TextField
              fullWidth
              label="保有数"
              type="number"
              value={formData.quantity}
              onChange={(e) => handleFormChange('quantity', e.target.value)}
              error={!!formErrors.quantity}
              helperText={formErrors.quantity}
              inputProps={{ step: '0.0001', min: '0.0001', max: '1000000000' }}
            />
            <TextField
              fullWidth
              label="平均取得価格"
              type="number"
              value={formData.averagePrice}
              onChange={(e) => handleFormChange('averagePrice', e.target.value)}
              error={!!formErrors.averagePrice}
              helperText={formErrors.averagePrice}
              inputProps={{ step: '0.01', min: '0.01', max: '1000000' }}
            />
            <TextField fullWidth label="通貨" value={formData.currency} disabled />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditModalOpen(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button onClick={() => void handleUpdate()} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>保有株式の削除</DialogTitle>
        <DialogContent>
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
          {pendingSellAlerts.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="warning" sx={{ mb: 1 }}>
                以下の売りアラートも合わせて削除されます。
              </Alert>
              <Box sx={{ p: 2, backgroundColor: 'warning.light', borderRadius: 1 }}>
                {pendingSellAlerts.map((sellAlert, index) => {
                  const conditionLabels = sellAlert.conditions.map((condition) => {
                    const operatorLabel = getOperatorLabel(condition.operator);
                    return `価格 ${condition.value.toLocaleString()} ${operatorLabel}`;
                  });

                  return (
                    <Typography key={sellAlert.alertId} variant="body2">
                      {index + 1}. {holding?.symbol}（{conditionLabels.join(' / ')}）
                    </Typography>
                  );
                })}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            onClick={() => void handleDelete()}
            variant="contained"
            color="error"
            disabled={submitting || deleteDialogLoading}
          >
            {submitting ? <CircularProgress size={24} /> : '削除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
