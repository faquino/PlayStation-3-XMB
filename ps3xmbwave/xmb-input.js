'use strict';
// Mouse and keyboard stand-in for the controller: the pointer crossing a virtual icon grid and the arrow keys press
// the D-pad, dragging moves a virtual Sixaxis. Created by `index.html`, polled by `particles-reverse.js`.

(function () {
  const ICON_COLUMNS = 7; // category icons across the screen
  const ICON_ROWS = 7; // item icons down the screen
  const DRAG_SMOOTHING_SEC = 0.03;

  window.createXmbInput = function createXmbInput(canvas, settings) {
    let slotX = null;
    let slotY = null;
    let stepsX = 0; // selection moves since the last poll, right and down positive
    let stepsY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let dragX = 0; // pointer travel while dragging since the last poll, in screen heights
    let dragY = 0;
    let velX = 0; // smoothed controller velocity, screen heights per second
    let velY = 0;

    function overUi(target) {
      return !!(target && target.closest && target.closest('.settings-layer-host'));
    }

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
    window.addEventListener('blur', endDrag);

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
      if (slotX !== null) stepsX += sx - slotX;
      if (slotY !== null) stepsY += sy - slotY;
      slotX = sx;
      slotY = sy;
    });

    window.addEventListener('pointerleave', function () { slotX = slotY = null; });

    window.addEventListener('keydown', function (e) {
      if (overUi(document.activeElement)) return;
      if (e.key === 'ArrowLeft') stepsX -= 1;
      else if (e.key === 'ArrowRight') stepsX += 1;
      else if (e.key === 'ArrowUp') stepsY -= 1;
      else if (e.key === 'ArrowDown') stepsY += 1;
    });

    // Called once per rendered frame. Accelerations are in g, with y up like the Sixaxis.
    function poll(dtSec) {
      const dt = Math.max(dtSec, 1e-3);
      const k = 1 - Math.exp(-dt / DRAG_SMOOTHING_SEC);
      const prevX = velX;
      const prevY = velY;
      velX += (dragX / dt - velX) * k;
      velY += (dragY / dt - velY) * k;
      dragX = dragY = 0;
      const toG = settings.mouseAccelToG;

      const ev = {
        stepsX,
        stepsY,
        accelX: ((velX - prevX) / dt) * toG,
        accelY: (-(velY - prevY) / dt) * toG,
      };
      stepsX = stepsY = 0;
      return ev;
    }

    return { poll };
  };
})();
