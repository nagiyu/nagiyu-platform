'use client';

import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  FormControlLabel,
  Typography,
  Box,
  Link,
  CircularProgress,
} from '@mui/material';

export interface ConsentModalProps {
  open: boolean;
  onConsented: () => void;
}

const ERROR_MESSAGES = {
  SUBMIT_FAILED: '同意の送信に失敗しました。時間を置いて再試行してください。',
} as const;

/**
 * 初回アクセス時に表示する同意モーダル。
 * 利用規約・プライバシーポリシー・18 歳以上の 3 つのチェックが揃うと
 * 「利用開始」ボタンが活性化され、POST /api/consent で同意を永続化する。
 */
export default function ConsentModal({ open, onConsented }: ConsentModalProps) {
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [ageChecked, setAgeChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChecked = termsChecked && privacyChecked && ageChecked;

  const handleSubmit = useCallback(async () => {
    if (!allChecked || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termsAgreed: true,
          privacyAgreed: true,
          ageVerified: true,
        }),
      });

      if (!response.ok) {
        setError(ERROR_MESSAGES.SUBMIT_FAILED);
        return;
      }

      onConsented();
    } catch {
      setError(ERROR_MESSAGES.SUBMIT_FAILED);
    } finally {
      setSubmitting(false);
    }
  }, [allChecked, submitting, onConsented]);

  return (
    <Dialog open={open} fullWidth maxWidth="sm" disableEscapeKeyDown>
      <DialogTitle sx={{ pb: 1 }}>リブトークへようこそ</DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ mb: 3 }}>
          AI キャラクター「桃瀬ひより」との会話サービスを始める前に、以下をご確認ください。
        </Typography>

        <Box
          sx={{
            bgcolor: 'warning.light',
            color: 'warning.contrastText',
            p: 2,
            borderRadius: 1,
            mb: 3,
            fontSize: '0.85rem',
          }}
        >
          本サービスは AI キャラクターとの会話を楽しむエンターテイメントサービスです。
          医療・心理カウンセリング・診断を目的としたものではありません。
          精神的な辛さを感じているときは、専門機関への相談をおすすめします。
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
                data-testid="terms-checkbox"
              />
            }
            label={
              <Typography variant="body2">
                <Link href="/legal/terms" target="_blank" rel="noopener noreferrer">
                  利用規約
                </Link>
                に同意する
              </Typography>
            }
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={privacyChecked}
                onChange={(e) => setPrivacyChecked(e.target.checked)}
                data-testid="privacy-checkbox"
              />
            }
            label={
              <Typography variant="body2">
                <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                  プライバシーポリシー
                </Link>
                に同意する
              </Typography>
            }
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={ageChecked}
                onChange={(e) => setAgeChecked(e.target.checked)}
                data-testid="age-checkbox"
              />
            }
            label={<Typography variant="body2">18 歳以上である（自己申告）</Typography>}
          />
        </Box>

        {error && (
          <Typography
            color="error"
            variant="body2"
            sx={{ mt: 2 }}
            role="alert"
            data-testid="consent-error"
          >
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!allChecked || submitting}
          data-testid="consent-submit"
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {submitting ? '送信中...' : '利用開始'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
