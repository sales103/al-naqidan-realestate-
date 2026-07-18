-- =============================================================================
-- Initial Seed Data
-- =============================================================================

-- Admin user (password: Admin@123456 - CHANGE IN PRODUCTION)
INSERT INTO users (email, phone, full_name, full_name_ar, password_hash, role) VALUES
('admin@naqidan.com', '+966500000001', 'System Admin', 'مدير النظام',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniB5hEnJzPUKRi.TUfJGS4Bwi', 'super_admin'),
('manager@naqidan.com', '+966500000002', 'Sales Manager', 'مدير المبيعات',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniB5hEnJzPUKRi.TUfJGS4Bwi', 'sales_manager'),
('agent1@naqidan.com', '+966500000003', 'Ahmed Al-Ghamdi', 'أحمد الغامدي',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniB5hEnJzPUKRi.TUfJGS4Bwi', 'sales_agent'),
('agent2@naqidan.com', '+966500000004', 'Mohammed Al-Zahrani', 'محمد الزهراني',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniB5hEnJzPUKRi.TUfJGS4Bwi', 'sales_agent')
ON CONFLICT (email) DO NOTHING;

-- Saudi Cities
INSERT INTO cities (name_ar, name_en, region_ar, region_en) VALUES
('الرياض', 'Riyadh', 'منطقة الرياض', 'Riyadh Region'),
('جدة', 'Jeddah', 'منطقة مكة المكرمة', 'Makkah Region'),
('مكة المكرمة', 'Makkah', 'منطقة مكة المكرمة', 'Makkah Region'),
('المدينة المنورة', 'Madinah', 'منطقة المدينة المنورة', 'Madinah Region'),
('الدمام', 'Dammam', 'المنطقة الشرقية', 'Eastern Province'),
('الخبر', 'Khobar', 'المنطقة الشرقية', 'Eastern Province'),
('الظهران', 'Dhahran', 'المنطقة الشرقية', 'Eastern Province'),
('الجبيل', 'Jubail', 'المنطقة الشرقية', 'Eastern Province'),
('الأحساء', 'Al-Ahsa', 'المنطقة الشرقية', 'Eastern Province'),
('الطائف', 'Taif', 'منطقة مكة المكرمة', 'Makkah Region'),
('تبوك', 'Tabuk', 'منطقة تبوك', 'Tabuk Region'),
('أبها', 'Abha', 'منطقة عسير', 'Asir Region'),
('القصيم', 'Al-Qassim', 'منطقة القصيم', 'Al-Qassim Region'),
('بريدة', 'Buraydah', 'منطقة القصيم', 'Al-Qassim Region'),
('عنيزة', 'Unayzah', 'منطقة القصيم', 'Al-Qassim Region'),
('حائل', 'Hail', 'منطقة حائل', 'Hail Region'),
('نجران', 'Najran', 'منطقة نجران', 'Najran Region'),
('جازان', 'Jazan', 'منطقة جازان', 'Jizan Region'),
('الباحة', 'Al-Baha', 'منطقة الباحة', 'Al-Baha Region'),
('سكاكا', 'Sakaka', 'منطقة الجوف', 'Al-Jouf Region')
ON CONFLICT DO NOTHING;

-- Riyadh Districts
INSERT INTO districts (city_id, name_ar, name_en, direction) VALUES
(1, 'العليا', 'Al-Olaya', 'وسط'),
(1, 'النخيل', 'Al-Nakheel', 'شمال'),
(1, 'الملقا', 'Al-Malqa', 'شمال'),
(1, 'حي الياسمين', 'Al-Yasmin', 'شمال'),
(1, 'حي الرحمانية', 'Al-Rahmaniyah', 'شمال'),
(1, 'حي الصحافة', 'Al-Sahafa', 'شمال'),
(1, 'حي الروضة', 'Al-Rawdah', 'شرق'),
(1, 'حي النزهة', 'Al-Nuzhah', 'شرق'),
(1, 'حي السليمانية', 'Al-Sulamaniyah', 'وسط'),
(1, 'حي الوزارات', 'Al-Wazarat', 'وسط'),
(1, 'الدرعية', 'Diriyah', 'غرب'),
(1, 'النسيم', 'Al-Naseem', 'شرق'),
(1, 'المربع', 'Al-Murabba', 'وسط'),
(1, 'الحمراء', 'Al-Hamra', 'غرب'),
(1, 'القادسية', 'Al-Qadisiyah', 'شرق'),
(2, 'الزهراء', 'Al-Zahra', 'شمال'),
(2, 'الروضة', 'Al-Rawdah', 'شمال'),
(2, 'الفيصلية', 'Al-Faisaliyah', 'وسط'),
(2, 'الشاطئ', 'Al-Shatee', 'غرب'),
(2, 'الحمراء', 'Al-Hamra', 'وسط'),
(14, 'شمال بريدة', 'North Buraydah', 'شمال'),
(14, 'جنوب بريدة', 'South Buraydah', 'جنوب'),
(14, 'شرق بريدة', 'East Buraydah', 'شرق'),
(14, 'غرب بريدة', 'West Buraydah', 'غرب'),
(14, 'وسط بريدة', 'Central Buraydah', 'وسط')
ON CONFLICT DO NOTHING;

-- System Settings
INSERT INTO system_settings (key, value, description) VALUES
('ai_enabled', 'true', 'Enable AI auto-responses'),
('ai_working_hours', '{"start": "08:00", "end": "22:00", "timezone": "Asia/Riyadh"}', 'AI working hours'),
('max_properties_per_response', '3', 'Maximum properties to show per response'),
('follow_up_enabled', 'true', 'Enable automatic follow-ups'),
('whatsapp_greeting', '"مرحباً بك في شركة عبدالحكيم النقيدان للاستثمارات العقارية 🏠\n\nيسعدنا خدمتك في إيجاد العقار المناسب.\n\nكيف يمكنني مساعدتك؟"', 'Welcome message'),
('out_of_hours_message', '"شكراً لتواصلك مع شركة عبدالحكيم النقيدان للاستثمارات العقارية.\n\nساعات العمل: من 8 صباحاً إلى 10 مساءً.\n\nسيتواصل معك أحد ممثلينا في أقرب وقت. 🙏"', 'Out of hours message'),
('company_name', '"شركة عبدالحكيم النقيدان للاستثمارات العقارية"', 'Company name'),
('company_phone', '"+966XXXXXXXXX"', 'Company phone'),
('commission_default', '2.5', 'Default commission percentage')
ON CONFLICT (key) DO NOTHING;
