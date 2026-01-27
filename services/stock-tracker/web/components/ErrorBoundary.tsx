'use client';

/**
 * Error Boundary Component
 *
 * Reactのエラーをキャッチして、ユーザーフレンドリーなエラー画面を表示する
 */

import React, { Component, ReactNode } from 'react';
import { Box, Container, Typography, Button, Alert } from '@mui/material';
import { ErrorOutline as ErrorIcon, Refresh as RefreshIcon } from '@mui/icons-material';

/**
 * ErrorBoundary Props
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

/**
 * ErrorBoundary State
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary Component
 *
 * Reactコンポーネントのエラーをキャッチして、フォールバックUIを表示する
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // エラーログ出力
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // カスタムエラーハンドラーを呼び出し
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  public handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      // カスタムfallbackがある場合はそれを表示
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // デフォルトのエラー画面
      return (
        <Container maxWidth="md">
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '50vh',
              textAlign: 'center',
              gap: 3,
            }}
          >
            <ErrorIcon sx={{ fontSize: 80, color: 'error.main' }} />
            <Typography variant="h4" component="h1" gutterBottom>
              エラーが発生しました
            </Typography>
            <Alert severity="error" sx={{ width: '100%', maxWidth: 600 }}>
              申し訳ございません。予期しないエラーが発生しました。
              <br />
              ページを再読み込みしてください。
            </Alert>

            {/* 開発環境ではエラー詳細を表示 */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1, width: '100%' }}>
                <Typography
                  variant="body2"
                  component="pre"
                  sx={{ textAlign: 'left', overflow: 'auto' }}
                >
                  {this.state.error.toString()}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                onClick={() => window.location.reload()}
              >
                ページを再読み込み
              </Button>
              <Button variant="outlined" onClick={this.handleReset}>
                やり直す
              </Button>
            </Box>
          </Box>
        </Container>
      );
    }

    return this.props.children;
  }
}

/**
 * useErrorHandler Hook
 *
 * 関数コンポーネント内でエラーをErrorBoundaryに伝播させるためのフック
 */
export function useErrorHandler() {
  const [, setError] = React.useState<Error | null>(null);

  return React.useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);
}
