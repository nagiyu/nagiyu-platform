'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { COMMON_ERROR_MESSAGES, formatFileSize } from '@nagiyu/common';
import { useRouter } from 'next/navigation';
import { Alert, Box, Container, LinearProgress, Paper, Typography } from '@mui/material';
import { Button, ErrorAlert, buildPlansUrl, buildSignInUrl } from '@nagiyu/ui';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { getVideoDurationSec } from '@/lib/get-video-duration';
import { validateUploadFile } from '@/lib/upload-validation';
import {
  buildDurationExceededMessage,
  checkVideoDuration,
  hasAiRemaining,
  isUsageExhaustedForSelection,
  parseUsageSummary,
  readLimitErrorCode,
  resolveLimitGuidance,
  type LimitErrorCode,
  type UsageSummary,
} from '@/lib/usage-guidance';
import { useAuthUrl } from '@/components/AuthUrlProvider';
import { useBeforeUnloadWarning } from '@/hooks/useBeforeUnloadWarning';
import { LimitGuidanceActions } from '@/components/upload/LimitGuidanceActions';
import { UsageOptions } from '@/components/upload/UsageOptions';

const ERROR_MESSAGES = {
  SELECT_FILE: '動画ファイルを選択してください',
  CREATE_JOB_FAILED: 'アップロード処理の開始に失敗しました',
  INVALID_UPLOAD_PARAMETERS: 'アップロードパラメータが不正です',
  UPLOAD_FAILED: '動画ファイルのアップロードに失敗しました',
  COMPLETE_UPLOAD_FAILED: 'アップロード完了処理に失敗しました',
  UNKNOWN: '予期しないエラーが発生しました',
} as const;

const LOG_MESSAGES = {
  UPLOAD_FAILED: '動画アップロードに失敗しました',
  ABORT_UPLOAD_FAILED: 'マルチパートアップロード中断処理に失敗しました',
  UPLOAD_EXCEPTION: '動画アップロード時に予期しないエラーが発生しました',
  COMPLETE_UPLOAD_FAILED: 'マルチパートアップロード完了処理に失敗しました',
  INVALID_MULTIPART_PARAMETERS: 'マルチパートアップロードパラメータが不正です',
  USAGE_FETCH_FAILED: '利用状況の取得に失敗しました',
  UNKNOWN: 'アップロード処理の開始時に予期しないエラーが発生しました',
  NETWORK_ERROR: COMMON_ERROR_MESSAGES.NETWORK_ERROR_OCCURRED,
} as const;

const CONSTRAINT_MESSAGES = {
  NO_TAB_CLOSE: 'アップロード中はタブを閉じないでください。',
  DATA_EXPIRES: 'データは 24 時間で自動削除されます。',
} as const;

const ACCEPTED_FILE_TYPE = 'video/mp4';

type CreateJobResponse = {
  jobId: string;
  uploadUrl?: string;
  multipart?: {
    uploadId: string;
    uploadUrls: string[];
    chunkSize: number;
  };
};

type CreateJobFailure = {
  message: string;
  /** 上限で断られたときのエラーコード。それ以外は null */
  limitCode: LimitErrorCode | null;
};

/**
 * ジョブ作成の失敗応答からサーバーが返した理由を取り出す。
 * 本文が JSON でない・message が無い場合も例外にせず固定文言へ戻す。
 */
const readFailure = async (response: Response): Promise<CreateJobFailure> => {
  try {
    const body: unknown = await response.json();
    const limitCode = readLimitErrorCode(body);
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };
      if (typeof message === 'string' && message.trim() !== '') {
        return { message, limitCode };
      }
    }
    return { message: ERROR_MESSAGES.CREATE_JOB_FAILED, limitCode };
  } catch {
    // 本文が読めない場合は固定文言を使う
    return { message: ERROR_MESSAGES.CREATE_JOB_FAILED, limitCode: null };
  }
};

export default function Home() {
  // クライアントで env を読むとビルド時に空になるため、レイアウトがランタイム env から渡した値を使う
  const authUrl = useAuthUrl();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 取得に失敗したら null のままにし、残りの表示とスイッチを出さずサーバー側の省略時の扱いに任せる
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState(false);
  const [durationSec, setDurationSec] = useState<number | undefined>(undefined);
  const [limitCode, setLimitCode] = useState<LimitErrorCode | null>(null);
  // ログイン・プランの画面から今の URL へ戻すため。SSR 時は window が無いので描画後に決める
  const [currentUrl, setCurrentUrl] = useState('');
  // 選択直後に読んだ長さを送信時にも使い、同じ動画を二度読まない
  const durationPromiseRef = useRef<Promise<number | undefined> | null>(null);
  // スイッチの既定値は初めて残りを読めたときだけ入れる。読み直しのたびに入れると、利用者が off にした選択が戻る
  const hasLoadedUsageRef = useRef(false);

  const loadUsage = useCallback(async () => {
    try {
      const response = await fetch('/api/usage');
      if (!response.ok) {
        return;
      }
      const loaded = parseUsageSummary(await response.json());
      if (loaded) {
        setUsage(loaded);
        if (hasLoadedUsageRef.current) {
          // 2 回目以降は利用者の選択を残し、AI ありの残りが尽きたときだけ off に固定する
          setAiAnalysis((prev) => prev && hasAiRemaining(loaded));
        } else {
          hasLoadedUsageRef.current = true;
          setAiAnalysis(hasAiRemaining(loaded));
        }
      }
    } catch (error) {
      console.error(LOG_MESSAGES.USAGE_FETCH_FAILED, error);
    }
  }, []);

  useEffect(() => {
    setCurrentUrl(window.location.href);
    void loadUsage();
  }, [loadUsage]);
  // 送信開始から画面遷移までの全体を守る。転送中だけだと、ジョブ作成や完了処理の最中に閉じられて中途半端なジョブが残る
  useBeforeUnloadWarning(isSubmitting);
  // 選択中ファイルが不正なら送信させない。エラー表示は他の失敗でも使うため別に導出する
  const isFileInvalid = file !== null && validateUploadFile(file) !== null;
  // 長さが読めない場合は事前には止めず、サーバー側の判定に任せる
  const durationCheck =
    usage && durationSec !== undefined
      ? checkVideoDuration(durationSec, usage.limits.maxDurationSec)
      : null;
  // 残りを読めたときだけ止める。読めなかったときはサーバーの判定に任せる
  const isUsageExhausted = usage !== null && isUsageExhaustedForSelection(usage, aiAnalysis);
  const signInHref = buildSignInUrl(authUrl, currentUrl);
  const plansHref = buildPlansUrl(authUrl, currentUrl);
  const tier = usage?.tier ?? null;

  const setSelectedFile = (selected: File | null) => {
    setFile(selected);
    setDurationSec(undefined);
    setLimitCode(null);
    // 不正なファイルは選択時点で知らせ、送信してからサーバーに拒否されるのを待たせない
    const validationError = selected ? validateUploadFile(selected) : null;
    setErrorMessage(validationError);
    if (!selected || validationError) {
      durationPromiseRef.current = null;
      return;
    }
    // 上限超過は送信前に知らせたいので、選択時に長さを読む。選び直された後の結果は捨てる
    const promise = getVideoDurationSec(selected);
    durationPromiseRef.current = promise;
    void promise.then((duration) => {
      if (durationPromiseRef.current === promise) {
        setDurationSec(duration);
      }
    });
  };

  const onSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setSelectedFile(selected);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0] ?? null;
    setSelectedFile(selected);
  };

  const resetSubmitting = () => {
    setIsSubmitting(false);
    setUploadProgress(null);
  };

  const uploadWithProgress = (url: string, fileToUpload: File): Promise<void> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', ACCEPTED_FILE_TYPE);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress(100);
          resolve();
        } else {
          reject(new Error(`${LOG_MESSAGES.UPLOAD_FAILED}: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error(LOG_MESSAGES.NETWORK_ERROR));
      xhr.send(fileToUpload);
    });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setErrorMessage(ERROR_MESSAGES.SELECT_FILE);
      return;
    }

    const validationError = validateUploadFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (durationCheck?.exceeded || isUsageExhausted) {
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    setErrorMessage(null);
    setLimitCode(null);

    try {
      const videoDurationSec = await (durationPromiseRef.current ?? getVideoDurationSec(file));

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          // 空文字はサーバーで不正扱いになるため、判別できない場合は送らない
          ...(file.type ? { contentType: file.type } : {}),
          ...(videoDurationSec !== undefined ? { durationSec: videoDurationSec } : {}),
          // 残りを読めなかったときは送らず、サーバー側の省略時の扱いに任せる
          ...(usage ? { aiAnalysis } : {}),
        }),
      });

      if (!response.ok) {
        const failure = await readFailure(response);
        setErrorMessage(failure.message);
        setLimitCode(failure.limitCode);
        resetSubmitting();
        if (failure.limitCode) {
          // 残りの表示を、断られた時点の実際の値に合わせる
          void loadUsage();
        }
        return;
      }

      const data = (await response.json()) as CreateJobResponse;

      try {
        if (data.multipart) {
          const chunkSizeBytes = data.multipart.chunkSize;
          if (!Number.isInteger(chunkSizeBytes) || chunkSizeBytes <= 0) {
            console.error(LOG_MESSAGES.INVALID_MULTIPART_PARAMETERS, {
              chunkSizeBytes,
            });
            setErrorMessage(ERROR_MESSAGES.INVALID_UPLOAD_PARAMETERS);
            resetSubmitting();
            return;
          }

          const expectedPartCount = Math.ceil(file.size / chunkSizeBytes);
          if (expectedPartCount <= 0 || expectedPartCount !== data.multipart.uploadUrls.length) {
            console.error(LOG_MESSAGES.INVALID_MULTIPART_PARAMETERS, {
              expectedPartCount,
              uploadUrlCount: data.multipart.uploadUrls.length,
            });
            setErrorMessage(ERROR_MESSAGES.INVALID_UPLOAD_PARAMETERS);
            resetSubmitting();
            return;
          }

          const multipart = data.multipart;
          const totalChunks = multipart.uploadUrls.length;
          let completedChunks = 0;
          const uploadPartsInParallel = async (): Promise<
            Array<{ PartNumber: number; ETag: string }>
          > => {
            const results = await Promise.all(
              multipart.uploadUrls.map(async (uploadUrl, index) => {
                const start = index * chunkSizeBytes;
                const end = Math.min(start + chunkSizeBytes, file.size);
                const chunk = file.slice(start, end);
                const uploadResponse = await fetch(uploadUrl, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': ACCEPTED_FILE_TYPE,
                  },
                  body: chunk,
                });

                const eTag = uploadResponse.headers.get('ETag');
                if (!uploadResponse.ok) {
                  throw new Error(
                    `${LOG_MESSAGES.UPLOAD_FAILED}: ステータス=${uploadResponse.status}, パート番号=${index + 1}`
                  );
                }
                if (!eTag) {
                  throw new Error(
                    `${LOG_MESSAGES.UPLOAD_FAILED}: ETagが取得できませんでした, パート番号=${index + 1}`
                  );
                }
                completedChunks++;
                setUploadProgress(Math.round((completedChunks / totalChunks) * 100));
                return { PartNumber: index + 1, ETag: eTag };
              })
            );
            return results;
          };

          let parts: Array<{ PartNumber: number; ETag: string }>;
          try {
            parts = await uploadPartsInParallel();
          } catch (uploadError) {
            console.error(LOG_MESSAGES.UPLOAD_FAILED, uploadError);
            // 中断処理の失敗はユーザー体験に影響しないため console.error のみとする（設計方針）
            await fetch(`/api/jobs/${data.jobId}/abort-upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uploadId: multipart.uploadId }),
            }).catch((abortError: unknown) => {
              console.error(LOG_MESSAGES.ABORT_UPLOAD_FAILED, abortError);
            });
            setErrorMessage(ERROR_MESSAGES.UPLOAD_FAILED);
            resetSubmitting();
            return;
          }

          const completeUploadResponse = await fetch(`/api/jobs/${data.jobId}/complete-upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              uploadId: data.multipart.uploadId,
              parts,
            }),
          });

          if (!completeUploadResponse.ok) {
            console.error(LOG_MESSAGES.COMPLETE_UPLOAD_FAILED, {
              status: completeUploadResponse.status,
            });
            setErrorMessage(ERROR_MESSAGES.COMPLETE_UPLOAD_FAILED);
            resetSubmitting();
            return;
          }
        } else if (data.uploadUrl) {
          await uploadWithProgress(data.uploadUrl, file);
        } else {
          setErrorMessage(ERROR_MESSAGES.CREATE_JOB_FAILED);
          resetSubmitting();
          return;
        }
      } catch (error) {
        console.error(LOG_MESSAGES.UPLOAD_EXCEPTION, error);
        setErrorMessage(ERROR_MESSAGES.UPLOAD_FAILED);
        resetSubmitting();
        return;
      }

      router.push(`/jobs/${data.jobId}`);
    } catch (error) {
      console.error(LOG_MESSAGES.UNKNOWN, error);
      setErrorMessage(ERROR_MESSAGES.UNKNOWN);
      resetSubmitting();
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          さくっとクリップ
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          動画をアップロードして見どころ抽出を開始します。
        </Typography>

        <form onSubmit={onSubmit}>
          <Alert severity="info" sx={{ mb: 2 }}>
            {CONSTRAINT_MESSAGES.NO_TAB_CLOSE}
            <br />
            {CONSTRAINT_MESSAGES.DATA_EXPIRES}
          </Alert>

          <Paper
            variant="outlined"
            sx={{
              p: 4,
              textAlign: 'center',
              borderStyle: 'dashed',
              borderColor: isDragging ? 'primary.main' : 'divider',
              backgroundColor: isDragging ? 'action.hover' : 'background.paper',
              mb: 2,
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            aria-label="動画ファイルを選択"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <CloudUploadIcon color="primary" sx={{ fontSize: 56, mb: 1 }} />
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              ドラッグ&ドロップ または クリックして動画ファイルを選択
            </Typography>
            <Typography variant="body2" color="text.secondary">
              MP4 形式に対応
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPE}
              hidden
              onChange={onSelectFile}
            />
          </Paper>

          {file && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">
                選択中: {file.name} ({formatFileSize(file.size)})
              </Typography>
            </Box>
          )}

          {durationCheck?.exceeded && (
            <>
              <ErrorAlert message={buildDurationExceededMessage(durationCheck)} />
              <LimitGuidanceActions
                guidance={resolveLimitGuidance('DURATION_LIMIT_EXCEEDED', tier)}
                signInHref={signInHref}
                plansHref={plansHref}
              />
            </>
          )}

          {errorMessage && <ErrorAlert message={errorMessage} />}
          <LimitGuidanceActions
            guidance={resolveLimitGuidance(limitCode, tier)}
            signInHref={signInHref}
            plansHref={plansHref}
          />

          {usage && (
            <UsageOptions
              usage={usage}
              aiAnalysis={aiAnalysis}
              disabled={isSubmitting}
              onAiAnalysisChange={setAiAnalysis}
              signInHref={signInHref}
              plansHref={plansHref}
            />
          )}

          {isSubmitting && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress variant="determinate" value={uploadProgress ?? 0} sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {(uploadProgress ?? 0) < 100
                  ? `アップロード中... ${uploadProgress ?? 0}%`
                  : '処理開始中...'}
              </Typography>
            </Box>
          )}

          <Button
            type="submit"
            variant="solid"
            loading={isSubmitting}
            disabled={
              !file || isFileInvalid || durationCheck?.exceeded === true || isUsageExhausted
            }
          >
            {!isSubmitting
              ? 'アップロードして処理開始'
              : (uploadProgress ?? 0) < 100
                ? `アップロード中... ${uploadProgress ?? 0}%`
                : '処理開始中...'}
          </Button>
        </form>
      </Paper>
    </Container>
  );
}
