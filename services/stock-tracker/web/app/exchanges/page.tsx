'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';

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
}

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_ERROR: '取引所一覧の取得に失敗しました',
  CREATE_ERROR: '取引所の作成に失敗しました',
  UPDATE_ERROR: '取引所の更新に失敗しました',
  DELETE_ERROR: '取引所の削除に失敗しました',
  UNAUTHORIZED: '認証が必要です',
  FORBIDDEN: 'この操作を実行する権限がありません',
  VALIDATION_ERROR: '入力内容を確認してください',
} as const;

// 成功メッセージ定数
const SUCCESS_MESSAGES = {
  CREATE: '取引所を作成しました',
  UPDATE: '取引所を更新しました',
  DELETE: '取引所を削除しました',
} as const;

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

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* エラーメッセージ表示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* ヘッダー */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => router.push('/')}
            sx={{ minWidth: 120 }}
          >
            戻る
          </Button>
          <Typography variant="h4" component="h1">
            取引所管理
          </Typography>
        </Box>
        <Button
          variant="contained"
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
                <TableCell sx={{ color: 'white', fontWeight: 'bold' }} align="center">
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {exchanges.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <Typography variant="body1" color="text.secondary">
                      取引所が登録されていません
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                exchanges.map((exchange) => (
                  <TableRow key={exchange.exchangeId} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {exchange.exchangeId}
                      </Typography>
                    </TableCell>
                    <TableCell>{exchange.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {exchange.key}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{exchange.timezone}</Typography>
                    </TableCell>
                    <TableCell>
                      {exchange.tradingHours.start}-{exchange.tradingHours.end}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditOpen(exchange)}
                          sx={{
                            backgroundColor: '#ffc107',
                            '&:hover': { backgroundColor: '#ffa000' },
                          }}
                        >
                          編集
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          color="error"
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
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                取引所ID
              </Typography>
              <TextField
                fullWidth
                placeholder="NASDAQ"
                value={formData.exchangeId}
                onChange={handleInputChange('exchangeId')}
                disabled={submitting}
              />
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ※ システム内部で使用する識別子（例: NASDAQ, NYSE, TSE）
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                取引所名
              </Typography>
              <TextField
                fullWidth
                placeholder="NASDAQ Stock Market"
                value={formData.name}
                onChange={handleInputChange('name')}
                disabled={submitting}
              />
            </Box>

            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                APIキー
              </Typography>
              <TextField
                fullWidth
                placeholder="NSDQ"
                value={formData.key}
                onChange={handleInputChange('key')}
                disabled={submitting}
              />
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ※ TradingView API で使用する取引所コード（例: NSDQ, NYSE, TSE）
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                タイムゾーン
              </Typography>
              <FormControl fullWidth disabled={submitting}>
                <Select
                  value={formData.timezone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, timezone: e.target.value }))}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>選択してください</em>
                  </MenuItem>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <MenuItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ※ 主要な取引所のタイムゾーン
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                取引開始時間
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl fullWidth disabled={submitting}>
                  <InputLabel>時</InputLabel>
                  <Select
                    value={startHour}
                    label="時"
                    onChange={(e) => setStartHour(e.target.value)}
                  >
                    {HOURS.map((hour) => (
                      <MenuItem key={hour} value={hour}>
                        {hour}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography>:</Typography>
                <FormControl fullWidth disabled={submitting}>
                  <InputLabel>分</InputLabel>
                  <Select
                    value={startMinute}
                    label="分"
                    onChange={(e) => setStartMinute(e.target.value)}
                  >
                    {MINUTES.map((minute) => (
                      <MenuItem key={minute} value={minute}>
                        {minute}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ※ 24時間形式で選択
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                取引終了時間
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl fullWidth disabled={submitting}>
                  <InputLabel>時</InputLabel>
                  <Select value={endHour} label="時" onChange={(e) => setEndHour(e.target.value)}>
                    {HOURS.map((hour) => (
                      <MenuItem key={hour} value={hour}>
                        {hour}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography>:</Typography>
                <FormControl fullWidth disabled={submitting}>
                  <InputLabel>分</InputLabel>
                  <Select
                    value={endMinute}
                    label="分"
                    onChange={(e) => setEndMinute(e.target.value)}
                  >
                    {MINUTES.map((minute) => (
                      <MenuItem key={minute} value={minute}>
                        {minute}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ※ 24時間形式で選択
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleCloseModals} disabled={submitting} sx={{ minWidth: 100 }}>
            キャンセル
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={submitting}
            sx={{ minWidth: 100 }}
          >
            {submitting ? <CircularProgress size={24} /> : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 編集モーダル */}
      <Dialog open={editModalOpen} onClose={handleCloseModals} maxWidth="sm" fullWidth>
        <DialogTitle>取引所編集</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
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
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                取引所名
              </Typography>
              <TextField
                fullWidth
                placeholder="NASDAQ Stock Market"
                value={formData.name}
                onChange={handleInputChange('name')}
                disabled={submitting}
              />
            </Box>

            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
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
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                タイムゾーン
              </Typography>
              <FormControl fullWidth disabled={submitting}>
                <Select
                  value={formData.timezone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, timezone: e.target.value }))}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>選択してください</em>
                  </MenuItem>
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <MenuItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ※ 主要な取引所のタイムゾーン
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                取引開始時間
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl fullWidth disabled={submitting}>
                  <InputLabel>時</InputLabel>
                  <Select
                    value={startHour}
                    label="時"
                    onChange={(e) => setStartHour(e.target.value)}
                  >
                    {HOURS.map((hour) => (
                      <MenuItem key={hour} value={hour}>
                        {hour}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography>:</Typography>
                <FormControl fullWidth disabled={submitting}>
                  <InputLabel>分</InputLabel>
                  <Select
                    value={startMinute}
                    label="分"
                    onChange={(e) => setStartMinute(e.target.value)}
                  >
                    {MINUTES.map((minute) => (
                      <MenuItem key={minute} value={minute}>
                        {minute}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ※ 24時間形式で選択
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
                取引終了時間
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl fullWidth disabled={submitting}>
                  <InputLabel>時</InputLabel>
                  <Select value={endHour} label="時" onChange={(e) => setEndHour(e.target.value)}>
                    {HOURS.map((hour) => (
                      <MenuItem key={hour} value={hour}>
                        {hour}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Typography>:</Typography>
                <FormControl fullWidth disabled={submitting}>
                  <InputLabel>分</InputLabel>
                  <Select
                    value={endMinute}
                    label="分"
                    onChange={(e) => setEndMinute(e.target.value)}
                  >
                    {MINUTES.map((minute) => (
                      <MenuItem key={minute} value={minute}>
                        {minute}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Typography variant="caption" color="text.secondary" fontStyle="italic">
                ※ 24時間形式で選択
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleCloseModals} disabled={submitting} sx={{ minWidth: 100 }}>
            キャンセル
          </Button>
          <Button
            variant="contained"
            onClick={handleUpdate}
            disabled={submitting}
            sx={{ minWidth: 100 }}
          >
            {submitting ? <CircularProgress size={24} /> : '保存'}
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
          <Button onClick={handleCloseModals} disabled={submitting} sx={{ minWidth: 100 }}>
            キャンセル
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={submitting}
            sx={{ minWidth: 100 }}
          >
            {submitting ? <CircularProgress size={24} /> : '削除'}
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
