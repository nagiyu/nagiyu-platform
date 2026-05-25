import { Box, Typography } from '@mui/material';

/**
 * VOICEVOX 等のライセンス表記。UI 上で常時表示される必要があるため、
 * チャット画面下部に常駐させる。Phase 1g で Live2D（桃瀬ひより / かにビーム）の表記が追加される。
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
        VOICEVOX:冥鳴ひまり
      </Typography>
    </Box>
  );
}
