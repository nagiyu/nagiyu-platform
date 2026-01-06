'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { type Job, type JobStatus } from 'codec-converter-core';

// エラーメッセージ定数
const ERROR_MESSAGES = {
  FETCH_FAILED: 'ジョブ情報の取得に失敗しました',
  JOB_NOT_FOUND: '指定されたジョブが見つかりません',
} as const;

// ステータスバッジの色設定
const STATUS_COLORS: Record<JobStatus, string> = {
  PENDING: '#FFA500',
  PROCESSING: '#1E90FF',
  COMPLETED: '#32CD32',
  FAILED: '#FF4500',
};

// ステータス表示テキスト
const STATUS_TEXT: Record<JobStatus, string> = {
  PENDING: '🟡 待機中',
  PROCESSING: '🔵 処理中',
  COMPLETED: '🟢 完了',
  FAILED: '🔴 失敗',
};

// ステータス説明テキスト
const STATUS_DESCRIPTION: Record<JobStatus, string> = {
  PENDING: '変換処理を待っています',
  PROCESSING: '動画を変換しています...',
  COMPLETED: '変換が完了しました',
  FAILED: '変換処理に失敗しました',
};

/**
 * ファイルサイズを人間が読める形式にフォーマット
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Unix timestampを日時文字列にフォーマット
 */
function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * コーデック名の表示テキスト
 */
const CODEC_DISPLAY_NAME: Record<string, string> = {
  h264: 'H.264',
  vp9: 'VP9',
  av1: 'AV1',
};

/**
 * ジョブIDを短縮表示（先頭8文字 + ... + 最後4文字）
 */
function formatJobId(jobId: string): string {
  if (jobId.length <= 12) {
    return jobId;
  }
  return `${jobId.substring(0, 8)}...${jobId.substring(jobId.length - 4)}`;
}

interface JobDetailsPageProps {
  params: Promise<{ jobId: string }>;
}

export default function JobDetailsPage({ params }: JobDetailsPageProps) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string>('');
  const [job, setJob] = useState<Job | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // paramsの非同期解決
  useEffect(() => {
    params.then((resolvedParams) => {
      setJobId(resolvedParams.jobId);
    });
  }, [params]);

  // ジョブ情報の取得
  const fetchJobDetails = useCallback(
    async (showRefreshingState = false) => {
      if (!jobId) return;

      if (showRefreshingState) {
        setIsRefreshing(true);
      }
      setError(null);

      try {
        const response = await fetch(`/api/jobs/${jobId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError(ERROR_MESSAGES.JOB_NOT_FOUND);
          } else {
            setError(ERROR_MESSAGES.FETCH_FAILED);
          }
          return;
        }

        const data = await response.json();
        setJob(data);
        setDownloadUrl(data.downloadUrl || null);
      } catch (err) {
        console.error('Failed to fetch job details:', err);
        setError(ERROR_MESSAGES.FETCH_FAILED);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [jobId]
  );

  // 初回読み込み
  useEffect(() => {
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId, fetchJobDetails]);

  // ステータス確認ボタンのハンドラー
  const handleRefresh = () => {
    fetchJobDetails(true);
  };

  // ダウンロードボタンのハンドラー
  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  };

  // 新規変換ボタンのハンドラー
  const handleNewConversion = () => {
    router.push('/');
  };

  // ローディング中の表示
  if (isLoading) {
    return (
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <h1>変換ジョブ詳細</h1>
        <div style={{ textAlign: 'center', padding: '2rem' }}>読み込み中...</div>
      </main>
    );
  }

  // エラー時の表示
  if (error && !job) {
    return (
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <h1>変換ジョブ詳細</h1>
        <div
          role="alert"
          style={{
            padding: '1rem',
            backgroundColor: '#fee',
            color: '#c00',
            borderRadius: '4px',
            marginBottom: '2rem',
            border: '1px solid #fcc',
          }}
        >
          {error}
        </div>
        <button
          onClick={handleNewConversion}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: '#0070f3',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          新しい動画を変換
        </button>
      </main>
    );
  }

  if (!job) {
    return null;
  }

  const showRefreshButton = job.status === 'PENDING' || job.status === 'PROCESSING';
  const showDownloadButton = job.status === 'COMPLETED';

  return (
    <main
      style={{
        maxWidth: '800px',
        margin: '0 auto',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '2rem' }}>変換ジョブ詳細</h1>

      {/* ジョブ情報表示 */}
      <section
        style={{
          backgroundColor: '#f9f9f9',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem',
        }}
        aria-labelledby="job-info-heading"
      >
        <h2
          id="job-info-heading"
          style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}
        >
          ジョブ情報
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>ジョブID:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatJobId(job.jobId)}</span>
          </div>

          <div>
            <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>ファイル名:</span>
            <span>{job.fileName}</span>
          </div>

          <div>
            <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>ファイルサイズ:</span>
            <span>{formatFileSize(job.fileSize)}</span>
          </div>

          <div>
            <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>出力コーデック:</span>
            <span>{CODEC_DISPLAY_NAME[job.outputCodec] || job.outputCodec}</span>
          </div>

          <div>
            <span style={{ fontWeight: 'bold', marginRight: '0.5rem' }}>作成日時:</span>
            <span>{formatDateTime(job.createdAt)}</span>
          </div>
        </div>
      </section>

      {/* ステータス表示 */}
      <section
        style={{
          backgroundColor: '#f9f9f9',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem',
        }}
        aria-labelledby="status-heading"
      >
        <h2
          id="status-heading"
          style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '1rem' }}
        >
          ステータス
        </h2>

        <div
          style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            backgroundColor: STATUS_COLORS[job.status],
            color: '#fff',
            borderRadius: '4px',
            fontWeight: 'bold',
            marginBottom: '0.75rem',
          }}
          role="status"
          aria-label={`ジョブステータス: ${STATUS_TEXT[job.status]}`}
        >
          {STATUS_TEXT[job.status]}
        </div>

        <p style={{ margin: '0.5rem 0 0 0', color: '#666' }}>{STATUS_DESCRIPTION[job.status]}</p>

        {/* エラーメッセージ表示（FAILED時） */}
        {job.status === 'FAILED' && job.errorMessage && (
          <div
            role="alert"
            style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#fee',
              color: '#c00',
              borderRadius: '4px',
              border: '1px solid #fcc',
            }}
          >
            <p style={{ margin: 0, fontWeight: 'bold' }}>エラー詳細:</p>
            <p style={{ margin: '0.5rem 0 0 0' }}>{job.errorMessage}</p>
          </div>
        )}
      </section>

      {/* アクションボタン */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* ステータス確認ボタン */}
        {showRefreshButton && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              color: '#fff',
              backgroundColor: isRefreshing ? '#ccc' : '#0070f3',
              border: 'none',
              borderRadius: '4px',
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
            }}
            aria-label="ジョブステータスを確認"
          >
            {isRefreshing ? '確認中...' : 'ステータス確認'}
          </button>
        )}

        {/* ダウンロードボタン */}
        {showDownloadButton && (
          <button
            onClick={handleDownload}
            style={{
              width: '100%',
              padding: '1rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              color: '#fff',
              backgroundColor: '#32CD32',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
            aria-label="変換済みファイルをダウンロード"
          >
            ダウンロード
          </button>
        )}

        {/* 新規変換ボタン */}
        <button
          onClick={handleNewConversion}
          style={{
            width: '100%',
            padding: '1rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            color: '#0070f3',
            backgroundColor: '#fff',
            border: '2px solid #0070f3',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
          aria-label="新しい動画を変換する"
        >
          新しい動画を変換
        </button>
      </div>
    </main>
  );
}
