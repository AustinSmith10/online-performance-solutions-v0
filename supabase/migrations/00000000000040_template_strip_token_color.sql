ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS strip_token_color boolean NOT NULL DEFAULT false;
