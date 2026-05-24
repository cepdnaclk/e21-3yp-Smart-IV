/// mqtt.rs — MQTT publisher for AWS IoT Core
///
/// Uses rumqttc with TLS for secure publish to AWS IoT Core.
/// Runs as a managed state — independent of serial reader.
/// If MQTT is down, all serial ingestion continues normally.

use anyhow::{Context, Result};
use rumqttc::{AsyncClient, MqttOptions, QoS, TlsConfiguration, Transport};
use std::fs;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// Paths to your cert files (ensure these match exactly what you named them in certs/)
const CA_PATH: &str = "certs/AmazonRootCA1.pem";
const CERT_PATH: &str = "certs/device-certificate.pem.crt";
const KEY_PATH: &str = "certs/private.pem.key";

use crate::models::{Alert, BedPacket};

pub struct MqttPublisher {
    client: AsyncClient,
    thing_name: String,
}

impl MqttPublisher {
    /// Connect to AWS IoT Core (with TLS) or a plain broker (no TLS for dev).
    pub async fn connect(
        broker: &str,
        port: u16,
        thing_name: &str,
        use_tls: bool,
        app: AppHandle,
    ) -> Result<(Self, tokio::task::JoinHandle<()>)> {
        let client_id = format!("{}-{}", thing_name, uuid::Uuid::new_v4());
        let mut opts = MqttOptions::new(&client_id, broker, port);
        opts.set_keep_alive(Duration::from_secs(30));
        opts.set_clean_session(true);

        if use_tls {
            // Load CA cert
            let ca_bytes = fs::read(CA_PATH).expect("Cannot read CA cert. Ensure certs/AmazonRootCA1.pem exists.");
            // Load device cert
            let cert_bytes = fs::read(CERT_PATH).expect("Cannot read device cert. Ensure certs/device-certificate.pem.crt exists.");
            // Load private key
            let key_bytes = fs::read(KEY_PATH).expect("Cannot read private key. Ensure certs/private.pem.key exists.");

            let tls_config = TlsConfiguration::Simple {
                ca: ca_bytes,
                alpn: None,
                client_auth: Some((cert_bytes, key_bytes)),
            };
            opts.set_transport(Transport::tls_with_config(tls_config.into()));
        }

        let (client, mut event_loop) = AsyncClient::new(opts, 16);

        let app_clone = app.clone();
        let handle = tokio::spawn(async move {
            let mut connected = false;
            loop {
                match event_loop.poll().await {
                    Ok(event) => {
                        use rumqttc::Event::Incoming;
                        use rumqttc::Packet::ConnAck;
                        if let Incoming(ConnAck(_)) = event {
                            if !connected {
                                connected = true;
                                let _ = app_clone.emit("mqtt-connected", ());
                                log::info!("[MQTT] Connected to broker");
                            }
                        }
                    }
                    Err(e) => {
                        if connected {
                            connected = false;
                            let _ = app_clone.emit("mqtt-disconnected", ());
                        }
                        log::warn!("[MQTT] Connection error: {e}");
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            }
        });

        Ok((
            Self {
                client,
                thing_name: thing_name.to_string(),
            },
            handle,
        ))
    }

    /// Publish telemetry packet to smartiv/{thing}/{bedId}/telemetry
    pub async fn publish_telemetry(&self, packet: &BedPacket) -> Result<()> {
        let topic = format!("smartiv/{}/{}/telemetry", self.thing_name, packet.bed_id);
        let payload = serde_json::to_string(packet)?;
        self.client
            .publish(topic, QoS::AtLeastOnce, false, payload.into_bytes())
            .await
            .context("MQTT publish telemetry")?;
        Ok(())
    }

    /// Publish alert to smartiv/{thing}/{bedId}/alert
    pub async fn publish_alert(&self, alert: &Alert) -> Result<()> {
        let topic = format!("smartiv/{}/{}/alert", self.thing_name, alert.bed_id);
        let payload = serde_json::to_string(alert)?;
        self.client
            .publish(topic, QoS::AtLeastOnce, false, payload.into_bytes())
            .await
            .context("MQTT publish alert")?;
        Ok(())
    }

    pub async fn disconnect(&self) -> Result<()> {
        self.client.disconnect().await.context("MQTT disconnect")?;
        Ok(())
    }
}
