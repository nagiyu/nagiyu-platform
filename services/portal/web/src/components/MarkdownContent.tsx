import { Box, type SxProps, type Theme } from '@mui/material';

const DEFAULT_CONTENT_SX: SxProps<Theme> = {
  '& h1': { typography: 'h4', mt: 3, mb: 1 },
  '& h2': { typography: 'h5', mt: 3, mb: 1 },
  '& h3': { typography: 'h6', mt: 2, mb: 1 },
  '& p': { mb: 2 },
  '& ul, & ol': { pl: 3, mb: 2 },
  '& li': { mb: 0.5 },
  '& code': {
    bgcolor: 'grey.100',
    px: 0.5,
    borderRadius: 0.5,
    fontFamily: 'monospace',
  },
  '& pre': {
    bgcolor: 'grey.100',
    p: 2,
    borderRadius: 1,
    overflow: 'auto',
    mb: 2,
  },
};

interface MarkdownContentProps {
  /** DOMPurify でサニタイズ済みの HTML 文字列（lib/content.ts で処理済み） */
  html: string;
  sx?: SxProps<Theme>;
}

/**
 * サニタイズ済み Markdown HTML をレンダリングするコンポーネント
 *
 * コンテンツは lib/content.ts の markdownToHtml() で DOMPurify.sanitize() 済みです。
 */
export default function MarkdownContent({ html, sx }: MarkdownContentProps) {
  return <Box dangerouslySetInnerHTML={{ __html: html }} sx={{ ...DEFAULT_CONTENT_SX, ...sx }} />;
}
