// =============================================================================
// Core Type Definitions
// =============================================================================

export type UserRole = 'super_admin' | 'admin' | 'sales_manager' | 'sales_agent' | 'marketer' | 'customer_service' | 'viewer';

export type PropertyType = 'land' | 'apartment' | 'villa' | 'building' | 'office' | 'showroom' | 'warehouse' | 'farm' | 'investment_project' | 'other';

export type PropertyStatus = 'available' | 'reserved' | 'sold' | 'rented' | 'under_maintenance' | 'coming_soon' | 'hidden';

export type PropertyPurpose = 'sale' | 'rent' | 'both';

export type ClientStatus = 'new' | 'contacted' | 'interested' | 'viewing_scheduled' | 'negotiating' | 'contract_pending' | 'closed_won' | 'closed_lost' | 'on_hold' | 'follow_up';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'sticker' | 'reaction' | 'system';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type ContractStatus = 'draft' | 'pending_signature' | 'signed' | 'active' | 'completed' | 'cancelled' | 'disputed';

export type FollowUpType = 'auto_1day' | 'auto_3days' | 'auto_1week' | 'auto_1month' | 'manual';

// =============================================================================
// Database Models
// =============================================================================

export interface User {
  id: string;
  email: string;
  phone?: string;
  full_name: string;
  full_name_ar?: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string;
  whatsapp_number?: string;
  last_login_at?: Date;
  preferences: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface Property {
  id: string;
  code: string;
  title: string;
  title_ar?: string;
  description?: string;
  description_ar?: string;
  property_type: PropertyType;
  purpose: PropertyPurpose;
  status: PropertyStatus;
  city_id?: number;
  district_id?: number;
  address?: string;
  google_maps_url?: string;
  latitude?: number;
  longitude?: number;
  area_sqm?: number;
  rooms?: number;
  bathrooms?: number;
  kitchens?: number;
  living_rooms?: number;
  floor_number?: number;
  total_floors?: number;
  parking_spaces?: number;
  age_years?: number;
  price?: number;
  price_per_sqm?: number;
  negotiable: boolean;
  currency: string;
  features: string[];
  amenities: string[];
  nearby_places: NearbyPlace[];
  owner_id?: string;
  assigned_agent_id?: string;
  commission_percentage?: number;
  commission_amount?: number;
  main_image_url?: string;
  qr_code_url?: string;
  is_featured: boolean;
  view_count: number;
  inquiry_count: number;
  tags: string[];
  available_from?: Date;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  // Joined fields
  city_name?: string;
  district_name?: string;
  agent_name?: string;
  media?: PropertyMedia[];
}

export interface PropertyMedia {
  id: string;
  property_id: string;
  media_type: 'image' | 'video' | 'pdf' | 'document';
  url: string;
  thumbnail_url?: string;
  title?: string;
  size_bytes?: number;
  mime_type?: string;
  sort_order: number;
  is_main: boolean;
  created_at: Date;
}

export interface NearbyPlace {
  name: string;
  type: string;
  distance_km?: number;
}

export interface Client {
  id: string;
  full_name: string;
  phone: string;
  whatsapp_id?: string;
  email?: string;
  id_number?: string;
  nationality: string;
  city_id?: number;
  district?: string;
  preferred_property_types?: PropertyType[];
  preferred_cities?: number[];
  budget_min?: number;
  budget_max?: number;
  purpose?: PropertyPurpose;
  area_min?: number;
  area_max?: number;
  rooms_needed?: number;
  special_requirements?: string;
  status: ClientStatus;
  source: string;
  assigned_agent_id?: string;
  last_contact_at?: Date;
  next_follow_up_at?: Date;
  ai_profile: Record<string, unknown>;
  conversation_context: Record<string, unknown>;
  intent_history: IntentRecord[];
  notes?: string;
  tags: string[];
  rating?: number;
  first_contact_at?: Date;
  created_at: Date;
  updated_at: Date;
  // Joined
  city_name?: string;
  agent_name?: string;
  conversation_count?: number;
  message_count?: number;
}

export interface IntentRecord {
  intent: string;
  confidence: number;
  timestamp: string;
  message_id?: string;
}

export interface Conversation {
  id: string;
  client_id: string;
  whatsapp_chat_id: string;
  assigned_agent_id?: string;
  is_active: boolean;
  is_ai_enabled: boolean;
  ai_handoff_requested: boolean;
  last_message_at?: Date;
  unread_count: number;
  created_at: Date;
  updated_at: Date;
  // Joined
  client?: Client;
  last_message?: Message;
}

export interface Message {
  id: string;
  conversation_id: string;
  whatsapp_message_id?: string;
  direction: MessageDirection;
  message_type: MessageType;
  status: MessageStatus;
  content?: string;
  caption?: string;
  media_url?: string;
  media_mime_type?: string;
  media_size_bytes?: number;
  location_lat?: number;
  location_lng?: number;
  location_name?: string;
  transcription?: string;
  ai_processed: boolean;
  ai_intent?: string;
  ai_entities: Record<string, unknown>;
  ai_response_time_ms?: number;
  ai_model_used?: string;
  ai_tokens_used?: number;
  ai_cost_usd?: number;
  sent_by?: string;
  is_from_ai: boolean;
  quoted_message_id?: string;
  error_message?: string;
  created_at: Date;
  delivered_at?: Date;
  read_at?: Date;
}

export interface Appointment {
  id: string;
  client_id: string;
  property_id?: string;
  assigned_agent_id?: string;
  title: string;
  description?: string;
  status: AppointmentStatus;
  scheduled_at: Date;
  duration_minutes: number;
  location?: string;
  meeting_link?: string;
  notes?: string;
  reminder_sent: boolean;
  result?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Deal {
  id: string;
  deal_number: string;
  client_id: string;
  property_id: string;
  assigned_agent_id?: string;
  status: ContractStatus;
  agreed_price: number;
  commission_percentage?: number;
  commission_amount?: number;
  payment_method?: string;
  payment_schedule: PaymentScheduleItem[];
  expected_close_date?: Date;
  actual_close_date?: Date;
  contract_url?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentScheduleItem {
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string;
}

// =============================================================================
// AI Types
// =============================================================================

export interface AIIntent {
  primary: string;
  secondary?: string;
  confidence: number;
}

export interface AIExtractedData {
  property_type?: PropertyType;
  city?: string;
  district?: string;
  direction?: string;
  budget_max?: number;
  budget_min?: number;
  area_min?: number;
  area_max?: number;
  rooms?: number;
  purpose?: PropertyPurpose;
  special_requirements?: string[];
  client_name?: string;
  urgency?: 'low' | 'medium' | 'high';
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface AIProcessingResult {
  intent: AIIntent;
  extracted_data: AIExtractedData;
  response: string;
  should_send_properties: boolean;
  property_search_params?: PropertySearchParams;
  should_escalate: boolean;
  escalation_reason?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  language: 'ar' | 'en' | 'mixed';
  tokens_used: number;
  model: string;
  response_time_ms: number;
  cost_usd: number;
}

export interface PropertySearchParams {
  property_type?: PropertyType;
  city_ids?: number[];
  district_ids?: number[];
  price_min?: number;
  price_max?: number;
  area_min?: number;
  area_max?: number;
  rooms?: number;
  purpose?: PropertyPurpose;
  status?: PropertyStatus;
  features?: string[];
  sort_by?: 'price_asc' | 'price_desc' | 'newest' | 'area_asc' | 'featured';
  limit?: number;
  offset?: number;
}

export interface PropertySearchResult {
  properties: Property[];
  total: number;
  alternatives?: Property[];
  search_params: PropertySearchParams;
}

// =============================================================================
// WhatsApp Types
// =============================================================================

export interface WhatsAppWebhookPayload {
  event: string;
  instance: string;
  data: WhatsAppMessageData;
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

export interface WhatsAppMessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  pushName?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
    imageMessage?: { caption?: string; url?: string; mimetype?: string };
    videoMessage?: { caption?: string; url?: string; mimetype?: string };
    audioMessage?: { url?: string; mimetype?: string; ptt?: boolean };
    documentMessage?: { url?: string; mimetype?: string; title?: string };
    locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string };
    stickerMessage?: { url?: string };
    buttonsResponseMessage?: { selectedButtonId?: string; selectedDisplayText?: string };
    templateButtonReplyMessage?: { selectedId?: string; selectedDisplayText?: string };
    listResponseMessage?: { title?: string; singleSelectReply?: { selectedRowId?: string } };
  };
  messageType?: string;
  messageTimestamp?: number;
  status?: string;
}

export interface SendMessagePayload {
  number: string;
  text?: string;
  media?: {
    mediatype: 'image' | 'video' | 'audio' | 'document';
    media: string;
    caption?: string;
    fileName?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
}

// =============================================================================
// API Types
// =============================================================================

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface AuthPayload {
  user_id: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      pagination?: PaginationParams;
    }
  }
}
