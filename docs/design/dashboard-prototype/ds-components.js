/* @ds-bundle: {"format":4,"namespace":"GoCastDesignSystem_78b1a8","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"ListRow","sourcePath":"components/core/ListRow.jsx"},{"name":"Segmented","sourcePath":"components/core/Segmented.jsx"},{"name":"StatTile","sourcePath":"components/core/StatTile.jsx"},{"name":"StatusLamp","sourcePath":"components/core/StatusLamp.jsx"},{"name":"Switch","sourcePath":"components/core/Switch.jsx"},{"name":"TextField","sourcePath":"components/core/TextField.jsx"},{"name":"Sheet","sourcePath":"components/navigation/Sheet.jsx"},{"name":"TabBar","sourcePath":"components/navigation/TabBar.jsx"},{"name":"LevelMeter","sourcePath":"components/studio/LevelMeter.jsx"},{"name":"NowPlaying","sourcePath":"components/studio/NowPlaying.jsx"},{"name":"TalkButton","sourcePath":"components/studio/TalkButton.jsx"},{"name":"TalkPad","sourcePath":"components/studio/TalkPad.jsx"}],"sourceHashes":{"components/core/Button.jsx":"56ac8c0256ce","components/core/Card.jsx":"fb03e1f909e3","components/core/ListRow.jsx":"8d6b4e4f7250","components/core/Segmented.jsx":"b2118408eb5b","components/core/StatTile.jsx":"8b1de6e36716","components/core/StatusLamp.jsx":"27d05164213e","components/core/Switch.jsx":"3d8e60971b50","components/core/TextField.jsx":"9328c4c5b21a","components/navigation/Sheet.jsx":"fc3883a02f3f","components/navigation/TabBar.jsx":"a09ec2305798","components/studio/LevelMeter.jsx":"75bf8fb1706a","components/studio/NowPlaying.jsx":"bc21d4779fa5","components/studio/TalkButton.jsx":"630b89cde8ee","components/studio/TalkPad.jsx":"820cd6c3042c"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.GoCastDesignSystem_78b1a8 = window.GoCastDesignSystem_78b1a8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const V = {
  primary: {
    background: 'var(--gc-fg-1)',
    color: 'var(--gc-bg)',
    border: '0'
  },
  live: {
    background: 'var(--gc-live)',
    color: 'var(--gc-live-ink)',
    border: '0'
  },
  ghost: {
    background: 'transparent',
    color: 'var(--gc-fg-1)',
    border: '1.5px solid var(--gc-line-strong)'
  },
  subtle: {
    background: 'rgba(244,241,236,.08)',
    color: 'var(--gc-fg-1)',
    border: '0'
  },
  onair: {
    background: 'transparent',
    color: 'var(--gc-onair-soft)',
    border: '1.5px solid rgba(155,123,255,.4)'
  },
  pro: {
    background: 'var(--gc-warn)',
    color: 'var(--gc-warn-ink)',
    border: '0'
  }
};
const S = {
  m: [52, 16, 16],
  l: [58, 18, 16],
  xl: [64, 20, 18]
};
function Button({
  variant = 'primary',
  size = 'l',
  dot,
  dotColor,
  full = true,
  disabled,
  children,
  style,
  ...rest
}) {
  const v = V[variant] || V.primary,
    [h, r, fs] = S[size] || S.l;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled
  }, rest, {
    style: {
      height: h,
      borderRadius: r,
      padding: '0 20px',
      width: full ? '100%' : 'auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      font: `700 ${fs}px var(--font-body)`,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      ...v,
      ...style
    }
  }), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: dotColor || v.color
    }
  }), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const T = {
  default: 'var(--gc-surface-1)',
  onair: 'var(--gc-onair-tint)',
  live: 'var(--gc-live)',
  inset: 'var(--gc-bg)'
};
function Card({
  tone = 'default',
  size = 'm',
  children,
  style,
  ...rest
}) {
  const r = {
    s: 18,
    m: 22,
    l: 26,
    hero: 28
  }[size] || 22;
  const p = {
    s: 14,
    m: 16,
    l: 16,
    hero: 20
  }[size] || 16;
  return /*#__PURE__*/React.createElement("div", _extends({}, rest, {
    style: {
      background: T[tone] || T.default,
      color: tone === 'live' ? 'var(--gc-live-ink)' : 'var(--gc-fg-1)',
      borderRadius: r,
      padding: p,
      display: 'flex',
      flexDirection: 'column',
      gap: size === 'hero' ? 16 : 12,
      ...style
    }
  }), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/ListRow.jsx
try { (() => {
function ListRow({
  title,
  meta,
  leading,
  trailing,
  first,
  onClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 0',
      borderTop: first ? '0' : '1px solid var(--gc-line)',
      cursor: onClick ? 'pointer' : 'default'
    }
  }, leading, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '600 15px var(--font-body)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 12px var(--font-body)',
      color: 'var(--gc-fg-3)'
    }
  }, meta)), typeof trailing === 'string' ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 13px var(--font-mono)',
      color: 'var(--gc-fg-2)'
    }
  }, trailing) : trailing);
}
Object.assign(__ds_scope, { ListRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ListRow.jsx", error: String((e && e.message) || e) }); }

// components/core/Segmented.jsx
try { (() => {
function Segmented({
  options,
  value,
  onChange,
  size = 'm'
}) {
  const h = size === 's' ? 30 : 40;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${options.length}, 1fr)`,
      gap: 3,
      background: size === 's' ? 'var(--gc-surface-1)' : 'var(--gc-bg)',
      borderRadius: size === 's' ? 12 : 14,
      padding: size === 's' ? 3 : 4
    }
  }, options.map(o => {
    const k = typeof o === 'string' ? o : o.value,
      l = typeof o === 'string' ? o : o.label,
      on = k === value;
    return /*#__PURE__*/React.createElement("span", {
      key: k,
      onClick: () => onChange && onChange(k),
      style: {
        height: h,
        padding: '0 11px',
        borderRadius: size === 's' ? 9 : 11,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        background: on ? 'var(--gc-fg-1)' : 'transparent',
        color: on ? 'var(--gc-bg)' : 'var(--gc-fg-2)',
        font: size === 's' ? '600 12px var(--font-mono)' : '600 14px var(--font-body)'
      }
    }, l);
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/core/StatTile.jsx
try { (() => {
function StatTile({
  label,
  value,
  sub,
  valueColor
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--gc-surface-1)',
      borderRadius: 18,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 11px var(--font-mono)',
      letterSpacing: '.06em',
      color: 'var(--gc-fg-3)',
      textTransform: 'uppercase'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: '700 26px/1 var(--font-display)',
      color: valueColor || 'var(--gc-fg-1)'
    }
  }, value), sub && /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 12px var(--font-body)',
      color: 'var(--gc-fg-3)'
    }
  }, sub));
}
Object.assign(__ds_scope, { StatTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatTile.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusLamp.jsx
try { (() => {
const M = {
  live: ['LIVE', 'var(--gc-live)', 'var(--gc-live-ink)'],
  mic: ['LIVE · MIC', 'var(--gc-live)', 'var(--gc-live-ink)'],
  onair: ['ON AIR · AUTODJ', 'var(--gc-onair)', 'var(--gc-onair-soft)'],
  silence: ['SILENCE', 'var(--gc-warn)', 'var(--gc-live-ink)'],
  off: ['OFF AIR', 'var(--gc-fg-3)', 'var(--gc-fg-2)']
};
function StatusLamp({
  state = 'live',
  variant = 'solid',
  label,
  children
}) {
  const [def, c, ink] = M[state] || M.off;
  const text = label || def;
  const solid = variant === 'solid';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      height: solid ? 30 : 'auto',
      padding: solid ? '0 12px' : 0,
      borderRadius: 10,
      background: solid ? c : 'transparent',
      color: solid ? state === 'off' ? 'var(--gc-fg-1)' : 'var(--gc-live-ink)' : ink,
      font: 'var(--type-mono-label)',
      letterSpacing: '.08em',
      whiteSpace: 'nowrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: solid ? 'currentColor' : c
    }
  }), text, children);
}
Object.assign(__ds_scope, { StatusLamp });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusLamp.jsx", error: String((e && e.message) || e) }); }

// components/core/Switch.jsx
try { (() => {
function Switch({
  checked,
  onChange,
  tone = 'live',
  disabled
}) {
  const on = tone === 'live' ? 'var(--gc-live)' : 'var(--gc-onair)';
  return /*#__PURE__*/React.createElement("span", {
    role: "switch",
    "aria-checked": !!checked,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: {
      width: 40,
      height: 24,
      borderRadius: 12,
      background: checked ? on : 'var(--gc-surface-4)',
      display: 'inline-flex',
      alignItems: 'center',
      padding: 3,
      boxSizing: 'border-box',
      justifyContent: checked ? 'flex-end' : 'flex-start',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: checked ? 'var(--gc-live-ink)' : 'var(--gc-fg-3)'
    }
  }));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Switch.jsx", error: String((e && e.message) || e) }); }

// components/core/TextField.jsx
try { (() => {
function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  error,
  trailing
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--gc-surface-1)',
      border: `1.5px solid ${error ? 'var(--gc-live)' : 'transparent'}`,
      borderRadius: 16,
      padding: '12px 16px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '600 12px var(--font-body)',
      color: 'var(--gc-fg-2)'
    }
  }, label), /*#__PURE__*/React.createElement("input", {
    type: type,
    value: value,
    onChange: onChange,
    placeholder: placeholder,
    style: {
      background: 'transparent',
      border: 0,
      outline: 'none',
      color: 'var(--gc-fg-1)',
      font: '500 17px var(--font-body)',
      padding: 0
    }
  })), trailing);
}
Object.assign(__ds_scope, { TextField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/TextField.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Sheet.jsx
try { (() => {
function Sheet({
  open,
  onClose,
  title,
  subtitle,
  action,
  children
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 5,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'absolute',
      inset: 0,
      background: 'var(--gc-scrim)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      background: 'var(--gc-sheet)',
      borderRadius: '30px 30px 0 0',
      padding: '10px 20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      maxHeight: '78%'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      alignSelf: 'center',
      width: 40,
      height: 5,
      borderRadius: 3,
      background: 'rgba(244,241,236,.2)'
    }
  }), (title || action) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-title-m)',
      letterSpacing: '-0.03em'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-mono-meta)',
      color: 'var(--gc-fg-3)'
    }
  }, subtitle)), action), children));
}
Object.assign(__ds_scope, { Sheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Sheet.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TabBar.jsx
try { (() => {
function TabBar({
  tabs,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
      padding: '6px 10px 0',
      borderTop: '1px solid var(--gc-line)',
      background: 'var(--gc-bg)'
    }
  }, tabs.map(t => {
    const on = t === value;
    return /*#__PURE__*/React.createElement("div", {
      key: t,
      onClick: () => onChange && onChange(t),
      style: {
        height: 54,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 34,
        height: 4,
        borderRadius: 2,
        background: on ? 'var(--gc-fg-1)' : 'transparent'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        font: '600 12px var(--font-body)',
        color: on ? 'var(--gc-fg-1)' : 'var(--gc-fg-3)'
      }
    }, t));
  }));
}
Object.assign(__ds_scope, { TabBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TabBar.jsx", error: String((e && e.message) || e) }); }

// components/studio/LevelMeter.jsx
try { (() => {
function LevelMeter({
  level = 0,
  segments = 30,
  onRed = false,
  height = 34
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 3,
      height,
      alignItems: 'flex-end'
    }
  }, Array.from({
    length: segments
  }, (_, i) => {
    const on = i / segments < level,
      hot = i >= segments - 3,
      warm = i >= segments - 6;
    const bg = onRed ? on ? hot ? '#FFF1E0' : 'var(--gc-live-ink)' : 'rgba(26,8,6,.22)' : on ? hot ? 'var(--gc-live)' : warm ? 'var(--gc-warn)' : 'var(--gc-ok)' : 'var(--gc-surface-4)';
    return /*#__PURE__*/React.createElement("span", {
      key: i,
      style: {
        flex: 1,
        borderRadius: 2,
        height: `${40 + i / (segments - 1) * 60}%`,
        background: bg
      }
    });
  }));
}
Object.assign(__ds_scope, { LevelMeter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/studio/LevelMeter.jsx", error: String((e && e.message) || e) }); }

// components/studio/NowPlaying.jsx
try { (() => {
function NowPlaying({
  title,
  artist,
  timeLeft,
  progress = 0,
  next,
  queueCount = 0,
  playing,
  onPlay,
  onSkip,
  onQueue,
  warn
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--gc-surface-1)',
      borderRadius: 26,
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 14,
      flex: 'none',
      background: 'repeating-linear-gradient(135deg,#2A2723 0 7px,#221F1C 7px 14px)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 3
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '700 18px var(--font-display)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 13px var(--font-body)',
      color: 'var(--gc-fg-2)'
    }
  }, artist)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-clock-m)',
      letterSpacing: '-0.03em',
      color: warn ? 'var(--gc-warn)' : 'var(--gc-fg-1)'
    }
  }, timeLeft), /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 10px var(--font-mono)',
      color: 'var(--gc-fg-3)',
      letterSpacing: '.08em'
    }
  }, "LEFT"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 5,
      borderRadius: 3,
      background: 'rgba(244,241,236,.08)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      width: `${progress * 100}%`,
      background: 'var(--gc-fg-1)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onQueue,
    style: {
      flex: 1,
      minWidth: 0,
      height: 48,
      borderRadius: 14,
      background: 'var(--gc-bg)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 12px',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: '600 10px var(--font-mono)',
      color: 'var(--gc-fg-3)'
    }
  }, "NEXT"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      font: '600 14px var(--font-body)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, next), /*#__PURE__*/React.createElement("span", {
    style: {
      font: '600 11px var(--font-mono)',
      color: 'var(--gc-bg)',
      background: 'var(--gc-fg-2)',
      borderRadius: 6,
      padding: '2px 6px'
    }
  }, queueCount)), /*#__PURE__*/React.createElement("div", {
    onClick: onSkip,
    style: {
      width: 48,
      height: 48,
      borderRadius: 14,
      background: 'var(--gc-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      font: '700 13px var(--font-mono)'
    }
  }, "\u25B8\u25B8"), /*#__PURE__*/React.createElement("div", {
    onClick: onPlay,
    style: {
      width: 64,
      height: 48,
      borderRadius: 14,
      background: 'var(--gc-fg-1)',
      color: 'var(--gc-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      font: '700 14px var(--font-body)'
    }
  }, playing ? 'II' : '▶')));
}
Object.assign(__ds_scope, { NowPlaying });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/studio/NowPlaying.jsx", error: String((e && e.message) || e) }); }

// components/studio/TalkButton.jsx
try { (() => {
function TalkButton({
  open = false,
  progress = 0,
  disabled,
  title,
  hint,
  onPress,
  onRelease
}) {
  const p = Math.max(0, Math.min(100, progress * 100));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 300,
      height: 300,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `conic-gradient(var(--gc-fg-1) 0 ${p}%, ${open ? '#2A1A17' : 'var(--gc-surface-3)'} ${p}% 100%)`,
      boxShadow: open ? 'var(--glow-live)' : 'none',
      transition: 'box-shadow var(--dur-base)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 282,
      height: 282,
      borderRadius: '50%',
      background: 'var(--gc-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onPointerDown: onPress,
    onPointerUp: onRelease,
    onPointerLeave: onRelease,
    onPointerCancel: onRelease,
    style: {
      width: open ? 252 : 264,
      height: open ? 252 : 264,
      borderRadius: '50%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      cursor: 'pointer',
      userSelect: 'none',
      touchAction: 'none',
      background: open ? 'var(--gc-live)' : 'var(--gc-surface-2)',
      color: open ? 'var(--gc-live-ink)' : disabled ? 'var(--gc-fg-3)' : 'var(--gc-fg-1)',
      boxShadow: open ? 'var(--shadow-button-live)' : 'var(--shadow-button-idle)',
      transition: 'all var(--dur-fast)'
    }
  }, !open && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 18,
      height: 30,
      borderRadius: 9,
      border: `3px solid ${disabled ? 'var(--gc-fg-3)' : 'var(--gc-live)'}`,
      boxSizing: 'border-box'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-display-m)',
      letterSpacing: '-0.03em'
    }
  }, title || (open ? 'You’re on' : disabled ? 'Music only' : 'Hold to talk')), /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 14px var(--font-body)',
      color: open ? 'var(--gc-live-deep)' : 'var(--gc-fg-2)'
    }
  }, hint || (open ? 'let go to close the mic' : 'music dips under you')))));
}
Object.assign(__ds_scope, { TalkButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/studio/TalkButton.jsx", error: String((e && e.message) || e) }); }

// components/studio/TalkPad.jsx
try { (() => {
const grille = c => `radial-gradient(circle, ${c} 1.1px, transparent 1.4px) 0 0 / 9px 9px`;
function TalkPad({
  state = 'idle',
  level = 0,
  title,
  hint,
  trailing,
  onPress,
  onRelease,
  style
}) {
  const [hover, setHover] = React.useState(false);
  const open = state === 'open',
    off = state === 'disabled',
    idle = !open && !off;
  const base = open ? 'var(--gc-live)' : off ? '#141210' : 'var(--gc-surface-1)';
  const bg = off ? base : `${grille(open ? 'rgba(26,8,6,.16)' : 'rgba(244,241,236,.075)')}, ${base}`;
  const ink = open ? 'var(--gc-live-ink)' : off ? 'var(--gc-fg-3)' : 'var(--gc-fg-1)';
  const sub = open ? 'var(--gc-live-deep)' : off ? 'var(--gc-fg-3)' : 'var(--gc-fg-2)';
  const marker = idle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
      font: "600 11px/1 'IBM Plex Mono', monospace",
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: 'var(--gc-fg-2)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: '#FF5A4E'
    }
  }), "Live while held");
  return /*#__PURE__*/React.createElement("div", {
    onPointerDown: onPress,
    onPointerUp: onRelease,
    onPointerLeave: e => {
      setHover(false);
      onRelease && onRelease(e);
    },
    onPointerEnter: () => setHover(true),
    onPointerCancel: onRelease,
    style: {
      borderRadius: 30,
      padding: 20,
      minHeight: 220,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 20,
      cursor: off ? 'default' : 'pointer',
      userSelect: 'none',
      touchAction: 'none',
      background: bg,
      boxShadow: idle && hover ? 'inset 0 0 0 1.5px rgba(255,90,78,.35)' : 'none',
      transition: 'background var(--dur-fast), box-shadow var(--dur-fast)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-display-m)',
      letterSpacing: '-0.035em',
      color: ink
    }
  }, title || (open ? 'You’re on' : off ? 'Music only' : 'Hold here to talk')), /*#__PURE__*/React.createElement("span", {
    style: {
      font: '500 14px/1.35 var(--font-body)',
      color: sub
    }
  }, hint || (open ? 'Let go to close the mic' : 'Press and hold anywhere here. The music dips while you talk.'))), trailing ?? marker), /*#__PURE__*/React.createElement(__ds_scope.LevelMeter, {
    level: level,
    onRed: open
  }));
}
Object.assign(__ds_scope, { TalkPad });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/studio/TalkPad.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.ListRow = __ds_scope.ListRow;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.StatTile = __ds_scope.StatTile;

__ds_ns.StatusLamp = __ds_scope.StatusLamp;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.TextField = __ds_scope.TextField;

__ds_ns.Sheet = __ds_scope.Sheet;

__ds_ns.TabBar = __ds_scope.TabBar;

__ds_ns.LevelMeter = __ds_scope.LevelMeter;

__ds_ns.NowPlaying = __ds_scope.NowPlaying;

__ds_ns.TalkButton = __ds_scope.TalkButton;

__ds_ns.TalkPad = __ds_scope.TalkPad;

})();
