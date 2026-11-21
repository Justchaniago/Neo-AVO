# Project Operational Control (`Pause` / `Resume` / `Start`) — Architecture & Execution Guide

**Document:** `docs/PROJECT_OPERATIONAL_CONTROL_GUIDE.md`  
**ADR Reference:** `ADR-028` (Project Operational Control Lifecycle)  
**Date:** 2026-11-18  
**Scope:** `neo-avo` (Schema, Worker, Health/Incident Engine, Bounded Commands, API, UI) + Connected Projects (`QRA-System`, `Breafing-agent`, `Tele Auto V2`, `auto-email-project`)

---

## 1. Tujuan & Invariant Arsitektur

Memberikan kemampuan kepada operator di Neo AVO untuk melakukan **Pause**, **Resume**, dan **Start (Run Now)** pada setiap project secara aman tanpa melanggar invariant utama Neo AVO:

* **INV-001 (Project Independence)**: Jika Neo AVO mati, project tetap berjalan sesuai state lokal terakhirnya.
* **INV-002 & ADR-013 (Bounded Control)**: Neo AVO tidak pernah mematikan proses OS (`systemctl stop` / `kill`) secara paksa. Neo AVO mengelola *Control State* (monitoring/alerting) dan mengirimkan *Bounded Command* (`runtime.pause`, `runtime.resume`, `runtime.start`) ke project yang mendukung.
* **INV-006 (Durable Evidence)**: Event yang tetap masuk saat project sedang `PAUSED` tetap disimpan (`202 Accepted`) sebagai bukti histori.

---

## 2. Desain State Machine & Anti-Failure Guards

### 2.1. Pemisahan *Control State* vs *Runtime State*
Di tabel `projects`, ditambahkan kolom kontrol:

| Kolom | Tipe | Default | Fungsi |
| :--- | :--- | :--- | :--- |
| `control_state` | `text` | `'ACTIVE'` | `'ACTIVE'` \| `'PAUSE_REQUESTED'` \| `'PAUSED'` \| `'RESUME_REQUESTED'` |
| `paused_at` | `timestamptz` | `NULL` | Waktu ketika project mulai di-pause |
| `paused_until` | `timestamptz` | `NULL` | **Safety TTL**: Batas waktu pause otomatis berakhir (mencegah project lupa di-resume selamanya) |
| `pause_reason` | `text` | `NULL` | Alasan operator melakukan pause (audit trail) |
| `last_resumed_at` | `timestamptz` | `NULL` | **Anti-Backlash Guard**: Waktu terakhir project kembali `ACTIVE` |

### 2.2. Tiga Guard Penting (Pencegahan Failure)
1. **Safety TTL (`paused_until`)**:
   Operator dapat memilih durasi pause (*1 Jam, 6 Jam, 24 Jam, atau Manual*). Jika `paused_until <= now`, worker Neo AVO otomatis mengembalikan `control_state = 'ACTIVE'` (dan mengirim command `runtime.resume` jika project mendukung), serta mencatat event `project.auto_resumed`.
2. **Anti-Backlash Guard saat Resume (`last_resumed_at`)**:
   Saat project di-resume setelah berjam-jam di-pause:
   * `monitorProjectHealth` memberikan masa tenggang (*grace window*) sejak `last_resumed_at` agar project tidak langsung divonis `STALE`/`OFFLINE` hanya karena `lastSeenAt` masih tercatat di jam sebelum pause.
   * `evaluateExpectedExecutions` mengabaikan jadwal `expectedAt` yang jatuh pada rentang `[paused_at, last_resumed_at]` agar jadwal yang memang sengaja dilewati saat pause tidak memicu incident `EXPECTED_EXECUTION_MISSED` begitu di-resume.
3. **Poller Keep-Alive di Project Target**:
   Saat `QRA-System` atau `Breafing-agent` menerima command `runtime.pause`, worker **tidak boleh mematikan proses utamanya (`sys.exit`)**. Worker hanya mengubah flag `paused = true` di SQLite lokalnya untuk men-skip job bisnis, sementara loop polling command ke Neo AVO tetap hidup agar bisa menerima command `runtime.resume`.

---

## 3. Panduan Eksekusi Step-by-Step

### Tahap 1 — Database Schema & Migrasi (`neo-avo`)

**1.1. Buat file migrasi SQL baru `db/migrations/0012_project_control_state.sql`:**
```sql
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "control_state" text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "paused_until" timestamp with time zone;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "pause_reason" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "last_resumed_at" timestamp with time zone;
```

**1.2. Update `src/db/schema.ts` pada tabel `projects`:**
Tambahkan definisi kolom di `export const projects = pgTable("projects", { ... })`:
```ts
  controlState: text("control_state").notNull().default("ACTIVE"),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  pausedUntil: timestamp("paused_until", { withTimezone: true }),
  pauseReason: text("pause_reason"),
  lastResumedAt: timestamp("last_resumed_at", { withTimezone: true }),
```

---

### Tahap 2 — Event & Command Contracts (`neo-avo`)

**2.1. Daftarkan Event Audit di `src/events/types.ts`:**
Pada `eventDataSchemas`, tambahkan:
```ts
  "project.paused": objectData,
  "project.resumed": objectData,
  "project.auto_resumed": objectData,
```

**2.2. Daftarkan Capability Command di `src/commands/types.ts`:**
Pada `commandArguments`, tambahkan:
```ts
  "runtime.pause": z.object({
    reason: z.string().trim().max(500).optional(),
    until: z.string().datetime({ offset: true }).optional(),
  }).strict(),
  "runtime.resume": z.object({
    reason: z.string().trim().max(500).optional(),
  }).strict(),
  "runtime.start": z.object({
    target: z.string().trim().max(100).optional(),
    store: z.enum(["ALL", "PMS", "TP6"]).optional(),
  }).strict(),
```

---

### Tahap 3 — Health, Expected Execution & Incident Suppression (`neo-avo`)

**3.1. Update `src/health/derivation.ts` & `src/health/monitor.ts`:**
* Di `monitorProjectHealth(db, now)`:
  - Jika `project.controlState === "PAUSED" || project.controlState === "PAUSE_REQUESTED"`:
    Skip evaluasi penurunan `availability` (`STALE`/`OFFLINE`) dan skip penurunan `operationalHealth` / `businessHealth`.
  - Jika `project.lastResumedAt` ada, gunakan `Math.max(project.lastSeenAt?.getTime() ?? 0, project.lastResumedAt.getTime())` saat menghitung umur heartbeat di `availabilityAt()` supaya tidak langsung `OFFLINE` sesaat setelah di-resume.

**3.2. Update `src/ops/expected-executions.ts`:**
* Di `evaluateExpectedExecutions(db, now)`:
  - Setelah mengambil `project`, cek:
    ```ts
    if (project.controlState === "PAUSED" || project.controlState === "PAUSE_REQUESTED") continue;
    if (project.lastResumedAt && expectedAt.getTime() < project.lastResumedAt.getTime()) continue;
    ```

**3.3. Update `src/incidents/usecases.ts`:**
* Di `recordIncidentForEvent(db, project, event, now)`:
  - Jika `project.controlState === "PAUSED" || project.controlState === "PAUSE_REQUESTED"`, tetap catat/link incident jika diperlukan untuk histori, tetapi **jangan** buat `createNotification` (suppress alert Telegram selama project di-pause, kecuali untuk `event.quarantined`).

**3.4. Tambahkan Auto-Resume Check di Worker (`src/worker/index.ts`):**
* Di dalam loop periodik worker (setiap 5–30 detik), cek apakah ada project dengan `controlState IN ('PAUSED', 'PAUSE_REQUESTED')` dan `pausedUntil IS NOT NULL AND pausedUntil <= now`.
* Jika ada, panggil usecase `resumeProject(db, project.id, { reason: "Auto-resumed after pause TTL expired", isAuto: true })`.

---

### Tahap 4 — Usecase & Endpoint API Control (`neo-avo`)

**4.1. Buat fungsi `pauseProject`, `resumeProject`, `startProject` di `src/projects/usecases.ts`:**
* **`pauseProject(db, projectId, { reason, durationMinutes })`**:
  1. Hitung `pausedUntil = durationMinutes ? new Date(now.getTime() + durationMinutes * 60_000) : null`.
  2. Cek apakah `project.capabilities.includes("runtime.pause")`.
  3. Jika mendukung capability `runtime.pause`, set `controlState = "PAUSE_REQUESTED"` dan panggil `requestCommand(db, { projectId, environment, capability: "runtime.pause", arguments: { reason, until: pausedUntil?.toISOString() }, validUntil: +15m })`.
  4. Jika tidak (project pasif), langsung set `controlState = "PAUSED"`.
  5. Simpan audit event `project.paused` ke tabel `events`.
* **`resumeProject(db, projectId, { reason })`**:
  1. Set `controlState = "ACTIVE"`, `pausedAt = null`, `pausedUntil = null`, `pauseReason = null`, `lastResumedAt = now`.
  2. Jika `project.capabilities.includes("runtime.resume")`, kirim command `runtime.resume`.
  3. Simpan audit event `project.resumed` ke tabel `events`.
* **`startProject(db, projectId, { target, store })`**:
  1. Pastikan `controlState === "ACTIVE"` (jika sedang `PAUSED`, tolak dengan `409 project_is_paused` atau auto-resume terlebih dahulu).
  2. Pastikan `project.capabilities.includes("runtime.start")`, lalu kirim command `runtime.start`.

**4.2. Buat Route API `app/api/v1/dashboard/projects/[projectId]/control/route.ts`:**
* Menerima `POST` dengan body:
  ```json
  {
    "action": "pause" | "resume" | "start",
    "reason": "Maintenance Google Sheet",
    "durationMinutes": 60,
    "store": "ALL"
  }
  ```

---

### Tahap 5 — Komponen UI Dashboard (`neo-avo`)

**5.1. Buat `app/ui/project-control-bar.tsx` & pasang di halaman Project Detail:**
* Menampilkan badge status kontrol saat ini (`ACTIVE` hijau, `PAUSED` kuning/amber beserta sisa waktu `pausedUntil` dan `pauseReason`).
* Tombol **Pause Project** membuka modal ringkas:
  - Pilihan Durasi: `1 Jam`, `6 Jam`, `24 Jam`, `Manual (Tanpa Batas Waktu)`.
  - Input Alasan (*opsional*): misal `"Maintenance Sheet"`.
* Saat `PAUSED`, tombol berubah menjadi **Resume Project** (1 klik langsung aktif kembali).
* Jika project memiliki capability `runtime.start`, tampilkan tombol **Start / Run Now**.

---

### Tahap 6 — Integrasi di Project Terhubung (`QRA-System` & `Breafing-agent`)

**6.1. `Breafing-agent` (`src/briefing_agent/interfaces/worker.py` & `sqlite.py`):**
1. Tambahkan tabel/key `runtime_state (key TEXT PRIMARY KEY, value TEXT)` di SQLite.
2. Di `_poll_neo_avo_commands()`:
   - Saat menerima `runtime.pause`: simpan `paused = true` di SQLite, kirim `record_command_result(cmd_id, "COMPLETED")`.
   - Saat menerima `runtime.resume`: simpan `paused = false` di SQLite, kirim `record_command_result(cmd_id, "COMPLETED")`.
   - Saat menerima `runtime.start`: panggil `NightlyOrchestrator.run_nightly_cycle(trigger="NEO_AVO_START")` lalu lapor `COMPLETED`.
3. Di `NightlyOrchestrator.run_nightly_cycle()` dan `_check_h1_month_end()`:
   - Cek `if self.db_repo.is_runtime_paused(): return` di baris paling awal.

**6.2. `QRA-System` (`src/qra/application/command_runner.py` & `repository.py`):**
1. Simpan status `runtime_paused` di SQLite QRA.
2. Di `NeoAvoCommandRunner._execute()`:
   - Handle `runtime.pause` → set `runtime_paused = true`, lapor `COMPLETED`.
   - Handle `runtime.resume` → set `runtime_paused = false`, lapor `COMPLETED`.
   - Handle `runtime.start` → jalankan `ReconciliationEngine().run_daily()`, lapor `COMPLETED`.
3. Di `ReconciliationEngine.run_daily()` dan `reconcile()`:
   - Cek `if self.repo.is_runtime_paused(): return` sebelum memulai eksekusi terjadwal.

---

## 4. Urutan Eksekusi & Verifikasi (Checklist)

- [ ] **Step 1**: Buat migrasi `0012_project_control_state.sql` & update `src/db/schema.ts`.
- [ ] **Step 2**: Tambahkan schema command `runtime.pause`, `runtime.resume`, `runtime.start` & event `project.paused`, `project.resumed`.
- [ ] **Step 3**: Pasang guard `PAUSED` dan `lastResumedAt` di `monitorProjectHealth`, `evaluateExpectedExecutions`, dan `recordIncidentForEvent`.
- [ ] **Step 4**: Buat usecase `pauseProject` / `resumeProject` / `startProject` + auto-resume di worker loop.
- [ ] **Step 5**: Buat API route `/api/v1/dashboard/projects/[projectId]/control` + UI control di Project Detail.
- [ ] **Step 6**: Jalankan unit tests baru (`tests/project-control.test.ts`) & `npm run build` di `neo-avo`.
- [ ] **Step 7**: Tambahkan handler `runtime.pause` / `runtime.resume` / `runtime.start` di `Breafing-agent` & `QRA-System` beserta `pytest`.
- [ ] **Step 8**: Deploy `neo-avo` (`npm run db:migrate`, `npm run build`, restart service) dan deploy worker `Breafing-agent` & `QRA-System`.
