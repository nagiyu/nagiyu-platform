'use client';

import { useState, useEffect, Suspense } from 'react';
import {
  Container,
  Typography,
  Box,
  Snackbar,
  Alert,
  CircularProgress,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import { Button, TextField } from '@nagiyu/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ClearIcon from '@mui/icons-material/Clear';
import SyncIcon from '@mui/icons-material/Sync';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useSearchParams } from 'next/navigation';
import {
  SnackbarState,
  DisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  TransitRoute,
} from '@/types/tools';
import { parseTransitText, validateInput } from '@/lib/parsers/transitParser';
import { formatTransitRoute } from '@/lib/formatters/formatters';
import { readFromClipboard, writeToClipboard, getItem, setItem } from '@nagiyu/browser';
import DisplaySettingsSection from '@/components/tools/DisplaySettingsSection';

const STORAGE_KEY = 'transit-converter-display-settings';

function TransitConverterContent() {
  const searchParams = useSearchParams();
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [parsedRoute, setParsedRoute] = useState<TransitRoute | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: '',
    severity: 'info',
  });

  // LocalStorageから設定を読み込む
  useEffect(() => {
    try {
      const saved = getItem<DisplaySettings>(STORAGE_KEY);
      if (saved) {
        setDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, ...saved });
      }
    } catch (error) {
      console.error('Failed to load display settings from localStorage:', error);
      // エラーが発生してもデフォルト設定で続行
    }
  }, []);

  // Web Share Target: URLパラメータから共有されたデータを取得
  useEffect(() => {
    const sharedUrl = searchParams.get('url');
    const sharedText = searchParams.get('text');

    if (sharedUrl || sharedText) {
      // URLまたはテキストを入力欄に自動挿入（URLを優先）
      const sharedContent = sharedUrl || sharedText || '';
      setInputText(sharedContent);

      // URLパラメータをクリーンアップ（履歴を汚染しないように）
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/transit-converter');
      }

      // 共有されたことを通知
      setSnackbar({
        open: true,
        message: '共有されたデータを読み込みました',
        severity: 'info',
      });
    }
  }, [searchParams]);

  // 設定変更時にLocalStorageに保存
  const handleDisplaySettingsChange = (newSettings: DisplaySettings) => {
    setDisplaySettings(newSettings);
    try {
      setItem(STORAGE_KEY, newSettings);
    } catch (error) {
      console.error('Failed to save display settings to localStorage:', error);
      // 保存エラーは無視（プライベートモード等）
    }
  };

  // DisplaySettings変更時に自動的に再フォーマット
  useEffect(() => {
    if (parsedRoute) {
      const formatted = formatTransitRoute(parsedRoute, displaySettings);
      setOutputText(formatted);
    }
  }, [displaySettings, parsedRoute]);

  const handleConvert = () => {
    setIsProcessing(true);
    setError(null);

    try {
      // 1. バリデーション
      const validation = validateInput(inputText);
      if (!validation.valid) {
        setError(validation.error || '');
        setSnackbar({
          open: true,
          message: validation.error || '入力エラーが発生しました',
          severity: 'error',
        });
        setIsProcessing(false);
        return;
      }

      // 2. パース処理
      const route = parseTransitText(inputText);
      if (!route) {
        const errorMsg =
          'テキストを解析できませんでした。乗り換え案内のテキストを確認してください。';
        setError(errorMsg);
        setSnackbar({
          open: true,
          message: errorMsg,
          severity: 'error',
        });
        setIsProcessing(false);
        return;
      }

      // 3. フォーマット処理（DisplaySettings適用）
      const formatted = formatTransitRoute(route, displaySettings);
      setParsedRoute(route);
      setOutputText(formatted);
      setError(null);

      setSnackbar({
        open: true,
        message: '変換が完了しました',
        severity: 'success',
      });
    } catch (error) {
      console.error('Transit conversion error:', error);
      const errorMsg = '予期しないエラーが発生しました。';
      setError(errorMsg);
      setSnackbar({
        open: true,
        message: errorMsg,
        severity: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setParsedRoute(null);
    setError(null);
  };

  const handleReadClipboard = async () => {
    try {
      const text = await readFromClipboard();
      setInputText(text);
      setError(null);
      setSnackbar({
        open: true,
        message: 'クリップボードから読み取りました',
        severity: 'success',
      });
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? err.message : 'クリップボードの読み取りに失敗しました',
        severity: 'error',
      });
    }
  };

  const handleCopy = async () => {
    try {
      await writeToClipboard(outputText);
      setSnackbar({
        open: true,
        message: 'クリップボードにコピーしました',
        severity: 'success',
      });
    } catch {
      setSnackbar({
        open: true,
        message: 'コピーに失敗しました',
        severity: 'error',
      });
    }
  };

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        乗り換え変換ツール
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }} align="center">
        乗り換え案内のテキストを貼り付けて、整形された形式に変換します。
      </Typography>

      {/* 使い方ガイド */}
      <Box sx={{ mb: 4 }}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6" component="h3">
              📖 使い方ガイド
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 1 }}>
                ステップ1: 乗り換え案内のテキストを取得
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                乗り換え案内サイト（Yahoo!乗換案内、ジョルダンなど）で経路を検索し、
                表示された経路情報をコピーします。
              </Typography>

              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 2 }}>
                ステップ2: テキストを入力
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                コピーしたテキストを入力欄に貼り付けます。
                「クリップボードから読み取り」ボタンを使うと、
                クリップボードの内容を自動で入力できます。
              </Typography>

              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 2 }}>
                ステップ3: 表示設定を調整（任意）
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                表示したい項目をチェックボックスで選択できます。
                デフォルトでは主要な情報（日付、出発地・到着地、時刻、運賃など）が選択されています。
                設定は自動的に保存され、次回訪問時も反映されます。
              </Typography>

              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 2 }}>
                ステップ4: 変換を実行
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                「変換」ボタンをクリックすると、テキストが解析され、
                整形された結果が出力欄に表示されます。
              </Typography>

              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 2 }}>
                ステップ5: 結果をコピー
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                「コピー」ボタンをクリックすると、整形された結果がクリップボードにコピーされます。
                メモアプリやメッセージアプリに貼り付けてご利用ください。
              </Typography>

              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
                💡 入力例
              </Typography>
              <Box
                component="pre"
                sx={{
                  p: 2,
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  fontSize: '0.875rem',
                  overflow: 'auto',
                }}
              >
                {`2024年1月15日
東京 → 大阪
08:00発 → 10:30着
所要時間: 2時間30分
乗換: 0回
運賃: 13,870円
距離: 552.6km

東京 08:00発
  ↓ 東海道新幹線のぞみ (2番線)
大阪 10:30着`}
              </Box>

              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, mt: 3 }}>
                📤 出力例
              </Typography>
              <Box
                component="pre"
                sx={{
                  p: 2,
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  fontSize: '0.875rem',
                  overflow: 'auto',
                }}
              >
                {`【2024年1月15日】
東京 → 大阪
08:00発 → 10:30着
所要時間: 2時間30分
運賃: 13,870円
乗換: 0回

■ ルート
東京 (08:00)
  ↓ 東海道新幹線のぞみ
大阪 (10:30)`}
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* 表示設定セクション */}
      <Box sx={{ mb: 3 }}>
        <DisplaySettingsSection settings={displaySettings} onChange={handleDisplaySettingsChange} />
      </Box>

      {/* 入力セクション */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          入力
        </Typography>
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            multiline
            rows={10}
            label="乗り換え案内テキスト"
            placeholder="乗り換え案内のテキストをここに貼り付けてください..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            error={!!error}
            helperText={error}
          />
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ '& > button': { xs: { width: '100%' }, sm: { width: 'auto' } } }}
        >
          <Button
            variant="outline"
            startIcon={<ContentPasteIcon />}
            onClick={handleReadClipboard}
            aria-label="クリップボードから乗り換え案内テキストを読み取る"
          >
            クリップボードから読み取り
          </Button>
          <Button
            variant="solid"
            startIcon={<SyncIcon />}
            onClick={handleConvert}
            loading={isProcessing}
            disabled={!inputText.trim()}
            aria-label="乗り換え案内テキストを変換する"
          >
            変換
          </Button>
        </Stack>
      </Box>

      {/* 出力セクション */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          出力
        </Typography>
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            multiline
            rows={10}
            label="変換結果"
            placeholder="変換された結果がここに表示されます..."
            value={outputText}
            readOnly
          />
        </Box>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ '& > button': { xs: { width: '100%' }, sm: { width: 'auto' } } }}
        >
          <Button
            variant="solid"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            disabled={!outputText}
            aria-label="変換結果をクリップボードにコピーする"
          >
            コピー
          </Button>
          <Button
            variant="outline"
            startIcon={<ClearIcon />}
            onClick={handleClear}
            disabled={!inputText && !outputText}
            aria-label="入力と出力をクリアする"
          >
            クリア
          </Button>
        </Stack>
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

export default function TransitConverterPage() {
  return (
    <Suspense
      fallback={
        <Container maxWidth="md" sx={{ py: 4, textAlign: 'center' }}>
          <CircularProgress aria-label="ページ読み込み中" />
          <Typography sx={{ mt: 2 }}>読み込み中...</Typography>
        </Container>
      }
    >
      <TransitConverterContent />
    </Suspense>
  );
}
