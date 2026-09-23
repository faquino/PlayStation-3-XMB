'use strict';

window.BG_GRADIENT_PRESETS_DAY = {
  '01': {
    angleDeg: 90.25,
    colorStart: [197, 197, 197, 255],
    colorEnd: [201, 201, 201, 255],
  },
  '02': {
    angleDeg: 67,
    colorStart: [203, 158, 13, 255],
    colorEnd: [219, 214, 41, 255],
  },
  '03': {
    angleDeg: 106,
    colorStart: [142, 190, 40, 255],
    colorEnd: [104, 168, 22, 255],
  },
  '04': {
    angleDeg: 136.75,
    colorStart: [216, 182, 182, 255],
    colorEnd: [231, 66, 117, 255],
  },
  '05': {
    angleDeg: 1.5,
    colorStart: [19, 108, 19, 255],
    colorEnd: [24, 156, 24, 255],
  },
  '06': {
    angleDeg: 148.75,
    colorStart: [198, 120, 238, 255],
    colorEnd: [103, 77, 161, 255],
  },
  '07': {
    angleDeg: 26.5,
    colorStart: [0, 167, 146, 255],
    colorEnd: [10, 240, 239, 255],
  },
  '08': {
    angleDeg: 62.5,
    colorStart: [0, 0, 95, 255],
    colorEnd: [33, 217, 255, 255],
  },
  '09': {
    angleDeg: 148.5,
    colorStart: [146, 44, 155, 255],
    colorEnd: [217, 98, 236, 255],
  },
  '10': {
    angleDeg: 128.5,
    colorStart: [227, 151, 15, 255],
    colorEnd: [224, 187, 2, 255],
  },
  '11': {
    angleDeg: 90,
    colorStart: [115, 68, 20, 255],
    colorEnd: [154, 118, 47, 255],
  },
  '12': {
    angleDeg: 170.5,
    colorStart: [236, 68, 45, 255],
    colorEnd: [214, 63, 43, 255],
  },
};

(function () {
  const day = window.BG_GRADIENT_PRESETS_DAY || {};
  const night = window.BG_GRADIENT_PRESETS_NIGHT || {};
  const monthKeys = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

  const merged = {
    default: {
      label: 'Original (RGB Sliders)',
      legacy: true,
    },
  };
  const options = [{ value: 'default', label: 'Original (RGB Sliders)' }];

  monthKeys.forEach(function (m) {
    if (day[m]) {
      merged[m + '_day'] = {
        label: m + ' (Day)',
        angleDeg: day[m].angleDeg,
        colorStart: day[m].colorStart.slice(),
        colorEnd: day[m].colorEnd.slice(),
      };
      options.push({ value: m + '_day', label: m + ' (Day)' });
    }
    if (night[m]) {
      merged[m + '_night'] = {
        label: m + ' (Night)',
        angleDeg: night[m].angleDeg,
        colorStart: night[m].colorStart.slice(),
        colorEnd: night[m].colorEnd.slice(),
      };
      options.push({ value: m + '_night', label: m + ' (Night)' });
    }
  });

  // The XMB never switches month in one step. Its background shader, `lib/moyou/back_colours0.fpo`,
  // takes four of these textures at once - `_MonthlyTex1Day`, `_MonthlyTex2Day`, `_MonthlyTex1Night`
  // and `_MonthlyTex2Night` - and a frame capture has exactly the running month and the next one
  // resident, so it walks from one month's colour to the next across the month. Its `_MonthTime`
  // uniform reads the day of the month minus one and `_NightDayBlend` mixes the day pair with the
  // night pair; both were read live out of RPCS3 savestates. BACKGROUND_REVERSE_ENGINEER.md records
  // the measurements and what stays modelled here: the shape of both walks.
  merged.auto = { label: 'Auto (date and time)', auto: true };
  options.splice(1, 0, { value: 'auto', label: 'Auto (date and time)' });

  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const DUSK_START = 17.25;
  const DUSK_END = 20.25;

  function daysInMonth(month, year) {
    if (month !== 1) return MONTH_DAYS[month];
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  }

  // 1 in full daylight, 0 at night. Measured on 23 September: 1 at 16:54, 0.069 at 20:02, 0.018 at
  // 20:11 and 0 by 22:55, a straight line into night that ends around 20:15. The dawn ramp is that
  // one mirrored about noon, which is only known to be over by 07:52, where a savestate reads 1.
  function dayness(date) {
    const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
    if (hour >= DUSK_END || hour <= 24 - DUSK_END) return 0;
    if (hour >= 24 - DUSK_START && hour <= DUSK_START) return 1;
    if (hour < 12) return (hour - (24 - DUSK_END)) / (DUSK_END - DUSK_START);
    return (DUSK_END - hour) / (DUSK_END - DUSK_START);
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function mixAngle(a, b, t) {
    return a + (((b - a + 540) % 360) - 180) * t;
  }

  function mixColor(a, b, t) {
    return [
      Math.round(mix(a[0], b[0], t)),
      Math.round(mix(a[1], b[1], t)),
      Math.round(mix(a[2], b[2], t)),
      Math.round(mix(a[3] === undefined ? 255 : a[3], b[3] === undefined ? 255 : b[3], t)),
    ];
  }

  function walkMonth(table, thisMonth, nextMonth, t) {
    const a = table[thisMonth];
    const b = table[nextMonth];
    if (!a || !b) return a || b || null;
    return {
      angleDeg: mixAngle(a.angleDeg, b.angleDeg, t),
      colorStart: mixColor(a.colorStart, b.colorStart, t),
      colorEnd: mixColor(a.colorEnd, b.colorEnd, t),
    };
  }

  // The gradient the XMB would be showing at `date`: this month walked towards the next, in the day
  // tables and in the night ones, and those two mixed by the time of day.
  window.bgGradientForDate = function bgGradientForDate(date) {
    const when = date || new Date();
    const thisMonth = monthKeys[when.getMonth()];
    const nextMonth = monthKeys[(when.getMonth() + 1) % 12];
    const walked = (when.getDate() - 1) / daysInMonth(when.getMonth(), when.getFullYear());
    const lit = walkMonth(day, thisMonth, nextMonth, walked);
    const dark = walkMonth(night, thisMonth, nextMonth, walked);
    if (!lit || !dark) return lit || dark;
    const k = dayness(when);
    return {
      angleDeg: mixAngle(dark.angleDeg, lit.angleDeg, k),
      colorStart: mixColor(dark.colorStart, lit.colorStart, k),
      colorEnd: mixColor(dark.colorEnd, lit.colorEnd, k),
    };
  };

  window.BG_GRADIENT_PRESETS = merged;
  window.BG_GRADIENT_PRESET_OPTIONS = options;
})();
