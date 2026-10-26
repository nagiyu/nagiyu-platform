'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Container, Typography } from '@mui/material';
import MemoryList from '@/components/MemoryList';
import MemoryDeleteDialog from '@/components/MemoryDeleteDialog';
import type { SelfFactListItem } from '@/lib/memory/types';
import { deleteSelfFact, fetchSelfFacts } from '@/lib/memory/api-client';
import { getMemoryPageGuidance } from '@/lib/memory/messages';
import { useCharacter } from '@/lib/characters/CharacterContext';

/**
 * SCR-MEM 記憶閲覧・削除画面（`/memory`）（リブトーク知識再設計 P2 / #3698）。
 *
 * SELF fact（私についての事実）を Topic（subject）ごとにグルーピングして一覧表示し、
 * 決定的削除（忘却）を行う。編集機能は無く、内容を変えたい場合はキャラへの会話で訂正する。
 * 選択中のキャラクターに応じた記憶を表示する（キャラ切替時に再取得）。
 */
export default function MemoryPage() {
  const { characterId } = useCharacter();
  const [items, setItems] = useState<SelfFactListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SelfFactListItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  // レースコンディション対策: 最新リクエストのみ state を更新する
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const fetched = await fetchSelfFacts(characterId);
      if (reqId !== reqIdRef.current) return; // 古いリクエストは破棄
      setItems(fetched);
    } catch (e) {
      if (reqId !== reqIdRef.current) return; // 古いリクエストは破棄
      setError(e instanceof Error ? e.message : '記憶の取得に失敗しました');
      setItems([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await deleteSelfFact(deleting.id, characterId);
    } catch (e) {
      // ダイアログが開いたままなので、失敗はダイアログ内に出す
      setDeleteError(e instanceof Error ? e.message : '記憶の削除に失敗しました');
      setDeletePending(false);
      return;
    }
    try {
      // 再取得の失敗は一覧のエラーとして出すため、ダイアログは閉じる
      setDeleting(null);
      await load();
    } finally {
      setDeletePending(false);
    }
  }, [deleting, load, characterId]);

  const handleDeleteOpen = useCallback((item: SelfFactListItem) => {
    setDeleteError(null);
    setDeleting(item);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    setDeleteError(null);
    setDeleting(null);
  }, []);

  return (
    <Container maxWidth="sm" sx={{ py: 2 }}>
      <Typography variant="h6" component="h1" sx={{ mb: 0.5 }}>
        私が覚えていること
      </Typography>
      <Alert severity="info" icon={false} sx={{ mb: 2, fontSize: '0.875rem', py: 0.5 }}>
        {getMemoryPageGuidance(characterId)}
      </Alert>

      <Box sx={{ mt: 2 }}>
        {error && (
          <Typography
            color="error"
            variant="body2"
            role="alert"
            sx={{ mb: 1 }}
            data-testid="memory-error"
          >
            {error}
          </Typography>
        )}
        <MemoryList
          items={items}
          loading={loading}
          hasError={error !== null}
          onDelete={handleDeleteOpen}
        />
      </Box>

      <MemoryDeleteDialog
        item={deleting}
        loading={deletePending}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        error={deleteError}
        characterId={characterId}
      />
    </Container>
  );
}
