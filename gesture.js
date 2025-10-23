// gesture.js – SMOOTH & EFFICIENT + ALL MODES WORK
debug('gesture.js loading...');

const video = document.getElementById('video');
let hands = null;
let camera = null;
let isReady = false;

// Throttle drawing for performance
let lastDrawTime = 0;
const DRAW_THROTTLE = 16; // ~60 FPS max

window.startGesture = async () => {
    if (isReady) return;
    debug('Starting gesture...');
    try {
        await waitForMediaPipe();
        hands = new window.Hands({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${f}`
        });
        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });
        hands.onResults(onResults);

        camera = new window.Camera(video, {
            onFrame: async () => {
                if (hands && video.videoWidth > 0) await hands.send({ image: video });
            },
            width: 640,
            height: 480
        });

        await camera.start();
        isReady = true;
        video.style.display = 'block';
        debug('Gesture READY');
        toast('Gesture Ready!');
    } catch (e) {
        debug('Gesture failed: ' + e.message);
    }
};

window.stopGesture = () => {
    try { if (camera) camera.stop(); if (hands) hands.close(); } catch (e) {}
    camera = null; hands = null; isReady = false;
    video.style.display = 'none';
    $('#laser-pointer').style.display = 'none';
    if (window.app) window.app.drawMode = 'none';
};

function waitForMediaPipe() {
    return new Promise(resolve => {
        if (window.Hands && window.Camera) return resolve();
        const check = setInterval(() => {
            if (window.Hands && window.Camera) {
                clearInterval(check);
                resolve();
            }
        }, 100);
        setTimeout(() => { clearInterval(check); resolve(); }, 10000);
    });
}

let lastNav = 0;
const COOLDOWN = 800;
let candidate = null, candidateTime = 0;
const STABLE = 300;

function detect(lm) {
    const t = i => lm[i];
    if (t(8).y < lm[6].y && t(12).y < lm[10].y && t(16).y < lm[14].y && t(20).y < lm[18].y) return 'open';
    const idx = t(8).y < lm[6].y, mid = t(12).y < lm[10].y, rest = t(16).y > lm[14].y && t(20).y > lm[18].y;
    if (idx && mid && rest) return 'two';
    if (idx && !mid && rest) {
        const x = t(8).x, w = lm[0].x;
        if (x > w + 0.18) return 'right';
        if (x < w - 0.18) return 'left';
        return 'index';
    }
    if (Math.hypot(t(4).x - t(8).x, t(4).y - t(8).y) < 0.07) return 'pinch';
    if (t(8).y > lm[6].y && t(12).y > lm[10].y && t(16).y > lm[14].y && t(20).y > lm[18].y) return 'fist';
    return 'none';
}

function onResults(res) {
    if (!window.app || window.app.mode !== 'gesture' || !isReady || !res.multiHandLandmarks?.[0]) {
        $('#laser-pointer').style.display = 'none';
        if (window.app) window.app.isDrawing = false;
        return;
    }

    const lm = res.multiHandLandmarks[0];
    const g = detect(lm);
    const now = performance.now();
    const laser = $('#laser-pointer');

    // === OPEN HAND: STOP ALL ===
    if (g === 'open' && window.app.drawMode !== 'none') {
        window.app.drawMode = 'none';
        laser.style.display = 'none';
        window.app.speak?.('Stopped');
        window.app.finishDrawing?.();
        return;
    }

    // === NAVIGATION (ONLY IN 'none' MODE) ===
    if (window.app.drawMode === 'none') {
        if (g === 'right' && now - lastNav > COOLDOWN) { window.app.nextPage(); lastNav = now; }
        if (g === 'left' && now - lastNav > COOLDOWN) { window.app.prevPage(); lastNav = now; }
    }

    // === MODE SELECTION (STABLE GESTURE) ===
    if (window.app.drawMode === 'none' && g !== candidate) { 
        candidate = g; 
        candidateTime = now; 
    }
    else if (window.app.drawMode === 'none' && g === candidate && now - candidateTime > STABLE) {
        if (g === 'index') { window.app.drawMode = 'draw'; window.app.speak?.('Draw'); }
        if (g === 'pinch') { window.app.drawMode = 'highlight'; window.app.speak?.('Highlight'); }
        if (g === 'fist') { window.app.drawMode = 'erase'; window.app.speak?.('Erase'); }
        if (g === 'two') { window.app.drawMode = 'laser'; window.app.speak?.('Laser'); }
        candidate = null;
    }

    // === LASER POINTER ===
    if (window.app.drawMode === 'laser') {
        const x = (1 - lm[8].x) * window.app.annCanvas.width;
        const y = lm[8].y * window.app.annCanvas.height;
        laser.style.left = x + 'px';
        laser.style.top = y + 'px';
        laser.style.display = 'block';
        return;
    } else {
        laser.style.display = 'none';
    }

    // === DRAWING: ALL MODES (draw, highlight, erase) ===
    if (['draw', 'highlight', 'erase'].includes(window.app.drawMode)) {
        const x = (1 - lm[8].x) * window.app.annCanvas.width;
        const y = lm[8].y * window.app.annCanvas.height;

        if (window.app.isDrawing && now - lastDrawTime > DRAW_THROTTLE) {
            // main.js handles style based on drawMode
            window.app.drawLine(window.app.lastX, window.app.lastY, x, y);
            window.app.lastX = x;
            window.app.lastY = y;
            lastDrawTime = now;
        } else if (!window.app.isDrawing) {
            window.app.isDrawing = true;
            window.app.lastX = x;
            window.app.lastY = y;
        }
    }
    else if (window.app.isDrawing) {
        window.app.finishDrawing?.();
    }
}

debug('gesture.js ready');