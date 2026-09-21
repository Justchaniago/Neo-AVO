# Neo-AVO (Autonomous Virtual Office)

Core Management Dashboard & Operational Control Center untuk ekosistem agen otonom **Autonomous Virtual Office (AVO)**.

---

## 🚀 Ikhtisar Sistem

**Neo-AVO** berfungsi sebagai pusat pemantauan (*observability hub*), manajer insiden, serta pemicu perintah (*bounded command controller*) untuk seluruh agen terintegrasi (seperti `Tele_bot`, `QRA-System`, `Breafing-agent`, dan `auto-email-project`).

### Fitur Utama:
- **Operational Dashboard:** Pemantauan real-time status toko, metrik transaksi, dan ketersediaan layanan.
- **Incident Management:** Pelacakan dan resolusi insiden otomatis dengan integrasi notifikasi Telegram.
- **Bounded Commands:** Eksekusi perintah terkontrol (misal: pemicuan pengerjaan laporan ulang/manual override).
- **Intelligence & Analytics:** Analisis performa dan rekomendasi berbasis AI (Vertex AI).

---

## 🛠️ Stack Teknologi

- **Framework:** [Next.js](https://nextjs.org/) (App Router) & React
- **Language:** TypeScript
- **Database & ORM:** PostgreSQL & [Drizzle ORM](https://orm.drizzle.team/)
- **UI & Styling:** Tailwind CSS & Lucide Icons
- **AI Engine:** Google Cloud Vertex AI

---

## 💻 Memulai (Local Development)

### 1. Prasyarat
- Node.js `v20+`
- PostgreSQL Database Instance

### 2. Instalasi & Setup
```bash
# Clone repository
git clone https://github.com/Justchaniago/Neo-AVO.git
cd Neo-AVO

# Install dependensi
npm install

# Konfigurasi Environment Variables
cp .env.example .env.local
```

### 3. Migrasi Database & Run
```bash
# Jalankan migrasi database
npm run db:migrate

# Jalankan server verifikasi / development
npm run dev
```

Buka `http://localhost:3000` pada browser Anda.

---

## 📚 Dokumentasi Terperinci

Dokumentasi lengkap mengenai arsitektur, keputusan desain, dan modul teknis tersedia di folder [`docs/`](docs/):
- [`docs/01_PRD_FINAL_v1.1.md`](docs/01_PRD_FINAL_v1.1.md): Product Requirement Document
- [`docs/02_SYSTEM_DESIGN.md`](docs/02_SYSTEM_DESIGN.md): Desain Arsitektur & Relasi Database
- [`docs/M5_INCIDENTS_TELEGRAM.md`](docs/M5_INCIDENTS_TELEGRAM.md): Integrasi Notifikasi Telegram
