-- Issue #51: the hardcoded halcyon_developments lookup has been fully
-- superseded by the generic client_metrics_tables autofill mechanism. Its
-- data was migrated into a client_metrics_table for the Stockland client
-- (configured with match token EXTRACT_DEV_NAME, output tokens
-- EXTRACT_TRUSTEE/EXTRACT_RAINFALL_INTENSITY) before this table was dropped.

DROP TABLE IF EXISTS halcyon_developments;
