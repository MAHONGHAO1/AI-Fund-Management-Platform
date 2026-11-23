"""Keep the published version chain and product name in sync."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def _search(pattern: str, text: str, label: str) -> str:
    match = re.search(pattern, text, re.MULTILINE)
    assert match is not None, f"未在 {label} 中找到版本号"
    return match.group(1)


def collect_versions() -> dict[str, str]:
    readme = _read("README.md")
    pyproject = _read("pyproject.toml")
    web = _read("fund_web.py")
    frontend = json.loads(_read("frontend/package.json"))
    app = _read("frontend/src/App.tsx")
    evidence = _read("docs/EVIDENCE.md")

    return {
        "README 版本行": _search(r"^v(\d+\.\d+\.\d+) · React \+ TypeScript", readme, "README.md 版本行"),
        "README release 徽章": _search(
            r"release-v(\d+\.\d+\.\d+)-blue\.svg", readme, "README.md release 徽章"
        ),
        "README release 徽章链接": _search(
            r"releases/tag/v(\d+\.\d+\.\d+)\)", readme, "README.md release 徽章链接"
        ),
        "pyproject.toml": _search(
            r'^version\s*=\s*"(\d+\.\d+\.\d+)"', pyproject, "pyproject.toml"
        ),
        "fund_web.py FastAPI": _search(
            r'FastAPI\([^)]*version="(\d+\.\d+\.\d+)"', web, "fund_web.py FastAPI"
        ),
        "frontend/package.json": frontend["version"],
        "frontend/src/App.tsx": _search(r"v(\d+\.\d+\.\d+) · React 工作台", app, "App.tsx"),
        "docs/EVIDENCE.md": _search(r"^# 证据总表 · v(\d+\.\d+\.\d+)", evidence, "docs/EVIDENCE.md"),
    }


def test_version_chain_agrees() -> None:
    versions = collect_versions()
    unique = set(versions.values())
    assert len(unique) == 1, "版本号不一致：" + "；".join(
        f"{label}={version}" for label, version in versions.items()
    )

    version = unique.pop()
    release_note = ROOT / "docs" / "releases" / f"RELEASE_NOTES_v{version}.md"
    assert release_note.exists(), (
        f"缺少 docs/releases/RELEASE_NOTES_v{version}.md；发布前先写发布说明"
    )


def test_product_name_is_fund_lens() -> None:
    readme = _read("README.md")
    assert readme.startswith("# 基金观察 · Fund Lens\n")
    assert "AI 智选基金助手" not in readme
