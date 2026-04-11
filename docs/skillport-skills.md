# SkillPort Skills Reference

Skills available via `skillport` from various repositories including Anthropic's official skills.

## Installation

```bash
skillport add <skill-source>
```

Skills are managed in `.skills/` directory and can be loaded into various AI assistants.

## Anthropic Skills Repository

### Testing & Quality Assurance

#### Skill Creator ⭐ **ESSENTIAL**
```bash
skillport add anthropics/skills/skill-creator
```
- **Comprehensive testing framework** with quantitative assertions
- **Test case drafting** with objective verification
- **Iterative improvement** based on feedback
- **Evaluation guides** for testing skill effectiveness
- **HTML viewer** for reviewing test outputs
- **Description optimizer** for better skill triggering

#### Web Application Testing
```bash
skillport add anthropics/skills/webapp-testing
```
- **Playwright-based UI testing** for local web applications
- **Frontend functional verification**
- **UI behavior debugging**
- **Browser screenshot comparison**
- **Automated regression testing**
- **Local development testing**

### Development Tools

#### MCP Builder
```bash
skillport add anthropics/skills/mcp-builder
```
- **MCP server development** with evaluation guides
- **Model Context Protocol** implementation
- **Testing LLM integration** with MCP servers
- **Complex question handling** evaluation
- **Server deployment** best practices

#### Document Co-authoring
```bash
skillport add anthropics/skills/doc-coauthoring
```
- **Documentation collaboration** workflows
- **Content review processes**
- **Version control** for documentation
- **Team collaboration** patterns

## Custom Skills Management

### Local Skills
```bash
# Add from local directory
skillport add ./my-custom-skill/

# Add from GitHub repository
skillport add https://github.com/user/repo

# Add with namespace
skillport add ./skills/ --namespace team
```

### GitHub Integration
```bash
# Add from GitHub shorthand
skillport add user/repo

# Add specific paths
skillport add anthropics/skills skills/webapp-testing

# Add with version control
skillport add user/repo --force  # Overwrite existing
```

## Skill Categories

### By Purpose

**Testing & Validation:**
- skill-creator
- webapp-testing

**Development:**
- mcp-builder
- doc-coauthoring

**Skill Management:**
- Built-in templates (hello-world, template)

### By Complexity

**Beginner:**
- webapp-testing (UI testing basics)
- doc-coauthoring (documentation workflows)

**Intermediate:**
- skill-creator (comprehensive testing)

**Advanced:**
- mcp-builder (protocol development)

## Built-in Skills

### Templates
```bash
skillport add hello-world    # Basic skill example
skillport add template       # Skill creation template
```

## Management Commands

### Discovery
```bash
skillport list              # List installed skills
skillport show <skill-id>   # Show skill details
```

### Maintenance
```bash
skillport update <skill>    # Update from source
skillport remove <skill>    # Remove skill
skillport validate          # Validate all skills
```

### Documentation
```bash
skillport doc              # Update instruction files
skillport meta <skill>     # Manage skill metadata
```

## Configuration

SkillPort skills can be configured via `skillport.config.yaml`:

```yaml
skills:
  - name: "skill-creator"
    source: "github"
    path: "anthropics/skills/skills/skill-creator"
    categories: ["testing", "development"]
    platforms: ["claude-code", "cursor"]
```

## Integration with AI Assistants

### Claude Code
- Skills installed to `.claude/skills/`
- Automatic loading via AGENTS.md
- Real-time skill discovery

### Cursor & Codex
- Skills provide AGENTS.md integration
- Custom rules directory support
- Project-specific skill configuration

## Environment Requirements

### For Anthropic Skills
```bash
# Python for skill-creator
python3 --version

# Playwright for webapp-testing
npx playwright install

# Git for repository skills
git --version
```

### For Custom Skills
- Skills may have individual requirements
- Check each skill's documentation
- Environment variables as needed

## Best Practices

### Skill Installation
1. **Review skill documentation** before installation
2. **Test in development environment** first
3. **Check dependencies** and requirements
4. **Use version control** for team environments

### Skill Development
1. **Start with templates** (hello-world, template)
2. **Use skill-creator** for testing new skills
3. **Follow Agent Skills specification**
4. **Include comprehensive examples**

### Team Usage
1. **Share skillport.config.yaml** across team
2. **Use namespaces** for organization-specific skills
3. **Document custom skills** thoroughly
4. **Version control skill configurations**

## Advanced Usage

### Skill Creation
```bash
# Create new skill from template
skillport add template --name my-new-skill

# Test skill effectiveness
skillport show skill-creator  # Follow testing guide
```

### Cross-Registry Workflow
```bash
# Combine with NPX skills
npx skill skills/react-best-practices
skillport add anthropics/skills/webapp-testing

# Create comprehensive development environment
```

## Troubleshooting

### Common Issues
- **Skill not loading**: Check `.claude/skills/` directory
- **Missing dependencies**: Review skill requirements
- **Permission errors**: Check file system permissions
- **GitHub access**: Verify Git authentication for private repos

### Debug Commands
```bash
skillport validate <skill>     # Check skill structure
skillport show <skill> --debug # Detailed information
skillport list --json         # Machine-readable output
```