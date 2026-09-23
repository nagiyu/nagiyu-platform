'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Container, Typography } from '@mui/material';
import { Link } from '@nagiyu/ui';
import NoteList from '@/components/NoteList';
import type { NoteListItem } from '@/lib/notes/types';
import { fetchNotes } from '@/lib/notes/api-client';
import { getNotePageGuidance } from '@/lib/notes/messages';
import { useCharacter } from '@/lib/characters/CharacterContext';

/**
 * ノート一覧画面（`/notes`）。
 *
 * 集約（consolidate）バッチの後段で Topic から生成したノートを「プレゼント」として一覧表示する。
 * 一覧 + 詳細閲覧のみ（編集機能なし、記憶 UI と同じ割り切り）。
 * 選択中のキャラクターに応じたノートを表示する（キャラ切替時に再取得）。
 */
export default function NotesPage() {
  const { characterId } = useCharacter();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // レースコンディション対策: 最新リクエストのみ state を更新する
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchNotes(characterId);
      if (reqId !== reqIdRef.current) return; // 古いリクエストは破棄
      setNotes(items);
    } catch (e) {
      if (reqId !== reqIdRef.current) return; // 古いリクエストは破棄
      setError(e instanceof Error ? e.message : 'ノートの取得に失敗しました');
      setNotes([]);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    load();
  }, [load, characterId]);

  return (
    <Container maxWidth="sm" sx={{ py: 2 }}>
      <Typography variant="h6" component="h1" sx={{ mb: 0.5 }}>
        ノート
      </Typography>
      <Alert severity="info" icon={false} sx={{ mb: 2, fontSize: '0.875rem', py: 0.5 }}>
        {getNotePageGuidance(characterId)}
      </Alert>

      <Box>
        {error && (
          <Typography color="error" variant="body2" role="alert" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}
        <NoteList notes={notes} loading={loading} characterId={characterId} />
      </Box>

      <Box sx={{ textAlign: 'center', mt: 3 }}>
        <Link href="/">チャットに戻る</Link>
      </Box>
    </Container>
  );
}
