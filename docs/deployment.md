# دليل النشر على الإنتاج (Production Deployment Guide)

## 1. إعداد الخادم (VPS/Cloud)

### المتطلبات الدنيا
- Ubuntu 22.04 LTS
- 4 vCPU
- 8GB RAM
- 100GB SSD
- IP ثابت
- دومين مفعّل (مع SSL)

### تثبيت Docker
```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# تثبيت Docker Compose
sudo apt install docker-compose-plugin -y

# التحقق
docker --version && docker compose version
```

---

## 2. إعداد SSL (Let's Encrypt)

```bash
# تثبيت Certbot
sudo apt install certbot -y

# الحصول على شهادة
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# نسخ الشهادات
sudo mkdir -p /opt/naqidan/nginx/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/naqidan/nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/naqidan/nginx/ssl/

# تجديد تلقائي
sudo crontab -e
# أضف: 0 12 * * * certbot renew --quiet
```

---

## 3. نشر المشروع

```bash
# استنساخ على الخادم
git clone https://github.com/your-org/al-naqidan-realestate.git /opt/naqidan
cd /opt/naqidan

# إعداد البيئة
cp .env.example .env
nano .env   # عدّل جميع القيم

# بناء وتشغيل
docker compose -f docker-compose.yml up -d --build

# التحقق
docker compose ps
curl https://your-domain.com/health
```

---

## 4. تحديث المشروع (Zero Downtime)

```bash
cd /opt/naqidan

# سحب التحديثات
git pull origin main

# إعادة البناء
docker compose up -d --build --no-deps backend frontend

# التحقق
docker compose ps
curl https://your-domain.com/health
```

---

## 5. النسخ الاحتياطي اليدوي

```bash
# نسخ قاعدة البيانات
docker compose exec postgres pg_dump -U naqidan_user naqidan_realestate > backup-$(date +%Y%m%d).sql

# نسخ الملفات
tar -czf uploads-$(date +%Y%m%d).tar.gz ./uploads/

# رفع على S3 (اختياري)
aws s3 cp backup-$(date +%Y%m%d).sql s3://naqidan-backups/
```

---

## 6. المراقبة والتنبيهات

```bash
# مشاهدة السجلات
docker compose logs -f backend
docker compose logs -f evolution-api

# مراقبة الموارد
docker stats

# Grafana: https://your-domain.com/grafana
```

---

## 7. الأمان الإضافي

```bash
# UFW Firewall
sudo ufw enable
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw deny 5432   # PostgreSQL - داخلي فقط
sudo ufw deny 6379   # Redis - داخلي فقط
sudo ufw deny 5678   # n8n - عبر Nginx فقط

# Fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
```
