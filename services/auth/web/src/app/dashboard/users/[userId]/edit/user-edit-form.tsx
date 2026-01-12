'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { VALID_ROLES } from '@nagiyu/common';
import type { User } from '@nagiyu/common';

interface UserEditFormProps {
  userId: string;
}

export function UserEditForm({ userId }: UserEditFormProps) {
  const [user, setUser] = useState<User | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) {
          throw new Error('ユーザー情報の取得に失敗しました');
        }
        const data = await response.json();
        // Validate response structure
        if (!data || typeof data !== 'object' || !data.userId) {
          throw new Error('不正なレスポンス形式です');
        }
        setUser(data as User);
        setSelectedRoles(Array.isArray(data.roles) ? data.roles : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, [userId]);

  const handleRoleToggle = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: selectedRoles }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ロールの割り当てに失敗しました');
      }

      // 成功したらユーザー一覧に戻る
      router.push('/dashboard/users');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !user) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!user) {
    return <Alert severity="error">ユーザーが見つかりません</Alert>;
  }

  return (
    <Box sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        ユーザー編集
      </Typography>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" gutterBottom>
            <strong>名前:</strong> {user.name}
          </Typography>
          <Typography variant="body1" gutterBottom>
            <strong>メール:</strong> {user.email}
          </Typography>
          <Typography variant="body1" gutterBottom>
            <strong>ユーザーID:</strong> {user.userId}
          </Typography>
        </Box>

        <form onSubmit={handleSubmit}>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            ロール割り当て
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <FormGroup>
            {VALID_ROLES.map((role) => (
              <FormControlLabel
                key={role}
                control={
                  <Checkbox
                    checked={selectedRoles.includes(role)}
                    onChange={() => handleRoleToggle(role)}
                    disabled={saving}
                  />
                }
                label={role}
              />
            ))}
          </FormGroup>

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => router.push('/dashboard/users')}
              disabled={saving}
            >
              キャンセル
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
