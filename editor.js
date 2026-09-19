/* Trailmakers Logic Editor – core logic */
(function () {
  'use strict';

  // ===================== BLOCK DEFINITIONS =====================
  const BLOCK_DEFS = {
    distance:  { name: 'Distance Sensor',  cat: 'sensor', icon: 'DS', ins: 0, outs: 1, complexity: 0, desc: 'Raycast distance' },
    altitude:  { name: 'Altitude Sensor',  cat: 'sensor', icon: 'AS', ins: 0, outs: 1, complexity: 0, desc: 'Altitude (m)' },
    position:  { name: 'Position Sensor',  cat: 'sensor', icon: 'PS', ins: 0, outs: 1, complexity: 0, desc: 'Lat / Lon' },
    speed:     { name: 'Speed Sensor',     cat: 'sensor', icon: 'SS', ins: 0, outs: 1, complexity: 0, desc: 'Speed (m/s)' },
    gravity:   { name: 'Gravity Sensor',   cat: 'sensor', icon: 'GS', ins: 0, outs: 1, complexity: 0, desc: 'Gravity strength' },
    angle:     { name: 'Angle Sensor',     cat: 'sensor', icon: '∠S', ins: 0, outs: 1, complexity: 0, desc: 'Tilt angle' },
    compass:   { name: 'Compass',          cat: 'sensor', icon: 'N',  ins: 0, outs: 1, complexity: 0, desc: 'Heading' },
    aiming:    { name: 'Aiming Sensor',    cat: 'sensor', icon: '◎',  ins: 0, outs: 1, complexity: 0, desc: 'Camera angle' },

    and:  { name: 'AND Gate',  cat: 'gate', icon: '&',  ins: 1, outs: 1, complexity: 1, desc: 'All inputs on' },
    or:   { name: 'OR Gate',   cat: 'gate', icon: '∨',  ins: 1, outs: 1, complexity: 1, desc: 'Any input on' },
    xor:  { name: 'XOR Gate',  cat: 'gate', icon: '⊕',  ins: 1, outs: 1, complexity: 1, desc: 'Exactly one on' },
    nor:  { name: 'NOR Gate',  cat: 'gate', icon: '↓',  ins: 1, outs: 1, complexity: 1, desc: 'No inputs on' },

    compare:    { name: 'Comparison',     cat: 'math', icon: '≶',  ins: 1, outs: 1, complexity: 1, desc: 'Compare to threshold' },
    accum:      { name: 'Accumulator',    cat: 'math', icon: '∑',  ins: 1, outs: 1, complexity: 1, desc: 'Increment / store' },
    randomizer: { name: 'Randomizer',     cat: 'math', icon: '🎲', ins: 1, outs: 1, complexity: 1, desc: 'Random values' },
    arith:      { name: 'Arithmetics',    cat: 'math', icon: '+',  ins: 1, outs: 1, complexity: 1, desc: 'Math operations' },
    functions:  { name: 'Functions',      cat: 'math', icon: 'ƒ',  ins: 1, outs: 1, complexity: 1, desc: 'sin, cos, abs…' },
    aggregate:  { name: 'Aggregate',      cat: 'math', icon: 'Σ',  ins: 1, outs: 1, complexity: 1, desc: 'sum / min / max' },
    display:    { name: 'Number Display', cat: 'math', icon: '#',  ins: 1, outs: 1, complexity: 0, desc: 'Show value' },

    hue: { name: 'Hue Light Panel', cat: 'visual', icon: '💡', ins: 1, outs: 0, complexity: 0, desc: 'Color from input' },
  };

  const CATEGORIES = [
    { id: 'sensor', title: 'Sensors' },
    { id: 'gate',   title: 'Logic Gates' },
    { id: 'math',   title: 'Math Blocks' },
    { id: 'visual', title: 'Visual' },
  ];

  // ===================== STATE =====================
  let blocks = [];
  let connections = []; // { id, fromId, toId }
  let selectedId = null;
  let nextId = 1;
  let nextConnId = 1;
  let isRunning = false;
  let evalTick = 0;

  // Pan state
  let panX = 0, panY = 0;
  let isPanning = false;
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

  // Drag block
  let dragBlock = null;
  let dragOffset = { x: 0, y: 0 };

  // Connection state – simplified two-click model
  let connectFrom = null; // { blockId, isOutput, portEl }

  // ===================== DOM =====================
  const paletteEl    = document.getElementById('palette');
  const canvasEl     = document.getElementById('canvas');
  const canvasWrap   = document.getElementById('canvas-wrap');
  const worldEl      = document.getElementById('world');
  const wiresSvg     = document.getElementById('wires');
  const panelBody    = document.getElementById('panel-body');
  const panelTitle   = document.getElementById('panel-title');
  const statusText   = document.getElementById('status-text');
  const statusMode   = document.getElementById('status-mode');
  const emptyHint    = document.getElementById('empty-hint');
  const toastEl      = document.getElementById('toast');
  const debugLog     = document.getElementById('debug-log');
  const complexityEl = document.getElementById('complexity-val');
  const palettePanel = document.getElementById('palette-panel');
  const sidePanel    = document.getElementById('side-panel');

  // Connection banner
  const connectBanner = document.createElement('div');
  connectBanner.className = 'connect-banner';
  connectBanner.textContent = 'Click an IN port to complete the wire (Esc to cancel)';
  canvasWrap.appendChild(connectBanner);

  // ===================== PAN / TRANSFORM =====================
  function applyPan() {
    worldEl.style.transform = `translate(${panX}px, ${panY}px)`;
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvasWrap.getBoundingClientRect();
    return {
      x: clientX - rect.left - panX,
      y: clientY - rect.top  - panY
    };
  }

  // ===================== PALETTE =====================
  function buildPalette() {
    CATEGORIES.forEach(cat => {
      const section = document.createElement('div');
      section.className = 'category';
      section.innerHTML = `<div class="category-title">${cat.title}</div>`;
      Object.entries(BLOCK_DEFS)
        .filter(([, d]) => d.cat === cat.id)
        .forEach(([type, def]) => {
          const item = document.createElement('div');
          item.className = 'block-item';
          item.draggable = true;
          item.dataset.type = type;
          item.innerHTML = `<div class="block-icon icon-${cat.id}">${def.icon}</div><span>${def.name}</span>`;
          item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', type);
            e.dataTransfer.effectAllowed = 'copy';
          });
          section.appendChild(item);
        });
      paletteEl.appendChild(section);
    });
  }

  // ===================== DROP =====================
  canvasWrap.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  canvasWrap.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!type || !BLOCK_DEFS[type]) return;
    const w = screenToWorld(e.clientX, e.clientY);
    addBlock(type, Math.max(20, w.x - 75), Math.max(20, w.y - 30));
  });

  // ===================== BLOCK CRUD =====================
  function addBlock(type, x, y) {
    const def = BLOCK_DEFS[type];
    const id = nextId++;
    const block = {
      id, type, x, y,
      value: 0,
      sensorValue: 0.5,
      threshold: 0.5,
      debug: false,
      lastInputs: [],
    };
    blocks.push(block);
    renderBlock(block);
    updateStatus();
    emptyHint.style.display = 'none';
    selectBlock(id);
    toast(`Added ${def.name}`);
  }

  function removeBlock(id) {
    connections = connections.filter(c => c.fromId !== id && c.toId !== id);
    blocks = blocks.filter(b => b.id !== id);
    const el = document.getElementById(`block-${id}`);
    if (el) el.remove();
    if (selectedId === id) { selectedId = null; showDefaultPanel(); }
    drawWires();
    updateStatus();
    if (blocks.length === 0) emptyHint.style.display = 'block';
  }

  function selectBlock(id) {
    document.querySelectorAll('.logic-block').forEach(el => el.classList.remove('selected'));
    selectedId = id;
    if (id != null) {
      const el = document.getElementById(`block-${id}`);
      if (el) el.classList.add('selected');
      if (!isRunning) showProps(id);
    } else if (!isRunning) {
      showDefaultPanel();
    }
  }

  // ===================== RENDER BLOCK =====================
  function renderBlock(block) {
    const def = BLOCK_DEFS[block.type];
    let el = document.getElementById(`block-${block.id}`);
    if (!el) {
      el = document.createElement('div');
      el.id = `block-${block.id}`;
      el.className = 'logic-block';
      el.dataset.id = block.id;
      canvasEl.appendChild(el);

      // Block drag (not on ports)
      el.addEventListener('pointerdown', e => {
        if (e.target.classList.contains('port') || e.target.closest('.debug-toggle')) return;
        if (isRunning || connectFrom) return;
        e.preventDefault();
        e.stopPropagation();
        selectBlock(block.id);
        dragBlock = block;
        const rect = el.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        el.setPointerCapture(e.pointerId);
      });
    }

    el.style.left = block.x + 'px';
    el.style.top  = block.y + 'px';
    el.classList.toggle('running', isRunning);
    el.classList.toggle('debug-on', block.debug);

    const valClass = block.value > 0.001 ? 'pos' : block.value < -0.001 ? 'neg' : 'zero';
    const displayVal = Number.isFinite(block.value) ? block.value.toFixed(3) : '0';

    let hueHtml = '';
    if (block.type === 'hue') {
      hueHtml = `<div class="hue-preview" style="background:${hueColor(block.value)}"></div>`;
    }

    const inPort = def.ins > 0 ? `
      <div class="port-group">
        <div class="port input ${hasIncoming(block.id) ? 'connected' : ''}"
             data-port="in" data-id="${block.id}" title="Input – click to connect"></div>
        <span class="port-label">IN</span>
      </div>` : '<div></div>';

    const outPort = def.outs > 0 ? `
      <div class="port-group">
        <div class="port output ${hasOutgoing(block.id) ? 'connected' : ''}"
             data-port="out" data-id="${block.id}" title="Output – click to start wire"></div>
        <span class="port-label">OUT</span>
      </div>` : '<div></div>';

    el.innerHTML = `
      <div class="block-header">
        <div class="block-icon icon-${def.cat}" style="width:18px;height:18px;font-size:0.58rem">${def.icon}</div>
        ${def.name}
      </div>
      <div class="block-body">
        ${def.desc}
        <div class="block-value ${valClass}">${displayVal}</div>
        ${hueHtml}
        <label class="debug-toggle">
          <input type="checkbox" ${block.debug ? 'checked' : ''} data-id="${block.id}">
          Debug
        </label>
      </div>
      <div class="ports-row">
        ${inPort}
        ${outPort}
      </div>
    `;

    // Port click handlers – use click (not mousedown) for reliability
    el.querySelectorAll('.port').forEach(port => {
      port.addEventListener('click', onPortClick);
      port.addEventListener('pointerdown', e => e.stopPropagation()); // don't start block drag
    });

    const dbg = el.querySelector('.debug-toggle input');
    if (dbg) {
      dbg.addEventListener('change', e => {
        block.debug = e.target.checked;
        el.classList.toggle('debug-on', block.debug);
        if (block.debug) logDebug(`Debug enabled for ${def.name} #${block.id}`);
      });
      dbg.addEventListener('pointerdown', e => e.stopPropagation());
    }
  }

  function hasIncoming(id) { return connections.some(c => c.toId === id); }
  function hasOutgoing(id) { return connections.some(c => c.fromId === id); }

  function updateBlockDisplay(block) {
    const el = document.getElementById(`block-${block.id}`);
    if (!el) return;
    const valEl = el.querySelector('.block-value');
    if (valEl) {
      valEl.textContent = Number.isFinite(block.value) ? block.value.toFixed(3) : '0';
      valEl.className = 'block-value ' + (block.value > 0.001 ? 'pos' : block.value < -0.001 ? 'neg' : 'zero');
    }
    const inP  = el.querySelector('.port.input');
    const outP = el.querySelector('.port.output');
    if (inP)  inP.classList.toggle('connected', hasIncoming(block.id));
    if (outP) outP.classList.toggle('connected', hasOutgoing(block.id));
    if (block.type === 'hue') {
      const prev = el.querySelector('.hue-preview');
      if (prev) prev.style.background = hueColor(block.value);
    }
  }

  function hueColor(x) {
    if (Math.abs(x) < 1e-6) return '#000';
    if (x > 0) {
      const h = ((x % 1) + 1) % 1 * 360;
      return `hsl(${h}, 100%, 50%)`;
    }
    const g = Math.round((1 - (Math.abs(x) % 1)) * 255);
    return `rgb(${g},${g},${g})`;
  }

  // ===================== CONNECTION (two-click, reliable) =====================
  function onPortClick(e) {
    e.stopPropagation();
    e.preventDefault();
    if (isRunning) return;

    const portEl = e.currentTarget;
    const blockId = +portEl.dataset.id;
    const isOutput = portEl.dataset.port === 'out';

    if (!connectFrom) {
      // Start a connection – prefer starting from OUT
      connectFrom = { blockId, isOutput, portEl };
      portEl.classList.add('connecting');
      canvasWrap.classList.add('connecting-mode');
      connectBanner.classList.add('show');
      connectBanner.textContent = isOutput
        ? 'Click an IN port to complete the wire (Esc to cancel)'
        : 'Click an OUT port to complete the wire (Esc to cancel)';
      toast(isOutput ? 'Select target IN port' : 'Select source OUT port');
      return;
    }

    // Complete connection
    const a = connectFrom;
    const b = { blockId, isOutput };

    // Must be opposite types
    if (a.isOutput === b.isOutput) {
      toast(a.isOutput ? 'Need an IN port' : 'Need an OUT port');
      // allow re-targeting: switch start to this port
      a.portEl.classList.remove('connecting');
      connectFrom = { blockId, isOutput, portEl };
      portEl.classList.add('connecting');
      connectBanner.textContent = isOutput
        ? 'Click an IN port to complete the wire (Esc to cancel)'
        : 'Click an OUT port to complete the wire (Esc to cancel)';
      return;
    }

    const fromId = a.isOutput ? a.blockId : b.blockId;
    const toId   = a.isOutput ? b.blockId : a.blockId;

    if (fromId === toId) {
      toast('Cannot connect a block to itself');
      cancelConnect();
      return;
    }

    const exists = connections.some(c => c.fromId === fromId && c.toId === toId);
    if (exists) {
      toast('Already connected');
      cancelConnect();
      return;
    }

    connections.push({ id: nextConnId++, fromId, toId });
    drawWires();
    updateBlockDisplay(blocks.find(x => x.id === fromId));
    updateBlockDisplay(blocks.find(x => x.id === toId));
    toast('Connected ✓');
    cancelConnect();
  }

  function cancelConnect() {
    if (connectFrom) {
      connectFrom.portEl.classList.remove('connecting');
      connectFrom = null;
    }
    canvasWrap.classList.remove('connecting-mode');
    connectBanner.classList.remove('show');
    drawWires();
  }

  function getPortCenter(blockId, isOutput) {
    const el = document.getElementById(`block-${blockId}`);
    if (!el) return { x: 0, y: 0 };
    const port = el.querySelector(`.port.${isOutput ? 'output' : 'input'}`);
    if (!port) return { x: 0, y: 0 };
    // Port is inside the world, so offsetLeft/Top relative to block + block position
    const blockRect = { x: el.offsetLeft, y: el.offsetTop };
    const portOffsetX = port.offsetLeft + port.offsetWidth / 2;
    const portOffsetY = port.offsetTop  + port.offsetHeight / 2;
    // Walk up to account for nested positioning
    let px = port.offsetLeft + port.offsetWidth / 2;
    let py = port.offsetTop  + port.offsetHeight / 2;
    let node = port.offsetParent;
    while (node && node !== canvasEl) {
      px += node.offsetLeft;
      py += node.offsetTop;
      node = node.offsetParent;
    }
    return { x: px, y: py };
  }

  function drawWires() {
    wiresSvg.innerHTML = '';
    // Make SVG large enough
    wiresSvg.setAttribute('width', '8000');
    wiresSvg.setAttribute('height', '8000');

    connections.forEach(c => {
      const from = getPortCenter(c.fromId, true);
      const to   = getPortCenter(c.toId, false);
      const d = makeWirePath(from.x, from.y, to.x, to.y);

      // Visible wire
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke', 'var(--wire)');
      p.setAttribute('stroke-width', '2.5');
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      p.style.filter = 'drop-shadow(0 0 3px rgba(78,203,255,0.35))';
      p.style.pointerEvents = 'none';
      wiresSvg.appendChild(p);

      // Invisible wider hit path for click-to-delete
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', d);
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '14');
      hit.setAttribute('fill', 'none');
      hit.classList.add('wire-hit');
      hit.style.pointerEvents = 'stroke';
      hit.style.cursor = 'pointer';
      hit.addEventListener('click', ev => {
        ev.stopPropagation();
        if (isRunning) return;
        connections = connections.filter(x => x.id !== c.id);
        drawWires();
        blocks.forEach(updateBlockDisplay);
        toast('Wire removed');
      });
      wiresSvg.appendChild(hit);
    });

    // Preview line while connecting
    if (connectFrom) {
      // will be updated on pointermove
    }
  }

  function makeWirePath(x1, y1, x2, y2) {
    const dx = Math.max(50, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  // ===================== POINTER: pan + block drag + connect preview =====================
  canvasWrap.addEventListener('pointerdown', e => {
    // Only pan on empty space (not on blocks/ports)
    if (e.target.closest('.logic-block') || e.target.closest('.port')) return;
    if (connectFrom) return; // don't pan while connecting
    if (e.button !== 0) return;

    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, panX, panY };
    canvasWrap.classList.add('panning');
    canvasWrap.setPointerCapture(e.pointerId);
    selectBlock(null);
  });

  document.addEventListener('pointermove', e => {
    // Pan
    if (isPanning) {
      panX = panStart.panX + (e.clientX - panStart.x);
      panY = panStart.panY + (e.clientY - panStart.y);
      applyPan();
      return;
    }

    // Block drag
    if (dragBlock && !isRunning) {
      const w = screenToWorld(e.clientX, e.clientY);
      dragBlock.x = w.x - dragOffset.x;
      dragBlock.y = w.y - dragOffset.y;
      const el = document.getElementById(`block-${dragBlock.id}`);
      if (el) {
        el.style.left = dragBlock.x + 'px';
        el.style.top  = dragBlock.y + 'px';
      }
      drawWires();
      return;
    }
  });

  document.addEventListener('pointerup', e => {
    if (isPanning) {
      isPanning = false;
      canvasWrap.classList.remove('panning');
    }
    dragBlock = null;
  });

  // ===================== KEYBOARD =====================
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      cancelConnect();
      selectBlock(null);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId != null && !isRunning) {
      if (document.activeElement.tagName !== 'INPUT') removeBlock(selectedId);
    }
  });

  // ===================== PANEL RESIZERS =====================
  function setupResizer(resizerEl, panelEl, side) {
    let startX, startW;
    resizerEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      startX = e.clientX;
      startW = panelEl.getBoundingClientRect().width;
      resizerEl.classList.add('active');
      resizerEl.setPointerCapture(e.pointerId);

      const onMove = ev => {
        const dx = ev.clientX - startX;
        let newW = side === 'left' ? startW + dx : startW - dx;
        newW = Math.max(140, Math.min(side === 'left' ? 420 : 500, newW));
        panelEl.style.width = newW + 'px';
      };
      const onUp = () => {
        resizerEl.classList.remove('active');
        resizerEl.releasePointerCapture(e.pointerId);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }
  setupResizer(document.getElementById('resizer-left'),  palettePanel, 'left');
  setupResizer(document.getElementById('resizer-right'), sidePanel,    'right');

  // ===================== PANEL UI =====================
  function showDefaultPanel() {
    panelTitle.textContent = isRunning ? 'Sensor Inputs' : 'Properties';
    if (isRunning) showSensorControls();
    else panelBody.innerHTML = `<p style="color:var(--text-dim);font-size:0.8rem">Select a block or press Run to control sensors.</p>`;
  }

  function showProps(id) {
    if (isRunning) return;
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    const def = BLOCK_DEFS[block.type];
    panelTitle.textContent = def.name;
    let html = `
      <div class="prop-group">
        <div class="prop-label">Type / Complexity</div>
        <div class="prop-value">${def.name} · <span style="color:var(--accent)">${def.complexity}</span></div>
      </div>
      <div class="prop-group">
        <div class="prop-label">Description</div>
        <div class="prop-value">${def.desc}</div>
      </div>
      <div class="prop-group">
        <div class="prop-label">Current Output</div>
        <div class="prop-value">${block.value.toFixed(4)}</div>
      </div>
    `;
    if (def.cat === 'sensor') {
      html += `
        <div class="prop-group">
          <div class="prop-label">Simulated value</div>
          <div class="slider-row">
            <input type="range" min="-1" max="1" step="0.01" value="${block.sensorValue}" data-id="${id}" class="prop-slider">
            <span class="slider-val">${block.sensorValue.toFixed(2)}</span>
          </div>
        </div>`;
    }
    if (block.type === 'compare') {
      html += `
        <div class="prop-group">
          <div class="prop-label">Threshold</div>
          <div class="slider-row">
            <input type="range" min="-2" max="2" step="0.01" value="${block.threshold}" data-id="${id}" data-prop="threshold" class="prop-slider">
            <span class="slider-val">${block.threshold.toFixed(2)}</span>
          </div>
        </div>`;
    }
    panelBody.innerHTML = html;
    panelBody.querySelectorAll('.prop-slider').forEach(sl => {
      sl.addEventListener('input', e => {
        const b = blocks.find(x => x.id === +e.target.dataset.id);
        if (!b) return;
        const prop = e.target.dataset.prop || 'sensorValue';
        b[prop] = parseFloat(e.target.value);
        e.target.nextElementSibling.textContent = b[prop].toFixed(2);
        if (prop === 'sensorValue') { b.value = b.sensorValue; updateBlockDisplay(b); }
      });
    });
  }

  function showSensorControls() {
    panelTitle.textContent = 'Sensor Inputs';
    const sensors = blocks.filter(b => BLOCK_DEFS[b.type].cat === 'sensor');
    if (sensors.length === 0) {
      panelBody.innerHTML = `<p style="color:var(--text-dim);font-size:0.8rem">No sensors on the blueprint.</p>`;
      return;
    }
    panelBody.innerHTML = sensors.map(b => {
      const def = BLOCK_DEFS[b.type];
      return `
        <div class="sensor-control">
          <h4>${def.icon} ${def.name} <small style="opacity:0.55">#${b.id}</small></h4>
          <div class="slider-row">
            <input type="range" min="-1" max="1" step="0.01" value="${b.sensorValue}" data-id="${b.id}" class="run-slider">
            <span class="slider-val">${b.sensorValue.toFixed(2)}</span>
          </div>
        </div>`;
    }).join('');
    panelBody.querySelectorAll('.run-slider').forEach(sl => {
      sl.addEventListener('input', e => {
        const b = blocks.find(x => x.id === +e.target.dataset.id);
        if (!b) return;
        b.sensorValue = parseFloat(e.target.value);
        e.target.nextElementSibling.textContent = b.sensorValue.toFixed(2);
        evaluate();
      });
    });
  }

  // ===================== SIMULATION =====================
  function evaluate() {
    evalTick++;
    const byId = Object.fromEntries(blocks.map(b => [b.id, b]));
    const inputsMap = {};
    blocks.forEach(b => inputsMap[b.id] = []);
    connections.forEach(c => {
      const src = byId[c.fromId];
      if (src) inputsMap[c.toId].push(src.value);
    });

    for (let pass = 0; pass < 10; pass++) {
      blocks.forEach(b => {
        const def = BLOCK_DEFS[b.type];
        const ins = inputsMap[b.id] || [];
        const sum = ins.reduce((a, v) => a + v, 0);
        b.lastInputs = [...ins];

        if (def.cat === 'sensor') {
          b.value = b.sensorValue;
        } else if (def.cat === 'gate') {
          const active = ins.filter(v => Math.abs(v) > 1e-6);
          let on = false;
          if (b.type === 'and') on = ins.length > 0 && active.length === ins.length;
          else if (b.type === 'or')  on = active.length > 0;
          else if (b.type === 'xor') on = active.length === 1;
          else if (b.type === 'nor') on = active.length === 0;
          b.value = on ? Math.max(-1, Math.min(1, sum !== 0 ? sum : 1)) : 0;
        } else if (b.type === 'compare') {
          const lhs = sum;
          if (Math.abs(lhs - b.threshold) < 0.0005) b.value = 1;
          else b.value = lhs > b.threshold ? 1 : 0;
        } else if (b.type === 'randomizer') {
          if (Math.abs(sum) > 1e-6) b.value = Math.random() * 2 - 1;
        } else if (b.type === 'display' || b.type === 'aggregate' || b.type === 'hue') {
          b.value = sum;
        } else if (b.type === 'arith' || b.type === 'accum') {
          b.value = Math.max(-1, Math.min(1, sum));
        } else if (b.type === 'functions') {
          b.value = Math.abs(sum);
        } else {
          b.value = sum;
        }
      });

      blocks.forEach(b => inputsMap[b.id] = []);
      connections.forEach(c => {
        const src = byId[c.fromId];
        if (src) inputsMap[c.toId].push(src.value);
      });
    }

    blocks.forEach(b => {
      if (!b.debug) return;
      const def = BLOCK_DEFS[b.type];
      const inStr = b.lastInputs.length ? b.lastInputs.map(v => v.toFixed(3)).join(', ') : '—';
      logDebug(
        `<span class="dbg-name">${def.name}#${b.id}</span> ` +
        `<span class="dbg-in">IN[${inStr}]</span> → ` +
        `<span class="dbg-out">OUT ${b.value.toFixed(4)}</span>`
      );
    });

    blocks.forEach(updateBlockDisplay);
  }

  function logDebug(html) {
    const line = document.createElement('div');
    line.className = 'dbg-line';
    line.innerHTML = `<span style="opacity:0.45">[${evalTick}]</span> ${html}`;
    debugLog.appendChild(line);
    debugLog.scrollTop = debugLog.scrollHeight;
    while (debugLog.children.length > 200) debugLog.removeChild(debugLog.firstChild);
  }

  document.getElementById('btn-clear-debug').addEventListener('click', () => {
    debugLog.innerHTML = '';
  });

  // ===================== BUTTONS =====================
  document.getElementById('btn-run').addEventListener('click', () => {
    isRunning = true;
    document.getElementById('btn-run').style.display = 'none';
    document.getElementById('btn-stop').style.display = '';
    document.getElementById('btn-delete').disabled = true;
    document.getElementById('btn-clear').disabled = true;
    statusMode.textContent = '▶ Simulation running';
    statusMode.style.color = 'var(--positive)';
    blocks.forEach(b => {
      const el = document.getElementById(`block-${b.id}`);
      if (el) el.classList.add('running');
    });
    showSensorControls();
    evaluate();
    toast('Simulation started — adjust sensor sliders');
  });

  document.getElementById('btn-stop').addEventListener('click', () => {
    isRunning = false;
    document.getElementById('btn-run').style.display = '';
    document.getElementById('btn-stop').style.display = 'none';
    document.getElementById('btn-delete').disabled = false;
    document.getElementById('btn-clear').disabled = false;
    statusMode.textContent = 'Edit mode';
    statusMode.style.color = '';
    blocks.forEach(b => {
      const el = document.getElementById(`block-${b.id}`);
      if (el) el.classList.remove('running');
    });
    if (selectedId) showProps(selectedId);
    else showDefaultPanel();
    toast('Simulation stopped');
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (isRunning) return;
    if (blocks.length === 0) { toast('Blueprint already empty'); return; }
    if (!confirm('Clear entire blueprint?')) return;
    blocks.forEach(b => {
      const el = document.getElementById(`block-${b.id}`);
      if (el) el.remove();
    });
    blocks = [];
    connections = [];
    selectedId = null;
    nextId = 1;
    cancelConnect();
    drawWires();
    updateStatus();
    emptyHint.style.display = 'block';
    showDefaultPanel();
    toast('Blueprint cleared');
  });

  document.getElementById('btn-delete').addEventListener('click', () => {
    if (selectedId != null && !isRunning) removeBlock(selectedId);
  });

  // ===================== HELPERS =====================
  function updateStatus() {
    const complexity = blocks.reduce((s, b) => s + (BLOCK_DEFS[b.type]?.complexity || 0), 0);
    complexityEl.textContent = complexity;
    statusText.textContent =
      `Ready — ${blocks.length} block${blocks.length !== 1 ? 's' : ''}, ` +
      `${connections.length} wire${connections.length !== 1 ? 's' : ''}`;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  // ===================== BOOT =====================
  buildPalette();
  updateStatus();
  applyPan();
})();
