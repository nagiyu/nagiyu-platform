'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Container, Typography } from '@mui/material';
import type { Tier } from '@nagiyu/livetalk-core';
import MemoryTierTabs from '@/components/MemoryTierTabs';
import MemoryList from '@/components/MemoryList';
import MemoryDeleteDialog from '@/components/MemoryDeleteDialog';
import type { MemoryListItem } from '@/lib/memory/types';
import { deleteMemory, fetchMemories, pinMemory } from '@/lib/memory/api-client';
import { MEMORY_PAGE_GUIDANCE } from '@/lib/memory/messages';

/**
 * SCR-004 記憶閲覧・削除画面（`/memory`）。
 *
 * Tier A/B/C 別タブで記憶を一覧表示し、削除・固定を行う。
 * 編集機能は Issue #3308 で撤去。内容を変えたい場合はキャラへの会話で訂正する設計。
 */
export default function MemoryPage() {
  const [tier, setTier] = useState<Tier>('A');
  const [memories, setMemories] = useState<MemoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<MemoryListItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const load = useCallback(async (target: Tier) => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchMemories(target);
      setMemories(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : '記憶の取得に失敗しました');
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tier);
  }, [tier, load]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting) return;
    setDeletePending(true);
    setError(null);
    try {
      await deleteMemory(deleting.id);
      setDeleting(null);
      await load(tier);
    } catch (e) {
      setError(e instanceof Error ? e.message : '記憶の削除に失敗しました');
    } finally {
      setDeletePending(false);
    }
  }, [deleting, tier, load]);

  const handlePin = useCallback(
    async (memory: MemoryListItem) => {
      setError(null);
      try {
        await pinMemory(memory.id);
        await load(tier);
      } catch (e) {
        setError(e instanceof Error ? e.message : '記憶の固定に失敗しました');
      }
    },
    [tier, load]
  );

  return (
    <Container maxWidth="sm" sx={{ py: 2 }}>
      <Typography variant="h6" component="h1" sx={{ mb: 0.5 }}>
        私が覚えていること
      </Typography>
      <Alert severity="info" icon={false} sx={{ mb: 2, fontSize: '0.875rem', py: 0.5 }}>
        {MEMORY_PAGE_GUIDANCE}
      </Alert>

      <MemoryTierTabs value={tier} onChange={setTier} />

      <Box sx={{ mt: 2 }}>
        {error && (
          <Typography color="error" variant="body2" role="alert" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}
        <MemoryList
          memories={memories}
          loading={loading}
          onDelete={setDeleting}
          onPin={handlePin}
        />
      </Box>

      <MemoryDeleteDialog
        memory={deleting}
        loading={deletePending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleting(null)}
      />
    </Container>
  );
}
