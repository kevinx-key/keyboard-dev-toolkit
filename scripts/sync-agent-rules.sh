#!/usr/bin/env bash
#
# sync-agent-rules.sh — Generate AI agent config files from 智能体配置.md
#
# 智能体配置.md is the single source of truth. This script creates copies
# for agents that don't read 智能体配置.md natively (Cline, Continue,
# Amazon Q, GitHub Copilot Chat).
#
# Usage:
#   bash scripts/sync-agent-rules.sh
#
# Agents that DON'T need generated files (they read 智能体配置.md natively):
#   Codex CLI, OpenCode, Cursor, Windsurf, Copilot Coding Agent,
#   Roo Code, Aider, Augment Code
#
# Agents with their own thin pointer files (created manually):
#   Claude Code  → CLAUDE.md (@智能体配置.md import)
#   Gemini CLI   → GEMINI.md (@智能体配置.md import)
#   Cursor       → .cursor/rules/project.mdc (pointer)
#   Windsurf     → .windsurfrules (pointer)
#   Aider        → .aider.conf.yml (read: [智能体配置.md])

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$REPO_ROOT/智能体配置.md"

if [[ ! -f "$SOURCE" ]]; then
  echo "Error: 智能体配置.md not found at $SOURCE" >&2
  exit 1
fi

# Resolve @file imports (Claude Code syntax) into inline content.
# Lines like "@docs/research/检查指南.md" become the file's contents.
resolve_imports() {
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" =~ ^@(.+)$ ]]; then
      local import_path="${BASH_REMATCH[1]}"
      local resolved="$REPO_ROOT/$import_path"
      if [[ -f "$resolved" ]]; then
        cat "$resolved"
        echo ""
      else
        echo "<!-- Import not found: $import_path -->"
      fi
    else
      echo "$line"
    fi
  done < "$SOURCE"
}

RESOLVED_CONTENT="$(resolve_imports)"

HEADER="<!-- AUTO-GENERATED from 智能体配置.md — do not edit directly.
     Run \`bash scripts/sync-agent-rules.sh\` to regenerate. -->"

# Helper: write a generated file with header
write_file() {
  local target="$1"
  local content="$2"
  mkdir -p "$(dirname "$target")"
  printf '%s\n\n%s\n' "$HEADER" "$content" > "$target"
  echo "  ✓ $target"
}

echo "Syncing agent rules from 智能体配置.md..."

# GitHub Copilot Chat — .github/copilot-instructions.md
write_file "$REPO_ROOT/.github/copilot-instructions.md" "$RESOLVED_CONTENT"

# Cline / Roo Code — .clinerules
write_file "$REPO_ROOT/.clinerules" "$RESOLVED_CONTENT"

# Continue — .continue/rules/project.md
CONTINUE_FRONTMATTER="---
description: Project conventions for AI Website Clone Template
alwaysApply: true
---"
write_file "$REPO_ROOT/.continue/rules/project.md" "$CONTINUE_FRONTMATTER
$RESOLVED_CONTENT"

# Amazon Q Developer — .amazonq/rules/project.md
write_file "$REPO_ROOT/.amazonq/rules/project.md" "$RESOLVED_CONTENT"

echo ""
echo "Done. Generated files are committed to the repo but sourced from 智能体配置.md."
echo "Edit 智能体配置.md, then re-run this script to update all agent configs."
