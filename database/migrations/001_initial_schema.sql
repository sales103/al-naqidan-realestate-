-- =============================================================================
-- شركة عبدالحكيم النقيدان للاستثمارات العقارية
-- Database Schema - Initial Migration
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create additional databases
SELECT 'CREATE DATABASE n8n_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8n_db')\gexec
SELECT 'CREATE DATABASE evolution_db' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution_db')\gexec

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE property_type AS ENUM (
  'land', 'apartment', 'villa', 'building', 'office',
  'showroom', 'warehouse', 'farm', 'investment_project', 'other'
);

CREATE TYPE property_status AS ENUM (
  'available', 'reserved', 'sold', 'rented', 'under_maintenance',
  'coming_soon', 'hidden'
);

CREATE TYPE property_purpose AS ENUM ('sale', 'rent', 'both');

CREATE TYPE client_status AS ENUM (
  'new', 'contacted', 'interested', 'viewing_scheduled',
  'negotiating', 'contract_pending', 'closed_won', 'closed_lost',
  'on_hold', 'follow_up'
);

CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

CREATE TYPE message_type AS ENUM (
  'text', 'image', 'video', 'audio', 'document',
  'location', 'sticker', 'reaction', 'system'
);

CREATE TYPE message_status AS ENUM (
  'pending', 'sent', 'delivered', 'read', 'failed'
);

CREATE TYPE user_role AS ENUM (
  'super_admin', 'admin', 'sales_manager', 'sales_agent',
  'marketer', 'customer_service', 'viewer'
);

CREATE TYPE appointment_status AS ENUM (
  'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
);

CREATE TYPE contract_status AS ENUM (
  'draft', 'pending_signature', 'signed', 'active', 'completed',
  'cancelled', 'disputed'
);

CREATE TYPE follow_up_type AS ENUM (
  'auto_1day', 'auto_3days', 'auto_1week', 'auto_1month', 'manual'
);

CREATE TYPE notification_type AS ENUM (
  'new_client', 'new_message', 'appointment_reminder', 'follow_up',
  'deal_closed', 'system_alert', 'report_ready'
);

-- =============================================================================
-- USERS & AUTHENTICATION
-- =============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  full_name_ar VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  avatar_url VARCHAR(500),
  whatsapp_number VARCHAR(20),
  last_login_at TIMESTAMPTZ,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(255),
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PROPERTIES
-- =============================================================================

CREATE TABLE cities (
  id SERIAL PRIMARY KEY,
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  region_ar VARCHAR(100),
  region_en VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE districts (
  id SERIAL PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  direction VARCHAR(20), -- شمال، جنوب، شرق، غرب، وسط
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE property_owners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  id_number VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  title_ar VARCHAR(500),
  description TEXT,
  description_ar TEXT,
  property_type property_type NOT NULL,
  purpose property_purpose NOT NULL DEFAULT 'sale',
  status property_status NOT NULL DEFAULT 'available',

  -- Location
  city_id INTEGER REFERENCES cities(id),
  district_id INTEGER REFERENCES districts(id),
  address TEXT,
  google_maps_url VARCHAR(1000),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_point GEOGRAPHY(POINT, 4326),

  -- Details
  area_sqm DECIMAL(12, 2),
  rooms INTEGER,
  bathrooms INTEGER,
  floor_number INTEGER,
  total_floors INTEGER,
  parking_spaces INTEGER,
  age_years INTEGER,

  -- Pricing
  price DECIMAL(15, 2),
  price_per_sqm DECIMAL(10, 2),
  negotiable BOOLEAN DEFAULT true,
  currency VARCHAR(10) DEFAULT 'SAR',

  -- Features
  features JSONB DEFAULT '[]',
  amenities JSONB DEFAULT '[]',
  nearby_places JSONB DEFAULT '[]',

  -- Ownership & Marketing
  owner_id UUID REFERENCES property_owners(id),
  assigned_agent_id UUID REFERENCES users(id),
  commission_percentage DECIMAL(5, 2),
  commission_amount DECIMAL(12, 2),

  -- Media
  main_image_url VARCHAR(1000),
  qr_code_url VARCHAR(1000),

  -- Meta
  is_featured BOOLEAN DEFAULT false,
  view_count INTEGER DEFAULT 0,
  inquiry_count INTEGER DEFAULT 0,
  tags TEXT[],
  meta_keywords TEXT,

  -- Timestamps
  available_from DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE property_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL, -- image, video, pdf, document
  url VARCHAR(1000) NOT NULL,
  thumbnail_url VARCHAR(1000),
  title VARCHAR(255),
  size_bytes BIGINT,
  mime_type VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  is_main BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE property_price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  old_price DECIMAL(15, 2),
  new_price DECIMAL(15, 2),
  change_reason TEXT,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- CLIENTS & CRM
-- =============================================================================

CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  whatsapp_id VARCHAR(100) UNIQUE,
  email VARCHAR(255),
  id_number VARCHAR(50),
  nationality VARCHAR(100) DEFAULT 'سعودي',

  -- Location
  city_id INTEGER REFERENCES cities(id),
  district VARCHAR(100),
  address TEXT,

  -- Requirements
  preferred_property_types property_type[],
  preferred_cities INTEGER[],
  preferred_districts INTEGER[],
  budget_min DECIMAL(15, 2),
  budget_max DECIMAL(15, 2),
  purpose property_purpose,
  area_min DECIMAL(12, 2),
  area_max DECIMAL(12, 2),
  rooms_needed INTEGER,
  special_requirements TEXT,

  -- Status & Assignment
  status client_status NOT NULL DEFAULT 'new',
  source VARCHAR(100) DEFAULT 'whatsapp',
  assigned_agent_id UUID REFERENCES users(id),
  last_contact_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,

  -- AI Data
  ai_profile JSONB DEFAULT '{}',
  conversation_context JSONB DEFAULT '{}',
  intent_history JSONB DEFAULT '[]',

  -- Notes
  notes TEXT,
  tags TEXT[],
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),

  -- Timestamps
  first_contact_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE client_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_private BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_property_interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  interest_level INTEGER DEFAULT 3 CHECK (interest_level >= 1 AND interest_level <= 5),
  notes TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  UNIQUE(client_id, property_id)
);

-- =============================================================================
-- CONVERSATIONS & MESSAGES
-- =============================================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  whatsapp_chat_id VARCHAR(100) NOT NULL UNIQUE,
  assigned_agent_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  is_ai_enabled BOOLEAN DEFAULT true,
  ai_handoff_requested BOOLEAN DEFAULT false,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  whatsapp_message_id VARCHAR(255) UNIQUE,
  direction message_direction NOT NULL,
  message_type message_type NOT NULL DEFAULT 'text',
  status message_status NOT NULL DEFAULT 'pending',

  -- Content
  content TEXT,
  caption TEXT,
  media_url VARCHAR(1000),
  media_mime_type VARCHAR(100),
  media_size_bytes BIGINT,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  location_name VARCHAR(255),

  -- AI Processing
  transcription TEXT,
  ai_processed BOOLEAN DEFAULT false,
  ai_intent VARCHAR(100),
  ai_entities JSONB DEFAULT '{}',
  ai_response_time_ms INTEGER,
  ai_model_used VARCHAR(100),
  ai_tokens_used INTEGER,
  ai_cost_usd DECIMAL(10, 6),

  -- Metadata
  sent_by UUID REFERENCES users(id),
  is_from_ai BOOLEAN DEFAULT false,
  quoted_message_id UUID REFERENCES messages(id),
  reaction VARCHAR(10),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- =============================================================================
-- APPOINTMENTS
-- =============================================================================

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  assigned_agent_id UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  meeting_link VARCHAR(500),
  notes TEXT,
  reminder_sent BOOLEAN DEFAULT false,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- =============================================================================
-- CONTRACTS & DEALS
-- =============================================================================

CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_number VARCHAR(50) UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id),
  property_id UUID NOT NULL REFERENCES properties(id),
  assigned_agent_id UUID REFERENCES users(id),
  status contract_status NOT NULL DEFAULT 'draft',

  -- Financial
  agreed_price DECIMAL(15, 2) NOT NULL,
  commission_percentage DECIMAL(5, 2),
  commission_amount DECIMAL(12, 2),
  payment_method VARCHAR(100),
  payment_schedule JSONB DEFAULT '[]',

  -- Dates
  expected_close_date DATE,
  actual_close_date DATE,

  -- Documents
  contract_url VARCHAR(1000),
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- =============================================================================
-- FOLLOW-UPS
-- =============================================================================

CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  follow_up_type follow_up_type NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending',
  message_content TEXT,
  response_received BOOLEAN DEFAULT false,
  is_cancelled BOOLEAN DEFAULT false,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- REPORTS & ANALYTICS
-- =============================================================================

CREATE TABLE daily_stats (
  id SERIAL PRIMARY KEY,
  stat_date DATE UNIQUE NOT NULL,
  new_clients INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  inbound_messages INTEGER DEFAULT 0,
  outbound_messages INTEGER DEFAULT 0,
  ai_responses INTEGER DEFAULT 0,
  human_responses INTEGER DEFAULT 0,
  appointments_scheduled INTEGER DEFAULT 0,
  deals_closed INTEGER DEFAULT 0,
  total_revenue DECIMAL(15, 2) DEFAULT 0,
  ai_cost_usd DECIMAL(10, 4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SYSTEM SETTINGS
-- =============================================================================

CREATE TABLE system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Properties
CREATE INDEX idx_properties_type ON properties(property_type);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_city ON properties(city_id);
CREATE INDEX idx_properties_district ON properties(district_id);
CREATE INDEX idx_properties_price ON properties(price);
CREATE INDEX idx_properties_area ON properties(area_sqm);
CREATE INDEX idx_properties_created ON properties(created_at DESC);
CREATE INDEX idx_properties_location ON properties USING GIST(location_point);
CREATE INDEX idx_properties_search ON properties USING gin(
  to_tsvector('arabic', coalesce(title_ar, '') || ' ' || coalesce(description_ar, ''))
);
CREATE INDEX idx_properties_tags ON properties USING gin(tags);

-- Clients
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_whatsapp ON clients(whatsapp_id);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_agent ON clients(assigned_agent_id);
CREATE INDEX idx_clients_follow_up ON clients(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX idx_clients_search ON clients USING gin(
  to_tsvector('arabic', coalesce(full_name, ''))
);

-- Messages
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_whatsapp_id ON messages(whatsapp_message_id);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_created ON messages(created_at DESC);

-- Conversations
CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_chat ON conversations(whatsapp_chat_id);
CREATE INDEX idx_conversations_active ON conversations(is_active);

-- Appointments
CREATE INDEX idx_appointments_client ON appointments(client_id);
CREATE INDEX idx_appointments_scheduled ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE NOT is_read;

-- Audit logs
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_properties_updated BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_conversations_updated BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_appointments_updated BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_deals_updated BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update property location point when lat/lng changes
CREATE OR REPLACE FUNCTION update_property_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location_point = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_property_location BEFORE INSERT OR UPDATE ON properties
FOR EACH ROW EXECUTE FUNCTION update_property_location();

-- Auto-generate property code
CREATE OR REPLACE FUNCTION generate_property_code()
RETURNS TRIGGER AS $$
DECLARE
  type_prefix VARCHAR(3);
  seq_num INTEGER;
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    type_prefix := CASE NEW.property_type
      WHEN 'land' THEN 'LND'
      WHEN 'apartment' THEN 'APT'
      WHEN 'villa' THEN 'VIL'
      WHEN 'building' THEN 'BLD'
      WHEN 'office' THEN 'OFF'
      WHEN 'showroom' THEN 'SHW'
      WHEN 'warehouse' THEN 'WRH'
      WHEN 'farm' THEN 'FRM'
      WHEN 'investment_project' THEN 'INV'
      ELSE 'OTH'
    END;
    SELECT COUNT(*) + 1 INTO seq_num FROM properties WHERE property_type = NEW.property_type;
    NEW.code = type_prefix || '-' || LPAD(seq_num::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_property_code BEFORE INSERT ON properties
FOR EACH ROW EXECUTE FUNCTION generate_property_code();

-- Auto-generate deal number
CREATE OR REPLACE FUNCTION generate_deal_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  IF NEW.deal_number IS NULL OR NEW.deal_number = '' THEN
    SELECT COUNT(*) + 1 INTO seq_num FROM deals;
    NEW.deal_number = 'DEAL-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(seq_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deal_number BEFORE INSERT ON deals
FOR EACH ROW EXECUTE FUNCTION generate_deal_number();

-- Update conversation last_message_at
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    last_message_at = NEW.created_at,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_conversation AFTER INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();
