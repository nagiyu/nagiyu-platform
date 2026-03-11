'use client';

import { useState, useEffect, Suspense } from 'react';
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
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useRouter, useSearchParams } from 'next/navigation';
import AlertSettingsModal from '../../components/AlertSettingsModal';
import AlertDeleteConfirmDialog from '../../components/AlertDeleteConfirmDialog';
import type { AlertResponse } from '../../types/alert';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_ALERTS_ERROR: 'アラート一覧の取得に失敗しました',
  DELETE_ALERT_ERROR: 'アラートの削除に失敗しました',
} as const;

// 成功メッセージ定数
const SUCCESS_MESSAGES = {
  UPDATE_SUCCESS: 'アラートを更新しました',
  DELETE_SUCCESS: 'アラートを削除しました',
} as const;

interface Exchange {
  exchangeId: string;
  name: string;
  key: string;
}

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

// メインコンテンツコンポーネント（useSearchParams を使用）
function AlertsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // データ状態
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);

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

  // 編集対象・削除対象
  const [selectedAlert, setSelectedAlert] = useState<AlertResponse | null>(null);

  // アラート一覧を取得
  useEffect(() => {
    fetchAlerts();
    fetchExchanges();
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

  // 取引所一覧を取得
  const fetchExchanges = async () => {
    try {
      const response = await fetch('/api/exchanges');
      if (!response.ok) {
        // 取引所の取得に失敗してもアラート一覧は表示できるようにする
        console.error('Failed to fetch exchanges');
        return;
      }

      const data = await response.json();
      setExchanges(data.exchanges || []);
    } catch (err) {
      console.error('Error fetching exchanges:', err);
      // エラーが発生してもアラート一覧は表示できるようにする
    }
  };

  // 編集対象のアラートから basePrice を取得（パーセンテージ編集に使用）
  const getBasePriceForEdit = (alert: AlertResponse): number | undefined => {
    const firstCond = alert.conditions[0];
    if (!firstCond) return undefined;
    // 条件に basePrice が保存されている場合はそれを使用
    if (firstCond.basePrice && firstCond.basePrice > 0) return firstCond.basePrice;
    // 後方互換: isPercentage=true で percentageValue がある場合は逆算
    if (firstCond.isPercentage === true && typeof firstCond.percentageValue === 'number') {
      const computed = firstCond.value / (1 + firstCond.percentageValue / 100);
      if (computed > 0) return Math.round(computed * 100) / 100;
    }
    return undefined;
  };

  // 編集モーダルを開く
  const handleOpenEditModal = (alert: AlertResponse) => {
    setSelectedAlert(alert);
    setEditModalOpen(true);
  };

  // 編集モーダルを閉じる
  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setSelectedAlert(null);
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

  const handleEditSuccess = async () => {
    setSuccessMessage(SUCCESS_MESSAGES.UPDATE_SUCCESS);
    handleCloseEditModal();
    await fetchAlerts();

    setTimeout(() => {
      setSuccessMessage('');
    }, 3000);
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
                  // 条件テキストを生成
                  let conditionText = '-';
                  if (alert.conditions.length === 1) {
                    // 単一条件
                    const condition = alert.conditions[0];
                    conditionText = `価格 ${OPERATOR_LABELS[condition.operator] || condition.operator} ${condition.value.toLocaleString()}`;
                  } else if (alert.conditions.length === 2 && alert.logicalOperator) {
                    // 2条件（範囲指定）
                    const cond1 = alert.conditions[0];
                    const cond2 = alert.conditions[1];
                    if (alert.logicalOperator === 'AND') {
                      // 範囲内: price >= min AND price <= max
                      conditionText = `価格 ${cond1.value.toLocaleString()} ～ ${cond2.value.toLocaleString()}（範囲内）`;
                    } else {
                      // 範囲外: price <= min OR price >= max
                      conditionText = `価格 ${cond1.value.toLocaleString()} 以下 または ${cond2.value.toLocaleString()} 以上（範囲外）`;
                    }
                  }

                  // 取引所IDから取引所名を取得
                  const exchangeId = alert.tickerId.split(':')[0] || '';
                  const exchange = exchanges.find((ex) => ex.exchangeId === exchangeId);
                  const exchangeName = exchange?.name || exchangeId;

                  return (
                    <TableRow key={alert.alertId} hover>
                      <TableCell>
                        <Chip
                          label={MODE_LABELS[alert.mode] || alert.mode}
                          color={alert.mode === 'Buy' ? 'success' : 'warning'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{exchangeName}</TableCell>
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

      {selectedAlert && (
        <AlertSettingsModal
          open={editModalOpen}
          onClose={handleCloseEditModal}
          onSuccess={handleEditSuccess}
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
        onClose={handleCloseDeleteDialog}
        onConfirm={handleDelete}
      />
    </Container>
  );
}

// ページコンポーネント（Suspense でラップ）
export default function AlertsPage() {
  return (
    <Suspense
      fallback={
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        </Container>
      }
    >
      <AlertsPageContent />
    </Suspense>
  );
}
