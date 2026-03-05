# アラート設定ダイアログの共通化

## 概要

アラート設定ダイアログ（`AlertSettingsModal`）は既にコンポーネント化されているが、
各機能ページでモーダルの開閉・成功処理などの状態管理コードが重複している。
カスタムフックに共通化し、メンテナンス性と再利用性を向上させる。

## 関連情報

- Issue: #1791
- タスクタイプ: サービスタスク（Stock Tracker Web）
- マイルストーン: v5.5.0

## 現状の問題

### 重複している状態管理コード

`holdings/page.tsx` と `watchlist/page.tsx` の両方に以下のコードが存在する：

- `alertModalOpen` の `useState`
- `handleOpenAlertModal` 関数
- `handleCloseAlertModal` 関数
- `handleAlertSuccess` 関数

### 未実装ページ

`alerts/page.tsx` にアラート設定モーダルの実装が残っている（TODO コメントあり）。

## 要件

### 機能要件

- FR1: アラート設定モーダルの状態管理ロジックをカスタムフックに集約する
- FR2: holdings, watchlist, alerts の各ページでカスタムフックを利用する
- FR3: `alerts/page.tsx` でアラート設定モーダルを実装する

### 非機能要件

- NFR1: 既存の動作を変更しない（リグレッションなし）
- NFR2: テストカバレッジ 80% 以上を維持する
- NFR3: TypeScript strict mode に準拠する

## 実装方針

### カスタムフック設計

`useAlertSettingsModal` フックを新規作成し、以下を提供する：

- `alertModalOpen`: モーダル表示状態
- `selectedItem`: 選択中のアイテム（tickerId, symbol, exchangeId, mode, basePrice 等）
- `handleOpenAlertModal`: モーダルを開く関数
- `handleCloseAlertModal`: モーダルを閉じる関数
- `handleAlertSuccess`: アラート設定成功時の処理

フックは汎用的な型（ジェネリクス or 共通インターフェース）で定義し、
holdings（Sell モード）と watchlist（Buy モード）の両方に対応できるようにする。

### 配置

- フック: `services/stock-tracker/web/hooks/useAlertSettingsModal.ts`

## タスク

- [ ] T001: `useAlertSettingsModal` カスタムフックの作成
    - 状態管理（open/selectedItem）
    - handleOpenAlertModal / handleCloseAlertModal / handleAlertSuccess の実装
    - TypeScript 型定義
- [ ] T002: `holdings/page.tsx` のリファクタリング
    - `useAlertSettingsModal` フックの適用
    - 重複コードの削除
- [ ] T003: `watchlist/page.tsx` のリファクタリング
    - `useAlertSettingsModal` フックの適用
    - 重複コードの削除
- [ ] T004: `alerts/page.tsx` へのアラート設定モーダル実装
    - TODO コメントを解消
    - `useAlertSettingsModal` フックを利用して実装
- [ ] T005: テストの作成・更新
    - `useAlertSettingsModal` のユニットテスト
    - 既存の E2E テストが通ることを確認

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md)
- [アーキテクチャ方針](../docs/development/architecture.md)
- [テスト戦略](../docs/development/testing.md)

## 備考・未決定事項

- `handleAlertSuccess` の内容（fetchAlerts の呼び出し、successMessage の更新）はページ固有の処理を含むため、
  フックの外からコールバックとして渡すか、フック内に組み込むかの設計判断が必要。
- `alerts/page.tsx` でのモーダル対象アイテムの型定義を確認する必要がある。
