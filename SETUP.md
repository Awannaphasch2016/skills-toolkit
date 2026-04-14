# Skills Toolkit - Supabase Setup Guide

## Quick Setup

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Create a new project
3. Note your project URL and anon key from Settings > API

### 2. Configure Doppler (Recommended)

```bash
# Install Doppler CLI
curl -Ls https://cli.doppler.com/install.sh | sh

# Setup Doppler for your project
doppler setup --project knowledgebase --config dev

# Set credentials
doppler secrets set SUPABASE_URL="https://your-project.supabase.co" --project knowledgebase --config dev
doppler secrets set SUPABASE_ANON_KEY="your-anon-key" --project knowledgebase --config dev

# Optional: Set user ID (will auto-generate if not provided)
doppler secrets set USER_ID="your-user-id" --project knowledgebase --config dev
```

### 3. Run Database Migrations

```bash
# The CLI will automatically detect credentials and run migrations
npm run skills:status

# Or manually run migrations
node -e "
import('./lib/database-client.js').then(async ({ DatabaseClient }) => {
  const db = new DatabaseClient();
  await db.initialize();
  console.log('Migrations completed');
});
"
```

### 4. Migrate Existing Data (Optional)

If you have existing skills in local registry:

```bash
# Check migration status
npm run skills:status

# Preview migration
npm run skills:migrate local-to-db -- --dry-run

# Perform migration
npm run skills:migrate local-to-db
```

## Alternative Setup (Environment Variables)

If you prefer not to use Doppler:

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export USER_ID="your-user-id"  # optional

# Run with environment variables
npm run skills:status
```

## Database Schema

The setup creates these tables:

- **skills** - Main skills registry
- **skill_installations** - Installation history and analytics
- **user_configs** - User preferences
- **schema_migrations** - Database version tracking

## Verification

```bash
# Check system status
npm run skills:status

# Test database connection
npm run skills:list

# View analytics (database mode only)
npm run skills:analytics
```

## Modes

The toolkit supports two modes:

### Database Mode (Default with credentials)
- ✅ Cross-device sync
- ✅ Installation analytics
- ✅ Advanced search
- ✅ Automatic backup
- ✅ Team sharing (future)

### Local Mode (Fallback)
- ✅ Offline operation
- ✅ No setup required
- ❌ No sync or analytics

Switch modes:
```bash
npm run skills:mode database  # Switch to database mode
npm run skills:mode local     # Switch to local mode
```

## Troubleshooting

### Database Connection Issues

1. **Check credentials:**
   ```bash
   doppler secrets --project knowledgebase --config dev
   ```

2. **Test connection:**
   ```bash
   npm run skills:status
   ```

3. **Reset to local mode:**
   ```bash
   export USE_DATABASE=false
   npm run skills:mode local
   ```

### Migration Issues

1. **Backup exists:** Check `~/.opencli/skills/backup/` for automatic backups
2. **Restore from backup:**
   ```bash
   # List available backups
   ls ~/.opencli/skills/backup/

   # Restore specific backup (contact support for restore script)
   ```

### Performance Issues

1. **Clear cache:**
   ```bash
   rm -rf ~/.opencli/skills/cache/
   ```

2. **Reset user context:**
   ```bash
   doppler secrets set USER_ID="new-user-id" --project knowledgebase --config dev
   ```

## Support

- Check [GitHub Issues](https://github.com/Awannaphasch2016/skills-toolkit/issues)
- Review logs with `DEBUG=1 npm run skills:status`
- Fallback to local mode if needed: `npm run skills:mode local`