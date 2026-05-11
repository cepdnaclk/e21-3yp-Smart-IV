# Smart IV Mobile - Comprehensive Codebase Guide

This document provides an in-depth explanation of the `smart-iv-mobile` application. It covers the technology stack, file and folder structure, architecture, data flow, and provides actionable guides on how to modify features and debug errors.

---

## 1. Technology Stack

This application is built using a modern, scalable React Native architecture heavily integrated with AWS.
* **Framework:** **React Native** managed by **Expo** (`expo-router` is used for file-based navigation, similar to Next.js).
* **Language:** **TypeScript**, ensuring strict type safety and reducing runtime bugs.
* **State Management:** **Zustand**. A lightweight, highly performant state manager used instead of Redux for managing global app data (like active alerts and live bed stats).
* **Real-time Communication (IoT):** **MQTT** via `aws-iot-device-sdk-v2` / `mqtt.js`. This is how the app receives instant updates from the IV hardware.
* **Authentication:** **AWS Amplify**. Used for logging in nurses and securing data.
* **HTTP Client:** **Axios**, used to fetch historical data and acknowledge alerts via REST API endpoints.
* **UI/Visualization:** `react-native-chart-kit` and `react-native-svg` to draw the flow rate graphs.

---

## 2. File and Folder Structure

The project follows a strict separation of concerns, divided mainly into `app` (Routing/Screens) and `src` (Logic/Components).

### The `app/` Directory (Routing & Screens)
Using Expo Router, the folder structure here *dictates the URL/Navigation structure* of the app.
* **`_layout.tsx`**: The **root initialization file**. It checks if the user is logged in, initializes AWS Amplify sessions, sets up push notification handlers, connects to MQTT, and redirects unauthenticated users to the login screen.
* **`index.tsx`**: A blank fallback that automatically gets redirected by `_layout.tsx`.
* **`(auth)/`**: Screens for unauthenticated users.
  * **`login.tsx`**: The login interface where nurses enter their credentials.
* **`(app)/`**: Screens for authenticated users (the main app).
  * **`_layout.tsx`**: The layout wrapper for the main app.
  * **`ward.tsx`**: The primary dashboard showing a list of all IV beds assigned to the logged-in nurse's ward.
  * **`alerts.tsx`**: A dedicated screen listing all active and historical alerts.
  * **`bed/[bedId].tsx`**: A dynamic route. When you click on a bed, it opens this screen to show detailed info (flow history graph, battery level, volume remaining) for that specific bed ID.

### The `src/` Directory (Core Logic)
* **`components/`**: Reusable UI building blocks.
  * `AlertBanner.tsx`: The red banner that drops down when an emergency occurs.
  * `BedCard.tsx`: The summary card for a single IV drip shown on the ward dashboard.
  * `FlowChart.tsx`: The line graph showing the historical flow rate (Drops per minute).
  * `StatusBadge.tsx`: The small pill-shaped badge showing "STABLE", "CRITICAL", etc.
* **`services/`**: The "Integration Layer". This is where the app talks to the outside world.
  * `apiService.ts`: Handles all standard HTTP requests (fetching bed history, acknowledging alerts) using Axios. It injects the auth token into requests.
  * `authService.ts`: Wraps AWS Amplify functions. Handles login, logout, and token refreshing.
  * `mqttService.ts`: **The most critical file for real-time data.** It establishes a persistent WebSocket connection to AWS IoT Core and listens for live hardware updates.
  * `notifService.ts`: Manages Expo Push Notifications (so phones ring when the app is closed).
* **`stores/`**: The "Memory Layer". This holds the data currently being viewed.
  * `bedStore.ts`: Holds the live state of every IV bed (flow rate, battery, volume).
  * `alertStore.ts`: Holds the list of active alerts.
  * `authStore.ts`: Holds the logged-in nurse's profile and JWT token.
* **`types/`**: TypeScript interfaces (e.g., what a `Bed` or an `Alert` object looks like).
* **`constants/`**: Hardcoded values (Colors, API URLs, MQTT Topic strings).

---

## 3. Architecture and Data Flow

Understanding how data moves from the hardware to the phone screen is crucial. Here is the exact data lifecycle:

### Phase 1: Hardware to Cloud
1. The physical Smart IV device detects a drop or a blockage.
2. The device publishes a small JSON payload to **AWS IoT Core** via MQTT (e.g., to the topic `ward/ICU/flowrate`).

### Phase 2: Cloud to Mobile App (Real-time)
1. When the nurse logs in, `app/_layout.tsx` triggers `useMqtt()` which calls `mqttService.connect()`.
2. The mobile app establishes a secure WebSocket connection to AWS IoT Core and subscribes to topics for the nurse's specific ward.
3. When AWS receives the data from the hardware, it instantly pushes it down the WebSocket to the mobile app.

### Phase 3: Processing in the App
1. Inside `src/services/mqttService.ts`, the `client.on('message', ...)` listener catches the incoming JSON.
2. The service parses the JSON and **directly injects it into Zustand** (`useBedStore.getState().updateBed(...)` or `alertStore.addAlert(...)`).

### Phase 4: Updating the UI
1. Because Zustand is a reactive state manager, any UI component "listening" to `useBedStore` (like `BedCard.tsx` or `[bedId].tsx`) instantly realizes the data changed.
2. The React components automatically re-render in milliseconds to show the new flow rate, updated progress bar, or low battery warning. No manual refreshing is required!

*(Note: `apiService.ts` is only used when the user first opens the app to get the initial state, or to fetch past historical graph logs. Everything else is driven by MQTT).*

---

## 4. How to Modify the App

If you need to change something, here is your cheat sheet on exactly where to go:

### Changing the UI / Visuals
* **Goal:** Change a color, font size, or layout of a specific element.
* **Where to go:** 
  * For global colors: `src/constants/colors.ts`.
  * For a specific widget: `src/components/[ComponentName].tsx`.
  * For a whole screen's layout (like the dashboard): `app/(app)/ward.tsx`.
* **How:** Modify the `StyleSheet.create({...})` at the bottom of the respective file.

### Adding a New Hardware Sensor Feature
* **Goal:** The hardware team added a temperature sensor, and you need to display it on the app.
1. **Types:** Add `temperature?: number` to the `Bed` interface in `src/types/bed.types.ts`.
2. **State:** Update `src/stores/bedStore.ts` to ensure the new field is accepted when updating a bed's state.
3. **Data Flow:** Go to `src/services/mqttService.ts`. In the `client.on('message')` block, extract `payload.temperature` and pass it to the `bedStore` update function.
4. **UI:** Go to `src/components/BedCard.tsx` and `app/(app)/bed/[bedId].tsx` to add a text element that displays `{bed.temperature}°C`.

### Modifying the API / Cloud Connections
* **Goal:** The backend URL changed, or you need to add a new REST API call.
* **Where to go:** Add the new endpoint string to `src/constants/api.ts`. Then, add the actual fetching logic to `src/services/apiService.ts`. Call this new service method from inside your UI component's `useEffect`.

---

## 5. Debugging Guide (When Errors Occur)

If the app breaks, triage the issue based on the symptom:

1. **"The UI looks wrong or the app crashes on a specific screen."**
   * *Cause:* A React rendering error or undefined variable.
   * *Fix:* Check the specific file in `app/` or `src/components/`. Ensure you are optionally chaining variables (e.g., `nurse?.name` instead of `nurse.name`) if the data might not be loaded yet.

2. **"The numbers on the screen aren't updating live when the hardware runs."**
   * *Cause:* MQTT connection failure or wrong topic subscription.
   * *Fix:* Open `src/services/mqttService.ts`. Add `console.log(topic, payload)` inside the `client.on('message')` block. If nothing logs, check your AWS IoT endpoint in `src/constants/mqtt.ts` and ensure the Ward name matches exactly.

3. **"Getting network errors or 401 Unauthorized popups."**
   * *Cause:* Axios failing to fetch the initial data or the AWS Amplify token expired.
   * *Fix:* Check `src/services/apiService.ts`. Specifically look at the `apiClient.interceptors.response.use` block, which handles token expiration. Also, verify `API_BASE_URL` in `src/constants/api.ts`.

4. **"Push notifications aren't arriving."**
   * *Cause:* Expo push token failed to register or backend is ignoring it.
   * *Fix:* Look at `src/services/notifService.ts`. Ensure `registerWithBackend()` is successfully sending the device token to your backend.
