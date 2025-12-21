'use client';

import { useState, useRef, useEffect, DragEvent, ChangeEvent, FormEvent } from 'react';
import styles from './page.module.css';
import { JobValidation, OutputCodec } from '@/lib/models/job';

/**
 * Validation constants for frontend
 */
const ACCEPTED_FILE_EXTENSION = '.mp4';
const ACCEPTED_MIME_TYPE = 'video/mp4';
const MAX_FILE_SIZE = JobValidation.MAX_FILE_SIZE; // 500MB

/**
 * Job status type for tracking upload/job creation progress
 */
type UploadStatus =
  | 'idle'
  | 'creating_job'
  | 'uploading'
  | 'submitting'
  | 'completed'
  | 'error';

export default function Home() {
  // State management
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCodec, setSelectedCodec] = useState<OutputCodec>('h264');
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [jobId, setJobId] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef<number>(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  /**
   * Cleanup effect for aborting ongoing uploads and resetting drag state
   */
  useEffect(() => {
    // Global dragend listener to ensure drag state is always reset
    const handleGlobalDragEnd = () => {
      dragCounterRef.current = 0;
      setIsDragging(false);
    };

    window.addEventListener('dragend', handleGlobalDragEnd);

    return () => {
      // Abort ongoing upload on unmount
      if (xhrRef.current) {
        xhrRef.current.abort();
      }
      window.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, []);

  /**
   * Validate file before upload
   */
  const validateFile = (file: File): string | null => {
    // Check file extension - extract the actual extension
    const fileName = file.name.toLowerCase();
    const lastDotIndex = fileName.lastIndexOf('.');
    const fileExtension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : '';
    
    if (fileExtension !== ACCEPTED_FILE_EXTENSION) {
      return `MP4ファイルのみアップロード可能です（現在の拡張子: ${fileExtension || 'なし'}）`;
    }

    // Check MIME type
    if (file.type !== ACCEPTED_MIME_TYPE) {
      return `MP4形式のファイルのみ対応しています（現在: ${file.type || '不明'}）`;
    }

    // Check file size (500MB limit)
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      return `ファイルサイズは500MB以下である必要があります（現在: ${sizeMB}MB）`;
    }

    if (file.size === 0) {
      return 'ファイルが空です';
    }

    return null;
  };

  /**
   * Handle file selection
   */
  const handleFileSelect = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMessage(validationError);
      setStatus('error');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setErrorMessage('');
    setStatus('idle');
  };

  /**
   * Handle file input change
   */
  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  /**
   * Handle drag events with counter to prevent flickering
   */
  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Prevent drag during upload/processing
    if (status !== 'idle' && status !== 'error') {
      return;
    }
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Prevent drag during upload/processing
    if (status !== 'idle' && status !== 'error') {
      return;
    }
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    // Prevent drop during upload/processing
    if (status !== 'idle' && status !== 'error') {
      return;
    }

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  /**
   * Handle drag end to reset counter in case of cancelled drag
   */
  const handleDragEnd = () => {
    dragCounterRef.current = 0;
    setIsDragging(false);
  };

  /**
   * Open file picker
   */
  const handleBrowseClick = () => {
    // Prevent file selection during upload/processing
    if (status !== 'idle' && status !== 'error') {
      return;
    }
    fileInputRef.current?.click();
  };

  /**
   * Handle form submission and upload
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedFile) {
      setErrorMessage('ファイルを選択してください');
      setStatus('error');
      return;
    }

    try {
      setStatus('creating_job');
      setErrorMessage('');
      setUploadProgress(0);

      // Step 1: Create job and get presigned URL
      const createJobResponse = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          contentType: selectedFile.type,
          outputCodec: selectedCodec,
        }),
      });

      if (!createJobResponse.ok) {
        let apiErrorMessage = 'ジョブの作成に失敗しました';
        try {
          const contentType = createJobResponse.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errorData = await createJobResponse.json();
            if (errorData && typeof errorData.error === 'string') {
              apiErrorMessage = errorData.error;
            }
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
        }
        throw new Error(apiErrorMessage);
      }

      const { jobId: createdJobId, uploadUrl } =
        await createJobResponse.json();
      setJobId(createdJobId);

      // Step 2: Upload file to S3 using presigned URL with progress tracking
      setStatus('uploading');

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr; // Store reference for cleanup

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete);
          }
        });

        // Handle completion
        xhr.addEventListener('load', () => {
          xhrRef.current = null; // Clear reference
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error('ファイルのアップロードに失敗しました'));
          }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
          xhrRef.current = null; // Clear reference
          reject(new Error('ファイルのアップロードに失敗しました'));
        });

        xhr.addEventListener('abort', () => {
          xhrRef.current = null; // Clear reference
          reject(new Error('アップロードがキャンセルされました'));
        });

        // Send the request
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', selectedFile.type);
        xhr.send(selectedFile);
      });

      // Step 3: Submit job to Batch
      setStatus('submitting');

      const submitResponse = await fetch(
        `/api/jobs/${createdJobId}/submit`,
        {
          method: 'POST',
        }
      );

      if (!submitResponse.ok) {
        let apiErrorMessage = 'ジョブの投入に失敗しました';
        try {
          const contentType = submitResponse.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const errorData = await submitResponse.json();
            if (errorData && typeof errorData.error === 'string') {
              apiErrorMessage = errorData.error;
            }
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
        }
        throw new Error(apiErrorMessage);
      }

      setStatus('completed');
    } catch (error) {
      console.error('Upload error:', error);
      setErrorMessage(
        error instanceof Error ? error.message : '予期しないエラーが発生しました'
      );
      setStatus('error');
    }
  };

  /**
   * Reset form
   */
  const handleReset = () => {
    setSelectedFile(null);
    setSelectedCodec('h264');
    setStatus('idle');
    setErrorMessage('');
    setUploadProgress(0);
    setJobId('');
    dragCounterRef.current = 0;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.header}>
          <h1>Codec Converter</h1>
          <p>動画ファイルを別のコーデックに変換します</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {/* File Upload Area */}
          <div
            className={`${styles.dropzone} ${isDragging ? styles.dragging : ''} ${selectedFile ? styles.hasFile : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onClick={handleBrowseClick}
            role="region"
            tabIndex={status === 'idle' || status === 'error' ? 0 : -1}
            aria-label={
              !selectedFile
                ? 'ファイルをドラッグ＆ドロップまたはクリックして選択'
                : 'ファイルが選択されています。Enterキーまたはスペースキーで別のファイルを選択できます'
            }
            onKeyDown={(e) => {
              // Prevent keyboard interaction during upload/processing
              if (status !== 'idle' && status !== 'error') {
                return;
              }
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleBrowseClick();
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_EXTENSION}
              onChange={handleFileInputChange}
              className={styles.fileInput}
              aria-label="ファイル選択"
              disabled={status !== 'idle' && status !== 'error'}
            />

            {selectedFile ? (
              <div
                className={styles.fileInfo}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.fileName}>{selectedFile.name}</div>
                <div className={styles.fileSize}>
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
            ) : (
              <div className={styles.dropzoneContent}>
                <svg
                  className={styles.uploadIcon}
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>
                  <strong>ファイルをドラッグ＆ドロップ</strong>
                  <br />
                  またはクリックして選択
                </p>
                <p className={styles.constraints}>
                  MP4形式、最大500MB
                </p>
              </div>
            )}
          </div>

          {/* Codec Selection */}
          <div className={styles.codecSelection}>
            <label htmlFor="codec-select" className={styles.label}>
              出力コーデック
            </label>
            <select
              id="codec-select"
              value={selectedCodec}
              onChange={(e) => setSelectedCodec(e.target.value as OutputCodec)}
              className={styles.select}
              disabled={status !== 'idle' && status !== 'error'}
            >
              <option value="h264">H.264 (広く互換性のある形式)</option>
              <option value="vp9">VP9 (高効率な圧縮)</option>
              <option value="av1">AV1 (最新の高効率コーデック)</option>
            </select>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className={styles.error} role="alert" aria-live="polite">
              {errorMessage}
            </div>
          )}

          {/* Progress Display */}
          {status !== 'idle' && status !== 'error' && status !== 'completed' && (
            <div className={styles.progress} aria-live="polite" role="status">
              <div className={styles.progressLabel}>
                {status === 'creating_job' && 'ジョブを作成中...'}
                {status === 'uploading' && `アップロード中... ${uploadProgress}%`}
                {status === 'submitting' && '変換ジョブを投入中...'}
              </div>
              {status === 'uploading' && (
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${uploadProgress}%` }}
                    role="progressbar"
                    aria-label="ファイルアップロードの進捗"
                    aria-valuenow={uploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              )}
            </div>
          )}

          {/* Success Message */}
          {status === 'completed' && (
            <div className={styles.success} role="status" aria-live="polite">
              <p>✓ 変換ジョブを投入しました</p>
              <p className={styles.jobId}>ジョブID: {jobId}</p>
              <p className={styles.jobNote}>
                変換が完了したら、ジョブIDを使ってダウンロードできます
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className={styles.actions}>
            {status === 'completed' ? (
              <button
                type="button"
                onClick={handleReset}
                className={styles.button}
              >
                新しいファイルをアップロード
              </button>
            ) : (
              <>
                <button
                  type="submit"
                  className={`${styles.button} ${styles.primary}`}
                  disabled={
                    !selectedFile ||
                    (status !== 'idle' && status !== 'error')
                  }
                >
                  {status === 'idle' || status === 'error'
                    ? '変換を開始'
                    : '処理中...'}
                </button>
                {selectedFile && (status === 'idle' || status === 'error') && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className={`${styles.button} ${styles.secondary}`}
                  >
                    キャンセル
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
