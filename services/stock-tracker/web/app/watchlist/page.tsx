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
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  SelectChangeEvent,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import NotificationsIcon from '@mui/icons-material/Notifications';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AlertSettingsModal from '../../components/AlertSettingsModal';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_WATCHLIST_ERROR: 'ウォッチリストの取得に失敗しました',
  FETCH_EXCHANGES_ERROR: '取引所一覧の取得に失敗しました',
  FETCH_TICKERS_ERROR: 'ティッカー一覧の取得に失敗しました',
  CREATE_WATCHLIST_ERROR: 'ウォッチリストの登録に失敗しました',
  DELETE_WATCHLIST_ERROR: 'ウォッチリストの削除に失敗しました',
  TICKER_REQUIRED: 'ティッカーを選択してください',
} as const;

// API レスポンス型定義
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

interface WatchlistItem {
  watchlistId: string;
  tickerId: string;
  symbol: string;
  name: string;
  createdAt: string;
}

export default function WatchlistPage() {
  // ウォッチリストデータ
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [alerts, setAlerts] = useState<Record<string, boolean>>({});

  // モーダル状態
  const [openCreateModal, setOpenCreateModal] = useState<boolean>(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [alertModalOpen, setAlertModalOpen] = useState<boolean>(false);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string>('');
  const [selectedWatchlistItem, setSelectedWatchlistItem] = useState<WatchlistItem | null>(null);

  // 新規登録フォーム
  const [selectedExchange, setSelectedExchange] = useState<string>('');
  const [selectedTicker, setSelectedTicker] = useState<string>('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [exchangesLoading, setExchangesLoading] = useState<boolean>(false);
  const [tickersLoading, setTickersLoading] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>('');

  // ウォッチリスト一覧を取得
  const fetchWatchlist = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/watchlist');
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_WATCHLIST_ERROR);
      }

      const data = await response.json();
      setWatchlist(data.watchlist || []);
    } catch (err) {
      console.error('Error fetching watchlist:', err);
      setError(ERROR_MESSAGES.FETCH_WATCHLIST_ERROR);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
    fetchAlerts();
    fetchExchanges();
  }, []);

  // 取引所一覧を取得
  const fetchExchanges = async () => {
    setExchangesLoading(true);

    try {
      const response = await fetch('/api/exchanges');
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
      }

      const data = await response.json();
      setExchanges(data.exchanges || []);
    } catch (err) {
      console.error('Error fetching exchanges:', err);
      setCreateError(ERROR_MESSAGES.FETCH_EXCHANGES_ERROR);
    } finally {
      setExchangesLoading(false);
    }
  };

  // ティッカー一覧を取得
  const fetchTickers = async (exchangeId: string) => {
    setTickersLoading(true);
    setCreateError('');

    try {
      const response = await fetch(`/api/tickers?exchangeId=${encodeURIComponent(exchangeId)}`);
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
      }

      const data = await response.json();
      setTickers(data.tickers || []);
    } catch (err) {
      console.error('Error fetching tickers:', err);
      setCreateError(ERROR_MESSAGES.FETCH_TICKERS_ERROR);
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

      // アラート一覧からWatchlistに対応するアラートをマッピング
      if (data.alerts) {
        data.alerts.forEach((alert: { tickerId: string; mode: string; enabled: boolean }) => {
          // 買いアラートのみを対象
          if (alert.mode === 'Buy' && alert.enabled) {
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

  // 取引所選択時
  useEffect(() => {
    if (selectedExchange) {
      fetchTickers(selectedExchange);
      setSelectedTicker(''); // ティッカーをリセット
    } else {
      setTickers([]);
      setSelectedTicker('');
    }
  }, [selectedExchange]);

  // 新規登録モーダルを開く
  const handleOpenCreateModal = () => {
    setOpenCreateModal(true);
    setSelectedExchange('');
    setSelectedTicker('');
    setCreateError('');
    fetchExchanges();
  };

  // 新規登録モーダルを閉じる
  const handleCloseCreateModal = () => {
    setOpenCreateModal(false);
    setSelectedExchange('');
    setSelectedTicker('');
    setTickers([]);
    setCreateError('');
  };

  // ウォッチリスト登録
  const handleCreateWatchlist = async () => {
    if (!selectedTicker) {
      setCreateError(ERROR_MESSAGES.TICKER_REQUIRED);
      return;
    }

    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tickerId: selectedTicker,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.CREATE_WATCHLIST_ERROR);
      }

      // ウォッチリスト一覧を再取得
      await fetchWatchlist();

      // モーダルを閉じる
      handleCloseCreateModal();
    } catch (err) {
      console.error('Error creating watchlist:', err);
      setCreateError(err instanceof Error ? err.message : ERROR_MESSAGES.CREATE_WATCHLIST_ERROR);
    }
  };

  // 削除確認ダイアログを開く
  const handleOpenDeleteDialog = (watchlistId: string) => {
    setSelectedWatchlistId(watchlistId);
    setOpenDeleteDialog(true);
  };

  // 削除確認ダイアログを閉じる
  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setSelectedWatchlistId('');
  };

  // ウォッチリスト削除
  const handleDeleteWatchlist = async () => {
    try {
      const response = await fetch(`/api/watchlist/${encodeURIComponent(selectedWatchlistId)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.DELETE_WATCHLIST_ERROR);
      }

      // ウォッチリスト一覧を再取得
      await fetchWatchlist();

      // ダイアログを閉じる
      handleCloseDeleteDialog();
    } catch (err) {
      console.error('Error deleting watchlist:', err);
      setError(ERROR_MESSAGES.DELETE_WATCHLIST_ERROR);
      handleCloseDeleteDialog();
    }
  };

  // アラート設定モーダルを開く
  const handleOpenAlertModal = (item: WatchlistItem) => {
    setSelectedWatchlistItem(item);
    setAlertModalOpen(true);
  };

  // アラート設定モーダルを閉じる
  const handleCloseAlertModal = () => {
    setAlertModalOpen(false);
    setSelectedWatchlistItem(null);
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
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* ページタイトル */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          ウォッチリスト
        </Typography>
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
      {error && (
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

      {/* ローディング表示 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* ウォッチリスト一覧テーブル */}
      {!loading && (
        <TableContainer component={Paper} elevation={2}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>取引所</TableCell>
                <TableCell>ティッカー</TableCell>
                <TableCell>登録日時</TableCell>
                <TableCell align="center">買いアラート</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {watchlist.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                      ウォッチリストに登録されている銘柄はありません
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                watchlist.map((item) => {
                  // アラート設定済みかどうかの判定
                  const hasAlert = alerts[item.tickerId] || false;

                  // 取引所IDから取引所名を取得
                  const exchangeId = item.tickerId.split(':')[0] || '';
                  const exchange = exchanges.find((ex) => ex.exchangeId === exchangeId);
                  const exchangeName = exchange?.name || exchangeId;

                  return (
                    <TableRow key={item.watchlistId} hover>
                      <TableCell>{exchangeName}</TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {item.symbol}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.name}
                        </Typography>
                      </TableCell>
                      <TableCell>{new Date(item.createdAt).toLocaleString('ja-JP')}</TableCell>
                      <TableCell align="center">
                        <Button
                          variant="contained"
                          color={hasAlert ? 'primary' : 'success'}
                          size="small"
                          startIcon={hasAlert ? <CheckCircleIcon /> : <NotificationsIcon />}
                          onClick={() => handleOpenAlertModal(item)}
                          sx={{ minWidth: 140 }}
                        >
                          {hasAlert ? 'アラート設定済' : '買いアラート'}
                        </Button>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          color="error"
                          onClick={() => handleOpenDeleteDialog(item.watchlistId)}
                          size="small"
                          title="削除"
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
      )}

      {/* 新規登録モーダル */}
      <Dialog open={openCreateModal} onClose={handleCloseCreateModal} maxWidth="sm" fullWidth>
        <DialogTitle>ウォッチリスト新規登録</DialogTitle>
        <DialogContent>
          {createError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createError}
            </Alert>
          )}

          <Box sx={{ mt: 2 }}>
            {/* 取引所選択 */}
            <FormControl fullWidth sx={{ mb: 2 }} disabled={exchangesLoading}>
              <InputLabel id="create-exchange-label">取引所</InputLabel>
              <Select
                labelId="create-exchange-label"
                id="create-exchange-select"
                value={selectedExchange}
                label="取引所"
                onChange={(e: SelectChangeEvent) => setSelectedExchange(e.target.value)}
              >
                <MenuItem value="">
                  <em>選択してください</em>
                </MenuItem>
                {exchanges.map((exchange) => (
                  <MenuItem key={exchange.exchangeId} value={exchange.exchangeId}>
                    {exchange.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* ティッカー選択 */}
            <FormControl fullWidth disabled={!selectedExchange || tickersLoading}>
              <InputLabel id="create-ticker-label">ティッカー</InputLabel>
              <Select
                labelId="create-ticker-label"
                id="create-ticker-select"
                value={selectedTicker}
                label="ティッカー"
                onChange={(e: SelectChangeEvent) => setSelectedTicker(e.target.value)}
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
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateModal} color="inherit">
            キャンセル
          </Button>
          <Button
            onClick={handleCreateWatchlist}
            color="primary"
            variant="contained"
            disabled={!selectedTicker}
          >
            登録
          </Button>
        </DialogActions>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={openDeleteDialog} onClose={handleCloseDeleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle>削除確認</DialogTitle>
        <DialogContent>
          <Typography>このウォッチリストを削除してもよろしいですか？</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color="inherit">
            キャンセル
          </Button>
          <Button onClick={handleDeleteWatchlist} color="error" variant="contained">
            削除
          </Button>
        </DialogActions>
      </Dialog>

      {/* アラート設定モーダル */}
      {selectedWatchlistItem && selectedWatchlistItem.tickerId && (
        <AlertSettingsModal
          open={alertModalOpen}
          onClose={handleCloseAlertModal}
          onSuccess={handleAlertSuccess}
          tickerId={selectedWatchlistItem.tickerId}
          symbol={selectedWatchlistItem.symbol}
          exchangeId={selectedWatchlistItem.tickerId.split(':')[0] || ''}
          mode="Buy"
        />
      )}
    </Container>
  );
}
