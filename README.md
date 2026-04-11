# Skills Toolkit

Curated skill collections for development workflows. Simple profiles and scripts to install skills from multiple sources without added complexity.

## 🎯 Philosophy

**Keep it simple.** This toolkit provides:
- ✅ **Documentation** of useful skills from various sources
- ✅ **Profiles** for common development stacks
- ✅ **Scripts** for batch installation
- ❌ **No abstraction layer** - you still use `npx skill` and `skillport` directly
- ❌ **No new CLI to learn** - just convenient organization

## 🚀 Quick Start

```bash
# Clone the toolkit
git clone https://github.com/Awannaphasch2016/skills-toolkit
cd skills-toolkit

# See what's available
./scripts/list-available.sh

# Install a complete profile
./scripts/install-profile.sh nextjs-fullstack

# Or install specific phases
./scripts/install-profile.sh nextjs-fullstack essential
```

## 📋 Available Profiles

### Next.js Full-Stack Development
```bash
./scripts/install-profile.sh nextjs-fullstack
```
**Skills included:**
- `skills/react-best-practices` - 40+ performance rules
- `skills/deploy-to-vercel` - Deployment best practices
- `skills/web-design-guidelines` - Accessibility & UX standards
- `skills/composition-patterns` - Component architecture
- `anthropics/skills/webapp-testing` - UI testing with Playwright

**Phases available:** `essential`, `architecture`, `polish`, `testing`

### CLI Development
```bash
./scripts/install-profile.sh cli-development
```
**Skills included:**
- `anthropics/skills/skill-creator` - Testing framework for skills
- `skills/vercel-cli-with-tokens` - CLI automation

**Phases available:** `essential`, `testing`, `distribution`

### JavaScript General
```bash
./scripts/install-profile.sh javascript-general
```
**Skills included:**
- `skills/web-design-guidelines` - Web standards & accessibility
- `anthropics/skills/skill-creator` - Code quality testing

**Phases available:** `code-quality`, `web-standards`

## 🛠️ Skills Sources

### NPX Skills (Vercel Labs)
High-quality, production-tested skills from Vercel's engineering team:

```bash
npx skill skills/react-best-practices    # 40+ React/Next.js rules
npx skill skills/deploy-to-vercel        # Vercel deployment patterns
npx skill skills/web-design-guidelines   # 100+ accessibility rules
```

[📖 Full NPX Skills Reference](docs/npx-skills.md)

### SkillPort Skills (Anthropic & Others)
Community and official skills for testing, development, and more:

```bash
skillport add anthropics/skills/skill-creator    # Comprehensive testing
skillport add anthropics/skills/webapp-testing   # Playwright UI testing
skillport add anthropics/skills/mcp-builder       # MCP development
```

[📖 Full SkillPort Skills Reference](docs/skillport-skills.md)

## 📁 Project Structure

```
skills-toolkit/
├── profiles/                    # Skill profiles for different stacks
│   ├── nextjs-fullstack.json   # Next.js + Vercel complete stack
│   ├── cli-development.json    # CLI development tools
│   └── javascript-general.json # General JavaScript skills
├── scripts/                    # Installation utilities
│   ├── install-profile.sh      # Install skill profiles
│   └── list-available.sh       # List available skills
├── docs/                       # Detailed documentation
│   ├── npx-skills.md           # NPX skills reference
│   └── skillport-skills.md     # SkillPort skills reference
└── README.md                   # This file
```

## 🎮 Usage Examples

### Install Everything for Next.js
```bash
# Install complete Next.js development stack
./scripts/install-profile.sh nextjs-fullstack

# Environment setup
export VERCEL_TOKEN="your-token"
export OPENROUTER_API_KEY="your-key"
```

### Install Just Testing Tools
```bash
# Install only testing phase
./scripts/install-profile.sh nextjs-fullstack testing

# Results in:
skillport add anthropics/skills/webapp-testing
```

### See What's Available
```bash
# List everything
./scripts/list-available.sh

# List only NPX skills
./scripts/list-available.sh npx

# List only profiles
./scripts/list-available.sh profiles
```

### Manual Installation (No Scripts)
```bash
# Read the profile
cat profiles/nextjs-fullstack.json

# Install manually
npx skill skills/react-best-practices
npx skill skills/deploy-to-vercel
skillport add anthropics/skills/webapp-testing
```

## 🔧 Requirements

### Essential
- **Node.js & NPX** - For NPX skills installation
- **SkillPort** - `pip install skillport` for SkillPort skills
- **jq** - For profile parsing (enhanced features)

### Verification
```bash
./scripts/list-available.sh tools  # Check tool status
```

## 📈 Recommended Installation Order

### For New Projects
1. **Start with essential tools**:
   ```bash
   ./scripts/install-profile.sh nextjs-fullstack essential
   ```

2. **Add architecture patterns**:
   ```bash
   ./scripts/install-profile.sh nextjs-fullstack architecture
   ```

3. **Include testing when ready**:
   ```bash
   ./scripts/install-profile.sh nextjs-fullstack testing
   ```

### For Existing Projects
1. **Assess current needs** with list command
2. **Install specific phases** rather than everything
3. **Test one skill at a time** to verify compatibility

## 🚀 Advanced Usage

### Custom Profiles
Create your own profile in `profiles/my-custom.json`:

```json
{
  "name": "my-custom",
  "description": "My custom skill set",
  "all_skills": {
    "npx-skills": ["skills/react-best-practices"],
    "skillport-skills": ["anthropics/skills/skill-creator"]
  }
}
```

### Environment Variables
Profiles may suggest environment variables:

```bash
# Check profile for environment needs
jq '.environment' profiles/nextjs-fullstack.json

# Common variables
export OPENROUTER_API_KEY="your-api-key"
export VERCEL_TOKEN="your-vercel-token"
export GITHUB_TOKEN="your-github-token"
```

## 🤝 Contributing

### Adding New Profiles
1. Create JSON file in `profiles/`
2. Follow existing structure and naming
3. Test with install script
4. Submit pull request

### Adding New Skills
1. Document in appropriate `docs/*.md` file
2. Add to relevant profiles
3. Update installation scripts if needed

## 📄 License

MIT License - Use freely for any project.

## 🔗 Related Projects

- [CLI Toolkit](https://github.com/Awannaphasch2016/cli-toolkit) - AI-powered CLI tools
- [Vercel Labs Agent Skills](https://github.com/vercel-labs/agent-skills) - NPX skills source
- [Anthropic Skills](https://github.com/anthropics/skills) - SkillPort skills source

---

**Keep it simple. Use the tools that work. Organize what matters.**