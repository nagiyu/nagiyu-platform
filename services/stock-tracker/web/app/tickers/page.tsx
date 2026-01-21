'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  SelectChangeEvent,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_TICKERS_ERROR: 'ティッカー一覧の取得に失敗しました',
  FETCH_EXCHANGES_ERROR: '取引所一覧の取得に失敗しました',
  CREATE_TICKER_ERROR: 'ティッカーの作成に失敗しました',
  UPDATE_TICKER_ERROR: 'ティッカーの更新に失敗しました',
  DELETE_TICKER_ERROR: 'ティッカーの削除に失敗しました',
  UNAUTHORIZED: 'この操作を実行する権限がありません',
  FORBIDDEN: 'アクセスが拒否されました',
} as const;

// 成功メッセージ定数
const SUCCESS_MESSAGES = {
  CREATE_TICKER: 'ティッカーを作成しました',
  UPDATE_TICKER: 'ティッカーを更新しました',
  DELETE_TICKER: 'ティッカーを削除しました',
} as const;

// API レスポンス型定義
interface Ticker {
  tickerId: string;
  symbol: string;
  name: string;
  exchangeId: string;
}

interface Exchange {
  exchangeId: string;
  name: string;
  key: string;
}

interface TickerFormData {
  symbol: string;
  name: string;
  exchangeId: string;
}

export default function TickersPage() {
  // データ状態
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [filteredTickers, setFilteredTickers] = useState<Ticker[]>([]);

  // フィルタ状態
  const [exchangeFilter, setExchangeFilter] = useState<string>('');

  // ローディング状態
  const [loading, setLoading] = useState<boolean>(false);
  const [exchangesLoading, setExchangesLoading] = useState<boolean>(false);

  // エラー・成功メッセージ
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  // モーダル状態
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);

  // フォームデータ
  const [formData, setFormData] = useState<TickerFormData>({
    symbol: '',
    name: '',
    exchangeId: '',
  });
  const [editingTickerId, setEditingTickerId] = useState<string>('');
  const [deletingTickerId, setDeletingTickerId] = useState<string>('');

  // 権限エラーの処理
  const handleAuthError = useCallback((status: number, message: string) => {
    if (status === 403) {
      setError(ERROR_MESSAGES.FORBIDDEN);
    } else if (status === 401) {
      setError(ERROR_MESSAGES.UNAUTHORIZED);
    } else {
      setError(message);
    }
  }, []);

  // 取引所一覧取得
  const fetchExchanges = useCallback(async () => {
    setExchangesLoading(true);
    try {
      const response = await fetch('/api/exchanges');
      if (!response.ok) {
        const data = await response.json();
        handleAuthError(response.status, data.message || ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
        return;
      }

      const data = await response.json();
      setExchanges(data.exchanges || []);
    } catch (err) {
      console.error('Error fetching exchanges:', err);
      setError(ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
    } finally {
      setExchangesLoading(false);
    }
  }, [handleAuthError]);

  // ティッカー一覧取得
  const fetchTickers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = exchangeFilter
        ? `/api/tickers?exchangeId=${encodeURIComponent(exchangeFilter)}`
        : '/api/tickers';

      const response = await fetch(url);
      if (!response.ok) {
        const data = await response.json();
        handleAuthError(response.status, data.message || ERROR_MESSAGES.FETCH_TICKERS_ERROR);
        return;
      }

      const data = await response.json();
      const tickersList = data.tickers || [];
      setTickers(tickersList);
      setFilteredTickers(tickersList);
    } catch (err) {
      console.error('Error fetching tickers:', err);
      setError(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
    } finally {
      setLoading(false);
    }
  }, [exchangeFilter, handleAuthError]);

  // 初回レンダリング時に取引所とティッカーを取得
  useEffect(() => {
    fetchExchanges();
  }, [fetchExchanges]);

  useEffect(() => {
    fetchTickers();
  }, [fetchTickers]);

  // 取引所フィルタ変更時の処理
  const handleExchangeFilterChange = (event: SelectChangeEvent) => {
    setExchangeFilter(event.target.value);
  };

  // フォーム入力変更ハンドラー
  const handleInputChange = (field: keyof TickerFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // 新規作成モーダルを開く
  const openCreateModal = () => {
    setFormData({
      symbol: '',
      name: '',
      exchangeId: '',
    });
    setCreateModalOpen(true);
  };

  // 編集モーダルを開く
  const openEditModal = (ticker: Ticker) => {
    setEditingTickerId(ticker.tickerId);
    setFormData({
      symbol: ticker.symbol,
      name: ticker.name,
      exchangeId: ticker.exchangeId,
    });
    setEditModalOpen(true);
  };

  // 削除ダイアログを開く
  const openDeleteDialog = (tickerId: string) => {
    setDeletingTickerId(tickerId);
    setDeleteDialogOpen(true);
  };

  // モーダルを閉じる
  const closeModals = () => {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setDeleteDialogOpen(false);
    setFormData({
      symbol: '',
      name: '',
      exchangeId: '',
    });
    setEditingTickerId('');
    setDeletingTickerId('');
  };

  // ティッカー作成
  const handleCreate = async () => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/tickers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        handleAuthError(response.status, data.message || ERROR_MESSAGES.CREATE_TICKER_ERROR);
        return;
      }

      setSuccess(SUCCESS_MESSAGES.CREATE_TICKER);
      closeModals();
      fetchTickers();
    } catch (err) {
      console.error('Error creating ticker:', err);
      setError(ERROR_MESSAGES.CREATE_TICKER_ERROR);
    }
  };

  // ティッカー更新
  const handleUpdate = async () => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/tickers/${encodeURIComponent(editingTickerId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        handleAuthError(response.status, data.message || ERROR_MESSAGES.UPDATE_TICKER_ERROR);
        return;
      }

      setSuccess(SUCCESS_MESSAGES.UPDATE_TICKER);
      closeModals();
      fetchTickers();
    } catch (err) {
      console.error('Error updating ticker:', err);
      setError(ERROR_MESSAGES.UPDATE_TICKER_ERROR);
    }
  };

  // ティッカー削除
  const handleDelete = async () => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/tickers/${encodeURIComponent(deletingTickerId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        handleAuthError(response.status, data.message || ERROR_MESSAGES.DELETE_TICKER_ERROR);
        return;
      }

      setSuccess(SUCCESS_MESSAGES.DELETE_TICKER);
      closeModals();
      fetchTickers();
    } catch (err) {
      console.error('Error deleting ticker:', err);
      setError(ERROR_MESSAGES.DELETE_TICKER_ERROR);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* ヘッダー */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          ティッカー管理
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={openCreateModal}
          disabled={loading || exchangesLoading}
        >
          新規作成
        </Button>
      </Box>

      {/* エラー・成功メッセージ */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* 取引所フィルタ */}
      <Box sx={{ mb: 3 }}>
        <FormControl fullWidth disabled={exchangesLoading || loading} sx={{ maxWidth: 300 }}>
          <InputLabel id="exchange-filter-label">取引所でフィルタ</InputLabel>
          <Select
            labelId="exchange-filter-label"
            id="exchange-filter"
            value={exchangeFilter}
            label="取引所でフィルタ"
            onChange={handleExchangeFilterChange}
          >
            <MenuItem value="">
              <em>すべて</em>
            </MenuItem>
            {exchanges.map((ex) => (
              <MenuItem key={ex.exchangeId} value={ex.exchangeId}>
                {ex.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* ティッカー一覧テーブル */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ティッカーID</TableCell>
              <TableCell>シンボル</TableCell>
              <TableCell>銘柄名</TableCell>
              <TableCell>取引所</TableCell>
              <TableCell align="right">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : filteredTickers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                  <Typography color="text.secondary">ティッカーが登録されていません</Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredTickers.map((ticker) => {
                const exchange = exchanges.find((ex) => ex.exchangeId === ticker.exchangeId);
                return (
                  <TableRow key={ticker.tickerId}>
                    <TableCell>{ticker.symbol}</TableCell>
                    <TableCell>{ticker.symbol}</TableCell>
                    <TableCell>{ticker.name}</TableCell>
                    <TableCell>{exchange?.name || ticker.exchangeId}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        color="primary"
                        size="small"
                        onClick={() => openEditModal(ticker)}
                        aria-label={`編集 ${ticker.symbol}`}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        color="error"
                        size="small"
                        onClick={() => openDeleteDialog(ticker.tickerId)}
                        aria-label={`削除 ${ticker.symbol}`}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 新規作成モーダル */}
      <Dialog open={createModalOpen} onClose={closeModals} maxWidth="sm" fullWidth>
        <DialogTitle>ティッカー新規作成</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="シンボル"
              value={formData.symbol}
              onChange={(e) => handleInputChange('symbol', e.target.value.toUpperCase())}
              fullWidth
              required
              helperText="例: AAPL, NVDA（英大文字と数字のみ）"
            />
            <TextField
              label="銘柄名"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              fullWidth
              required
              helperText="例: Apple Inc., NVIDIA Corporation"
            />
            <FormControl fullWidth required>
              <InputLabel id="create-exchange-label">取引所</InputLabel>
              <Select
                labelId="create-exchange-label"
                value={formData.exchangeId}
                label="取引所"
                onChange={(e) => handleInputChange('exchangeId', e.target.value)}
              >
                {exchanges.map((ex) => (
                  <MenuItem key={ex.exchangeId} value={ex.exchangeId}>
                    {ex.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Alert severity="info">
              ティッカーIDは自動生成されます（形式: {'{取引所キー}:{シンボル}'}）
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModals}>キャンセル</Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            color="primary"
            disabled={!formData.symbol || !formData.name || !formData.exchangeId}
          >
            作成
          </Button>
        </DialogActions>
      </Dialog>

      {/* 編集モーダル */}
      <Dialog open={editModalOpen} onClose={closeModals} maxWidth="sm" fullWidth>
        <DialogTitle>ティッカー編集</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="ティッカーID"
              value={editingTickerId}
              fullWidth
              disabled
              helperText="ティッカーIDは変更できません"
            />
            <TextField
              label="シンボル"
              value={formData.symbol}
              fullWidth
              disabled
              helperText="シンボルは変更できません"
            />
            <TextField
              label="銘柄名"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              fullWidth
              required
            />
            <FormControl fullWidth disabled>
              <InputLabel id="edit-exchange-label">取引所</InputLabel>
              <Select labelId="edit-exchange-label" value={formData.exchangeId} label="取引所">
                {exchanges.map((ex) => (
                  <MenuItem key={ex.exchangeId} value={ex.exchangeId}>
                    {ex.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Alert severity="info">取引所は変更できません</Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModals}>キャンセル</Button>
          <Button
            onClick={handleUpdate}
            variant="contained"
            color="primary"
            disabled={!formData.name}
          >
            更新
          </Button>
        </DialogActions>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteDialogOpen} onClose={closeModals}>
        <DialogTitle>ティッカー削除</DialogTitle>
        <DialogContent>
          <Typography>本当にこのティッカーを削除しますか？</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            ティッカーID: {deletingTickerId}
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            この操作は取り消せません
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModals}>キャンセル</Button>
          <Button onClick={handleDelete} variant="contained" color="error">
            削除
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
