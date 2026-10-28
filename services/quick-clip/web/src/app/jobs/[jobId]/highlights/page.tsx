'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';
import {
  Alert,
  Box,
  CircularProgress,
  Container,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Button, Chip, ErrorAlert, TextField } from '@nagiyu/ui';
import ReplayIcon from '@mui/icons-material/Replay';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import type { Highlight, JobStatus, TranscriptSegment } from '@/types/quick-clip';
import { ColumnVisibilityButton } from '@/components/highlights/ColumnVisibilityButton';
import { HIGHLIGHT_TABLE_COLUMNS } from '@/constants/highlightTableColumns';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';
import { isClipEditLocked } from '@/lib/highlight-edit-lock';

const ERROR_MESSAGES = {
  LOAD_FAILED: '見どころ一覧の取得に失敗しました',
  UPDATE_FAILED: '見どころの更新に失敗しました',
  RANGE_INVALID: '開始時刻は終了時刻より小さくしてください',
  REGENERATE_FAILED: 'クリップの再生成に失敗しました',
  CLIP_GENERATING: 'クリップを作り直している最中のため、変更できません',
  RECOVER_FAILED: '作り直しが止まった見どころの復旧に失敗しました',
  DOWNLOAD_FAILED: 'ダウンロードの開始に失敗しました',
  NO_HIGHLIGHTS: '見どころが検出されませんでした',
  JOB_NOT_FOUND: COMMON_ERROR_MESSAGES.JOB_NOT_FOUND,
  JOB_LOAD_FAILED: 'ジョブ情報の取得に失敗しました',
} as const;

const JOB_NOT_READY_MESSAGES = {
  IN_PROGRESS: 'まだ処理が終わっていません',
  FAILED: '処理に失敗しました',
  GO_TO_JOB: '処理状況を確認する',
} as const;

const DOWNLOAD_DISABLED_REASONS = {
  FAILED_CLIP: '生成に失敗したクリップが採用されています。リトライするか、採用を外してください',
  GENERATING: 'クリップの生成が終わるまでお待ちください',
} as const;

const INFO_MESSAGES = {
  EXPIRES_AT_PREFIX: 'データの有効期限: ',
} as const;
const HIGHLIGHT_SOURCE_LABELS = {
  motion: 'モーション',
  volume: '音量',
  emotion: '感情',
  both: '両方',
} as const;
const HIGHLIGHT_STATUS_LABELS = {
  unconfirmed: '未確認',
  accepted: '使える',
  rejected: '使えない',
} as const;
const HIGHLIGHT_STATUS_COLORS: Record<
  'unconfirmed' | 'accepted' | 'rejected',
  'neutral' | 'success' | 'danger'
> = {
  unconfirmed: 'neutral',
  accepted: 'success',
  rejected: 'danger',
} as const;

type HighlightsPageProps = {
  params: Promise<{ jobId: string }>;
};

type HighlightsResponse = {
  highlights: Array<Highlight & { clipUrl?: string }>;
};

type TranscriptResponse = {
  segments: TranscriptSegment[];
};

type DownloadResponse = {
  jobId: string;
  fileName: string;
  downloadUrl: string;
};

const ZIP_POLL_INTERVAL_MS = 3000;
const ZIP_POLL_TIMEOUT_MS = 300000;
const COLUMN_DEFINITIONS = [...HIGHLIGHT_TABLE_COLUMNS];
const OPTIONAL_COLUMNS = HIGHLIGHT_TABLE_COLUMNS.filter((col) => !col.fixed);

class RangeInvalidError extends Error {}
class ClipGeneratingError extends Error {}

type TimeInputProps = {
  value: number;
  min?: number;
  disabled?: boolean;
  onCommit: (value: number) => Promise<void>;
};

function TimeInput({ value, min = 0, disabled = false, onCommit }: TimeInputProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const handleBlur = async (): Promise<void> => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < min) {
      setDraft(String(value));
      return;
    }
    // 値が変わっていなければ送らない。送ると不要な作り直しが走り、入力も止まってしまう
    if (parsed === value) {
      return;
    }

    try {
      await onCommit(parsed);
    } catch {
      setDraft(String(value));
    }
  };

  return (
    <TextField
      size="sm"
      type="number"
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void handleBlur()}
    />
  );
}

export default function HighlightsPage({ params }: HighlightsPageProps) {
  const [jobId, setJobId] = useState<string>('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [clipUrls, setClipUrls] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  // 更新・作り直しを送信中の見どころ。サーバーの応答で clipStatus が変わるまでの間も入力を止める
  const [submittingIds, setSubmittingIds] = useState<ReadonlySet<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // ジョブの状態。取得前は null。見どころ一覧は COMPLETED と分かってから取る
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<
    typeof ERROR_MESSAGES.JOB_NOT_FOUND | typeof ERROR_MESSAGES.JOB_LOAD_FAILED | null
  >(null);
  // 0 件の表示は一覧の取得に成功したときだけにする。失敗時に「検出されなかった」と誤らせない
  const [hasLoadedHighlights, setHasLoadedHighlights] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const isFetchingRef = useRef(false);
  const { visibilityMap, toggleColumn } = useColumnVisibility(COLUMN_DEFINITIONS);

  useEffect(() => {
    let active = true;
    params.then((resolved) => {
      if (!active) {
        return;
      }
      setJobId((current) => (current === resolved.jobId ? current : resolved.jobId));
    });
    return () => {
      active = false;
    };
  }, [params]);

  const fetchHighlights = useCallback(
    async (options?: { isInitialLoad?: boolean; skipIfFetching?: boolean }): Promise<boolean> => {
      const isInitialLoad = options?.isInitialLoad ?? false;
      const skipIfFetching = options?.skipIfFetching ?? false;
      if (!jobId) {
        return false;
      }
      if (skipIfFetching && isFetchingRef.current) {
        return false;
      }
      isFetchingRef.current = true;
      try {
        // 強制終了などで GENERATING のまま止まった見どころを FAILED にしてから一覧を取る。
        // 復旧に失敗しても一覧は表示できるので止めない
        try {
          const recoverResponse = await fetch(`/api/jobs/${jobId}/highlights/recover`, {
            method: 'POST',
          });
          if (!recoverResponse.ok) {
            console.warn(ERROR_MESSAGES.RECOVER_FAILED, recoverResponse.status);
          }
        } catch (error) {
          console.warn(ERROR_MESSAGES.RECOVER_FAILED, error);
        }

        const response = await fetch(`/api/jobs/${jobId}/highlights`);
        if (!response.ok) {
          setErrorMessage(ERROR_MESSAGES.LOAD_FAILED);
          return false;
        }

        const data = (await response.json()) as HighlightsResponse;
        setHighlights(data.highlights);
        setHasLoadedHighlights(true);
        setClipUrls((current) => {
          const updated = { ...current };
          let changed = false;
          data.highlights.forEach((highlight) => {
            if (
              highlight.clipStatus === 'GENERATED' &&
              highlight.clipUrl &&
              !current[highlight.highlightId]
            ) {
              updated[highlight.highlightId] = highlight.clipUrl;
              changed = true;
            } else if (highlight.clipStatus !== 'GENERATED' && current[highlight.highlightId]) {
              delete updated[highlight.highlightId];
              changed = true;
            }
          });
          return changed ? updated : current;
        });
        // 一覧の取得は他の操作と並んで走る。取得に成功しても、その操作が出したメッセージは消さない
        setErrorMessage((current) => (current === ERROR_MESSAGES.LOAD_FAILED ? null : current));
        return true;
      } catch {
        setErrorMessage(ERROR_MESSAGES.LOAD_FAILED);
        return false;
      } finally {
        isFetchingRef.current = false;
        if (isInitialLoad) {
          setIsLoading(false);
        }
      }
    },
    [jobId]
  );

  useEffect(() => {
    if (!jobId || jobStatus !== 'COMPLETED') {
      return;
    }

    void fetchHighlights({ isInitialLoad: true });
  }, [fetchHighlights, jobId, jobStatus]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!active) return;
        if (res.status === 404) {
          setJobError(ERROR_MESSAGES.JOB_NOT_FOUND);
          setIsLoading(false);
          return;
        }
        if (!res.ok) {
          setJobError(ERROR_MESSAGES.JOB_LOAD_FAILED);
          setIsLoading(false);
          return;
        }
        const data = (await res.json()) as { status: JobStatus; expiresAt?: number };
        if (!active) return;
        if (typeof data.expiresAt === 'number') {
          setExpiresAt(data.expiresAt);
        }
        setJobStatus(data.status);
        // 一覧を取りに行かない状態では、一覧取得の完了で下ろされる読み込み表示をここで止める
        if (data.status !== 'COMPLETED') {
          setIsLoading(false);
        }
      } catch (error) {
        if (!active) return;
        console.warn(ERROR_MESSAGES.JOB_LOAD_FAILED, error);
        setJobError(ERROR_MESSAGES.JOB_LOAD_FAILED);
        setIsLoading(false);
      }
    };
    void fetchJob();
    return () => {
      active = false;
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const fetchTranscript = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/transcript`);
        if (!res.ok) return;
        const data = (await res.json()) as TranscriptResponse;
        setTranscriptSegments(data.segments ?? []);
      } catch (error) {
        // 文字起こし取得失敗は非致命的
        console.warn('文字起こしの取得に失敗しました', error);
      }
    };
    void fetchTranscript();
  }, [jobId]);

  const selectedHighlight = useMemo(() => {
    const highlight = highlights.find((item) => item.highlightId === selectedId);
    if (!highlight) {
      return null;
    }
    return { ...highlight, clipUrl: clipUrls[highlight.highlightId] };
  }, [clipUrls, highlights, selectedId]);

  const hasPendingOrGenerating = useMemo(
    () =>
      highlights.some(
        (highlight) => highlight.clipStatus === 'PENDING' || highlight.clipStatus === 'GENERATING'
      ),
    [highlights]
  );

  useEffect(() => {
    if (!jobId || !hasPendingOrGenerating) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchHighlights({ skipIfFetching: true });
    }, 3000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchHighlights, hasPendingOrGenerating, jobId]);

  const isSelectedClipEditLocked = selectedHighlight
    ? isClipEditLocked(
        selectedHighlight.clipStatus,
        submittingIds.has(selectedHighlight.highlightId)
      )
    : false;

  const acceptedCount = useMemo(
    () => highlights.filter((highlight) => highlight.status === 'accepted').length,
    [highlights]
  );
  const generatedCount = useMemo(
    () => highlights.filter((h) => h.clipStatus === 'GENERATED').length,
    [highlights]
  );
  const hasUngeneratedAcceptedClip = useMemo(
    () =>
      highlights.some(
        (highlight) => highlight.status === 'accepted' && highlight.clipStatus !== 'GENERATED'
      ),
    [highlights]
  );
  const hasFailedAcceptedClip = useMemo(
    () =>
      highlights.some(
        (highlight) => highlight.status === 'accepted' && highlight.clipStatus === 'FAILED'
      ),
    [highlights]
  );
  // 失敗の方が人の操作を要するので、両方あるときは失敗を優先して伝える
  const downloadDisabledReason = hasFailedAcceptedClip
    ? DOWNLOAD_DISABLED_REASONS.FAILED_CLIP
    : hasUngeneratedAcceptedClip
      ? DOWNLOAD_DISABLED_REASONS.GENERATING
      : null;

  const setSubmitting = (highlightId: string, isSubmitting: boolean): void => {
    setSubmittingIds((current) => {
      if (current.has(highlightId) === isSubmitting) {
        return current;
      }
      const next = new Set(current);
      if (isSubmitting) {
        next.add(highlightId);
      } else {
        next.delete(highlightId);
      }
      return next;
    });
  };

  // 画面の状態が古く、サーバー側ではすでに作り直し中だった場合に、画面を実際の状態に合わせる
  const onClipGeneratingConflict = async (): Promise<void> => {
    const isSynced = await fetchHighlights();
    // 一覧の取得に失敗したときは、その失敗のメッセージを残す
    if (isSynced) {
      setErrorMessage(ERROR_MESSAGES.CLIP_GENERATING);
    }
  };

  const updateHighlight = async (
    highlightId: string,
    values: {
      startSec?: number;
      endSec?: number;
      status?: 'accepted' | 'rejected' | 'unconfirmed';
    }
  ): Promise<void> => {
    const response = await fetch(`/api/jobs/${jobId}/highlights/${highlightId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(values),
    });

    if (response.status === 409) {
      throw new ClipGeneratingError(ERROR_MESSAGES.CLIP_GENERATING);
    }
    if (!response.ok) {
      throw new Error(ERROR_MESSAGES.UPDATE_FAILED);
    }

    const updated = (await response.json()) as Highlight;

    setHighlights((current) =>
      current.map((highlight) =>
        highlight.highlightId === updated.highlightId ? updated : highlight
      )
    );

    if (updated.clipStatus !== 'GENERATED') {
      setClipUrls((current) => {
        if (!current[updated.highlightId]) return current;
        const next = { ...current };
        delete next[updated.highlightId];
        return next;
      });
    }
  };

  const onChangeStatus = async (
    highlight: Highlight,
    status: 'accepted' | 'rejected' | 'unconfirmed'
  ) => {
    try {
      await updateHighlight(highlight.highlightId, { status });
      setErrorMessage(null);
    } catch {
      setErrorMessage(ERROR_MESSAGES.UPDATE_FAILED);
    }
  };

  const onUpdateRange = async (
    highlight: Highlight,
    field: 'startSec' | 'endSec',
    value: number
  ): Promise<void> => {
    const startSec = field === 'startSec' ? value : highlight.startSec;
    const endSec = field === 'endSec' ? value : highlight.endSec;

    if (startSec >= endSec) {
      setErrorMessage(ERROR_MESSAGES.RANGE_INVALID);
      throw new RangeInvalidError(ERROR_MESSAGES.RANGE_INVALID);
    }

    setSubmitting(highlight.highlightId, true);
    try {
      await updateHighlight(highlight.highlightId, {
        startSec,
        endSec,
      });
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof ClipGeneratingError) {
        await onClipGeneratingConflict();
      } else {
        setErrorMessage(ERROR_MESSAGES.UPDATE_FAILED);
      }
      throw error;
    } finally {
      setSubmitting(highlight.highlightId, false);
    }
  };

  const onRegenerate = async (highlight: Highlight): Promise<void> => {
    setSubmitting(highlight.highlightId, true);
    try {
      const response = await fetch(
        `/api/jobs/${jobId}/highlights/${highlight.highlightId}/regenerate`,
        {
          method: 'POST',
        }
      );
      if (response.status === 409) {
        throw new ClipGeneratingError(ERROR_MESSAGES.CLIP_GENERATING);
      }
      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.REGENERATE_FAILED);
      }
      const updated = (await response.json()) as Highlight;
      setHighlights((current) =>
        current.map((item) => (item.highlightId === updated.highlightId ? updated : item))
      );
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof ClipGeneratingError) {
        await onClipGeneratingConflict();
      } else {
        setErrorMessage(ERROR_MESSAGES.REGENERATE_FAILED);
      }
    } finally {
      setSubmitting(highlight.highlightId, false);
    }
  };

  const onDownload = async () => {
    setIsDownloading(true);
    try {
      const postResponse = await fetch(`/api/jobs/${jobId}/download`, {
        method: 'POST',
      });

      if (!postResponse.ok && postResponse.status !== 202) {
        throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
      }

      const startTime = Date.now();
      while (true) {
        if (Date.now() - startTime > ZIP_POLL_TIMEOUT_MS) {
          throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
        }

        await new Promise((resolve) => setTimeout(resolve, ZIP_POLL_INTERVAL_MS));

        const getResponse = await fetch(`/api/jobs/${jobId}/download`);

        if (getResponse.status === 200) {
          const data = (await getResponse.json()) as DownloadResponse;
          const link = document.createElement('a');
          link.href = data.downloadUrl;
          link.download = data.fileName;
          link.click();
          link.remove();
          setErrorMessage(null);
          return;
        }

        if (getResponse.status !== 202) {
          throw new Error(ERROR_MESSAGES.DOWNLOAD_FAILED);
        }
      }
    } catch {
      setErrorMessage(ERROR_MESSAGES.DOWNLOAD_FAILED);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          見どころ確認画面
        </Typography>

        {isLoading && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
            <CircularProgress size={20} />
            <Typography>見どころを取得しています...</Typography>
          </Stack>
        )}

        {jobError && <ErrorAlert message={jobError} />}

        {(jobStatus === 'PENDING' || jobStatus === 'PROCESSING' || jobStatus === 'FAILED') && (
          <Stack spacing={2} sx={{ mb: 2, alignItems: 'flex-start' }}>
            <Alert severity={jobStatus === 'FAILED' ? 'error' : 'info'}>
              {jobStatus === 'FAILED'
                ? JOB_NOT_READY_MESSAGES.FAILED
                : JOB_NOT_READY_MESSAGES.IN_PROGRESS}
            </Alert>
            <Button asChild variant="outline">
              <Link href={`/jobs/${jobId}`}>{JOB_NOT_READY_MESSAGES.GO_TO_JOB}</Link>
            </Button>
          </Stack>
        )}

        {errorMessage && <ErrorAlert message={errorMessage} />}

        {expiresAt !== null && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {INFO_MESSAGES.EXPIRES_AT_PREFIX}
            {new Date(expiresAt).toLocaleString('ja-JP')}
          </Typography>
        )}

        {!isLoading && hasLoadedHighlights && highlights.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {ERROR_MESSAGES.NO_HIGHLIGHTS}
          </Alert>
        )}

        {highlights.length > 0 && (
          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
            {/* 左パネル: ディテール */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {!selectedHighlight ? (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 300,
                    border: '1px dashed',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography color="text.secondary">クリップを選択してください</Typography>
                </Box>
              ) : (
                <Stack spacing={2}>
                  {/* クリッププレビュー */}
                  {selectedHighlight.clipStatus === 'GENERATED' && (
                    <video
                      key={selectedHighlight.highlightId}
                      controls
                      aria-label="見どころ動画プレビュー"
                      src={selectedHighlight.clipUrl}
                      style={{ width: '100%' }}
                    >
                      お使いのブラウザは video 要素に対応していません。
                    </video>
                  )}
                  {(selectedHighlight.clipStatus === 'PENDING' ||
                    selectedHighlight.clipStatus === 'GENERATING') && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 200,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <CircularProgress size={20} />
                        <Typography>クリップ生成中...</Typography>
                      </Stack>
                    </Box>
                  )}
                  {selectedHighlight.clipStatus === 'FAILED' && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 200,
                        border: '1px solid',
                        borderColor: 'error.main',
                        borderRadius: 1,
                        color: 'error.main',
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <ErrorOutlineIcon />
                        <Typography>クリップ生成に失敗しました</Typography>
                      </Stack>
                    </Box>
                  )}

                  {/* クリップ情報 */}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      #{selectedHighlight.order} |{' '}
                      {HIGHLIGHT_SOURCE_LABELS[selectedHighlight.source]}
                    </Typography>
                  </Box>

                  {/* 文字起こしセクション */}
                  {(() => {
                    const filteredSegments = transcriptSegments.filter(
                      (seg) =>
                        seg.start < selectedHighlight.endSec && seg.end > selectedHighlight.startSec
                    );
                    if (filteredSegments.length === 0) return null;
                    return (
                      <Box>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          文字起こし:
                        </Typography>
                        <Box
                          sx={{
                            p: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            bgcolor: 'grey.50',
                            maxHeight: 160,
                            overflowY: 'auto',
                          }}
                        >
                          {filteredSegments.map((seg, index) => (
                            <Typography key={index} variant="body2" sx={{ lineHeight: 1.6 }}>
                              {seg.text}
                            </Typography>
                          ))}
                        </Box>
                      </Box>
                    );
                  })()}

                  {/* 採否ステータス */}
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      採否ステータス:
                    </Typography>
                    <RadioGroup
                      row
                      value={selectedHighlight.status}
                      onChange={(event) => {
                        const val = event.target.value;
                        if (val !== 'unconfirmed' && val !== 'accepted' && val !== 'rejected') {
                          return;
                        }
                        void onChangeStatus(selectedHighlight, val);
                      }}
                    >
                      <FormControlLabel
                        value="unconfirmed"
                        control={<Radio size="small" />}
                        label="未確認"
                      />
                      <FormControlLabel
                        value="accepted"
                        control={<Radio size="small" />}
                        label="使える"
                      />
                      <FormControlLabel
                        value="rejected"
                        control={<Radio size="small" />}
                        label="使えない"
                      />
                    </RadioGroup>
                  </Box>

                  {/* 時間調整。作り直しの間は入力を止める */}
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        開始(秒):
                      </Typography>
                      <TimeInput
                        value={selectedHighlight.startSec}
                        min={0}
                        disabled={isSelectedClipEditLocked}
                        onCommit={(value) => onUpdateRange(selectedHighlight, 'startSec', value)}
                      />
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        終了(秒):
                      </Typography>
                      <TimeInput
                        value={selectedHighlight.endSec}
                        min={1}
                        disabled={isSelectedClipEditLocked}
                        onCommit={(value) => onUpdateRange(selectedHighlight, 'endSec', value)}
                      />
                    </Box>
                  </Stack>

                  {/* リトライボタン (FAILED 時のみ) */}
                  {selectedHighlight.clipStatus === 'FAILED' && (
                    <Button
                      variant="outline"
                      color="danger"
                      startIcon={<ReplayIcon />}
                      disabled={isSelectedClipEditLocked}
                      onClick={() => void onRegenerate(selectedHighlight)}
                    >
                      リトライ
                    </Button>
                  )}
                </Stack>
              )}
            </Box>

            {/* 右パネル: マスター一覧 */}
            <Box sx={{ width: 400, flexShrink: 0 }}>
              <Stack spacing={2}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: hasPendingOrGenerating ? 'space-between' : 'flex-end',
                    alignItems: 'center',
                  }}
                >
                  {hasPendingOrGenerating && (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2">
                        {generatedCount} / {highlights.length} 件生成済
                      </Typography>
                    </Stack>
                  )}
                  <ColumnVisibilityButton
                    columns={OPTIONAL_COLUMNS}
                    visibilityMap={visibilityMap}
                    onToggle={toggleColumn}
                  />
                </Box>
                <TableContainer
                  component={Paper}
                  variant="outlined"
                  sx={{ maxHeight: 480, overflow: 'auto' }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>No.</TableCell>
                        <TableCell>開始〜終了(秒)</TableCell>
                        <TableCell>採否</TableCell>
                        {visibilityMap['source'] && <TableCell>抽出根拠</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {highlights.map((highlight) => (
                        <TableRow
                          key={highlight.highlightId}
                          hover
                          selected={highlight.highlightId === selectedId}
                          onClick={() => setSelectedId(highlight.highlightId)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>#{highlight.order}</TableCell>
                          <TableCell>
                            {highlight.startSec}〜{highlight.endSec}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                              <Chip size="sm" color={HIGHLIGHT_STATUS_COLORS[highlight.status]}>
                                {HIGHLIGHT_STATUS_LABELS[highlight.status]}
                              </Chip>
                              {highlight.clipStatus === 'GENERATING' && (
                                <CircularProgress size={12} />
                              )}
                              {highlight.clipStatus === 'FAILED' && (
                                <ErrorOutlineIcon fontSize="small" color="error" />
                              )}
                            </Stack>
                          </TableCell>
                          {visibilityMap['source'] && (
                            <TableCell>{HIGHLIGHT_SOURCE_LABELS[highlight.source]}</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Typography variant="body2" color="text.secondary">
                  採用中の見どころ: {acceptedCount} 件
                </Typography>

                <Button
                  variant="solid"
                  onClick={onDownload}
                  loading={isDownloading}
                  disabled={acceptedCount === 0 || hasUngeneratedAcceptedClip}
                >
                  {isDownloading ? 'ダウンロード準備中...' : 'ZIP ダウンロード'}
                </Button>
                {downloadDisabledReason && (
                  <Typography variant="body2" color="text.secondary">
                    {downloadDisabledReason}
                  </Typography>
                )}
              </Stack>
            </Box>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
