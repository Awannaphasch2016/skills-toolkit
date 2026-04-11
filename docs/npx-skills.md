# NPX Skills Reference

Skills available via `npx skill` from the Vercel Labs repository.

## Installation

```bash
npx skill skills/<skill-name>
```

Skills are downloaded to `~/.codebuddy/skills/` directory.

## Available Skills

### Frontend Development

#### React Best Practices ⭐ **CRITICAL**
```bash
npx skill skills/react-best-practices
```
- **40+ performance optimization rules** across 8 categories
- **Critical**: Eliminating waterfalls, bundle size optimization
- **High**: Server-side performance, client-side data fetching
- Real-world examples with before/after code comparisons
- Impact metrics for automated refactoring
- Includes Next.js App Router, RSC, and SSR optimizations

#### Composition Patterns
```bash
npx skill skills/composition-patterns
```
- Advanced React composition techniques
- Component architecture best practices
- Maintainable code structure patterns
- SSR/RSC patterns for Next.js

#### React View Transitions
```bash
npx skill skills/react-view-transitions
```
- Modern transition patterns
- Performance-optimized animations
- Smooth user experience implementations
- App Router transitions for Next.js

### Deployment & Infrastructure

#### Deploy to Vercel ⭐ **ESSENTIAL**
```bash
npx skill skills/deploy-to-vercel
```
- Next.js deployment best practices
- Production optimization patterns
- CI/CD integration workflows
- Vercel-specific configurations

#### Vercel CLI with Tokens
```bash
npx skill skills/vercel-cli-with-tokens
```
- CLI automation workflows
- Token management best practices
- Development workflow optimization
- Build automation scripts

### Design & Accessibility

#### Web Design Guidelines ⭐ **ESSENTIAL**
```bash
npx skill skills/web-design-guidelines
```
- **100+ rules** for accessibility, UX, and performance
- Focus handling, forms, animation, typography
- Dark mode, touch interaction, internationalization
- WCAG compliance guidelines
- Comprehensive UI/UX quality standards

### Mobile Development

#### React Native Skills
```bash
npx skill skills/react-native-skills
```
- **16 rules** across 7 sections
- Performance, architecture, and platform-specific patterns
- Mobile-specific code quality standards
- Native integration best practices

## Skill Categories

### By Priority

**Tier 1 - Essential:**
- `react-best-practices` - Core performance & quality
- `deploy-to-vercel` - Production deployment
- `web-design-guidelines` - Accessibility & UX

**Tier 2 - Architecture:**
- `composition-patterns` - Component patterns
- `react-view-transitions` - Modern UI
- `vercel-cli-with-tokens` - Automation

**Tier 3 - Specialized:**
- `react-native-skills` - Mobile development

### By Use Case

**Next.js Development:**
- react-best-practices
- deploy-to-vercel
- composition-patterns
- react-view-transitions

**Web Standards:**
- web-design-guidelines
- react-best-practices

**Deployment Automation:**
- deploy-to-vercel
- vercel-cli-with-tokens

## Integration

These skills are designed to work together and complement each other. They're based on **10+ years of React/Next.js optimization** from Vercel's engineering team.

### With AI Assistants
- Skills are **AI-optimized** for agent/LLM consumption
- **Impact-prioritized** rules ordered by performance impact
- **Validation-backed** tested in secure sandboxes

### Environment Variables
Most skills work with standard Next.js/Vercel environment variables:
- `VERCEL_TOKEN` - For deployment automation
- `NEXT_PUBLIC_*` - For client-side configuration

## Best Practices

1. **Start with essential skills** (react-best-practices, deploy-to-vercel)
2. **Install by priority tier** rather than all at once
3. **Test in development** before applying to production
4. **Combine with testing** - use with SkillPort testing skills

## Notes

- Skills are **read-only** and don't modify your code automatically
- They provide **guidance and examples** for manual implementation
- **Always review suggestions** before applying to your codebase
- Skills are **version-controlled** via the npx installation mechanism