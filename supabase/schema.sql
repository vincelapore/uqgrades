-- UQGrades Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)

-- User's saved courses/semesters
CREATE TABLE saved_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university TEXT NOT NULL DEFAULT 'uq',
  course_code TEXT NOT NULL,
  year INTEGER NOT NULL,
  semester TEXT NOT NULL,
  delivery TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, university, course_code, year, semester, delivery)
);

-- Index for fast lookups by user
CREATE INDEX idx_saved_courses_user_id ON saved_courses(user_id);

-- Enable Row Level Security
ALTER TABLE saved_courses ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view own courses"
  ON saved_courses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own courses"
  ON saved_courses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own courses"
  ON saved_courses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own courses"
  ON saved_courses FOR DELETE
  USING (auth.uid() = user_id);
