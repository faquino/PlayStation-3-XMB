'use strict';
// Mouse and keyboard stand-in for the controller: the pointer crossing a virtual icon grid and the arrow keys send
// D-pad steps, dragging moves a virtual Sixaxis. Created by `index.html`, polled by `particles-reverse.js`.

(function () {
  const ICON_COLUMNS = 7; // category icons across the screen
  const ICON_ROWS = 7; // item icons down the screen
  // The XMB's step directions, in the order the particle system takes them.
  const LEFT = 0;
  const RIGHT = 1;
  const UP = 2;
  const DOWN = 3;
  const KEYS = { ArrowLeft: LEFT, ArrowRight: RIGHT, ArrowUp: UP, ArrowDown: DOWN };
  const MAX_QUEUED = 8;
  // The PPU reads the sensors as (raw - 511) / 512, and at rest the Sixaxis's y reads 399 in the savestates: 1 g.
  const SENSOR_PER_G = 112 / 512;
  const DRAG_SMOOTHING_SEC = 0.03;

  window.createXmbInput = function createXmbInput(canvas, settings) {
    let slotX = null;
    let slotY = null;
    const steps = []; // directions sent since the last poll
    // The arrow key being held, once the browser starts repeating it: the XMB repeats it from then on, in the
    // particle system, which counts the console's frames.
    let held = -1;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let dragX = 0; // pointer travel while dragging since the last poll, in screen heights
    let dragY = 0;
    let velX = 0; // smoothed controller velocity, screen heights per second
    let velY = 0;
    // x, y and z of the accelerometer and the gyro, in the PPU's units; at rest only gravity reads.
    const sensor = [0, -SENSOR_PER_G, 0, 0];

    function overUi(target) {
      return !!(target && target.closest && target.closest('.settings-layer-host'));
    }

    function send(dir, times) {
      for (let i = 0; i < times && steps.length < MAX_QUEUED; i++) steps.push(dir);
    }

    function clamp1(v) { return Math.max(-1, Math.min(1, v)); }

    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    function endDrag() { dragging = false; }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', function () {
      endDrag();
      held = -1;
    });

    window.addEventListener('pointermove', function (e) {
      const h = window.innerHeight || 1;
      if (dragging) {
        dragX += (e.clientX - lastX) / h;
        dragY += (e.clientY - lastY) / h;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      if (overUi(e.target)) {
        slotX = slotY = null;
        return;
      }
      const sx = Math.floor((e.clientX / (window.innerWidth || 1)) * ICON_COLUMNS);
      const sy = Math.floor((e.clientY / h) * ICON_ROWS);
      if (slotX !== null && sx !== slotX) send(sx > slotX ? RIGHT : LEFT, Math.abs(sx - slotX));
      if (slotY !== null && sy !== slotY) send(sy > slotY ? DOWN : UP, Math.abs(sy - slotY));
      slotX = sx;
      slotY = sy;
    });

    window.addEventListener('pointerleave', function () { slotX = slotY = null; });

    window.addEventListener('keydown', function (e) {
      if (overUi(document.activeElement)) return;
      const dir = KEYS[e.key];
      if (dir === undefined) return;
      if (!e.repeat) {
        send(dir, 1);
        held = -1;
      } else {
        held = dir;
      }
    });

    window.addEventListener('keyup', function (e) {
      if (KEYS[e.key] === held) held = -1;
    });

    // Called once per rendered frame: the steps sent since the last call, the direction held, and the Sixaxis's
    // reading.
    function poll(dtSec) {
      const dt = Math.max(dtSec, 1e-3);

      // The drag moves the controller: its acceleration reads on the accelerometer, in g through `mouseAccelToG`,
      // and its sideways speed turns it, which the gyro reads through `mouseYawGain`.
      const k = 1 - Math.exp(-dt / DRAG_SMOOTHING_SEC);
      const prevX = velX;
      const prevY = velY;
      velX += (dragX / dt - velX) * k;
      velY += (dragY / dt - velY) * k;
      dragX = dragY = 0;
      const toG = settings.mouseAccelToG;
      const accelRight = ((velX - prevX) / dt) * toG;
      const accelUp = (-(velY - prevY) / dt) * toG;
      sensor[0] = clamp1(accelRight * SENSOR_PER_G);
      sensor[1] = clamp1(-(1 + accelUp) * SENSOR_PER_G);
      sensor[2] = 0;
      sensor[3] = clamp1(velX * settings.mouseYawGain);

      const out = { steps: steps.slice(), held, sensor };
      steps.length = 0;
      return out;
    }

    return { poll };
  };
})();
