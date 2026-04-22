'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import type { BatchStage, JobStatus } from '@/types/quick-clip';
import { VideoAd } from './VideoAd';

const POLLING_INTERVAL_MS = 5000;

const ERROR_MESSAGES = {
  LOAD_FAILED: 'ジョブ情報の取得に失敗しました',
  NOT_FOUND: '指定されたジョブが見つかりません',
} as const;

const STATUS_LABELS: Record<JobStatus, string> = {
  PENDING: '処理待ち',
  PROCESSING: '処理中',
  COMPLETED: '処理完了',
  FAILED: '処理失敗',
};

const STATUS_COLORS: Record<JobStatus, 'warning' | 'info' | 'success' | 'error'> = {
  PENDING: 'warning',
  PROCESSING: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
};

const BATCH_STAGE_LABELS: Record<BatchStage, string> = {
  downloading: 'ダウンロード中',
  analyzing: '解析中',
  aggregating: '集計中',
};

const INFO_MESSAGES = {
  TAB_CLOSE_OK: 'タブを閉じても処理は続きます。URLを控えておくと後で確認できます。',
  EXPIRES_AT_PREFIX: 'データの有効期限: ',
} as const;

type JobPageProps = {
  params: Promise<{ jobId: string }>;
};

type JobApiResponse = {
  jobId: string;
  status: JobStatus;
  originalFileName: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number;
  batchStage?: BatchStage;
  errorMessage?: string;
  downloadUrl?: string;
};

export default function JobPage({ params }: JobPageProps) {
  const [jobId, setJobId] = useState<string>('');
  const [job, setJob] = useState<JobApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [adFinished, setAdFinished] = useState(false);

  useEffect(() => {
    params.then((resolved) => {
      setJobId(resolved.jobId);
    });
  }, [params]);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let active = true;

    const fetchJob = async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);

        if (!active) {
          return;
        }

        if (response.status === 404) {
          setErrorMessage(ERROR_MESSAGES.NOT_FOUND);
          setIsLoading(false);
          return;
        }

        if (!response.ok) {
          setErrorMessage(ERROR_MESSAGES.LOAD_FAILED);
          setIsLoading(false);
          return;
        }

        const data = (await response.json()) as JobApiResponse;
        setJob(data);
        setErrorMessage(null);
      } catch {
        if (!active) {
          return;
        }
        setErrorMessage(ERROR_MESSAGES.LOAD_FAILED);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void fetchJob();
    const timer = setInterval(() => {
      void fetchJob();
    }, POLLING_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [jobId]);

  const canMoveToHighlights = useMemo(
    () => job?.status === 'COMPLETED' && adFinished,
    [job?.status, adFinished]
  );

  const activeStep = useMemo(() => {
    if (!job) return 1;
    if (job.status === 'COMPLETED') return 2;
    return 1; // PENDING, PROCESSING, FAILED
  }, [job]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          処理中画面
        </Typography>

        {isLoading && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <CircularProgress size={20} />
            <Typography>ステータスを確認しています...</Typography>
          </Stack>
        )}

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        )}

        {job && (
          <Stack spacing={2}>
            <Stepper activeStep={activeStep} alternativeLabel>
              <Step completed={true}>
                <StepLabel>アップロード</StepLabel>
              </Step>
              <Step>
                <StepLabel
                  optional={
                    job.status === 'PROCESSING' && job.batchStage ? (
                      <Typography variant="caption">
                        {BATCH_STAGE_LABELS[job.batchStage]}
                      </Typography>
                    ) : undefined
                  }
                >
                  解析
                </StepLabel>
              </Step>
              <Step>
                <StepLabel>切り出し</StepLabel>
              </Step>
            </Stepper>

            <Typography>ジョブID: {job.jobId}</Typography>
            <Chip
              label={STATUS_LABELS[job.status]}
              color={STATUS_COLORS[job.status]}
              sx={{ width: 'fit-content' }}
            />

            {(job.status === 'PENDING' || job.status === 'PROCESSING') && (
              <Typography color="text.secondary">{INFO_MESSAGES.TAB_CLOSE_OK}</Typography>
            )}

            <Typography variant="body2" color="text.secondary">
              {INFO_MESSAGES.EXPIRES_AT_PREFIX}
              {new Date(job.expiresAt * 1000).toLocaleString('ja-JP')}
            </Typography>

            {job.status === 'FAILED' && (
              <Typography color="error">{job.errorMessage ?? '処理に失敗しました'}</Typography>
            )}

            {job.status !== 'FAILED' && !adFinished && (
              <VideoAd onAdFinished={() => setAdFinished(true)} />
            )}

            {canMoveToHighlights && (
              <Button href={`/jobs/${job.jobId}/highlights`} component={Link} variant="contained">
                見どころを確認する
              </Button>
            )}

            {job.status === 'FAILED' && (
              <Button href="/" component={Link} variant="outlined">
                再アップロードする
              </Button>
            )}
          </Stack>
        )}
      </Paper>
    </Container>
  );
}
