'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  // eslint-disable-next-line no-restricted-imports -- 編集モーダル内 TextField の sx={{ backgroundColor: '#f5f5f5' }} で背景色指定が必要なため、@nagiyu/ui ではなく MUI の TextField をそのまま利用する
  TextField,
  Snackbar,
} from '@mui/material';
import { Button, ErrorAlert, Select } from '@nagiyu/ui';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import { useEnterSubmit } from '@nagiyu/react';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import type { PriceSource } from '@nagiyu/stock-tracker-core';

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
  priceSource: PriceSource;
  createdAt?: string;
  updatedAt?: string;
}

// フォーム入力用型定義
interface ExchangeFormData {
  exchangeId: string;
  name: string;
  key: string;
  timezone: string;
  start: string;
  end: string;
  priceSource: PriceSource;
}

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_ERROR: '取引所一覧の取得に失敗しました',
  CREATE_ERROR: '取引所の作成に失敗しました',
  UPDATE_ERROR: '取引所の更新に失敗しました',
  DELETE_ERROR: '取引所の削除に失敗しました',
  UNAUTHORIZED: COMMON_ERROR_MESSAGES.UNAUTHORIZED,
  FORBIDDEN: COMMON_ERROR_MESSAGES.FORBIDDEN,
  VALIDATION_ERROR: '入力内容を確認してください',
} as const;

// 成功メッセージ定数
const SUCCESS_MESSAGES = {
  CREATE: '取引所を作成しました',
  UPDATE: '取引所を更新しました',
  DELETE: '取引所を削除しました',
} as const;

// データソース選択オプション
const PRICE_SOURCE_OPTIONS = [
  { value: 'tradingview', label: 'TradingView' },
  { value: 'finnhub', label: 'Finnhub' },
] as const;

// タイムゾーンオプション（主要な取引所のタイムゾーン）
const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'America/New_York (NYSE, NASDAQ)' },
  { value: 'America/Chicago', label: 'America/Chicago (CME)' },
  { value: 'Europe/London', label: 'Europe/London (LSE)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (Euronext)' },
  { value: 'Europe/Frankfurt', label: 'Europe/Frankfurt (FWB)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (TSE)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKEX)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (SSE)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGX)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (ASX)' },
] as const;

// 時間と分の選択肢を生成
const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

// HH:MM形式の文字列を時と分に分割
const parseTime = (time: string): { hour: string; minute: string } => {
  const parts = time.split(':');
  return {
    hour: parts[0] || '00',
    minute: parts[1] || '00',
  };
};

// 時と分からHH:MM形式の文字列を生成
const formatTime = (hour: string, minute: string): string => {
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
};

export default function ExchangesPage() {
  const router = useRouter();

  // データ状態の管理
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // モーダル状態の管理
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);

  // 選択中の取引所
  const [selectedExchange, setSelectedExchange] = useState<Exchange | null>(null);

  // フォームデータ
  const [formData, setFormData] = useState<ExchangeFormData>({
    exchangeId: '',
    name: '',
    key: '',
    timezone: '',
    start: '',
    end: '',
    priceSource: 'tradingview',
  });

  // 時間選択用の状態（start）
  const [startHour, setStartHour] = useState<string>('09');
  const [startMinute, setStartMinute] = useState<string>('30');

  // 時間選択用の状態（end）
  const [endHour, setEndHour] = useState<string>('16');
  const [endMinute, setEndMinute] = useState<string>('00');

  // フォーム送信中フラグ
  const [submitting, setSubmitting] = useState<boolean>(false);

  // スナックバー（成功メッセージ表示用）
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');

  // 取引所一覧を取得
  const fetchExchanges = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/exchanges');

      if (response.status === 401) {
        setError(ERROR_MESSAGES.UNAUTHORIZED);
        return;
      }

      if (response.status === 403) {
        setError(ERROR_MESSAGES.FORBIDDEN);
        return;
      }

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.FETCH_ERROR);
      }

      const data = await response.json();
      setExchanges(data.exchanges || []);
    } catch (err) {
      console.error('Error fetching exchanges:', err);
      setError(ERROR_MESSAGES.FETCH_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExchanges();
  }, [fetchExchanges]);

  // 新規作成モーダルを開く
  const handleCreateOpen = () => {
    setFormData({
      exchangeId: '',
      name: '',
      key: '',
      timezone: '',
      start: '',
      end: '',
      priceSource: 'tradingview',
    });
    setStartHour('09');
    setStartMinute('30');
    setEndHour('16');
    setEndMinute('00');
    setCreateModalOpen(true);
  };

  // 編集モーダルを開く
  const handleEditOpen = (exchange: Exchange) => {
    setSelectedExchange(exchange);
    const startTime = parseTime(exchange.tradingHours.start);
    const endTime = parseTime(exchange.tradingHours.end);
    setFormData({
      exchangeId: exchange.exchangeId,
      name: exchange.name,
      key: exchange.key,
      timezone: exchange.timezone,
      start: exchange.tradingHours.start,
      end: exchange.tradingHours.end,
      priceSource: exchange.priceSource ?? 'tradingview',
    });
    setStartHour(startTime.hour);
    setStartMinute(startTime.minute);
    setEndHour(endTime.hour);
    setEndMinute(endTime.minute);
    setEditModalOpen(true);
  };

  // 削除ダイアログを開く
  const handleDeleteOpen = (exchange: Exchange) => {
    setSelectedExchange(exchange);
    setDeleteDialogOpen(true);
  };

  // モーダルを閉じる
  const handleCloseModals = () => {
    setCreateModalOpen(false);
    setEditModalOpen(false);
    setDeleteDialogOpen(false);
    setSelectedExchange(null);
  };

  // フォーム入力を処理
  const handleInputChange =
    (field: keyof ExchangeFormData) => (event: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: event.target.value,
      }));
    };

  // 取引所作成
  const handleCreate = async () => {
    setSubmitting(true);

    try {
      const response = await fetch('/api/exchanges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exchangeId: formData.exchangeId,
          name: formData.name,
          key: formData.key,
          timezone: formData.timezone,
          tradingHours: {
            start: formatTime(startHour, startMinute),
            end: formatTime(endHour, endMinute),
          },
          priceSource: formData.priceSource,
        }),
      });

      if (response.status === 401) {
        setError(ERROR_MESSAGES.UNAUTHORIZED);
        return;
      }

      if (response.status === 403) {
        setError(ERROR_MESSAGES.FORBIDDEN);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.CREATE_ERROR);
      }

      // 成功時の処理
      handleCloseModals();
      setSnackbarMessage(SUCCESS_MESSAGES.CREATE);
      setSnackbarOpen(true);
      await fetchExchanges();
    } catch (err) {
      console.error('Error creating exchange:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.CREATE_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  // 取引所更新
  const handleUpdate = async () => {
    if (!selectedExchange) return;

    setSubmitting(true);

    try {
      const response = await fetch(`/api/exchanges/${selectedExchange.exchangeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          timezone: formData.timezone,
          tradingHours: {
            start: formatTime(startHour, startMinute),
            end: formatTime(endHour, endMinute),
          },
          priceSource: formData.priceSource,
        }),
      });

      if (response.status === 401) {
        setError(ERROR_MESSAGES.UNAUTHORIZED);
        return;
      }

      if (response.status === 403) {
        setError(ERROR_MESSAGES.FORBIDDEN);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.UPDATE_ERROR);
      }

      // 成功時の処理
      handleCloseModals();
      setSnackbarMessage(SUCCESS_MESSAGES.UPDATE);
      setSnackbarOpen(true);
      await fetchExchanges();
    } catch (err) {
      console.error('Error updating exchange:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.UPDATE_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  // 取引所削除
  const handleDelete = async () => {
    if (!selectedExchange) return;

    setSubmitting(true);

    try {
      const response = await fetch(`/api/exchanges/${selectedExchange.exchangeId}`, {
        method: 'DELETE',
      });

      if (response.status === 401) {
        setError(ERROR_MESSAGES.UNAUTHORIZED);
        return;
      }

      if (response.status === 403) {
        setError(ERROR_MESSAGES.FORBIDDEN);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.DELETE_ERROR);
      }

      // 成功時の処理
      handleCloseModals();
      setSnackbarMessage(SUCCESS_MESSAGES.DELETE);
      setSnackbarOpen(true);
      await fetchExchanges();
    } catch (err) {
      console.error('Error deleting exchange:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.DELETE_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  // エンターキー確定ハンドラ（登録モーダル用）
  const handleCreateEnterDown = useEnterSubmit<HTMLDivElement>(handleCreate, {
    disabled: submitting,
  });

  // エンターキー確定ハンドラ（編集モーダル用）
  const handleUpdateEnterDown = useEnterSubmit<HTMLDivElement>(handleUpdate, {
    disabled: submitting,
  });

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* エラーメッセージ表示 */}
      {error && <ErrorAlert message={error} onClose={() => setError('')} />}

      {/* ヘッダー */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button variant="outline" startIcon={<ArrowBackIcon />} onClick={() => router.push('/')}>
            戻る
          </Button>
          <Typography variant="h4" component="h1">
            取引所管理
          </Typography>
        </Box>
        <Button
          variant="solid"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleCreateOpen}
          disabled={loading}
        >
          新規登録
        </Button>
      </Box>

      {/* 取引所一覧テーブル */}
      <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
        取引所一覧
      </Typography>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f57c00' }}>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>取引所ID</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>取引所名</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>APIキー</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>タイムゾーン</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>取引時間</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>データソース</TableCell>
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {exchanges.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <Typography variant="body1" color="text.secondary">
                      取引所が登録されていません
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                exchanges.map((exchange) => (
                  <TableRow key={exchange.exchangeId} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {exchange.exchangeId}
                      </Typography>
                    </TableCell>
                    <TableCell>{exchange.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {exchange.key}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{exchange.timezone}</Typography>
                    </TableCell>
                    <TableCell>
                      {exchange.tradingHours.start}-{exchange.tradingHours.end}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {exchange.priceSource ?? 'tradingview'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <Button
                          variant="solid"
                          color="warning"
                          size="sm"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditOpen(exchange)}
                        >
                          編集
                        </Button>
                        <Button
                          variant="solid"
                          size="sm"
                          color="danger"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleDeleteOpen(exchange)}
                        >
                          削除
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* 新規作成モーダル */}
      <Dialog open={createModalOpen} onClose={handleCloseModals} maxWidth="sm" fullWidth>
        <DialogTitle>取引所登録</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                取引所ID
              </Typography>
              <TextField
                fullWidth
                placeholder="NASDAQ"
                value={formData.exchangeId}
                onChange={handleInputChange('exchangeId')}
                disabled={submitting}
                onKeyDown={handleCreateEnterDown}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ システム内部で使用する識別子（例: NASDAQ, NYSE, TSE）
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                取引所名
              </Typography>
              <TextField
                fullWidth
                placeholder="NASDAQ Stock Market"
                value={formData.name}
                onChange={handleInputChange('name')}
                disabled={submitting}
                onKeyDown={handleCreateEnterDown}
              />
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                APIキー
              </Typography>
              <TextField
                fullWidth
                placeholder="NSDQ"
                value={formData.key}
                onChange={handleInputChange('key')}
                disabled={submitting}
                onKeyDown={handleCreateEnterDown}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ TradingView API で使用する取引所コード（例: NSDQ, NYSE, TSE）
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                タイムゾーン
              </Typography>
              <Select
                fullWidth
                id="exchange-timezone"
                disabled={submitting}
                value={formData.timezone}
                onChange={(value) => setFormData((prev) => ({ ...prev, timezone: value }))}
                placeholder="選択してください"
                options={TIMEZONE_OPTIONS.map((tz) => ({ value: tz.value, label: tz.label }))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ 主要な取引所のタイムゾーン
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                データソース
              </Typography>
              <Select
                fullWidth
                id="exchange-price-source-create"
                disabled={submitting}
                value={formData.priceSource}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, priceSource: value as PriceSource }))
                }
                options={PRICE_SOURCE_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ Finnhub は米国株（NASDAQ/NYSE/AMEX）のみ対応。東証など他市場は TradingView を選択
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                取引開始時間
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Select
                  fullWidth
                  id="exchange-start-hour"
                  label="時"
                  disabled={submitting}
                  value={startHour}
                  onChange={setStartHour}
                  options={HOURS.map((hour) => ({ value: hour, label: hour }))}
                />
                <Typography>:</Typography>
                <Select
                  fullWidth
                  id="exchange-start-minute"
                  label="分"
                  disabled={submitting}
                  value={startMinute}
                  onChange={setStartMinute}
                  options={MINUTES.map((minute) => ({ value: minute, label: minute }))}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ 24時間形式で選択
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                取引終了時間
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Select
                  fullWidth
                  id="exchange-end-hour"
                  label="時"
                  disabled={submitting}
                  value={endHour}
                  onChange={setEndHour}
                  options={HOURS.map((hour) => ({ value: hour, label: hour }))}
                />
                <Typography>:</Typography>
                <Select
                  fullWidth
                  id="exchange-end-minute"
                  label="分"
                  disabled={submitting}
                  value={endMinute}
                  onChange={setEndMinute}
                  options={MINUTES.map((minute) => ({ value: minute, label: minute }))}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ 24時間形式で選択
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleCloseModals} disabled={submitting} variant="ghost">
            キャンセル
          </Button>
          <Button variant="solid" onClick={handleCreate} loading={submitting}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 編集モーダル */}
      <Dialog open={editModalOpen} onClose={handleCloseModals} maxWidth="sm" fullWidth>
        <DialogTitle>取引所編集</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                取引所ID
              </Typography>
              <TextField
                fullWidth
                value={formData.exchangeId}
                disabled
                sx={{ backgroundColor: '#f5f5f5' }}
              />
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                取引所名
              </Typography>
              <TextField
                fullWidth
                placeholder="NASDAQ Stock Market"
                value={formData.name}
                onChange={handleInputChange('name')}
                disabled={submitting}
                onKeyDown={handleUpdateEnterDown}
              />
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                APIキー
              </Typography>
              <TextField
                fullWidth
                value={formData.key}
                disabled
                sx={{ backgroundColor: '#f5f5f5' }}
              />
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                タイムゾーン
              </Typography>
              <Select
                fullWidth
                id="exchange-timezone"
                disabled={submitting}
                value={formData.timezone}
                onChange={(value) => setFormData((prev) => ({ ...prev, timezone: value }))}
                placeholder="選択してください"
                options={TIMEZONE_OPTIONS.map((tz) => ({ value: tz.value, label: tz.label }))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ 主要な取引所のタイムゾーン
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                データソース
              </Typography>
              <Select
                fullWidth
                id="exchange-price-source-edit"
                disabled={submitting}
                value={formData.priceSource}
                onChange={(value) =>
                  setFormData((prev) => ({ ...prev, priceSource: value as PriceSource }))
                }
                options={PRICE_SOURCE_OPTIONS.map((opt) => ({
                  value: opt.value,
                  label: opt.label,
                }))}
              />
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ Finnhub は米国株（NASDAQ/NYSE/AMEX）のみ対応。東証など他市場は TradingView を選択
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                取引開始時間
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Select
                  fullWidth
                  id="exchange-start-hour"
                  label="時"
                  disabled={submitting}
                  value={startHour}
                  onChange={setStartHour}
                  options={HOURS.map((hour) => ({ value: hour, label: hour }))}
                />
                <Typography>:</Typography>
                <Select
                  fullWidth
                  id="exchange-start-minute"
                  label="分"
                  disabled={submitting}
                  value={startMinute}
                  onChange={setStartMinute}
                  options={MINUTES.map((minute) => ({ value: minute, label: minute }))}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ 24時間形式で選択
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                取引終了時間
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Select
                  fullWidth
                  id="exchange-end-hour"
                  label="時"
                  disabled={submitting}
                  value={endHour}
                  onChange={setEndHour}
                  options={HOURS.map((hour) => ({ value: hour, label: hour }))}
                />
                <Typography>:</Typography>
                <Select
                  fullWidth
                  id="exchange-end-minute"
                  label="分"
                  disabled={submitting}
                  value={endMinute}
                  onChange={setEndMinute}
                  options={MINUTES.map((minute) => ({ value: minute, label: minute }))}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                ※ 24時間形式で選択
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleCloseModals} disabled={submitting} variant="ghost">
            キャンセル
          </Button>
          <Button variant="solid" onClick={handleUpdate} loading={submitting}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseModals} maxWidth="xs" fullWidth>
        <DialogTitle>取引所削除</DialogTitle>
        <DialogContent>
          <Typography>取引所「{selectedExchange?.name}」を削除してもよろしいですか？</Typography>
          <Typography variant="body2" color="error" sx={{ mt: 2 }}>
            ※ この操作は取り消せません
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleCloseModals} disabled={submitting} variant="ghost">
            キャンセル
          </Button>
          <Button variant="solid" color="danger" onClick={handleDelete} loading={submitting}>
            削除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 成功メッセージ（スナックバー） */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  );
}
