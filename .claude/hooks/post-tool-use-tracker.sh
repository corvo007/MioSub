#!/bin/bash
set -e

# Post-tool-use hook that tracks edited files
# This runs after Edit, MultiEdit, or Write tools complete successfully

# Read tool information from stdin
tool_info=$(cat)

# Extract relevant data
tool_name=$(echo "$tool_info" | jq -r '.tool_name // empty')
file_path=$(echo "$tool_info" | jq -r '.tool_input.file_path // empty')
session_id=$(echo "$tool_info" | jq -r '.session_id // empty')

# Skip if not an edit tool or no file path
if [[ ! "$tool_name" =~ ^(Edit|MultiEdit|Write)$ ]] || [[ -z "$file_path" ]]; then
    exit 0
fi

# Skip markdown files
if [[ "$file_path" =~ \.(md|markdown)$ ]]; then
    exit 0
fi

# Create cache directory in project
cache_dir="$CLAUDE_PROJECT_DIR/.claude/tsc-cache/${session_id:-default}"
mkdir -p "$cache_dir"

# Function to detect source type from file path
detect_source_type() {
    local file="$1"
    local project_root="$CLAUDE_PROJECT_DIR"
    local relative_path="${file#$project_root/}"

    # Extract first directory component
    local first_dir=$(echo "$relative_path" | cut -d'/' -f1)

    case "$first_dir" in
        src)
            echo "renderer"
            ;;
        electron)
            echo "main"
            ;;
        *)
            if [[ "$relative_path" =~ ^[^/]+\.(ts|tsx|js|jsx)$ ]]; then
                echo "root"
            else
                echo "unknown"
            fi
            ;;
    esac
}

# Function to get tsc command
get_tsc_command() {
    local source_type="$1"
    local project_root="$CLAUDE_PROJECT_DIR"

    case "$source_type" in
        renderer)
            echo "cd $project_root && npx tsc --noEmit"
            ;;
        main)
            echo "cd $project_root && npx tsc -p electron/tsconfig.json --noEmit"
            ;;
        root)
            echo "cd $project_root && npx tsc --noEmit"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Detect source type
source_type=$(detect_source_type "$file_path")

# Skip if unknown
if [[ "$source_type" == "unknown" ]] || [[ -z "$source_type" ]]; then
    exit 0
fi

# Log edited file
echo "$(date +%s):$file_path:$source_type" >> "$cache_dir/edited-files.log"

# Update affected types list
if ! grep -q "^$source_type$" "$cache_dir/affected-types.txt" 2>/dev/null; then
    echo "$source_type" >> "$cache_dir/affected-types.txt"
fi

# Store tsc command
tsc_cmd=$(get_tsc_command "$source_type")
if [[ -n "$tsc_cmd" ]]; then
    echo "$source_type:tsc:$tsc_cmd" >> "$cache_dir/commands.txt.tmp"
fi

# Remove duplicates from commands
if [[ -f "$cache_dir/commands.txt.tmp" ]]; then
    sort -u "$cache_dir/commands.txt.tmp" > "$cache_dir/commands.txt"
    rm -f "$cache_dir/commands.txt.tmp"
fi

exit 0
