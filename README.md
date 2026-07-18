# 🏢 شركة عبدالحكيم النقيدان للاستثمارات العقارية
## نظام إدارة العقارات الذكي - AI Real Estate Automation

نظام متكامل يربط واتساب بقاعدة بيانات العقارات عبر الذكاء الاصطناعي لأتمتة عمليات البيع والتأجير.

---

## 🚀 المكونات الرئيسية

| المكوّن | التقنية | الوظيفة |
|---------|---------|---------|
| Backend API | Node.js + TypeScript | منطق الأعمال والـ API |
| Frontend Dashboard | React + Tailwind | لوحة التحكم |
| AI Agent | OpenAI GPT-4o | فهم وردود ذكية |
| Workflow Engine | n8n | أتمتة المهام |
| Database | PostgreSQL 16 | تخزين البيانات |
| Cache | Redis 7 | الأداء والسياق |
| WhatsApp | Evolution API | قناة التواصل |
| Proxy | Nginx | الأمان والتوجيه |
| Monitoring | Prometheus + Grafana | المراقبة |

---

## 📋 متطلبات التشغيل

- Docker Desktop 24+
- Docker Compose v2+
- 4GB RAM على الأقل
- 20GB مساحة
- مفتاح OpenAI API
- Evolution API مثبّت ومتصل

---

## ⚡ التثبيت السريع

### الخطوة 1: استنساخ المشروع

```bash
git clone https://github.com/your-org/al-naqidan-realestate.git
cd al-naqidan-realestate
```

### الخطوة 2: إعداد البيئة

```bash
cp .env.example .env
# افتح .env وعدّل المتغيرات التالية:
# - DB_PASSWORD
# - REDIS_PASSWORD
# - OPENAI_API_KEY
# - EVOLUTION_API_KEY
# - JWT_SECRET (64 حرف على الأقل)
# - APP_URL
```

### الخطوة 3: تشغيل المشروع

```bash
docker compose up -d
```

### الخطوة 4: التحقق

```bash
# فحص الحالة
docker compose ps

# سجلات الـ Backend
docker compose logs -f backend

# اختبار الـ API
curl http://localhost:3000/health
```

---

## 🔐 الدخول الافتراضي

| المنصة | الرابط | البيانات |
|--------|--------|---------|
| Dashboard | http://localhost:5173 | admin@naqidan.com / Admin@123456 |
| n8n | http://localhost:5678 | admin / (من .env) |
| Grafana | http://localhost:3001 | admin / admin123 |
| API | http://localhost:3000/api | JWT Token |

**⚠️ غيّر كلمات المرور فوراً في الإنتاج!**

---

## 📱 إعداد واتساب

### 1. تثبيت Evolution API
```bash
# Evolution API يعمل تلقائياً في Docker
# افتح: http://localhost:8080
```

### 2. ربط الجوال
```bash
# عبر API
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: YOUR_API_KEY" \
  -d '{"instanceName": "naqidan-whatsapp"}'

# امسح QR Code بواتساب
curl http://localhost:8080/instance/qrcode/naqidan-whatsapp -H "apikey: YOUR_API_KEY"
```

### 3. إعداد الـ Webhook
```bash
# الـ Webhook يُعدَّل تلقائياً عبر docker-compose
# التأكد: http://localhost:8080/webhook/naqidan-whatsapp
```

---

## 🤖 استيراد Workflows في n8n

```bash
# 1. افتح n8n: http://localhost:5678
# 2. اذهب إلى: Settings > Import Workflow
# 3. استورد جميع ملفات JSON من مجلد n8n-workflows/
#    بالترتيب: 01, 02, 03, ...
# 4. فعّل كل Workflow
# 5. أضف Environment Variables:
#    BACKEND_URL=http://backend:3000
#    EVOLUTION_API_URL=http://evolution-api:8080
#    EVOLUTION_INSTANCE=naqidan-whatsapp
#    ADMIN_WHATSAPP=+966XXXXXXXXX
```

---

## 📊 استيراد العقارات

```bash
# توليد نموذج CSV
ts-node scripts/import-properties.ts --template

# استيراد من ملف
ts-node scripts/import-properties.ts --file my-properties.csv
```

### أعمدة ملف CSV
| العمود | الوصف | مثال |
|--------|-------|------|
| title_ar | اسم العقار | شقة فاخرة في الملقا |
| property_type | النوع | شقة / فيلا / أرض |
| purpose | الغرض | بيع / إيجار |
| city | المدينة | الرياض |
| district | الحي | الملقا |
| area_sqm | المساحة | 180 |
| rooms | الغرف | 4 |
| price | السعر | 1200000 |
| latitude | خط العرض | 24.7136 |
| longitude | خط الطول | 46.6753 |

---

## 🏗️ هيكل المشروع

```
al-naqidan-realestate/
├── backend/                  # Node.js + TypeScript API
│   ├── src/
│   │   ├── ai/              # وحدة الذكاء الاصطناعي
│   │   ├── config/          # الإعدادات والـ Logger
│   │   ├── controllers/     # منطق الطلبات
│   │   ├── database/        # PostgreSQL + Redis
│   │   ├── middleware/      # Auth, Error, Pagination
│   │   ├── routes/          # API Routes
│   │   ├── services/        # Business Logic
│   │   └── types/           # TypeScript Types
│   └── tests/               # Unit + Integration Tests
├── frontend/                 # React Dashboard
│   └── src/
│       ├── components/      # UI Components
│       ├── pages/           # App Pages
│       ├── services/        # API Client
│       └── store/           # Zustand State
├── n8n-workflows/            # Workflow JSONs (جاهزة للاستيراد)
├── database/
│   ├── migrations/          # SQL Schema
│   └── seeds/               # Initial Data
├── ai/prompts/              # System Prompts
├── nginx/                   # Reverse Proxy Config
├── scripts/                 # Import/Export Tools
├── docker-compose.yml       # Full Stack Docker
└── .env.example             # Environment Template
```

---

## 🔄 Workflows المتاحة

| # | الاسم | الوظيفة | الجدولة |
|---|-------|---------|---------|
| 01 | استقبال واتساب | معالجة الرسائل الواردة | Webhook |
| 05 | متابعة العملاء | إرسال رسائل المتابعة | كل 30 دقيقة |
| 07 | التقارير اليومية | إرسال ملخص يومي | 8 صباحاً |
| 08 | النسخ الاحتياطي | حفظ قاعدة البيانات | 2 صباحاً |

---

## 👥 الأدوار والصلاحيات

| الدور | الصلاحيات |
|-------|-----------|
| super_admin | كامل |
| admin | إدارة + تقارير |
| sales_manager | عملاء + عقارات + تقارير |
| sales_agent | عملاء + عقارات المسندة |
| marketer | عرض + بيانات التسويق |
| customer_service | محادثات + عملاء |
| viewer | قراءة فقط |

---

## 📈 المراقبة

```bash
# Grafana Dashboard
open http://localhost:3001

# Prometheus Metrics
curl http://localhost:9090/metrics

# Application Health
curl http://localhost:3000/health

# Logs
docker compose logs -f backend | grep ERROR
```

---

## 🛠️ الدعم والمشاكل الشائعة

### واتساب غير متصل
```bash
docker compose restart evolution-api
# ثم أعد مسح QR Code
```

### خطأ في قاعدة البيانات
```bash
docker compose exec postgres psql -U naqidan_user -d naqidan_realestate
# فحص الجداول:
\dt
```

### مشكلة OpenAI
```bash
# تأكد من صحة المفتاح في .env
echo $OPENAI_API_KEY
# تحقق من الرصيد: https://platform.openai.com/usage
```

---

## 📄 الترخيص

مشروع خاص - جميع الحقوق محفوظة لشركة عبدالحكيم النقيدان للاستثمارات العقارية © 2024
