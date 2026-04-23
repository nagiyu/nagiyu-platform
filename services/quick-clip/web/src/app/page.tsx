'use client';

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Container, LinearProgress, Paper, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

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
  UNKNOWN: 'アップロード処理の開始時に予期しないエラーが発生しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
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

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setSelectedFile = (selected: File | null) => {
    setFile(selected);
    setErrorMessage(null);
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

    setIsSubmitting(true);
    setUploadProgress(0);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
        }),
      });

      if (!response.ok) {
        setErrorMessage(ERROR_MESSAGES.CREATE_JOB_FAILED);
        resetSubmitting();
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

          const uploadPartsInParallel = async (): Promise<
            Array<{ PartNumber: number; ETag: string }>
          > => {
            const results = await Promise.all(
              data.multipart.uploadUrls.map(async (uploadUrl, index) => {
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
                return { PartNumber: index + 1, ETag: eTag };
              })
            );
            setUploadProgress(100);
            return results;
          };

          let parts: Array<{ PartNumber: number; ETag: string }>;
          try {
            parts = await uploadPartsInParallel();
          } catch (uploadError) {
            console.error(LOG_MESSAGES.UPLOAD_FAILED, uploadError);
            await fetch(`/api/jobs/${data.jobId}/abort-upload`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ uploadId: data.multipart.uploadId }),
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
            <Typography variant="body1" fontWeight={700}>
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
              <Typography variant="body2">選択中: {file.name}</Typography>
            </Box>
          )}

          {errorMessage && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
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

          <Button type="submit" variant="contained" disabled={!file || isSubmitting}>
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
