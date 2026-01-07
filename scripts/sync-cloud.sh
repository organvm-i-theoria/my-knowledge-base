#!/bin/bash

# ==============================================================================
# ☁️ Cloud Knowledge Sync (via Rclone)
# Bridges Dropbox, Google Drive, OneDrive, etc. into your local knowledge base.
# ==============================================================================

SYNC_ROOT="./sync"

# 1. Check Prerequisite
if ! command -v rclone &> /dev/null; then
    echo "❌ Error: rclone is not installed."
    echo "   Please install it to use this feature:"
    echo "   👉 macOS: brew install rclone"
    echo "   👉 Linux/Unix: curl https://rclone.org/install.sh | sudo bash"
    exit 1
fi

echo "🚀 Starting Cloud Knowledge Sync..."
echo "📂 Target Directory: $SYNC_ROOT"
mkdir -p "$SYNC_ROOT"

# 2. Sync Function
sync_source() {
    local remote_path="$1"
    local local_folder="$2"
    local include_pattern="$3"

    local dest_path="$SYNC_ROOT/$local_folder"

    echo "---------------------------------------------------"
    echo "🔄 Syncing: [$remote_path] ➡️  [$dest_path]"
    
    # Ensure destination exists
    mkdir -p "$dest_path"
    
    # Build rclone command
    cmd=(rclone sync "$remote_path" "$dest_path" --progress --create-empty-src-dirs)
    
    # Add filter if provided
    if [ -n "$include_pattern" ]; then
        echo "   (Filter: $include_pattern)"
        cmd+=(--include "$include_pattern")
    fi

    # Execute
    "${cmd[@]}"
}

# ==============================================================================
# 📝 CONFIGURATION AREA
# Uncomment and edit the lines below to map your cloud folders.
# First run 'rclone config' in your terminal to set up your remotes.
# ==============================================================================

# Sync 'Projects' folder from Dropbox (dbx)
# Filtering for text-based knowledge files
sync_source "dbx:Projects" "dropbox-projects" "*.{md,txt,json,pdf,ts,js,py}"

# Sync '_4JP_' folder from Dropbox (dbx)
sync_source "dbx:_4JP_" "dropbox-4jp" "*.{md,txt,json,pdf}"

# Example 2: Sync Research PDFs from Google Drive
# sync_source "gdrive:/Research/2025" "gdrive-research" "*.pdf"

# Example 3: Sync everything from a specific OneDrive project folder
# sync_source "onedrive:/Projects/KnowledgeBase" "onedrive-project" ""

# ==============================================================================

echo "---------------------------------------------------"
echo "✅ Cloud Sync Complete!"
