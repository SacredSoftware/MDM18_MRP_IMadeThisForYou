//------------Set Up Variables----------------//
let manifest = [];
let weights = [];
let hoveredIndex = -1;

let COLS = 9;

//------------MIDI Controller Variables Setup----------------//
// MIDI state
let selectedTileIndex = -1;       // which tile is currently selected (-1 = none)
let midiInput = null;
let midiOutput = null;             // for optional LED feedback
let networkOutput = null;           // for broadcasting MIDI controller data over network to CSV machine

// Use actual CC numbers from AKAI MPD218 Editor - Chroma10 preset (see Rough Notes - July txt file)
const FADER_CC_NUMBERS = [3, 9, 12, 13, 14, 15];

// tracks last raw 0–127 reading per CC number
let lastFaderValue = {};

// Soft takeover state — tracks whether each physical fader has "caught up"
// to the currently selected tile's weight. Reset whenever selection changes.
let pickedUp = {};

// tracks the last value that was actually *applied* to a weight (i.e. survived
// the noise filter below), separate from lastFaderValue which tracks every raw
// reading seen (still needed for pickup-crossing detection).
let lastAppliedValue = {};

// Minimum change (in raw 0-127 units) required to treat a CC reading as an
// intentional fader move rather than electrical noise/jitter at rest.
// Budget controllers commonly drift ±1-2 units with no hand on the fader.
const NOISE_THRESHOLD = 2;

function resetPickup() {
    pickedUp = {};
    lastFaderValue = {};
    lastAppliedValue = {};
}

// NOTE: no longer used now that faders are absolute (soft-takeover) rather
// than relative. Left in case a relative fine-tune mode is added later.
const FADER_SENSITIVITY = 0.25 / 127;

// MPD218 pad note mapping - REMOVE IF DEAD CODE 
const PAD_BANK_A_START = 36;      // note 36 = pad 1 in bank A
const PAD_BANK_B_START = 52;      // note 52 = pad 1 in bank B

// Physical MPD218 pad layout → category label
// (matches your visual grid's top-to-bottom, left-to-right order)
const PAD_NOTE_TO_LABEL = {
    48: 'Animals',        49: 'AnimeComics',     50: 'BeautyCare',   51: 'Cars',
    44: 'Comedy',         45: 'DailyLife',       46: 'Drama',        47: 'Education',
    40: 'Family',         41: 'FitnessHealth',   42: 'Food',         43: 'Games',
    36: 'Lipsync',        37: 'Outfit',          38: 'Relationship', 39: 'Shows',
    52: 'SingingDancing', 53: 'Society',         54: 'Sports',       55: 'Technology'
};

// Built at runtime once manifest loads — maps note number -> tile index
let NOTE_TO_INDEX = {};

function buildNoteMapping() {
    NOTE_TO_INDEX = {};
    for (const noteStr in PAD_NOTE_TO_LABEL) {
        const note = Number(noteStr);
        const label = PAD_NOTE_TO_LABEL[note];
        const idx = manifest.findIndex(m => m.label === label);
        if (idx !== -1) {
            NOTE_TO_INDEX[note] = idx;
        } else {
            console.warn(`No manifest category found for label "${label}" (note ${note})`);
        }
    }
}

//------------Weight Management----------------//
function setWeight(changedIndex, newVal) {
    newVal = Math.max(0, Math.min(1, newVal));
    const oldVal = weights[changedIndex]; 
    const oldOther = 1 - oldVal;
    const newOther = 1 - newVal; 

    weights[changedIndex] = newVal;

    if (oldOther === 0) {
        const share = newOther / (manifest.length - 1);
        weights = weights.map((w, i) => i === changedIndex ? newVal : share);
    } else {
        weights = weights.map((w, i) => {
            if (i === changedIndex) return newVal;
            return w * (newOther / oldOther);
        });
    }

    const total = weights.reduce((a, b) => a + b, 0);
    weights = weights.map(w => w / total);
}

//------------Helper Functions----------------//

function broadcastWeights() {
    window.api.send('weight-changed', { weights: weights});
}

//------------MIDI Installation----------------//
async function initMIDI() {
    if (!navigator.requestMIDIAccess) {
        console.warn('Web MIDI API not supported in this environment.');
        return;
    }

    let access;
    try {
        access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
        console.warn('MIDI access denied:', err);
        return;
    }

    // Find MPD218 (or first available device if MPD218 not found)
    for (const input of access.inputs.values()) {
        console.log('MIDI input available:', input.name);
        if (!midiInput) midiInput = input;
        if (input.name.toLowerCase().includes('mpd')) midiInput = input;
    }

    for (const output of access.outputs.values()) {
        console.log('MIDI output available:', output.name);
        if (!midiOutput) midiOutput = output;
        if (output.name.toLowerCase().includes('mpd')) midiOutput = output;
        if (output.name.toLowerCase().includes('network') || output.name.toLowerCase().includes('gallerymidi')){
            networkOutput = output;
        }
    }

    if (!networkOutput) {
        console.warn('Network MIDI output not found. Confirm the network session is enabled in Audio MIDI Setup before launching.')
    }

    if (!midiInput) {
        console.warn('No MIDI input found. Connect MPD218 before launching.');
        return;
    }

    console.log('Using MIDI input:', midiInput.name);
    midiInput.onmidimessage = handleMIDIMessage;
}

function handleMIDIMessage(event) {
    const [status, data1, data2] = event.data;
    const messageType = status & 0xF0;

    // --- PAD PRESS (Note On with velocity > 0) ---
    if (messageType === 0x90 && data2 > 0) {
        const tileIndex = NOTE_TO_INDEX[data1];

        if (tileIndex !== undefined) {
            if (selectedTileIndex === tileIndex) {
                clearSelectedTile();
            } else {
                selectTile(tileIndex, data1);
            }
        }
        return;
    }

    // --- KNOB/FADER TURN (CC message) — soft takeover / pickup mode ---//
    if (messageType === 0xB0) {
        if (!FADER_CC_NUMBERS.includes(data1)) return;
        if (networkOutput) networkOutput.send([status, data1, data2]);
        if (selectedTileIndex === -1) return;
    
        const prevValue = lastFaderValue[data1];
        lastFaderValue[data1] = data2;

        if (prevValue === data2) return;   // duplicate/jitter, ignore

        // Where this fader WOULD need to be to match the selected tile's
        // current weight — the "target" it must pick up before taking control.
        const targetRaw = weights[selectedTileIndex] * 127;

        if (!pickedUp[data1]) {
            if (prevValue === undefined) return;  // first reading — just record baseline

            // Pickup happens when the fader crosses the target position between
            // readings, OR lands close enough to it (handles quantization gaps,
            // since MIDI steps in whole numbers and can skip over the exact value).
            const crossed = (prevValue <= targetRaw && data2 >= targetRaw) ||
                             (prevValue >= targetRaw && data2 <= targetRaw);
            const closeEnough = Math.abs(data2 - targetRaw) <= 3;

            if (!crossed && !closeEnough) return;  // hasn't caught up yet — ignore
            pickedUp[data1] = true;
            lastAppliedValue[data1] = data2; // seed baseline at the moment of pickup
        } else {
            // Already picked up — filter out noise-level drift before committing.
            // Compares against the last value we actually APPLIED, not just the
            // last raw reading, so slow single-unit drift (e.g. 64,65,64,66...)
            // gets caught even though no two consecutive readings are identical.
            const lastApplied = lastAppliedValue[data1];
            if (lastApplied !== undefined && Math.abs(data2 - lastApplied) < NOISE_THRESHOLD) {
                return;
            }
            lastAppliedValue[data1] = data2;
        }
            
        // Picked up — fader is now absolute, full 0-127 range maps directly to weight
        setWeight(selectedTileIndex, data2 / 127);
        drawHeatmap();
        broadcastWeights();
        return;
    }
}

//------------MIDI Tile Selection---------------//
let selectedNoteNumber = -1;   // literal note last used to select a tile

function selectTile(index, noteNumber) {
    if (selectedNoteNumber !== -1) sendPadLED(selectedNoteNumber, false); // clear old LED
    selectedTileIndex = index;
    selectedNoteNumber = noteNumber;
    resetPickup();                          // fresh pickup state for the newly selected tile
    drawHeatmap();
    sendPadLED(noteNumber, true);
}

function clearSelectedTile() {
    if (selectedNoteNumber !== -1) sendPadLED(selectedNoteNumber, false);
    selectedTileIndex = -1;
    selectedNoteNumber = -1;
    drawHeatmap();
}

// OPTIONAL — LED feedback. The MPD218 responds to Note On sent back to it.
// If your firmware doesn't support this, nothing will happen (no crash).
function sendPadLED(noteNumber, on) {
    if (!midiOutput) return;
    try {
        // Note On channel 1 with velocity 127 = light on; velocity 0 = light off
        midiOutput.send([0x90, noteNumber, on ? 127 : 0]);
    } catch (e) {
        // Silently ignore if hardware doesn't support LED control
    }
}

//------------Drawing the Window----------------//

function drawHeatmap() {
    const canvas = document.getElementById('treemap-canvas');
    const ctx = canvas.getContext('2d');

    // Only resize if canvas dimensions don't match — avoids snowball effect
    const container = document.getElementById('treemap-container');
    const W = container.offsetWidth;
    const H = container.offsetHeight;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const GRID_COLS = 4;
    const GRID_ROWS = 5;
    const cellW = canvas.width / GRID_COLS;
    const cellH = canvas.height / GRID_ROWS;
    const pad = 3;

    manifest.forEach((m, i) => {
        const col = i % GRID_COLS; 
        const row = Math.floor(i / GRID_COLS);
        const x = col * cellW;
        const y = row * cellH;
        const isHovered = i === hoveredIndex;

        const isSelected = i === selectedTileIndex;
        ctx.fillStyle = weightToColor(weights[i], isHovered, isSelected);
        ctx.fillRect(x + pad, y + pad, cellW - pad * 2, cellH - pad * 2);

        // Glowing border for selected tile — amber while waiting for fader
        // pickup, cyan once a fader has taken control
        if (isSelected) {
            const anyPickedUp = FADER_CC_NUMBERS.some(cc => pickedUp[cc]);
            ctx.save();
            ctx.strokeStyle = anyPickedUp
                ? 'rgba(85, 220, 255, 0.9)'   // locked on, full control
                : 'rgba(255, 180, 60, 0.8)';  // waiting for pickup
            ctx.lineWidth = 2.5;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.shadowBlur = 12;
            ctx.strokeRect(x + pad, y + pad, cellW - pad * 2, cellH - pad * 2);
            ctx.restore();
        }

        const pct = (weights[i] * 100).toFixed(1) + '%';
        const labelSize = Math.max(30, Math.min(25, cellW / 2));

        ctx.fillStyle = `rgba(255,255,255,${1 + weights[i] * 0.6})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${labelSize}px 'CustomFont' 'Courier New', monospace`;
        ctx.fillText(m.label, x + cellW / 2, y + cellH / 2 - labelSize * 0.6);

        ctx.font = `${labelSize * 0.85}px 'CustomFont', 'Courier New', monospace`;
        ctx.fillStyle = `rgba(255,255,255,${1 + weights[i] * 0.5})`;
        ctx.fillText(pct, x + cellW / 2, y + cellH / 2 + labelSize * 0.8);
    });
}
function weightToColor(weight, isHovered, isSelected) {
    const lightness = 12 + Math.round(weight * 57);
    if (isSelected) return `hsl(195, 90%, ${lightness}%)`;   // cyan-tinted when selected
    const saturation = isHovered ? 95 : 80;
    return `hsl(210, ${saturation}%, ${lightness}%)`;
}

//--LOADING DOM CONTETNT BEFORE FUNCTIONS------------// 
window.addEventListener('DOMContentLoaded', () => {
    //------------Canvas Interaction----------------//
    
    function getHoveredRect(mouseX, mouseY) {
    const canvas = document.getElementById('treemap-canvas');
    const GRID_COLS = 4;
    const GRID_ROWS = 5;
    const cellW = canvas.width / GRID_COLS;
    const cellH = canvas.height / GRID_ROWS;
    const col = Math.floor(mouseX / cellW);
    const row = Math.floor(mouseY / cellH);
    const index = row * GRID_COLS + col;
    if (index >= 0 && index < manifest.length) return index;
    return -1;
    }

    document.getElementById('treemap-canvas').addEventListener('mousemove', (e) => {
        const rect = e.target.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = getHoveredRect(mx, my);
        if (hit !== hoveredIndex) {
        hoveredIndex = hit;
        drawHeatmap();
        }
    });

    document.getElementById('treemap-canvas').addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = e.target.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = getHoveredRect(mx, my);
        if (hit === -1) return;

        const delta = e.deltaY * -0.0008;
        setWeight(hit, weights[hit] + delta);         // ✓ use hit directly
        drawHeatmap();
        broadcastWeights();
    }, {passive: false});

    //------------Reset Button----------------//
   // document.getElementById('reset-btn').addEventListener('click', () => {
        //weights = manifest.map(() => 1 / manifest.length);
        //drawHeatmap();
        //window.api.send('reshuffle', {});
    //});
    
//------------Init----------------//
  window.addEventListener('resize', () => {
    drawHeatmap();
  });

  // Run init directly — don't nest inside 'load'
    (async () => {
    await document.fonts.ready;
    manifest = await window.api.getManifest();
    weights = manifest.map(() => 1 / manifest.length);
    buildNoteMapping();
    requestAnimationFrame(() => {
        drawHeatmap();
    });
    await initMIDI();
})();
});