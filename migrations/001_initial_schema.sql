-- Skills Toolkit Database Schema
-- Migration: 001 - Initial Schema
-- Created: 2026-04-14

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Skills registry table
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('npx', 'skillport', 'local')),
  description TEXT,
  installed BOOLEAN DEFAULT false,
  path TEXT, -- for local skills
  install_command TEXT,
  install_args JSONB,
  custom_install BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  version TEXT,
  source_url TEXT
);

-- Skill installation history
CREATE TABLE skill_installations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uninstalled_at TIMESTAMP WITH TIME ZONE,
  install_method TEXT,
  success BOOLEAN,
  error_message TEXT,
  environment JSONB -- capture env vars, system info
);

-- User preferences/configuration
CREATE TABLE user_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Performance indexes
CREATE INDEX idx_skills_user_id ON skills(user_id);
CREATE INDEX idx_skills_type ON skills(type);
CREATE INDEX idx_skills_installed ON skills(installed);
CREATE INDEX idx_skills_name_search ON skills USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
CREATE INDEX idx_skill_installations_skill_id ON skill_installations(skill_id);
CREATE INDEX idx_user_configs_user_key ON user_configs(user_id, key);

-- Row Level Security (RLS)
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can only access their own skills"
  ON skills
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true));

CREATE POLICY "Users can only access their own installation history"
  ON skill_installations
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM skills
    WHERE skills.id = skill_installations.skill_id
    AND skills.user_id = current_setting('app.current_user_id', true)
  ));

CREATE POLICY "Users can only access their own config"
  ON user_configs
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true));

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Database version tracking
CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');