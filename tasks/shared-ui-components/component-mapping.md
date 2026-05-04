# MUI → 共通部品 マッピング表

<!--
    本ドキュメントは MUI コンポーネントから共通部品への移行作業時の対応表である。
    各 Phase の実装時に詳細を埋めていく。
-->

各 MUI コンポーネントを `@nagiyu/ui` のどのコンポーネントに置き換えるかの対応表。Phase 進行に応じて API 詳細を埋めていく。

## 凡例

- **状態**: `未着手` / `設計中` / `実装中` / `完了` / `対象外`

---

## レイアウトプリミティブ（対象外）

ラップせず、サービスから MUI を直接利用する。

| MUI | 状態 | 備考 |
|---|---|---|
| `Box` | 対象外 | レイアウトプリミティブ |
| `Container` | 対象外 | 同上 |
| `Grid` | 対象外 | 同上 |
| `Stack` | 対象外 | 同上 |
| `Typography` | 対象外 | 同上 |

---

## インフラ系（対象外）

| MUI | 状態 | 備考 |
|---|---|---|
| `CssBaseline` | 対象外 | フレームワーク基盤 |
| `ThemeProvider` | 対象外 | 同上 |
| `AppRouterCacheProvider` | 対象外 | Next.js 統合 |

---

## 既存ラッパーで対応済み

| MUI | 既存共通部品 | 備考 |
|---|---|---|
| `AppBar` / `Toolbar` | `Header` / `AppLayout` | 用途特化 |
| `Alert` / `AlertTitle` | `ErrorAlert` | エラー表示専用。汎用版が必要なら別途検討 |
| `LinearProgress` / `CircularProgress` | `LoadingState` | ローディング表示専用 |

---

## Phase 1: アトミック

| MUI | 共通部品 | 状態 | 備考 |
|---|---|---|---|
| `Button` | `Button` | 未着手 | API 詳細は実装時に確定 |
| `TextField` | `TextField` | 未着手 | |
| `Checkbox` | `Checkbox` | 未着手 | |
| `Chip` | `Chip` | 未着手 | |
| `Link` | `Link` | 未着手 | Next.js `Link` との統合方針要検討 |

---

## Phase 2: フォーム系

| MUI | 共通部品 | 状態 | 備考 |
|---|---|---|---|
| `Select` | `Select` | 未着手 | `MenuItem` / `FormControl` / `InputLabel` を統合 |
| `MenuItem` | `Select`（内包） | 未着手 | `<Select options={...} />` の API に統合 |
| `FormControl` | `Select`（内包） | 未着手 | |
| `InputLabel` | `Select`（内包） | 未着手 | |

---

## Phase 3: 構造系

| MUI | 共通部品 | 状態 | 備考 |
|---|---|---|---|
| `Card` | `Card` | 未着手 | Compound Components |
| `CardContent` | `Card.Body` | 未着手 | |
| `CardActions` | `Card.Actions` | 未着手 | |
| `CardActionArea` | `Card`（`asChild` 等で対応？） | 未着手 | API 設計時に詳細確定 |
| `Tabs` | `Tabs` | 未着手 | Compound Components |
| `Tab` | `Tabs.Trigger` | 未着手 | |
| `List` | `List` | 未着手 | |
| `ListItem` | `List.Item` | 未着手 | |

---

## Phase 4: フィードバック・ナビゲーション系

| MUI | 共通部品 | 状態 | 備考 |
|---|---|---|---|
| `Snackbar` | `Snackbar` | 未着手 | グローバル `Toast` API との統合可否は要検討 |
| `Pagination` | `Pagination` | 未着手 | |
| `Badge` | `Badge` | 未着手 | |
| `Paper` | `Paper` | 未着手 | コンポジションか単純ラップか要検討 |

---

## 移行作業の進捗

| サービス | Button | TextField | Checkbox | Chip | Link | Select | Card | Tabs | List | Snackbar | Pagination | Badge | Paper |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| admin | - | - | - | - | - | - | - | - | - | - | - | - | - |
| auth | - | - | - | - | - | - | - | - | - | - | - | - | - |
| codec-converter | - | - | - | - | - | - | - | - | - | - | - | - | - |
| niconico-mylist-assistant | - | - | - | - | - | - | - | - | - | - | - | - | - |
| portal | - | - | - | - | - | - | - | - | - | - | - | - | - |
| quick-clip | - | - | - | - | - | - | - | - | - | - | - | - | - |
| share-together | - | - | - | - | - | - | - | - | - | - | - | - | - |
| stock-tracker | - | - | - | - | - | - | - | - | - | - | - | - | - |
| tools | - | - | - | - | - | - | - | - | - | - | - | - | - |

凡例: `-` 未着手 / `🟡` 着手中 / `✅` 完了
