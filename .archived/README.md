# アーカイブされた機能

このディレクトリには、現在使用していないプロジェクト機能が保管されています。

## アーカイブされた機能

### specify/
speckit系エージェントに関連する設定ファイル、テンプレート、メモリファイル。

- `templates/` - 仕様書、タスク、プラン等のテンプレート
- `scripts/` - スクリプト類
- `memory/` - constitution.md等のメモリファイル

## アーカイブ理由

- speckit系エージェントが `.github/agents/archived/` に移動されたため
- 関連ファイルも一緒にアーカイブ

## 再有効化方法

speckit機能を再有効化する場合:

```bash
git mv .archived/specify .specify
```
