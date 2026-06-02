'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Box, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { Chip, Link } from '@nagiyu/ui';
import type { NoteListItem } from '@/lib/notes/types';
import { fetchNote } from '@/lib/notes/api-client';
import { formatNoteDate } from '@/lib/notes/messages';

interface NoteDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * ノート詳細画面（`/notes/[id]`）。
 *
 * タイトル・カテゴリ・作成日・本文を表示する閲覧専用画面。
 * 本文はキャラがまとめた要約 + コメントで構成される（generate-note usecase 参照）。
 */
export default function NoteDetailPage({ params }: NoteDetailPageProps) {
  const { id } = use(params);
  const [note, setNote] = useState<NoteListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const item = await fetchNote(id);
      setNote(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ノートの取得に失敗しました');
      setNote(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Container maxWidth="sm" sx={{ py: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Link href="/notes">← ノート一覧へ</Link>
      </Box>

      {loading && (
        <Box
          sx={{ display: 'flex', justifyContent: 'center', py: 4 }}
          data-testid="note-detail-loading"
        >
          <CircularProgress />
        </Box>
      )}

      {!loading && error && (
        <Typography color="error" variant="body2" role="alert">
          {error}
        </Typography>
      )}

      {!loading && !error && note && (
        <Box component="article">
          <Typography variant="h6" component="h1" sx={{ mb: 1 }}>
            {note.title}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
            <Chip variant="outline" size="sm">
              {note.relatedCategory}
            </Chip>
            <Typography variant="caption" color="text.secondary">
              {formatNoteDate(note.createdAt)}
            </Typography>
          </Stack>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
            {note.body}
          </Typography>
        </Box>
      )}
    </Container>
  );
}
