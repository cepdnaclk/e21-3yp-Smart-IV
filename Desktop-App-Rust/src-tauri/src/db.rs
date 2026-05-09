/// db.rs — SQLite layer using sqlx
///
/// Manages the 4-table schema:
///   beds | sessions | telemetry | alerts
///
/// All async, driven by tokio runtime via sqlx.

use anyhow::Result;

use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite, Row};
use std::path::PathBuf;
use uuid::Uuid;

use crate::models::{
    Alert, Bed, BedPacket, Session, TelemetryRow,
};

pub type Db = Pool<Sqlite>;

/// Open (or create) the SQLite database, run migrations, return pool.
pub async fn open(app_data_dir: PathBuf) -> Result<Db> {
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("smartiv.db");
    let url = format!("sqlite://{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await?;

    migrate(&pool).await?;
    log::info!("Database opened at {}", db_path.display());
    Ok(pool)
}

/// Run schema migrations (idempotent).
async fn migrate(pool: &Db) -> Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS beds (
            bed_id       TEXT PRIMARY KEY,
            patient_name TEXT NOT NULL DEFAULT '',
            ward         TEXT NOT NULL DEFAULT 'Ward A',
            drop_factor  INTEGER NOT NULL DEFAULT 20,
            mac_address  TEXT NOT NULL DEFAULT '',
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
            session_id    TEXT PRIMARY KEY,
            bed_id        TEXT NOT NULL REFERENCES beds(bed_id),
            max_volume_ml REAL NOT NULL,
            target_ml_hr  REAL NOT NULL,
            started_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at      DATETIME,
            end_reason    TEXT
        );

        CREATE TABLE IF NOT EXISTS telemetry (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            bed_id         TEXT NOT NULL REFERENCES beds(bed_id),
            session_id     TEXT REFERENCES sessions(session_id),
            ts             DATETIME DEFAULT CURRENT_TIMESTAMP,
            flow_rate_ml   REAL NOT NULL DEFAULT 0,
            vol_remaining  REAL NOT NULL DEFAULT 0,
            battery_pct    INTEGER NOT NULL DEFAULT 100,
            status         TEXT NOT NULL DEFAULT 'STABLE'
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            bed_id      TEXT NOT NULL REFERENCES beds(bed_id),
            session_id  TEXT REFERENCES sessions(session_id),
            ts          DATETIME DEFAULT CURRENT_TIMESTAMP,
            alert_type  TEXT NOT NULL,
            resolved_at DATETIME,
            resolved_by TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_telemetry_bed_ts ON telemetry(bed_id, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(resolved_at) WHERE resolved_at IS NULL;
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

// ── Beds ─────────────────────────────────────────────────────────────────────

pub async fn get_beds(pool: &Db) -> Result<Vec<Bed>> {
    let rows = sqlx::query(
        "SELECT bed_id, patient_name, ward, drop_factor, mac_address, created_at FROM beds ORDER BY bed_id"
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .iter()
        .map(|r| Bed {
            bed_id: r.get("bed_id"),
            patient_name: r.get("patient_name"),
            ward: r.get("ward"),
            drop_factor: r.get::<i64, _>("drop_factor") as u8,
            mac_address: r.get("mac_address"),
            created_at: r.get("created_at"),
        })
        .collect())
}

pub async fn upsert_bed(pool: &Db, bed: &Bed) -> Result<()> {
    sqlx::query(
        r#"INSERT INTO beds (bed_id, patient_name, ward, drop_factor, mac_address)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(bed_id) DO UPDATE SET
             patient_name = excluded.patient_name,
             ward         = excluded.ward,
             drop_factor  = excluded.drop_factor,
             mac_address  = excluded.mac_address"#,
    )
    .bind(&bed.bed_id)
    .bind(&bed.patient_name)
    .bind(&bed.ward)
    .bind(bed.drop_factor as i64)
    .bind(&bed.mac_address)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_bed(pool: &Db, bed_id: &str) -> Result<()> {
    sqlx::query("DELETE FROM beds WHERE bed_id = ?")
        .bind(bed_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ── Sessions ──────────────────────────────────────────────────────────────────

pub async fn start_session(pool: &Db, bed_id: &str, max_vol: f64, target_ml_hr: f64) -> Result<String> {
    // Ensure bed row exists (auto-insert with defaults)
    sqlx::query(
        "INSERT OR IGNORE INTO beds (bed_id, patient_name, ward) VALUES (?, '', 'Ward A')"
    )
    .bind(bed_id)
    .execute(pool)
    .await?;

    let session_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO sessions (session_id, bed_id, max_volume_ml, target_ml_hr) VALUES (?, ?, ?, ?)",
    )
    .bind(&session_id)
    .bind(bed_id)
    .bind(max_vol)
    .bind(target_ml_hr)
    .execute(pool)
    .await?;
    Ok(session_id)
}

pub async fn end_session(pool: &Db, session_id: &str, reason: &str) -> Result<()> {
    sqlx::query(
        "UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = ? WHERE session_id = ?",
    )
    .bind(reason)
    .bind(session_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_active_sessions(pool: &Db) -> Result<Vec<Session>> {
    let rows = sqlx::query(
        "SELECT session_id, bed_id, max_volume_ml, target_ml_hr, started_at, ended_at, end_reason
         FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .iter()
        .map(|r| Session {
            session_id: r.get("session_id"),
            bed_id: r.get("bed_id"),
            max_volume_ml: r.get("max_volume_ml"),
            target_ml_hr: r.get("target_ml_hr"),
            started_at: r.get("started_at"),
            ended_at: r.get("ended_at"),
            end_reason: r.get("end_reason"),
        })
        .collect())
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

pub async fn insert_telemetry(pool: &Db, packet: &BedPacket) -> Result<()> {
    // Ensure bed row exists
    sqlx::query(
        "INSERT OR IGNORE INTO beds (bed_id, patient_name, ward) VALUES (?, '', 'Ward A')"
    )
    .bind(&packet.bed_id)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"INSERT INTO telemetry (bed_id, session_id, flow_rate_ml, vol_remaining, battery_pct, status)
           VALUES (?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&packet.bed_id)
    .bind(&packet.session_id)
    .bind(packet.flow_rate)
    .bind(packet.vol_remaining)
    .bind(packet.battery as i64)
    .bind(packet.status.as_str())
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_telemetry(pool: &Db, bed_id: &str, hours: i64) -> Result<Vec<TelemetryRow>> {
    let rows = sqlx::query(
        r#"SELECT id, bed_id, session_id, ts, flow_rate_ml, vol_remaining, battery_pct, status
           FROM telemetry
           WHERE bed_id = ?
             AND ts >= datetime('now', ? || ' hours')
           ORDER BY ts ASC"#,
    )
    .bind(bed_id)
    .bind(format!("-{}", hours))
    .fetch_all(pool)
    .await?;

    Ok(rows
        .iter()
        .map(|r| TelemetryRow {
            id: r.get::<i64, _>("id") as u64,
            bed_id: r.get("bed_id"),
            session_id: r.get("session_id"),
            ts: r.get("ts"),
            flow_rate_ml: r.get("flow_rate_ml"),
            vol_remaining: r.get("vol_remaining"),
            battery_pct: r.get::<i64, _>("battery_pct") as u8,
            status: r.get("status"),
        })
        .collect())
}

pub async fn purge_telemetry(pool: &Db, retain_days: i64) -> Result<u64> {
    let result = sqlx::query(
        "DELETE FROM telemetry WHERE ts < datetime('now', ? || ' days')",
    )
    .bind(format!("-{}", retain_days))
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

// ── Alerts ────────────────────────────────────────────────────────────────────

pub async fn insert_alert(pool: &Db, bed_id: &str, session_id: Option<&str>, alert_type: &str) -> Result<i64> {
    let result = sqlx::query(
        "INSERT INTO alerts (bed_id, session_id, alert_type) VALUES (?, ?, ?)",
    )
    .bind(bed_id)
    .bind(session_id)
    .bind(alert_type)
    .execute(pool)
    .await?;
    Ok(result.last_insert_rowid())
}

pub async fn get_alerts(pool: &Db, limit: i64) -> Result<Vec<Alert>> {
    let rows = sqlx::query(
        "SELECT id, bed_id, session_id, ts, alert_type, resolved_at, resolved_by
         FROM alerts ORDER BY ts DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows.iter().map(alert_from_row).collect())
}

pub async fn get_active_alerts(pool: &Db) -> Result<Vec<Alert>> {
    let rows = sqlx::query(
        "SELECT id, bed_id, session_id, ts, alert_type, resolved_at, resolved_by
         FROM alerts WHERE resolved_at IS NULL ORDER BY ts DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.iter().map(alert_from_row).collect())
}

pub async fn resolve_alert(pool: &Db, id: i64, resolved_by: &str) -> Result<()> {
    sqlx::query(
        "UPDATE alerts SET resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?",
    )
    .bind(resolved_by)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

fn alert_from_row(r: &sqlx::sqlite::SqliteRow) -> Alert {
    Alert {
        id: r.get::<i64, _>("id") as u64,
        bed_id: r.get("bed_id"),
        session_id: r.get("session_id"),
        ts: r.get("ts"),
        alert_type: r.get("alert_type"),
        resolved_at: r.get("resolved_at"),
        resolved_by: r.get("resolved_by"),
    }
}
