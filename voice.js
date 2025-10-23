// voice.js - FINAL (LAST PAGE + STOP DRAWING + ULTRA-EFFICIENT)
debug('voice.js - FINAL WITH LAST PAGE & STOP');

let recognition = null;
let isWritingText = false;
let currentText = '';
let lastTextUpdate = 0;
let lastCommandTime = 0;

// === START VOICE ===
app.startVoice = () => {
    debug('VOICE STARTING...');
    app.stopVoice();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        toast('Voice not supported');
        app.setMode('mouse');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
        debug('MICROPHONE ACTIVE');
        $('#voice-status').textContent = 'Listening...';
        $('#voice-status').style.display = 'block';
        toast('Say: draw hello | next | last page | stop');
        app.gestureMode = 'voice';
    };

    // === ULTRA-EFFICIENT RESULT PROCESSING ===
    recognition.onresult = (event) => {
        let final = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += t;
            else interim += t;
        }

        // === FINAL COMMAND – INSTANT ===
        if (final) {
            const now = Date.now();
            if (now - lastCommandTime < 400) return;
            lastCommandTime = now;

            const cmd = final.trim().toLowerCase();
            debug(`COMMAND: "${cmd}"`);

            // STOP DRAWING
            if ((cmd.includes('stop') || cmd.includes('done') || cmd.includes('enough')) && isWritingText) {
                isWritingText = false;
                currentText = '';
                app.speak?.('Stopped');
                toast('Drawing stopped');
                return;
            }

            // DRAW PARAGRAPH
            if (cmd.startsWith('draw ') || cmd.startsWith('write ')) {
                const text = cmd.replace(/^(draw|write)\s+/i, '').trim();
                if (text) {
                    isWritingText = true;
                    currentText = text;
                    lastTextUpdate = now;
                    writeTextOnSlide(currentText);
                    toast(`"${text}"`);
                    return;
                }
            }

            // PAGE NUMBER
            const m = cmd.match(/page (\d+)/i);
            if (m) {
                const n = parseInt(m[1]);
                if (app.pdfDoc && n >= 1 && n <= app.pdfDoc.numPages) {
                    app.pageNum = n;
                    app.renderPage();
                    app.speak?.(`Page ${n}`);
                    toast(`Page ${n}`);
                    return;
                }
            }

            // GO TO LAST PAGE
            if (cmd.includes('last page') || cmd.includes('go to last') || cmd.includes('end')) {
                if (app.pdfDoc && app.pdfDoc.numPages > 0) {
                    app.pageNum = app.pdfDoc.numPages;
                    app.renderPage();
                    app.speak?.('Last page');
                    toast(`Last page (${app.pdfDoc.numPages})`);
                    return;
                }
            }

            // OTHER COMMANDS
            processVoiceCommand(cmd);
            return;
        }

        // === INTERIM – SMOOTH TYPING ===
        if (isWritingText && interim) {
            const now = Date.now();
            if (now - lastTextUpdate > 200) {
                const newText = currentText + ' ' + interim.trim();
                if (newText !== currentText) {
                    currentText = newText;
                    lastTextUpdate = now;
                    writeTextOnSlide(currentText);
                }
            }
        }
    };

    recognition.onerror = (e) => {
        debug('VOICE ERROR: ' + e.error);
        if (e.error === 'not-allowed') {
            toast('Mic denied');
            app.setMode('mouse');
        }
    };

    recognition.onend = () => {
        if (app.mode === 'voice') {
            setTimeout(() => recognition?.start(), 50);
        }
    };

    recognition.start();
    debug('VOICE STARTED');
};

app.stopVoice = () => {
    if (recognition) {
        try { recognition.stop(); } catch (e) {}
        recognition = null;
    }
    isWritingText = false;
    currentText = '';
    $('#voice-status').style.display = 'none';
    app.gestureMode = 'idle';
};

// === FAST PARAGRAPH WRITING ===
function writeTextOnSlide(text) {
    if (!app?.annCanvas) return;

    const ctx = app.annCanvas.getContext('2d');
    const w = app.annCanvas.width;
    const h = app.annCanvas.height;

    ctx.clearRect(60, 60, w - 120, h - 120);

    ctx.save();
    ctx.fillStyle = '#ff3333';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    const maxW = w - 140;
    const lineH = 58;
    const words = text.split(' ');
    let line = '';
    let y = 80;

    for (let word of words) {
        const test = line + word + ' ';
        if (ctx.measureText(test).width > maxW && line) {
            ctx.strokeText(line.trim(), 80, y);
            ctx.fillText(line.trim(), 80, y);
            line = word + ' ';
            y += lineH;
        } else {
            line = test;
        }
        if (y > h - 100) {
            ctx.fillText('...', 80, y);
            break;
        }
    }
    if (line.trim()) {
        ctx.strokeText(line.trim(), 80, y);
        ctx.fillText(line.trim(), 80, y);
    }
    ctx.restore();
}

// === COMMAND PROCESSING ===
function processVoiceCommand(cmd) {
    if (cmd.includes('next')) {
        app.nextPage();
        app.speak?.('Next');
        toast('Next');
    }
    else if (cmd.includes('previous') || cmd.includes('back')) {
        app.prevPage();
        app.speak?.('Back');
        toast('Previous');
    }
    else if (cmd.includes('clear') || cmd.includes('erase')) {
        app.clearAnnotations();
        app.speak?.('Cleared');
        toast('Cleared');
    }
    else if (cmd.includes('mouse')) {
        app.setMode('mouse');
        app.speak?.('Mouse');
        toast('Mouse');
    }
    else if (cmd.includes('gesture') || cmd.includes('hand')) {
        app.setMode('gesture');
        app.speak?.('Gesture');
        toast('Gesture');
    }
}

debug('voice.js – FINAL WITH LAST PAGE & STOP');