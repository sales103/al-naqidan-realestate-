-- Adds explicit kitchen/living-room counts to properties, which the client
-- wants shown alongside rooms/bathrooms in every WhatsApp reply.
-- Idempotent — safe to run against a database that already has these columns.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS kitchens INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS living_rooms INTEGER;
