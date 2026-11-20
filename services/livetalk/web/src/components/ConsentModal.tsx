'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Box } from '@mui/material';
import { Button, Checkbox, Link } from '@nagiyu/ui';
import type { ConsentNotice, RevisedDocument } from '@/lib/consent/notice';

export interface ConsentModalProps {
  open: boolean;
  onConsented: () => void;
  /** 出す内容。省略時は初回の案内 */
  notice?: ConsentNotice;
}

const INITIAL_NOTICE: ConsentNotice = { kind: 'initial' };

const ERROR_MESSAGES = {
  SUBMIT_FAILED: '同意の送信に失敗しました。時間を置いて再試行してください。',
} as const;

function versionLabel(notice: ConsentNotice, key: RevisedDocument['key']): string {
  if (notice.kind !== 'revision') return '';
  const document = notice.documents.find((d) => d.key === key);
  return document ? `（バージョン ${document.version}）` : '';
}

/** 改定のお知らせの本文。変わった文書ごとに施行日・版・要点・全文へのリンクを示す。 */
function RevisionBody({ documents }: { documents: RevisedDocument[] }) {
  return (
    <Box sx={{ mb: 3 }} data-testid="consent-revision">
      <Typography variant="body2" sx={{ mb: 2 }}>
        変更の要点は次のとおりです。内容をご確認のうえ、同意をお願いします。
      </Typography>
      {documents.map((document) => (
        <Box key={document.key} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" component="h3">
            {document.label}
            （バージョン {document.version}
            {document.effectiveDate ? `・${document.effectiveDate}施行` : ''}）
          </Typography>
          {document.summary.length > 0 && (
            <Box component="ul" sx={{ my: 0.5, pl: 3, fontSize: '0.85rem' }}>
              {document.summary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </Box>
          )}
          <Typography variant="body2">
            <Link href={document.href} target="_blank" rel="noopener noreferrer">
              {document.label}の全文を読む
            </Link>
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function revisionTitle(documents: RevisedDocument[]): string {
  return `${documents.map((document) => document.label).join('・')}を改定しました`;
}

/**
 * 同意モーダル。
 * 初回は利用規約・プライバシーポリシー・18 歳以上の 3 つのチェックが揃うと「利用開始」が活性化する。
 * 規約・ポリシーの改定後は、変わった文書の要点を示し、その文書への同意のチェックが揃うと
 * 「同意して続ける」が活性化する。18 歳以上の申告は、記録が無いときだけ求める。
 * いずれも POST /api/consent で同意を永続化する。
 */
export default function ConsentModal({
  open,
  onConsented,
  notice = INITIAL_NOTICE,
}: ConsentModalProps) {
  const [termsChecked, setTermsChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [ageChecked, setAgeChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);

  // ダイアログは常にマウントされているため、閉じた後も前回のチェックが残る。
  // サーバーに同意を断られて開き直したときに、新しい版を読まずに押せないよう、開くたびに空から始める。
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTermsChecked(false);
      setPrivacyChecked(false);
      setAgeChecked(false);
      setError(null);
    }
  }

  const isRevision = notice.kind === 'revision';
  const revisedKeys = notice.kind === 'revision' ? notice.documents.map((d) => d.key) : [];
  const termsRequired = !isRevision || revisedKeys.includes('terms');
  const privacyRequired = !isRevision || revisedKeys.includes('privacy');
  const ageRequired = notice.kind === 'revision' ? notice.ageRequired : true;

  const allChecked =
    (!termsRequired || termsChecked) &&
    (!privacyRequired || privacyChecked) &&
    (!ageRequired || ageChecked);

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
          // 記録済みの申告は、サーバーがそのまま残す
          ...(ageRequired ? { ageVerified: true } : {}),
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
  }, [allChecked, submitting, onConsented, ageRequired]);

  return (
    <Dialog open={open} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }} data-testid="consent-title">
        {notice.kind === 'revision' ? revisionTitle(notice.documents) : 'リブトークへようこそ'}
      </DialogTitle>

      <DialogContent>
        {notice.kind === 'revision' ? (
          <RevisionBody documents={notice.documents} />
        ) : (
          <Typography variant="body2" sx={{ mb: 3 }}>
            AI キャラクターとの会話サービスを始める前に、以下をご確認ください。
          </Typography>
        )}

        {!isRevision && (
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
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {termsRequired && (
            <Checkbox
              checked={termsChecked}
              onChange={(e) => setTermsChecked(e.target.checked)}
              data-testid="terms-checkbox"
              label={
                <Typography variant="body2" component="span">
                  <Link href="/legal/terms" target="_blank" rel="noopener noreferrer">
                    利用規約
                  </Link>
                  {versionLabel(notice, 'terms')}に同意する
                </Typography>
              }
            />
          )}

          {privacyRequired && (
            <Checkbox
              checked={privacyChecked}
              onChange={(e) => setPrivacyChecked(e.target.checked)}
              data-testid="privacy-checkbox"
              label={
                <Typography variant="body2" component="span">
                  <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                    プライバシーポリシー
                  </Link>
                  {versionLabel(notice, 'privacy')}に同意する
                </Typography>
              }
            />
          )}

          {ageRequired && (
            <Checkbox
              checked={ageChecked}
              onChange={(e) => setAgeChecked(e.target.checked)}
              data-testid="age-checkbox"
              label={
                <Typography variant="body2" component="span">
                  18 歳以上である（自己申告）
                </Typography>
              }
            />
          )}
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
          variant="solid"
          color="primary"
          onClick={handleSubmit}
          disabled={!allChecked || submitting}
          loading={submitting}
          data-testid="consent-submit"
        >
          {submitting ? '送信中...' : isRevision ? '同意して続ける' : '利用開始'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
