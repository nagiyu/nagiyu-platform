'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Card,
  CardContent,
  Typography,
} from '@mui/material';
import { Button, Chip, ErrorAlert, LoadingState } from '@nagiyu/ui';
import Link from 'next/link';
import { getRoleName } from '@nagiyu/common';
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

// カード内の項目名と値を縦に積む。メールアドレスは長いので、カードやページを横に広げないよう折り返す
const CARD_VALUE_SX = { overflowWrap: 'anywhere' } as const;

/** 手動ロールの札。ロールが無ければ「なし」を出す */
function RoleChips({ roles }: { roles: string[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {roles.length > 0 ? (
        roles.map((role) => (
          <Chip key={role} size="sm">
            {getRoleName(role)}
          </Chip>
        ))
      ) : (
        <Chip size="sm">なし</Chip>
      )}
    </Box>
  );
}

/** カードの 1 項目。項目名を添えて、表の見出しなしでも読めるようにする */
function CardField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      {children}
    </Box>
  );
}

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
    <>
      {/* 幅の切り替えは CSS で行い、初回描画でちらつかないようにする。600px 未満はカード、以上は表 */}
      <TableContainer data-testid="users-table" sx={{ display: { xs: 'none', sm: 'block' } }}>
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
                  <RoleChips roles={user.roles} />
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
      </TableContainer>
      <Box
        data-testid="users-cards"
        sx={{ display: { xs: 'flex', sm: 'none' }, flexDirection: 'column', gap: 2 }}
      >
        {users.map((user) => (
          <Card key={user.userId} variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="h6" component="h2" sx={CARD_VALUE_SX}>
                {user.name}
              </Typography>
              <CardField label="メールアドレス">
                <Typography variant="body2" sx={CARD_VALUE_SX}>
                  {user.email}
                </Typography>
              </CardField>
              <CardField label="ロール">
                <RoleChips roles={user.roles} />
              </CardField>
              {canAssignRoles && (
                <Box>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/users/${user.userId}/edit`}>編集</Link>
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        ))}
      </Box>
      {users.length === 0 && (
        <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
          ユーザーが見つかりませんでした
        </Box>
      )}
    </>
  );
}
