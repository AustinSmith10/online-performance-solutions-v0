-- Simplify the delivery-delay durations setting (#66 follow-up): default to
-- whole working days rather than raw hours, while still allowing hours for
-- finer control. Replaces the {normalHours, extendedHours} shape introduced
-- in 00000000000080_delivery_delay_preset.sql with {unit, value} pairs.
UPDATE app_settings
SET value = '{"normal":{"unit":"workingDays","value":1},"extended":{"unit":"workingDays","value":7}}'::jsonb
WHERE key = 'delivery_delay_durations';
