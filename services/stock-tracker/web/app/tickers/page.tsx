'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  IconButton,
  SelectChangeEvent,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この画面にアクセスする権限がありません（stock-admin ロールが必要です）',
  FETCH_EXCHANGES_ERROR: '取引所一覧の取得に失敗しました',
  FETCH_TICKERS_ERROR: 'ティッカー一覧の取得に失敗しました',
  CREATE_TICKER_ERROR: 'ティッカーの作成に失敗しました',
  UPDATE_TICKER_ERROR: 'ティッカーの更新に失敗しました',
  DELETE_TICKER_ERROR: 'ティッカーの削除に失敗しました',
  VALIDATION_ERROR: '入力内容に誤りがあります',
} as const;

/**
 * 成功メッセージ定数
 */
const SUCCESS_MESSAGES = {
  CREATE_SUCCESS: 'ティッカーを作成しました',
  UPDATE_SUCCESS: 'ティッカーを更新しました',
  DELETE_SUCCESS: 'ティッカーを削除しました',
} as const;

/**
 * API レスポンス型定義
 */
interface Exchange {
  exchangeId: string;
  name: string;
  key: string;
  timezone: string;
  tradingHours: {
    start: string;
    end: string;
  };
}

interface Ticker {
  tickerId: string;
  symbol: string;
  name: string;
  exchangeId: string;
}

/**
 * フォームデータ型定義
 */
interface TickerFormData {
  symbol: string;
  name: string;
  exchangeId: string;
}

/**
 * ティッカー管理画面コンポーネント
 */
export default function TickersPage() {
  const router = useRouter();

  // 状態管理
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [filteredTickers, setFilteredTickers] = useState<Ticker[]>([]);
  const [selectedExchange, setSelectedExchange] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  // モーダル状態
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [editingTicker, setEditingTicker] = useState<Ticker | null>(null);
  const [deletingTicker, setDeletingTicker] = useState<Ticker | null>(null);

  // フォームデータ
  const [formData, setFormData] = useState<TickerFormData>({
    symbol: '',
    name: '',
    exchangeId: '',
  });

  // 送信中フラグ
  const [submitting, setSubmitting] = useState<boolean>(false);

  /**
   * 初期データ取得
   */
  useEffect(() => {
    fetchInitialData();
  }, []);

  /**
   * 取引所フィルタ適用
   */
  useEffect(() => {
    if (selectedExchange === '') {
      setFilteredTickers(tickers);
    } else {
      setFilteredTickers(tickers.filter((t) => t.exchangeId === selectedExchange));
    }
  }, [selectedExchange, tickers]);

  /**
   * 初期データ取得処理
   */
  const fetchInitialData = async () => {
    setLoading(true);
    setError('');

    try {
      // 取引所とティッカーを並行取得
      const [exchangesResponse, tickersResponse] = await Promise.all([
        fetch('/api/exchanges'),
        fetch('/api/tickers'),
      ]);

      // 権限エラーチェック
      if (exchangesResponse.status === 401) {
        setError(ERROR_MESSAGES.UNAUTHORIZED);
        setLoading(false);
        return;
      }

      if (exchangesResponse.status === 403 || tickersResponse.status === 403) {
        setError(ERROR_MESSAGES.FORBIDDEN);
        setLoading(false);
        return;
      }

      if (!exchangesResponse.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
      }

      if (!tickersResponse.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
      }

      const exchangesData = await exchangesResponse.json();
      const tickersData = await tickersResponse.json();

      setExchanges(exchangesData.exchanges || []);
      setTickers(tickersData.tickers || []);
    } catch (err) {
      console.error('Error fetching initial data:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.FETCH_TICKERS_ERROR);
    } finally {
      setLoading(false);
    }
  };

  /**
   * ティッカー一覧の再取得
   */
  const refreshTickers = async () => {
    try {
      const response = await fetch('/api/tickers');
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
      }
      const data = await response.json();
      setTickers(data.tickers || []);
    } catch (err) {
      console.error('Error refreshing tickers:', err);
      setError(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
    }
  };

  /**
   * 取引所フィルタ変更ハンドラー
   */
  const handleExchangeFilterChange = (event: SelectChangeEvent) => {
    setSelectedExchange(event.target.value);
  };

  /**
   * 新規作成モーダルを開く
   */
  const handleOpenCreateModal = () => {
    setFormData({
      symbol: '',
      name: '',
      exchangeId: '',
    });
    setCreateModalOpen(true);
  };

  /**
   * 新規作成モーダルを閉じる
   */
  const handleCloseCreateModal = () => {
    setCreateModalOpen(false);
    setFormData({
      symbol: '',
      name: '',
      exchangeId: '',
    });
  };

  /**
   * 編集モーダルを開く
   */
  const handleOpenEditModal = (ticker: Ticker) => {
    setEditingTicker(ticker);
    setFormData({
      symbol: ticker.symbol,
      name: ticker.name,
      exchangeId: ticker.exchangeId,
    });
    setEditModalOpen(true);
  };

  /**
   * 編集モーダルを閉じる
   */
  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditingTicker(null);
    setFormData({
      symbol: '',
      name: '',
      exchangeId: '',
    });
  };

  /**
   * 削除確認ダイアログを開く
   */
  const handleOpenDeleteDialog = (ticker: Ticker) => {
    setDeletingTicker(ticker);
    setDeleteDialogOpen(true);
  };

  /**
   * 削除確認ダイアログを閉じる
   */
  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeletingTicker(null);
  };

  /**
   * フォーム入力変更ハンドラー
   */
  const handleFormChange = (field: keyof TickerFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /**
   * ティッカー作成処理
   */
  const handleCreateTicker = async () => {
    setSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/tickers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.CREATE_TICKER_ERROR);
      }

      setSuccessMessage(SUCCESS_MESSAGES.CREATE_SUCCESS);
      handleCloseCreateModal();
      await refreshTickers();
    } catch (err) {
      console.error('Error creating ticker:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.CREATE_TICKER_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * ティッカー更新処理
   */
  const handleUpdateTicker = async () => {
    if (!editingTicker) return;

    setSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`/api/tickers/${encodeURIComponent(editingTicker.tickerId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.UPDATE_TICKER_ERROR);
      }

      setSuccessMessage(SUCCESS_MESSAGES.UPDATE_SUCCESS);
      handleCloseEditModal();
      await refreshTickers();
    } catch (err) {
      console.error('Error updating ticker:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.UPDATE_TICKER_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * ティッカー削除処理
   */
  const handleDeleteTicker = async () => {
    if (!deletingTicker) return;

    setSubmitting(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`/api/tickers/${encodeURIComponent(deletingTicker.tickerId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.DELETE_TICKER_ERROR);
      }

      setSuccessMessage(SUCCESS_MESSAGES.DELETE_SUCCESS);
      handleCloseDeleteDialog();
      await refreshTickers();
    } catch (err) {
      console.error('Error deleting ticker:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.DELETE_TICKER_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * 取引所名を取得
   */
  const getExchangeName = (exchangeId: string): string => {
    const exchange = exchanges.find((ex) => ex.exchangeId === exchangeId);
    return exchange ? exchange.name : exchangeId;
  };

  /**
   * TickerID を計算（プレビュー用）
   */
  const getPreviewTickerId = (): string => {
    if (!formData.symbol || !formData.exchangeId) return '';
    const exchange = exchanges.find((ex) => ex.exchangeId === formData.exchangeId);
    if (!exchange) return '';
    return `${exchange.key}:${formData.symbol}`;
  };

  // ローディング中
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  // 権限エラー
  if (error === ERROR_MESSAGES.FORBIDDEN || error === ERROR_MESSAGES.UNAUTHORIZED) {
    return (
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/')}
          sx={{ mt: 2 }}
        >
          トップページに戻る
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* ヘッダー */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => router.push('/')}>
            戻る
          </Button>
          <Typography variant="h4" component="h1">
            ティッカー管理
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenCreateModal}
        >
          新規登録
        </Button>
      </Box>

      {/* エラーメッセージ */}
      {error && error !== ERROR_MESSAGES.FORBIDDEN && error !== ERROR_MESSAGES.UNAUTHORIZED && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* 成功メッセージ */}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      )}

      {/* 取引所フィルター */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
          取引所でフィルター
        </Typography>
        <FormControl fullWidth sx={{ maxWidth: 400 }}>
          <InputLabel id="exchange-filter-label">すべて</InputLabel>
          <Select
            labelId="exchange-filter-label"
            id="exchange-filter"
            value={selectedExchange}
            label="すべて"
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
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
        ティッカー一覧
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f57c00' }}>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>ティッカーID</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>シンボル</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>取引所</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>ティッカー名</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTickers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  ティッカーが登録されていません
                </TableCell>
              </TableRow>
            ) : (
              filteredTickers.map((ticker) => (
                <TableRow key={ticker.tickerId} hover>
                  <TableCell sx={{ fontWeight: 'bold' }}>{ticker.tickerId}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{ticker.symbol}</TableCell>
                  <TableCell>{getExchangeName(ticker.exchangeId)}</TableCell>
                  <TableCell>{ticker.name}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      color="warning"
                      size="small"
                      onClick={() => handleOpenEditModal(ticker)}
                      sx={{ mr: 1 }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      size="small"
                      onClick={() => handleOpenDeleteDialog(ticker)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 新規作成モーダル */}
      <Dialog open={createModalOpen} onClose={handleCloseCreateModal} maxWidth="sm" fullWidth>
        <DialogTitle>ティッカー登録</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="シンボル"
              value={formData.symbol}
              onChange={(e) => handleFormChange('symbol', e.target.value)}
              fullWidth
              required
              placeholder="NVDA"
            />
            <TextField
              label="ティッカー名"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              fullWidth
              required
              placeholder="NVIDIA Corporation"
            />
            <FormControl fullWidth required>
              <InputLabel id="exchange-select-label">取引所</InputLabel>
              <Select
                labelId="exchange-select-label"
                value={formData.exchangeId}
                label="取引所"
                onChange={(e) => handleFormChange('exchangeId', e.target.value)}
              >
                {exchanges.map((ex) => (
                  <MenuItem key={ex.exchangeId} value={ex.exchangeId}>
                    {ex.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                ティッカーID（自動生成）
              </Typography>
              <Paper
                sx={{
                  p: 2,
                  backgroundColor: '#e8f5e9',
                  border: 'none',
                }}
              >
                <Typography sx={{ color: '#388e3c' }}>
                  {getPreviewTickerId() || '取引所とシンボルを入力してください'}
                </Typography>
              </Paper>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontStyle: 'italic', mt: 1, display: 'block' }}
              >
                ※ ティッカーIDは「{'{取引所APIキー}'}:{'{シンボル}'}
                」の形式で自動生成されます（例: NSDQ:NVDA）
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateModal} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            onClick={handleCreateTicker}
            variant="contained"
            color="primary"
            disabled={submitting || !formData.symbol || !formData.name || !formData.exchangeId}
          >
            {submitting ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 編集モーダル */}
      <Dialog open={editModalOpen} onClose={handleCloseEditModal} maxWidth="sm" fullWidth>
        <DialogTitle>ティッカー編集</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="シンボル"
              value={formData.symbol}
              fullWidth
              disabled
              helperText="シンボルは変更できません"
            />
            <TextField
              label="ティッカー名"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="取引所"
              value={getExchangeName(formData.exchangeId)}
              fullWidth
              disabled
              helperText="取引所は変更できません"
            />
            <TextField
              label="ティッカーID"
              value={editingTicker?.tickerId || ''}
              fullWidth
              disabled
              helperText="ティッカーIDは変更できません"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditModal} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            onClick={handleUpdateTicker}
            variant="contained"
            color="primary"
            disabled={submitting || !formData.name}
          >
            {submitting ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog} maxWidth="sm" fullWidth>
        <DialogTitle>ティッカー削除確認</DialogTitle>
        <DialogContent>
          <Typography>以下のティッカーを削除してもよろしいですか？</Typography>
          <Box sx={{ mt: 2, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
            <Typography>
              <strong>ティッカーID:</strong> {deletingTicker?.tickerId}
            </Typography>
            <Typography>
              <strong>シンボル:</strong> {deletingTicker?.symbol}
            </Typography>
            <Typography>
              <strong>ティッカー名:</strong> {deletingTicker?.name}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} disabled={submitting}>
            キャンセル
          </Button>
          <Button
            onClick={handleDeleteTicker}
            variant="contained"
            color="error"
            disabled={submitting}
          >
            {submitting ? <CircularProgress size={24} /> : '削除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 補足説明 */}
      <Typography
        variant="caption"
        sx={{ display: 'block', mt: 2, color: 'text.secondary', fontStyle: 'italic' }}
      >
        ※ ティッカー管理画面は stock-admin ロールのみアクセス可能
      </Typography>
    </Container>
  );
}
