'use client';

import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { Link } from '@nagiyu/ui';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * NoteMarkdown コンポーネントの props 型定義。
 */
interface NoteMarkdownProps {
  /** 描画する Markdown テキスト */
  content: string;
  /** Box ラッパーへ渡す追加スタイル */
  sx?: SxProps<Theme>;
}

/**
 * react-markdown が使用する要素マッピング。
 * 各 Markdown 要素を MUI / nagiyu-ui コンポーネントに変換する。
 */
export const MARKDOWN_COMPONENTS: Components = {
  /** 段落：MUI Typography の p タグ */
  p: ({ children }) => (
    <Typography component="p" sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
      {children}
    </Typography>
  ),
  /** リンク：nagiyu/ui の Link で新規タブ表示 */
  a: ({ children, href }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </Link>
  ),
  /** 箇条書きリスト */
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 3, mb: 1, '&:last-child': { mb: 0 } }}>
      {children}
    </Box>
  ),
  /** 番号付きリスト */
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 3, mb: 1, '&:last-child': { mb: 0 } }}>
      {children}
    </Box>
  ),
  /** リスト項目 */
  li: ({ children }) => (
    <Typography component="li" sx={{ mb: 0.25 }}>
      {children}
    </Typography>
  ),
  /** 太字 */
  strong: ({ children }) => (
    <Box component="strong" sx={{ fontWeight: 'bold' }}>
      {children}
    </Box>
  ),
  /** イタリック */
  em: ({ children }) => (
    <Box component="em" sx={{ fontStyle: 'italic' }}>
      {children}
    </Box>
  ),
  /** インラインコード */
  code: ({ children }) => (
    <Box
      component="code"
      sx={{
        bgcolor: 'grey.100',
        px: 0.5,
        borderRadius: 0.5,
        fontFamily: 'monospace',
        fontSize: '0.875em',
      }}
    >
      {children}
    </Box>
  ),
  /** 見出し H1（意味的階層のため h3 タグとして描画） */
  h1: ({ children }) => (
    <Typography variant="subtitle1" component="h3" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
  /** 見出し H2（意味的階層のため h4 タグとして描画） */
  h2: ({ children }) => (
    <Typography variant="subtitle1" component="h4" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
  /** 見出し H3（意味的階層のため h5 タグとして描画） */
  h3: ({ children }) => (
    <Typography variant="subtitle2" component="h5" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
};

/**
 * ノート本文の Markdown 描画コンポーネント。
 * react-markdown + remark-gfm を用いて GFM 形式の Markdown を HTML に変換する。
 * リンク記法（[text](url)）は `_blank` + `noopener noreferrer` で新規タブ表示される。
 */
export default function NoteMarkdown({ content, sx }: NoteMarkdownProps) {
  return (
    <Box
      sx={[
        { wordBreak: 'break-word', overflowWrap: 'anywhere' },
        ...(sx == null ? [] : Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </Box>
  );
}
