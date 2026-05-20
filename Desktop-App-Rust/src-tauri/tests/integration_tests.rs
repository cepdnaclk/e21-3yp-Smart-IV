use smart_iv_desktop_lib::models::{Bed, BedPacket, BedStatus, MqttConfig, SerialConfig};
use smart_iv_desktop_lib::db;

#[tokio::test]
async fn test_configs_serialization() {
    // 1. Test MQTT Configuration serialization/deserialization
    let mqtt_conf = MqttConfig {
        broker: "iot.amazonaws.com".to_string(),
        port: 8883,
        thing_name: "SmartIV-Node-1".to_string(),
        use_tls: true,
        client_cert_path: Some("/certs/client.pem".to_string()),
        private_key_path: Some("/certs/private.key".to_string()),
        ca_cert_path: Some("/certs/ca.pem".to_string()),
    };

    let serialized = serde_json::to_string(&mqtt_conf).expect("Failed to serialize MqttConfig");
    let deserialized: MqttConfig = serde_json::from_str(&serialized).expect("Failed to deserialize MqttConfig");

    assert_eq!(deserialized.broker, "iot.amazonaws.com");
    assert_eq!(deserialized.port, 8883);
    assert_eq!(deserialized.thing_name, "SmartIV-Node-1");
    assert!(deserialized.use_tls);
    assert_eq!(deserialized.client_cert_path.as_deref(), Some("/certs/client.pem"));

    // 2. Test Serial Configuration serialization/deserialization
    let serial_conf = SerialConfig {
        port: "COM3".to_string(),
        baud_rate: 115200,
    };

    let serialized_ser = serde_json::to_string(&serial_conf).expect("Failed to serialize SerialConfig");
    let deserialized_ser: SerialConfig = serde_json::from_str(&serialized_ser).expect("Failed to deserialize SerialConfig");

    assert_eq!(deserialized_ser.port, "COM3");
    assert_eq!(deserialized_ser.baud_rate, 115200);
}

#[tokio::test]
async fn test_full_database_and_session_lifecycle() {
    // Create a temporary database directory that gets deleted at the end of the test
    let temp_dir = std::env::temp_dir().join(format!("smartiv-integration-{}", uuid::Uuid::new_v4()));
    let pool = db::open(temp_dir.clone()).await.expect("Failed to open test database");

    // 1. Initial Bed Registration
    let bed = Bed {
        bed_id: "bed-int-01".to_string(),
        patient_name: "Alice Smith".to_string(),
        ward: "Ward B".to_string(),
        drop_factor: 15,
        mac_address: "AA:11:BB:22:CC:33".to_string(),
        created_at: None,
    };
    db::upsert_bed(&pool, &bed).await.expect("Upsert bed failed");

    // Verify bed is saved
    let beds = db::get_beds(&pool).await.expect("Get beds failed");
    assert_eq!(beds.len(), 1);
    assert_eq!(beds[0].bed_id, "bed-int-01");
    assert_eq!(beds[0].patient_name, "Alice Smith");
    assert_eq!(beds[0].ward, "Ward B");
    assert_eq!(beds[0].drop_factor, 15);

    // 2. Overwrite Bed details (upsert update test)
    let updated_bed = Bed {
        bed_id: "bed-int-01".to_string(),
        patient_name: "Alice Jones".to_string(), // Name updated
        ward: "ICU West".to_string(),            // Ward updated
        drop_factor: 20,                          // Drop factor updated
        mac_address: "AA:11:BB:22:CC:33".to_string(),
        created_at: None,
    };
    db::upsert_bed(&pool, &updated_bed).await.expect("Update bed failed");

    let beds_updated = db::get_beds(&pool).await.expect("Get beds failed");
    assert_eq!(beds_updated.len(), 1);
    assert_eq!(beds_updated[0].patient_name, "Alice Jones");
    assert_eq!(beds_updated[0].ward, "ICU West");
    assert_eq!(beds_updated[0].drop_factor, 20);

    // 3. Start a new session
    let session_id = db::start_session(&pool, "bed-int-01", 800.0, 75.0)
        .await
        .expect("Start session failed");

    // Verify active sessions list matches
    let active_sessions = db::get_active_sessions(&pool).await.expect("Get active sessions failed");
    assert_eq!(active_sessions.len(), 1);
    assert_eq!(active_sessions[0].session_id, session_id);
    assert_eq!(active_sessions[0].max_volume_ml, 800.0);
    assert_eq!(active_sessions[0].target_ml_hr, 75.0);

    // 4. Ingest telemetry packets
    let packet_1 = BedPacket {
        bed_id: "bed-int-01".to_string(),
        status: BedStatus::Stable,
        flow_rate: 74.2,
        vol_remaining: 725.0,
        max_volume: 800.0,
        battery: 98,
        drop_factor: 20,
        target_mlhr: 75.0,
        session_id: Some(session_id.clone()),
        ts: None,
    };
    db::insert_telemetry(&pool, &packet_1).await.expect("Insert telemetry 1 failed");

    let packet_2 = BedPacket {
        bed_id: "bed-int-01".to_string(),
        status: BedStatus::Blockage, // Trigger blockage status
        flow_rate: 0.0,
        vol_remaining: 725.0,
        max_volume: 800.0,
        battery: 96,
        drop_factor: 20,
        target_mlhr: 75.0,
        session_id: Some(session_id.clone()),
        ts: None,
    };
    db::insert_telemetry(&pool, &packet_2).await.expect("Insert telemetry 2 failed");

    // Fetch and check telemetry rows
    let mut telemetry = db::get_telemetry(&pool, "bed-int-01", 1).await.expect("Get telemetry failed");
    assert_eq!(telemetry.len(), 2);
    // Sort by id to ensure strict chronological ordering even when inserted in the same second
    telemetry.sort_by_key(|t| t.id);
    assert_eq!(telemetry[0].flow_rate_ml, 74.2);
    assert_eq!(telemetry[0].status, "STABLE");
    assert_eq!(telemetry[1].flow_rate_ml, 0.0);
    assert_eq!(telemetry[1].status, "BLOCKAGE");

    // 5. Fire and resolve alerts
    let alert_id = db::insert_alert(&pool, "bed-int-01", Some(&session_id), "BLOCKAGE")
        .await
        .expect("Insert alert failed");

    let active_alerts = db::get_active_alerts(&pool).await.expect("Get active alerts failed");
    assert_eq!(active_alerts.len(), 1);
    assert_eq!(active_alerts[0].alert_type, "BLOCKAGE");
    assert_eq!(active_alerts[0].resolved_at, None);

    db::resolve_alert(&pool, alert_id, "Nurse Practitioner Miller")
        .await
        .expect("Resolve alert failed");

    let resolved_alerts = db::get_active_alerts(&pool).await.expect("Get active alerts after resolution failed");
    assert!(resolved_alerts.is_empty());

    let all_alerts = db::get_alerts(&pool, 10).await.expect("Get all alerts failed");
    assert_eq!(all_alerts.len(), 1);
    assert_eq!(all_alerts[0].resolved_by.as_deref(), Some("Nurse Practitioner Miller"));

    // 6. Terminate session and verify cleanup
    db::end_session(&pool, &session_id, "Infusion completed normally").await.expect("End session failed");

    let active_sessions_after = db::get_active_sessions(&pool).await.expect("Get active sessions after end failed");
    assert!(active_sessions_after.is_empty());

    // Close SQLite pool connection and delete the temp database workspace directory
    pool.close().await;
    let _ = std::fs::remove_dir_all(temp_dir);
}
