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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  NotificationsNone as NotificationsNoneIcon,
  CheckCircle as CheckCircleIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import AlertSettingsModal from '../../components/AlertSettingsModal';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_HOLDINGS_ERROR: '保有株式の取得に失敗しました',
  FETCH_EXCHANGES_ERROR: '取引所一覧の取得に失敗しました',
  FETCH_TICKERS_ERROR: 'ティッカー一覧の取得に失敗しました',
  CREATE_HOLDING_ERROR: '保有株式の登録に失敗しました',
  UPDATE_HOLDING_ERROR: '保有株式の更新に失敗しました',
  DELETE_HOLDING_ERROR: '保有株式の削除に失敗しました',
  INVALID_QUANTITY: '保有数は0.0001以上、1,000,000,000以下で入力してください',
  INVALID_AVERAGE_PRICE: '平均取得価格は0.01以上、1,000,000以下で入力してください',
  REQUIRED_FIELD: 'この項目は必須です',
} as const;

// 成功メッセージ定数
const SUCCESS_MESSAGES = {
  CREATE_SUCCESS: '保有株式を登録しました',
  UPDATE_SUCCESS: '保有株式を更新しました',
  DELETE_SUCCESS: '保有株式を削除しました',
} as const;

// API レスポンス型定義
interface HoldingResponse {
  holdingId: string;
  tickerId: string;
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

interface Exchange {
  exchangeId: string;
  name: string;
  key: string;
}

interface Ticker {
  tickerId: string;
  symbol: string;
  name: string;
  exchangeId: string;
}

// フォームデータ型
interface HoldingFormData {
  exchangeId: string;
  tickerId: string;
  quantity: string;
  averagePrice: string;
  currency: string;
}

// 初期フォームデータ
const INITIAL_FORM_DATA: HoldingFormData = {
  exchangeId: '',
  tickerId: '',
  quantity: '',
  averagePrice: '',
  currency: 'USD',
};

// 通貨リスト
const CURRENCIES = ['USD', 'JPY', 'EUR', 'GBP'] as const;

export default function HoldingsPage() {
  const router = useRouter();

  // データ状態
  const [holdings, setHoldings] = useState<HoldingResponse[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [alerts, setAlerts] = useState<Record<string, boolean>>({});

  // ローディング状態
  const [loading, setLoading] = useState<boolean>(true);
  const [exchangesLoading, setExchangesLoading] = useState<boolean>(false);
  const [tickersLoading, setTickersLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // エラー状態
  const [error, setError] = useState<string>('');
  const [exchangesError, setExchangesError] = useState<string>('');
  const [tickersError, setTickersError] = useState<string>('');

  // 成功メッセージ
  const [successMessage, setSuccessMessage] = useState<string>('');

  // モーダル状態
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [alertModalOpen, setAlertModalOpen] = useState<boolean>(false);

  // フォームデータ
  const [formData, setFormData] = useState<HoldingFormData>(INITIAL_FORM_DATA);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof HoldingFormData, string>>>({});

  // 編集対象・削除対象・アラート設定対象
  const [selectedHolding, setSelectedHolding] = useState<HoldingResponse | null>(null);

  // 保有株式一覧を取得
  useEffect(() => {
    fetchHoldings();
    fetchAlerts();
    fetchExchanges();
  }, []);

  // 取引所一覧を取得
  useEffect(() => {
    if (createModalOpen || editModalOpen) {
      fetchExchanges();
    }
  }, [createModalOpen, editModalOpen]);

  // 取引所選択時にティッカー一覧を取得
  useEffect(() => {
    if (formData.exchangeId) {
      fetchTickers(formData.exchangeId);
    } else {
      setTickers([]);
      setFormData((prev) => ({ ...prev, tickerId: '' }));
    }
  }, [formData.exchangeId]);

  // 保有株式一覧を取得
  const fetchHoldings = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/holdings');
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_HOLDINGS_ERROR);
      }

      const data = await response.json();
      setHoldings(data.holdings || []);
    } catch (err) {
      console.error('Error fetching holdings:', err);
      setError(ERROR_MESSAGES.FETCH_HOLDINGS_ERROR);
    } finally {
      setLoading(false);
    }
  };

  // 取引所一覧を取得
  const fetchExchanges = async () => {
    setExchangesLoading(true);
    setExchangesError('');

    try {
      const response = await fetch('/api/exchanges');
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
      }

      const data = await response.json();
      setExchanges(data.exchanges || []);
    } catch (err) {
      console.error('Error fetching exchanges:', err);
      setExchangesError(ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
    } finally {
      setExchangesLoading(false);
    }
  };

  // ティッカー一覧を取得
  const fetchTickers = async (exchangeId: string) => {
    setTickersLoading(true);
    setTickersError('');

    try {
      const response = await fetch(`/api/tickers?exchangeId=${encodeURIComponent(exchangeId)}`);
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
      }

      const data = await response.json();
      setTickers(data.tickers || []);
    } catch (err) {
      console.error('Error fetching tickers:', err);
      setTickersError(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
    } finally {
      setTickersLoading(false);
    }
  };

  // アラート一覧を取得してチェック
  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/alerts');
      if (!response.ok) {
        // エラーの場合は単にアラート情報を空にする
        return;
      }

      const data = await response.json();
      const alertMap: Record<string, boolean> = {};

      // アラート一覧からHoldingに対応するアラートをマッピング
      if (data.alerts) {
        data.alerts.forEach((alert: { tickerId: string; mode: string; enabled: boolean }) => {
          // 売りアラートのみを対象
          if (alert.mode === 'Sell' && alert.enabled) {
            alertMap[alert.tickerId] = true;
          }
        });
      }

      setAlerts(alertMap);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      // エラーの場合は単にアラート情報を空にする
    }
  };

  // フォームのバリデーション
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof HoldingFormData, string>> = {};

    if (!formData.exchangeId) {
      errors.exchangeId = ERROR_MESSAGES.REQUIRED_FIELD;
    }
    if (!formData.tickerId) {
      errors.tickerId = ERROR_MESSAGES.REQUIRED_FIELD;
    }
    if (!formData.quantity) {
      errors.quantity = ERROR_MESSAGES.REQUIRED_FIELD;
    } else {
      const quantity = parseFloat(formData.quantity);
      if (isNaN(quantity) || quantity < 0.0001 || quantity > 1000000000) {
        errors.quantity = ERROR_MESSAGES.INVALID_QUANTITY;
      }
    }
    if (!formData.averagePrice) {
      errors.averagePrice = ERROR_MESSAGES.REQUIRED_FIELD;
    } else {
      const averagePrice = parseFloat(formData.averagePrice);
      if (isNaN(averagePrice) || averagePrice < 0.01 || averagePrice > 1000000) {
        errors.averagePrice = ERROR_MESSAGES.INVALID_AVERAGE_PRICE;
      }
    }
    if (!formData.currency) {
      errors.currency = ERROR_MESSAGES.REQUIRED_FIELD;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // 新規登録モーダルを開く
  const handleOpenCreateModal = () => {
    setFormData(INITIAL_FORM_DATA);
    setFormErrors({});
    setCreateModalOpen(true);
  };

  // 新規登録モーダルを閉じる
  const handleCloseCreateModal = () => {
    setCreateModalOpen(false);
    setFormData(INITIAL_FORM_DATA);
    setFormErrors({});
  };

  // 編集モーダルを開く
  const handleOpenEditModal = (holding: HoldingResponse) => {
    setSelectedHolding(holding);
    // 編集時は取引所とティッカーは変更不可なので、数量と平均価格のみ編集可能
    setFormData({
      exchangeId: holding.tickerId.split(':')[0] || '',
      tickerId: holding.tickerId,
      quantity: holding.quantity.toString(),
      averagePrice: holding.averagePrice.toString(),
      currency: holding.currency,
    });
    setFormErrors({});
    setEditModalOpen(true);
  };

  // 編集モーダルを閉じる
  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setSelectedHolding(null);
    setFormData(INITIAL_FORM_DATA);
    setFormErrors({});
  };

  // 削除確認ダイアログを開く
  const handleOpenDeleteDialog = (holding: HoldingResponse) => {
    setSelectedHolding(holding);
    setDeleteDialogOpen(true);
  };

  // 削除確認ダイアログを閉じる
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setSelectedHolding(null);
  };

  // フォーム入力ハンドラー
  const handleFormChange = (field: keyof HoldingFormData, value: string) => {
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

  // 保有株式を作成
  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/holdings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tickerId: formData.tickerId,
          exchangeId: formData.exchangeId,
          quantity: parseFloat(formData.quantity),
          averagePrice: parseFloat(formData.averagePrice),
          currency: formData.currency,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.CREATE_HOLDING_ERROR);
      }

      setSuccessMessage(SUCCESS_MESSAGES.CREATE_SUCCESS);
      handleCloseCreateModal();
      await fetchHoldings();

      // 成功メッセージを3秒後に消す
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (err) {
      console.error('Error creating holding:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.CREATE_HOLDING_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  // 保有株式を更新
  const handleUpdate = async () => {
    if (!selectedHolding || !validateForm()) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(
        `/api/holdings/${encodeURIComponent(selectedHolding.holdingId)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            quantity: parseFloat(formData.quantity),
            averagePrice: parseFloat(formData.averagePrice),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.UPDATE_HOLDING_ERROR);
      }

      setSuccessMessage(SUCCESS_MESSAGES.UPDATE_SUCCESS);
      handleCloseEditModal();
      await fetchHoldings();

      // 成功メッセージを3秒後に消す
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (err) {
      console.error('Error updating holding:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.UPDATE_HOLDING_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  // 保有株式を削除
  const handleDelete = async () => {
    if (!selectedHolding) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(
        `/api/holdings/${encodeURIComponent(selectedHolding.holdingId)}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.DELETE_HOLDING_ERROR);
      }

      setSuccessMessage(SUCCESS_MESSAGES.DELETE_SUCCESS);
      handleCloseDeleteDialog();
      await fetchHoldings();

      // 成功メッセージを3秒後に消す
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (err) {
      console.error('Error deleting holding:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.DELETE_HOLDING_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  // アラート設定画面に遷移
  const handleOpenAlertModal = (holding: HoldingResponse) => {
    setSelectedHolding(holding);
    setAlertModalOpen(true);
  };

  // アラート設定モーダルを閉じる
  const handleCloseAlertModal = () => {
    setAlertModalOpen(false);
    setSelectedHolding(null);
  };

  // アラート設定成功時の処理
  const handleAlertSuccess = async () => {
    setSuccessMessage('アラートを設定しました');
    // アラート一覧を再取得
    await fetchAlerts();

    // 成功メッセージを3秒後に消す
    setTimeout(() => {
      setSuccessMessage('');
    }, 3000);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }} role="main">
      {/* エラーメッセージ表示 */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setError('')}
          role="alert"
          aria-live="assertive"
        >
          {error}
        </Alert>
      )}

      {/* 成功メッセージ表示 */}
      {successMessage && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setSuccessMessage('')}
          role="status"
          aria-live="polite"
        >
          {successMessage}
        </Alert>
      )}

      {/* ヘッダー */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/')} variant="outlined">
            戻る
          </Button>
          <Typography variant="h5" component="h1" fontWeight="bold">
            保有株式管理
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          color="primary"
          onClick={handleOpenCreateModal}
        >
          新規登録
        </Button>
      </Box>

      {/* 保有株式一覧タイトル */}
      <Typography variant="h6" component="h2" fontWeight="bold" sx={{ mb: 2 }}>
        保有株式一覧
      </Typography>

      {/* ローディング表示 */}
      {loading ? (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', py: 8 }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <CircularProgress aria-label="保有株式を読み込んでいます" />
        </Box>
      ) : (
        // 保有株式一覧テーブル
        <TableContainer component={Paper} elevation={2}>
          <Table sx={{ minWidth: 650 }} aria-label="保有株式一覧">
            <TableHead sx={{ backgroundColor: 'primary.main' }}>
              <TableRow>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>取引所</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>ティッカー</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">
                  保有数
                </TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="right">
                  平均取得価格
                </TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>通貨</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">
                  アラート
                </TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {holdings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                    保有株式がありません
                  </TableCell>
                </TableRow>
              ) : (
                holdings.map((holding) => {
                  // アラート設定済みかどうかの判定
                  const hasAlert = alerts[holding.tickerId] || false;

                  // 取引所IDから取引所名を取得
                  const exchangeId = holding.tickerId.split(':')[0] || '';
                  const exchange = exchanges.find((ex) => ex.exchangeId === exchangeId);
                  const exchangeName = exchange?.name || exchangeId;

                  return (
                    <TableRow key={holding.holdingId} hover>
                      <TableCell>{exchangeName}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {holding.symbol}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{holding.quantity.toLocaleString()}</TableCell>
                      <TableCell align="right">
                        {holding.averagePrice.toLocaleString()} {holding.currency}
                      </TableCell>
                      <TableCell>{holding.currency}</TableCell>
                      <TableCell align="center">
                        <Button
                          variant="contained"
                          color={hasAlert ? 'primary' : 'success'}
                          size="small"
                          startIcon={hasAlert ? <CheckCircleIcon /> : <NotificationsNoneIcon />}
                          onClick={() => handleOpenAlertModal(holding)}
                          sx={{ minWidth: 140 }}
                        >
                          {hasAlert ? 'アラート設定済' : '売りアラート'}
                        </Button>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                          <Button
                            variant="contained"
                            color="warning"
                            size="small"
                            startIcon={<EditIcon />}
                            onClick={() => handleOpenEditModal(holding)}
                          >
                            編集
                          </Button>
                          <Button
                            variant="contained"
                            color="error"
                            size="small"
                            startIcon={<DeleteIcon />}
                            onClick={() => handleOpenDeleteDialog(holding)}
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

      {/* 新規登録モーダル */}
      <Dialog open={createModalOpen} onClose={handleCloseCreateModal} maxWidth="sm" fullWidth>
        <DialogTitle>保有株式の登録</DialogTitle>
        <DialogContent>
          {exchangesError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {exchangesError}
            </Alert>
          )}
          {tickersError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {tickersError}
            </Alert>
          )}

          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 取引所選択 */}
            <FormControl fullWidth error={!!formErrors.exchangeId} disabled={exchangesLoading}>
              <InputLabel id="create-exchange-label">取引所</InputLabel>
              <Select
                labelId="create-exchange-label"
                id="create-exchange"
                value={formData.exchangeId}
                label="取引所"
                onChange={(e) => handleFormChange('exchangeId', e.target.value)}
              >
                <MenuItem value="">
                  <em>選択してください</em>
                </MenuItem>
                {exchanges.map((ex) => (
                  <MenuItem key={ex.exchangeId} value={ex.exchangeId}>
                    {ex.name}
                  </MenuItem>
                ))}
              </Select>
              {formErrors.exchangeId && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                  {formErrors.exchangeId}
                </Typography>
              )}
            </FormControl>

            {/* ティッカー選択 */}
            <FormControl
              fullWidth
              error={!!formErrors.tickerId}
              disabled={!formData.exchangeId || tickersLoading}
            >
              <InputLabel id="create-ticker-label">ティッカー</InputLabel>
              <Select
                labelId="create-ticker-label"
                id="create-ticker"
                value={formData.tickerId}
                label="ティッカー"
                onChange={(e) => handleFormChange('tickerId', e.target.value)}
              >
                <MenuItem value="">
                  <em>選択してください</em>
                </MenuItem>
                {tickers.map((ticker) => (
                  <MenuItem key={ticker.tickerId} value={ticker.tickerId}>
                    {ticker.symbol} - {ticker.name}
                  </MenuItem>
                ))}
              </Select>
              {formErrors.tickerId && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                  {formErrors.tickerId}
                </Typography>
              )}
            </FormControl>

            {/* 保有数 */}
            <TextField
              fullWidth
              id="create-quantity"
              label="保有数"
              type="number"
              value={formData.quantity}
              onChange={(e) => handleFormChange('quantity', e.target.value)}
              error={!!formErrors.quantity}
              helperText={formErrors.quantity}
              inputProps={{ step: '0.0001', min: '0.0001', max: '1000000000' }}
            />

            {/* 平均取得価格 */}
            <TextField
              fullWidth
              id="create-average-price"
              label="平均取得価格"
              type="number"
              value={formData.averagePrice}
              onChange={(e) => handleFormChange('averagePrice', e.target.value)}
              error={!!formErrors.averagePrice}
              helperText={formErrors.averagePrice}
              inputProps={{ step: '0.01', min: '0.01', max: '1000000' }}
            />

            {/* 通貨 */}
            <FormControl fullWidth error={!!formErrors.currency}>
              <InputLabel id="create-currency-label">通貨</InputLabel>
              <Select
                labelId="create-currency-label"
                id="create-currency"
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
              {formErrors.currency && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                  {formErrors.currency}
                </Typography>
              )}
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateModal} disabled={submitting}>
            キャンセル
          </Button>
          <Button onClick={handleCreate} variant="contained" color="primary" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 編集モーダル */}
      <Dialog open={editModalOpen} onClose={handleCloseEditModal} maxWidth="sm" fullWidth>
        <DialogTitle>保有株式の編集</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 取引所（表示のみ） */}
            <TextField
              fullWidth
              label="取引所"
              value={
                selectedHolding
                  ? (() => {
                      const exchangeId = selectedHolding.tickerId.split(':')[0] || '';
                      const exchange = exchanges.find((ex) => ex.exchangeId === exchangeId);
                      return exchange?.name || exchangeId;
                    })()
                  : ''
              }
              disabled
              InputProps={{ readOnly: true }}
            />

            {/* ティッカー（表示のみ） */}
            <TextField
              fullWidth
              label="ティッカー"
              value={selectedHolding ? `${selectedHolding.symbol} - ${selectedHolding.name}` : ''}
              disabled
              InputProps={{ readOnly: true }}
            />

            {/* 保有数 */}
            <TextField
              fullWidth
              id="edit-quantity"
              label="保有数"
              type="number"
              value={formData.quantity}
              onChange={(e) => handleFormChange('quantity', e.target.value)}
              error={!!formErrors.quantity}
              helperText={formErrors.quantity}
              inputProps={{ step: '0.0001', min: '0.0001', max: '1000000000' }}
            />

            {/* 平均取得価格 */}
            <TextField
              fullWidth
              id="edit-average-price"
              label="平均取得価格"
              type="number"
              value={formData.averagePrice}
              onChange={(e) => handleFormChange('averagePrice', e.target.value)}
              error={!!formErrors.averagePrice}
              helperText={formErrors.averagePrice}
              inputProps={{ step: '0.01', min: '0.01', max: '1000000' }}
            />

            {/* 通貨（表示のみ） */}
            <TextField
              fullWidth
              label="通貨"
              value={formData.currency}
              disabled
              InputProps={{ readOnly: true }}
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
        <DialogTitle>保有株式の削除</DialogTitle>
        <DialogContent>
          <Typography>
            以下の保有株式を削除してもよろしいですか？
            <br />
            この操作は取り消せません。
          </Typography>
          {selectedHolding && (
            <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>ティッカー:</strong> {selectedHolding.symbol}
              </Typography>
              <Typography variant="body2">
                <strong>銘柄名:</strong> {selectedHolding.name}
              </Typography>
              <Typography variant="body2">
                <strong>保有数:</strong> {selectedHolding.quantity.toLocaleString()}
              </Typography>
              <Typography variant="body2">
                <strong>平均取得価格:</strong> {selectedHolding.averagePrice.toLocaleString()}{' '}
                {selectedHolding.currency}
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

      {/* アラート設定モーダル */}
      {selectedHolding && selectedHolding.tickerId && (
        <AlertSettingsModal
          open={alertModalOpen}
          onClose={handleCloseAlertModal}
          onSuccess={handleAlertSuccess}
          tickerId={selectedHolding.tickerId}
          symbol={selectedHolding.symbol}
          exchangeId={selectedHolding.tickerId.split(':')[0] || ''}
          mode="Sell"
          defaultTargetPrice={selectedHolding.averagePrice * 1.2}
        />
      )}
    </Container>
  );
}
