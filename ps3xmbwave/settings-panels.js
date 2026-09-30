'use strict';
// Lightweight DOM control-panel factory that introspects settings objects into sliders/select/reset controls and marks
// what was changed from the panel. Shared by spline + particle configs (`spline-settings.js`, `particles-settings.js`)
// and initialized from `index.html`, which calls the returned `refresh()` when a theme rewrites the settings.

(function () {
  function decimalsFromStep(step) {
    const s = String(step);
    const idx = s.indexOf('.');
    return idx === -1 ? 0 : Math.min(6, s.length - idx - 1);
  }

  function humanizeKey(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); });
  }

  function inferMeta(value) {
    const abs = Math.max(Math.abs(value), 1);
    return { min: value - abs * 2, max: value + abs * 2, step: abs / 200 };
  }

  function setPosition(el, pos) {
    if (!pos) return;
    if (pos.top != null) el.style.top = String(pos.top);
    if (pos.right != null) el.style.right = String(pos.right);
    if (pos.bottom != null) el.style.bottom = String(pos.bottom);
    if (pos.left != null) el.style.left = String(pos.left);
  }

  function getUiLayerRoot() {
    let root = document.getElementById('ui-layer-root');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'ui-layer-root';
    root.className = 'ui-layer-root';
    document.body.appendChild(root);
    return root;
  }

  window.createSettingsPanel = function createSettingsPanel(options) {
    const id = options && options.id;
    const title = options && options.title;
    const settings = options && options.settings;
    const metaMap = (options && options.meta) || {};
    const panelPos = options && options.position;
    const showPos = options && options.showPosition;

    if (!id || !title || !settings || typeof settings !== 'object') return;
    if (document.getElementById(id)) return;

    // What Reset returns to, setting by setting: the value the panel was made with, or the last one something other
    // than the panel wrote (see refresh). A row whose setting differs from it has been changed here, and is marked.
    const initial = Object.assign({}, settings);
    // Each setting as the panel last left it, which tells refresh() what something else has written since.
    const known = Object.assign({}, settings);
    const rows = [];
    const modified = new Set();

    const panel = document.createElement('div');
    panel.id = id;
    panel.className = 'settings-panel';
    setPosition(panel, panelPos);

    const header = document.createElement('div');
    header.className = 'settings-panel-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'settings-panel-title';
    titleEl.textContent = title;

    const countEl = document.createElement('span');
    countEl.className = 'settings-panel-count';
    titleEl.appendChild(countEl);

    const hideBtn = document.createElement('button');
    hideBtn.className = 'settings-btn';
    hideBtn.type = 'button';
    hideBtn.textContent = 'Hide';

    const list = document.createElement('div');
    list.className = 'settings-panel-list';

    const showBtn = document.createElement('button');
    showBtn.id = id + '-show';
    showBtn.className = 'settings-btn settings-show-btn';
    showBtn.type = 'button';
    setPosition(showBtn, showPos || panelPos);

    // The header, and the button that brings a hidden panel back, count the marked rows.
    function showModifiedCount() {
      const n = modified.size;
      countEl.textContent = n + ' modified';
      countEl.hidden = n === 0;
      showBtn.textContent = 'Show ' + title + (n ? ' (' + n + ' modified)' : '');
    }

    hideBtn.addEventListener('click', function () {
      panel.classList.add('hidden');
      showBtn.style.display = 'block';
    });

    showBtn.addEventListener('click', function () {
      panel.classList.remove('hidden');
      showBtn.style.display = 'none';
    });

    Object.keys(settings).forEach(function (key) {
      const value = settings[key];
      const meta = metaMap[key] || {};
      const isSelect = meta.type === 'select';
      const isNumber = typeof value === 'number' && Number.isFinite(value);
      if (!isSelect && !isNumber) return;

      const row = document.createElement('div');
      row.className = 'settings-row';

      const left = document.createElement('div');
      const label = document.createElement('div');
      label.className = 'settings-label';
      label.textContent = humanizeKey(key);

      const controls = document.createElement('div');
      controls.className = 'settings-controls';

      const resetBtn = document.createElement('button');
      resetBtn.className = 'settings-btn';
      resetBtn.type = 'button';
      resetBtn.textContent = 'Reset';

      let sync; // brings the control up to the setting
      let describe; // a value as the control would show it, for the tooltips

      // A select writes strings, whatever type the setting started as.
      function same(a, b) {
        return isSelect ? String(a) === String(b) : a === b;
      }

      function mark() {
        const changed = !same(settings[key], initial[key]);
        row.classList.toggle('settings-row-modified', changed);
        resetBtn.disabled = !changed;
        label.title = changed ? 'Changed from ' + describe(initial[key]) : '';
        resetBtn.title = changed ? 'Back to ' + describe(initial[key]) : '';
        if (changed) modified.add(key);
        else modified.delete(key);
      }

      // After the panel itself writes the setting.
      function written() {
        known[key] = settings[key];
        mark();
        showModifiedCount();
      }

      if (isSelect) {
        const select = document.createElement('select');
        select.className = 'settings-select';
        const options = Array.isArray(meta.options) ? meta.options : [];
        options.forEach(function (optDef) {
          const opt = document.createElement('option');
          if (optDef && typeof optDef === 'object') {
            opt.value = String(optDef.value);
            opt.textContent = String(optDef.label != null ? optDef.label : optDef.value);
          } else {
            opt.value = String(optDef);
            opt.textContent = String(optDef);
          }
          select.appendChild(opt);
        });
        select.value = String(value);

        select.addEventListener('change', function () {
          settings[key] = select.value;
          written();
        });

        resetBtn.addEventListener('click', function () {
          settings[key] = initial[key];
          select.value = String(initial[key]);
          written();
        });

        sync = function () { select.value = String(settings[key]); };
        describe = function (v) {
          const opt = Array.prototype.find.call(select.options, function (o) { return o.value === String(v); });
          return opt ? opt.textContent : String(v);
        };
        controls.appendChild(select);
      } else {
        const numMeta = metaMap[key] || inferMeta(value);
        const decimals = Number.isFinite(numMeta.decimals) ? numMeta.decimals : decimalsFromStep(numMeta.step);

        const slider = document.createElement('input');
        slider.className = 'settings-slider';
        slider.type = 'range';
        slider.min = String(numMeta.min);
        slider.max = String(numMeta.max);
        slider.step = String(numMeta.step);
        slider.value = String(value);

        const valueEl = document.createElement('span');
        valueEl.className = 'settings-value';
        function formatValue() {
          return Number(settings[key]).toFixed(decimals);
        }
        valueEl.textContent = formatValue();

        slider.addEventListener('input', function () {
          settings[key] = parseFloat(slider.value);
          valueEl.textContent = formatValue();
          written();
        });

        resetBtn.addEventListener('click', function () {
          settings[key] = initial[key];
          slider.value = String(initial[key]);
          valueEl.textContent = formatValue();
          written();
        });

        sync = function () {
          slider.value = String(settings[key]);
          valueEl.textContent = formatValue();
        };
        // In full, since the slider's step can round away what tells the two apart.
        describe = function (v) { return String(Number(Number(v).toPrecision(6))); };
        controls.appendChild(slider);
        controls.appendChild(valueEl);
      }

      left.appendChild(label);
      left.appendChild(controls);

      row.appendChild(left);
      row.appendChild(resetBtn);
      list.appendChild(row);
      rows.push({ key: key, sync: sync, mark: mark });
      mark();
    });

    header.appendChild(titleEl);
    header.appendChild(hideBtn);
    panel.appendChild(header);
    panel.appendChild(list);
    showModifiedCount();

    const root = getUiLayerRoot();
    const host = document.createElement('div');
    host.id = id + '-layer';
    host.className = 'settings-layer-host';
    host.appendChild(panel);
    host.appendChild(showBtn);
    root.appendChild(host);

    return {
      // Call after something other than the panel writes into the settings, such as a theme change: the controls of
      // the settings it wrote catch up, and the values they land on become what Reset returns to, unmarked. A setting
      // changed from the panel and not written since keeps its mark, and Reset still returns it to what it was.
      refresh: function refresh() {
        rows.forEach(function (r) {
          if (settings[r.key] === known[r.key]) return;
          known[r.key] = settings[r.key];
          initial[r.key] = settings[r.key];
          r.sync();
          r.mark();
        });
        showModifiedCount();
      },
    };
  };
})();
