#[cfg(test)]
mod tests {
    use crate::models::BedPacket;

    #[test]
    fn parses_valid_packet() {
        let raw = r#"
        {
            "bedId": "01",
            "sessionId": "sess-1",
            "flowRate": 100,
            "targetMlhr": 100,
            "volRemaining": 500,
            "maxVolume": 1000,
            "battery": 90,
            "status": "STABLE",
            "dropFactor": 20
        }
        "#;

        let result = serde_json::from_str::<BedPacket>(raw);

        assert!(result.is_ok());

        let packet = result.unwrap();

        assert_eq!(packet.bed_id, "01");
        assert_eq!(packet.flow_rate, 100.0);
        assert_eq!(packet.battery, 90);
    }

    #[test]
    fn rejects_invalid_json() {
        let raw = r#"
        {
            "bedId": "01",
            "flowRate": "INVALID"
        }
        "#;

        let result = serde_json::from_str::<BedPacket>(raw);

        assert!(result.is_err());
    }

    #[test]
    fn rejects_missing_required_fields() {
        let raw = r#"
        {
            "bedId": "01"
        }
        "#;

        let result = serde_json::from_str::<BedPacket>(raw);

        assert!(result.is_err());
    }

    #[test]
    fn rejects_malformed_json() {
        let raw = r#"
        { bedId: "01", flowRate: 100
        "#;

        let result = serde_json::from_str::<BedPacket>(raw);

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_data_ingestion_pipeline() {
        use crate::db;
        
        let temp_dir = std::env::temp_dir().join(format!("smartiv-test-{}", uuid::Uuid::new_v4()));
        let pool = db::open(temp_dir.clone()).await.unwrap();

        let session_id = db::start_session(&pool, "bed-pipeline", 1000.0, 100.0).await.unwrap();

        let raw = format!(r#"
        {{
            "bedId": "bed-pipeline",
            "sessionId": "{}",
            "flowRate": 55.5,
            "targetMlhr": 100,
            "volRemaining": 400,
            "maxVolume": 1000,
            "battery": 85,
            "status": "STABLE",
            "dropFactor": 20
        }}
        "#, session_id);

        let packet = serde_json::from_str::<BedPacket>(&raw).expect("Failed to parse");
        
        db::insert_telemetry(&pool, &packet).await.expect("Failed to insert telemetry");
        
        let telemetry = db::get_telemetry(&pool, "bed-pipeline", 1).await.unwrap();
        assert_eq!(telemetry.len(), 1);
        assert_eq!(telemetry[0].flow_rate_ml, 55.5);
        assert_eq!(telemetry[0].session_id.as_deref(), Some(session_id.as_str()));
        assert_eq!(telemetry[0].status, "STABLE");

        let beds = db::get_beds(&pool).await.unwrap();
        assert_eq!(beds.len(), 1);
        assert_eq!(beds[0].bed_id, "bed-pipeline");

        // Clean up database files and connection pool
        pool.close().await;
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}