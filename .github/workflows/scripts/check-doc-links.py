#!/usr/bin/env python3
"""docs/ 内の相対リンクを検査する。

docs/ だけを公開する先でもリンクが壊れないよう、次の 2 つを違反として全件報告する。
- リンク先が存在しない (リンク切れ)
- リンク先が docs/ の外にある
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# 実行時の作業ディレクトリに依存しないよう、スクリプトの位置からルートを求める。
REPO_ROOT = Path(__file__).resolve().parents[3]
DOCS_DIR = REPO_ROOT / "docs"

# 画像 (![alt](...)) も同じ形式で拾う。alt が空でも対象にする。
MARKDOWN_LINK_PATTERN = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
FENCE_PATTERN = re.compile(r"^\s*(`{3,}|~{3,})")
INLINE_CODE_PATTERN = re.compile(r"(`+)(?:(?!\1).)+?\1")
EXTERNAL_PREFIXES = ("http://", "https://", "mailto:", "tel:", "data:", "#")


def strip_code(content: str) -> str:
    """コードブロックとコード表記を除く。中の例示をリンクと誤検出しないため。"""
    lines: list[str] = []
    fence: str | None = None
    for line in content.splitlines():
        match = FENCE_PATTERN.match(line)
        if fence is None:
            if match:
                fence = match.group(1)[0] * len(match.group(1))
                continue
            lines.append(INLINE_CODE_PATTERN.sub("", line))
        elif match and match.group(1).startswith(fence):
            fence = None
    return "\n".join(lines)


def extract_link_targets(content: str) -> list[str]:
    targets: list[str] = []
    for raw_target in MARKDOWN_LINK_PATTERN.findall(strip_code(content)):
        target = raw_target.strip()
        if target.startswith("<") and target.endswith(">"):
            target = target[1:-1].strip()

        # タイトル付き ([text](path "title")) はパス部分だけを見る。
        title_indexes = [i for i in (target.find(' "'), target.find(" '")) if i != -1]
        path_part = target[: min(title_indexes)].strip() if title_indexes else target

        if not path_part or path_part.startswith(EXTERNAL_PREFIXES):
            continue
        if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", path_part):
            continue

        path_without_fragment = path_part.split("#", 1)[0].split("?", 1)[0]
        if path_without_fragment:
            targets.append(path_without_fragment)
    return targets


def find_violations() -> list[str]:
    violations: list[str] = []

    for markdown_file in sorted(DOCS_DIR.rglob("*.md")):
        source = markdown_file.relative_to(REPO_ROOT)
        content = markdown_file.read_text(encoding="utf-8")
        for target in extract_link_targets(content):
            if target.startswith("/"):
                resolved = (REPO_ROOT / target.lstrip("/")).resolve()
            else:
                resolved = (markdown_file.parent / target).resolve()
            try:
                resolved.relative_to(DOCS_DIR)
            except ValueError:
                violations.append(
                    f"❌ docs/ の外へのリンク: {source} -> {target} "
                    "(パスをコード表記で書いてください)"
                )
                continue
            if not resolved.exists():
                violations.append(
                    f"❌ リンク切れ: {source} -> {target} (解決先: {resolved.relative_to(REPO_ROOT)})"
                )

    return violations


def main() -> int:
    if not DOCS_DIR.exists():
        print("❌ docs/ ディレクトリが見つかりません")
        return 1

    violations = find_violations()
    if not violations:
        print("✅ リンクの問題なし")
        return 0

    for violation in violations:
        print(violation)
    print(f"合計 {len(violations)} 件の問題")
    return 1


if __name__ == "__main__":
    sys.exit(main())
