import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';

class DbService {
  constructor() {
    this.db = null;
  }

  init() {
    console.log('🔍 dbService.init() called');
    try {
        const dbPath = join(app.getPath('userData'), 'ward.db');
        console.log(`💾 Database path: ${dbPath}`);
        
        this.db = new Database(dbPath);
        console.log('✅ Database opened successfully');
        
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('journal_mode = WAL');
        
        this.createTables();
    } catch (err) {
        console.error('❌ Database failed to open:', err.message);
    }
}

  createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS infusion_sessions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        bed_id          TEXT NOT NULL,
        patient_ref     TEXT,
        start_ts        INTEGER NOT NULL,
        end_ts          INTEGER,
        target_mlhr     REAL,
        bag_volume_ml   REAL,
        drop_factor     INTEGER DEFAULT 20,
        total_dispensed REAL,
        end_reason      TEXT
      );

      CREATE TABLE IF NOT EXISTS telemetry_data (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES infusion_sessions(id) ON DELETE CASCADE,
        bed_id     TEXT NOT NULL,
        ts         INTEGER NOT NULL,
        meas_mlhr  REAL,
        remain_ml  REAL,
        bat_pct    INTEGER,
        state      TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tel_bed_ts ON telemetry_data(bed_id, ts);

      CREATE TABLE IF NOT EXISTS alert_log (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES infusion_sessions(id) ON DELETE CASCADE,
        bed_id     TEXT NOT NULL,
        ts         INTEGER NOT NULL,
        type       TEXT NOT NULL,
        severity   TEXT NOT NULL,
        message    TEXT,
        ack_ts     INTEGER,
        ack_by     TEXT
      );
    `);

    console.log('✅ Database tables ready.');
  }

  // ================================================================
  // INFUSION SESSIONS
  // ================================================================

  //Helper to recover active sessions on app restart
  getActiveSessions() {
    if (!this.db) return [];
    const stmt = this.db.prepare(`
      SELECT id as sessionId, bed_id as bedId, target_mlhr as targetMlhr, 
             bag_volume_ml as maxVolume, drop_factor as dropFactor 
      FROM infusion_sessions 
      WHERE end_ts IS NULL
    `);
    return stmt.all();
  }

  //
  sessionExists(sessionId) {
    if (!this.db) return false;
    const stmt = this.db.prepare(`
      SELECT id FROM infusion_sessions 
      WHERE id = @sessionId AND end_ts IS NULL
    `);
    const result = stmt.get({ sessionId });
    return !!result; // returns true if found, false if not
  }

  startSession(bedId, { patientRef, targetMlhr, bagVolumeMl, dropFactor } = {}) {
    if (!this.db) { console.error('DB not initialized'); return null; }
    const stmt = this.db.prepare(`
      INSERT INTO infusion_sessions (bed_id, patient_ref, start_ts, target_mlhr, bag_volume_ml, drop_factor)
      VALUES (@bedId, @patientRef, @startTs, @targetMlhr, @bagVolumeMl, @dropFactor)
    `);

    const result = stmt.run({
      bedId,
      patientRef: patientRef ?? null,
      startTs: Date.now(),
      targetMlhr: targetMlhr ?? null,
      bagVolumeMl: bagVolumeMl ?? null,
      dropFactor: dropFactor ?? 20
    });

    console.log(`🏥 Session started for Bed ${bedId} — Session ID: ${result.lastInsertRowid}`);
    return result.lastInsertRowid;
  }

  endSession(sessionId, { endReason, totalDispensed } = {}) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      UPDATE infusion_sessions
      SET end_ts = @endTs, end_reason = @endReason, total_dispensed = @totalDispensed
      WHERE id = @sessionId
    `);

    stmt.run({
      sessionId,
      endTs: Date.now(),
      endReason: endReason ?? 'COMPLETED',
      totalDispensed: totalDispensed ?? null
    });

    console.log(`🏁 Session ${sessionId} ended — Reason: ${endReason}`);
  }

  // ================================================================
  // TELEMETRY
  // ================================================================

  saveTelemetry(sessionId, bedId, { measMlhr, remainMl, batPct, state } = {}) {
    if (!this.db || !sessionId) return;
    const stmt = this.db.prepare(`
      INSERT INTO telemetry_data (session_id, bed_id, ts, meas_mlhr, remain_ml, bat_pct, state)
      VALUES (@sessionId, @bedId, @ts, @measMlhr, @remainMl, @batPct, @state)
    `);

    stmt.run({
      sessionId,
      bedId,
      ts: Date.now(),
      measMlhr: measMlhr ?? null,
      remainMl: remainMl ?? null,
      batPct: batPct ?? null,
      state: state ?? null
    });
  }

  getTelemetry(bedId, fromTs, toTs) {
    if (!this.db) return [];
    const stmt = this.db.prepare(`
      SELECT * FROM telemetry_data
      WHERE bed_id = @bedId AND ts BETWEEN @fromTs AND @toTs
      ORDER BY ts ASC
    `);

    return stmt.all({ bedId, fromTs, toTs });
  }

  // ================================================================
  // ALERTS
  // ================================================================

  logAlert(sessionId, bedId, { type, severity, message } = {}) {
    if (!this.db) return null;
    const stmt = this.db.prepare(`
      INSERT INTO alert_log (session_id, bed_id, ts, type, severity, message)
      VALUES (@sessionId, @bedId, @ts, @type, @severity, @message)
    `);

    const result = stmt.run({
      sessionId,
      bedId,
      ts: Date.now(),
      type,
      severity,
      message: message ?? null
    });

    console.log(`🚨 Alert logged for Bed ${bedId} — Type: ${type} | Severity: ${severity}`);
    return result.lastInsertRowid;
  }

  getActiveAlerts() {
    if (!this.db) return [];
    const stmt = this.db.prepare(`
      SELECT * FROM alert_log
      WHERE ack_ts IS NULL
      ORDER BY ts DESC
    `);

    return stmt.all();
  }

  acknowledgeAlert(alertId, nurseId) {
    if (!this.db) return;
    const stmt = this.db.prepare(`
      UPDATE alert_log
      SET ack_ts = @ackTs, ack_by = @nurseId
      WHERE id = @alertId
    `);

    stmt.run({
      alertId,
      ackTs: Date.now(),
      nurseId
    });

    console.log(`✅ Alert ${alertId} acknowledged by ${nurseId}`);
  }

  close() {
    if (this.db) {
      this.db.close();
      console.log('💾 Database connection closed.');
    }
  }
}

export default new DbService();