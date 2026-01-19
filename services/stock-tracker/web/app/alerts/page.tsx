'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Button,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useRouter, useSearchParams } from 'next/navigation';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_ALERTS_ERROR: 'アラート一覧の取得に失敗しました',
  UPDATE_ALERT_ERROR: 'アラートの更新に失敗しました',
  DELETE_ALERT_ERROR: 'アラートの削除に失敗しました',
  INVALID_CONDITION_VALUE: '目標価格は0.01以上、1,000,000以下で入力してください',
  REQUIRED_FIELD: 'この項目は必須です',
} as const;

// 成功メッセージ定数
const SUCCESS_MESSAGES = {
  UPDATE_SUCCESS: 'アラートを更新しました',
  DELETE_SUCCESS: 'アラートを削除しました',
} as const;

// API レスポンス型定義
interface AlertResponse {
  alertId: string;
  tickerId: string;
  symbol: string;
  name: string;
  mode: string;
  frequency: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: number;
  }>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// フォームデータ型
interface AlertFormData {
  conditionValue: string;
  enabled: boolean;
}

// 初期フォームデータ
const INITIAL_FORM_DATA: AlertFormData = {
  conditionValue: '',
  enabled: true,
};

// 演算子のラベル
const OPERATOR_LABELS: Record<string, string> = {
  gte: '以上 (>=)',
  lte: '以下 (<=)',
};

// 頻度のラベル
const FREQUENCY_LABELS: Record<string, string> = {
  MINUTE_LEVEL: '1分間隔',
  HOURLY_LEVEL: '1時間間隔',
};

// モードのラベル
const MODE_LABELS: Record<string, string> = {
  Buy: '買い',
  Sell: '売り',
};

export default function AlertsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // データ状態
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);

  // ローディング状態
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // エラー状態
  const [error, setError] = useState<string>('');

  // 成功メッセージ
  const [successMessage, setSuccessMessage] = useState<string>('');

  // モーダル状態
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);

  // フォームデータ
  const [formData, setFormData] = useState<AlertFormData>(INITIAL_FORM_DATA);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof AlertFormData, string>>>({});

  // 編集対象・削除対象
  const [selectedAlert, setSelectedAlert] = useState<AlertResponse | null>(null);

  // アラート一覧を取得
  useEffect(() => {
    fetchAlerts();
  }, []);

  // クエリパラメータによる自動モーダル表示
  // Note: Task 3.13でアラート設定モーダルを実装予定
  useEffect(() => {
    const ticker = searchParams.get('ticker');
    const mode = searchParams.get('mode');
    const openModal = searchParams.get('openModal');

    // アラート設定モーダルは Task 3.13 で実装予定
    // 現時点では何もしない（クエリパラメータは保持される）
    if (ticker && mode && openModal === 'true') {
      // TODO: Task 3.13 - アラート設定モーダルを開く処理を実装
    }
  }, [searchParams]);

  // アラート一覧を取得
  const fetchAlerts = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/alerts');
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_ALERTS_ERROR);
      }

      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError(ERROR_MESSAGES.FETCH_ALERTS_ERROR);
    } finally {
      setLoading(false);
    }
  };

  // フォームのバリデーション
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof AlertFormData, string>> = {};

    if (!formData.conditionValue) {
      errors.conditionValue = ERROR_MESSAGES.REQUIRED_FIELD;
    } else {
      const value = parseFloat(formData.conditionValue);
      if (isNaN(value) || value < 0.01 || value > 1000000) {
        errors.conditionValue = ERROR_MESSAGES.INVALID_CONDITION_VALUE;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 編集モーダルを開く
  const handleOpenEditModal = (alert: AlertResponse) => {
    setSelectedAlert(alert);
    setFormData({
      conditionValue: alert.conditions[0]?.value.toString() || '',
      enabled: alert.enabled,
    });
    setFormErrors({});
    setEditModalOpen(true);
  };

  // 編集モーダルを閉じる
  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setSelectedAlert(null);
    setFormData(INITIAL_FORM_DATA);
    setFormErrors({});
  };

  // 削除確認ダイアログを開く
  const handleOpenDeleteDialog = (alert: AlertResponse) => {
    setSelectedAlert(alert);
    setDeleteDialogOpen(true);
  };

  // 削除確認ダイアログを閉じる
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setSelectedAlert(null);
  };

  // フォーム入力ハンドラー
  const handleFormChange = (field: keyof AlertFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // エラーをクリア
    if (formErrors[field]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // アラートを更新
  const handleUpdate = async () => {
    if (!selectedAlert || !validateForm()) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/alerts/${encodeURIComponent(selectedAlert.alertId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conditions: [
            {
              value: parseFloat(formData.conditionValue),
            },
          ],
          enabled: formData.enabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.UPDATE_ALERT_ERROR);
      }

      setSuccessMessage(SUCCESS_MESSAGES.UPDATE_SUCCESS);
      handleCloseEditModal();
      await fetchAlerts();

      // 成功メッセージを3秒後に消す
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (err) {
      console.error('Error updating alert:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.UPDATE_ALERT_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  // アラートを削除
  const handleDelete = async () => {
    if (!selectedAlert) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/alerts/${encodeURIComponent(selectedAlert.alertId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.DELETE_ALERT_ERROR);
      }

      setSuccessMessage(SUCCESS_MESSAGES.DELETE_SUCCESS);
      handleCloseDeleteDialog();
      await fetchAlerts();

      // 成功メッセージを3秒後に消す
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (err) {
      console.error('Error deleting alert:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.DELETE_ALERT_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* エラーメッセージ表示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* 成功メッセージ表示 */}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      {/* ヘッダー */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => router.back()} variant="outlined">
            戻る
          </Button>
          <Typography variant="h5" component="h1" fontWeight="bold">
            アラート管理
          </Typography>
        </Box>
      </Box>

      {/* アラート一覧タイトル */}
      <Typography variant="h6" component="h2" fontWeight="bold" sx={{ mb: 2 }}>
        アラート一覧
      </Typography>

      {/* ローディング表示 */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        // アラート一覧テーブル
        <TableContainer component={Paper} elevation={2}>
          <Table sx={{ minWidth: 650 }} aria-label="アラート一覧">
            <TableHead sx={{ backgroundColor: 'primary.main' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>モード</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>取引所</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>ティッカー</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>条件</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>頻度</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">
                  状態
                </TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                    アラートがありません
                  </TableCell>
                </TableRow>
              ) : (
                alerts.map((alert) => {
                  const condition = alert.conditions[0];
                  const conditionText = condition
                    ? `価格 ${OPERATOR_LABELS[condition.operator] || condition.operator} ${condition.value.toLocaleString()}`
                    : '-';

                  return (
                    <TableRow key={alert.alertId} hover>
                      <TableCell>
                        <Chip
                          label={MODE_LABELS[alert.mode] || alert.mode}
                          color={alert.mode === 'Buy' ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{alert.tickerId.split(':')[0] || '-'}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {alert.symbol}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {alert.name}
                        </Typography>
                      </TableCell>
                      <TableCell>{conditionText}</TableCell>
                      <TableCell>{FREQUENCY_LABELS[alert.frequency] || alert.frequency}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={alert.enabled ? '有効' : '無効'}
                          color={alert.enabled ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                          <Button
                            variant="contained"
                            color="warning"
                            size="small"
                            startIcon={<EditIcon />}
                            onClick={() => handleOpenEditModal(alert)}
                          >
                            編集
                          </Button>
                          <Button
                            variant="contained"
                            color="error"
                            size="small"
                            startIcon={<DeleteIcon />}
                            onClick={() => handleOpenDeleteDialog(alert)}
                          >
                            削除
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* 編集モーダル */}
      <Dialog open={editModalOpen} onClose={handleCloseEditModal} maxWidth="sm" fullWidth>
        <DialogTitle>アラートの編集</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* モード（表示のみ） */}
            <TextField
              fullWidth
              label="モード"
              value={selectedAlert ? MODE_LABELS[selectedAlert.mode] || selectedAlert.mode : ''}
              disabled
              InputProps={{ readOnly: true }}
            />

            {/* ティッカー（表示のみ） */}
            <TextField
              fullWidth
              label="ティッカー"
              value={selectedAlert ? `${selectedAlert.symbol} - ${selectedAlert.name}` : ''}
              disabled
              InputProps={{ readOnly: true }}
            />

            {/* 演算子（表示のみ） */}
            <TextField
              fullWidth
              label="条件"
              value={
                selectedAlert?.conditions[0]
                  ? `価格 ${OPERATOR_LABELS[selectedAlert.conditions[0].operator] || selectedAlert.conditions[0].operator}`
                  : ''
              }
              disabled
              InputProps={{ readOnly: true }}
            />

            {/* 目標価格（編集可能） */}
            <TextField
              fullWidth
              id="edit-condition-value"
              label="目標価格"
              type="number"
              value={formData.conditionValue}
              onChange={(e) => handleFormChange('conditionValue', e.target.value)}
              error={!!formErrors.conditionValue}
              helperText={formErrors.conditionValue}
              inputProps={{ step: '0.01', min: '0.01', max: '1000000' }}
            />

            {/* 頻度（表示のみ） */}
            <TextField
              fullWidth
              label="通知頻度"
              value={
                selectedAlert
                  ? FREQUENCY_LABELS[selectedAlert.frequency] || selectedAlert.frequency
                  : ''
              }
              disabled
              InputProps={{ readOnly: true }}
            />

            {/* 有効/無効（編集可能） */}
            <FormControlLabel
              control={
                <Switch
                  checked={formData.enabled}
                  onChange={(e) => handleFormChange('enabled', e.target.checked)}
                  color="primary"
                />
              }
              label="アラートを有効にする"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditModal} disabled={submitting}>
            キャンセル
          </Button>
          <Button onClick={handleUpdate} variant="contained" color="primary" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog} maxWidth="sm" fullWidth>
        <DialogTitle>アラートの削除</DialogTitle>
        <DialogContent>
          <Typography>
            以下のアラートを削除してもよろしいですか？
            <br />
            この操作は取り消せません。
          </Typography>
          {selectedAlert && (
            <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>モード:</strong> {MODE_LABELS[selectedAlert.mode] || selectedAlert.mode}
              </Typography>
              <Typography variant="body2">
                <strong>ティッカー:</strong> {selectedAlert.symbol} - {selectedAlert.name}
              </Typography>
              <Typography variant="body2">
                <strong>条件:</strong>{' '}
                {selectedAlert.conditions[0]
                  ? `価格 ${OPERATOR_LABELS[selectedAlert.conditions[0].operator] || selectedAlert.conditions[0].operator} ${selectedAlert.conditions[0].value.toLocaleString()}`
                  : '-'}
              </Typography>
              <Typography variant="body2">
                <strong>頻度:</strong>{' '}
                {FREQUENCY_LABELS[selectedAlert.frequency] || selectedAlert.frequency}
              </Typography>
              <Typography variant="body2">
                <strong>状態:</strong> {selectedAlert.enabled ? '有効' : '無効'}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={submitting}>
            キャンセル
          </Button>
          <Button onClick={handleDelete} variant="contained" color="error" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : '削除'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
