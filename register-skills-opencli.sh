#!/bin/bash

# Register skills CLI with OpenCLI
# This script adds the skills CLI to opencli's external CLIs configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLI_CONFIG_DIR="$HOME/.opencli"
EXTERNAL_CLIS_FILE="$OPENCLI_CONFIG_DIR/external-clis.yaml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✅${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

error() {
    echo -e "${RED}❌${NC} $1"
}

# Check if opencli is installed
if ! command -v opencli &> /dev/null; then
    error "opencli is not installed. Please install it first:"
    echo "  npm install -g @jackwener/opencli"
    exit 1
fi

# Create opencli config directory if it doesn't exist
if [ ! -d "$OPENCLI_CONFIG_DIR" ]; then
    info "Creating opencli config directory..."
    mkdir -p "$OPENCLI_CONFIG_DIR"
fi

# Backup existing config if it exists
if [ -f "$EXTERNAL_CLIS_FILE" ]; then
    BACKUP_FILE="$EXTERNAL_CLIS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    info "Backing up existing configuration to: $BACKUP_FILE"
    cp "$EXTERNAL_CLIS_FILE" "$BACKUP_FILE"
fi

# Skills CLI configuration
SKILLS_CLI_CONFIG="- binary: $SCRIPT_DIR/skills-launcher.js
  description: Skills management CLI for development workflows
  install:
    darwin: echo \"Dependencies already installed\"
    linux: echo \"Dependencies already installed\"
    win32: echo \"Dependencies already installed\"
  name: skills"

# Check if skills CLI is already registered
if [ -f "$EXTERNAL_CLIS_FILE" ] && grep -q "name: skills" "$EXTERNAL_CLIS_FILE"; then
    warn "Skills CLI is already registered in opencli"

    # Update the existing entry
    info "Updating existing skills CLI registration..."

    # Create a temporary file with updated config
    TEMP_FILE=$(mktemp)

    # Use awk to replace the skills CLI block
    awk '
    /name: skills/ {
        in_skills_block = 1
        print "- binary: '"$SCRIPT_DIR"'/skills-launcher.js"
        print "  description: Skills management CLI for development workflows"
        print "  install:"
        print "    darwin: echo \"Dependencies already installed\""
        print "    linux: echo \"Dependencies already installed\""
        print "    win32: echo \"Dependencies already installed\""
        print "  name: skills"
        next
    }
    in_skills_block && /^- / {
        in_skills_block = 0
    }
    !in_skills_block {
        print
    }
    ' "$EXTERNAL_CLIS_FILE" > "$TEMP_FILE"

    # Replace the original file
    mv "$TEMP_FILE" "$EXTERNAL_CLIS_FILE"

    success "Skills CLI configuration updated in opencli"
else
    # Add new entry
    info "Adding skills CLI to opencli configuration..."

    if [ ! -f "$EXTERNAL_CLIS_FILE" ]; then
        # Create new file
        echo "$SKILLS_CLI_CONFIG" > "$EXTERNAL_CLIS_FILE"
    else
        # Append to existing file
        echo "$SKILLS_CLI_CONFIG" >> "$EXTERNAL_CLIS_FILE"
    fi

    success "Skills CLI registered with opencli"
fi

# Verify registration
info "Verifying registration..."
if opencli list | grep -q "skills \[installed\]"; then
    success "Skills CLI is now available via 'opencli skills'"
    echo ""
    echo "Available commands:"
    echo "  opencli skills list                     - List available skill profiles"
    echo "  opencli skills install <profile>       - Install all skills from a profile"
    echo "  opencli skills install <profile> <phase> - Install specific phase"
    echo "  opencli skills info <profile>          - Show detailed profile information"
    echo "  opencli skills update                  - Update skills cache"
    echo ""
    echo "Try: opencli skills list"
else
    warn "Skills CLI registration may need opencli restart"
    echo "Try running: opencli list"
fi