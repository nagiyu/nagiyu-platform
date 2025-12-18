# Toolsアプリ 詳細設計書

**バージョン**: 1.0.0
**最終更新日**: 2025-12-15
**ステータス**: フェーズ2.1 完了（コンポーネント設計、ビジネスロジック設計、状態管理設計）

---

## 目次

1. [フロントエンド詳細設計](#1-フロントエンド詳細設計)
2. [バックエンド詳細設計](#2-バックエンド詳細設計)
3. [データベース詳細設計](#3-データベース詳細設計)
4. [個別ツール仕様](#4-個別ツール仕様)
5. [セキュリティ実装詳細](#5-セキュリティ実装詳細)
6. [パフォーマンス最適化](#6-パフォーマンス最適化)

---

## 1. フロントエンド詳細設計

### 1.1 コンポーネント設計

#### 1.1.1 コンポーネント構成図

![コンポーネント構成図](../../images/services/tools/component-structure.drawio.svg)

#### 1.1.2 コンポーネント一覧

| コンポーネント名 | 種別 | 配置 | 説明 |
|----------------|------|------|------|
| Header | Layout | `src/components/layout/Header.tsx` | 共通ヘッダー |
| Footer | Layout | `src/components/layout/Footer.tsx` | 共通フッター |
| ToolCard | Common | `src/components/tools/ToolCard.tsx` | ツールカードコンポーネント |
| TransitConverterPage | Page | `src/app/transit-converter/page.tsx` | 乗り換え変換ツールページ |

---

#### 1.1.3 Header コンポーネント

**概要:**
アプリケーション全体の共通ヘッダー。ナビゲーションとブランディングを提供。

**Props定義:**
```typescript
interface HeaderProps {
  // MVP ではpropsなし（将来的にテーマ切り替え等を追加可能）
}
```

**構成要素:**

![Headerレイアウト](../../images/services/tools/header-layout.drawio.svg)

**Material UI コンポーネント構成:**
```typescript
import { AppBar, Toolbar, Typography } from '@mui/material';

function Header() {
  return (
    <AppBar position="static" color="primary">
      <Toolbar>
        <Typography
          variant="h6"
          component="a"
          href="/"
          sx={{
            flexGrow: 1,
            textAlign: 'center',
            textDecoration: 'none',
            color: 'inherit',
            fontWeight: 600,
          }}
        >
          Tools
        </Typography>
      </Toolbar>
    </AppBar>
  );
}
```

**スタイル仕様:**
- **高さ**: 64px（デスクトップ）、56px（モバイル）
- **背景色**: `theme.palette.primary.main`
- **テキスト色**: `theme.palette.primary.contrastText`
- **影**: Material UI デフォルトの AppBar elevation (4)

---

#### 1.1.4 Footer コンポーネント

**概要:**
アプリケーション全体の共通フッター。バージョン表示と将来的なリンクを提供。

**Props定義:**
```typescript
interface FooterProps {
  version?: string; // バージョン（デフォルト: "1.0.0"）
}
```

**構成要素:**

![Footerレイアウト](../../images/services/tools/footer-layout.drawio.svg)

**Material UI コンポーネント構成:**
```typescript
import { Box, Container, Typography, Link } from '@mui/material';

function Footer({ version = '1.0.0' }: FooterProps) {
  return (
    <Box
      component="footer"
      sx={{
        py: 3,
        px: 2,
        mt: 'auto',
        backgroundColor: (theme) => theme.palette.grey[200],
      }}
    >
      <Container maxWidth="lg">
        <Typography variant="body2" color="text.secondary" align="center">
          v{version}
          {' | '}
          <Link
            color="inherit"
            href="/privacy"
            sx={{
              pointerEvents: 'none',
              color: 'text.disabled',
              textDecoration: 'none',
            }}
          >
            プライバシーポリシー
          </Link>
          {' | '}
          <Link
            color="inherit"
            href="/terms"
            sx={{
              pointerEvents: 'none',
              color: 'text.disabled',
              textDecoration: 'none',
            }}
          >
            利用規約
          </Link>
        </Typography>
      </Container>
    </Box>
  );
}
```

**スタイル仕様:**
- **背景色**: `theme.palette.grey[200]`
- **パディング**: 縦24px、横16px
- **テキストサイズ**: `body2` (14px)
- **配置**: 中央揃え
- **margin-top**: `auto`（ページ下部に固定）

**実装メモ:**
- 将来実装予定のリンクは `pointerEvents: 'none'` で無効化
- リンク作成時は `sx` の無効化スタイルを削除

---

#### 1.1.5 ToolCard コンポーネント

**概要:**
ツール一覧ページで使用するカード型コンポーネント。各ツールの概要を表示し、クリックで詳細ページへ遷移。

**Props定義:**
```typescript
interface ToolCardProps {
  title: string;          // ツール名（例: "乗り換え変換ツール"）
  description: string;    // 説明文（1〜2行）
  icon: ReactNode;        // アイコン（Material UI Icon）
  href: string;           // 遷移先URL（例: "/transit-converter"）
  category?: string;      // カテゴリ（将来実装用）
}
```

**構成要素:**

![ToolCardレイアウト](../../images/services/tools/toolcard-layout.drawio.svg)

**Material UI コンポーネント構成:**
```typescript
import { Card, CardContent, CardActionArea, Typography, Box, Chip } from '@mui/material';

function ToolCard({ title, description, icon, href, category }: ToolCardProps) {
  return (
    <Card>
      <CardActionArea href={href}>
        <CardContent>
          {/* アイコン */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: 80,
              mb: 2,
              color: 'primary.main',
            }}
          >
            {icon}
          </Box>

          {/* タイトル */}
          <Typography variant="h6" component="h2" gutterBottom align="center">
            {title}
          </Typography>

          {/* 説明 */}
          <Typography variant="body2" color="text.secondary" align="center">
            {description}
          </Typography>

          {/* カテゴリ（将来実装） */}
          {category && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Chip label={category} size="small" />
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
```

**スタイル仕様:**
- **カードサイズ**: 可変（Grid レイアウトに依存）
- **角丸**: 12px
- **影**: `0px 2px 8px rgba(0, 0, 0, 0.08)`
- **ホバー時**: `0px 4px 16px rgba(0, 0, 0, 0.12)`
- **アイコンサイズ**: 48px
- **アイコン色**: `theme.palette.primary.main`
- **パディング**: CardContent のデフォルト（16px）

**レスポンシブ対応:**
```typescript
// Grid レイアウト（トップページで使用）
<Grid container spacing={3}>
  <Grid item xs={12} sm={6} md={4}>
    <ToolCard {...props} />
  </Grid>
</Grid>
```

- **xs (0-600px)**: 1カラム
- **sm (600-900px)**: 2カラム
- **md (900px以上)**: 3カラム

---

#### 1.1.6 TransitConverter ページコンポーネント

**概要:**
乗り換え案内のテキストを入力し、整形された結果をクリップボードにコピーする機能を提供。

**画面構成:**

![TransitConverterページレイアウト](../../images/services/tools/transit-page-layout.drawio.svg)

**Material UI コンポーネント構成:**
```typescript
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  Snackbar,
  Alert,
  Stack,
} from '@mui/material';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ClearIcon from '@mui/icons-material/Clear';
import SyncIcon from '@mui/icons-material/Sync';

function TransitConverterPage() {
  // 状態管理（詳細は1.2節参照）
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error' | 'info',
  });

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        乗り換え変換ツール
      </Typography>

      <Typography variant="body1" color="text.secondary" paragraph align="center">
        乗り換え案内のテキストを貼り付けて、整形された形式に変換します。
      </Typography>

      {/* 入力セクション */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          入力
        </Typography>

        <TextField
          fullWidth
          multiline
          rows={10}
          placeholder="乗り換え案内のテキストをここに貼り付けてください..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          error={!!error}
          helperText={error}
          sx={{ mb: 2 }}
        />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ '& > button': { xs: { width: '100%' }, sm: { width: 'auto' } } }}
        >
          <Button
            variant="outlined"
            startIcon={<ContentPasteIcon />}
            onClick={handleReadClipboard}
          >
            クリップボードから読み取り
          </Button>

          <Button
            variant="contained"
            startIcon={<SyncIcon />}
            onClick={handleConvert}
            disabled={!inputText || isProcessing}
          >
            変換
          </Button>
        </Stack>
      </Paper>

      {/* 出力セクション */}
      <Paper elevation={2} sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          出力
        </Typography>

        <TextField
          fullWidth
          multiline
          rows={10}
          placeholder="変換結果がここに表示されます..."
          value={outputText}
          InputProps={{
            readOnly: true,
          }}
          sx={{ mb: 2 }}
        />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ '& > button': { xs: { width: '100%' }, sm: { width: 'auto' } } }}
        >
          <Button
            variant="contained"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            disabled={!outputText}
          >
            コピー
          </Button>

          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClear}
          >
            クリア
          </Button>
        </Stack>
      </Paper>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
```

**レスポンシブ対応:**
- **Container maxWidth**: `md` (900px)
- **モバイル（600px未満）**:
    - Button: `fullWidth`（横幅いっぱい）
    - Stack direction: `column`（縦並び）
- **タブレット以上（600px以上）**:
    - Button: 通常サイズ
    - Stack direction: `row`（横並び）

---

### 1.2 状態管理

#### 1.2.1 状態管理の方針

**基本方針:**
- MVP では React の `useState` を使用（Redux 等の状態管理ライブラリは不要）
- グローバル状態は Material UI の `ThemeProvider` のみ
- ページごとにローカル状態を管理
- 将来的にツールが増えた場合は React Context で共通状態を管理

#### 1.2.2 アプリケーション全体の状態

**テーマ状態（グローバル）:**
```typescript
// src/app/layout.tsx
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '@/styles/theme';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Header />
            <Box component="main" sx={{ flexGrow: 1 }}>
              {children}
            </Box>
            <Footer version="1.0.0" />
          </Box>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**バージョン管理:**
- **Single Source of Truth**: `package.json` の `version` フィールド
- デプロイ時に GitHub Actions が `package.json` からバージョンを読み取る
- CloudFormation の `AppVersion` パラメータ経由で Lambda 環境変数 `APP_VERSION` に設定
- アプリケーションは `process.env.APP_VERSION` から取得

#### 1.2.3 トップページ（ツール一覧）の状態

```typescript
// app/page.tsx
interface Tool {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  href: string;
  category?: string;
}

function HomePage() {
  // ツール一覧は静的データとして定義（状態管理不要）
  const tools: Tool[] = [
    {
      id: 'transit-converter',
      title: '乗り換え変換ツール',
      description: '乗り換え案内のテキストを整形してコピーします',
      icon: <TrainIcon sx={{ fontSize: 48 }} />,
      href: '/transit-converter',
      category: '変換ツール',
    },
    // 将来追加されるツール...
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        ツール一覧
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {tools.map((tool) => (
          <Grid item xs={12} sm={6} md={4} key={tool.id}>
            <ToolCard {...tool} />
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
```

**管理する状態:**
- なし（静的なツール一覧のみ）
- 将来: 検索クエリ、フィルタリング状態

#### 1.2.4 乗り換え変換ツールページの状態

```typescript
// app/transit-converter/page.tsx
interface TransitConverterState {
  // 入力・出力
  inputText: string;
  outputText: string;

  // UI状態
  isProcessing: boolean;
  error: string | null;

  // フィードバック
  snackbar: {
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  };
}

function TransitConverterPage() {
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as const,
  });
}
```

**状態遷移図:**

![状態遷移図](../../images/services/tools/state-transition.drawio.svg)

#### 1.2.5 状態の永続化

**現時点の方針:**
- **永続化しない**: MVP では localStorage 等への保存は行わない
- ページをリロードすると状態はリセットされる

**将来の拡張:**
```typescript
// 将来実装: localStorage を使った入力内容の保存
useEffect(() => {
  if (inputText) {
    localStorage.setItem('transit-converter-input', inputText);
  }
}, [inputText]);

useEffect(() => {
  const saved = localStorage.getItem('transit-converter-input');
  if (saved) {
    setInputText(saved);
  }
}, []);
```

---

### 1.3 ルーティング

#### 1.3.1 ルーティング設計

Next.js 15 App Router を使用。ファイルシステムベースのルーティング。

**ルート定義:**

| パス | ファイル | 説明 |
|------|---------|------|
| `/` | `app/page.tsx` | トップページ（ツール一覧） |
| `/transit-converter` | `app/transit-converter/page.tsx` | 乗り換え変換ツール |
| `/privacy` | `app/privacy/page.tsx` | プライバシーポリシー（将来実装） |
| `/terms` | `app/terms/page.tsx` | 利用規約（将来実装） |
| `/api/health` | `app/api/health/route.ts` | ヘルスチェックAPI |

**ディレクトリ構造:**
```
app/
├── layout.tsx              # ルートレイアウト
├── page.tsx                # トップページ
├── globals.css             # グローバルスタイル
├── transit-converter/
│   └── page.tsx            # 乗り換え変換ツール
└── api/
    └── health/
        └── route.ts        # ヘルスチェックAPI
```

#### 1.3.2 ナビゲーション

**リンク方式:**
- Material UI の `Button` または `Link` コンポーネントに `href` を指定
- Next.js の `<Link>` コンポーネントは使用しない（Material UI との統合のため）

```typescript
// ToolCard での遷移
<CardActionArea href={href}>
  {/* ... */}
</CardActionArea>

// Header でのロゴクリック
<Typography component="a" href="/">
  Tools
</Typography>
```

---

### 1.4 UI仕様

#### 1.4.1 カラーパレット

```typescript
// src/styles/theme.ts
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#424242',
      light: '#6d6d6d',
      dark: '#1b1b1b',
      contrastText: '#ffffff',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
      dark: '#c62828',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#ed6c02',
      light: '#ff9800',
      dark: '#e65100',
      contrastText: '#ffffff',
    },
    info: {
      main: '#0288d1',
      light: '#03a9f4',
      dark: '#01579b',
      contrastText: '#ffffff',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20',
      contrastText: '#ffffff',
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.6)',
      disabled: 'rgba(0, 0, 0, 0.38)',
    },
  },
});
```

#### 1.4.2 タイポグラフィ

```typescript
const theme = createTheme({
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
    ].join(','),
    h1: {
      fontSize: '2.5rem',      // 40px
      fontWeight: 500,
      lineHeight: 1.2,
    },
    h2: {
      fontSize: '2rem',        // 32px
      fontWeight: 500,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '1.75rem',     // 28px
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',      // 24px
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',     // 20px
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',        // 16px
      fontWeight: 500,
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',        // 16px
      fontWeight: 400,
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',    // 14px
      fontWeight: 400,
      lineHeight: 1.43,
    },
    button: {
      fontSize: '0.875rem',    // 14px
      fontWeight: 500,
      textTransform: 'none',   // ボタンテキストを大文字にしない
    },
    caption: {
      fontSize: '0.75rem',     // 12px
      fontWeight: 400,
      lineHeight: 1.66,
    },
  },
});
```

#### 1.4.3 レスポンシブブレークポイント

```typescript
const theme = createTheme({
  breakpoints: {
    values: {
      xs: 0,      // スマートフォン
      sm: 600,    // タブレット（縦）
      md: 900,    // タブレット（横）、小型PC
      lg: 1200,   // デスクトップ
      xl: 1536,   // 大型ディスプレイ
    },
  },
});
```

---

### 1.5 デザインシステム

#### 1.5.1 コンポーネントのカスタマイズ

```typescript
const theme = createTheme({
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '8px 16px',
          textTransform: 'none',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
          transition: 'box-shadow 0.3s ease-in-out',
          '&:hover': {
            boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.12)',
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
  },
});
```

#### 1.5.2 エラー表示仕様

| エラー種別 | 表示方法 | メッセージ例 |
|-----------|---------|-------------|
| 入力検証エラー | TextField の helperText（赤文字） | 「入力が空です。乗り換え案内のテキストを貼り付けてください。」 |
| パースエラー | TextField の helperText（赤文字） | 「テキストを解析できませんでした。」 |
| クリップボードエラー | Snackbar（error） | 「クリップボードの読み取りに失敗しました。」 |
| 成功メッセージ | Snackbar（success） | 「変換が完了しました」「コピーしました」 |

---

## 2. バックエンド詳細設計

### 2.1 API詳細仕様

#### 2.1.1 ヘルスチェックAPI

**エンドポイント:** `/api/health`
**メソッド:** `GET`
**説明:** Lambda 関数の稼働状況を確認するヘルスチェック

**リクエスト:**
```
GET /api/health
```

**レスポンス（成功時）:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-15T12:34:56.789Z",
  "version": "1.0.0"
}
```

**ステータスコード:**
- `200 OK`: 正常稼働中
- `500 Internal Server Error`: サーバーエラー

**実装例:**
```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
  });
}
```

---

### 2.2 Lambda関数設計

#### 2.2.1 Lambda 実行環境

- **ランタイム**: Node.js 22 (コンテナイメージ)
- **メモリ**: 1024MB
- **タイムアウト**: 30秒
- **環境変数**:
    - `NODE_ENV=production`
    - `PORT=3000` (Lambda Web Adapter用)
    - `APP_VERSION` (デプロイ時に `package.json` から自動設定)

#### 2.2.2 Lambda Web Adapter 設定

Dockerfile で Lambda Web Adapter を統合:

```dockerfile
FROM node:22-alpine AS base

# Lambda Web Adapter のバイナリをコピー
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

# Next.js アプリケーション
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
```

---

### 2.3 ビジネスロジック

#### 2.3.1 乗り換え案内パーサー

**ファイル:** `src/lib/parsers/transitParser.ts`

**概要:**
乗り換え案内のテキストをパースし、構造化されたデータに変換する。

**入力フォーマット例:**
```
A駅 ⇒ B駅
2025年1月15日(月)
09:00 ⇒ 09:45
------------------------------
所要時間 45分
運賃[IC優先] 500円
乗換 1回
距離 30.5 km
------------------------------

■A駅
↓ 09:00〜09:20
↓ XX線快速 C駅行
↓ 1番線発 → 2番線着
■C駅
↓ 09:25〜09:45
↓ YY線 B駅方面
↓ 3番線発 → 4番線着
■B駅
```

**データ型定義:**
```typescript
// src/types/tools.ts
export interface TransitRoute {
  departure: string;        // 出発地
  arrival: string;          // 到着地
  date: string;             // 日付
  departureTime: string;    // 出発時刻
  arrivalTime: string;      // 到着時刻
  duration: string;         // 所要時間
  fare: string;             // 運賃
  routeSteps: RouteStep[];  // 経路詳細
}

export interface RouteStep {
  station: string;          // 駅名
  timeRange?: string;       // 時刻範囲
  line?: string;            // 路線名
  platform?: string;        // 番線情報
}
```

**パース関数:**
```typescript
/**
 * 乗り換え案内のテキストをパースする
 * 対応フォーマット: 乗換案内のテキスト共有形式（Yahoo!乗換案内など）
 */
export function parseTransitText(input: string): TransitRoute | null {
  const lines = input.split('\n').map(line => line.trim());

  // 1. 出発地・到着地の抽出
  const headerMatch = lines[0]?.match(/^(.+?)\s*⇒\s*(.+)$/);
  if (!headerMatch) return null;
  const [, departure, arrival] = headerMatch;

  // 2. 日付の抽出
  const date = lines[1] || '';

  // 3. 出発時刻・到着時刻の抽出
  const timeMatch = lines[2]?.match(/^(\d{1,2}:\d{2})\s*⇒\s*(\d{1,2}:\d{2})$/);
  if (!timeMatch) return null;
  const [, departureTime, arrivalTime] = timeMatch;

  // 4. 所要時間の抽出
  const durationMatch = input.match(/所要時間\s+(.+)/);
  const duration = durationMatch ? durationMatch[1] : '';

  // 5. 運賃の抽出
  const fareMatch = input.match(/運賃\[.*?\]\s+(.+)/);
  const fare = fareMatch ? fareMatch[1] : '';

  // 6. ルート詳細の抽出
  const routeSteps: RouteStep[] = [];
  let currentStation = '';
  let currentTimeRange = '';
  let currentLine = '';
  let currentPlatform = '';

  for (const line of lines) {
    // 駅名（■で始まる行）
    if (line.startsWith('■')) {
      if (currentStation) {
        routeSteps.push({
          station: currentStation,
          timeRange: currentTimeRange || undefined,
          line: currentLine || undefined,
          platform: currentPlatform || undefined,
        });
      }
      currentStation = line.substring(1).trim();
      currentTimeRange = '';
      currentLine = '';
      currentPlatform = '';
      continue;
    }

    // 時刻範囲
    const timeRangeMatch = line.match(/^↓\s+(\d{1,2}:\d{2}〜\d{1,2}:\d{2})$/);
    if (timeRangeMatch) {
      currentTimeRange = timeRangeMatch[1];
      continue;
    }

    // 路線名
    if (line.startsWith('↓') && (line.includes('行') || line.includes('方面'))) {
      currentLine = line.substring(1).trim();
      continue;
    }

    // 番線情報
    const platformMatch = line.match(/^↓\s+(.+番線.+)$/);
    if (platformMatch) {
      currentPlatform = platformMatch[1];
      continue;
    }
  }

  // 最後の駅を追加
  if (currentStation) {
    routeSteps.push({
      station: currentStation,
      timeRange: currentTimeRange || undefined,
      line: currentLine || undefined,
      platform: currentPlatform || undefined,
    });
  }

  return {
    departure,
    arrival,
    date,
    departureTime,
    arrivalTime,
    duration,
    fare,
    routeSteps,
  };
}
```

#### 2.3.2 入力バリデーション

**ファイル:** `src/lib/parsers/transitParser.ts`

```typescript
export const ERROR_MESSAGES = {
  INVALID_FORMAT: '乗り換え案内のテキストを正しく解析できませんでした。',
  EMPTY_INPUT: '入力が空です。乗り換え案内のテキストを貼り付けてください。',
  URL_NOT_SUPPORTED: 'URLの直接入力は現在サポートされていません。テキストをコピーして貼り付けてください。',
  UNKNOWN_ERROR: '予期しないエラーが発生しました。',
} as const;

export function validateInput(input: string): { valid: boolean; error?: string } {
  if (!input || input.trim() === '') {
    return { valid: false, error: ERROR_MESSAGES.EMPTY_INPUT };
  }

  // 最低限のフォーマットチェック（⇒が含まれているか）
  if (!input.includes('⇒')) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_FORMAT };
  }

  return { valid: true };
}
```

#### 2.3.3 出力フォーマッター

**ファイル:** `src/lib/formatters.ts`

```typescript
import { TransitRoute } from '@/types/tools';

/**
 * TransitRoute を Plain Text 形式にフォーマット
 */
export function formatTransitRoute(route: TransitRoute): string {
  const lines: string[] = [];

  // ヘッダー
  lines.push(`【乗り換え案内】${route.date}`);
  lines.push(`${route.departure} ${route.departureTime} → ${route.arrival} ${route.arrivalTime}`);
  lines.push(`所要時間: ${route.duration} / 運賃: ${route.fare}`);
  lines.push('');

  // ルート
  lines.push('[ルート]');
  route.routeSteps.forEach((step, index) => {
    const timeInfo = step.timeRange ? ` (${step.timeRange})` : '';
    lines.push(`${step.station}${timeInfo}`);

    // 最後の駅以外は路線情報を表示
    if (index < route.routeSteps.length - 1 && step.line) {
      const platform = step.platform ? ` [${step.platform}]` : '';
      lines.push(`→ ${step.line}${platform}`);
    }
  });

  return lines.join('\n');
}
```

**出力例:**
```
【乗り換え案内】2025年1月15日(月)
A駅 09:00 → B駅 09:45
所要時間: 45分 / 運賃: 500円

[ルート]
A駅 (09:00〜09:20)
→ XX線快速 C駅行 [1番線発 → 2番線着]
C駅 (09:25〜09:45)
→ YY線 B駅方面 [3番線発 → 4番線着]
B駅
```

#### 2.3.4 クリップボード操作

**ファイル:** `src/lib/clipboard.ts`

```typescript
/**
 * クリップボードからテキストを読み取る
 */
export async function readFromClipboard(): Promise<string> {
  try {
    const text = await navigator.clipboard.readText();
    return text;
  } catch (err) {
    throw new Error('クリップボードの読み取りに失敗しました。手動で貼り付けてください。');
  }
}

/**
 * テキストをクリップボードに書き込む
 */
export async function writeToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    throw new Error('クリップボードへの書き込みに失敗しました。');
  }
}
```

**イベントハンドラーでの使用例:**
```typescript
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
      message: err instanceof Error ? err.message : 'エラーが発生しました',
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
  } catch (err) {
    setSnackbar({
      open: true,
      message: 'コピーに失敗しました',
      severity: 'error',
    });
  }
};
```

---

### 2.4 エラーハンドリング詳細

#### 2.4.1 エラーの種類

```typescript
enum ErrorType {
  VALIDATION = 'VALIDATION',      // 入力検証エラー
  PARSE = 'PARSE',                // パースエラー
  CLIPBOARD = 'CLIPBOARD',        // クリップボードエラー
  UNKNOWN = 'UNKNOWN',            // 予期しないエラー
}
```

#### 2.4.2 エラーハンドリングのフロー

```typescript
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
        message: validation.error || '',
        severity: 'error',
      });
      return;
    }

    // 2. パース処理
    const route = parseTransitText(inputText);
    if (!route) {
      const errorMsg = 'テキストを解析できませんでした。乗り換え案内のテキストを確認してください。';
      setError(errorMsg);
      setSnackbar({
        open: true,
        message: errorMsg,
        severity: 'error',
      });
      return;
    }

    // 3. フォーマット処理
    const formatted = formatTransitRoute(route);
    setOutputText(formatted);
    setError(null);

    setSnackbar({
      open: true,
      message: '変換が完了しました',
      severity: 'success',
    });

  } catch (err) {
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
```

---

## 3. データベース詳細設計

### 3.1 テーブル定義詳細

**現時点**: データベース不要

ユーザーデータを保存しないため、データベースは使用しない。
将来的にツールの使用履歴やお気に入り機能を実装する場合は、ローカルストレージまたは DynamoDB を検討。

---

## 4. 個別ツール仕様

### 4.1 ツール一覧

#### MVP（フェーズ1）

| ツールID | ツール名 | 説明 | 実装ステータス |
|---------|---------|------|--------------|
| `transit-converter` | 乗り換え変換ツール | 乗り換え案内のテキストを整形してコピー | 設計完了 |

#### 将来実装予定（フェーズ2以降）

| ツールID | ツール名 | 説明 | 優先度 |
|---------|---------|------|--------|
| `json-formatter` | JSON Formatter | JSON を整形して表示、検証 | 高 |
| `base64-encoder` | Base64 Encoder/Decoder | Base64 エンコード/デコード | 高 |
| `hash-generator` | Hash Generator | MD5、SHA-256等のハッシュ生成 | 高 |
| `url-encoder` | URL Encoder/Decoder | URL エンコード/デコード | 中 |
| `timestamp-converter` | Timestamp Converter | Unix timestamp ⇔ 日時変換 | 中 |

---

### 4.2 各ツールの詳細仕様

#### 4.2.1 乗り換え変換ツール

**ツールID:** `transit-converter`
**URL:** `/transit-converter`

**機能概要:**
乗り換え案内のテキストを入力として受け取り、必要な情報を抽出し、整形された形式でクリップボードにコピーする。

**入力:**
- 乗り換え案内のテキスト
- クリップボードから直接読み取り可能（Clipboard API使用）

**処理:**
1. テキストエリアに手動で貼り付け、またはクリップボード読み取りボタンで自動取得
2. テキストをパース
3. 必要な情報を抽出:
    - 日付
    - 出発地・到着地
    - 出発時刻・到着時刻
    - 所要時間
    - 運賃
    - 経路詳細（駅名、路線名、時刻、番線）

**出力:**
- 整形されたPlain Text形式
- クリップボードへの自動コピー
- 画面上でのプレビュー表示

**制約:**
- 乗り換え案内のフォーマット変更に依存する
- スクレイピングではなく、公開されている情報のパース

**実装方針:**
- フロントエンドのみで処理（JavaScript）
- サーバーサイド処理不要

**ユーザーフロー:**
```
1. ツール一覧から「乗り換え変換ツール」を選択
2. 乗り換え変換ツールページが表示される
3. ユーザーが乗り換え案内のテキストを入力フィールドに貼り付け
   （または「クリップボードから読み取り」ボタンをクリック）
4. 「変換」ボタンをクリック
5. システムがテキストをパースし、必要な情報を抽出
6. 整形された結果が画面に表示される
7. ユーザーが「コピー」ボタンをクリック
8. クリップボードにテキストがコピーされる
9. 「コピーしました」のフィードバックが表示される
```

**エラーケース:**
1. **入力が空の場合**:
    - エラーメッセージ: 「入力が空です。乗り換え案内のテキストを貼り付けてください。」
    - 表示方法: TextField の helperText（赤文字）

2. **パースに失敗した場合**:
    - エラーメッセージ: 「テキストを解析できませんでした。乗り換え案内のテキストを確認してください。」
    - 表示方法: TextField の helperText（赤文字）+ Snackbar

3. **クリップボード読み取りに失敗した場合**:
    - エラーメッセージ: 「クリップボードの読み取りに失敗しました。手動で貼り付けてください。」
    - 表示方法: Snackbar（error）

4. **クリップボードコピーに失敗した場合**:
    - エラーメッセージ: 「コピーに失敗しました」
    - 表示方法: Snackbar（error）

---

## 5. セキュリティ実装詳細

### 5.1 認証フロー

**現時点**: 認証不要

全機能を認証なしで提供するため、認証フローは存在しない。

**将来**: ユーザー機能を追加する場合、Cognito または Auth0 を検討。

---

### 5.2 認可ロジック

**現時点**: 認可不要

全機能が公開されているため、認可ロジックは存在しない。

---

### 5.3 入力バリデーション

#### 5.3.1 クライアントサイドバリデーション

**乗り換え変換ツール:**
```typescript
export function validateInput(input: string): { valid: boolean; error?: string } {
  // 空チェック
  if (!input || input.trim() === '') {
    return {
      valid: false,
      error: '入力が空です。乗り換え案内のテキストを貼り付けてください。'
    };
  }

  // フォーマットチェック（⇒が含まれているか）
  if (!input.includes('⇒')) {
    return {
      valid: false,
      error: '乗り換え案内のテキストを正しく解析できませんでした。'
    };
  }

  return { valid: true };
}
```

#### 5.3.2 XSS対策

- React のデフォルトのエスケープ処理に依存
- `dangerouslySetInnerHTML` は使用しない
- ユーザー入力はすべてテキストとして扱う

---

### 5.4 セキュリティヘッダー

CloudFront Response Headers Policy で設定:

```yaml
SecurityHeadersPolicy:
  Strict-Transport-Security: "max-age=31536000; includeSubDomains"
  X-Content-Type-Options: "nosniff"
  X-Frame-Options: "DENY"
  X-XSS-Protection: "1; mode=block"
  Referrer-Policy: "strict-origin-when-cross-origin"
  Content-Security-Policy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
```

---

## 6. パフォーマンス最適化

### 6.1 フロントエンド最適化

#### 6.1.1 コード分割

- Next.js の自動コード分割を活用
- ページごとに独立したバンドル生成
- Dynamic Import（将来実装）

#### 6.1.2 画像最適化

- Next.js の `<Image>` コンポーネント使用（将来実装）
- WebP フォーマットの使用
- レスポンシブ画像の提供

#### 6.1.3 バンドルサイズ削減

- Tree Shaking の活用
- 使用していない Material UI コンポーネントは自動除外
- Production ビルドの最適化

---

### 6.2 バックエンド最適化

#### 6.2.1 Lambda コールドスタート対策

- メモリを1024MBに設定（コールドスタート時間短縮）
- 将来: Provisioned Concurrency の使用検討

#### 6.2.2 ログ最適化

- 必要最小限のログ出力
- 構造化ログの使用

---

### 6.3 キャッシュ戦略

#### 6.3.1 CloudFront キャッシュ

- **静的アセット**: 長期キャッシュ（1年）
- **HTML**: キャッシュ無効（SSRのため）
- **API**: キャッシュ無効

#### 6.3.2 ブラウザキャッシュ

- Service Worker（PWA実装時）でオフラインキャッシュ
- localStorage でユーザー設定を保存（将来実装）

---

## 付録

### A. 型定義一覧

```typescript
// src/types/tools.ts

export interface TransitRoute {
  departure: string;
  arrival: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  fare: string;
  routeSteps: RouteStep[];
}

export interface RouteStep {
  station: string;
  timeRange?: string;
  line?: string;
  platform?: string;
}

export interface Tool {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  category?: string;
}

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info';
}
```

---

### B. 変更履歴

| 日付 | バージョン | 変更内容 | 担当者 |
|------|-----------|---------|--------|
| 2025-12-15 | 1.0.0 | 初版作成（フェーズ2.1完了） | AI + User |

---

**承認**

本詳細設計書は、プロジェクトオーナーの承認を経て確定版となります。

- [ ] 詳細設計の承認
- [ ] 次フェーズ（実装）への移行許可