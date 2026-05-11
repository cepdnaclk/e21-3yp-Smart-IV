# SmartIV — Complete AWS Setup Guide
### From Zero AWS Experience to a Fully Connected IoT System

---

> **How to use this guide:** Work through each Phase in order. Do not skip ahead — each phase
> depends on the one before it. Every section explains *why* the service exists, *how* it works
> conceptually, and then gives you the exact steps to set it up.

---

## Prerequisites (Before You Start)

- An AWS account. Create one free at https://aws.amazon.com — a credit card is required but you
  will not be charged for anything in this guide during development/testing (all services used
  have generous free tiers).
- AWS Console access in your browser (console.aws.amazon.com).
- Your desktop app codebase open (`Desktop-App-Rust/`).
- Your mobile app codebase open (`smart-iv-mobile/`).
- **Important:** In the AWS Console top-right corner, set your region to **`ap-south-1`
  (Mumbai)** — it is the closest AWS region to Sri Lanka and will give you the lowest latency.

---

## Big Picture: What You Are Building

Before touching anything, understand the full picture:

```
[ESP32 IV Device]
      ↓  BLE/RF
[ESP32 USB Dongle]
      ↓  USB Serial
[Tauri Desktop App]
      ↓  MQTT over TLS  ← Phase 1 fixes this
[AWS IoT Core]          ← Phase 1
      ↓
[IoT Rules Engine]      ← Phase 2  (routes data automatically)
      ↙           ↘
[DynamoDB]        [Lambda]   ← Phase 2 & 3
                      ↓
                   [SNS/FCM]  ← Phase 4  (push notifications)
      ↑
[API Gateway]          ← Phase 5  (REST for history & ack)
      ↑
[AWS Cognito]          ← Phase 6  (nurse login & permissions)
      ↑
[React Native Mobile]  ← Phase 7  (wire it all together)
```

---

## Phase 1 — AWS IoT Core + TLS Certificates (The Desktop Connection)

### What is AWS IoT Core and why do you need it?

AWS IoT Core is a managed MQTT broker hosted by Amazon. Think of it as a post office in the
cloud: your desktop app sends a "letter" (a JSON telemetry packet) addressed to a specific
"mailbox" (a topic like `smartiv/station-1/bed03/telemetry`), and IoT Core holds it and
delivers it to anyone who subscribed to that mailbox — in your case, the mobile app.

You already have `mqtt.rs` in your desktop app. It already knows *how* to publish MQTT messages.
The only missing piece is the three security credential files it needs to prove its identity to
AWS. This is Gap 1 from the architecture review.

### How AWS IoT Core security works (TLS mutual authentication)

Normal HTTPS websites prove *their* identity to you (your browser sees the green padlock). AWS
IoT Core requires *both sides* to prove identity — this is called mutual TLS (mTLS). Your
desktop app needs three files:

- **Amazon Root CA certificate** — proves you are talking to the real AWS, not an imposter.
- **Device certificate** — a unique certificate AWS issues for your specific desktop station.
  AWS uses this to know "this is the SmartIV station in Ward ICU".
- **Private key** — a secret key that mathematically pairs with the device certificate. Never
  share this file or commit it to Git.

### Step-by-step: Create a Thing and download certificates

**Step 1.1 — Open AWS IoT Core**

1. Go to the AWS Console → search "IoT Core" in the top search bar → click it.
2. In the left sidebar, click **Manage → All devices → Things**.
3. Click **Create things**.

**Step 1.2 — Create a Single Thing**

1. Select **Create single thing** → Next.
2. **Thing name:** `smartiv-desktop-station-1`
   (Use a naming convention like `smartiv-desktop-{wardname}` if you have multiple wards.)
3. Leave everything else as default → Next.

**Step 1.3 — Configure the certificate (Auto-generate recommended)**

1. Select **Auto-generate a new certificate** → Next.
2. You will now attach a Policy. Click **Create policy** (opens a new tab).

**Step 1.4 — Create an IoT Policy**

A Policy is a set of rules that says what this device is *allowed to do* on AWS. Without a
policy, the certificate is useless — AWS will reject the connection.

1. Policy name: `SmartIVDesktopPolicy`
2. Click **JSON** tab and paste this:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:ap-south-1:*:client/smartiv-*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Publish",
      "Resource": "arn:aws:iot:ap-south-1:*:topic/smartiv/*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:ap-south-1:*:topicfilter/smartiv/*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Receive",
      "Resource": "arn:aws:iot:ap-south-1:*:topic/smartiv/*"
    }
  ]
}
```

3. Click **Create** → go back to the Thing creation tab.
4. Refresh the policy list → select `SmartIVDesktopPolicy` → Next.

**Step 1.5 — Download ALL certificate files**

This is the only time AWS will show you these files. Download all of them:

- ✅ **Device certificate** (`xxx-certificate.pem.crt`)
- ✅ **Private key** (`xxx-private.pem.key`)
- ✅ **Public key** (you won't use this, but download it anyway)
- ✅ **Amazon Root CA 1** (click the link — saves as `AmazonRootCA1.pem`)

Save all four files to a folder like `Desktop-App-Rust/certs/` on your development machine.
**Add `certs/` to your `.gitignore` immediately.**

Click **Done**.

**Step 1.6 — Find your IoT Endpoint URL**

1. In AWS IoT Core left sidebar → **Settings**.
2. Copy the **Device data endpoint**. It looks like:
   `xxxxxxxxxxxxxx-ats.iot.ap-south-1.amazonaws.com`
   This is the URL your desktop app connects to. Save it — you will need it shortly.

---

### Fix Gap 1: Update `mqtt.rs` to load the certificates

Open `src-tauri/src/mqtt.rs`. Your current code has empty certificate arrays (`ca: vec![]`).
Replace the TLS configuration section with the following pattern:

```rust
use std::fs;
use rumqttc::{MqttOptions, Transport};
use rustls::{Certificate, PrivateKey, RootCertStore};

// Paths to your cert files (make these configurable via Settings page later)
const CA_PATH:   &str = "certs/AmazonRootCA1.pem";
const CERT_PATH: &str = "certs/device-certificate.pem.crt";
const KEY_PATH:  &str = "certs/private.pem.key";
const ENDPOINT:  &str = "xxxxxxxxxxxxxx-ats.iot.ap-south-1.amazonaws.com";
const PORT:       u16 = 8883;  // Standard MQTT over TLS port

pub fn build_mqtt_options(thing_name: &str) -> MqttOptions {
    let mut mqtt_options = MqttOptions::new(thing_name, ENDPOINT, PORT);
    mqtt_options.set_keep_alive(std::time::Duration::from_secs(30));

    // Load CA cert
    let ca_bytes = fs::read(CA_PATH).expect("Cannot read CA cert");
    // Load device cert
    let cert_bytes = fs::read(CERT_PATH).expect("Cannot read device cert");
    // Load private key
    let key_bytes = fs::read(KEY_PATH).expect("Cannot read private key");

    let transport = Transport::tls_with_config(
        rumqttc::TlsConfiguration::Simple {
            ca: ca_bytes,
            alpn: None,
            client_auth: Some((cert_bytes, key_bytes)),
        }
    );
    mqtt_options.set_transport(transport);
    mqtt_options
}
```

> **Note:** The exact Rust API depends on your version of `rumqttc`. Check your `Cargo.toml`
> for the version and consult its docs if the method names differ slightly. The concept
> (loading three files into the TLS config) is identical across versions.

**Test this now.** Run your desktop app, go to Settings → connect serial → check the MQTT
status indicator in the sidebar. It should show connected. If it fails, the most common causes
are: wrong endpoint URL, wrong region in the policy ARN, or the certificate not being activated
(go to IoT Core → Certificates → find yours → verify it says "Active").

---

## Phase 2 — IoT Rules Engine + DynamoDB (Storing Cloud Telemetry)

### What is the IoT Rules Engine?

When a packet arrives at AWS IoT Core, IoT Core can do more than just relay it — it can
*trigger actions* automatically. The Rules Engine lets you write a simple SQL-like query that
matches incoming messages and routes them somewhere: a database, a Lambda function, another
topic, etc.

Think of it as "if a message arrives on topic X that matches condition Y, automatically do Z".
You don't need any server running to do this — AWS handles it.

### What is DynamoDB?

DynamoDB is AWS's managed NoSQL database. It stores your telemetry permanently in the cloud,
so the mobile app can fetch historical data even if the desktop app is offline. It is
serverless — you don't configure or maintain any database server.

A DynamoDB table is made of **items** (rows) identified by a **partition key** (like a primary
key). You can also add a **sort key** to sort items within a partition — ideal for time-series
data like telemetry.

### Step-by-step: Create the DynamoDB tables

You need two tables.

**Step 2.1 — Create the telemetry table**

1. AWS Console → search "DynamoDB" → click it.
2. Click **Create table**.
3. Table name: `smartiv-telemetry`
4. Partition key: `bedId` (String)
5. Sort key: `ts` (String)  ← ISO 8601 timestamp; sorting alphabetically on ISO dates = sorting by time
6. Leave everything else as default (On-demand capacity is fine for a university project).
7. Click **Create table**.

**Step 2.2 — Create the alerts table**

Repeat the above with:
- Table name: `smartiv-alerts`
- Partition key: `bedId` (String)
- Sort key: `ts` (String)

---

### Step-by-step: Create IoT Rules

**Step 2.3 — Rule 1: Store all telemetry in DynamoDB**

1. AWS IoT Core → left sidebar → **Message routing → Rules** → **Create rule**.
2. Rule name: `SmartIVStoreTelemetry`
3. SQL statement:

```sql
SELECT *, timestamp() AS receivedAt
FROM 'smartiv/+/+/telemetry'
```

This selects every message on any topic matching that pattern. `+` is a single-level wildcard,
so `smartiv/station-1/bed03/telemetry` would match.

4. Click **Next** → **Add action** → choose **DynamoDB**.
5. Table name: `smartiv-telemetry`
6. Partition key value: `${bedId}` (pulls from the JSON field)
7. Sort key value: `${ts}`
8. Under **IAM role** → click **Create new role** → name it `SmartIVIoTRulesRole` → Create.
9. Click **Next** → **Create**.

**Step 2.4 — Rule 2: Trigger Lambda on alert packets**

1. Create another rule.
2. Rule name: `SmartIVAlertTrigger`
3. SQL statement:

```sql
SELECT *, topic(2) AS stationId, topic(3) AS bedId
FROM 'smartiv/+/+/telemetry'
WHERE status = 'BLOCKAGE'
   OR status = 'EMPTY_BAG'
   OR status = 'CONN_LOST'
   OR battery < 20
```

This rule only fires when a packet contains an alert condition. `topic(2)` extracts the station
name from the topic string.

4. Action → **Lambda** → you will create the Lambda in Phase 3.
   For now, save the rule but leave the action blank — you will come back and add it.

---

## Phase 3 — AWS Lambda (Alert Logic + Push Notification Trigger)

### What is Lambda?

Lambda is a "function as a service". You write a small function (in Python, Node.js, etc.),
upload it to AWS, and it runs *only when triggered* — in this case, triggered by the IoT Rules
Engine every time an alert condition appears. You pay only for the milliseconds it runs. No
server to manage.

Your Lambda function does three things:
1. Receives the alert packet from IoT Rules Engine.
2. Checks DynamoDB to see if this alert is already active (dedup — fixing Gap 4).
3. If it is a new alert, writes it to DynamoDB and sends a push notification via SNS.

### Step-by-step: Create the alert Lambda

**Step 3.1 — Create the function**

1. AWS Console → search "Lambda" → click it.
2. Click **Create function**.
3. Select **Author from scratch**.
4. Function name: `SmartIVAlertHandler`
5. Runtime: **Python 3.12**
6. Architecture: x86_64
7. Click **Create function**.

**Step 3.2 — Write the function code**

In the code editor that appears, replace the contents of `lambda_function.py` with:

```python
import json
import boto3
import os
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')

ALERTS_TABLE = 'smartiv-alerts'
SNS_TOPIC_ARN = os.environ.get('SNS_TOPIC_ARN', '')

def lambda_handler(event, context):
    """
    Triggered by IoT Rules Engine when a packet has an alert condition.
    event = the JSON packet from the ESP32, enriched by the Rules Engine.
    """
    bed_id    = event.get('bedId', 'unknown')
    status    = event.get('status', 'STABLE')
    battery   = event.get('battery', 100)
    ts        = event.get('ts', datetime.now(timezone.utc).isoformat())
    session_id = event.get('sessionId', None)

    # Determine alert type
    if status in ('BLOCKAGE', 'EMPTY_BAG', 'CONN_LOST'):
        alert_type = status
    elif battery < 20:
        alert_type = 'BATTERY_LOW'
    else:
        return {'statusCode': 200, 'body': 'No alert condition'}

    # ── Gap 4 fix: dedup check ──────────────────────────────────────────────
    # Look for an existing UNRESOLVED alert of the same type for this bed.
    table = dynamodb.Table(ALERTS_TABLE)
    existing = table.query(
        KeyConditionExpression='bedId = :bid',
        FilterExpression='alertType = :at AND attribute_not_exists(resolvedAt)',
        ExpressionAttributeValues={':bid': bed_id, ':at': alert_type},
        ScanIndexForward=False,
        Limit=1
    )
    if existing['Items']:
        # Alert already active — do not send duplicate push notification
        print(f"[DEDUP] Alert {alert_type} for bed {bed_id} already active. Skipping.")
        return {'statusCode': 200, 'body': 'Duplicate alert suppressed'}

    # ── New alert: write to DynamoDB ────────────────────────────────────────
    table.put_item(Item={
        'bedId':      bed_id,
        'ts':         ts,
        'alertType':  alert_type,
        'sessionId':  session_id,
        'resolvedAt': None,
        'resolvedBy': None,
    })

    # ── Send push notification via SNS ──────────────────────────────────────
    if SNS_TOPIC_ARN:
        message_body = build_push_message(alert_type, bed_id, event)
        sns.publish(
            TopicArn=SNS_TOPIC_ARN,
            Message=json.dumps(message_body),
            Subject=f'SmartIV Alert — Bed {bed_id}',
        )

    print(f"[ALERT] New alert: {alert_type} for bed {bed_id} at {ts}")
    return {'statusCode': 200, 'body': f'Alert {alert_type} processed for bed {bed_id}'}


def build_push_message(alert_type, bed_id, packet):
    """Build a human-readable push notification message."""
    messages = {
        'BLOCKAGE':   f'⚠️ Bed {bed_id}: IV drip blockage detected. Check immediately.',
        'EMPTY_BAG':  f'🔴 Bed {bed_id}: IV bag is empty. Replace now.',
        'CONN_LOST':  f'📡 Bed {bed_id}: SmartIV device connection lost.',
        'BATTERY_LOW': f'🔋 Bed {bed_id}: Device battery below 20%.',
    }
    return {
        'default': messages.get(alert_type, f'Alert on bed {bed_id}'),
        'GCM': json.dumps({   # GCM = Firebase/Android + Expo
            'notification': {
                'title': 'SmartIV Alert',
                'body': messages.get(alert_type, f'Alert on bed {bed_id}'),
            },
            'data': {
                'bedId':     bed_id,
                'alertType': alert_type,
                'ts':        packet.get('ts', ''),
            }
        })
    }
```

**Step 3.3 — Add environment variable**

1. In the Lambda page → **Configuration** tab → **Environment variables** → Edit.
2. Add: Key = `SNS_TOPIC_ARN`, Value = (you will fill this in Phase 4 after creating SNS).

**Step 3.4 — Give Lambda permission to access DynamoDB and SNS**

1. **Configuration** tab → **Permissions** → click the role name (e.g. `SmartIVAlertHandler-role-xxxxx`).
2. This opens the IAM console. Click **Add permissions → Attach policies**.
3. Search and attach: `AmazonDynamoDBFullAccess`
4. Search and attach: `AmazonSNSFullAccess`
5. Go back to Lambda.

**Step 3.5 — Go back and add Lambda action to IoT Rule**

1. Back in IoT Core → Rules → `SmartIVAlertTrigger` → Edit.
2. Add action → Lambda → select `SmartIVAlertHandler`.
3. Save.

---

## Phase 4 — SNS + Firebase Cloud Messaging (Push Notifications)

### How push notifications work on mobile

Sending a notification to a phone is not as simple as calling an API. Each phone platform
(Android, iOS) has its own push delivery system:
- Android uses **Firebase Cloud Messaging (FCM)**, owned by Google.
- iOS uses **APNs (Apple Push Notification service)**, owned by Apple.

AWS SNS acts as a single unified API that sits in front of both. You send one message to SNS,
and SNS forwards it to FCM (for Android) or APNs (for iOS). Expo Push Notifications adds
another layer on top — Expo manages the FCM/APNs credentials for you during development, so
you only need to go to Firebase directly when you publish to the Play Store.

### Step 4.1 — Create a Firebase project (for Android push)

1. Go to https://console.firebase.google.com → **Add project**.
2. Project name: `SmartIV` → Continue → Disable Google Analytics (not needed) → Create project.
3. Inside the project → **Project settings** (gear icon) → **Cloud Messaging** tab.
4. Under **Cloud Messaging API (Legacy)**, click the three dots → **Manage API in Google Cloud Console** → Enable it.
5. Back in Firebase → Cloud Messaging tab → copy the **Server key**. Save it.

### Step 4.2 — Create an SNS Platform Application

1. AWS Console → search "SNS" → click it.
2. Left sidebar → **Push notifications → Mobile push notifications** → **Create platform application**.
3. Application name: `SmartIVAndroid`
4. Push notification platform: **Firebase Cloud Messaging (FCM)**
5. Under **Firebase credentials** → paste your Server key from Step 4.1.
6. Click **Create platform application**.
7. Copy the **Application ARN**. Save it.

### Step 4.3 — Create an SNS Topic (for fan-out to all nurses in a ward)

An SNS Topic is like a mailing list. When Lambda publishes to the topic, SNS delivers it to
every endpoint (phone) subscribed to that topic. One topic per ward makes sense.

1. SNS → **Topics** → **Create topic**.
2. Type: **Standard** (not FIFO — order doesn't matter for alerts).
3. Name: `smartiv-alerts-icu` (one per ward).
4. Click **Create topic**.
5. Copy the **Topic ARN**. This is what goes into your Lambda environment variable `SNS_TOPIC_ARN`.
6. Go back to Lambda → Configuration → Environment variables → update `SNS_TOPIC_ARN`.

### Step 4.4 — How nurse phones subscribe to the SNS Topic

When a nurse logs in on the mobile app, the app must:
1. Get the Expo push token for the device: `await Notifications.getExpoPushTokenAsync()`.
2. Convert it to an SNS endpoint ARN by calling your API (which calls
   `sns.create_platform_endpoint()`).
3. Subscribe that endpoint ARN to the ward's SNS topic.

This is done in `src/services/notifService.ts` in your mobile app. Here is the flow to implement:

```typescript
// In notifService.ts — call this after login
export async function registerDeviceForPushNotifications(wardId: string) {
  // 1. Get Expo push token
  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync();

  // 2. Send to your backend (API Gateway → Lambda) which registers with SNS
  await apiService.post('/notifications/register', {
    expoPushToken,
    wardId,
    nurseId: authStore.getState().nurse.id,
  });
}
```

Your backend Lambda for registration does:
```python
def register_push_endpoint(expo_token, ward_id, nurse_id):
    # Create or update the SNS platform endpoint for this device
    response = sns.create_platform_endpoint(
        PlatformApplicationArn=PLATFORM_APP_ARN,
        Token=expo_token,
        CustomUserData=f'{nurse_id}:{ward_id}'
    )
    endpoint_arn = response['EndpointArn']

    # Subscribe this endpoint to the ward's alert topic
    topic_arn = WARD_TOPIC_MAP[ward_id]   # map wardId to SNS topic ARN
    sns.subscribe(TopicArn=topic_arn, Protocol='application', Endpoint=endpoint_arn)
```

---

## Phase 5 — API Gateway (REST Endpoints for the Mobile App)

### What is API Gateway?

API Gateway is AWS's managed HTTP server. Instead of running your own Express or FastAPI
server, you define endpoints (like `GET /beds/{bedId}/history`) in API Gateway and connect
each one to a Lambda function. You get a real HTTPS URL for free, with SSL certificates,
rate limiting, and auth built in.

Your mobile app's `apiService.ts` already calls REST endpoints. These are what you are building.

### Step 5.1 — Create the HTTP API

1. AWS Console → search "API Gateway" → click it.
2. Click **Create API** → choose **HTTP API** (simpler and cheaper than REST API for this use case).
3. API name: `smartiv-api`
4. Click **Next → Next → Create**.
5. Note the **Invoke URL** at the top — this will be your `API_BASE_URL` in `src/constants/api.ts`.

### Step 5.2 — Create Lambda functions for each endpoint

You need two Lambda functions. Create them the same way as Phase 3.

**Lambda 1: `SmartIVGetTelemetryHistory`**

```python
import boto3
import json
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    bed_id = event['pathParameters']['bedId']
    limit  = int(event.get('queryStringParameters', {}).get('limit', 100))

    table = dynamodb.Table('smartiv-telemetry')
    result = table.query(
        KeyConditionExpression=Key('bedId').eq(bed_id),
        ScanIndexForward=False,   # newest first
        Limit=limit
    )
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'},
        'body': json.dumps(result['Items'])
    }
```

**Lambda 2: `SmartIVAcknowledgeAlert`**

```python
import boto3
import json
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')

def lambda_handler(event, context):
    body       = json.loads(event['body'])
    bed_id     = body['bedId']
    ts         = body['ts']
    resolved_by = body.get('resolvedBy', 'nurse')

    table = dynamodb.Table('smartiv-alerts')
    table.update_item(
        Key={'bedId': bed_id, 'ts': ts},
        UpdateExpression='SET resolvedAt = :r, resolvedBy = :n',
        ExpressionAttributeValues={
            ':r': datetime.now(timezone.utc).isoformat(),
            ':n': resolved_by
        }
    )
    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({'message': 'Alert acknowledged'})
    }
```

Give both Lambda functions `AmazonDynamoDBFullAccess` permission (same as Step 3.4).

### Step 5.3 — Add routes in API Gateway

1. In your API → **Routes** → **Create**.
2. Add these routes and connect each to its Lambda:

| Method | Path                        | Lambda                          |
|--------|-----------------------------|---------------------------------|
| GET    | `/beds/{bedId}/history`     | `SmartIVGetTelemetryHistory`    |
| POST   | `/alerts/acknowledge`       | `SmartIVAcknowledgeAlert`       |
| POST   | `/notifications/register`   | *(create a new Lambda for this)*|

3. For each route → **Integrations** → **Create and attach** → Lambda → select the function.

### Step 5.4 — Update the mobile app constants

In `src/constants/api.ts` in your mobile app:

```typescript
export const API_BASE_URL = 'https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com';
```

---

## Phase 6 — AWS Cognito (Nurse Authentication)

### What is Cognito and why two pool types?

This is Gap 2 from the architecture review. Cognito has two separate concepts that work together:

**User Pool** — handles *who you are*. It stores nurse usernames, passwords, and profiles. When
a nurse logs in, the User Pool verifies the password and issues a JWT token (a signed string that
proves "this is Nurse Amali"). This is what AWS Amplify's `signIn()` function uses.

**Identity Pool** — handles *what AWS resources you can access*. It takes the JWT from the User
Pool and exchanges it for temporary AWS credentials (`accessKeyId`, `secretAccessKey`,
`sessionToken`). These temporary credentials are what the mobile MQTT client needs to connect to
AWS IoT Core. Without an Identity Pool, the nurse has a valid login but cannot subscribe to MQTT.

Think of it this way: the User Pool is a hospital ID card. The Identity Pool is the keycard
reader at the door to the server room — it checks your ID card and decides which doors you
can open.

### Step 6.1 — Create the User Pool

1. AWS Console → search "Cognito" → click it.
2. Click **Create user pool**.
3. Sign-in option: **Email** (nurses sign in with email + password).
4. Password policy: leave defaults (or relax for dev).
5. MFA: **No MFA** (for simplicity; add later for production).
6. User pool name: `SmartIVUserPool`
7. **App client name:** `SmartIVMobileApp`
8. Uncheck **Generate client secret** (Expo/React Native cannot use a secret).
9. Complete creation. Note the **User Pool ID** and **App client ID**.

### Step 6.2 — Create the Identity Pool

1. Back in Cognito → **Identity pools** → **Create identity pool**.
2. Name: `SmartIVIdentityPool`
3. Under **Authentication providers** → **Cognito** tab:
   - User Pool ID: (from Step 6.1)
   - App client ID: (from Step 6.1)
4. Click **Next**.
5. For the IAM roles, click **Create new IAM roles** → Cognito will auto-create an
   "Authenticated" role. Accept the defaults → Next → Create.

### Step 6.3 — Give the authenticated role IoT Core permissions

When a nurse logs in, their temporary credentials come with the "Authenticated" IAM role. You
need to add IoT permissions to that role.

1. AWS Console → search "IAM" → click it.
2. Left sidebar → **Roles** → search for `Cognito_SmartIVIdentityPoolAuth_Role`.
3. Click it → **Add permissions → Create inline policy**.
4. Click **JSON** tab and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iot:Connect",
        "iot:Subscribe",
        "iot:Receive"
      ],
      "Resource": [
        "arn:aws:iot:ap-south-1:*:client/${cognito-identity.amazonaws.com:sub}",
        "arn:aws:iot:ap-south-1:*:topicfilter/smartiv/*",
        "arn:aws:iot:ap-south-1:*:topic/smartiv/*"
      ]
    }
  ]
}
```

5. Policy name: `SmartIVIoTSubscribePolicy` → Create policy.

Note: `${cognito-identity.amazonaws.com:sub}` is a special variable that resolves to the
nurse's unique Cognito identity ID at runtime — this ensures each nurse can only connect as
themselves.

### Step 6.4 — Configure AWS Amplify in the mobile app

In your mobile app, find where Amplify is configured (usually `app/_layout.tsx` or a separate
`amplifyConfig.ts`). Update it:

```typescript
import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId:           'ap-south-1_XXXXXXXXX',   // from Step 6.1
      userPoolClientId:     'xxxxxxxxxxxxxxxxxxxxxxxxxx', // from Step 6.1
      identityPoolId:       'ap-south-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // from Step 6.2
      region:               'ap-south-1',
      loginWith: {
        email: true,
      }
    }
  }
});
```

---

## Phase 7 — Mobile MQTT Connection with Cognito Credentials (Gap 3 Fix)

### Why the mobile MQTT setup is different from the desktop

The desktop app uses a device certificate + private key (a fixed identity tied to the physical
hardware). The mobile app cannot use this — a phone is a user device, not a fixed hardware
unit. Instead, the mobile app uses the nurse's Cognito temporary credentials to authenticate
the MQTT WebSocket connection. This is called **SigV4 signing** — AWS IoT Core accepts
WebSocket connections where the URL itself is signed with the nurse's credentials.

This is Gap 3 from the architecture review.

### Step 7.1 — Update `mqttService.ts`

Your current `mqttService.ts` likely has a static MQTT configuration. Replace the connection
logic with a credential-aware version:

```typescript
import { fetchAuthSession } from 'aws-amplify/auth';
import { mqtt, iot } from 'aws-iot-device-sdk-v2';

const AWS_REGION   = 'ap-south-1';
const IOT_ENDPOINT = 'xxxxxxxxxxxxxx-ats.iot.ap-south-1.amazonaws.com'; // same endpoint as desktop

export async function connect(wardId: string): Promise<mqtt.MqttClientConnection> {
  // 1. Get temporary AWS credentials from Cognito (via Amplify)
  //    This is the key step that Gap 3 requires.
  const session = await fetchAuthSession();
  const credentials = session.credentials;

  if (!credentials) {
    throw new Error('No AWS credentials — is the nurse logged in?');
  }

  // 2. Build a WebSocket connection config using the credentials (SigV4 signing)
  const config = iot.AwsIotMqttConnectionConfigBuilder
    .new_with_websockets()
    .with_clean_session(true)
    .with_client_id(`mobile-${session.identityId}`)  // unique per nurse
    .with_endpoint(IOT_ENDPOINT)
    .with_credentials(
      AWS_REGION,
      credentials.accessKeyId,
      credentials.secretAccessKey,
      credentials.sessionToken   // ← temporary token from Cognito Identity Pool
    )
    .with_keep_alive_seconds(30)
    .build();

  const client = new mqtt.MqttClient();
  const connection = client.new_connection(config);

  await connection.connect();

  // 3. Subscribe to this ward's telemetry topics
  await connection.subscribe(
    `smartiv/+/${wardId}/+`,   // all beds in this ward  ← adjust to your topic schema
    mqtt.QoS.AtLeastOnce
  );

  // 4. Handle incoming messages — inject into Zustand (same as before)
  connection.on('message', (topic, payload) => {
    const packet = JSON.parse(Buffer.from(payload).toString('utf8'));
    useBedStore.getState().updateBed(packet);
    if (['BLOCKAGE', 'EMPTY_BAG', 'CONN_LOST'].includes(packet.status)) {
      useAlertStore.getState().addAlert({ ...packet, ts: new Date().toISOString() });
    }
  });

  return connection;
}
```

**Important:** Cognito credentials expire after 1 hour. You should call `fetchAuthSession()`
again when reconnecting. Amplify handles token refresh automatically if you call it every time
rather than caching the credentials yourself.

---

## Phase 8 — Final Checklist and End-to-End Test

### Create a nurse test user in Cognito

1. Cognito → Your User Pool → **Users** → **Create user**.
2. Email: `testnurse@smartiv.local`, Password: `Test1234!`
3. Check **Mark email as verified**.

### MQTT Topic alignment — fix this before testing

Your desktop publishes to: `smartiv/{thingName}/{bedId}/telemetry`
Your mobile should subscribe to: `smartiv/+/{wardId}/+` or simply `smartiv/#` for all

Make sure these patterns match. Verify in `mqtt.rs` (desktop) and `mqttService.ts` (mobile).
If you change the topic structure, update the IoT Rules Engine SQL as well.

### End-to-end test sequence

Run through this in order:

1. ✅ **Desktop → AWS IoT Core:** Start the desktop app → connect serial (or run simulator) →
   check AWS IoT Core Console → **MQTT test client** → subscribe to `smartiv/#` →
   you should see packets arriving in real time.

2. ✅ **IoT Rules → DynamoDB:** After a few packets, go to DynamoDB → Tables →
   `smartiv-telemetry` → **Explore items** → you should see rows.

3. ✅ **Alert trigger → Lambda:** In IoT Core MQTT test client, publish a manual test message
   to `smartiv/station-1/bed03/telemetry`:
   ```json
   {"bedId":"03","status":"EMPTY_BAG","flowRate":0,"volRemaining":0,
    "maxVolume":500,"battery":75,"dropFactor":20,"targetMlhr":80,
    "sessionId":"test-sess","ts":"2025-01-01T00:00:00Z"}
   ```
   Then check Lambda → `SmartIVAlertHandler` → **Monitor** → **View CloudWatch logs** →
   you should see "New alert: EMPTY_BAG".

4. ✅ **Push notification:** Check your phone for a notification. If it doesn't arrive,
   check SNS → Topics → Subscriptions — make sure the phone is subscribed.

5. ✅ **Mobile MQTT:** Log in on the mobile app → navigate to the ward dashboard → the beds
   should populate in real time as the desktop streams data.

6. ✅ **REST history:** Tap a bed on mobile → check that the historical chart loads data
   (this calls API Gateway → Lambda → DynamoDB).

---

## Summary: All AWS Resources You Will Have Created

| Service         | Resource Name                  | Purpose                                      |
|-----------------|-------------------------------|----------------------------------------------|
| IoT Core        | `smartiv-desktop-station-1`   | Thing identity for desktop                   |
| IoT Core        | `SmartIVDesktopPolicy`        | Permissions for the desktop certificate      |
| IoT Core        | `SmartIVStoreTelemetry`       | Rule: all telemetry → DynamoDB               |
| IoT Core        | `SmartIVAlertTrigger`         | Rule: alert packets → Lambda                 |
| DynamoDB        | `smartiv-telemetry`           | Persistent cloud telemetry history           |
| DynamoDB        | `smartiv-alerts`              | Persistent cloud alert log                   |
| Lambda          | `SmartIVAlertHandler`         | Alert dedup + push trigger                   |
| Lambda          | `SmartIVGetTelemetryHistory`  | REST: fetch bed history                      |
| Lambda          | `SmartIVAcknowledgeAlert`     | REST: nurse acknowledges alert               |
| SNS             | `SmartIVAndroid` (Platform)   | FCM push application                         |
| SNS             | `smartiv-alerts-icu` (Topic)  | Alert fan-out to all nurses in a ward        |
| API Gateway     | `smartiv-api`                 | HTTPS REST endpoint for mobile app           |
| Cognito         | `SmartIVUserPool`             | Nurse login (username/password)              |
| Cognito         | `SmartIVIdentityPool`         | AWS credential exchange for MQTT on mobile   |

---

## Cost Estimate (AWS Free Tier)

For a university project / prototype with ~4 beds and a handful of nurses:

| Service     | Free Tier                          | Your Usage              |
|-------------|-------------------------------------|-------------------------|
| IoT Core    | 500,000 messages/month              | ~100,000/month          |
| DynamoDB    | 25 GB storage, 200M requests/month  | < 1 GB, < 1M requests   |
| Lambda      | 1 million invocations/month         | < 10,000/month          |
| SNS         | 1 million publishes/month           | < 1,000/month           |
| API Gateway | 1 million calls/month               | < 10,000/month          |
| Cognito     | 50,000 MAU (monthly active users)   | < 10 users              |

**Expected monthly cost: $0.00** during development and demo. You will only incur costs if you
scale to a full hospital ward with hundreds of beds running 24/7.

---

*Guide prepared for the SmartIV project — Department of Computer Engineering, University of Peradeniya.*
