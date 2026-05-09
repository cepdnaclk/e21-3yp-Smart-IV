/// alert.rs — Alert rule engine
///
/// Evaluates each incoming BedPacket against safety rules.
/// On a new fault condition, it:
///   1. De-duplicates (won't re-fire the same alert for same bed repeatedly)
///   2. Persists the alert to SQLite
///   3. Emits 'alert-fired' Tauri event to the React frontend
///
/// Runs inside the serial ingestion path but errors are always non-fatal
/// — they get logged and the serial loop continues uninterrupted.

use anyhow::Result;
use tauri::{AppHandle, Emitter};
use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;

use crate::db::Db;
use crate::models::{Alert, BedPacket, BedStatus};

/// Tracks per-bed last-alerted type to suppress duplicate firings.
static LAST_ALERT: Lazy<Mutex<HashMap<String, String>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub struct AlertEngine;

impl AlertEngine {
    /// Evaluate a packet; fire new alerts if warranted.
    /// Must NEVER propagate errors to the caller — just log them.
    pub async fn evaluate(packet: &BedPacket, db: &Db, app: &AppHandle) -> Result<()> {
        // Determine primary alert type from device status
        let status_alert: Option<&str> = match &packet.status {
            BedStatus::Blockage => Some("BLOCKAGE"),
            BedStatus::EmptyBag => Some("EMPTY_BAG"),
            BedStatus::ConnLost => Some("CONN_LOST"),
            BedStatus::Stable | BedStatus::Offline => {
                // Clear de-dup cache when bed recovers
                LAST_ALERT.lock().unwrap().remove(&packet.bed_id);
                None
            }
        };

        // Independent battery-low check
        let battery_alert: Option<&str> = if packet.battery < 20 {
            Some("BATTERY_LOW")
        } else {
            None
        };

        for atype in [status_alert, battery_alert].into_iter().flatten() {
            // De-duplicate: skip if we already fired this exact alert for this bed
            {
                let mut cache = LAST_ALERT.lock().unwrap();
                let last = cache.get(&packet.bed_id).map(String::as_str);
                if last == Some(atype) {
                    continue;
                }
                cache.insert(packet.bed_id.clone(), atype.to_string());
            }

            // 1. Persist to DB
            let row_id = crate::db::insert_alert(
                db,
                &packet.bed_id,
                packet.session_id.as_deref(),
                atype,
            )
            .await
            .unwrap_or(0);

            // 2. Build frontend payload
            let alert = Alert {
                id: row_id as u64,
                bed_id: packet.bed_id.clone(),
                session_id: packet.session_id.clone(),
                ts: Some(chrono::Utc::now().to_rfc3339()),
                alert_type: atype.to_string(),
                resolved_at: None,
                resolved_by: None,
            };

            // 3. Emit to React
            if let Err(e) = app.emit("alert-fired", &alert) {
                log::warn!("[Alert] emit failed: {e}");
            }

            log::warn!(
                "[ALERT] Bed {} → {} (battery {}%, status {:?})",
                packet.bed_id, atype, packet.battery, packet.status
            );
        }

        Ok(())
    }
}
