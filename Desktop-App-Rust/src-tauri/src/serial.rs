/// serial.rs — Serial port listener
///
/// Runs as a long-lived tokio::spawn task.
/// Reads newline-delimited JSON from the ESP32 USB receiver.
/// On each valid packet:
///   1. Inserts telemetry into SQLite
///   2. Runs alert engine
///   3. Emits 'bed-update' Tauri event to frontend
///   4. Forwards to MQTT publisher (non-blocking, non-fatal)
///
/// Completely independent of MQTT — if cloud is down, ingestion continues.

use anyhow::{Context, Result};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_serial::SerialPortBuilderExt;
use tauri::{AppHandle, Emitter};

use crate::alert::AlertEngine;
use crate::db::Db;
use crate::models::BedPacket;
use crate::mqtt::MqttPublisher;

pub struct SerialReader {
    pub port: String,
    pub baud: u32,
}

impl SerialReader {
    pub fn new(port: impl Into<String>, baud: u32) -> Self {
        Self { port: port.into(), baud }
    }

    /// Spawn the serial reader loop. Returns a JoinHandle immediately.
    /// The loop reconnects on error, exits when cancel is notified.
    pub fn spawn(
        self,
        db: Db,
        app: AppHandle,
        mqtt: Arc<Mutex<Option<MqttPublisher>>>,
        cancel: Arc<tokio::sync::Notify>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            log::info!("[Serial] Starting reader on {} @ {} baud", self.port, self.baud);
            let _ = app.emit("serial-connected", serde_json::json!({ "port": &self.port }));

            loop {
                match self.read_loop(&db, &app, &mqtt, &cancel).await {
                    Ok(()) => {
                        log::info!("[Serial] Reader exited cleanly");
                        break;
                    }
                    Err(e) => {
                        log::error!("[Serial] Error: {e} — reconnecting in 3 s");
                        tokio::select! {
                            _ = tokio::time::sleep(Duration::from_secs(3)) => {}
                            _ = cancel.notified() => break,
                        }
                    }
                }
            }

            let _ = app.emit("serial-disconnected", ());
            log::info!("[Serial] Reader stopped");
        })
    }

    async fn read_loop(
        &self,
        db: &Db,
        app: &AppHandle,
        mqtt: &Arc<Mutex<Option<MqttPublisher>>>,
        cancel: &Arc<tokio::sync::Notify>,
    ) -> Result<()> {
        // Open port asynchronously via tokio-serial
        let serial = tokio_serial::new(&self.port, self.baud)
            .timeout(Duration::from_millis(5000))
            .open_native_async()
            .with_context(|| format!("Cannot open serial port: {}", self.port))?;

        let reader = BufReader::new(serial);
        let mut lines = reader.lines();

        log::info!("[Serial] Port {} open — reading packets", self.port);

        loop {
            tokio::select! {
                biased;
                _ = cancel.notified() => {
                    log::info!("[Serial] Cancel received, closing port");
                    return Ok(());
                }
                line_res = lines.next_line() => {
                    match line_res {
                        Ok(Some(raw)) => {
                            let raw = raw.trim().to_string();
                            if raw.is_empty() { continue; }

                            match serde_json::from_str::<BedPacket>(&raw) {
                                Ok(mut packet) => {
                                    packet.ts = Some(chrono::Utc::now().to_rfc3339());

                                    // 1. Persist telemetry (non-fatal)
                                    if let Err(e) = crate::db::insert_telemetry(db, &packet).await {
                                        log::warn!("[DB] telemetry write failed: {e}");
                                    }

                                    // 2. Alert engine (non-fatal)
                                    if let Err(e) = AlertEngine::evaluate(&packet, db, app).await {
                                        log::warn!("[Alert] engine error: {e}");
                                    }

                                    // 3. Push to React frontend
                                    if let Err(e) = app.emit("bed-update", &packet) {
                                        log::warn!("[Tauri] emit failed: {e}");
                                    }

                                    // 4. MQTT — acquire lock briefly, don't block serial loop
                                    {
                                        let guard = mqtt.lock().await;
                                        if let Some(pub_) = guard.as_ref() {
                                            if let Err(e) = pub_.publish_telemetry(&packet).await {
                                                log::debug!("[MQTT] publish failed: {e}");
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    log::debug!("[Serial] JSON parse error ({e}): '{raw}'");
                                }
                            }
                        }
                        Ok(None) => {
                            anyhow::bail!("Serial EOF — device disconnected");
                        }
                        Err(e) => {
                            anyhow::bail!("Serial read error: {e}");
                        }
                    }
                }
            }
        }
    }
}
