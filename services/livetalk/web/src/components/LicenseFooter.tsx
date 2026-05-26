import { Box, Link, Typography } from '@mui/material';

/**
 * VOICEVOX・Live2D のライセンス表記。UI 上で常時表示される必要があるため、
 * チャット画面下部に常駐させる。
 */
export default function LicenseFooter() {
  return (
    <Box
      sx={{
        width: '100%',
        textAlign: 'center',
        py: 0.5,
        px: 1,
        backgroundColor: 'background.default',
      }}
      data-testid="license-footer"
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
        VOICEVOX:冥鳴ひまり / Live2D キャラクター: 桃瀬ひより ©2010 Live2D Inc.
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 0.25 }}>
        <Link href="/legal/terms" variant="caption" sx={{ fontSize: '0.65rem' }} color="text.secondary">
          利用規約
        </Link>
        <Link href="/legal/privacy" variant="caption" sx={{ fontSize: '0.65rem' }} color="text.secondary">
          プライバシーポリシー
        </Link>
      </Box>
    </Box>
  );
}
