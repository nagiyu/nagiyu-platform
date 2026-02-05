# アーカイブされたプロンプトファイル

このディレクトリには、speckit系エージェントに関連するプロンプトファイルが保管されています。

## アーカイブ理由

- 対応するspeckit系エージェントが `.github/agents/archived/` に移動されたため
- 現在はtask系エージェントのみがアクティブ

## 再有効化方法

speckit系エージェントを再有効化する場合は、これらのプロンプトファイルも戻す必要があります。

```bash
git mv .github/prompts/archived/speckit.*.prompt.md .github/prompts/
```
