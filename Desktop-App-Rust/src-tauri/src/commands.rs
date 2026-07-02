/// commands.rs — Tauri IPC commands exposed to the React frontend

use tauri::{command, AppHandle, Emitter, State};
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::db::Db;
use crate::models::{Alert, Bed, Session, TelemetryRow};
use crate::mqtt::MqttPublisher;
use crate::serial::SerialReader;

/// App-wide managed state
pub struct AppState {
    pub db: Db,
    /// Holds the cancel token for the CURRENT serial reader task.
    /// Wrapped in Mutex so connect_serial can swap it with a fresh Notify
    /// each time, preventing stale cancel signals from killing a new reader.
    pub serial_cancel: Mutex<Arc<tokio::sync::Notify>>,
    pub serial_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    pub mqtt: Arc<Mutex<Option<MqttPublisher>>>,
    pub mqtt_handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

// ── Serial ────────────────────────────────────────────────────────────────────

#[command]
pub async fn list_serial_ports() -> Result<Vec<String>, String> {
    serialport::available_ports()
        .map(|ports| ports.into_iter().map(|p| p.port_name).collect())
        .map_err(|e| e.to_string())
}

#[command]
pub async fn connect_serial(
    port: String,
    baud: u32,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Cancel and abort any existing reader
    {
        let old_cancel = state.serial_cancel.lock().await;
        old_cancel.notify_waiters();
    }
    {
        let mut h = state.serial_handle.lock().await;
        if let Some(old) = h.take() {
            old.abort();
        }
    }
    // Small settle delay so the old task can clean up
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

    // Create a FRESH cancel token for this connection.
    // This is critical: if we reuse the old Notify, any pending notify_waiters()
    // stored from the previous disconnect will immediately kill the new reader.
    let fresh_cancel = Arc::new(tokio::sync::Notify::new());
    {
        let mut guard = state.serial_cancel.lock().await;
        *guard = fresh_cancel.clone();
    }

    let reader = SerialReader::new(port, baud);
    let handle = reader.spawn(
        state.db.clone(),
        app,
        state.mqtt.clone(),
        fresh_cancel,
    );

    let mut h = state.serial_handle.lock().await;
    *h = Some(handle);

    Ok(())
}

/// Scan all available COM ports and try to connect to the first one that opens.
/// Useful when the ESP32-S3 receiver changes COM port numbers after re-enumeration.
#[command]
pub async fn scan_and_connect_serial(
    baud: u32,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let available = serialport::available_ports().map_err(|e| e.to_string())?;
    if available.is_empty() {
        return Err("No serial ports found".to_string());
    }

    // Try each port in order, pick the first that opens
    for port_info in &available {
        let port_name = port_info.port_name.clone();
        log::info!("[Serial] Scanning port: {port_name}");

        // Quick test open (sync) to see if the port is accessible
        let test = serialport::new(&port_name, baud)
            .timeout(std::time::Duration::from_millis(500))
            .open();

        if test.is_ok() {
            drop(test); // close test handle before opening async
            log::info!("[Serial] Auto-selected port: {port_name}");

            // Cancel and abort any existing reader
            {
                let old_cancel = state.serial_cancel.lock().await;
                old_cancel.notify_waiters();
            }
            {
                let mut h = state.serial_handle.lock().await;
                if let Some(old) = h.take() {
                    old.abort();
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

            let fresh_cancel = Arc::new(tokio::sync::Notify::new());
            {
                let mut guard = state.serial_cancel.lock().await;
                *guard = fresh_cancel.clone();
            }

            let reader = SerialReader::new(&port_name, baud);
            let handle = reader.spawn(
                state.db.clone(),
                app.clone(),
                state.mqtt.clone(),
                fresh_cancel,
            );

            let mut h = state.serial_handle.lock().await;
            *h = Some(handle);

            return Ok(port_name);
        }
    }

    Err(format!(
        "Could not open any of the available ports: {}",
        available.iter().map(|p| p.port_name.as_str()).collect::<Vec<_>>().join(", ")
    ))
}

#[command]
pub async fn disconnect_serial(state: State<'_, AppState>) -> Result<(), String> {
    {
        let cancel = state.serial_cancel.lock().await;
        cancel.notify_waiters();
    }
    let mut h = state.serial_handle.lock().await;
    if let Some(handle) = h.take() {
        handle.abort();
    }
    Ok(())
}

// ── Beds ──────────────────────────────────────────────────────────────────────

#[command]
pub async fn get_beds(state: State<'_, AppState>) -> Result<Vec<Bed>, String> {
    crate::db::get_beds(&state.db).await.map_err(|e| e.to_string())
}

#[command]
pub async fn upsert_bed(bed: Bed, state: State<'_, AppState>) -> Result<(), String> {
    crate::db::upsert_bed(&state.db, &bed).await.map_err(|e| e.to_string())
}

#[command]
pub async fn delete_bed(bed_id: String, state: State<'_, AppState>) -> Result<(), String> {
    crate::db::delete_bed(&state.db, &bed_id).await.map_err(|e| e.to_string())
}

// ── Sessions ──────────────────────────────────────────────────────────────────

#[command]
pub async fn get_active_sessions(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    crate::db::get_active_sessions(&state.db).await.map_err(|e| e.to_string())
}

#[command]
pub async fn start_session(
    bed_id: String,
    max_volume_ml: f64,
    target_ml_hr: f64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    crate::db::start_session(&state.db, &bed_id, max_volume_ml, target_ml_hr)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn end_session(
    session_id: String,
    reason: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::db::end_session(&state.db, &session_id, &reason)
        .await
        .map_err(|e| e.to_string())
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

#[command]
pub async fn get_telemetry(
    bed_id: String,
    hours: i64,
    state: State<'_, AppState>,
) -> Result<Vec<TelemetryRow>, String> {
    crate::db::get_telemetry(&state.db, &bed_id, hours)
        .await
        .map_err(|e| e.to_string())
}

#[command]
pub async fn purge_telemetry(days: i64, state: State<'_, AppState>) -> Result<u64, String> {
    crate::db::purge_telemetry(&state.db, days)
        .await
        .map_err(|e| e.to_string())
}

// ── Alerts ────────────────────────────────────────────────────────────────────

#[command]
pub async fn get_alerts(limit: i64, state: State<'_, AppState>) -> Result<Vec<Alert>, String> {
    crate::db::get_alerts(&state.db, limit).await.map_err(|e| e.to_string())
}

#[command]
pub async fn get_active_alerts(state: State<'_, AppState>) -> Result<Vec<Alert>, String> {
    crate::db::get_active_alerts(&state.db).await.map_err(|e| e.to_string())
}

#[command]
pub async fn resolve_alert(
    id: i64,
    resolved_by: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::db::resolve_alert(&state.db, id, &resolved_by)
        .await
        .map_err(|e| e.to_string())
}

// ── MQTT ──────────────────────────────────────────────────────────────────────

#[command]
pub async fn connect_mqtt(
    broker: String,
    port: u16,
    thing_name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Disconnect existing first
    {
        let mut mqtt = state.mqtt.lock().await;
        if let Some(pub_) = mqtt.take() {
            let _ = pub_.disconnect().await;
        }
    }
    {
        let mut h = state.mqtt_handle.lock().await;
        if let Some(old) = h.take() { old.abort(); }
    }

    match MqttPublisher::connect(&broker, port, &thing_name, true, app).await {
        Ok((publisher, handle)) => {
            *state.mqtt.lock().await = Some(publisher);
            *state.mqtt_handle.lock().await = Some(handle);
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub async fn disconnect_mqtt(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    {
        let mut mqtt = state.mqtt.lock().await;
        if let Some(pub_) = mqtt.take() {
            let _ = pub_.disconnect().await;
        }
    }
    {
        let mut h = state.mqtt_handle.lock().await;
        if let Some(handle) = h.take() { handle.abort(); }
    }
    let _ = app.emit("mqtt-disconnected", ());
    Ok(())
}

// ── Mock / Simulator MQTT bridge ──────────────────────────────────────────────

#[command]
pub async fn publish_mock_packet(
    packet: crate::models::BedPacket,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let guard = state.mqtt.lock().await;
    if let Some(pub_) = guard.as_ref() {
        pub_.publish_telemetry(&packet).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
