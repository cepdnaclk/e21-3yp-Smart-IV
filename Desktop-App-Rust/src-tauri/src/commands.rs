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
    /// Notified to cancel the current serial reader task
    pub serial_cancel: Arc<tokio::sync::Notify>,
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
    // Gracefully stop any existing reader
    state.serial_cancel.notify_waiters();
    {
        let mut h = state.serial_handle.lock().await;
        if let Some(old) = h.take() {
            old.abort();
        }
    }
    // Small settle delay
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

    // Spawn new reader
    let cancel = state.serial_cancel.clone();
    let reader = SerialReader::new(port, baud);
    let handle = reader.spawn(
        state.db.clone(),
        app,
        state.mqtt.clone(),
        cancel,
    );

    let mut h = state.serial_handle.lock().await;
    *h = Some(handle);

    Ok(())
}

#[command]
pub async fn disconnect_serial(state: State<'_, AppState>) -> Result<(), String> {
    state.serial_cancel.notify_waiters();
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
