/// models.rs — Shared data types for the Rust backend

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BedStatus {
    Stable,
    Blockage,
    #[serde(rename = "EMPTY_BAG")]
    EmptyBag,
    #[serde(rename = "CONN_LOST")]
    ConnLost,
    Offline,
}

impl BedStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Stable    => "STABLE",
            Self::Blockage  => "BLOCKAGE",
            Self::EmptyBag  => "EMPTY_BAG",
            Self::ConnLost  => "CONN_LOST",
            Self::Offline   => "OFFLINE",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BedPacket {
    pub bed_id: String,
    pub status: BedStatus,
    pub flow_rate: f64,
    pub vol_remaining: f64,
    pub max_volume: f64,
    pub battery: u8,
    pub drop_factor: u8,
    pub target_mlhr: f64,
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ts: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bed {
    pub bed_id: String,
    pub patient_name: String,
    pub ward: String,
    pub drop_factor: u8,
    pub mac_address: String,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub session_id: String,
    pub bed_id: String,
    pub max_volume_ml: f64,
    pub target_ml_hr: f64,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub end_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryRow {
    pub id: u64,
    pub bed_id: String,
    pub session_id: Option<String>,
    pub ts: Option<String>,
    pub flow_rate_ml: f64,
    pub vol_remaining: f64,
    pub battery_pct: u8,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Alert {
    pub id: u64,
    pub bed_id: String,
    pub session_id: Option<String>,
    pub ts: Option<String>,
    pub alert_type: String,
    pub resolved_at: Option<String>,
    pub resolved_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialConfig {
    pub port: String,
    pub baud_rate: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MqttConfig {
    pub broker: String,
    pub port: u16,
    pub thing_name: String,
    pub use_tls: bool,
    pub client_cert_path: Option<String>,
    pub private_key_path: Option<String>,
    pub ca_cert_path: Option<String>,
}
