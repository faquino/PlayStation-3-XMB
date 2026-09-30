'use strict';
// Lightweight DOM control-panel factory that introspects settings objects into sliders/select/reset controls and marks
// what was changed from the panel, and what something else set off its default. Shared by spline + particle configs
// (`spline-settings.js`, `particles-settings.js`) and initialized from `index.html`, which calls the returned
// `refresh()` when a theme or a sequence rewrites the settings.

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

    // Each setting's default: its value when the panel was made, which `index.html` does before any theme is applied.
    const base = Object.assign({}, settings);
    // What Reset returns to, setting by setting: the value the panel was made with, or the last one something other
    // than the panel wrote (see refresh). A row whose setting differs from it has been changed here, and is marked.
    const initial = Object.assign({}, settings);
    // Each setting as the panel last left it, which tells refresh() what something else has written since.
    const known = Object.assign({}, settings);
    // Who writes the settings from outside the panel now, as refresh() was last told: the rows it has set off their
    // defaults take its colour.
    let writer = null;
    const rows = [];
    const modified = new Set();
    const external = {}; // for each writer, the settings it has set off their defaults

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

    // The header counts the marked rows, with a pill for each colour; the button that brings a hidden panel back
    // counts the ones changed here.
    const externalPills = {};
    function showModifiedCount() {
      const n = modified.size;
      countEl.textContent = n + ' modified';
      countEl.hidden = n === 0;
      showBtn.textContent = 'Show ' + title + (n ? ' (' + n + ' modified)' : '');
      Object.keys(external).forEach(function (name) {
        let pill = externalPills[name];
        if (!pill) {
          pill = document.createElement('span');
          pill.className = 'settings-panel-count settings-panel-count-external';
          pill.dataset.source = name;
          titleEl.appendChild(pill);
          externalPills[name] = pill;
        }
        pill.textContent = external[name].size + ' by ' + name;
        pill.hidden = external[name].size === 0;
      });
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
      let valueView; // what shows the value, and carries its tooltip: the number beside a slider, or the select

      // A select writes strings, whatever type the setting started as. Numbers are the same within a billionth: the
      // end of a theme's blend, a + (b - a) x 1, can land a hair off b.
      function same(a, b) {
        if (isSelect) return String(a) === String(b);
        return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
      }

      // Amber if the value was changed here; if not, in the writer's colour where something else set it off its
      // default.
      function mark() {
        const mine = !same(settings[key], initial[key]);
        const from = !mine && !same(initial[key], base[key]) ? writer || 'outside' : null;
        row.classList.toggle('settings-row-modified', mine);
        row.classList.toggle('settings-row-external', from !== null);
        if (from) row.dataset.source = from;
        else delete row.dataset.source;
        resetBtn.disabled = !mine;
        resetBtn.title = mine ? 'Back to ' + describe(initial[key]) : '';
        if (mine) valueView.title = 'Changed from ' + describe(initial[key]);
        else valueView.title = from ? 'Default ' + describe(base[key]) : '';
        if (mine) modified.add(key);
        else modified.delete(key);
        Object.keys(external).forEach(function (name) { external[name].delete(key); });
        if (from) {
          if (!external[from]) external[from] = new Set();
          external[from].add(key);
        }
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
        valueView = select;
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
        valueView = valueEl;
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
      // Call after something other than the panel writes into the settings, naming it (`source`, say 'theme'): the
      // controls of the settings it wrote catch up, and the values they land on become what Reset returns to, in its
      // colour where they differ from the defaults. A setting changed from the panel and not written since keeps its
      // mark, and Reset still returns it to what it was. When the writer changes, every row set off its default takes
      // the new one's colour: here the theme and the sequences write the same settings, often to the same values.
      refresh: function refresh(source) {
        const handover = (source || null) !== writer;
        writer = source || null;
        rows.forEach(function (r) {
          const written = settings[r.key] !== known[r.key];
          if (written) {
            known[r.key] = settings[r.key];
            initial[r.key] = settings[r.key];
            r.sync();
          }
          if (written || handover) r.mark();
        });
        showModifiedCount();
      },
    };
  };
})();
