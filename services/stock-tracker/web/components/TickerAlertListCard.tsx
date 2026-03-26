'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import type { AlertResponse } from '@/types/alert';
import AlertSettingsModal from './AlertSettingsModal';
import AlertDeleteConfirmDialog from './AlertDeleteConfirmDialog';

interface TickerAlertListCardProps {
  alerts: AlertResponse[];
  tickerId: string;
  symbol: string;
  exchangeId: string;
  loading: boolean;
  error: string;
  onChanged: () => Promise<void>;
}

const OPERATOR_LABELS: Record<string, string> = {
  gte: '以上',
  lte: '以下',
};

export default function TickerAlertListCard({
  alerts,
  tickerId,
  symbol,
  exchangeId,
  loading,
  error,
  onChanged,
}: TickerAlertListCardProps) {
  const [createTradeMode, setCreateTradeMode] = useState<'Buy' | 'Sell' | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertResponse | null>(null);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string>('');
  const [localSuccess, setLocalSuccess] = useState<string>('');

  const getBasePriceForEdit = (alert: AlertResponse): number | undefined => {
    const firstCond = alert.conditions[0];
    if (!firstCond) {
      return undefined;
    }
    if (firstCond.basePrice && firstCond.basePrice > 0) {
      return firstCond.basePrice;
    }
    if (firstCond.isPercentage === true && typeof firstCond.percentageValue === 'number') {
      const computed = firstCond.value / (1 + firstCond.percentageValue / 100);
      if (computed > 0) {
        return Math.round(computed * 100) / 100;
      }
    }
    return undefined;
  };

  const handleEditSuccess = async () => {
    setEditModalOpen(false);
    setSelectedAlert(null);
    setLocalSuccess('アラートを更新しました');
    await onChanged();
  };

  const handleCreateSuccess = async () => {
    setCreateTradeMode(null);
    setLocalSuccess('アラートを登録しました');
    await onChanged();
  };

  const handleDelete = async () => {
    if (!selectedAlert) {
      return;
    }
    setSubmitting(true);
    setLocalError('');
    try {
      const response = await fetch(`/api/alerts/${encodeURIComponent(selectedAlert.alertId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = (await response.json()) as { message?: string };
        throw new Error(errorData.message || 'アラートの削除に失敗しました');
      }
      setDeleteDialogOpen(false);
      setSelectedAlert(null);
      setLocalSuccess('アラートを削除しました');
      await onChanged();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'アラートの削除に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" component="h2">
            アラート
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              color="success"
              startIcon={<AddIcon />}
              onClick={() => setCreateTradeMode('Buy')}
              disabled={loading}
            >
              買い追加
            </Button>
            <Button
              variant="contained"
              size="small"
              color="warning"
              startIcon={<AddIcon />}
              onClick={() => setCreateTradeMode('Sell')}
              disabled={loading}
            >
              売り追加
            </Button>
          </Box>
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
        {!loading && !error && alerts.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            アラートなし
          </Typography>
        )}
        {!loading && !error && alerts.length > 0 && (
          <Stack spacing={1}>
            {alerts.map((alert) => (
              <Stack
                key={alert.alertId}
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
              >
                <Chip
                  label={alert.mode === 'Buy' ? '買い' : '売り'}
                  size="small"
                  color={alert.mode === 'Buy' ? 'success' : 'warning'}
                />
                <Typography variant="body2">
                  {alert.conditions
                    .map(
                      (condition) =>
                        `${OPERATOR_LABELS[condition.operator] ?? condition.operator} ${condition.value}`
                    )
                    .join(', ')}
                </Typography>
                <Chip label={alert.enabled ? '有効' : '無効'} size="small" variant="outlined" />
                <Button
                  variant="contained"
                  color="warning"
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => {
                    setSelectedAlert(alert);
                    setEditModalOpen(true);
                  }}
                >
                  編集
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  size="small"
                  startIcon={<DeleteIcon />}
                  onClick={() => {
                    setSelectedAlert(alert);
                    setDeleteDialogOpen(true);
                  }}
                >
                  削除
                </Button>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>

      {createTradeMode && (
        <AlertSettingsModal
          open={true}
          onClose={() => setCreateTradeMode(null)}
          onSuccess={() => void handleCreateSuccess()}
          tickerId={tickerId}
          symbol={symbol}
          exchangeId={exchangeId}
          mode="create"
          tradeMode={createTradeMode}
        />
      )}

      {selectedAlert && (
        <AlertSettingsModal
          open={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setSelectedAlert(null);
          }}
          onSuccess={() => void handleEditSuccess()}
          tickerId={selectedAlert.tickerId}
          symbol={selectedAlert.symbol}
          exchangeId={selectedAlert.tickerId.split(':')[0] || ''}
          mode="edit"
          tradeMode={selectedAlert.mode}
          editTarget={selectedAlert}
          basePrice={getBasePriceForEdit(selectedAlert)}
        />
      )}

      <AlertDeleteConfirmDialog
        open={deleteDialogOpen}
        alert={selectedAlert}
        submitting={submitting}
        onClose={() => {
          setDeleteDialogOpen(false);
          setSelectedAlert(null);
        }}
        onConfirm={() => void handleDelete()}
      />
    </Card>
  );
}
