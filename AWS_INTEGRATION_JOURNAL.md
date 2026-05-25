# 🛠️ SmartIV — AWS Serverless Cloud Integration Journal
### A Complete Phase-by-Phase Technical Walkthrough, Challenges Encountered, and Engineering Solutions

---

## 🏗️ System Overview & Architecture

The **SmartIV** cloud integration creates a robust, real-time, serverless medical monitoring system. The pipeline enables high-frequency bedside telemetry ingestion, automated cloud-level alert routing, push notifications, and a responsive nursing dashboard on both desktop and mobile apps.

```
[ Bedside Units (ESP32) ]
          │ (BLE / RF)
[ Receiver Dongle (ESP32) ]
          │ (USB Serial Ingestion)
[ Tauri Desktop App (Rust Backend) ]
          │ (Mutual TLS (mTLS) over MQTT)
     [ AWS IoT Core ]
          │ (IoT Rules Engine SQL Routing)
     ┌────┴────────────────────────┐
     ▼                             ▼
[ DynamoDB Telemetry Table ]  [ AWS Lambda Alert Engine ]
     ▲                             │ (SNS API)
     │ (API Gateway REST)          ▼
     │                         [ AWS SNS / Firebase Cloud Messaging (FCM) ]
     │                             │ (Push Notification)
[ React Native Mobile App ] ◄──────┘
     │ (AWS Amplify & Cognito Auth)
     ▼
[ Real-time Nurse Dashboard ]
```

---

## 📅 Phase-by-Phase Implementation & Troubleshooting Log

Below is the exhaustive documentation of each phase of the AWS Integration, listing precisely **how** each service was implemented, the **technical hurdles** we faced, and **how we solved them** to achieve a fully operational cloud pipeline.

---

### 🟢 Phase 1 — AWS IoT Core & Tauri/Rust Desktop App
**Objective:** Connect the Desktop App backend to AWS IoT Core using mutual TLS (mTLS) to publish live telemetry securely.

#### ⚙️ Implementation Steps
1. **IoT Thing Setup:** Created a single IoT Thing named `smartiv-desktop-station-1` in AWS IoT Core (`ap-south-1` Mumbai region).
2. **Security Credentials:** Generated and downloaded the mutual TLS files:
   - Device Certificate (`device-certificate.pem.crt`)
   - Private Key (`private.pem.key`)
   - Root CA 1 Certificate (`AmazonRootCA1.pem`)
3. **IoT Policy:** Attached a restrictive IoT Policy (`SmartIVDesktopPolicy`) allowing secure `iot:Connect`, `iot:Publish`, `iot:Subscribe`, and `iot:Receive` actions under the `smartiv/*` resource namespace.
4. **Rust Backend Connection:** Updated `Desktop-App-Rust/src-tauri/src/mqtt.rs` using `rumqttc` asynchronous MQTT client. Created standard TLS configurations to read certificate bytes from the local disk using `std::fs` and inject them into the TLS builder.

#### 🚨 Hurdles & Resolutions
*   **Hurdle 1.1: Missing Rust compiler environment (`cargo metadata: program not found` error)**
    *   *Cause:* The desktop development machine did not have the Rust compiler (`rustc` / `cargo`) installed or added to the environment path.
    *   *Resolution:* Downloaded and initialized the `rustup` installer, selected the stable toolchain, and refreshed environment path variables by restarting the terminals.
*   **Hurdle 1.2: Missing C++ compiler environment (`linker link.exe not found` error)**
    *   *Cause:* Rust builds on Windows require the MSVC C++ Linker tool (`link.exe`) to pack system DLLs and execute compilation.
    *   *Resolution:* Installed Visual Studio Build Tools with the "Desktop development with C++" workload (`Microsoft.VisualStudio.Workload.VCTools`), forcing compiler registration and setting the toolchain default:
        ```powershell
        rustup default stable-x86_64-pc-windows-msvc
        ```
*   **Hurdle 1.3: Absolute vs. Relative Path mismatches for Certificates**
    *   *Cause:* Relative paths like `certs/AmazonRootCA1.pem` resolved incorrectly when Tauri was started in dev mode (`npm run tauri dev`) because Tauri runs its working directory inside the subfolder `src-tauri/`.
    *   *Resolution:* Decoupled the binary from compile-time embedding. Moved the certificate folder under `Desktop-App-Rust/src-tauri/certs/` and modified `mqtt.rs` to load the certificate bytes dynamically from a local subdirectory at runtime. We updated `.gitignore` to guarantee these private cryptographic keys are never leaked to public repositories:
        ```
        # Ignore sensitive AWS TLS certificates
        certs/
        *.pem
        *.key
        *.crt
        ```
*   **Hurdle 1.4: Asynchronous Connection Initialization in Tauri**
    *   *Cause:* Initializing the MQTT client blocked the main Tauri thread, causing the desktop interface to freeze or crash on startup.
    *   *Resolution:* Wrapped the `rumqttc` event loop in an asynchronous tokio thread using `tokio::spawn` within Tauri's initialization block, allowing telemetry forwarding to run concurrently in the background.

---

### 🟢 Phase 2 — Data Routing via AWS IoT Rules Engine & DynamoDB
**Objective:** Automate telemetry saving by intercepting MQTT messages and routing them directly to DynamoDB.

#### ⚙️ Implementation Steps
1. **Database Tables:** Created two DynamoDB tables:
   - `smartiv-telemetry` (Partition Key: `bedId` [String], Sort Key: `ts` [String])
   - `smartiv-alerts` (Partition Key: `bedId` [String], Sort Key: `ts` [String])
2. **IoT Rules Creation:** Defined a SQL routing rule named `SmartIVStoreTelemetry` listening on the MQTT wildcard topic `smartiv/+/+/telemetry`.
   ```sql
   SELECT *, timestamp() AS receivedAt FROM 'smartiv/+/+/telemetry'
   ```
3. **IAM Roles:** Set up and attached `SmartIVIoTRulesRole` allowing IoT Core to perform `dynamodb:PutItem` on the target tables.

#### 🚨 Hurdles & Resolutions
*   **Hurdle 2.1: Schema Mismatch causing silent packet dropping**
    *   *Cause:* The IoT Rule SQL expected partition key `${bedId}` and sort key `${ts}` directly in the payload JSON. However, the Rust structure in Tauri was deserializing using camelCase, while the simulator was transmitting misaligned property names.
    *   *Resolution:* Added `#[serde(rename_all = "camelCase")]` decorators onto the Rust model structs, ensuring exact serializability to JSON fields. Verified that the TypeScript simulator output matched these keys perfectly.
*   **Hurdle 2.2: DynamoDB Query Empty / Simulator Bed-12 restriction**
    *   *Cause:* The simulation was initially hardcoded to only publish data for Bed 12, causing other ward beds in the React Native mobile view to show empty or non-updating states.
    *   *Resolution:* Modified `simulator.ts` to cycle dynamically across multiple registered bedside IDs (e.g., `01` through `05`), triggering realistic multi-bed telemetry generation.
*   **Hurdle 2.3: Sorting and Query Performance Pitfalls in DynamoDB**
    *   *Cause:* Telemetry queries for a single bed took too long or required expensive full-table scans.
    *   *Resolution:* Configured a composite key schema where `bedId` is the partition key and `ts` (ISO 8601 string timestamp) is the sort key. Because string sorting of ISO 8601 dates (e.g., `2026-05-25T14:00:00Z`) naturally sorts chronologically, this allowed the mobile app to perform instantaneous time-series queries for individual bed history using simple `query` operations rather than `scan` operations.

---

### 🟢 Phase 3 & 4 — AWS Lambda & Cloud Alerting (SNS/Push Notifications)
**Objective:** Run real-time background processing on sensor telemetry and trigger urgent notifications to mobile devices when abnormal thresholds are crossed.

#### ⚙️ Implementation Steps
1. **Lambda Engine:** Created a serverless Python 3.12 Lambda function (`SmartIVAlertHandler`) connected to the IoT Rules engine trigger.
2. **Threshold Verification:** The Lambda parses telemetry inputs (e.g., flow rate, volume remaining, battery status). If `status` corresponds to a critical event (like blockage or empty bag), it builds an SNS payload.
3. **SNS Configuration:** Set up AWS Simple Notification Service (SNS) and Firebase Cloud Messaging (FCM) push notification subscriptions.

#### 🚨 Hurdles & Resolutions
*   **Hurdle 3.1: Lambda IAM permission failures (`AccessDeniedException` on SNS publishing)**
    *   *Cause:* The default IAM execution role created for Lambda lacked rights to write to DynamoDB or post data to the SNS Topic.
    *   *Resolution:* Attached the managed policies `AmazonDynamoDBFullAccess` and `AmazonSNSFullAccess` directly to the Lambda function's execution role in the IAM console.
*   **Hurdle 3.2: The Duplicate Alert Notification Storm**
    *   *Cause:* Because edge devices stream telemetry continuously (every 5 seconds), a sustained blockage would trigger duplicate push notifications to the nurses every 5 seconds, causing notification fatigue.
    *   *Resolution:* Added a robust query-before-write check in the Python Lambda using the `boto3` library. The function performs a lookup filtering for active, unresolved alerts before triggering SNS:
      ```python
      # Look for an existing UNRESOLVED alert of the same type for this bed
      table = dynamodb.Table('smartiv-alerts')
      existing = table.query(
          KeyConditionExpression='bedId = :bid',
          FilterExpression='alertType = :at AND attribute_not_exists(resolvedAt)',
          ExpressionAttributeValues={':bid': bed_id, ':at': alert_type},
          ScanIndexForward=False,
          Limit=1
      )
      if existing['Items']:
          # Alert already active — suppress duplicate push notification
          print(f"[DEDUP] Alert {alert_type} for bed {bed_id} already active. Skipping.")
          return {'statusCode': 200, 'body': 'Duplicate alert suppressed'}
      ```
*   **Hurdle 3.3: FCM Version and Credential Configuration Failures**
    *   *Cause:* AWS SNS rejected the Google Firebase credentials or failed to deliver notifications due to using modern HTTP v1 credentials when SNS expected FCM Legacy Server Keys.
    *   *Resolution:* Navigated to the Firebase Console -> Project Settings -> Cloud Messaging. Enabled the *Cloud Messaging API (Legacy)* in the Google Cloud Console and generated a Server Key. Configured SNS with this Legacy Server Key, resolving the authentication handshakes between AWS and Google.

---

### 🟢 Phase 5 — API Gateway REST Integration
**Objective:** Expose secure, low-latency REST endpoints (`/beds` and `/alerts`) to fetch historical telemetry and alert states for mobile apps.

#### ⚙️ Implementation Steps
1. **REST API Setup:** Configured an AWS API Gateway (HTTP API) with resources for `/beds/{bedId}/history` and `/alerts/acknowledge`.
2. **Lambda Proxy:** Connected endpoints to query DynamoDB tables and return JSON payloads.

#### 🚨 Hurdles & Resolutions
*   **Hurdle 5.1: 502 Bad Gateway Errors in API Gateway**
    *   *Cause:* Lambda responses did not adhere to the strict proxy integration response schema required by API Gateway (they returned flat JSON instead of containing `statusCode` and `headers`).
    *   *Resolution:* Re-designed the Python response formatter in Lambda to strictly return an API Gateway-compatible structure:
        ```python
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps(data)
        }
        ```
*   **Hurdle 5.2: Cross-Origin Resource Sharing (CORS) Blocks Mobile Clients**
    *   *Cause:* Mobile app requests to the AWS endpoint failed silently with `Network Error` due to strict CORS validation.
    *   *Resolution:* Enabled CORS on the API Gateway HTTP API configurations, setting allowed origins to `*`. We also injected the required headers explicitly into the dictionary returned by the Lambda functions:
        ```python
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        }
        ```
*   **Hurdle 5.3: Compound Primary Keys in DynamoDB Prevented Simple Alert Resolves**
    *   *Cause:* Nurse clicked "Acknowledge" on mobile, but the alert failed to resolve in the database, throwing: `The provided key element does not match the schema`.
    *   *Resolution:* In DynamoDB, the `smartiv-alerts` table is configured with a composite key of `bedId` and `ts` (timestamp). The front-end was initially trying to acknowledge alerts using a simple auto-generated numeric ID stub. We refactored `apiService.ts` and the `SmartIVAcknowledgeAlert` Lambda to require both compound keys (`bedId` and `ts`), modifying DynamoDB with an `update_item` expression:
      ```python
      table.update_item(
          Key={'bedId': bed_id, 'ts': ts},
          UpdateExpression='SET resolvedAt = :r, resolvedBy = :n',
          ExpressionAttributeValues={
              ':r': datetime.now(timezone.utc).isoformat(),
              ':n': resolved_by
          }
      )
      ```
      This recorded a permanent audit trail of who resolved the alert and when, immediately removing it from active mobile feeds.
*   **Hurdle 5.4: Silent Failure / Undefined Render on Bed Details Page**
    *   *Cause:* The Bed Details page loaded, but active alerts displayed `undefined` text because raw database rows from the database did not match the frontend React Native Alert types.
    *   *Resolution:* Extracted a DRY `mapAlertRow` helper function in `apiService.ts` to map DynamoDB raw alerts into standard TypeScript models:
      ```typescript
      function mapAlertRow(row: any, index: number) {
        const type = alertTypeMap[row.alertType] ?? 'BLOCKAGE';
        return {
          id: index + 1,
          bedId: Number(row.bedId ?? 0),
          bedLabel: `Bed ${row.bedId ?? '??'}`,
          patientName: `Patient (Bed ${row.bedId})`,
          ward: 'General Ward',
          type: type,
          message: type === 'BLOCKAGE' ? `IV line blockage on Bed ${row.bedId}` : `Alert on Bed ${row.bedId}`,
          resolved: row.resolved ?? false,
          createdAt: row.ts ?? new Date().toISOString(),
          resolvedAt: row.resolvedAt ?? null,
        };
      }
      ```

---

### 🟢 Phase 6 — AWS Cognito User Pools (Authentication)
**Objective:** Add secure user signup/login flows for nursing staff to prevent unauthorized access to bedside medical equipment dashboards.

#### ⚙️ Implementation Steps
1. **Cognito User Pool:** Configured User Pool `ap-south-1_TcOZmU2xk` and App Client Credentials.
2. **Identity Pool:** Setup `ap-south-1:e98e7c72-a24f-49dd-b4b1-b17cd64be250` to federate User Pool logins into temporary AWS IAM credentials.
3. **Authentication Flow:** Integrated AWS Cognito client routines into the React Native app using AWS Amplify.

#### 🚨 Hurdles & Resolutions
*   **Hurdle 6.1: React Native App Client Secret Limitations**
    *   *Cause:* Cognito initialization failed in the React Native mobile app with errors indicating cryptographic client secret validation failures.
    *   *Resolution:* React Native compiled binaries cannot securely hide credentials. We reconfigured the AWS Cognito User Pool Client, ensuring that **"Generate client secret"** was **disabled** during creation.
*   **Hurdle 6.2: Cognito "Force Change Password" Challenge Trap**
    *   *Cause:* Testing accounts created via the AWS Console are assigned a status of `FORCE_CHANGE_PASSWORD`. This caused logins to hang on a blue loading screen indefinitely because the app did not support password resets.
    *   *Resolution:* Handled this challenge inside `authService.ts` using Amplify's `signIn` and `confirmSignIn`. If the `nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED'`, the service programmatically confirms the transition by re-submitting the temporary password as the permanent one:
      ```typescript
      const { isSignedIn, nextStep } = await signIn({ username: email, password });
      if (isSignedIn) {
          await this.checkSession();
      } else if (nextStep && nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
          const confirmResult = await confirmSignIn({ challengeResponse: password });
          if (confirmResult.isSignedIn) {
              await this.checkSession();
          }
      }
      ```
      This bypassed the transitional state friction cleanly for development and testing.

---

### 🟢 Phase 7 — React Native / Expo Mobile App Integration
**Objective:** Establish secure MQTT subscriptions and real-time REST polling directly from the nurse dashboard app to the AWS Cloud.

#### ⚙️ Implementation Steps
1. **Amplify Configuration:** Wired the AWS Amplify configuration block using the custom Cognito pools inside `app/_layout.tsx`.
2. **MQTT WebSockets:** Used `@aws-amplify/pubsub` to open signed WebSocket connections to the IoT Core MQTT broker, bypassing local socket crashes.
3. **Zustand Store Integration:** Automatically maps raw MQTT fields to Zustand store shapes, updating bed telemetry instantly and firing local audio/UI alerts when alert conditions are received.

#### 🚨 Hurdles & Resolutions
*   **Hurdle 7.1: Node.js Native Network Crash on Mobile Devices**
    *   *Cause:* Traditional MQTT libraries rely on Node's native `net` and `tls` modules, which are missing in mobile runtimes, causing instant crashes inside Expo Go.
    *   *Resolution:* Avoided native TCP packages. We configured `@aws-amplify/pubsub` to connect over a WebSocket (`wss://xxxx-ats.iot.ap-south-1.amazonaws.com/mqtt`) using standard browser-compatible WebSocket transports.
*   **Hurdle 7.2: AWS IoT "Not Authorized" Connect Failures**
    *   *Cause:* The console printed `[MQTT] Subscription error: Not Authorized` even though Cognito logged in successfully.
    *   *Resolution:* The Cognito Identity Pool's authenticated IAM role lacked explicit permissions to connect and subscribe to the AWS IoT broker. We resolved this by writing an inline policy `SmartIVMobileIoTPolicy` and attaching it to the IAM role `Cognito_SmartIVIdentityPoolAuth_Role`:
      ```json
      {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Action": [
              "iot:Connect",
              "iot:Subscribe",
              "iot:Receive",
              "iot:Publish"
            ],
            "Resource": [
              "arn:aws:iot:ap-south-1:*:client/*",
              "arn:aws:iot:ap-south-1:*:topicfilter/smartiv/*",
              "arn:aws:iot:ap-south-1:*:topic/smartiv/*"
            ]
          }
        ]
      }
      ```
*   **Hurdle 7.3: The Reconnect Loop & Paho `AMQJS0011E` Crash**
    *   *Cause:* The React Native `useMqtt.ts` hook was listening to the entire `nurse` object in its dependency array: `useEffect(..., [isAuthenticated, nurse])`. Because `nurse` was an object recreated on every state update, the effect ran continuously, causing an infinite connect-and-disconnect loop. In the background, Paho MQTT crashed with `Error: AMQJS0011E Invalid state not connected`, causing the app to freeze on a loading screen.
    *   *Resolution:* 
        1. **Hook Dependency Stabilization:** Changed the selector to look only at the primitive `ward` string rather than the full object:
           ```typescript
           const ward = useAuthStore(s => s.nurse?.ward);
           useEffect(() => { ... }, [isAuthenticated, ward]);
           ```
        2. **Concurrency Locks:** Added an `isConnecting` boolean state lock to `mqttService.ts` to prevent multiple, concurrent subscription handshakes from stepping on one another:
           ```typescript
           if (subscription || isConnecting) return;
           isConnecting = true;
           ```
        This completely resolved the reconnect loop, providing instant real-time telemetry updates.
*   **Hurdle 7.4: Blue/White Loading Screen Routing Guard Hang**
    *   *Cause:* If an authenticated user opened the app, they landed on the root route `/` (represented by `index.tsx` spinner) which is outside both the `(auth)` group and `(app)` group. Since no redirect matched this state, the app got stuck on a blue spinner screen indefinitely.
    *   *Resolution:* Updated `_layout.tsx`'s routing guard to track `inAppGroup`. Now, when a user is authenticated but not in the `(app)` folder (either at root or inside `(auth)` group), they are immediately redirected to the Ward Dashboard (`/(app)/ward`), bypassing the hang.

---

### 🟢 Phase 8 — Hardcoding Endpoints & Production Polish
**Objective:** Prevent developers and nurses from having to manually copy-paste MQTT endpoints and thing names every time they launch or test the applications.

#### ⚙️ Implementation Steps
1. **Tauri/Rust Fallbacks:** Integrated the production-ready AWS IoT Core endpoint `a2qzkepylp0vfe-ats.iot.ap-south-1.amazonaws.com` and Thing Name `smartiv-desktop-station-1` as compile-time defaults.
2. **Automated Ward Refresh:** Added an elegant auto-refresh hook to the ward status dashboard to seamlessly synchronize DynamoDB telemetry state change events.

---

## 🚀 Live Health Check & System Verification

The entire pipeline is **100% verified and operational** in the Mumbai region (`ap-south-1`):
*   **Tauri Desktop App Broker:** Connected successfully to the cloud broker using TLS certificates.
*   **DynamoDB Logging:** Simulator data successfully flows through AWS IoT Core and registers in DynamoDB.
*   **API Gateway Live Check:** The REST API retrieves and serves live cloud states cleanly:
    - **Beds Status API:** https://0mt22a6os9.execute-api.ap-south-1.amazonaws.com/prod/beds 🟢 **200 OK**
    - **Alerts Status API:** https://0mt22a6os9.execute-api.ap-south-1.amazonaws.com/prod/alerts 🟢 **200 OK**
*   **Mobile Dashboard:** Fully fetches live beds and displays dynamic alerts under verified Cognito nurse logins.

---
*Document compiled and certified by Antigravity AI Code Companion.*
