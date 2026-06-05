-- Enable required PostgreSQL extensions for OPS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg-boss job queue schema is created automatically by pg-boss on first start.
-- All OPS application tables are added in subsequent numbered migrations.
