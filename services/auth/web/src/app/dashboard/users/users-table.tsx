'use client';

import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Alert,
  CircularProgress,
  Box,
} from '@mui/material';
import Link from 'next/link';
import type { User } from '@nagiyu/common';

interface UsersTableProps {
  canAssignRoles: boolean;
}

export function UsersTable({ canAssignRoles }: UsersTableProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) {
          throw new Error('ユーザー一覧の取得に失敗しました');
        }
        const data = await response.json();
        setUsers(data.users || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>名前</TableCell>
            <TableCell>メールアドレス</TableCell>
            <TableCell>ロール</TableCell>
            <TableCell align="right">アクション</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.userId}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <Chip key={role} label={role} size="small" sx={{ mr: 0.5 }} />
                  ))
                ) : (
                  <Chip label="なし" size="small" color="default" />
                )}
              </TableCell>
              <TableCell align="right">
                {canAssignRoles && (
                  <Button
                    component={Link}
                    href={`/dashboard/users/${user.userId}/edit`}
                    variant="outlined"
                    size="small"
                  >
                    編集
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
