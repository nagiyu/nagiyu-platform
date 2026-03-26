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
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import type { HoldingResponse } from '@/types/holding';

const ERROR_MESSAGES = {
  CREATE_HOLDING_ERROR: '保有株式の登録に失敗しました',
  UPDATE_HOLDING_ERROR: '保有株式の更新に失敗しました',
  DELETE_HOLDING_ERROR: '保有株式の削除に失敗しました',
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
  const [localError, setLocalError] = useState<string>('');
  const [localSuccess, setLocalSuccess] = useState<string>('');
  const [formData, setFormData] = useState<HoldingFormData>({
    quantity: '',
    averagePrice: '',
    currency: 'USD',
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof HoldingFormData, string>>>({});

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
      setDeleteDialogOpen(false);
      setLocalSuccess('保有株式を削除しました');
      await onChanged();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : ERROR_MESSAGES.DELETE_HOLDING_ERROR);
    } finally {
      setSubmitting(false);
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
            disabled={loading || !!holding}
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
              <Button
                variant="contained"
                color="warning"
                size="small"
                startIcon={<EditIcon />}
                onClick={handleOpenEditModal}
              >
                編集
              </Button>
              <Button
                variant="contained"
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={() => setDeleteDialogOpen(true)}
              >
                削除
              </Button>
            </Box>
          </>
        )}
      </CardContent>

      <Dialog open={createModalOpen} onClose={() => setCreateModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>保有株式の登録</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="取引所" value={exchangeId} disabled />
            <TextField fullWidth label="ティッカー" value={symbol || tickerId} disabled />
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
            <TextField fullWidth label="ティッカー" value={symbol || tickerId} disabled />
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

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
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
                <strong>平均取得価格:</strong> {holding.averagePrice.toLocaleString()} {holding.currency}
              </Typography>
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
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={24} /> : '削除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
