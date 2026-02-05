'use client';

import { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Typography,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  InputAdornment,
  IconButton,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  MylistRegisterFormData,
  DEFAULT_MYLIST_REGISTER_FORM_DATA,
  MylistRegisterRequest,
  MylistRegisterResponse,
} from '@/types/mylist';

interface MylistRegisterFormProps {
  onSuccess?: (response: MylistRegisterResponse) => void;
}

/**
 * マイリスト登録フォームコンポーネント
 *
 * 登録条件（最大件数、お気に入りのみ等）、ニコニコアカウント情報、
 * マイリスト名を入力し、バッチジョブを投入します。
 */
export default function MylistRegisterForm({ onSuccess }: MylistRegisterFormProps) {
  const [formData, setFormData] = useState<MylistRegisterFormData>(
    DEFAULT_MYLIST_REGISTER_FORM_DATA
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

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

      if (!formData.niconicoEmail.trim()) {
        setError('ニコニコアカウントのメールアドレスを入力してください');
        setLoading(false);
        return;
      }

      if (!formData.niconicoPassword.trim()) {
        setError('ニコニコアカウントのパスワードを入力してください');
        setLoading(false);
        return;
      }

      // APIリクエストの構築
      const requestBody: MylistRegisterRequest = {
        maxCount: formData.maxCount,
        favoriteOnly: formData.favoriteOnly,
        excludeSkip: formData.excludeSkip,
        mylistName: formData.mylistName,
        niconicoAccount: {
          email: formData.niconicoEmail,
          password: formData.niconicoPassword,
        },
      };

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
            errorMessage = errorData.error?.message || errorMessage;
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

      // フォームをリセット（パスワードのみクリア）
      setFormData({
        ...formData,
        niconicoPassword: '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          マイリスト登録設定
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
          {/* エラーメッセージ */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* 登録条件 */}
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            登録条件
          </Typography>

          <TextField
            label="登録する最大動画数"
            type="number"
            value={formData.maxCount}
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
                  maxCount: Math.max(1, Math.min(50, numValue)),
                });
              }
            }}
            fullWidth
            margin="normal"
            required
            inputProps={{ min: 1, max: 50 }}
            helperText="1〜50の範囲で指定してください"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.favoriteOnly}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    favoriteOnly: e.target.checked,
                  })
                }
              />
            }
            label="お気に入りのみを対象にする"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={formData.excludeSkip}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    excludeSkip: e.target.checked,
                  })
                }
              />
            }
            label="スキップ動画を除外する"
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
            margin="normal"
            required
            helperText="ニコニコ動画に作成されるマイリストの名前"
          />

          {/* ニコニコアカウント */}
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
            ニコニコアカウント
          </Typography>

          <Alert severity="warning" sx={{ mb: 2 }}>
            <strong>セキュリティに関する注意</strong>
            <br />
            現在、アカウント情報は平文でサーバーに送信され、バッチジョブの環境変数として一時的に使用されます。
            <br />
            本番運用前に、暗号化機能の実装が必要です（Issue 5-1 参照）。
            <br />
            <br />
            バッチ処理完了後、サーバー上には保存されません。
          </Alert>

          <TextField
            label="メールアドレス"
            type="email"
            value={formData.niconicoEmail}
            onChange={(e) =>
              setFormData({
                ...formData,
                niconicoEmail: e.target.value,
              })
            }
            fullWidth
            margin="normal"
            required
            autoComplete="email"
          />

          <TextField
            label="パスワード"
            type={showPassword ? 'text' : 'password'}
            value={formData.niconicoPassword}
            onChange={(e) =>
              setFormData({
                ...formData,
                niconicoPassword: e.target.value,
              })
            }
            fullWidth
            margin="normal"
            required
            autoComplete="current-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={handleTogglePasswordVisibility}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* 実行ボタン */}
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loading}
              startIcon={loading && <CircularProgress size={20} />}
            >
              {loading ? '登録中...' : 'マイリストに登録'}
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
