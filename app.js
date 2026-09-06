// =========================================================
// 1. SECURE API CORE & ENDPOINTS
// =========================================================
// =========================================================
// 1. SECURE API CORE & ENDPOINTS (UPDATED)
// =========================================================
const API_BASE = "/api";

const API = {
    intel: `${API_BASE}/index?action=intel`,
    layers: `${API_BASE}/index?action=layers`,
    layer: `${API_BASE}/index?action=layer`,
    news: `${API_BASE}/index?action=news`,
    dossier: `${API_BASE}/index?action=dossier`,
    geospatial: `${API_BASE}/index?action=geospatial`,

    likes: `${API_BASE}/index?action=likes`,
    like: `${API_BASE}/index?action=like`,
    comments: `${API_BASE}/index?action=comments`,
    comment: `${API_BASE}/index?action=comment`,

    authLogin: `${API_BASE}/index?action=login`,
    authSignup: `${API_BASE}/index?action=signup`,
    authGoogle: `${API_BASE}/index?action=google`,
    authMe: `${API_BASE}/index?action=me`,

    languages: `${API_BASE}/index?action=languages`,
    translate: `${API_BASE}/index?action=translate`,

    uplink: `${API_BASE}/uplink`
};

// =========================================================
// SETTINGS & TRANSLATION ENGINE
// =========================================================
let currentLanguage = localStorage.getItem('vs_lang') || 'en';
let activeTranslations = {};

window.toggleSettingsMenu = function() {
    const settingsDropdown = document.getElementById('settings-dropdown');
    const layersDropdown = document.getElementById('layers-dropdown');
    const profileDropdown = document.getElementById('profile-dropdown');

    if (settingsDropdown) {
        settingsDropdown.classList.toggle('hidden');
        if (layersDropdown) layersDropdown.classList.add('hidden');
        if (profileDropdown) profileDropdown.classList.add('hidden');
    }
};

window.applyPerformanceSetting = function(mode) {
    if (!viewer) return;
    
    if (mode === 'high') {
        viewer.resolutionScale = 0.75;
        viewer.scene.globe.maximumScreenSpaceError = 3.0;
        if (viewer.scene.postProcessStages?.fxaa) viewer.scene.postProcessStages.fxaa.enabled = false;
        showNotification("Performance: High Speed Activated", "info");
    } else if (mode === 'quality') {
        viewer.resolutionScale = 1.25;
        viewer.scene.globe.maximumScreenSpaceError = 1.0;
        if (viewer.scene.postProcessStages?.fxaa) viewer.scene.postProcessStages.fxaa.enabled = true;
        showNotification("Performance: Ultra Visual Quality", "info");
    } else { // Balanced
        viewer.resolutionScale = 1.0;
        viewer.scene.globe.maximumScreenSpaceError = 1.5;
        if (viewer.scene.postProcessStages?.fxaa) viewer.scene.postProcessStages.fxaa.enabled = true;
        showNotification("Performance: Balanced Mode", "info");
    }
    
    localStorage.setItem('vs_perf_mode', mode);
    viewer.scene.requestRender();
};

window.applyGlobeSizeSetting = function(size) {
    if (!viewer) return;
    const mapPane = document.getElementById('map-pane');

    if (size === 'small') {
        viewer.resolutionScale = 0.75;
        viewer.scene.globe.tileCacheSize = 10;
        showNotification("Globe Size: Small / Low Memory", "info");
    } else { // Large
        viewer.resolutionScale = 1.0;
        viewer.scene.globe.tileCacheSize = 50;
        showNotification("Globe Size: Large / High Resolution", "info");
    }

    localStorage.setItem('vs_globe_size', size);
    viewer.scene.requestRender();
};

async function loadAPILanguages() {
    const langSelect = document.getElementById('setting-language');
    if (!langSelect) return;

    try {
        const response = await apiFetch(API.languages);
        const languages = response.data || [
            { code: 'en', name: 'English (US)' },
            { code: 'es', name: 'Español' },
            { code: 'fr', name: 'Français' },
            { code: 'de', name: 'Deutsch' },
            { code: 'my', name: 'မြန်မာ (Myanmar)' },
            { code: 'zh', name: '中文 (Chinese)' }
        ];

        langSelect.innerHTML = languages.map(l => 
            `<option value="${l.code}" ${l.code === currentLanguage ? 'selected' : ''}>${l.name}</option>`
        ).join('');

    } catch (err) {
        console.warn("Language API offline, utilizing default locales.", err);
    }
}

// =========================================================
// UPGRADED TRANSLATION ENGINE & OBSERVER
// =========================================================
window.originalDict = window.originalDict || {};

window.changeLanguage = async function(langCode) {
    currentLanguage = langCode;
    localStorage.setItem('vs_lang', langCode);

    if (langCode === 'en') {
        location.reload(); 
        return;
    }

    try {
        showNotification("Initializing translation matrix...", "info");
        
        const textPayload = {};
        
        // Capture original English strings to prevent degradation when swapping languages multiple times
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (!window.originalDict[key]) {
                window.originalDict[key] = element.innerText;
            }
            textPayload[key] = window.originalDict[key];
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (!window.originalDict[key]) {
                window.originalDict[key] = element.placeholder;
            }
            textPayload[key] = window.originalDict[key];
        });

        // Pass payload and explicitly set target language
        const response = await apiFetch(API.translate, {
            method: 'POST',
            body: JSON.stringify({ 
                text: textPayload,
                target: langCode 
            })
        });
        
        if (!response.data) throw new Error("Empty translation payload.");

        activeTranslations = response.data;
        applyTranslationsToDOM(activeTranslations);
        
        // Engage Dynamic Stream Translator
        observeDynamicContent(langCode);

        showNotification("Interface translated.", "success");
    } catch (err) {
        console.error("Translation stream error:", err);
        showNotification("Translation degraded. Forcing secure sync...", "warning");
        // Failsafe: Automatically refresh the page to apply the language if dynamic fetch fails
        setTimeout(() => location.reload(), 1200); 
    }
};

let translationObserver = null;

function observeDynamicContent(langCode) {
    if (translationObserver) translationObserver.disconnect();
    
    // Target the main dynamic feed containers
    const targetNodes = [
        document.getElementById('news-feed-content'), 
        document.getElementById('sector-content-container')
    ].filter(Boolean);

    if (targetNodes.length === 0) return;

    translationObserver = new MutationObserver(async (mutations) => {
        let dynamicPayload = {};
        let elementMap = new Map();

        mutations.forEach(mutation => {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { 
                        // Target raw text elements injected into the stream
                        const textElements = node.querySelectorAll('strong, p, .news-source, .sector-insight, .faction-name, h4, .news-time');
                        textElements.forEach(el => {
                            if (!el.hasAttribute('data-i18n') && !el.hasAttribute('data-i18n-dyn') && el.innerText.trim().length > 0) {
                                const tempId = 'dyn_' + Math.random().toString(36).substr(2, 9);
                                el.setAttribute('data-i18n-dyn', tempId);
                                dynamicPayload[tempId] = el.innerText.trim();
                                elementMap.set(tempId, el);
                            }
                        });
                    }
                });
            }
        });

        if (Object.keys(dynamicPayload).length > 0) {
            try {
                const response = await apiFetch(API.translate, {
                    method: 'POST',
                    body: JSON.stringify({ text: dynamicPayload, target: langCode })
                });
                
                const translated = response.data || {};
                for (const [id, newText] of Object.entries(translated)) {
                    if (elementMap.has(id) && newText) {
                        elementMap.get(id).innerText = newText;
                    }
                }
            } catch (e) {
                console.warn("Dynamic translation packet dropped.", e);
            }
        }
    });

    targetNodes.forEach(node => {
        translationObserver.observe(node, { childList: true, subtree: true });
    });
}

function applyTranslationsToDOM(dictionary) {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (dictionary[key]) {
            element.innerText = dictionary[key];
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        if (dictionary[key]) {
            element.placeholder = dictionary[key];
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadAPILanguages();

    const savedPerf = localStorage.getItem('vs_perf_mode');
    if (savedPerf) {
        document.getElementById('setting-performance').value = savedPerf;
        applyPerformanceSetting(savedPerf);
    }

    const savedSize = localStorage.getItem('vs_globe_size');
    if (savedSize) {
        document.getElementById('setting-globe-size').value = savedSize;
        applyGlobeSizeSetting(savedSize);
    }

    if (currentLanguage && currentLanguage !== 'en') {
        changeLanguage(currentLanguage);
    }
});

function getStoredSession() {
    try {
        const raw = localStorage.getItem("vs_session");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function storeSession(session) {
    if (!session) {
        localStorage.removeItem("vs_session");
        return;
    }
    localStorage.setItem("vs_session", JSON.stringify(session));
}

function getAccessToken() {
    const session = getStoredSession();
    return session?.access_token || null;
}

async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");

    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const token = getAccessToken();
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, { ...options, headers });
    let payload;

    try {
        payload = await response.json();
    } catch {
        payload = { success: false, error: "Invalid API response." };
    }

    if (!response.ok || payload.success === false) {
        throw new Error(payload.error || `API request failed (${response.status})`);
    }

    return payload;
}

// =========================================================
// 2. GLOBAL AUTHENTICATION STATE
// =========================================================
let activeUser = null;
let activeSession = null;

// =========================================================
// 2. GLOBAL AUTHENTICATION STATE (UPGRADED)
// =========================================================
async function initializeAuthState() {
    try {
        // 1. Catch Google Auth Redirect tokens from the URL Hash
        if (window.location.hash.includes('access_token')) {
            const params = new URLSearchParams(window.location.hash.substring(1));
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            
            if (access_token) {
                storeSession({ access_token, refresh_token, user: { email: "Operator" } });
                window.history.replaceState(null, null, window.location.pathname + window.location.search);
            }
        }

        // 2. Optimistic Session Load (Prevents tab-reload wipe)
        const storedSession = getStoredSession();
        if (!storedSession?.access_token) {
            activeSession = null;
            activeUser = null;
            updateAuthUI(null);
            return;
        }

        // Apply UI immediately based on local storage cache
        activeSession = storedSession;
        activeUser = storedSession.user || { email: "Authenticated Operator" };
        updateAuthUI(activeUser);

        // 3. Validate quietly in the background
        const payload = await apiFetch(API.authMe);
        
        // Merge verified user data back into session cache
        if (payload.user) {
            activeUser = payload.user;
            storedSession.user = payload.user;
            storeSession(storedSession);
            updateAuthUI(activeUser);
        }

    } catch (error) {
        console.warn("SYSTEM: Background session validation dropped.", error);
        
        // Only trigger a hard disconnect if explicitly unauthorized
        if (error.message && error.message.includes("401")) {
            activeSession = null;
            activeUser = null;
            storeSession(null);
            updateAuthUI(null);
        }
    }
}

function updateAuthUI(user) {
    const statusText = document.getElementById('profile-status-text');
    const userEmail = document.getElementById('profile-user-email');
    const dropdown = document.getElementById('profile-dropdown');

    if (user) {
        statusText.innerText = user.email ? user.email.split('@')[0] : "Operator";
        if (userEmail) userEmail.innerText = user.email || "Authenticated";
    } else {
        statusText.innerText = "Sign In";
        if (dropdown) dropdown.classList.add('hidden');
    }
}

window.handleProfileClick = function() {
    if (!activeUser) {
        toggleAuthModal(true);
    } else {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.classList.toggle('hidden');
    }
};

window.toggleAuthModal = function(show) {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    show ? modal.classList.remove('hidden') : modal.classList.add('hidden');
};

window.handleGoogleLogin = async function() {
    try {
        const payload = await apiFetch(API.authGoogle);
        if (!payload.url) throw new Error("AUTH_PROVIDER_URL_MISSING");
        window.location.href = payload.url;
    } catch (error) {
        showNotification("Authentication uplink failed.", 'error');
    }
};

// Add 'event' parameter to prevent page reloads
window.handleLogIn = async function(event) {
    if (event) event.preventDefault(); // Stop the page from refreshing

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try {
        const res = await apiFetch(API.authLogin, {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        // Failsafe: Check if Supabase blocked login due to unverified email
        if (!res.session) {
            alert("Login requires email verification. Please check your inbox.");
            return;
        }

        storeSession(res.session);
        await initializeAuthState();
        toggleAuthModal(false);
        showNotification("Access granted.", "success");
    } catch (error) {
        alert(error.message);
    }
};

window.handleSignUp = async function(event) {
    if (event) event.preventDefault(); // Stop the page from refreshing

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try {
        await apiFetch(API.authSignup, {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        alert("Sign-up successful! Please check your email to verify your account.");
        toggleAuthModal(false);
    } catch (error) {
        alert(error.message);
    }
};

window.handleLogOut = async function() {
    try {
        storeSession(null);
        activeSession = null;
        activeUser = null;
        updateAuthUI(null);
        showNotification("Operator disconnected.", "success");
    } catch (error) {
        showNotification("Logout sequence failed.", "error");
    }
};

// =========================================================
// 3. NOTIFICATION ENGINE
// =========================================================
window.showNotification = function(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
};

// =========================================================
// 4. DYNAMIC MULTI-TILE RESIZING ENGINE
// =========================================================
const sidePane = document.getElementById('side-pane');
const hResizer = document.getElementById('h-resizer');
const mapPane = document.getElementById('map-pane'); 
let isResizingH = false;
let activeVResizer = null;

if (hResizer) {
    hResizer.addEventListener('mousedown', (e) => { 
        isResizingH = true; 
        document.body.style.cursor = 'col-resize';
        if (mapPane) mapPane.style.pointerEvents = 'none'; 
        e.preventDefault(); 
    });
}

document.querySelectorAll('.v-resizer').forEach(resizer => {
    resizer.addEventListener('mousedown', (e) => {
        activeVResizer = e.target;
        document.body.style.cursor = 'row-resize';
        if (mapPane) mapPane.style.pointerEvents = 'none'; 
        e.preventDefault();
    });
});

document.addEventListener('mousemove', (e) => {
    if (isResizingH) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 260 && newWidth < window.innerWidth * 0.7) {
            sidePane.style.width = `${newWidth}px`;
        }
    }
    
    if (activeVResizer) {
        const prevTile = activeVResizer.previousElementSibling;
        if (prevTile && prevTile.classList.contains('tile')) {
            const prevRect = prevTile.getBoundingClientRect();
            const newHeight = e.clientY - prevRect.top;
            
            if (newHeight > 100) {
                prevTile.style.flex = `0 0 ${newHeight}px`;
            }
        }
    }
});

document.addEventListener('mouseup', () => { 
    if (isResizingH || activeVResizer) {
        isResizingH = false; 
        activeVResizer = null; 
        document.body.style.cursor = 'default';
        if (mapPane) mapPane.style.pointerEvents = 'auto'; 
    }
});

// =========================================================
// 5. MAP INITIALIZATION & 3D ENGINE
// =========================================================
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjOWMxZGY0NC0wZjc0LTQ0Y2YtYjhiYS05ZTQwMDJmNWQ5ZmQiLCJpZCI6NDA0MzM5LCJpYXQiOjE3NzM2NDI1MjJ9.65fXm6Lp7o8ni0DqENdaAjFUSJkPWyQbpq0X3VRUY4Q';

const isMobileDevice = window.innerWidth < 850;
const MAP_TRANSITION_ALTITUDE = 8000;
let photorealisticCityModel; 

const viewer = new Cesium.Viewer('map-pane', {
    baseLayer: Cesium.ImageryLayer.fromWorldImagery({
        style: Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS
    }),
    shadows: false,
    terrainShadows: Cesium.ShadowMode.DISABLED,
    automaticallyTrackDataSourceClocks: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    fullscreenButton: false,
    shouldAnimate: true, 
    requestRenderMode: true, 
    maximumRenderTimeChange: Number.POSITIVE_INFINITY, 
    contextOptions: {
        webgl: { 
            powerPreference: "high-performance", 
            antialias: true, 
            failIfMajorPerformanceCaveat: false
        }
    }
});

function configureCameraPhysics() {
    const cameraParams = viewer.scene.screenSpaceCameraController;
    cameraParams.inertiaSpin = 0.9;
    cameraParams.inertiaTranslate = 0.9;
    cameraParams.inertiaZoom = 0.75;
    cameraParams.maximumMovementRatio = 0.25; 
    cameraParams.bounceAnimationTime = 0.2; 
    if (isMobileDevice) {
        cameraParams.enableTilt = false; 
    }
}

function optimizeRenderingQuality() {
    viewer.resolutionScale = 1.0; 
    viewer.scene.globe.maximumScreenSpaceError = isMobileDevice ? 2.5 : 1.5; 
    viewer.scene.globe.tileCacheSize = isMobileDevice ? 15 : 50; 
    viewer.scene.globe.loadingQueueThreshold = 3; 
    viewer.scene.globe.enableLighting = false; 
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.fog.enabled = false;
    
    if (viewer.scene.postProcessStages && viewer.scene.postProcessStages.fxaa) {
        viewer.scene.postProcessStages.fxaa.enabled = true; 
    }

    const baseImageryLayer = viewer.imageryLayers.get(0);
    if (baseImageryLayer) {
        baseImageryLayer.saturation = 0.0;
        baseImageryLayer.contrast = 1.2;   
        baseImageryLayer.brightness = 0.8; 
    }
    
    viewer.scene.globe.ambientLightColor = new Cesium.Color(0.05, 0.05, 0.1, 1.0);
    viewer.scene.postProcessStages.bloom.enabled = false;
}

async function mountPhotorealisticModels() {
    try {
        photorealisticCityModel = await Cesium.createGooglePhotorealistic3DTileset();

        photorealisticCityModel.customShader = new Cesium.CustomShader({
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    vec3 rgb = material.diffuse;
                    float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
                    material.diffuse = vec3(luma);
                }
            `
        });

        const memoryLimitMB = isMobileDevice ? 128 : 512; 
        const totalCacheBytes = memoryLimitMB * 1024 * 1024;
        
        photorealisticCityModel.cacheBytes = totalCacheBytes;
        photorealisticCityModel.gpuMemoryLimit = totalCacheBytes;
        photorealisticCityModel.maximumScreenSpaceError = isMobileDevice ? 24 : 16; 
        photorealisticCityModel.trimBehindViewer = true;
        photorealisticCityModel.skipLevelOfDetail = true;
        photorealisticCityModel.show = false; 

        viewer.scene.primitives.add(photorealisticCityModel);
        viewer.camera.moveEnd.addEventListener(handleAltitudeTransition);
        
    } catch (error) { 
        console.error("Failed to mount 3D Photorealistic Models:", error); 
    }
}

function handleAltitudeTransition() {
    if (!photorealisticCityModel) return;

    const currentAltitude = viewer.camera.positionCartographic.height;
    const isHighAltitude = currentAltitude > MAP_TRANSITION_ALTITUDE;

    if (isHighAltitude && !viewer.scene.globe.show) {
        viewer.scene.globe.show = true;
        photorealisticCityModel.show = false;
    } else if (!isHighAltitude && viewer.scene.globe.show) {
        viewer.scene.globe.show = false;
        photorealisticCityModel.show = true;
    }
    
    viewer.scene.requestRender(); 
}

function launchApplication() {
    configureCameraPhysics();
    optimizeRenderingQuality();

    viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
    viewer.clock.multiplier = 1.0;

    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(96.1292, 16.8661, 22000000),
        orientation: { pitch: Cesium.Math.toRadians(-90.0), heading: 0.0, roll: 0.0 }
    });

    const delayTimeMS = isMobileDevice ? 3000 : 500;
    setTimeout(async () => {
        await mountPhotorealisticModels();
        viewer.scene.requestRender();
    }, delayTimeMS);
}

launchApplication();

// =========================================================
// 6. THE GRAPHICS ENGINE (PULSE ORBS)
// =========================================================
const TextureForge = {
    createPulse: function (hexColor, r, g, b) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(32, 32, 28, 0, Math.PI * 2);
        ctx.stroke();

        const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 18);
        gradient.addColorStop(0, `rgba(255, 255, 255, 1)`); 
        gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.9)`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath(); 
        ctx.arc(32, 32, 18, 0, Math.PI * 2); 
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 255, 255, 0.9)`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(32, 4); ctx.lineTo(32, 12);   
        ctx.moveTo(32, 60); ctx.lineTo(32, 52);  
        ctx.moveTo(4, 32); ctx.lineTo(12, 32);   
        ctx.moveTo(60, 32); ctx.lineTo(52, 32);  
        ctx.stroke();

        return canvas;
    },
    init: function () {
        this.RED = this.createPulse('#ff3c3c', 255, 60, 60);       
        this.YELLOW = this.createPulse('#ffea00', 255, 234, 0);    
        this.GREEN = this.createPulse('#00ff66', 0, 255, 102);     
        this.WHITE = this.createPulse('#ffffff', 255, 255, 255);   
    }
};
TextureForge.init();

// =========================================================
// 7. SECURE INTEL STREAM DATA FETCHING
// =========================================================
async function pullVisionSphereIntel() {
    try {
        console.log(`🛰️ [DOWNLINK] Fetching fresh stream via Secure API...`);
        
        const urlParams = new URLSearchParams(window.location.search);
        const rawTargetId = urlParams.get('targetNode') || urlParams.get('node');
        
        const endpoint = rawTargetId 
            ? `${API.intel}&node=${encodeURIComponent(rawTargetId)}` 
            : API.intel;

        const payload = await apiFetch(endpoint);
        const rows = payload.data || [];

        if (rows.length > 0) {
            const optimizedFeatures = rows.map(row => ({ properties: row }));
            plotIntelDots(optimizedFeatures);
            window.updateNewsTicker(optimizedFeatures);
        } else {
            const feedEl = document.getElementById('news-feed-content');
            if (feedEl) feedEl.innerHTML = '<div class="layer-status-text">No active intel nodes recorded.</div>';
        }
        
        if (rawTargetId) {
            setTimeout(() => {
                glideToLocation(rawTargetId);
            }, 1200); 
        }

    } catch (err) {
        console.error("🚫 [STREAM_FATAL]", err.message);
        showNotification("Intelligence stream unavailable.", "error");
    }
}

function plotIntelDots(intelData, clearExisting = true) {
    viewer.entities.suspendEvents();
    
    if (clearExisting) {
        viewer.entities.removeAll();
    }

    intelData.forEach(item => {
        const props = item.properties || item;
        const lon = parseFloat(props.longitude);
        const lat = parseFloat(props.latitude);

        if (isNaN(lon) || isNaN(lat) || (lon === 0 && lat === 0)) return;

        const intensity = (props.intensity || "LOW").toUpperCase();
        
        let activeTexture = TextureForge.GREEN; 
        if (intensity === "HIGH" || intensity === "CRITICAL" || intensity.includes("HIGH")) {
            activeTexture = TextureForge.RED;
        } else if (intensity === "MED" || intensity === "MEDIUM" || intensity.includes("MED") || intensity.includes("MID")) {
            activeTexture = TextureForge.YELLOW;
        } else if (intensity === "LOW" || intensity.includes("LOW")) {
            activeTexture = TextureForge.GREEN;
        }

        viewer.entities.add({
            id: String(props.id),
            name: props.title,
            position: Cesium.Cartesian3.fromDegrees(lon, lat),
            billboard: {
                image: activeTexture,
                width: 32, 
                height: 32,
                scale: 0.85,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                disableDepthTestDistance: 0
            },
            customData: props
        });
    });

    viewer.entities.resumeEvents();
    viewer.scene.requestRender();
}

window.updateNewsTicker = function(intelData) {
    const feed = document.getElementById('news-feed-content');
    if (!feed) return;

    feed.innerHTML = intelData.map(item => {
        const props = item.properties || item;
        const intensity = (props.intensity || "LOW").toUpperCase();
        
        let badgeClass = "badge-low";
        if (intensity.includes("HIGH") || intensity === "CRITICAL") badgeClass = "badge-high";
        else if (intensity.includes("MED") || intensity.includes("MID")) badgeClass = "badge-med";

        const timeStr = props.created_at 
            ? new Date(props.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            : '';

        return `
            <div class="news-item" onclick="glideToLocation('${props.id}')">
                <div class="news-item-header">
                    <span class="intensity-badge ${badgeClass}">${intensity}</span>
                    <span class="news-time">${timeStr}</span>
                </div>
                <strong>${props.title || 'Intel Event'}</strong>
                <div class="news-item-footer">
                    <span>📍 ${props.location_name || 'Global'}</span>
                    ${props.source ? `<span class="news-source">${props.source}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
};

// =========================================================
// 8. MAP INTERACTION, GLIDE, COMMENTS & SHARE
// =========================================================
let activePostId = null;

viewer.screenSpaceEventHandler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (Cesium.defined(picked) && picked.id) {
        openPostDetails(picked.id);
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

function findEntityByIdOrSource(targetId) {
    if (!targetId) return null;
    const strTarget = String(targetId);

    let entity = viewer.entities.getById(strTarget);
    if (entity) return entity;

    const entities = viewer.entities.values;
    for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (e.customData) {
            if (String(e.customData.id) === strTarget || String(e.customData.source) === strTarget) {
                return e;
            }
        }
    }
    return null;
}

window.glideToLocation = function(passedId, altitude = 800000) {
    const targetId = passedId ? String(passedId) : (activePostId ? String(activePostId) : null);
    if (!targetId) return;

    const entity = findEntityByIdOrSource(targetId);
    if (!entity) return;

    const cartesian = entity.position.getValue(Cesium.JulianDate.now());
    if (!cartesian) return;

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);

    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
        orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-35),
            roll: 0.0
        },
        duration: 2.5,
        easingFunction: Cesium.EasingFunction.QUARTIC_IN_OUT,
        complete: () => openPostDetails(entity)
    });
};

window.share = function(passedId) {
    const node = passedId || activePostId;
    if (!node || node === "undefined") return alert("Select a location first.");

    const targetElement = window.event ? window.event.currentTarget : document.getElementById('share-btn');
    const shareURL = `${window.location.origin}/api/uplink?node=${encodeURIComponent(node)}`;

    navigator.clipboard.writeText(shareURL).then(() => {
        if (targetElement) {
            const defaultMarkup = targetElement.innerHTML;
            targetElement.innerHTML = 'Copied!';
            targetElement.classList.add('animate-success');
            
            setTimeout(() => {
                targetElement.innerHTML = defaultMarkup;
                targetElement.classList.remove('animate-success');
            }, 1200);
        }
    }).catch(err => {
        console.error("Failed to copy share link:", err);
    });
};

async function openPostDetails(entityOrId) {
    const entity = typeof entityOrId === 'string' ? viewer.entities.getById(entityOrId) : entityOrId;
    if (!entity) return;

    const data = entity.customData || {};
    activePostId = entity.id;

    const emptyState = document.getElementById('details-empty-state');
    const contentContainer = document.getElementById('details-content-container');
    if (emptyState) emptyState.classList.add('hidden');
    if (contentContainer) contentContainer.classList.remove('hidden');

    document.getElementById('post-title').innerText = data.title || "Selected Location";
    document.getElementById('post-context').innerText = data.context || data.description || "No description provided.";
    document.getElementById('post-location-name').innerText = data.location_name || "Global Coordinates";
    document.getElementById('post-source').innerText = data.source || "Intelligence Stream";

    const intensity = (data.intensity || "LOW").toUpperCase();
    const badgeEl = document.getElementById('post-intensity');
    badgeEl.innerText = intensity;
    badgeEl.className = 'intensity-badge ';
    if (intensity.includes("HIGH") || intensity === "CRITICAL") badgeEl.classList.add('badge-high');
    else if (intensity.includes("MED") || intensity.includes("MID")) badgeEl.classList.add('badge-med');
    else badgeEl.classList.add('badge-low');

    const timeEl = document.getElementById('post-time');
    timeEl.innerText = data.created_at ? new Date(data.created_at).toLocaleString() : "Just now";

    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    document.getElementById('post-lat').innerText = !isNaN(lat) ? `${lat.toFixed(4)}°` : "N/A";
    document.getElementById('post-lng').innerText = !isNaN(lng) ? `${lng.toFixed(4)}°` : "N/A";

    const mediaContainer = document.getElementById('post-media-container');
    const photoEl = document.getElementById('post-photo');
    const videoEl = document.getElementById('post-video');

    let hasMedia = false;
    if (data.photo_url) {
        photoEl.src = data.photo_url;
        photoEl.classList.remove('hidden');
        hasMedia = true;
    } else {
        photoEl.classList.add('hidden');
    }

    if (data.video_url) {
        videoEl.src = data.video_url;
        videoEl.classList.remove('hidden');
        hasMedia = true;
    } else {
        videoEl.classList.add('hidden');
    }

    if (hasMedia) {
        mediaContainer.classList.remove('hidden');
    } else {
        mediaContainer.classList.add('hidden');
    }

    await fetchLikesAndComments(activePostId);
}

async function fetchLikesAndComments(postId) {
    try {
        const likesRes = await apiFetch(`${API.likes}&node=${encodeURIComponent(postId)}`);
        const likeCountEl = document.getElementById('like-count');
        if (likeCountEl) likeCountEl.innerText = likesRes.data ? likesRes.data.length : 0;
        
        const commentsRes = await apiFetch(`${API.comments}&node=${encodeURIComponent(postId)}`);
        const comments = commentsRes.data || [];
        
        const commentsFeed = document.getElementById('comments-feed');
        if (commentsFeed) {
            if (comments.length > 0) {
                commentsFeed.innerHTML = comments.map(c => `
                    <div class="comment-item">
                        <div class="comment-header">
                            <strong style="color: var(--text-highlight);">Operator</strong>
                            <span class="comment-time">${c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                        <div class="comment-text">${c.comment_text}</div>
                    </div>
                `).join('');
            } else {
                commentsFeed.innerHTML = '<div class="layer-status-text">No active discussion on this node yet.</div>';
            }
        }
    } catch (e) {
        console.error("Error fetching discussion:", e);
    }
}

window.toggleLike = async function() {
    if (!activeUser) return toggleAuthModal(true);
    if (!activePostId) return alert("Select a location first.");
    try {
        await apiFetch(API.like, {
            method: 'POST',
            body: JSON.stringify({ intel_id: activePostId })
        });
        fetchLikesAndComments(activePostId);
    } catch (e) {
        showNotification("Failed to record engagement.", "error");
    }
};

window.sendComment = async function() {
    if (!activeUser) return toggleAuthModal(true);
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text || !activePostId) return;
    
    try {
        await apiFetch(API.comment, {
            method: 'POST',
            body: JSON.stringify({ intel_id: activePostId, comment_text: text })
        });
        input.value = '';
        fetchLikesAndComments(activePostId);
    } catch (e) {
        showNotification("Failed to broadcast comment.", "error");
    }
};

// =========================================================
// 9. GEO-INTELLIGENCE LAYER (GILU) SECURE VAULT
// =========================================================
window.activeIntelLayers = {}; 

window.toggleLayersMenu = function() {
    const dropdown = document.getElementById('layers-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
        const profileMenu = document.getElementById('profile-dropdown');
        if (profileMenu && !profileMenu.classList.contains('hidden')) {
            profileMenu.classList.add('hidden');
        }
    }
};

window.toggleIntelLayer = async function(fileKey, btnElement) {
    const isAttached = window.activeIntelLayers[fileKey];

    if (isAttached) {
        viewer.dataSources.remove(window.activeIntelLayers[fileKey]);
        delete window.activeIntelLayers[fileKey];
        
        btnElement.classList.remove('active');
        btnElement.innerHTML = `<span class="layer-icon">⚪</span> <span class="layer-name">${formatIntelName(fileKey)}</span>`;
        if (window.showNotification) showNotification(`Detached ${formatIntelName(fileKey)}`, "info");
        return;
    }
    
    try {
        btnElement.classList.add('loading');
        btnElement.innerHTML = `<span class="layer-icon spinner">⏳</span> <span class="layer-name">Decrypting...</span>`;
        
        const response = await apiFetch(`${API.layer}&key=${encodeURIComponent(fileKey)}`);
        const czmlPayload = response.data;
        
        if (!czmlPayload) throw new Error("Null payload received from vault.");
        
        const dataSource = await Cesium.CzmlDataSource.load(czmlPayload);
        window.activeIntelLayers[fileKey] = await viewer.dataSources.add(dataSource);
        
        btnElement.classList.remove('loading');
        btnElement.classList.add('active');
        btnElement.innerHTML = `<span class="layer-icon">✅</span> <span class="layer-name">${formatIntelName(fileKey)}</span>`;
        if (window.showNotification) showNotification(`Integrated ${formatIntelName(fileKey)}`, "success");
        
    } catch (error) {
        btnElement.classList.remove('loading');
        btnElement.classList.remove('active');
        btnElement.innerHTML = `<span class="layer-icon">⚠️</span> <span class="layer-name">Connection Failed</span>`;
        if (window.showNotification) showNotification(`Failed to stream layer data.`, "error");
    }
};

let activeCountryGeoJson = null;

window.toggleDossierWindow = function(show) {
    const dossierTile = document.getElementById('dossier-tile');
    const detailsTile = document.getElementById('details-tile');
    const vResizer2 = document.getElementById('v-resizer-2');
    const newsTile = document.getElementById('news-tile');
    
    if (!dossierTile) return;
    
    if (show) {
        dossierTile.classList.remove('hidden');
        if (vResizer2) vResizer2.classList.remove('hidden');
        
        if (detailsTile) {
            detailsTile.classList.remove('hidden');
            detailsTile.style.flex = '0 0 28%';
        }
        if (newsTile) newsTile.style.flex = '0 0 28%';
        dossierTile.style.flex = '1';
    } else {
        dossierTile.classList.add('hidden');
        if (vResizer2) vResizer2.classList.add('hidden');
        
        if (detailsTile) {
            detailsTile.classList.remove('hidden');
            detailsTile.style.flex = '1';
        }
        if (newsTile) newsTile.style.flex = '0 0 45%';
    }
};

function generateDossierChartSvg(dataArray, valueKey, labelKey, unitFormatter) {
    if (!dataArray || !Array.isArray(dataArray) || dataArray.length === 0) {
        return '<div class="layer-status-text">No trend data available</div>';
    }

    const values = dataArray.map(d => parseFloat(d[valueKey]) || 0);
    const minVal = Math.min(...values) * 0.85;
    const maxVal = Math.max(...values) * 1.05 || 1;

    const svgWidth = 320;
    const svgHeight = 110;
    const barSpacing = 2;
    const barWidth = Math.max(4, Math.floor((svgWidth - 20) / dataArray.length) - barSpacing);

    let barsHtml = '';
    dataArray.forEach((item, idx) => {
        const rawVal = parseFloat(item[valueKey]) || 0;
        const normalizedH = Math.max(4, ((rawVal - minVal) / (maxVal - minVal)) * (svgHeight - 35));
        const x = 10 + idx * (barWidth + barSpacing);
        const y = svgHeight - 20 - normalizedH;
        const formattedVal = unitFormatter ? unitFormatter(rawVal) : rawVal;

        barsHtml += `
            <g class="chart-bar-group">
                <rect x="${x}" y="${y}" width="${barWidth}" height="${normalizedH}" rx="2" class="chart-bar">
                    <title>${item[labelKey]}: ${formattedVal}</title>
                </rect>
                ${(idx % 3 === 0 || idx === dataArray.length - 1) ? 
                    `<text x="${x + barWidth / 2}" y="${svgHeight - 5}" class="chart-label">${item[labelKey]}</text>` : ''}
            </g>
        `;
    });

    return `<div class="chart-wrapper"><svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="dossier-chart-svg">${barsHtml}</svg></div>`;
}

window.switchDossierTab = function(tabName) {
    const windowPane = document.getElementById('dossier-tile'); 
    if (!windowPane) return;

    windowPane.querySelectorAll('.window-tab-btn').forEach(btn => btn.classList.remove('active'));
    windowPane.querySelectorAll('.window-tab-content').forEach(content => content.classList.remove('active'));

    const activeBtn = Array.from(windowPane.querySelectorAll('.window-tab-btn')).find(
        btn => btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(tabName)
    );
    if (activeBtn) activeBtn.classList.add('active');

    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) activeTab.classList.add('active');
};

// 1. Update this to format strings cleanly
function formatCountrySlug(countryName) {
    if (!countryName) return "";
    return countryName
        .replace(/\s*\(.*?\)\s*/g, '') // Strips alternative names like "(Burma)"
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '_');
}

// 2. Update this to force international standard English naming
async function reverseGeocodeCountry(lat, lon) {
    try {
        // Added &accept-language=en to force international standard names
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3&accept-language=en`);
        if (!response.ok) return null;
        const data = await response.json();
        
        let country = data.address ? (data.address.country || data.address.state || null) : null;
        
        // Clean up any remaining dual-names returned by OSM immediately
        if (country) {
            country = country.replace(/\s*\(.*?\)\s*/g, '').trim();
        }
        
        return country;
    } catch (err) {
        console.error("Reverse Geocoding error:", err);
        return null;
    }
}

async function fetchCountryDossier(countrySlug) {
    try {
        const response = await apiFetch(`${API.dossier}&slug=${encodeURIComponent(countrySlug)}`);
        return response.data;
    } catch (err) {
        console.log(`ℹ️ [DOSSIER] No dossier found for: ${countrySlug}`);
        return null;
    }
}

async function fetchCountryBoundaryPolygon(countryName) {
    try {
        const queryUrl = `https://nominatim.openstreetmap.org/search?country=${encodeURIComponent(countryName)}&polygon_geojson=1&format=json&limit=1`;
        const res = await fetch(queryUrl);
        if (!res.ok) return null;
        const data = await res.json();

        if (data && data.length > 0 && data[0].geojson) {
            return {
                type: "FeatureCollection",
                features: [{
                    type: "Feature",
                    geometry: data[0].geojson,
                    properties: { name: countryName }
                }]
            };
        }
    } catch (err) {
        console.error("Error fetching fallback green country polygon:", err);
    }
    return null;
}

async function loadCountryGeospatialConflictMap(countrySlug, countryName) {
    if (activeCountryGeoJson) {
        viewer.dataSources.remove(activeCountryGeoJson);
        activeCountryGeoJson = null;
    }

    try {
        let rawGeoJson = null;

        try {
            const response = await apiFetch(`${API.geospatial}&slug=${encodeURIComponent(countrySlug)}`);
            rawGeoJson = response.data;
        } catch (e) {
            console.warn("Geospatial fetch failed, falling back to green highlight");
        }

        if (rawGeoJson) {
            const dataSource = await Cesium.GeoJsonDataSource.load(rawGeoJson, {
                stroke: Cesium.Color.RED,
                fill: Cesium.Color.RED.withAlpha(0.2),
                strokeWidth: 2
            });
            activeCountryGeoJson = await viewer.dataSources.add(dataSource);
            if (window.showNotification) {
                showNotification(`Loaded geospatial conflict layer for ${countrySlug.toUpperCase()}`, "warning");
            }
        } else {
            const boundaryGeoJson = await fetchCountryBoundaryPolygon(countryName || countrySlug);
            if (boundaryGeoJson) {
                const dataSource = await Cesium.GeoJsonDataSource.load(boundaryGeoJson, {
                    stroke: Cesium.Color.LIME,
                    fill: Cesium.Color.GREEN.withAlpha(0.2),
                    strokeWidth: 2
                });
                activeCountryGeoJson = await viewer.dataSources.add(dataSource);
                if (window.showNotification) {
                    showNotification(`No conflict layer found. Highlighted ${countryName.toUpperCase()}`, "success");
                }
            }
        }
    } catch (err) {
        console.error("Geospatial conflict map load fault:", err);
    }
}

function renderCountryDossier(data) {
    if (!data) return;

    document.getElementById('dossier-country-name').innerText = (data.country || "UNKNOWN").toUpperCase();
    
    const statusBadge = document.getElementById('dossier-status-badge');
    statusBadge.innerText = (data.status || "STABLE").replace('_', ' ');
    statusBadge.className = `intensity-badge ${data.status === 'CIVIL_WAR' ? 'badge-high' : 'badge-med'}`;

    document.getElementById('dossier-last-updated').innerText = data.last_updated 
        ? new Date(data.last_updated).toLocaleDateString() 
        : "N/A";

    const flagEl = document.getElementById('dossier-flag');
    if (data.governance && data.governance.flag_url) {
        flagEl.src = data.governance.flag_url;
        flagEl.classList.remove('hidden');
    } else {
        flagEl.classList.add('hidden');
    }

    const gov = data.governance || {};
    document.getElementById('dossier-capital').innerText = gov.capital || "N/A";
    document.getElementById('dossier-system-type').innerText = gov.system_type || "N/A";
    
    const parEl = document.getElementById('dossier-parliament');
    if (parEl) parEl.innerText = gov.parliament_structure || "N/A";
    
    const legEl = document.getElementById('dossier-legal');
    if (legEl) legEl.innerText = gov.legal_system || "N/A";

    const leadershipContainer = document.getElementById('dossier-leadership-container');
    leadershipContainer.innerHTML = (gov.key_leadership || []).map(leader => `
        <div class="leadership-card">
            ${leader.photo_url ? `<img src="${leader.photo_url}" class="leadership-photo" />` : ''}
            <div class="leadership-info">
                <div class="leadership-header">
                    <strong>${leader.name}</strong>
                    ${leader.influence_score !== undefined ? `<span class="influence-badge">Inf: ${leader.influence_score}/10</span>` : ''}
                </div>
                <div class="leadership-title">${leader.title}</div>
                <p class="leadership-bio">${leader.bio_snippet || ''}</p>
            </div>
        </div>
    `).join('');

    const partyContainer = document.getElementById('dossier-party-container');
    if (partyContainer) {
        partyContainer.innerHTML = (gov.party_distribution || []).map(party => {
            const pct = party.total_seats ? Math.round((party.seats / party.total_seats) * 100) : 0;
            const members = (party.notable_members || []).join(', ');
            return `
                <div class="party-card">
                    <div class="party-header">
                        ${party.flag_url ? `<img src="${party.flag_url}" class="party-flag" />` : ''}
                        <strong>${party.name}</strong>
                        <span class="party-seats">${party.seats}/${party.total_seats} seats (${pct}%)</span>
                    </div>
                    <div class="seat-bar">
                        <div class="seat-progress" style="width: ${pct}%;"></div>
                    </div>
                    ${members ? `<div class="party-members"><strong>Members:</strong> ${members}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    const sanctionsList = document.getElementById('dossier-sanctions-list');
    sanctionsList.innerHTML = (gov.active_sanctions || []).map(s => `<li>${s}</li>`).join('');

    const econ = data.macro_economy || {};
    document.getElementById('dossier-inflation').innerText = econ.inflation_rate || "N/A";
    document.getElementById('dossier-debt').innerText = econ.debt_to_gdp || "N/A";
    
    const currEl = document.getElementById('dossier-currency-trend');
    if (currEl && econ.currency_trend && econ.currency_trend.length > 0) {
        const latestCurr = econ.currency_trend[0];
        currEl.innerText = `${latestCurr.value.toLocaleString()} ${latestCurr.unit} (${latestCurr.label})`;
    }

    const gdpChartContainer = document.getElementById('dossier-gdp-chart');
    if (gdpChartContainer) {
        gdpChartContainer.innerHTML = generateDossierChartSvg(
            econ.gdp_history, 'value', 'label', v => `$${(v / 1e9).toFixed(1)}B`
        );
    }

    const popChartContainer = document.getElementById('dossier-pop-chart');
    if (popChartContainer) {
        popChartContainer.innerHTML = generateDossierChartSvg(
            econ.population_history, 'value', 'label', v => `${(v / 1e6).toFixed(1)}M`
        );
    }

    document.getElementById('dossier-economic-status').innerText = econ.economic_status || "No economic status overview available.";
    document.getElementById('dossier-exports-list').innerHTML = (econ.primary_exports || []).map(e => `<li>${e}</li>`).join('');
    document.getElementById('dossier-partners-list').innerHTML = (econ.major_trading_partners || []).map(p => `<li>${p}</li>`).join('');

    const factionsContainer = document.getElementById('dossier-factions-container');
    if (factionsContainer) {
        const factions = data.active_factions;
        let factionsHtml = '';

        if (factions && typeof factions === 'object') {
            const factionList = Array.isArray(factions) ? factions : Object.values(factions);
            if (factionList.length > 0) {
                factionsHtml = factionList.map(faction => {
                    const name = faction.name || 'Unknown Faction';
                    const leader = faction.leader || 'Unknown Leader';
                    const manpower = faction.estimated_manpower || '--';
                    const tier = faction.weaponry_tier || '--';
                    const territory = faction.controlled_territory || 'No established territory';
                    const infScore = faction.influence_score !== undefined ? faction.influence_score : '-';
                    
                    const objectives = Array.isArray(faction.primary_objectives) && faction.primary_objectives.length > 0
                        ? `<ul class="faction-list">${faction.primary_objectives.map(o => `<li>${o}</li>`).join('')}</ul>`
                        : '<span class="faction-empty">N/A</span>';
                        
                    const allies = Array.isArray(faction.allies) && faction.allies.length > 0
                        ? faction.allies.join(', ')
                        : '<span class="faction-empty">None</span>';

                    return `
                        <div class="faction-card parsed-faction">
                            <div class="faction-header">
                                ${faction.leader_photo_url ? 
                                    `<img src="${faction.leader_photo_url}" class="faction-photo" alt="Leader Photo" />` : 
                                    `<div class="faction-photo-placeholder"></div>`}
                                <div class="faction-title-block">
                                    <div class="faction-name">
                                        ${name} <span class="influence-badge">Inf: ${infScore}/10</span>
                                    </div>
                                    <div class="faction-leader">Leader: ${leader}</div>
                                </div>
                            </div>
                            <div class="faction-grid">
                                <div class="faction-metric"><label>Est. Manpower</label> <span>${manpower}</span></div>
                                <div class="faction-metric"><label>Weaponry Tier</label> <span>${tier}</span></div>
                                <div class="faction-metric-full"><label>Controlled Territory</label> <span>${territory}</span></div>
                                <div class="faction-metric-full"><label>Known Allies</label> <span>${allies}</span></div>
                                <div class="faction-metric-full"><label>Primary Objectives</label> ${objectives}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
        factionsContainer.innerHTML = factionsHtml || '<div class="layer-status-text">No active non-state factions cataloged.</div>';
    }

    const eventsContainer = document.getElementById('dossier-events-container');
    eventsContainer.innerHTML = (data.latest_events || []).map(ev => `
        <div class="event-timeline-card">
            <h4>${ev.title}</h4>
            <p>${ev.context}</p>
            <div class="event-meta">
                <span>${new Date(ev.timestamp).toLocaleString()}</span>
                <span class="news-source">${ev.source}</span>
            </div>
        </div>
    `).join('');

    toggleDossierWindow(true);
}

viewer.screenSpaceEventHandler.setInputAction(async (click) => {
    const picked = viewer.scene.pick(click.position);
    if (Cesium.defined(picked) && picked.id) {
        openPostDetails(picked.id);
        return;
    }

    const ray = viewer.camera.getPickRay(click.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);

    if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);

        if (window.showNotification) {
            showNotification(`Coordinates: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`, "info");
        }

        const countryName = await reverseGeocodeCountry(lat, lon);
        if (countryName) {
            const countrySlug = formatCountrySlug(countryName);
            const [dossier] = await Promise.all([
                fetchCountryDossier(countrySlug),
                loadCountryGeospatialConflictMap(countrySlug, countryName) 
            ]);

            if (dossier) {
                renderCountryDossier(dossier);
            }
        }
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

function generateSectorLineChart(chartSeries, chartMarker) {
    if (!chartSeries || chartSeries.length === 0) return '';

    const svgWidth = 300;
    const svgHeight = 100;
    const padding = { top: 12, right: 12, bottom: 18, left: 36 };

    const closes = chartSeries.map(d => d.close);
    const firstClose = closes[0];
    const lastClose = closes[closes.length - 1];
    
    const isUp = lastClose >= firstClose;
    const strokeColor = isUp ? '#32d74b' : '#ff453a'; 
    const gradId = isUp ? 'sector-chart-grad-up' : 'sector-chart-grad-down';

    const minVal = Math.min(...closes) * 0.98;
    const maxVal = Math.max(...closes) * 1.02;

    const rangeX = Math.max(1, chartSeries.length - 1);
    const rangeY = Math.max(1, maxVal - minVal);

    const getX = (index) => padding.left + (index / rangeX) * (svgWidth - padding.left - padding.right);
    const getY = (val) => svgHeight - padding.bottom - ((val - minVal) / rangeY) * (svgHeight - padding.top - padding.bottom);

    let pathD = `M ${getX(0)} ${getY(chartSeries[0].close)}`;
    chartSeries.forEach((d, i) => {
        if (i > 0) pathD += ` L ${getX(i)} ${getY(d.close)}`;
    });

    let areaD = `${pathD} L ${getX(chartSeries.length - 1)} ${svgHeight - padding.bottom} L ${getX(0)} ${svgHeight - padding.bottom} Z`;

    let markerHtml = '';
    if (chartMarker) {
        const markerIdx = chartSeries.findIndex(d => d.time === chartMarker.time);
        if (markerIdx !== -1) {
            markerHtml = `
                <line x1="${getX(markerIdx)}" y1="${getY(maxVal)}" x2="${getX(markerIdx)}" y2="${svgHeight - padding.bottom}" stroke="${chartMarker.color}" stroke-dasharray="2,2" stroke-width="1" opacity="0.6"/>
                <circle cx="${getX(markerIdx)}" cy="${getY(chartSeries[markerIdx].close)}" r="4" fill="${chartMarker.color}" />
                <text x="${getX(markerIdx)}" y="${getY(maxVal) - 2}" fill="${chartMarker.color}" font-size="9" text-anchor="middle" font-weight="600">${chartMarker.text}</text>
            `;
        }
    }

    return `
        <div class="chart-wrapper" style="margin-top: 12px;">
            <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="sector-chart-svg" style="width: 100%; height: auto; overflow: visible;">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3"/>
                        <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
                    </linearGradient>
                </defs>
                <line x1="${padding.left}" y1="${getY(maxVal)}" x2="${svgWidth}" y2="${getY(maxVal)}" stroke="var(--border-light)" stroke-dasharray="2,2"/>
                <text x="0" y="${getY(maxVal) + 3}" fill="var(--text-muted)" font-size="9">$${maxVal.toFixed(1)}</text>
                <line x1="${padding.left}" y1="${getY(minVal)}" x2="${svgWidth}" y2="${getY(minVal)}" stroke="var(--border-light)" stroke-dasharray="2,2"/>
                <text x="0" y="${getY(minVal) + 3}" fill="var(--text-muted)" font-size="9">$${minVal.toFixed(1)}</text>
                <path d="${areaD}" fill="url(#${gradId})" />
                <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linejoin="round" />
                ${markerHtml}
                <circle cx="${getX(chartSeries.length - 1)}" cy="${getY(lastClose)}" r="3" fill="#000" stroke="${strokeColor}" stroke-width="2"/>
            </svg>
        </div>
    `;
}

window.renderSectorIntel = function(payload) {
    if (!payload || !payload.modules) return;
    
    const dateObj = new Date(payload.timestamp);
    const timeStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tsEl = document.getElementById('sector-timestamp');
    if (tsEl) tsEl.innerText = timeStr;

    const container = document.getElementById('sector-content-container');
    if (!container) return;
    
    container.innerHTML = payload.modules.map(mod => {
        let specializedContent = '';

        switch((mod.category || '').toUpperCase()) {
            case 'FINANCE':
                specializedContent = `
                    <div class="sector-module-grid">
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Market Symbol</label>
                            <div style="font-size:12px; font-weight:600;">${mod.ticker || 'N/A'}</div>
                        </div>
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Sentiment</label>
                            <div style="font-size:12px; font-weight:600;">${mod.sentimentScore ?? 'N/A'}/100</div>
                        </div>
                    </div>
                    ${generateSectorLineChart(mod.chartSeries, mod.chartMarker)}
                `;
                break;
            case 'RESEARCH':
                specializedContent = `
                    <div class="sector-module-grid">
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Global Impact</label>
                            <div style="font-size:12px; font-weight:600;">${mod.researchProgressBar?.impactScope || 'N/A'}</div>
                        </div>
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Phase</label>
                            <div style="font-size:12px; font-weight:600;">${mod.researchProgressBar?.phase || 'N/A'}</div>
                        </div>
                    </div>
                    ${mod.researchProgressBar ? `
                    <div class="dossier-metric-full" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px; margin-top: 6px;">
                        <label style="color:var(--text-muted); font-size:10px; display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span>Progress</span> <span>${mod.researchProgressBar.percentage}%</span>
                        </label>
                        <div style="background: var(--border-light); height: 5px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${mod.researchProgressBar.percentage}%; background: var(--text-highlight); height: 100%;"></div>
                        </div>
                    </div>` : ''}
                `;
                break;
            case 'SPORTS':
                specializedContent = `
                    <div class="sector-module-grid">
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Status</label>
                            <div style="font-size:12px; font-weight:600;">${mod.status || 'N/A'}</div>
                        </div>
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Momentum</label>
                            <div style="font-size:12px; font-weight:600;">${mod.momentumScore ?? 'N/A'}/100</div>
                        </div>
                    </div>
                `;
                break;
            case 'MEDICINE':
                specializedContent = `
                    <div class="sector-module-grid">
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Condition</label>
                            <div style="font-size:12px; font-weight:600;">${mod.clinicalMetrics?.condition || 'N/A'}</div>
                        </div>
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Phase</label>
                            <div style="font-size:12px; font-weight:600;">${mod.clinicalMetrics?.phase || 'N/A'}</div>
                        </div>
                    </div>
                `;
                break;
            case 'EDUCATION':
                specializedContent = `
                    <div class="sector-module-grid">
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Target</label>
                            <div style="font-size:12px; font-weight:600;">${mod.policyImpact?.demographic || 'N/A'}</div>
                        </div>
                        <div class="dossier-metric" style="background: var(--bg-element); padding: 8px 10px; border-radius: 8px;">
                            <label style="color:var(--text-muted); font-size:10px; margin-bottom:2px; display:block;">Systemic Impact</label>
                            <div style="font-size:12px; font-weight:600;">${mod.policyImpact?.systemicScore ?? 'N/A'}/100</div>
                        </div>
                    </div>
                `;
                break;
        }

        let newsHtml = '';
        if (mod.newsFeed && mod.newsFeed.length > 0) {
            const news = mod.newsFeed[0];
            newsHtml = `
                <div class="sector-news-card" onclick="window.open('${news.url}', '_blank')">
                    ${news.photoUrl ? `<img src="${news.photoUrl}" class="sector-news-thumb" alt="News thumbnail" />` : ''}
                    <strong style="font-size: 12px; display:block; margin-bottom: 4px; line-height: 1.3; color: var(--text-highlight);">${news.title}</strong>
                    <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 8px 0; line-height: 1.3;">${news.snippet}</p>
                    <div class="news-item-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:0;">
                        <span style="font-size: 10px; color: var(--text-muted); background: var(--bg-element); padding: 2px 6px; border-radius: 4px;">${news.source}</span>
                        <span style="font-size: 10px; color: var(--text-muted);">${news.date}</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="sector-card">
                ${mod.heroPhoto ? `<img src="${mod.heroPhoto}" class="sector-hero-img" alt="${mod.entity}" />` : ''}
                <div class="sector-card-body">
                    <div class="sector-header">
                        <div class="sector-logo-wrapper">
                            <img src="${mod.brandLogo}" class="sector-logo" onerror="this.parentElement.style.display='none'">
                        </div>
                        <div class="sector-title">
                            <h4>
                                <span class="sector-entity-name">${mod.entity}</span>
                                <span class="intensity-badge badge-low" style="font-size: 9px; padding: 2px 6px;">${mod.category}</span>
                            </h4>
                        </div>
                    </div>
                    ${mod.insight ? `<div class="sector-insight">${mod.insight}</div>` : ''}
                    <div>${specializedContent}</div>
                    ${newsHtml}
                </div>
            </div>
        `;
    }).join('');
};

window.fetchGeneralNews = async function() {
    try {
        const response = await apiFetch(API.news);
        if (response && response.data) {
            renderSectorIntel(response.data);
        }
    } catch (err) {
        console.error("Sector Intel Auto-Fetch Error:", err);
    }
};

// =========================================================
// 11. BOOTSTRAP & MISCELLANEOUS
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    initializeAuthState();
    setTimeout(fetchGeneralNews, 500);
});

window.toggleChangelogModal = function(show) {
    const modal = document.getElementById('changelog-modal');
    if (!modal) return;
    
    if (show) {
        modal.classList.remove('hidden');
        const profileDropdown = document.getElementById('profile-dropdown');
        const layersDropdown = document.getElementById('layers-dropdown');
        if (profileDropdown) profileDropdown.classList.add('hidden');
        if (layersDropdown) layersDropdown.classList.add('hidden');
    } else {
        modal.classList.add('hidden');
    }
};

document.addEventListener('click', (event) => {
    const changelogModal = document.getElementById('changelog-modal');
    const versionBtn = document.getElementById('version-tag-btn');
    
    if (changelogModal && !changelogModal.classList.contains('hidden')) {
        const modalCard = changelogModal.querySelector('.modal-card') || changelogModal.querySelector('.changelog-body');
        if (versionBtn && !versionBtn.contains(event.target) && (!modalCard || !modalCard.contains(event.target))) {
            toggleChangelogModal(false);
        }
    }
});

function enforceMobileLock() {
    const lockScreen = document.getElementById('mobile-lock-screen');
    if (!lockScreen) return;
    
    if (window.innerWidth < 850) {
        lockScreen.classList.add('active');
    } else {
        lockScreen.classList.remove('active');
    }
}

enforceMobileLock();
window.addEventListener('resize', enforceMobileLock);

// Add type-safety to prevent .replace errors
function formatIntelName(fileName) {
    if (!fileName || typeof fileName !== 'string') return 'Unknown Layer';
    
    return fileName
        .replace(/\.czml$/i, '')           
        .replace(/[_-]/g, ' ')             
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Single, definitive vault indexing function
async function indexSecureVault() {
    const container = document.getElementById('gilu-layers-container');
    try {
        const response = await apiFetch(API.layers);
        container.innerHTML = ''; 
        
        const czmlAssets = response.data || [];
        if (czmlAssets.length === 0) {
            container.innerHTML = '<div class="layer-status-text">No active layers found in vault.</div>';
            return;
        }

        czmlAssets.forEach(asset => {
            // Safely extract the string key from the backend object
            const fileKey = typeof asset === 'object' ? asset.key : asset;

            if (!fileKey) return; // Failsafe

            const btn = document.createElement('button');
            btn.className = 'layer-toggle-btn';
            btn.innerHTML = `<span class="layer-icon">⚪</span> <span class="layer-name">${formatIntelName(fileKey)}</span>`;
            
            btn.onclick = () => toggleIntelLayer(fileKey, btn);
            container.appendChild(btn);
        });
        
    } catch (error) {
        console.error("Vault indexing failed:", error);
        container.innerHTML = '<div class="layer-status-text error">Vault connection refused. Check access nodes.</div>';
    }
}

indexSecureVault();
pullVisionSphereIntel();