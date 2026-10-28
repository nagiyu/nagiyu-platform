import { Box, type SxProps, type Theme } from '@mui/material';

const DEFAULT_CONTENT_SX: SxProps<Theme> = {
  '& h1': { typography: 'h4', mt: 3, mb: 1 },
  // 本文のフォントでは weight 500 が通常の太さで描画され、太字の h3 より弱く見えるため太字にする
  '& h2': { typography: 'h5', fontWeight: 700, mt: 3, mb: 1 },
  // テーマの h6 は本文と同じ 16px のため、h2 と本文の間の大きさにして区別する
  '& h3': { typography: 'h6', fontSize: '1.125rem', fontWeight: 700, mt: 3, mb: 1 },
  '& p': { mb: 2 },
  '& ul, & ol': { pl: 3, mb: 2 },
  '& li': { mb: 0.5 },
  // 共通のリセットがリンクの色と下線を消しているため、本文中では戻して地の文と区別する
  '& a': {
    color: 'primary.main',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    '&:hover': { textDecorationThickness: '2px' },
  },
  '& blockquote': {
    borderLeft: 4,
    borderColor: 'divider',
    pl: 2,
    my: 2,
    color: 'text.secondary',
    '& > :last-child': { mb: 0 },
  },
  '& hr': {
    border: 'none',
    borderTop: 1,
    borderColor: 'divider',
    my: 3,
  },
  '& code': {
    bgcolor: 'grey.100',
    px: 0.5,
    borderRadius: 0.5,
    fontFamily: 'monospace',
  },
  // 本文中の長いインラインコードが画面幅を越えて、ページ全体を横に広げるのを防ぐ
  '& :not(pre) > code': { overflowWrap: 'anywhere' },
  // 表の中のコードは単語の途中で割れると読めないため、折り返さず表の横スクロールに任せる
  '& td > code, & th > code': { overflowWrap: 'normal' },
  // 表は表の中で横スクロールさせ、ページ幅を広げない
  // 横スクロールできることを、はみ出している側の端に出す影で示す（local の覆いがスクロール端で影を隠す）
  '& table': {
    display: 'block',
    maxWidth: '100%',
    overflowX: 'auto',
    mb: 2,
    borderCollapse: 'collapse',
    // 覆いの色と同じ面の色にそろえ、ダークテーマでも覆いが浮かない
    backgroundColor: 'var(--color-bg-surface)',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'local, local, scroll, scroll',
    backgroundPosition: 'left center, right center, left center, right center',
    backgroundSize: '24px 100%, 24px 100%, 12px 100%, 12px 100%',
    backgroundImage: [
      'linear-gradient(to right, var(--color-bg-surface) 30%, transparent)',
      'linear-gradient(to left, var(--color-bg-surface) 30%, transparent)',
      'radial-gradient(farthest-side at 0 50%, rgba(0, 0, 0, 0.28), transparent)',
      'radial-gradient(farthest-side at 100% 50%, rgba(0, 0, 0, 0.28), transparent)',
    ].join(', '),
  },
  // 見出し行の背景は半透明にし、表の背景に出すスクロール影を隠さない
  '& th, & td': {
    px: 1.5,
    py: 1,
    border: 1,
    borderColor: 'divider',
    textAlign: 'left',
    verticalAlign: 'top',
    // 狭い画面で 1〜2 文字ずつ折り返されないための下限
    minWidth: '8em',
  },
  '& th': { bgcolor: 'action.hover', fontWeight: 700 },
  '& pre': {
    bgcolor: 'grey.100',
    p: 2,
    borderRadius: 1,
    overflow: 'auto',
    mb: 2,
  },
  // 図解画像のはみ出し防止
  '& img': {
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
    mt: 2,
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
  return (
    <Box
      dangerouslySetInnerHTML={{ __html: html }}
      sx={[DEFAULT_CONTENT_SX, ...(sx == null ? [] : Array.isArray(sx) ? sx : [sx])]}
    />
  );
}
