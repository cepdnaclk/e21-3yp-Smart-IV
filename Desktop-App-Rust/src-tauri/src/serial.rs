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
///
/// WINDOWS USB-CDC FIX (2026-06-15):
///   tokio_serial::open_native_async() uses Windows IOCP (overlapped I/O).
///   The ESP32-S3's native USB CDC driver does NOT support IOCP, so every
///   open_native_async() call fails immediately even though the port is valid.
///   Fix: use the sync `serialport` crate opened normally, then read in a
///   tokio::task::spawn_blocking thread, communicating back to the async
///   world via an mpsc channel. This works with ALL Windows USB CDC drivers.
///
///   serial-connected now fires only AFTER the port opens successfully.
///   serial-disconnected fires on every failed retry (not just final exit).
///   serial_cancel is a fresh Arc<Notify> per connection (no stale signals).

use anyhow::{Context, Result};
use std::io::Read;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};
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
    ///
    /// `cancel` MUST be a fresh Arc<Notify> created per connection attempt.
    pub fn spawn(
        self,
        db: Db,
        app: AppHandle,
        mqtt: Arc<Mutex<Option<MqttPublisher>>>,
        cancel: Arc<tokio::sync::Notify>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            log::info!("[Serial] Starting reader on {} @ {} baud", self.port, self.baud);

            loop {
                match self.read_loop(&db, &app, &mqtt, &cancel).await {
                    Ok(()) => {
                        log::info!("[Serial] Reader exited cleanly");
                        break;
                    }
                    Err(e) => {
                        log::error!("[Serial] Error: {e} — reconnecting in 3 s");
                        // Tell the UI we are disconnected during the retry gap
                        let _ = app.emit("serial-disconnected", ());
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
        // ── Open port synchronously (works with all Windows USB CDC drivers) ──
        // tokio_serial::open_native_async() fails on ESP32-S3 native USB because
        // the driver does not support Windows IOCP overlapped I/O.
        // We use the blocking serialport crate instead and bridge with spawn_blocking.
        let mut port = serialport::new(&self.port, self.baud)
            .timeout(Duration::from_millis(500)) // short timeout so stop_flag is polled
            .open()
            .with_context(|| format!("Cannot open serial port: {}", self.port))?;

        // Deassert DTR so the ESP32 does NOT auto-reset when we open the port.
        // On most dev boards DTR is wired to EN via a capacitor — asserting it resets the chip.
        if let Err(e) = port.write_data_terminal_ready(false) {
            log::warn!("[Serial] Could not deassert DTR: {e} (continuing anyway)");
        }
        if let Err(e) = port.write_request_to_send(false) {
            log::warn!("[Serial] Could not deassert RTS: {e} (continuing anyway)");
        }

        // Port opened — NOW tell the frontend we are connected
        log::info!("[Serial] Port {} open — reading packets", self.port);
        let _ = app.emit("serial-connected", serde_json::json!({ "port": &self.port }));

        // ── Bridge: blocking reads → async channel ──────────────────────────
        let (line_tx, mut line_rx) = mpsc::channel::<Result<String, String>>(128);
        let stop = Arc::new(AtomicBool::new(false));
        let stop_reader = stop.clone();

        // The blocking thread owns the port and assembles newline-terminated lines.
        tokio::task::spawn_blocking(move || {
            let mut port = port;
            let mut byte = [0u8; 1];
            let mut line = String::with_capacity(256);

            loop {
                if stop_reader.load(Ordering::Relaxed) {
                    break;
                }

                match port.read(&mut byte) {
                    Ok(0) => {
                        // EOF (device disconnected)
                        let _ = line_tx.blocking_send(Err("Serial EOF".into()));
                        break;
                    }
                    Ok(_) => {
                        let ch = byte[0];
                        if ch == b'\n' {
                            // Trim CR that may precede LF (\r\n)
                            let trimmed = line.trim_end_matches('\r').trim().to_string();
                            if !trimmed.is_empty() {
                                if line_tx.blocking_send(Ok(trimmed)).is_err() {
                                    break; // receiver dropped (cancel)
                                }
                            }
                            line.clear();
                        } else {
                            line.push(ch as char);
                            // Guard against runaway non-newline data
                            if line.len() > 512 {
                                log::warn!("[Serial] Line too long — discarding buffer");
                                line.clear();
                            }
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                        // Normal 500 ms timeout — loop back, check stop flag
                        continue;
                    }
                    Err(e) => {
                        let _ = line_tx.blocking_send(Err(format!("Serial read error: {e}")));
                        break;
                    }
                }
            }
        });

        // ── Async loop: receive lines, parse, dispatch ───────────────────────
        loop {
            tokio::select! {
                biased;

                // Cancel requested (disconnect button or new connect_serial call)
                _ = cancel.notified() => {
                    log::info!("[Serial] Cancel received, closing port");
                    stop.store(true, Ordering::Relaxed);
                    return Ok(());
                }

                // Line from blocking reader thread
                msg = line_rx.recv() => {
                    match msg {
                        Some(Ok(raw)) => {
                            // Log every incoming line at INFO so we can confirm data is flowing
                            log::info!("[Serial] RX: {}", if raw.len() > 120 { &raw[..120] } else { &raw });

                            // Ignore non-JSON lines (debug output from firmware)
                            if !raw.starts_with('{') {
                                log::warn!("[Serial] non-JSON line — skipping: '{raw}'");
                                continue;
                            }

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
                                            match pub_.publish_telemetry(&packet).await {
                                                Ok(_) => log::info!("[MQTT] Published packet for bed {}", packet.bed_id),
                                                Err(e) => log::warn!("[MQTT] publish failed: {e}"),
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    // WARN so this is visible in normal logs (was debug before)
                                    log::warn!("[Serial] JSON parse FAILED ({e}): '{raw}'");
                                }
                            }
                        }
                        Some(Err(e)) => {
                            stop.store(true, Ordering::Relaxed);
                            anyhow::bail!("{e}");
                        }
                        None => {
                            // Channel closed — reader thread finished
                            anyhow::bail!("Serial reader thread ended unexpectedly");
                        }
                    }
                }
            }
        }
    }
}
