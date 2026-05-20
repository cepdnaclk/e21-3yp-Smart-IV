/**
 * chatbot.js — SmartIV Ask Page
 *
 * Architecture:
 *  - sendQuestionToBackend(question) is the single integration point.
 *    Replace its body with a real fetch() call when the RAG backend is ready.
 *  - All UI rendering is separated from "backend" logic.
 *  - Mock responses cover all suggestion chips for demo purposes.
 */

/* =====================================================================
   SECTION 1 — BACKEND STUB
   Replace the body of sendQuestionToBackend() with:

   const response = await fetch(API_ENDPOINT, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ question })
   });
   const data = await response.json();
   return { answer: data.answer, sources: data.sources || [] };

   ===================================================================== */

const API_ENDPOINT = '/api/chat'; // TODO: set real endpoint when RAG backend is ready

async function sendQuestionToBackend(question) {
    // ── MOCK RESPONSES (replace this whole block with the real fetch above) ──
    await sleep(1200 + Math.random() * 600); // simulate network latency

    const q = question.toLowerCase();

    if (q.includes('problem') || q.includes('solve') || q.includes('why')) {
        return {
            answer: `SmartIV addresses a critical patient-safety gap in hospital wards. Manual IV drip monitoring is error-prone — nurses are responsible for dozens of patients simultaneously, and a depleted or blocked IV bag can go unnoticed for extended periods, risking air embolism, medication interruption, or fluid overload.\n\nSmartIV replaces manual checks with real-time automated monitoring using an optical drop sensor and a stepper-motor flow regulator. Nurses receive push alerts on their mobile app the moment a drip runs empty, stops flowing, or drifts outside the prescribed rate — reducing missed alerts by an estimated 70 %.`,
            sources: ['Problem Statement', 'Project Overview']
        };
    }

    if (q.includes('hardware') || q.includes('sensor') || q.includes('esp32') || q.includes('motor')) {
        return {
            answer: `The SmartIV hardware unit clips onto a standard IV drip stand and consists of:\n\n• **Optical Drop Sensor** — counts individual drip events with high accuracy to derive real-time flow rate.\n• **NEMA 17 Stepper Motor + TMC2208 Driver** — clamps the IV tube and adjusts flow rate automatically to hit the prescribed target.\n• **ESP32-S3 (Edge MCU)** — handles local sensing, motor control, BMS monitoring, and Wi-Fi/MQTT communication to AWS IoT Core.\n• **Second ESP32 (USB Dongle)** — acts as a reliable local receiver connected to the desktop nursing station.\n• **Custom PCB + Li-Po Battery with BMS** — gives full ward mobility without a mains power requirement.\n• **Arduino LCD** — local patient-facing status display.`,
            sources: ['Hardware', 'Architecture']
        };
    }

    if (q.includes('architecture') || q.includes('system') || q.includes('cloud') || q.includes('aws') || q.includes('mqtt')) {
        return {
            answer: `SmartIV uses a layered IoT architecture:\n\n1. **Edge Layer** — the wearable IV unit (ESP32-S3) reads the drop sensor, controls the stepper motor, and publishes MQTT messages over Wi-Fi.\n2. **Cloud Layer** — AWS IoT Core receives telemetry and routes it through AWS Lambda to a backend API and push notification service (AWS SNS/FCM).\n3. **Desktop Station** — a Tauri + React desktop app receives local data via the USB-dongle ESP32 and shows a real-time ward overview.\n4. **Mobile App** — a React Native app gives nurses push alerts and patient session history on iOS & Android.\n5. **Database** — SQLite (via sqlx in Rust/Tauri) for local session storage; cloud storage via AWS DynamoDB.`,
            sources: ['Architecture', 'Software']
        };
    }

    if (q.includes('budget') || q.includes('cost') || q.includes('price') || q.includes('lkr') || q.includes('money')) {
        return {
            answer: `The estimated per-unit hardware budget for SmartIV is approximately LKR 24,000–28,000 at prototype scale. Key cost items include:\n\n• ESP32-S3 (primary MCU) — LKR 2,150\n• ESP32 DevKit V1 (dongle) — LKR 1,835\n• NEMA 17 Stepper Motor — LKR 2,240\n• TMC2208 Silent Driver — LKR 1,390\n• Arduino LCD + Level Converter — LKR 1,950\n• Load Cell + HX711 — LKR 1,850\n• Li-Po Battery + BMS — LKR 2,800\n• Optical Drop Sensor — LKR 950\n• Custom PCB fabrication — LKR 3,500\n• Enclosure + hardware — LKR 2,200\n\nSoftware infrastructure costs (AWS IoT Core, Lambda, DynamoDB) are within the AWS free tier during development.`,
            sources: ['Budget']
        };
    }

    if (q.includes('team') || q.includes('member') || q.includes('who') || q.includes('developer') || q.includes('built')) {
        return {
            answer: `SmartIV is a 3rd-Year Project by students of the Department of Computer Engineering, Faculty of Engineering, University of Peradeniya (E21 batch).\n\nThe team is responsible for end-to-end design and development spanning hardware electronics, embedded firmware (ESP32), desktop software (Tauri + React), mobile app (React Native), and cloud infrastructure (AWS IoT).\n\nPlease visit the Team section on the main page for individual profiles and contributions.`,
            sources: ['Team']
        };
    }

    if (q.includes('mobile') || q.includes('app') || q.includes('alert') || q.includes('notification') || q.includes('phone')) {
        return {
            answer: `The SmartIV mobile app is built with **React Native** and runs on both iOS and Android.\n\nWhen a drip event is detected (low bag, stopped flow, abnormal rate), the ESP32 publishes an MQTT message to AWS IoT Core → AWS Lambda triggers a push notification via FCM/APNs to the nurse's device.\n\nThe app features:\n• Real-time patient list with current flow rate and estimated time remaining.\n• Push notifications for critical alerts (< 3-second latency validated in testing).\n• Alert acknowledgement with audit trail.\n• Patient and session history with flow-rate graphs.\n• Role-based access (nurse / ward sister / admin).`,
            sources: ['Software', 'Testing']
        };
    }

    if (q.includes('software') || q.includes('desktop') || q.includes('tauri') || q.includes('react')) {
        return {
            answer: `SmartIV's software stack:\n\n• **React Native** — cross-platform mobile app (iOS & Android).\n• **React 18 + Vite** — desktop dashboard frontend.\n• **Tauri (Rust)** — native desktop backend, handling USB-dongle serial communication and local SQLite storage.\n• **AWS IoT Core** — cloud MQTT broker and device gateway.\n• **SQLite (sqlx)** — local patient session database.\n• **MQTT** — lightweight IoT messaging between edge devices and cloud.\n\nThe desktop app gives ward staff a live overview of all patients with flow graphs, while the mobile app keeps nurses notified at the bedside.`,
            sources: ['Software']
        };
    }

    if (q.includes('testing') || q.includes('test') || q.includes('validat') || q.includes('accuracy')) {
        return {
            answer: `SmartIV undergoes rigorous multi-layer testing:\n\n**Hardware:** Drop sensor accuracy against known flow rates ✓, stepper motor precision ✓, Wi-Fi/MQTT reliability ✓. Battery life and environmental (temperature/humidity) testing are in progress.\n\n**Software:** Unit tests for all API endpoints ✓, full integration test (hardware → MQTT → backend → app) ✓, alert delivery latency validated at < 3 seconds ✓. Load testing (20+ devices) and hospital-based user acceptance testing are planned.\n\nAll validated items have been confirmed against real IV drip setups in lab conditions.`,
            sources: ['Testing']
        };
    }

    // Default / fallback
    return {
        answer: `Thanks for your question about SmartIV! I'm a frontend demo version and can answer questions about:\n\n• The **problem** SmartIV addresses\n• **Hardware** components and sensors\n• **System architecture** and cloud infrastructure\n• **Software** — mobile app, desktop, and tech stack\n• **Budget** breakdown\n• **Team** members\n• **Testing** and validation results\n• **Mobile app** alerts and notifications\n\nTry one of the suggestion chips below, or rephrase your question using one of the topics above.`,
        sources: []
    };
}

/* =====================================================================
   SECTION 2 — UI STATE
   ===================================================================== */

let conversationStarted = false;
const messages = []; // { role: 'user'|'bot', content, sources }

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* =====================================================================
   SECTION 3 — DOM HELPERS
   ===================================================================== */

function getEl(id) { return document.getElementById(id); }

function renderUserBubble(text) {
    const container = getEl('cb-conv');
    const msg = document.createElement('div');
    msg.className = 'cb-msg user-msg';
    msg.innerHTML = `
        <div class="cb-msg-avatar"><i class="fas fa-user"></i></div>
        <div class="cb-msg-bubble">${escapeHtml(text)}</div>`;
    container.appendChild(msg);
    scrollToBottom();
}

function renderTyping() {
    const container = getEl('cb-conv');
    const wrap = document.createElement('div');
    wrap.className = 'cb-msg bot-msg';
    wrap.id = 'cb-typing-indicator';
    wrap.innerHTML = `
        <div class="cb-msg-avatar"><i class="fas fa-droplet"></i></div>
        <div class="cb-typing">
            <div class="cb-typing-dot"></div>
            <div class="cb-typing-dot"></div>
            <div class="cb-typing-dot"></div>
        </div>`;
    container.appendChild(wrap);
    scrollToBottom();
    return wrap;
}

function removeTyping() {
    const el = getEl('cb-typing-indicator');
    if (el) el.remove();
}

function renderBotBubble(answer, sources) {
    const container = getEl('cb-conv');
    const msg = document.createElement('div');
    msg.className = 'cb-msg bot-msg';

    // Format answer: bold markdown (**text**) and newlines
    const formatted = formatAnswer(answer);

    let sourcesHtml = '';
    if (sources && sources.length) {
        const chips = sources.map(s =>
            `<a href="index.html#${slugify(s)}" class="cb-source-tag" title="Go to ${s} section">
                <i class="fas fa-link"></i>${s}
             </a>`
        ).join('');
        sourcesHtml = `<div class="cb-sources">${chips}</div>`;
    }

    msg.innerHTML = `
        <div class="cb-msg-avatar"><i class="fas fa-droplet"></i></div>
        <div class="cb-msg-bubble">${formatted}${sourcesHtml}</div>`;
    container.appendChild(msg);
    scrollToBottom();
}

function formatAnswer(text) {
    // Escape HTML first (safety)
    let safe = escapeHtml(text);
    // Restore intentional line breaks
    safe = safe.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
    // Bold: **text**
    safe = safe.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Bullet points: • item
    safe = safe.replace(/(^|<br>)(•\s+)/g, '$1<span style="color:var(--accent)">•</span> ');
    return `<p>${safe}</p>`;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function slugify(str) {
    // Map source names to section IDs in index.html
    const map = {
        'Problem Statement': 'problem',
        'Problem':           'problem',
        'Project Overview':  'hero',
        'Hardware':          'hardware',
        'Architecture':      'architecture',
        'Software':          'software',
        'Testing':           'testing',
        'Budget':            'budget',
        'Team':              'team',
        'Gallery':           'gallery',
        'Download':          'download',
    };
    return map[str] || str.toLowerCase().replace(/\s+/g, '-');
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

/* =====================================================================
   SECTION 4 — CONVERSATION FLOW
   ===================================================================== */

async function submitQuestion(question) {
    question = question.trim();
    if (!question) return;

    // Switch from landing to conversation view on first message
    if (!conversationStarted) {
        conversationStarted = true;
        getEl('cb-landing').style.display = 'none';
        getEl('cb-conv').classList.add('active');
        getEl('cb-bottom-input-bar').classList.add('active');
    }

    // Disable inputs while waiting
    setInputDisabled(true);

    // Render user message
    renderUserBubble(question);
    clearInput();

    // Show typing indicator
    renderTyping();

    try {
        const { answer, sources } = await sendQuestionToBackend(question);
        removeTyping();
        renderBotBubble(answer, sources);
        messages.push({ role: 'bot', content: answer, sources });
    } catch (err) {
        removeTyping();
        renderBotBubble(
            'Sorry, something went wrong. The SmartIV assistant is not yet connected to a live backend. This is a frontend demo. Please try again later.',
            []
        );
    }

    setInputDisabled(false);
    focusInput();
}

function setInputDisabled(disabled) {
    ['cb-main-input', 'cb-bottom-field'].forEach(id => {
        const el = getEl(id);
        if (el) el.disabled = disabled;
    });
    ['cb-main-send', 'cb-bottom-send'].forEach(id => {
        const el = getEl(id);
        if (el) el.disabled = disabled;
    });
}

function clearInput() {
    ['cb-main-input', 'cb-bottom-field'].forEach(id => {
        const el = getEl(id);
        if (el) el.value = '';
    });
}

function focusInput() {
    const el = getEl('cb-bottom-field') || getEl('cb-main-input');
    if (el) el.focus();
}

/* =====================================================================
   SECTION 5 — EVENT WIRING
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    // ── Main landing input ──
    const mainInput = getEl('cb-main-input');
    const mainSend  = getEl('cb-main-send');

    if (mainInput) {
        mainInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitQuestion(mainInput.value);
            }
        });
    }
    if (mainSend) {
        mainSend.addEventListener('click', () => submitQuestion(mainInput.value));
    }

    // ── Bottom sticky input (conversation mode) ──
    const bottomField = getEl('cb-bottom-field');
    const bottomSend  = getEl('cb-bottom-send');

    if (bottomField) {
        bottomField.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitQuestion(bottomField.value);
            }
        });
    }
    if (bottomSend) {
        bottomSend.addEventListener('click', () => submitQuestion(bottomField.value));
    }

    // ── Suggestion chips ──
    document.querySelectorAll('.cb-chip[data-question]').forEach(chip => {
        chip.addEventListener('click', () => {
            submitQuestion(chip.dataset.question);
        });
    });

    // ── Navbar scroll ──
    const cbNav = getEl('cb-navbar');
    if (cbNav) {
        window.addEventListener('scroll', () => {
            cbNav.classList.toggle('scrolled', window.scrollY > 60);
            const st = getEl('cb-scrolltop');
            if (st) st.classList.toggle('show', window.scrollY > 400);
        });
    }

    // ── Scroll-to-top ──
    const scrollTopBtn = getEl('cb-scrolltop');
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', () =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
        );
    }

    // ── Mobile nav ──
    const hamburger     = getEl('cb-hamburger');
    const mobileNav     = getEl('cb-mobile-nav');
    const mobileOverlay = getEl('cb-mobile-overlay');
    const mobileClose   = getEl('cb-mobile-close');

    if (hamburger) hamburger.addEventListener('click', openMobileMenu);
    if (mobileClose) mobileClose.addEventListener('click', closeMobileMenu);
    if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

    function openMobileMenu() {
        mobileNav?.classList.add('open');
        mobileOverlay?.classList.add('open');
    }
    function closeMobileMenu() {
        mobileNav?.classList.remove('open');
        mobileOverlay?.classList.remove('open');
    }

    // Auto-focus main input on load
    if (mainInput) mainInput.focus();
});
