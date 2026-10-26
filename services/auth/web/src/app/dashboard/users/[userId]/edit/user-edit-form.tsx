'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Paper, FormGroup } from '@mui/material';
import { Button, Checkbox, ErrorAlert, LoadingState } from '@nagiyu/ui';
import Link from 'next/link';
import { VALID_ROLES } from '@nagiyu/common';
import type { User } from '@nagiyu/common';
import { getRoleDescription, getRoleName } from '@/lib/role-display';

interface UserEditFormProps {
  userId: string;
}

const ERROR_MESSAGES = {
  USER_NOT_FOUND: 'ユーザーが見つかりません',
  FETCH_FAILED: 'ユーザー情報の取得に失敗しました',
  INVALID_RESPONSE: '不正なレスポンス形式です',
  ASSIGN_FAILED: 'ロールの割り当てに失敗しました',
  UNKNOWN: 'エラーが発生しました',
} as const;

const USERS_LIST_PATH = '/dashboard/users';

/**
 * ロール名の下に説明を小さく添えたラベル。
 * Checkbox の label は ReactNode を受け付けるため、auth 側で組み立てる。
 */
function RoleLabel({ roleId }: { roleId: string }) {
  const description = getRoleDescription(roleId);
  return (
    <>
      <span>{getRoleName(roleId)}</span>
      {description && (
        <Typography
          variant="caption"
          component="span"
          color="text.secondary"
          sx={{ display: 'block' }}
        >
          {description}
        </Typography>
      )}
    </>
  );
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
          // 存在しない ID は API が 404 を返す。再試行しても直らないため、取得失敗と区別して伝える
          throw new Error(
            response.status === 404 ? ERROR_MESSAGES.USER_NOT_FOUND : ERROR_MESSAGES.FETCH_FAILED
          );
        }
        const data = await response.json();
        // Validate response structure
        if (!data || typeof data !== 'object' || !data.userId) {
          throw new Error(ERROR_MESSAGES.INVALID_RESPONSE);
        }
        setUser(data as User);
        setSelectedRoles(Array.isArray(data.roles) ? data.roles : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : ERROR_MESSAGES.UNKNOWN);
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
        throw new Error(errorData.error || ERROR_MESSAGES.ASSIGN_FAILED);
      }

      // 成功したらユーザー一覧に戻る
      router.push(USERS_LIST_PATH);
    } catch (err) {
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.UNKNOWN);
      setSaving(false);
    }
  };

  // 取得に成功したかにかかわらず、見出しと一覧への導線を出して画面の文脈を失わせない
  const header = (
    <>
      <Box sx={{ mb: 2 }}>
        <Button asChild variant="outline" size="sm">
          <Link href={USERS_LIST_PATH}>ユーザー一覧へ戻る</Link>
        </Button>
      </Box>
      <Typography variant="h4" component="h1" gutterBottom>
        ユーザー編集
      </Typography>
    </>
  );

  if (loading) {
    return (
      <Box sx={{ py: 4 }}>
        {header}
        <LoadingState variant="inline" />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ py: 4 }}>
        {header}
        <ErrorAlert message={error ?? ERROR_MESSAGES.USER_NOT_FOUND} />
      </Box>
    );
  }

  return (
    <Box sx={{ py: 4 }}>
      {header}

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

          {error && <ErrorAlert message={error} />}

          <FormGroup>
            {VALID_ROLES.map((role) => (
              <Checkbox
                key={role}
                label={<RoleLabel roleId={role} />}
                checked={selectedRoles.includes(role)}
                onChange={() => handleRoleToggle(role)}
                disabled={saving}
              />
            ))}
          </FormGroup>

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button type="submit" variant="solid" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(USERS_LIST_PATH)}
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
