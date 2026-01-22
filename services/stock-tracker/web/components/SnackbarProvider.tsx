'use client';

/**
 * Snackbar Provider
 *
 * アプリケーション全体でトーストメッセージを管理するContext Provider
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, AlertColor } from '@mui/material';

/**
 * トーストメッセージ型
 */
export interface ToastMessage {
  id: string;
  message: string;
  severity: AlertColor;
  duration?: number;
}

/**
 * Snackbar Context型
 */
interface SnackbarContextType {
  showMessage: (message: string, severity: AlertColor, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
}

/**
 * Snackbar Context
 */
const SnackbarContext = createContext<SnackbarContextType | undefined>(undefined);

/**
 * useSnackbar Hook
 */
export function useSnackbar(): SnackbarContextType {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
}

/**
 * SnackbarProvider Props
 */
interface SnackbarProviderProps {
  children: React.ReactNode;
  defaultDuration?: number;
  maxSnackbars?: number;
}

/**
 * デフォルト設定
 */
const DEFAULT_DURATION = 6000; // 6秒
const MAX_SNACKBARS = 3;

/**
 * SnackbarProvider Component
 *
 * アプリケーション全体でトーストメッセージを表示するためのProvider
 */
export function SnackbarProvider({
  children,
  defaultDuration = DEFAULT_DURATION,
  maxSnackbars = MAX_SNACKBARS,
}: SnackbarProviderProps) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  /**
   * メッセージを表示
   */
  const showMessage = useCallback(
    (message: string, severity: AlertColor, duration: number = defaultDuration) => {
      const id = `${Date.now()}-${Math.random()}`;
      const newMessage: ToastMessage = {
        id,
        message,
        severity,
        duration,
      };

      setMessages((prev) => {
        // 最大表示数を超える場合は古いメッセージを削除
        const newMessages = [...prev, newMessage];
        if (newMessages.length > maxSnackbars) {
          return newMessages.slice(-maxSnackbars);
        }
        return newMessages;
      });

      // 自動非表示タイマー
      setTimeout(() => {
        setMessages((prev) => prev.filter((msg) => msg.id !== id));
      }, duration);
    },
    [defaultDuration, maxSnackbars]
  );

  /**
   * 成功メッセージを表示
   */
  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      showMessage(message, 'success', duration);
    },
    [showMessage]
  );

  /**
   * エラーメッセージを表示
   */
  const showError = useCallback(
    (message: string, duration?: number) => {
      showMessage(message, 'error', duration);
    },
    [showMessage]
  );

  /**
   * 警告メッセージを表示
   */
  const showWarning = useCallback(
    (message: string, duration?: number) => {
      showMessage(message, 'warning', duration);
    },
    [showMessage]
  );

  /**
   * 情報メッセージを表示
   */
  const showInfo = useCallback(
    (message: string, duration?: number) => {
      showMessage(message, 'info', duration);
    },
    [showMessage]
  );

  /**
   * メッセージを閉じる
   */
  const handleClose = useCallback((id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  const contextValue: SnackbarContextType = {
    showMessage,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };

  return (
    <SnackbarContext.Provider value={contextValue}>
      {children}
      {messages.map((msg, index) => (
        <Snackbar
          key={msg.id}
          open={true}
          autoHideDuration={msg.duration}
          onClose={() => handleClose(msg.id)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          sx={{
            // 複数のSnackbarを縦に並べる
            bottom: `${16 + index * 70}px !important`,
          }}
        >
          <Alert
            onClose={() => handleClose(msg.id)}
            severity={msg.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {msg.message}
          </Alert>
        </Snackbar>
      ))}
    </SnackbarContext.Provider>
  );
}
