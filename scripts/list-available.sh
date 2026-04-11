#!/bin/bash

# list-available.sh - List available skills from all sources
# Usage: ./list-available.sh [source]

set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

show_help() {
    echo "Usage: $0 [source]"
    echo ""
    echo "List available skills from various sources"
    echo ""
    echo "Sources:"
    echo "  npx          List NPX skills (from Vercel Labs)"
    echo "  skillport    List SkillPort skills"
    echo "  profiles     List available profiles"
    echo "  all          List everything (default)"
    echo ""
    echo "Examples:"
    echo "  $0              # List all skills and profiles"
    echo "  $0 npx          # List only NPX skills"
    echo "  $0 skillport    # List only SkillPort skills"
    echo "  $0 profiles     # List only available profiles"
    echo ""
}

list_npx_skills() {
    echo -e "${BLUE}📦 NPX Skills (Vercel Labs)${NC}"
    echo -e "${GRAY}Available from: npx skill skills/<name>${NC}"
    echo ""

    # List known NPX skills
    local npx_skills=(
        "skills/react-best-practices:40+ performance rules for React/Next.js"
        "skills/composition-patterns:Advanced React composition techniques"
        "skills/deploy-to-vercel:Deployment best practices for Vercel"
        "skills/react-view-transitions:Modern transition patterns"
        "skills/vercel-cli-with-tokens:CLI automation and token management"
        "skills/web-design-guidelines:100+ accessibility and UX rules"
        "skills/react-native-skills:React Native performance patterns"
    )

    for skill in "${npx_skills[@]}"; do
        local name="${skill%%:*}"
        local description="${skill##*:}"
        echo -e "  ${GREEN}${name}${NC}"
        echo -e "    ${description}"
        echo ""
    done

    echo -e "${GRAY}Install with: npx skill <skill-name>${NC}"
    echo ""
}

list_skillport_skills() {
    echo -e "${BLUE}🔧 SkillPort Skills${NC}"
    echo -e "${GRAY}Available from: skillport add <skill-name>${NC}"
    echo ""

    # Check if skillport is available
    if ! command -v skillport >/dev/null 2>&1; then
        log_warn "SkillPort not installed. Install with: pip install skillport"
        echo ""
        return
    fi

    # List installed skills
    echo -e "${CYAN}Currently Installed:${NC}"
    skillport list 2>/dev/null || echo "  No skills installed"
    echo ""

    # List known Anthropic skills
    echo -e "${CYAN}Anthropic Skills Repository:${NC}"
    local anthropic_skills=(
        "anthropics/skills/skill-creator:Create and test new skills with evaluation"
        "anthropics/skills/webapp-testing:Playwright-based UI testing"
        "anthropics/skills/mcp-builder:MCP server development tools"
        "anthropics/skills/doc-coauthoring:Documentation collaboration"
    )

    for skill in "${anthropic_skills[@]}"; do
        local name="${skill%%:*}"
        local description="${skill##*:}"
        echo -e "  ${GREEN}${name}${NC}"
        echo -e "    ${description}"
        echo ""
    done

    echo -e "${GRAY}Install with: skillport add <skill-name>${NC}"
    echo ""
}

list_profiles() {
    echo -e "${BLUE}📋 Available Profiles${NC}"
    echo -e "${GRAY}Install with: ./scripts/install-profile.sh <profile-name>${NC}"
    echo ""

    # Change to script directory
    cd "$(dirname "$0")/.."

    for profile in profiles/*.json; do
        if [[ -f "$profile" ]]; then
            local name
            name=$(basename "$profile" .json)

            if command -v jq >/dev/null 2>&1; then
                local description
                description=$(jq -r '.description' "$profile" 2>/dev/null || echo "No description")
                local categories
                categories=$(jq -r '.categories[]?' "$profile" 2>/dev/null | paste -sd "," - || echo "")

                echo -e "  ${GREEN}${name}${NC}"
                echo -e "    ${description}"
                if [[ -n "$categories" ]]; then
                    echo -e "    ${GRAY}Categories: ${categories}${NC}"
                fi

                # Show skill counts
                local npx_count
                npx_count=$(jq '.all_skills."npx-skills" | length' "$profile" 2>/dev/null || echo "0")
                local skillport_count
                skillport_count=$(jq '.all_skills."skillport-skills" | length' "$profile" 2>/dev/null || echo "0")
                echo -e "    ${GRAY}Skills: ${npx_count} NPX, ${skillport_count} SkillPort${NC}"
                echo ""
            else
                echo -e "  ${GREEN}${name}${NC}"
                echo -e "    ${GRAY}(Install jq to see details)${NC}"
                echo ""
            fi
        fi
    done

    echo -e "${GRAY}Install with: ./scripts/install-profile.sh <profile-name> [phase]${NC}"
    echo ""
}

check_tools() {
    echo -e "${BLUE}🔍 Tool Status${NC}"
    echo ""

    # Check NPX
    if command -v npx >/dev/null 2>&1; then
        log_success "NPX is available"
    else
        log_warn "NPX not found (install Node.js)"
    fi

    # Check SkillPort
    if command -v skillport >/dev/null 2>&1; then
        log_success "SkillPort is available"
    else
        log_warn "SkillPort not found (pip install skillport)"
    fi

    # Check jq
    if command -v jq >/dev/null 2>&1; then
        log_success "jq is available"
    else
        log_warn "jq not found (enhanced profile details unavailable)"
    fi

    echo ""
}

main() {
    local source="${1:-all}"

    if [[ "$source" == "-h" || "$source" == "--help" ]]; then
        show_help
        exit 0
    fi

    echo -e "${CYAN}🛠️  Skills Toolkit - Available Skills${NC}"
    echo ""

    case "$source" in
        "npx")
            list_npx_skills
            ;;
        "skillport")
            list_skillport_skills
            ;;
        "profiles")
            list_profiles
            ;;
        "tools")
            check_tools
            ;;
        "all")
            check_tools
            list_profiles
            list_npx_skills
            list_skillport_skills
            ;;
        *)
            echo "Unknown source: $source"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"