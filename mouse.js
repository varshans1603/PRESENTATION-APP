// mouse.js - Drawing, Laser, Highlight + DOUBLE-TAP NAVIGATION
debug('mouse.js loaded');

if (!window.app) {
    debug('window.app not ready');
} else {
    const { annCanvas, laser } = window.app;

    function getCoord(e) {
        const rect = annCanvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    let isDrawing = false;
    let lastX = 0, lastY = 0;

    // === DOUBLE-TAP DETECTION ===
    let lastTapTime = 0;
    const DOUBLE_TAP_DELAY = 300; // ms

    annCanvas.addEventListener('pointerdown', e => {
        if (window.app.mode !== 'mouse') return;

        const now = Date.now();
        const { x } = getCoord(e);
        const canvasWidth = annCanvas.getBoundingClientRect().width;

        // === DOUBLE-TAP LOGIC ===
        if (now - lastTapTime < DOUBLE_TAP_DELAY) {
            if (x < canvasWidth / 2) {
                // LEFT HALF → PREVIOUS
                window.app.prevPage();
                window.app.speak('Previous');
            } else {
                // RIGHT HALF → NEXT
                window.app.nextPage();
                window.app.speak('Next');
            }
            lastTapTime = 0; // Prevent triple-tap
            return;
        }
        lastTapTime = now;

        // === NORMAL TOOLS ===
        const { x: px, y: py } = getCoord(e);

        if (window.app.tool === 'laser') {
            laser.style.left = px + 'px';
            laser.style.top = py + 'px';
            laser.style.display = 'block';
            return;
        }

        if (['draw', 'highlight', 'erase'].includes(window.app.tool)) {
            isDrawing = true;
            lastX = px;
            lastY = py;
        }
    });

    annCanvas.addEventListener('pointermove', e => {
        if (window.app.mode !== 'mouse') return;

        const { x, y } = getCoord(e);

        if (window.app.tool === 'laser') {
            laser.style.left = x + 'px';
            laser.style.top = y + 'px';
            laser.style.display = 'block';
            return;
        }

        if (!isDrawing) return;

        const ctx = window.app.annCtx;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.lineCap = 'round';

        if (window.app.tool === 'draw') {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
        } else if (window.app.tool === 'highlight') {
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 20;
            ctx.globalAlpha = 0.1;
        } else if (window.app.tool === 'erase') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = 30;
        }

        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        lastX = x;
        lastY = y;
    });

    annCanvas.addEventListener('pointerup', () => {
        isDrawing = false;
        if (window.app.tool === 'laser') laser.style.display = 'none';
    });

    annCanvas.addEventListener('pointerleave', () => {
        isDrawing = false;
        if (window.app.tool === 'laser') laser.style.display = 'none';
    });

    debug('mouse.js ready – DOUBLE-TAP NAVIGATION ADDED');
}