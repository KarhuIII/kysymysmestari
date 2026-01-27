-- ============================================
-- Kysymysmestari Database Schema for Supabase
-- ============================================
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(30) UNIQUE NOT NULL,
    display_name VARCHAR(50),
    avatar_url TEXT,
    bio VARCHAR(200),
    country VARCHAR(2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- ============================================
-- PLAYER_DATA TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS player_data (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    owned_cards JSONB DEFAULT '[]'::jsonb,
    active_cards JSONB DEFAULT '[]'::jsonb,
    owned_special_cards JSONB DEFAULT '[]'::jsonb,
    active_special_cards JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STATS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS stats (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    win_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- GAME_HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    game_id VARCHAR(10) NOT NULL,
    opponent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    opponent_name VARCHAR(50),
    result VARCHAR(10) CHECK (result IN ('win', 'loss', 'draw')),
    score_you INTEGER NOT NULL,
    score_opponent INTEGER NOT NULL,
    played_cards JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user history lookups
CREATE INDEX IF NOT EXISTS idx_game_history_user_id ON game_history(user_id);
CREATE INDEX IF NOT EXISTS idx_game_history_created_at ON game_history(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;

-- PROFILES Policies
-- Users can read all profiles (for leaderboard, opponent info)
CREATE POLICY "Profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- PLAYER_DATA Policies
-- Users can only see their own player data
CREATE POLICY "Users can view own player data"
    ON player_data FOR SELECT
    USING (auth.uid() = user_id);

-- Users can update their own player data
CREATE POLICY "Users can update own player data"
    ON player_data FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can insert their own player data
CREATE POLICY "Users can insert own player data"
    ON player_data FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- STATS Policies
-- Everyone can view stats (for leaderboard)
CREATE POLICY "Stats are viewable by everyone"
    ON stats FOR SELECT
    USING (true);

-- Only server can update stats (via service role key)
-- No update policy for regular users

-- GAME_HISTORY Policies
-- Users can view their own game history
CREATE POLICY "Users can view own game history"
    ON game_history FOR SELECT
    USING (auth.uid() = user_id);

-- Only server can insert game history
-- No insert policy for regular users

-- ============================================
-- TRIGGER FOR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_data_updated_at
    BEFORE UPDATE ON player_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stats_updated_at
    BEFORE UPDATE ON stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION: Auto-create profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, 'user_' || LEFT(NEW.id::text, 8));
    
    INSERT INTO public.player_data (user_id)
    VALUES (NEW.id);
    
    INSERT INTO public.stats (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- VIEWS FOR LEADERBOARD
-- ============================================
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.country,
    s.wins,
    s.losses,
    s.draws,
    s.games_played,
    s.best_streak,
    CASE 
        WHEN s.games_played > 0 
        THEN ROUND((s.wins::numeric / s.games_played) * 100, 1)
        ELSE 0 
    END as win_rate
FROM profiles p
JOIN stats s ON p.id = s.user_id
WHERE s.games_played >= 5
ORDER BY s.wins DESC, win_rate DESC;
