// main.js - FINAL CORE (NO LAG + SMOOTH + VOICE WORKS 100%)
debug('main.js loaded');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function initApp() {
    debug('DOM ready – initializing app');

    // === WAIT FOR PDF.JS ===
    if (!window.pdfjsLib) {
        debug('pdfjsLib missing – waiting...');
        const waitPDF = setInterval(() => {
            if (window.pdfjsLib) {
                clearInterval(waitPDF);
                debug('pdfjsLib LOADED');
                startApp();
            }
        }, 100);
        setTimeout(() => {
            clearInterval(waitPDF);
            debug('PDF.JS TIMEOUT');
            startApp();
        }, 10000);
    } else {
        debug('pdfjsLib ready');
        startApp();
    }

    function startApp() {
        debug('APP STARTED – OPTIMIZED');

        window.app = {
            pdfDoc: null,
            pageNum: 1,
            pageRendering: false,
            renderTask: null,
            container: $('#container'),
            pdfCanvas: $('#pdf-canvas'),
            annCanvas: $('#annotation-canvas'),
            pdfCtx: null,
            annCtx: null,
            laser: $('#laser-pointer'),
            video: $('#video'),
            mode: 'mouse',
            tool: 'draw',
            gestureMode: 'idle',
            gestureActive: false,
            debug,
            toast,
            speak,
            setMode: null,
            setTool: null,
            nextPage: null,
            prevPage: null,
            clearAnnotations: null,
            drawLine: null,
            isDrawing: false,
            lastX: 0,
            lastY: 0,
            finishDrawing: () => { app.isDrawing = false; },
            renderPage: null,
            updateStatus: null,
            voiceActive: false,
            startVoice: null,
            stopVoice: null,
            drawMode: 'none', // ← NEW: gesture draw mode
            modulesLoaded: {
                mouse: false,
                gesture: false,
                voice: false
            }
        };

        app.pdfCtx = app.pdfCanvas.getContext('2d');
        app.annCtx = app.annCanvas.getContext('2d');

        // === DRAW LINE – FIXED FOR GESTURE MODE ===
        app.drawLine = (x1, y1, x2, y2) => {
            const ctx = app.annCtx;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineCap = ctx.lineJoin = 'round';

            // === GESTURE MODE (drawMode) ===
            if (app.mode === 'gesture') {
                if (app.drawMode === 'draw') {
                    ctx.strokeStyle = '#ff3333';
                    ctx.lineWidth = 3;
                }
                else if (app.drawMode === 'highlight') {
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
                    ctx.lineWidth = 30;
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = 'rgba(255, 255, 0, 0.6)';
                }
                else if (app.drawMode === 'erase') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.lineWidth = 40;
                }
                else return;
            }
            // === MOUSE MODE (tool) ===
            else if (app.mode === 'mouse') {
                if (app.tool === 'draw') {
                    ctx.strokeStyle = '#ff3333';
                    ctx.lineWidth = 3;
                }
                else if (app.tool === 'highlight') {
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.1)';
                    ctx.lineWidth = 24;
                }
                else if (app.tool === 'erase') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.lineWidth = 50;
                }
                else return;
            }

            ctx.stroke();

            // Reset after erase
            if ((app.mode === 'gesture' && app.drawMode === 'erase') ||
                (app.mode === 'mouse' && app.tool === 'erase')) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.shadowBlur = 0;
            }
        };

        // === DEBOUNCED RENDER PAGE (NO LAG) ===
        let renderTimeout = null;
        app.renderPage = () => {
            if (!app.pdfDoc || app.pageRendering) return;
            if (renderTimeout) clearTimeout(renderTimeout);

            renderTimeout = setTimeout(() => {
                app.pageRendering = true;
                if (app.renderTask) app.renderTask.cancel();

                app.pdfDoc.getPage(app.pageNum).then(page => {
                    const vp = page.getViewport({ scale: 1 });
                    const scale = Math.min(
                        app.container.clientWidth / vp.width,
                        app.container.clientHeight / vp.height
                    );
                    const viewport = page.getViewport({ scale });

                    [app.pdfCanvas, app.annCanvas].forEach(c => {
                        c.width = viewport.width;
                        c.height = viewport.height;
                        c.style.width = viewport.width + 'px';
                        c.style.height = viewport.height + 'px';
                        c.style.left = (app.container.clientWidth - viewport.width) / 2 + 'px';
                        c.style.top = (app.container.clientHeight - viewport.height) / 2 + 'px';
                    });

                    app.renderTask = page.render({ canvasContext: app.pdfCtx, viewport });
                    app.renderTask.promise.finally(() => {
                        app.pageRendering = false;
                        app.renderTask = null;
                    });
                }).catch(err => {
                    if (err.name !== 'RenderingCancelledException') debug('Render error: ' + err);
                    app.pageRendering = false;
                });

                app.updateStatus();
                renderTimeout = null;
            }, 80); // 80ms = smooth
        };

        function updateStatus() {
            const lock = app.gestureActive ? ' (locked)' : '';
            $('#status').textContent = `Page ${app.pageNum}/${app.pdfDoc?.numPages || '?'} | ${app.mode} | ${app.tool}${lock}`;
            $('#prev').disabled = app.gestureActive;
            $('#next').disabled = app.gestureActive;
        }

        // === PDF UPLOAD ===
        $('#upload').addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            debug(`PDF: ${file.name}`);

            const data = await file.arrayBuffer();
            try {
                app.pdfDoc = await pdfjsLib.getDocument({ data }).promise;
                debug(`PDF LOADED: ${app.pdfDoc.numPages} pages`);
                app.pageNum = 1;
                app.renderPage();
                toast(`Loaded: ${app.pdfDoc.numPages} pages`);
            } catch (err) {
                debug('PDF FAILED: ' + err.message);
                toast('Failed to load PDF');
            }
        });

        // === NAVIGATION ===
        $('#prev').onclick = () => app.prevPage();
        $('#next').onclick = () => app.nextPage();
        $('#clear').onclick = () => app.clearAnnotations();

        // === MODE SWITCH ===
        app.setMode = (mode) => {
            if (app.mode === mode) return;
            const prev = app.mode;
            app.mode = mode;
            debug(`MODE: ${prev} → ${mode}`);

            $('#mouse-tools').style.display = mode === 'mouse' ? 'flex' : 'none';
            $$('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            app.annCanvas.style.pointerEvents = mode === 'mouse' ? 'auto' : 'none';

            if (prev === 'gesture') window.stopGesture?.();
            if (prev === 'voice' && app.stopVoice) app.stopVoice();

            if (mode === 'gesture') {
                setTimeout(() => window.startGesture?.(), 100);
            }

            if (mode === 'voice' && app.startVoice) {
                setTimeout(() => app.startVoice(), 100);
            }

            updateStatus();
        };

        // === TOOL SWITCH ===
        app.setTool = (tool) => {
            app.tool = tool;
            $$('#mouse-tools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
            updateStatus();
        };

        // === EXPOSE ===
        app.nextPage = () => { if (app.pageNum < app.pdfDoc?.numPages) { app.pageNum++; app.renderPage(); } };
        app.prevPage = () => { if (app.pageNum > 1) { app.pageNum--; app.renderPage(); } };
        app.clearAnnotations = () => { app.annCtx.clearRect(0, 0, app.annCanvas.width, app.annCanvas.height); };
        app.updateStatus = updateStatus;

        // === BUTTONS ===
        $$('[data-mode]').forEach(btn => btn.onclick = () => app.setMode(btn.dataset.mode));
        $$('#mouse-tools [data-tool]').forEach(btn => btn.onclick = () => app.setTool(btn.dataset.tool));

        // === RESIZE (DEBOUNCED) ===
        let resizeTimer;
        new ResizeObserver(() => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (app.pdfDoc) app.renderPage();
            }, 100);
        }).observe(app.container);

        // === LOAD MODULES ===
        const waitMediaPipe = setInterval(() => {
            if (window.Hands && window.Camera) {
                clearInterval(waitMediaPipe);
                loadModules();
            }
        }, 100);
        setTimeout(() => {
            clearInterval(waitMediaPipe);
            loadModules();
        }, 10000);

        function loadModules() {
            if (!app.modulesLoaded.mouse) {
                import('./mouse.js').then(() => {
                    app.modulesLoaded.mouse = true;
                });
            }
            if (!app.modulesLoaded.gesture) {
                import('./gesture.js').then(() => {
                    app.modulesLoaded.gesture = true;
                });
            }
            if (!app.modulesLoaded.voice) {
                debug('Loading voice.js...');
                import('./voice.js').then(() => {
                    debug('voice.js LOADED');
                    app.modulesLoaded.voice = true;
                });
            }
        }

        debug('main.js INITIALIZED – SMOOTH & FAST');
    }
}