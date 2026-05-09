/// lib.rs — Library crate root; Tauri app setup

pub mod alert;
pub mod commands;
pub mod db;
pub mod models;
pub mod mqtt;
pub mod serial;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Resolve app-data directory (platform-specific)
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Could not resolve app data directory");

            let handle = app.handle().clone();

            tauri::async_runtime::block_on(async move {
                // Open / migrate SQLite database
                let db = db::open(app_data_dir)
                    .await
                    .expect("Failed to open SQLite database");

                // Purge telemetry older than 7 days on every startup
                match db::purge_telemetry(&db, 7).await {
                    Ok(n) => log::info!("Purged {n} old telemetry rows"),
                    Err(e) => log::warn!("Telemetry purge failed: {e}"),
                }

                let state = AppState {
                    db,
                    serial_cancel: Arc::new(tokio::sync::Notify::new()),
                    serial_handle: Mutex::new(None),
                    mqtt: Arc::new(Mutex::new(None)),
                    mqtt_handle: Mutex::new(None),
                };

                handle.manage(state);

                // Load existing active alerts into frontend on startup
                // (frontend will re-fetch via IPC on mount)
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_serial_ports,
            commands::connect_serial,
            commands::disconnect_serial,
            commands::get_beds,
            commands::upsert_bed,
            commands::delete_bed,
            commands::get_active_sessions,
            commands::start_session,
            commands::end_session,
            commands::get_telemetry,
            commands::purge_telemetry,
            commands::get_alerts,
            commands::get_active_alerts,
            commands::resolve_alert,
            commands::connect_mqtt,
            commands::disconnect_mqtt,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Smart IV application");
}
