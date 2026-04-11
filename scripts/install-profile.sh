#!/bin/bash

# install-profile.sh - Install skills from a profile
# Usage: ./install-profile.sh <profile-name> [phase]

set -e

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

show_help() {
    echo "Usage: $0 <profile-name> [phase]"
    echo ""
    echo "Install skills from a profile configuration"
    echo ""
    echo "Arguments:"
    echo "  profile-name    Name of the profile (e.g., nextjs-fullstack)"
    echo "  phase          Optional phase to install (e.g., essential, testing)"
    echo ""
    echo "Available profiles:"
    for profile in profiles/*.json; do
        if [[ -f "$profile" ]]; then
            name=$(basename "$profile" .json)
            description=$(jq -r '.description' "$profile" 2>/dev/null || echo "No description")
            echo "  - ${name}: ${description}"
        fi
    done
    echo ""
    echo "Examples:"
    echo "  $0 nextjs-fullstack              # Install all skills"
    echo "  $0 nextjs-fullstack essential    # Install only essential phase"
    echo "  $0 cli-development               # Install CLI development skills"
    echo ""
}

check_dependencies() {
    local missing=()

    if ! command -v jq >/dev/null 2>&1; then
        missing+=("jq")
    fi

    if ! command -v npx >/dev/null 2>&1; then
        missing+=("npx")
    fi

    if ! command -v skillport >/dev/null 2>&1; then
        missing+=("skillport")
    fi

    if [[ ${#missing[@]} -ne 0 ]]; then
        log_error "Missing required dependencies: ${missing[*]}"
        echo "Please install:"
        for dep in "${missing[@]}"; do
            case "$dep" in
                "jq") echo "  - jq: https://jqlang.github.io/jq/download/" ;;
                "npx") echo "  - Node.js: https://nodejs.org/" ;;
                "skillport") echo "  - skillport: pip install skillport" ;;
            esac
        done
        exit 1
    fi
}

install_npx_skills() {
    local skills=("$@")

    if [[ ${#skills[@]} -eq 0 ]]; then
        return 0
    fi

    log_info "Installing NPX skills..."

    for skill in "${skills[@]}"; do
        log_info "Installing NPX skill: $skill"
        if npx skill "$skill"; then
            log_success "Installed: $skill"
        else
            log_error "Failed to install: $skill"
            return 1
        fi
    done
}

install_skillport_skills() {
    local skills=("$@")

    if [[ ${#skills[@]} -eq 0 ]]; then
        return 0
    fi

    log_info "Installing SkillPort skills..."

    for skill in "${skills[@]}"; do
        log_info "Installing SkillPort skill: $skill"
        if skillport add "$skill" --yes 2>/dev/null; then
            log_success "Installed: $skill"
        else
            log_error "Failed to install: $skill"
            return 1
        fi
    done
}

install_from_profile() {
    local profile_file="$1"
    local phase="$2"

    log_info "Reading profile: $profile_file"

    if [[ ! -f "$profile_file" ]]; then
        log_error "Profile file not found: $profile_file"
        return 1
    fi

    # Check if profile is valid JSON
    if ! jq empty "$profile_file" 2>/dev/null; then
        log_error "Invalid JSON in profile file: $profile_file"
        return 1
    fi

    local profile_name
    profile_name=$(jq -r '.name' "$profile_file")
    local profile_description
    profile_description=$(jq -r '.description' "$profile_file")

    echo ""
    echo -e "${BLUE}📦 Installing Profile: ${profile_name}${NC}"
    echo -e "${BLUE}Description: ${profile_description}${NC}"
    echo ""

    # Determine which skills to install
    local npx_skills=()
    local skillport_skills=()

    if [[ -n "$phase" ]]; then
        log_info "Installing phase: $phase"

        # Check if phase exists
        if ! jq -e ".phases.\"$phase\"" "$profile_file" >/dev/null 2>&1; then
            log_error "Phase '$phase' not found in profile"
            log_info "Available phases:"
            jq -r '.phases | keys[]' "$profile_file" 2>/dev/null || echo "  No phases defined"
            return 1
        fi

        # Get skills for specific phase
        readarray -t npx_skills < <(jq -r ".phases.\"$phase\".\"npx-skills\"[]?" "$profile_file" 2>/dev/null)
        readarray -t skillport_skills < <(jq -r ".phases.\"$phase\".\"skillport-skills\"[]?" "$profile_file" 2>/dev/null)
    else
        log_info "Installing all skills"

        # Get all skills
        readarray -t npx_skills < <(jq -r '.all_skills."npx-skills"[]?' "$profile_file" 2>/dev/null)
        readarray -t skillport_skills < <(jq -r '.all_skills."skillport-skills"[]?' "$profile_file" 2>/dev/null)
    fi

    # Show what will be installed
    local total_skills=$((${#npx_skills[@]} + ${#skillport_skills[@]}))

    if [[ $total_skills -eq 0 ]]; then
        log_warn "No skills found to install"
        return 0
    fi

    log_info "Will install $total_skills skills:"

    if [[ ${#npx_skills[@]} -gt 0 ]]; then
        echo -e "${CYAN}NPX Skills:${NC}"
        for skill in "${npx_skills[@]}"; do
            echo "  - $skill"
        done
    fi

    if [[ ${#skillport_skills[@]} -gt 0 ]]; then
        echo -e "${CYAN}SkillPort Skills:${NC}"
        for skill in "${skillport_skills[@]}"; do
            echo "  - $skill"
        done
    fi

    echo ""
    read -p "Continue with installation? [y/N] " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        return 0
    fi

    # Install skills
    if [[ ${#npx_skills[@]} -gt 0 ]]; then
        install_npx_skills "${npx_skills[@]}" || return 1
    fi

    if [[ ${#skillport_skills[@]} -gt 0 ]]; then
        install_skillport_skills "${skillport_skills[@]}" || return 1
    fi

    log_success "Profile installation completed: $profile_name"

    # Show environment variables if any
    if jq -e '.environment' "$profile_file" >/dev/null 2>&1; then
        echo ""
        log_info "Environment variables for this profile:"

        if jq -e '.environment.recommended' "$profile_file" >/dev/null 2>&1; then
            echo -e "${CYAN}Recommended:${NC}"
            jq -r '.environment.recommended[]' "$profile_file" | sed 's/^/  - /'
        fi

        if jq -e '.environment.optional' "$profile_file" >/dev/null 2>&1; then
            echo -e "${CYAN}Optional:${NC}"
            jq -r '.environment.optional[]' "$profile_file" | sed 's/^/  - /'
        fi
    fi
}

main() {
    if [[ "$1" == "-h" || "$1" == "--help" || -z "$1" ]]; then
        show_help
        exit 0
    fi

    local profile_name="$1"
    local phase="$2"
    local profile_file="profiles/${profile_name}.json"

    # Change to script directory
    cd "$(dirname "$0")/.."

    log_info "Skills Toolkit Profile Installer"
    echo ""

    check_dependencies
    install_from_profile "$profile_file" "$phase"
}

main "$@"