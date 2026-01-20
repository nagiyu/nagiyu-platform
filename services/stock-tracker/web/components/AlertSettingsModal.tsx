'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Box,
  Typography,
} from '@mui/material';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  INVALID_TARGET_PRICE: '目標価格は0.01以上、1,000,000以下で入力してください',
  REQUIRED_FIELD: 'この項目は必須です',
  NOTIFICATION_PERMISSION_DENIED: '通知の許可が拒否されました。ブラウザの設定から許可してください',
  SUBSCRIPTION_ERROR: 'Web Push通知の登録に失敗しました',
  CREATE_ALERT_ERROR: 'アラートの登録に失敗しました',
} as const;

// 成功メッセージ定数
const SUCCESS_MESSAGES = {
  CREATE_SUCCESS: 'アラートを設定しました',
} as const;

// プロパティ型定義
interface AlertSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  tickerId: string;
  symbol: string;
  exchangeId: string;
  mode: 'Buy' | 'Sell';
  defaultTargetPrice?: number;
}

// フォームデータ型
interface FormData {
  operator: 'gte' | 'lte';
  targetPrice: string;
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
}

// 初期フォームデータ
const getInitialFormData = (mode: 'Buy' | 'Sell'): FormData => ({
  operator: mode === 'Sell' ? 'gte' : 'lte',
  targetPrice: '',
  frequency: 'MINUTE_LEVEL',
});

export default function AlertSettingsModal({
  open,
  onClose,
  onSuccess,
  tickerId,
  symbol,
  exchangeId,
  mode,
  defaultTargetPrice,
}: AlertSettingsModalProps) {
  // フォームデータ
  const [formData, setFormData] = useState<FormData>(getInitialFormData(mode));
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // 状態管理
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // モーダルが開いた時にフォームをリセット
  useEffect(() => {
    if (open) {
      setFormData({
        ...getInitialFormData(mode),
        targetPrice: defaultTargetPrice ? defaultTargetPrice.toString() : '',
      });
      setFormErrors({});
      setError('');
      setSubscription(null);
    }
  }, [open, mode, defaultTargetPrice]);

  // Web Push通知許可をリクエスト
  const requestNotificationPermission = async (): Promise<PushSubscription | null> => {
    if (!('Notification' in window)) {
      setError('このブラウザはWeb Push通知に対応していません');
      return null;
    }

    if (!('serviceWorker' in navigator)) {
      setError('このブラウザはService Workerに対応していません');
      return null;
    }

    try {
      // 通知の許可をリクエスト
      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        setError(ERROR_MESSAGES.NOTIFICATION_PERMISSION_DENIED);
        return null;
      }

      // Service Workerを登録
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // VAPID公開鍵を取得
      const vapidPublicKeyResponse = await fetch('/api/push/vapid-public-key');
      if (!vapidPublicKeyResponse.ok) {
        throw new Error('VAPID公開鍵の取得に失敗しました');
      }
      const { publicKey } = await vapidPublicKeyResponse.json();

      // Push通知をサブスクライブ
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      // サブスクリプション情報をサーバーに送信
      const subscribeResponse = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription: sub }),
      });

      if (!subscribeResponse.ok) {
        throw new Error(ERROR_MESSAGES.SUBSCRIPTION_ERROR);
      }

      return sub;
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.SUBSCRIPTION_ERROR);
      return null;
    }
  };

  // VAPID公開鍵をUint8Arrayに変換
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // フォームのバリデーション
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.targetPrice) {
      errors.targetPrice = ERROR_MESSAGES.REQUIRED_FIELD;
    } else {
      const targetPrice = parseFloat(formData.targetPrice);
      if (isNaN(targetPrice) || targetPrice < 0.01 || targetPrice > 1000000) {
        errors.targetPrice = ERROR_MESSAGES.INVALID_TARGET_PRICE;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // フォーム入力ハンドラー
  const handleFormChange = (field: keyof FormData, value: string) => {
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

  // アラートを作成
  const handleCreate = async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Web Push通知許可をリクエスト（まだ取得していない場合）
      let sub = subscription;
      if (!sub) {
        sub = await requestNotificationPermission();
        if (!sub) {
          // エラーメッセージは requestNotificationPermission 内で設定済み
          setSubmitting(false);
          return;
        }
        setSubscription(sub);
      }

      // アラートを作成
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tickerId,
          exchangeId,
          mode,
          frequency: formData.frequency,
          conditions: [
            {
              field: 'price',
              operator: formData.operator,
              value: parseFloat(formData.targetPrice),
            },
          ],
          subscription: sub.toJSON(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || ERROR_MESSAGES.CREATE_ALERT_ERROR);
      }

      // 成功時の処理
      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (err) {
      console.error('Error creating alert:', err);
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.CREATE_ALERT_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        アラート設定 ({mode === 'Buy' ? '買い' : '売り'}アラート)
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 取引所（表示のみ） */}
          <TextField
            fullWidth
            label="取引所"
            value={exchangeId}
            disabled
            InputProps={{ readOnly: true }}
          />

          {/* ティッカー（表示のみ） */}
          <TextField
            fullWidth
            label="ティッカー"
            value={symbol}
            disabled
            InputProps={{ readOnly: true }}
          />

          {/* モード（表示のみ） */}
          <TextField
            fullWidth
            label="モード"
            value={mode === 'Buy' ? '買いアラート' : '売りアラート'}
            disabled
            InputProps={{ readOnly: true }}
          />

          {/* 条件タイプ */}
          <FormControl fullWidth error={!!formErrors.operator}>
            <InputLabel id="operator-label">条件</InputLabel>
            <Select
              labelId="operator-label"
              id="operator-select"
              value={formData.operator}
              label="条件"
              onChange={(e) => handleFormChange('operator', e.target.value)}
            >
              <MenuItem value="gte">以上 (≥)</MenuItem>
              <MenuItem value="lte">以下 (≤)</MenuItem>
            </Select>
            {formErrors.operator && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                {formErrors.operator}
              </Typography>
            )}
          </FormControl>

          {/* 目標価格 */}
          <TextField
            fullWidth
            id="target-price"
            label="目標価格"
            type="number"
            value={formData.targetPrice}
            onChange={(e) => handleFormChange('targetPrice', e.target.value)}
            error={!!formErrors.targetPrice}
            helperText={
              formErrors.targetPrice ||
              (defaultTargetPrice && defaultTargetPrice > 0
                ? `推奨値: ${defaultTargetPrice.toFixed(2)} (平均取得価格 × 1.2)`
                : '')
            }
            inputProps={{ step: '0.01', min: '0.01', max: '1000000' }}
          />

          {/* 通知頻度 */}
          <FormControl fullWidth error={!!formErrors.frequency}>
            <InputLabel id="frequency-label">通知頻度</InputLabel>
            <Select
              labelId="frequency-label"
              id="frequency-select"
              value={formData.frequency}
              label="通知頻度"
              onChange={(e) => handleFormChange('frequency', e.target.value)}
            >
              <MenuItem value="MINUTE_LEVEL">1分間隔</MenuItem>
              <MenuItem value="HOURLY_LEVEL">1時間間隔</MenuItem>
            </Select>
            {formErrors.frequency && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                {formErrors.frequency}
              </Typography>
            )}
          </FormControl>

          {/* Web Push通知の説明 */}
          <Alert severity="info" sx={{ mt: 1 }}>
            アラートを設定すると、Web Push通知の許可をリクエストします。
            通知を受け取るには、ブラウザの通知を許可してください。
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          キャンセル
        </Button>
        <Button onClick={handleCreate} variant="contained" color="primary" disabled={submitting}>
          {submitting ? <CircularProgress size={24} /> : '保存'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
