'use client';

import { useState } from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { Button, Checkbox, ErrorAlert, TextField } from '@nagiyu/ui';
import {
  MylistRegisterFormData,
  DEFAULT_MYLIST_REGISTER_FORM_DATA,
  MylistRegisterRequest,
  MylistRegisterResponse,
} from '@/types/mylist';
import { extractErrorMessage } from '@nagiyu/common';

interface MylistRegisterFormProps {
  onSuccess?: (response: MylistRegisterResponse) => void;
}

/**
 * マイリスト登録フォームコンポーネント
 *
 * 登録条件（最大件数、お気に入りのみ等）、user_session、
 * マイリスト名を入力し、バッチジョブを投入します。
 */
export default function MylistRegisterForm({ onSuccess }: MylistRegisterFormProps) {
  const [formData, setFormData] = useState<MylistRegisterFormData>(
    DEFAULT_MYLIST_REGISTER_FORM_DATA
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // バリデーション
      if (!formData.mylistName.trim()) {
        setError('マイリスト名を入力してください');
        setLoading(false);
        return;
      }

      if (!formData.userSession.trim()) {
        setError('user_session を入力してください');
        setLoading(false);
        return;
      }

      // APIリクエストの構築
      const requestBody: MylistRegisterRequest = {
        maxCount: formData.maxCount,
        favoriteOnly: formData.favoriteOnly,
        excludeSkip: formData.excludeSkip,
        mylistName: formData.mylistName,
        userSession: formData.userSession,
      };

      // 既存の Push サブスクリプションをバッチジョブに紐付ける
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        const subscriptionData = subscription?.toJSON();
        if (
          subscriptionData?.endpoint &&
          subscriptionData.keys?.p256dh &&
          subscriptionData.keys?.auth
        ) {
          requestBody.pushSubscription = {
            endpoint: subscriptionData.endpoint,
            keys: {
              p256dh: subscriptionData.keys.p256dh,
              auth: subscriptionData.keys.auth,
            },
          };
        }
      }

      // API呼び出し
      const response = await fetch('/api/mylist/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorMessage = 'マイリスト登録に失敗しました';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType?.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = extractErrorMessage(errorData, errorMessage);
          }
        } catch {
          // JSON パースに失敗した場合はデフォルトメッセージを使用
        }
        throw new Error(errorMessage);
      }

      const data: MylistRegisterResponse = await response.json();

      // 成功時のコールバック
      if (onSuccess) {
        onSuccess(data);
      }

      // フォームをリセット（user_session をクリア）
      setFormData({
        ...formData,
        userSession: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          マイリスト登録設定
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
          {/* エラーメッセージ */}
          {error && <ErrorAlert message={error} />}

          {/* 登録条件 */}
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            登録条件
          </Typography>

          <TextField
            label="登録する最大動画数"
            type="number"
            value={String(formData.maxCount)}
            onChange={(e) => {
              const value = e.target.value;
              // 空文字の場合はそのまま許可（入力中）
              if (value === '') {
                setFormData({
                  ...formData,
                  maxCount: 1, // デフォルト値を保持
                });
                return;
              }
              // 数値に変換して範囲内にクランプ
              const numValue = Number(value);
              if (!isNaN(numValue)) {
                setFormData({
                  ...formData,
                  maxCount: Math.max(1, Math.min(100, numValue)),
                });
              }
            }}
            fullWidth
            required
            helperText="1〜100の範囲で指定してください"
          />

          <Checkbox
            label="お気に入りのみを対象にする"
            checked={formData.favoriteOnly}
            onChange={(e) =>
              setFormData({
                ...formData,
                favoriteOnly: e.target.checked,
              })
            }
          />

          <Checkbox
            label="スキップ動画を除外する"
            checked={formData.excludeSkip}
            onChange={(e) =>
              setFormData({
                ...formData,
                excludeSkip: e.target.checked,
              })
            }
          />

          {/* マイリスト名 */}
          <TextField
            label="マイリスト名"
            value={formData.mylistName}
            onChange={(e) =>
              setFormData({
                ...formData,
                mylistName: e.target.value,
              })
            }
            fullWidth
            required
            helperText="ニコニコ動画に作成されるマイリストの名前"
          />

          {/* ニコニコ user_session */}
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
            ニコニコ動画 セッション
          </Typography>

          <TextField
            label="user_session"
            type="password"
            value={formData.userSession}
            onChange={(e) =>
              setFormData({
                ...formData,
                userSession: e.target.value,
              })
            }
            fullWidth
            required
            autoComplete="off"
            helperText="シークレット窓でニコニコ動画にログインし、開発者ツールのCookieから user_session の値を取得して貼り付けてください"
          />

          {/* 実行ボタン */}
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="submit" variant="solid" color="primary" loading={loading}>
              {loading ? '登録中...' : 'マイリストに登録'}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
