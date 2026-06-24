-- Move strip_token_color from templates to projects
ALTER TABLE templates DROP COLUMN IF EXISTS strip_token_color;
ALTER TABLE projects  ADD COLUMN IF NOT EXISTS strip_token_color boolean NOT NULL DEFAULT false;
