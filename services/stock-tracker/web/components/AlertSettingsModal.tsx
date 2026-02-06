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
  INVALID_MIN_PRICE: '最小価格は0.01以上、1,000,000以下で入力してください',
  INVALID_MAX_PRICE: '最大価格は0.01以上、1,000,000以下で入力してください',
  INVALID_RANGE_INSIDE: '範囲内アラートの場合、最小価格は最大価格より小さい値を設定してください',
  INVALID_RANGE_OUTSIDE: '範囲外アラートの場合、下限価格は上限価格より小さい値を設定してください',
  REQUIRED_FIELD: 'この項目は必須です',
  NOTIFICATION_PERMISSION_DENIED: '通知の許可が拒否されました。ブラウザの設定から許可してください',
  SUBSCRIPTION_ERROR: 'Web Push通知の登録に失敗しました',
  CREATE_ALERT_ERROR: 'アラートの登録に失敗しました',
} as const;

// パーセンテージ選択肢の定数配列（-20 ～ +20、5%刻み）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PERCENTAGE_OPTIONS = [-20, -15, -10, -5, 0, 5, 10, 15, 20] as const;

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
  basePrice?: number; // パーセンテージ計算の基準価格
}

// フォームデータ型
interface FormData {
  conditionMode: 'single' | 'range';
  operator: 'gte' | 'lte'; // 単一条件の場合のみ
  targetPrice: string; // 単一条件の場合のみ
  rangeType: 'inside' | 'outside'; // 範囲指定の場合のみ
  minPrice: string; // 範囲指定の場合のみ
  maxPrice: string; // 範囲指定の場合のみ
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  // パーセンテージ選択用フィールド（単一条件モード用）
  inputMode?: 'manual' | 'percentage';
  percentage?: string; // -20 ～ +20
  // パーセンテージ選択用フィールド（範囲指定モード用）
  rangeInputMode?: 'manual' | 'percentage';
  minPercentage?: string; // -20 ～ +20
  maxPercentage?: string; // -20 ～ +20
}

// アラート作成リクエストボディ型
interface CreateAlertRequest {
  tickerId: string;
  exchangeId: string;
  mode: 'Buy' | 'Sell';
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  conditions: Array<{
    field: 'price';
    operator: 'gte' | 'lte';
    value: number;
  }>;
  subscription: PushSubscriptionJSON;
  logicalOperator?: 'AND' | 'OR';
}

// 初期フォームデータ
const getInitialFormData = (mode: 'Buy' | 'Sell'): FormData => ({
  conditionMode: 'single',
  operator: mode === 'Sell' ? 'gte' : 'lte',
  targetPrice: '',
  rangeType: 'inside',
  minPrice: '',
  maxPrice: '',
  frequency: 'MINUTE_LEVEL',
  // パーセンテージ選択用フィールドのデフォルト値
  inputMode: 'manual',
  percentage: '',
  rangeInputMode: 'manual',
  minPercentage: '',
  maxPercentage: '',
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  basePrice,
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

    if (formData.conditionMode === 'single') {
      // 単一条件のバリデーション
      if (!formData.targetPrice) {
        errors.targetPrice = ERROR_MESSAGES.REQUIRED_FIELD;
      } else {
        const targetPrice = parseFloat(formData.targetPrice);
        if (isNaN(targetPrice) || targetPrice < 0.01 || targetPrice > 1000000) {
          errors.targetPrice = ERROR_MESSAGES.INVALID_TARGET_PRICE;
        }
      }
    } else {
      // 範囲指定のバリデーション
      if (!formData.minPrice) {
        errors.minPrice = ERROR_MESSAGES.REQUIRED_FIELD;
      } else {
        const minPrice = parseFloat(formData.minPrice);
        if (isNaN(minPrice) || minPrice < 0.01 || minPrice > 1000000) {
          errors.minPrice = ERROR_MESSAGES.INVALID_MIN_PRICE;
        }
      }

      if (!formData.maxPrice) {
        errors.maxPrice = ERROR_MESSAGES.REQUIRED_FIELD;
      } else {
        const maxPrice = parseFloat(formData.maxPrice);
        if (isNaN(maxPrice) || maxPrice < 0.01 || maxPrice > 1000000) {
          errors.maxPrice = ERROR_MESSAGES.INVALID_MAX_PRICE;
        }
      }

      // 範囲の妥当性チェック
      if (formData.minPrice && formData.maxPrice) {
        const minPrice = parseFloat(formData.minPrice);
        const maxPrice = parseFloat(formData.maxPrice);

        if (!isNaN(minPrice) && !isNaN(maxPrice)) {
          // 両方の範囲タイプで minPrice < maxPrice が必要
          // - 範囲内: price >= minPrice AND price <= maxPrice
          // - 範囲外: price <= minPrice OR price >= maxPrice
          if (minPrice >= maxPrice) {
            errors.minPrice =
              formData.rangeType === 'inside'
                ? ERROR_MESSAGES.INVALID_RANGE_INSIDE
                : ERROR_MESSAGES.INVALID_RANGE_OUTSIDE;
          }
        }
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

      // 条件配列とLogicalOperatorを構築
      let conditions;
      let logicalOperator: 'AND' | 'OR' | undefined;

      if (formData.conditionMode === 'single') {
        // 単一条件
        conditions = [
          {
            field: 'price' as const,
            operator: formData.operator,
            value: parseFloat(formData.targetPrice),
          },
        ];
      } else {
        // 範囲指定
        const minPrice = parseFloat(formData.minPrice);
        const maxPrice = parseFloat(formData.maxPrice);

        if (formData.rangeType === 'inside') {
          // 範囲内（AND）: minPrice 以上、maxPrice 以下
          conditions = [
            { field: 'price' as const, operator: 'gte' as const, value: minPrice },
            { field: 'price' as const, operator: 'lte' as const, value: maxPrice },
          ];
          logicalOperator = 'AND';
        } else {
          // 範囲外（OR）: minPrice 以下、maxPrice 以上
          conditions = [
            { field: 'price' as const, operator: 'lte' as const, value: minPrice },
            { field: 'price' as const, operator: 'gte' as const, value: maxPrice },
          ];
          logicalOperator = 'OR';
        }
      }

      // アラートを作成
      const requestBody: CreateAlertRequest = {
        tickerId,
        exchangeId,
        mode,
        frequency: formData.frequency,
        conditions,
        subscription: sub.toJSON(),
      };

      // LogicalOperatorを追加（範囲指定の場合のみ）
      if (logicalOperator) {
        requestBody.logicalOperator = logicalOperator;
      }

      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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
      <DialogTitle>アラート設定 ({mode === 'Buy' ? '買い' : '売り'}アラート)</DialogTitle>
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

          {/* 条件タイプ選択 */}
          <FormControl fullWidth>
            <InputLabel id="condition-mode-label">条件タイプ</InputLabel>
            <Select
              labelId="condition-mode-label"
              id="condition-mode-select"
              value={formData.conditionMode}
              label="条件タイプ"
              onChange={(e) => handleFormChange('conditionMode', e.target.value)}
            >
              <MenuItem value="single">単一条件（以上または以下）</MenuItem>
              <MenuItem value="range">範囲指定</MenuItem>
            </Select>
          </FormControl>

          {/* 単一条件モード */}
          {formData.conditionMode === 'single' && (
            <>
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
            </>
          )}

          {/* 範囲指定モード */}
          {formData.conditionMode === 'range' && (
            <>
              <FormControl fullWidth>
                <InputLabel id="range-type-label">範囲タイプ</InputLabel>
                <Select
                  labelId="range-type-label"
                  id="range-type-select"
                  value={formData.rangeType}
                  label="範囲タイプ"
                  onChange={(e) => handleFormChange('rangeType', e.target.value)}
                >
                  <MenuItem value="inside">範囲内（AND）</MenuItem>
                  <MenuItem value="outside">範囲外（OR）</MenuItem>
                </Select>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.75 }}>
                  {formData.rangeType === 'inside'
                    ? '価格が指定範囲内になったら通知'
                    : '価格が指定範囲外になったら通知'}
                </Typography>
              </FormControl>

              <TextField
                fullWidth
                id="min-price"
                label={formData.rangeType === 'inside' ? '最小価格（下限）' : '下限価格'}
                type="number"
                value={formData.minPrice}
                onChange={(e) => handleFormChange('minPrice', e.target.value)}
                error={!!formErrors.minPrice}
                helperText={
                  formErrors.minPrice ||
                  (formData.rangeType === 'inside' ? 'この価格以上' : 'この価格以下で通知')
                }
                inputProps={{ step: '0.01', min: '0.01', max: '1000000' }}
              />

              <TextField
                fullWidth
                id="max-price"
                label={formData.rangeType === 'inside' ? '最大価格（上限）' : '上限価格'}
                type="number"
                value={formData.maxPrice}
                onChange={(e) => handleFormChange('maxPrice', e.target.value)}
                error={!!formErrors.maxPrice}
                helperText={
                  formErrors.maxPrice ||
                  (formData.rangeType === 'inside' ? 'この価格以下' : 'この価格以上で通知')
                }
                inputProps={{ step: '0.01', min: '0.01', max: '1000000' }}
              />
            </>
          )}

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
