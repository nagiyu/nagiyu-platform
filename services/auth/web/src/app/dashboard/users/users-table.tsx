'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
} from '@mui/material';
import { Button, Chip, ErrorAlert, LoadingState } from '@nagiyu/ui';
import Link from 'next/link';
import type { User } from '@nagiyu/common';

interface UsersTableProps {
  canAssignRoles: boolean;
}

// 見出しと操作列は、列が狭いときに途中で改行されると読みにくい
const NO_WRAP_CELL_SX = { whiteSpace: 'nowrap' } as const;

// 長いメールアドレスは折り返す。最小幅が無いと他の列に幅を取られて、短いアドレスまで割れる
const EMAIL_CELL_SX = { minWidth: 200, overflowWrap: 'anywhere' } as const;

// 最小幅が無いと名前が 1 文字ずつ割れるほど潰される。セルの余白を含むため、4〜5 文字の名前が 1 行に収まる幅にする
const NAME_CELL_SX = { minWidth: '8em' } as const;

export function UsersTable({ canAssignRoles }: UsersTableProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        // 次ページを取得する UI が無いため、1 回で取れる上限まで取得する
        const response = await fetch('/api/users?limit=100');
        if (!response.ok) {
          throw new Error('ユーザー一覧の取得に失敗しました');
        }
        const data = await response.json();
        // Validate response structure
        if (!data || typeof data !== 'object') {
          throw new Error('不正なレスポンス形式です');
        }
        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  if (loading) {
    return <LoadingState variant="inline" />;
  }

  if (error) {
    return <ErrorAlert message={error} />;
  }

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={NO_WRAP_CELL_SX}>名前</TableCell>
            <TableCell sx={NO_WRAP_CELL_SX}>メールアドレス</TableCell>
            <TableCell sx={NO_WRAP_CELL_SX}>ロール</TableCell>
            <TableCell align="right" sx={NO_WRAP_CELL_SX}>
              アクション
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.userId}>
              <TableCell sx={NAME_CELL_SX}>{user.name}</TableCell>
              <TableCell sx={EMAIL_CELL_SX}>{user.email}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {user.roles.length > 0 ? (
                    user.roles.map((role) => (
                      <Chip key={role} size="sm">
                        {role}
                      </Chip>
                    ))
                  ) : (
                    <Chip size="sm">なし</Chip>
                  )}
                </Box>
              </TableCell>
              <TableCell align="right" sx={NO_WRAP_CELL_SX}>
                {canAssignRoles && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/users/${user.userId}/edit`}>編集</Link>
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {users.length === 0 && (
        <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
          ユーザーが見つかりませんでした
        </Box>
      )}
    </TableContainer>
  );
}
