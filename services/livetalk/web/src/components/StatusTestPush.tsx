'use client';

/**
 * StatusTestPush — admin デバッグ用「テスト通知送信」コンポーネント（Issue #3491）。
 *
 * ステータスページに埋め込み、各キャラクターへのテスト push を
 * decision ゲートを介さず即時送信できる。
 *
 * dev 環境での以下の検証に使用する:
 *   - 両キャラから通知が届く
 *   - タップで各キャラが開く
 *   - 第一声が出る
 *
 * このコンポーネントは恒久的な admin デバッグツールとして維持する。
 */

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Button } from '@nagiyu/ui';

/**
 * テスト通知送信の結果状態。
 */
interface SendResult {
  characterId: string;
  /** 送信成功件数。0 の場合は購読なし。 */
  sent: number;
  /** エラー発生時のメッセージ。 */
  error?: string;
}

/**
 * コンポーネントの Props。
 */
export interface StatusTestPushProps {
  /** 送信ボタンを表示するキャラクター ID の一覧。 */
  characterIds: string[];
  /**
   * キャラクター ID → 表示名のマップ。
   * ボタンラベルに使用する（例: 「桃瀬ひより にテスト通知」）。
   */
  displayNames: Record<string, string>;
}

/**
 * POST /api/push/test を呼び出してテスト通知を送信する。
 *
 * UI ロジックとフェッチロジックを分離するため、この関数はコンポーネント外に定義する。
 */
async function sendTestPush(characterId: string): Promise<SendResult> {
  const response = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId }),
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const json = (await response.json()) as { message?: string };
      if (json.message) {
        message = json.message;
      }
    } catch {
      // JSON 解析失敗時はステータスコードのみ使用
    }
    return { characterId, sent: 0, error: message };
  }

  const json = (await response.json()) as { sent: number; characterId: string };
  return { characterId, sent: json.sent };
}

/**
 * ステータスページ用のテスト通知送信セクション。
 */
export default function StatusTestPush({ characterIds, displayNames }: StatusTestPushProps) {
  // characterId ごとの送信中フラグ
  const [sending, setSending] = useState<Record<string, boolean>>({});
  // characterId ごとの直近送信結果
  const [results, setResults] = useState<Record<string, SendResult>>({});

  const handleSend = async (characterId: string) => {
    setSending((prev) => ({ ...prev, [characterId]: true }));
    try {
      const result = await sendTestPush(characterId);
      setResults((prev) => ({ ...prev, [characterId]: result }));
    } finally {
      setSending((prev) => ({ ...prev, [characterId]: false }));
    }
  };

  /**
   * 送信結果のメッセージを生成する。
   */
  const getResultMessage = (result: SendResult): string => {
    if (result.error) {
      return `エラー: ${result.error}`;
    }
    if (result.sent === 0) {
      return '購読なし（送信されませんでした）';
    }
    return `送信完了（${result.sent} 件）`;
  };

  /**
   * 送信結果の色を返す（エラー: error、購読なし: text.secondary、成功: success.main）。
   */
  const getResultColor = (result: SendResult): string => {
    if (result.error) return 'error.main';
    if (result.sent === 0) return 'text.secondary';
    return 'success.main';
  };

  return (
    <Box>
      {characterIds.map((characterId) => {
        const displayName = displayNames[characterId] ?? characterId;
        const isSending = sending[characterId] ?? false;
        const result = results[characterId];

        return (
          <Box key={characterId} sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                size="sm"
                disabled={isSending}
                onClick={() => handleSend(characterId)}
              >
                {isSending ? '送信中…' : `${displayName} にテスト通知`}
              </Button>
              {result && (
                <Typography
                  variant="body2"
                  sx={{ fontSize: '0.75rem', color: getResultColor(result) }}
                >
                  {getResultMessage(result)}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
