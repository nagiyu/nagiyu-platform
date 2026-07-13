'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { Box, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { Link } from '@nagiyu/ui';
import type { NoteListItem } from '@/lib/notes/types';
import { fetchNote } from '@/lib/notes/api-client';
import { formatNoteDate } from '@/lib/notes/messages';
import NoteMarkdown from '@/components/NoteMarkdown';

interface NoteDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * ノート詳細画面（`/notes/[id]`）。
 *
 * 主題（subject）・贈られた日付・手紙本文（headline、贈った瞬間の不変記録）を表示する。
 * 「調べた内容（最新）」「出典」は参照先 Topic の最新状態を都度反映するため、
 * 開くたびに中身が生きている（headline は不変・中身は生きる、design 参照）。
 * 一覧 + 詳細閲覧のみ（編集なし）。
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
          <Typography variant="h6" component="h1" sx={{ mb: 0.5 }}>
            {note.subject}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            {formatNoteDate(note.sharedAt)}
          </Typography>

          <NoteMarkdown content={note.headline ?? ''} />

          {note.webFacts && note.webFacts.length > 0 && (
            <Box sx={{ mt: 3 }} data-testid="note-detail-web-facts">
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                調べた内容（最新）
              </Typography>
              <Stack component="ul" spacing={0.5} sx={{ pl: 3, m: 0 }}>
                {note.webFacts.map((fact, index) => (
                  <Typography key={index} component="li" variant="body2">
                    {fact}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}

          {note.sources && note.sources.length > 0 && (
            <Box sx={{ mt: 2 }} data-testid="note-detail-sources">
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                出典
              </Typography>
              <Stack spacing={0.5}>
                {note.sources.map((url, index) => (
                  <Link key={index} href={url} target="_blank" rel="noopener noreferrer">
                    {url}
                  </Link>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      )}
    </Container>
  );
}
