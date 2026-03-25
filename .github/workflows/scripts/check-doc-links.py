#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path

DOCS_DIR = Path("docs")
MARKDOWN_LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def extract_markdown_targets(content: str) -> list[str]:
    targets: list[str] = []
    for raw_target in MARKDOWN_LINK_PATTERN.findall(content):
        target = raw_target.strip()
        if not target:
            continue

        if target.startswith("<") and target.endswith(">"):
            target = target[1:-1].strip()
            if not target:
                continue

        path_part = target.split()[0]
        if ".md" not in path_part:
            continue
        if path_part.startswith(("http://", "https://", "mailto:", "#")):
            continue

        path_without_fragment = path_part.split("#", 1)[0].split("?", 1)[0]
        if not path_without_fragment:
            continue

        targets.append(path_without_fragment)
    return targets


def find_broken_links() -> list[tuple[Path, str, Path]]:
    docs_root = DOCS_DIR.resolve()
    broken_links: list[tuple[Path, str, Path]] = []

    for markdown_file in sorted(DOCS_DIR.rglob("*.md")):
        content = markdown_file.read_text(encoding="utf-8")
        for target in extract_markdown_targets(content):
            resolved_target = (markdown_file.parent / target).resolve()
            if resolved_target.exists():
                continue

            source_display = markdown_file.relative_to(docs_root.parent)
            broken_links.append((source_display, target, resolved_target))

    return broken_links


def main() -> int:
    if not DOCS_DIR.exists():
        print("❌ docs/ ディレクトリが見つかりません")
        return 1

    broken_links = find_broken_links()
    if not broken_links:
        print("✅ リンク切れなし")
        return 0

    for source, target, resolved in broken_links:
        print(f"❌ リンク切れ: {source} -> {target} (解決先: {resolved})")
    print(f"合計 {len(broken_links)} 件のリンク切れ")
    return 1


if __name__ == "__main__":
    sys.exit(main())
