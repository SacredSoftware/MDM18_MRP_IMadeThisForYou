//------------Set Up Variables----------------//
let manifest = [];
let weights = [];
let treemapRects = [];
let hoveredIndex = -1;

let COLS = 9;

//------------Squarify Algorithm----------------//
function Squarify(items, bounds) {
    const total = items.reduce((s, item) => s + item.weight, 0);
    const rects = [];
    layoutRow(items, bounds, total, rects);
    return rects;
}

function layoutRow(items, bounds, total, rects) {
    if (items.length === 0) return;

    const {x, y, w, h} = bounds;
    const area = w * h;
    const shortSide = Math.min(w, h);

    let row = [];
    let rowSum = 0;
    let bestRatio = Infinity;
    let i = 0;

    while (i < items.length) {
        const item = items[i];
        const testRow = [...row, item];
        const testSum = rowSum + item.weight;
        const ratio = worstRatio(testRow, testSum, shortSide, area, total);

        if (row.length > 0 && ratio > bestRatio) break;

        row = testRow;
        rowSum = testSum;
        bestRatio = ratio;
        i++;
    }

    placeRow(row, rowSum, bounds, total, area, rects);

    const remaining = items.slice(row.length);
    if (remaining.length === 0) return;

    const rowFraction = rowSum / total;
    let newBounds;
    if (w >= h) {
        const rowW = w * rowFraction;
        newBounds = {x: x + rowW, y, w: w - rowW, h};
    } else {
        const rowH = h * rowFraction; 
        newBounds = {x, y: y + rowH, w, h: h - rowH};
    }

    layoutRow(remaining, newBounds, total - rowSum, rects);
}
function worstRatio(row, rowSum, shortSide, area, total) {
  const rowArea = (rowSum / total) * area;
  const rowLength = rowArea / shortSide;
  let worst = 0;
  for (const item of row) {
    const itemArea = (item.weight / total) * area;
    const itemSide = itemArea / rowLength;
    const ratio = Math.max(rowLength / itemSide, itemSide / rowLength);
    if (ratio > worst) worst = ratio;
  }
  return worst;
}

function placeRow(row, rowSum, bounds, total, area, rects) {
    const {x, y, w, h} = bounds; 
    const rowFraction = rowSum / total;
    const isWide = w >= h;
    const rowLength = isWide ? w * rowFraction : h * rowFraction;

    let cursor = isWide ? y : x;

    for (const item of row) {
        const itemFraction = item.weight / rowSum;
        const itemLength = (isWide ? h : w) * itemFraction;

        rects.push({
            label: item.label,
            index: item.index,
            x: isWide ? x : cursor,
            y: isWide ? cursor : y, 
            w: isWide ? rowLength : itemLength, 
            h: isWide ? itemLength : rowLength
        });
        
        cursor += itemLength;
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
function rebuildTreemap() {
    const canvas = document.getElementById('treemap-canvas');
    const container = document.getElementById('treemap-container');
    const items = manifest.map((m, i) => ({
        label: m.label,
        index: i,
        weight: weights[i]
    }));
    treemapRects = Squarify(items, {
        x: 0, y: 0,
        w: container.offsetWidth,
        h: container.offsetHeight
    });
}

function broadcastWeights() {
    window.api.send('weight-changed', { weights: weights});
}

//------------Drawing the Window----------------//
const COLORS = [
  '#e05c5c','#e07a5c','#e0a45c','#e0c95c','#c9e05c',
  '#8fe05c','#5ce07a','#5ce0a4','#5ce0c9','#5ccfe0',
  '#5caee0','#5c8fe0','#5c6fe0','#7a5ce0','#a45ce0',
  '#c95ce0','#e05cc9','#e05ca4','#e05c7a','#e05c5c'
];

function drawTreemap() {
    const canvas = document.getElementById('treemap-canvas');
    const container = document.getElementById('treemap-container');
    const ctx = canvas.getContext('2d');

    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    treemapRects.forEach((rect, i) => {
        const isHovered = rect.index === hoveredIndex;
        const baseColor = COLORS[rect.index % COLORS.length];

        ctx.fillStyle = isHovered
            ? lightenColor(baseColor, 0.25)
            : baseColor;
        
        ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);

        const pct = (weights[rect.index] * 100).toFixed(1) + '%';
        const minSize = 44;

        if (rect.w > minSize && rect.h > minSize) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const fontSize = Math.max(9, Math.min(13, rect.w / 8));
            ctx.font = `${fontSize}px 'Courier New', monospace`;
            ctx.fillText(rect.label, rect.x + rect.w / 2, rect.y + rect.h / 2 - fontSize * 0.6);

            ctx.font = `${fontSize * 0.85}px 'Courier New', monospace`;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.fillText(pct, rect.x + rect.w / 2, rect.y + rect.h / 2 + fontSize * 0.8);
        }
    });
}

function lightenColor(hex, amount) {
    const num = parseInt(hex.slice(1), 16); 
    const r = Math.min(255, (num >> 16) + Math.round(255 * amount));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
    const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
    return `rgb(${r},${g},${b})`;
}

//--LOADING DOM CONTETNT BEFORE FUNCTIONS------------// 
window.addEventListener('DOMContentLoaded', () => {
    //------------Canvas Interaction----------------//
    function getHoveredRect(mouseX, mouseY) {
        for (let i = 0; i < treemapRects.length; i++) {
            const r = treemapRects[i];
            if (mouseX >= r.x && mouseX <= r.x + r.w &&
                mouseY >= r.y && mouseY <= r.y + r.h) {
                return i;
            }
        }
        return -1;
    }

    document.getElementById('treemap-canvas').addEventListener('mousemove', (e) => {
        const rect = e.target.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = getHoveredRect(mx, my);
        if (hit !== hoveredIndex) {
        hoveredIndex = hit;
        drawTreemap();
        }
    });

    document.getElementById('treemap-canvas').addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = e.target.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = getHoveredRect(mx, my);
        if (hit === -1) return;

        const rectData = treemapRects[hit];
        const delta = e.deltaY * -0.0008;
        setWeight(rectData.index, weights[rectData.index] + delta);
        rebuildTreemap();
        drawTreemap();
        broadcastWeights();
    }, {passive: false});

    //------------Density Slider----------------//
    const densitySlider = document.getElementById('density-slider');
    const densityReadout = document.getElementById('density-readout');

    densitySlider.addEventListener('input', (e) => {
        COLS = parseInt(e.target.value);
        const ROWS = Math.round(COLS * (16 / 9));
        const TOTAL = COLS * ROWS;
        densityReadout.textContent = `${COLS} * ${ROWS} - ${TOTAL} cells`;
        window.api.send('grid-density-changed', {cols:COLS});
    });

    //------------Reset Button----------------//
    document.getElementById('reset-btn').addEventListener('click', () => {
        weights = manifest.map(() => 1 / manifest.length);
        rebuildTreemap();
        drawTreemap();
        window.api.send('reshuffle', {});
    });
    
//------------Init----------------//
  window.addEventListener('resize', () => {
    rebuildTreemap();
    drawTreemap();
  });

  // Run init directly — don't nest inside 'load'
    (async () => {
    manifest = await window.api.getManifest();
    weights = manifest.map(() => 1 / manifest.length);
    requestAnimationFrame(() => {
        rebuildTreemap();
        drawTreemap();
    });
    })();

}); // closes DOMContentLoaded
