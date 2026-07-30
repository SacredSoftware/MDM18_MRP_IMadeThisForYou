//------------Set Up Variables----------------//
let manifest = [];
let weights = [];
let hoveredIndex = -1;

let COLS = 9;

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

        ctx.fillStyle = weightToColor(weights[i], isHovered);
        ctx.fillRect(x + pad, y + pad, cellW - pad * 2, cellH - pad * 2)

        const pct = (weights[i] * 100).toFixed(1) + '%';
        const labelSize = Math.max(9, Math.min(13, cellW / 8));

        ctx.fillStyle = `rgba(255,255,255,${0.4 + weights[i] * 0.6})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${labelSize}px 'Courier New', monospace`;
        ctx.fillText(m.label, x + cellW / 2, y + cellH / 2 - labelSize * 0.6);

        ctx.font = `${labelSize * 0.85}px 'Courier New', monospace`;
        ctx.fillStyle = `rgba(255,255,255,${0.3 + weights[i] * 0.5})`;
        ctx.fillText(pct, x + cellW / 2, y + cellH / 2 + labelSize * 0.8);
    });
}
function weightToColor(weight, isHovered) {
    const lightness = 8 + Math.round(weight * 57);
    const saturation = isHovered ? 95 : 70;
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
    document.getElementById('reset-btn').addEventListener('click', () => {
        weights = manifest.map(() => 1 / manifest.length);
        drawHeatmap();
        window.api.send('reshuffle', {});
    });
    
//------------Init----------------//
  window.addEventListener('resize', () => {
    drawHeatmap();
  });

  // Run init directly — don't nest inside 'load'
    (async () => {
    manifest = await window.api.getManifest();
    weights = manifest.map(() => 1 / manifest.length);
    requestAnimationFrame(() => {
        drawHeatmap();
    });
    })();

});
