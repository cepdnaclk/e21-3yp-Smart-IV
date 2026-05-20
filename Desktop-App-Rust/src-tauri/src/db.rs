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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_test_db() -> Result<Db> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;
        migrate(&pool).await?;
        Ok(pool)
    }

    #[tokio::test]
    async fn test_beds_crud() -> Result<()> {
        let pool = setup_test_db().await?;

        let bed = Bed {
            bed_id: "bed-01".to_string(),
            patient_name: "John Doe".to_string(),
            ward: "ICU".to_string(),
            drop_factor: 20,
            mac_address: "AA:BB:CC:DD:EE".to_string(),
            created_at: None,
        };

        upsert_bed(&pool, &bed).await?;

        let beds = get_beds(&pool).await?;
        assert_eq!(beds.len(), 1);
        assert_eq!(beds[0].bed_id, "bed-01");
        assert_eq!(beds[0].patient_name, "John Doe");

        delete_bed(&pool, "bed-01").await?;
        let beds_after = get_beds(&pool).await?;
        assert!(beds_after.is_empty());

        Ok(())
    }

    #[tokio::test]
    async fn test_sessions() -> Result<()> {
        let pool = setup_test_db().await?;

        let session_id = start_session(&pool, "bed-02", 500.0, 100.0).await?;
        
        let sessions = get_active_sessions(&pool).await?;
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].session_id, session_id);
        assert_eq!(sessions[0].bed_id, "bed-02");

        end_session(&pool, &session_id, "Completed").await?;

        let active_sessions = get_active_sessions(&pool).await?;
        assert!(active_sessions.is_empty());

        Ok(())
    }

    #[tokio::test]
    async fn test_telemetry() -> Result<()> {
        let pool = setup_test_db().await?;
        
        let session_id = start_session(&pool, "bed-03", 1000.0, 50.0).await?;

        let packet = BedPacket {
            bed_id: "bed-03".to_string(),
            status: crate::models::BedStatus::Stable,
            flow_rate: 45.0,
            vol_remaining: 950.0,
            max_volume: 1000.0,
            battery: 80,
            drop_factor: 20,
            target_mlhr: 50.0,
            session_id: Some(session_id.clone()),
            ts: None,
        };

        insert_telemetry(&pool, &packet).await?;

        let telemetry = get_telemetry(&pool, "bed-03", 24).await?;
        assert_eq!(telemetry.len(), 1);
        assert_eq!(telemetry[0].flow_rate_ml, 45.0);
        assert_eq!(telemetry[0].status, "STABLE");

        // Make the telemetry row look like it was inserted yesterday
        sqlx::query("UPDATE telemetry SET ts = datetime('now', '-1 day')")
            .execute(&pool)
            .await?;

        let purged = purge_telemetry(&pool, 0).await?;
        assert_eq!(purged, 1);
        
        Ok(())
    }

    #[tokio::test]
    async fn test_alerts() -> Result<()> {
        let pool = setup_test_db().await?;

        // Create bed to satisfy foreign key constraint
        let bed = Bed {
            bed_id: "bed-04".to_string(),
            patient_name: "".to_string(),
            ward: "Ward A".to_string(),
            drop_factor: 20,
            mac_address: "".to_string(),
            created_at: None,
        };
        upsert_bed(&pool, &bed).await?;

        let alert_id = insert_alert(&pool, "bed-04", None, "BLOCKAGE").await?;

        let active_alerts = get_active_alerts(&pool).await?;
        assert_eq!(active_alerts.len(), 1);
        assert_eq!(active_alerts[0].alert_type, "BLOCKAGE");

        resolve_alert(&pool, alert_id, "Nurse Jane").await?;

        let active_alerts_after = get_active_alerts(&pool).await?;
        assert!(active_alerts_after.is_empty());

        let all_alerts = get_alerts(&pool, 10).await?;
        assert_eq!(all_alerts.len(), 1);
        assert_eq!(all_alerts[0].resolved_by.as_deref(), Some("Nurse Jane"));

        Ok(())
    }
}
