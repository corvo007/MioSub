#!/bin/bash

# TSC Hook with Visible Output for Gemini-Subtitle-Pro
# Adapted for dual-stack (src + electron) TypeScript project

CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
HOOK_INPUT=$(cat)
SESSION_ID="${session_id:-default}"
CACHE_DIR="$HOME/.claude/tsc-cache/$SESSION_ID"

mkdir -p "$CACHE_DIR"

# Extract tool name and input
TOOL_NAME=$(echo "$HOOK_INPUT" | jq -r '.tool_name // ""')
TOOL_INPUT=$(echo "$HOOK_INPUT" | jq -r '.tool_input // {}')

# Function to detect source type for a file
get_source_type() {
    local file_path="$1"
    local relative_path="${file_path#$CLAUDE_PROJECT_DIR/}"

    if [[ "$relative_path" =~ ^src/ ]]; then
        echo "renderer"
    elif [[ "$relative_path" =~ ^electron/ ]]; then
        echo "main"
    else
        echo ""
    fi
}

# Function to run TSC check
run_tsc_check() {
    local source_type="$1"

    cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || return 1

    case "$source_type" in
        renderer)
            npx tsc --noEmit 2>&1
            ;;
        main)
            npx tsc -p electron/tsconfig.json --noEmit 2>&1
            ;;
        *)
            npx tsc --noEmit 2>&1
            ;;
    esac
}

# Only process file modification tools
case "$TOOL_NAME" in
    Write|Edit|MultiEdit)
        # Extract file paths
        if [ "$TOOL_NAME" = "MultiEdit" ]; then
            FILE_PATHS=$(echo "$TOOL_INPUT" | jq -r '.edits[].file_path // empty')
        else
            FILE_PATHS=$(echo "$TOOL_INPUT" | jq -r '.file_path // empty')
        fi

        # Collect source types that need checking (only for TS/TSX files)
        TYPES_TO_CHECK=$(echo "$FILE_PATHS" | grep -E '\.(ts|tsx)$' | while read -r file_path; do
            if [ -n "$file_path" ]; then
                source_type=$(get_source_type "$file_path")
                [ -n "$source_type" ] && echo "$source_type"
            fi
        done | sort -u | tr '\n' ' ')

        TYPES_TO_CHECK=$(echo "$TYPES_TO_CHECK" | xargs)

        if [ -n "$TYPES_TO_CHECK" ]; then
            ERROR_COUNT=0
            ERROR_OUTPUT=""
            FAILED_TYPES=""

            echo "⚡ TypeScript check on: $TYPES_TO_CHECK" >&2

            for source_type in $TYPES_TO_CHECK; do
                echo -n "  Checking $source_type... " >&2

                CHECK_OUTPUT=$(run_tsc_check "$source_type" 2>&1)
                CHECK_EXIT_CODE=$?

                if [ $CHECK_EXIT_CODE -ne 0 ] || echo "$CHECK_OUTPUT" | grep -q "error TS"; then
                    echo "❌ Errors found" >&2
                    ERROR_COUNT=$((ERROR_COUNT + 1))
                    FAILED_TYPES="$FAILED_TYPES $source_type"
                    ERROR_OUTPUT="${ERROR_OUTPUT}

=== Errors in $source_type ===
$CHECK_OUTPUT"
                else
                    echo "✅ OK" >&2
                fi
            done

            if [ $ERROR_COUNT -gt 0 ]; then
                echo "$ERROR_OUTPUT" > "$CACHE_DIR/last-errors.txt"
                echo "$FAILED_TYPES" > "$CACHE_DIR/affected-types.txt"

                {
                    echo ""
                    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                    echo "🚨 TypeScript errors found in $ERROR_COUNT source(s): $FAILED_TYPES"
                    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                    echo ""
                    echo "👉 IMPORTANT: Use the auto-error-resolver agent to fix the errors"
                    echo ""
                    echo "Error Preview:"
                    echo "$ERROR_OUTPUT" | grep "error TS" | head -10
                    echo ""
                    if [ $(echo "$ERROR_OUTPUT" | grep -c "error TS") -gt 10 ]; then
                        echo "... and $(($(echo "$ERROR_OUTPUT" | grep -c "error TS") - 10)) more errors"
                    fi
                } >&2

                exit 1
            fi
        fi
        ;;
esac

find "$HOME/.claude/tsc-cache" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \; 2>/dev/null || true

exit 0
