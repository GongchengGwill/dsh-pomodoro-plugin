// React is the injected closure symbol of this dynamic client half; no require/import here.
//
// Snapshot contract (producer and reader must stay in sync):
//   snapshot() => { config: { work, rest, total, autoStart, sound },
//                   mode, nextMode, round, running, remaining, total, autoStartAt }
// The component reads it as `value.<field>`.
//
// Store contract: subscribe() appends to a live array and returns a remover; notify()
// iterates a copy and NEVER discards the array, so subscriptions survive every notification.

const MODE_META = {
  working: { label: '专注中', emoji: '🎧' },
  resting: { label: '休息中', emoji: '😴' },
  celebrate: { label: '时间到', emoji: '🎉' },
  idle: { label: '待开始', emoji: '🐳' },
  finished: { label: '全部完成', emoji: '🏆' }
}

function pad(n) {
  return (n < 10 ? '0' : '') + n
}

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return pad(Math.floor(total / 60)) + ':' + pad(total % 60)
}

function numLike(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function clamp(value, min, max) {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

const POS_KEY = 'pomodoro-widget-pos'

const CSS = `
.pomo-fab {
  position: fixed; right: 22px; bottom: 22px; z-index: 60;
  width: 58px; height: 58px; border-radius: 50%; padding: 0; overflow: hidden;
  display: flex; align-items: flex-end; justify-content: center;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));
  background: var(--dsw-alias-bg-overlay, #fff);
  color: var(--dsw-alias-label-primary, #111);
  box-shadow: 0 10px 28px rgba(0,0,0,.22); cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none;
  transition: box-shadow .18s ease;
}
.pomo-fab:hover { box-shadow: 0 14px 34px rgba(0,0,0,.3); }
.pomo-fab--drag { cursor: grabbing; box-shadow: 0 20px 46px rgba(0,0,0,.38); }
.pomo-fab__badge {
  position: absolute; top: 2px; right: 1px; min-width: 20px; height: 18px;
  padding: 0 4px; border-radius: 9px; box-sizing: border-box;
  background: var(--dsw-alias-brand-primary, #e4572e); color: #fff;
  font: 700 10px/18px ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,.28);
  pointer-events: none;
}
.pomo-pill {
  position: fixed; right: 22px; bottom: 22px; z-index: 60;
  display: flex; align-items: center; gap: 10px;
  padding: 6px 10px 6px 8px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));
  background: var(--dsw-alias-bg-overlay, #fff);
  color: var(--dsw-alias-label-primary, #111);
  box-shadow: 0 10px 28px rgba(0,0,0,.22);
}
.pomo-pill__grip {
  display: flex; align-items: center; gap: 9px; cursor: grab;
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.pomo-pill--drag .pomo-pill__grip { cursor: grabbing; }
.pomo-pill__face {
  width: 36px; height: 36px; border-radius: 50%; overflow: hidden;
  display: flex; align-items: flex-end; justify-content: center;
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.1));
}
.pomo-pill__time {
  font: 700 17px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
.pomo-pill__count {
  font: 600 10px/1.2 ui-sans-serif, system-ui, sans-serif;
  color: var(--dsw-alias-label-secondary, #666); margin-top: 2px;
  white-space: nowrap;
}
.pomo-btn {
  font: 500 12px/1 ui-sans-serif, system-ui, sans-serif;
  padding: 7px 11px; border-radius: 8px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));
  background: transparent; color: var(--dsw-alias-label-primary, #111);
  transition: filter .15s ease;
}
.pomo-btn:hover { filter: brightness(1.06); background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.1)); }
.pomo-btn--primary {
  background: var(--dsw-alias-brand-primary, #e4572e);
  border-color: transparent; color: #fff; font-weight: 600;
}
.pomo-btn--primary:hover { background: var(--dsw-alias-brand-primary, #e4572e); filter: brightness(1.12); }
.pomo-btn--ghost { border-color: transparent; color: var(--dsw-alias-label-secondary, #666); }
.pomo-btn--sm { padding: 6px 9px; font-size: 11.5px; }
.pomo-panel {
  position: fixed; z-index: 61;
  width: 322px; max-width: calc(100vw - 24px);
  border-radius: 16px; overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));
  background: var(--dsw-alias-bg-overlay, #fff);
  color: var(--dsw-alias-label-primary, #111);
  box-shadow: 0 18px 48px rgba(0,0,0,.3);
  font: 400 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  animation: pomo-pop .16s ease-out;
}
@keyframes pomo-pop { from { opacity: 0; transform: translateY(8px) scale(.97); } to { opacity: 1; transform: none; } }
.pomo-head {
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  padding: 10px 10px 10px 13px;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;
}
.pomo-head--drag { cursor: grabbing; }
.pomo-head__title { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13px; }
.pomo-head__actions { display: flex; align-items: center; gap: 2px; }
.pomo-head__dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--dsw-alias-brand-primary, #e4572e);
}
.pomo-head__dot--live { animation: pomo-pulse 1.5s ease-in-out infinite; }
@keyframes pomo-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.68); opacity: .55; } }
.pomo-x {
  width: 26px; height: 26px; border-radius: 7px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid transparent; background: transparent;
  color: var(--dsw-alias-label-secondary, #666); font-size: 15px; line-height: 1;
}
.pomo-x:hover { background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary, #111); }
.pomo-body { padding: 12px 13px 15px; display: flex; flex-direction: column; align-items: center; }
.pomo-stage { width: 152px; height: 152px; position: relative; }
.pomo-stage__ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.pomo-stage__ring circle { fill: none; stroke-width: 7; stroke-linecap: round; }
.pomo-stage__track { stroke: var(--dsw-alias-border-l1, rgba(127,127,127,.22)); }
.pomo-stage__value { transition: stroke-dashoffset .28s linear; }
.pomo-stage__disc {
  position: absolute; inset: 9px; border-radius: 50%; overflow: hidden;
  display: flex; align-items: flex-end; justify-content: center;
  background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.09));
}
.pomo-stage__time {
  position: absolute; left: 0; right: 0; bottom: 5px; text-align: center;
  font: 700 16px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary, #111);
  text-shadow: 0 0 6px var(--dsw-alias-bg-overlay, #fff), 0 0 3px var(--dsw-alias-bg-overlay, #fff);
}
.pomo-mascot { display: block; }
.pomo-meta {
  margin-top: 11px; display: flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: var(--dsw-alias-label-secondary, #666);
}
.pomo-meta__mode { font-weight: 600; color: var(--dsw-alias-label-primary, #111); }
.pomo-dots { display: flex; gap: 5px; margin-top: 9px; flex-wrap: wrap; justify-content: center; }
.pomo-dot {
  width: 9px; height: 9px; border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.4));
  background: transparent; transition: background .2s ease;
}
.pomo-dot--done { background: var(--dsw-alias-brand-primary, #e4572e); border-color: transparent; }
.pomo-dot--now { background: var(--dsw-alias-state-warn-primary, #f0a020); border-color: transparent; }
.pomo-ctl { display: flex; gap: 8px; margin-top: 13px; width: 100%; }
.pomo-ctl .pomo-btn { flex: 1; text-align: center; padding: 9px 0; }
.pomo-preset { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }
.pomo-preset__btn { font-size: 11px; padding: 5px 9px; border-radius: 999px; }
.pomo-settings {
  border-top: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.18));
  padding: 12px 13px 14px; display: flex; flex-direction: column; gap: 11px;
}
.pomo-field { display: flex; flex-direction: column; gap: 5px; }
.pomo-field__head { display: flex; justify-content: space-between; align-items: baseline; }
.pomo-field__name { font-size: 12px; color: var(--dsw-alias-label-secondary, #666); }
.pomo-field__value {
  font: 700 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--dsw-alias-brand-primary, #e4572e);
}
.pomo-steps { display: flex; gap: 6px; align-items: center; }
.pomo-step {
  font: 600 11.5px/1 ui-sans-serif, system-ui, sans-serif;
  min-width: 30px; padding: 5px 9px; border-radius: 7px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));
  background: transparent; color: var(--dsw-alias-label-secondary, #666);
}
.pomo-step:hover { background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.1)); }
.pomo-check { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary, #666); cursor: pointer; }
.pomo-check input { cursor: pointer; }
.pomo-note { font-size: 11px; color: var(--dsw-alias-label-secondary, #666); opacity: .85; }
.pomo-celebrate {
  position: fixed; inset: 0; z-index: 70;
  display: flex; align-items: center; justify-content: center;
  background: rgba(9,9,11,.46); animation: pomo-fade .2s ease-out;
  backdrop-filter: blur(2px);
}
@keyframes pomo-fade { from { opacity: 0; } to { opacity: 1; } }
.pomo-celebrate__card {
  position: relative; width: 336px; max-width: calc(100vw - 32px);
  padding: 22px 24px 22px; border-radius: 20px; text-align: center; overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));
  background: var(--dsw-alias-bg-overlay, #fff);
  color: var(--dsw-alias-label-primary, #111);
  box-shadow: 0 24px 70px rgba(0,0,0,.42);
  font: 400 13px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  animation: pomo-zoom .3s cubic-bezier(.2,1.3,.4,1);
}
@keyframes pomo-zoom { from { opacity: 0; transform: scale(.82) translateY(14px); } to { opacity: 1; transform: none; } }
.pomo-celebrate__glow {
  position: absolute; left: 50%; top: -70px; width: 250px; height: 190px;
  margin-left: -125px; border-radius: 50%; opacity: .3; pointer-events: none;
  background: radial-gradient(circle, var(--dsw-alias-brand-primary, #e4572e), transparent 68%);
  animation: pomo-glow 2.4s ease-in-out infinite;
}
@keyframes pomo-glow { 0%,100% { opacity: .22; transform: scale(.92); } 50% { opacity: .42; transform: scale(1.06); } }
.pomo-celebrate__face { display: flex; justify-content: center; margin-bottom: 4px; }
.pomo-celebrate__title { position: relative; font-size: 19px; font-weight: 700; margin-bottom: 6px; }
.pomo-celebrate__text { position: relative; font-size: 13px; color: var(--dsw-alias-label-secondary, #666); }
.pomo-celebrate__actions { position: relative; display: flex; gap: 9px; justify-content: center; margin-top: 18px; }
.pomo-celebrate__actions .pomo-btn { padding: 9px 16px; border-radius: 10px; }
.pomo-confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.pomo-confetti__bit {
  position: absolute; top: -16px; width: 7px; height: 11px; border-radius: 2px; opacity: .9;
  animation: pomo-fall 2.7s linear infinite;
}
@keyframes pomo-fall {
  0% { transform: translateY(-20px) rotate(0deg); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: translateY(360px) rotate(560deg); opacity: 0; }
}
.pomo-sparkle { transform-origin: 62px 46px; animation: pomo-sparkle 1.05s ease-in-out infinite; }
@keyframes pomo-sparkle { 0%,100% { opacity: .2; transform: scale(.5) rotate(0deg); } 50% { opacity: 1; transform: scale(1.25) rotate(28deg); } }
.pomo-head-sway { transform-origin: 50% 92%; animation: pomo-bob 2s ease-in-out infinite; }
.pomo-head-sway--work { animation: pomo-bob 1.7s ease-in-out infinite; }
.pomo-head-sway--rest { animation: pomo-sway 4.2s ease-in-out infinite; }
.pomo-head-sway--idle { animation: pomo-bob 3.4s ease-in-out infinite; }
.pomo-head-sway--cheer { animation: pomo-cheer-jump .62s cubic-bezier(.28,.7,.4,1) infinite; }
@keyframes pomo-bob { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-4px) rotate(1deg); } }
@keyframes pomo-sway { 0%,100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@keyframes pomo-cheer-jump {
  0% { transform: translateY(0) scale(1,1); }
  18% { transform: translateY(3px) scale(1.08,.9); }
  56% { transform: translateY(-14px) scale(.97,1.05); }
  100% { transform: translateY(0) scale(1,1); }
}
.pomo-ribbon { transform-origin: 84% 30%; animation: pomo-flutter 1.6s ease-in-out infinite; }
@keyframes pomo-flutter { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-11deg); } }
.pomo-eyes { transform-origin: 50% 50%; animation: pomo-blink 4s ease-in-out infinite; }
@keyframes pomo-blink { 0%,94%,100% { transform: scaleY(1); } 97% { transform: scaleY(.1); } }
.pomo-eyes--closed { animation-name: pomo-squint; }
@keyframes pomo-squint { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(.86); } }
@keyframes pomo-float { 0%,100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-7px); opacity: 1; } }
.pomo-z { animation: pomo-float 3s ease-in-out infinite; }
.pomo-z--b { animation-duration: 3.6s; animation-delay: .7s; }
.pomo-sweat { animation: pomo-drop 2.4s ease-in-out infinite; }
@keyframes pomo-drop { 0%,100% { transform: translateY(0); opacity: .4; } 50% { transform: translateY(5px); opacity: 1; } }
.pomo-tip { animation: pomo-tip 1.8s ease-in-out infinite; }
@keyframes pomo-tip { 0%,100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-5px); opacity: 1; } }
@media (max-width: 420px) { .pomo-panel { width: 290px; } .pomo-stage { width: 136px; height: 136px; } }
@media (prefers-reduced-motion: reduce) {
  .pomo-head-sway, .pomo-eyes, .pomo-z, .pomo-sweat, .pomo-tip, .pomo-ribbon,
  .pomo-sparkle, .pomo-head__dot--live, .pomo-celebrate__glow, .pomo-confetti__bit {
    animation: none !important;
  }
}
`

// ---------------------------------------------------------------------------
// Original chibi bust, drawn from the style of the supplied reference only:
// slate-blue hair with lighter streaks, a cream frilled headdress with a blue
// ribbon, a navy + cream maid collar with a blue bow, huge dark eyes. The face
// is the whole character — no visible body — and every timer phase gets its own
// miniature expression. No official artwork is reproduced.
// ---------------------------------------------------------------------------
const HAIR = 'rgba(78,104,158,.96)'
const HAIR_DK = 'rgba(48,68,112,.98)'
const HAIR_LT = 'rgba(150,182,226,.95)'
const SKIN = 'rgba(255,228,214,.98)'
const SKIN_SH = 'rgba(238,192,178,.7)'
const NAVY = 'rgba(44,56,88,.98)'
const CREAM = 'rgba(248,246,238,.98)'
const CREAM_DK = 'rgba(206,210,226,.95)'
const BLUE = 'rgba(114,160,214,.96)'
const BLUE_DK = 'rgba(70,112,172,.98)'
const EYE = 'rgba(52,62,94,.98)'

function hairStrands(e, shifts) {
  const out = []
  for (let i = 0; i < shifts.length; i += 1) {
    out.push(e('path', {
      key: 'h' + i,
      d: 'M' + (50 + shifts[i]) + ' 40 q3 13 1 22',
      stroke: HAIR_LT, strokeWidth: 3, fill: 'none', strokeLinecap: 'round', opacity: .55
    }))
  }
  return out
}

function ChibiMascot(props) {
  const pose = props.pose || 'idle'
  const size = props.size || 80
  const e = React.createElement
  const cheer = pose === 'cheer'
  const rest = pose === 'rest'
  const work = pose === 'work'

  // ---------------------------------------------------------------- eyes
  let eyes
  if (rest) {
    // asleep: two soft downward arcs
    eyes = [
      e('path', { key: 'a', d: 'M38 70 q9 9 18 0', stroke: EYE, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' }),
      e('path', { key: 'b', d: 'M68 70 q9 9 18 0', stroke: EYE, strokeWidth: 3, fill: 'none', strokeLinecap: 'round' })
    ]
  } else if (cheer) {
    // laughing: upward arcs + happy lower lid
    eyes = [
      e('path', { key: 'a', d: 'M36 71 q11 -15 22 0', stroke: EYE, strokeWidth: 3.4, fill: 'none', strokeLinecap: 'round' }),
      e('path', { key: 'b', d: 'M66 71 q11 -15 22 0', stroke: EYE, strokeWidth: 3.4, fill: 'none', strokeLinecap: 'round' }),
      e('path', { key: 'c', d: 'M42 74 q5 4 10 0', stroke: EYE, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', opacity: .6 }),
      e('path', { key: 'd', d: 'M72 74 q5 4 10 0', stroke: EYE, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', opacity: .6 })
    ]
  } else if (work) {
    // focused: narrowed lids pressed down over the iris
    eyes = [
      e('ellipse', { key: 'ia', cx: 47, cy: 72, rx: 12, ry: 15, fill: EYE }),
      e('ellipse', { key: 'ib', cx: 77, cy: 72, rx: 12, ry: 15, fill: EYE }),
      e('circle', { key: 'ha', cx: 43, cy: 68, r: 4.4, fill: '#fff', opacity: .93 }),
      e('circle', { key: 'hb', cx: 73, cy: 68, r: 4.4, fill: '#fff', opacity: .93 }),
      e('circle', { key: 'ga', cx: 51, cy: 79, r: 2.2, fill: '#fff', opacity: .5 }),
      e('circle', { key: 'gb', cx: 81, cy: 79, r: 2.2, fill: '#fff', opacity: .5 }),
      e('rect', { key: 'la', x: 35, y: 60, width: 24, height: 9, rx: 4.5, fill: SKIN }),
      e('rect', { key: 'lb', x: 65, y: 60, width: 24, height: 9, rx: 4.5, fill: SKIN }),
      e('path', { key: 'br1', d: 'M36 52 l20 7', stroke: HAIR_DK, strokeWidth: 2.8, strokeLinecap: 'round' }),
      e('path', { key: 'br2', d: 'M68 59 l20 -7', stroke: HAIR_DK, strokeWidth: 2.8, strokeLinecap: 'round' })
    ]
  } else {
    // idle: the reference look — huge sleepy eyes, flattened upper lid
    eyes = [
      e('ellipse', { key: 'ia', cx: 47, cy: 72, rx: 13, ry: 16, fill: EYE }),
      e('ellipse', { key: 'ib', cx: 77, cy: 72, rx: 13, ry: 16, fill: EYE }),
      e('circle', { key: 'ha', cx: 42, cy: 67, r: 5, fill: '#fff', opacity: .95 }),
      e('circle', { key: 'hb', cx: 72, cy: 67, r: 5, fill: '#fff', opacity: .95 }),
      e('circle', { key: 'ga', cx: 52, cy: 80, r: 2.6, fill: '#fff', opacity: .5 }),
      e('circle', { key: 'gb', cx: 82, cy: 80, r: 2.6, fill: '#fff', opacity: .5 }),
      e('rect', { key: 'la', x: 34, y: 56, width: 26, height: 7, rx: 3.5, fill: SKIN }),
      e('rect', { key: 'lb', x: 64, y: 56, width: 26, height: 7, rx: 3.5, fill: SKIN }),
      e('path', { key: 'br1', d: 'M37 54 q10 -3 20 1', stroke: HAIR_DK, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round', opacity: .8 }),
      e('path', { key: 'br2', d: 'M67 55 q10 -4 20 -1', stroke: HAIR_DK, strokeWidth: 2.2, fill: 'none', strokeLinecap: 'round', opacity: .8 })
    ]
  }

  // ---------------------------------------------------------------- mouth
  let mouth
  if (cheer) {
    mouth = e('path', { d: 'M54 90 q8 11 16 0 q-8 4 -16 0 z', fill: 'rgba(150,72,86,.8)' })
  } else if (rest) {
    mouth = e('path', { d: 'M59 92 q5 5 10 0', stroke: 'rgba(138,74,86,.75)', strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round' })
  } else if (work) {
    mouth = e('path', { d: 'M55 91 q6 4 12 0', stroke: 'rgba(138,74,86,.8)', strokeWidth: 2.6, fill: 'none', strokeLinecap: 'round' })
  } else {
    mouth = e('ellipse', { cx: 62, cy: 92, rx: 3.2, ry: 4, fill: 'rgba(138,74,86,.6)' })
  }

  // ---------------------------------------------------------------- blush
  const blush = [
    e('ellipse', { key: 'b1', cx: 33, cy: 85, rx: 8, ry: 3.6, fill: 'rgba(238,138,150,.5)' }),
    e('ellipse', { key: 'b2', cx: 91, cy: 85, rx: 8, ry: 3.6, fill: 'rgba(238,138,150,.5)' })
  ]
  if (cheer) {
    blush.push(e('ellipse', { key: 'b3', cx: 33, cy: 85, rx: 8, ry: 3.6, fill: 'rgba(238,110,130,.45)' }))
    blush.push(e('ellipse', { key: 'b4', cx: 91, cy: 85, rx: 8, ry: 3.6, fill: 'rgba(238,110,130,.45)' }))
  }

  const parts = [
    e('g', { key: 'hairback' }, [
      e('path', { key: 'hb1', d: 'M62 18 Q20 20 18 58 Q17 93 29 111 Q63 121 95 111 Q107 93 106 58 Q104 20 62 18 Z', fill: HAIR }),
      e('path', { key: 'hb2', d: 'M28 30 Q42 22 62 22 Q82 22 96 30 Q82 36 62 36 Q42 36 28 30 Z', fill: HAIR_DK, opacity: .55 }),
      e('g', { key: 'hb3' }, hairStrands(e, [-8, 8, 20, 32]))
    ]),
    // face
    e('ellipse', { key: 'face', cx: 62, cy: 74, rx: 32, ry: 35, fill: SKIN }),
    e('ellipse', { key: 'shade', cx: 62, cy: 44, rx: 30, ry: 9, fill: SKIN_SH, opacity: .5 }),
    e('path', { key: 'chin', d: 'M54 104 q8 5 16 0', stroke: SKIN_SH, strokeWidth: 1.6, fill: 'none', opacity: .5 }),
    e('g', { key: 'bangs' }, [
      e('path', { key: 'bg1', d: 'M28 36 Q34 14 62 13 Q90 14 96 36 Q87 25 74 31 Q68 22 62 31 Q56 22 50 31 Q37 25 28 36 Z', fill: HAIR_DK }),
      e('path', { key: 'bg2', d: 'M48 15 q6 9 28 5', stroke: HAIR_LT, strokeWidth: 2.6, fill: 'none', strokeLinecap: 'round', opacity: .5 })
    ]),
    e('g', { key: 'locks' }, [
      e('path', { key: 'lk1', d: 'M28 40 Q21 72 27 105 L44 101 Q34 74 38 40 Z', fill: HAIR }),
      e('path', { key: 'lk2', d: 'M96 40 Q103 72 97 105 L80 101 Q90 74 86 40 Z', fill: HAIR }),
      e('path', { key: 'lk3', d: 'M31 56 q-3 22 0 38', stroke: HAIR_LT, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round', opacity: .45 }),
      e('path', { key: 'lk4', d: 'M93 56 q3 22 0 38', stroke: HAIR_LT, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round', opacity: .45 })
    ]),
    e('g', { key: 'face2' }, [eyes, mouth]),
    e('g', { key: 'blush' }, blush),
    // ponytail ribbons, right side
    e('g', { key: 'tails' }, [
      e('path', { key: 't1', d: 'M100 62 q19 9 19 31 q-11 -15 -20 -19 z', fill: HAIR }),
      e('path', { key: 't2', d: 'M100 68 q15 15 13 37 q-7 -19 -15 -25 z', fill: HAIR_DK, opacity: .7 }),
      e('path', { key: 't3', d: 'M101 68 q11 8 14 24', stroke: HAIR_LT, strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round', opacity: .45 })
    ]),
    // cream frilled headdress + blue ribbon
    e('g', { key: 'dress' }, [
      e('path', { key: 'd1', d: 'M26 33 Q62 6 98 33 Q62 21 26 33 Z', fill: CREAM }),
      e('circle', { key: 'f1', cx: 31, cy: 29, r: 6, fill: CREAM }),
      e('circle', { key: 'f2', cx: 42, cy: 22, r: 6.5, fill: CREAM }),
      e('circle', { key: 'f3', cx: 54, cy: 17, r: 6.8, fill: CREAM }),
      e('circle', { key: 'f4', cx: 66, cy: 16, r: 6.8, fill: CREAM }),
      e('circle', { key: 'f5', cx: 79, cy: 20, r: 6.5, fill: CREAM }),
      e('circle', { key: 'f6', cx: 90, cy: 27, r: 6, fill: CREAM }),
      e('path', { key: 'd2', d: 'M26 33 Q62 21 98 33', stroke: CREAM_DK, strokeWidth: 2, fill: 'none' }),
      e('path', { key: 'rb1', d: 'M86 25 q9 -7 13 1 q-9 6 -13 -1 z', fill: BLUE }),
      e('path', { key: 'rb2', d: 'M86 27 q10 5 11 14 q-10 -3 -11 -14 z', fill: BLUE_DK }),
      e('circle', { key: 'rb3', cx: 87, cy: 27, r: 3.2, fill: BLUE_DK })
    ]),
    // navy + cream collar with a blue bow
    e('g', { key: 'collar' }, [
      e('path', { key: 'c1', d: 'M40 107 q22 -5 44 0 q2 13 -22 13 q-24 0 -22 -13 z', fill: NAVY }),
      e('path', { key: 'c2', d: 'M44 110 q18 -4 36 0 q2 8 -18 8 q-20 0 -18 -8 z', fill: CREAM }),
      e('path', { key: 'c3', d: 'M49 108 q13 -3 26 0 q1 5 -13 5 q-14 0 -13 -5 z', fill: BLUE, opacity: .8 })
    ])
  ]

  if (rest) {
    parts.push(e('g', { key: 'zzz', fill: 'var(--dsw-alias-label-secondary, #777)' }, [
      e('text', { key: 'z1', className: 'pomo-z', x: 104, y: 56, fontSize: 16, fontWeight: 700 }, 'z'),
      e('text', { key: 'z2', className: 'pomo-z pomo-z--b', x: 113, y: 41, fontSize: 11, fontWeight: 700 }, 'z')
    ]))
  }
  if (cheer) {
    parts.push(e('g', { key: 'sp', className: 'pomo-sparkle', fill: 'var(--dsw-alias-state-warn-primary, #f0a020)' }, [
      e('path', { key: 's1', d: 'M14 16 l3 7.4 L24.6 26.5 l-7.6 3.1 L14 37 l-3 -7.4 L3.6 26.5 l7.6 -3.1 z' }),
      e('path', { key: 's2', d: 'M104 8 l2.6 6.2 L112.8 16.8 l-6.2 2.6 L104 25.6 l-2.6 -6.2 L95.2 16.8 l6.2 -2.6 z' }),
      e('circle', { key: 's3', cx: 110, cy: 36, r: 3 }),
      e('circle', { key: 's4', cx: 16, cy: 50, r: 2.4 })
    ]))
  }
  if (work) {
    parts.push(e('g', { key: 'sw', className: 'pomo-sweat' }, [
      e('path', { key: 'd1', d: 'M14 34 q5 8 0 11 q-5 -3 0 -11 z', fill: 'rgba(120,178,220,.9)' }),
      e('path', { key: 'd2', d: 'M24 22 q3 5 0 7 q-3 -2 0 -7 z', fill: 'rgba(120,178,220,.7)' })
    ]))
  }
  if (pose === 'idle') {
    parts.push(e('g', { key: 'tip', className: 'pomo-tip' }, [
      e('text', { key: 't1', x: 106, y: 62, fontSize: 14, fill: 'var(--dsw-alias-label-secondary, #777)' }, '♪'),
      e('text', { key: 't2', x: 113, y: 48, fontSize: 10, fill: 'var(--dsw-alias-label-secondary, #777)' }, '♪')
    ]))
  }

  return e('svg', {
    className: 'pomo-mascot',
    width: size, height: size, viewBox: '0 0 124 124',
    'aria-hidden': 'true', focusable: 'false'
  }, [
    e('g', { key: 'sway', className: 'pomo-head-sway pomo-head-sway--' + pose }, parts)
  ])
}

function beep(kind) {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return
    const audio = new Ctor()
    const tone = (freq, startAt, duration, volume) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start(startAt)
      osc.stop(startAt + duration + 0.04)
    }
    const t0 = audio.currentTime + 0.02
    if (kind === 'rest') {
      tone(523.25, t0, 0.16, 0.1)
      tone(392.0, t0 + 0.2, 0.26, 0.09)
    } else {
      tone(659.25, t0, 0.15, 0.1)
      tone(783.99, t0 + 0.18, 0.15, 0.1)
      tone(1046.5, t0 + 0.36, 0.28, 0.1)
    }
    setTimeout(() => {
      try { audio.close() } catch (err) { /* already closed */ }
    }, 1600)
  } catch (err) {
    console.error('pomodoro chime unavailable', err && err.message)
  }
}

return {
  inject: ['timer'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) {
      console.error('pomodoro: slots service unavailable')
      return
    }

    ctx.effect(() => styles.insert(CSS))

    const DEFAULTS = { work: 25, rest: 5, total: 4, autoStart: true, sound: true }
    const RING = 2 * Math.PI * 64
    const MAX_MS = 8 * 3600 * 1000

    let listeners = []
    let singleton = null

    function readState() {
      if (singleton === null) {
        singleton = {
          config: {
            work: DEFAULTS.work, rest: DEFAULTS.rest, total: DEFAULTS.total,
            autoStart: DEFAULTS.autoStart, sound: DEFAULTS.sound
          },
          state: {
            mode: 'idle', nextMode: null,
            remaining: DEFAULTS.work * 60000, total: DEFAULTS.work * 60000,
            round: 1, running: false, deadline: null, autoStartAt: null
          }
        }
      }
      return singleton
    }

    function notify() {
      const current = listeners.slice()
      for (let i = 0; i < current.length; i += 1) {
        try {
          current[i]()
        } catch (err) {
          console.error('pomodoro: subscriber failed', err && err.message)
        }
      }
    }

    function update(patch) {
      const current = readState()
      singleton = { config: current.config, state: Object.assign({}, current.state, patch) }
      notify()
    }

    function updateConfig(patch) {
      const current = readState()
      singleton = { config: Object.assign({}, current.config, patch), state: current.state }
      notify()
    }

    function snapshot() {
      const cur = readState()
      const cfg = cur.config
      const st = cur.state
      return {
        config: { work: cfg.work, rest: cfg.rest, total: cfg.total, autoStart: !!cfg.autoStart, sound: !!cfg.sound },
        mode: st.mode,
        nextMode: st.nextMode,
        round: st.round,
        running: !!st.running,
        remaining: Math.max(0, Math.round(st.remaining)),
        total: st.total,
        autoStartAt: st.autoStartAt
      }
    }

    function reset(mode) {
      const cfg = readState().config
      const mins = mode === 'resting' ? cfg.rest : cfg.work
      update({
        mode: mode, nextMode: null, remaining: mins * 60000, total: mins * 60000,
        running: false, deadline: null, autoStartAt: null
      })
    }

    function start(mode) {
      const cfg = readState().config
      const cur = readState().state
      let next = mode
      if (next !== 'working' && next !== 'resting') next = 'working'
      const full = (next === 'resting' ? cfg.rest : cfg.work) * 60000
      const resumable = next === cur.mode && cur.remaining > 300 && cur.total === full
      const frozen = Math.min(MAX_MS, Math.max(0, resumable ? cur.remaining : full))
      update({
        mode: next, nextMode: null, remaining: frozen, total: frozen,
        running: true, deadline: Date.now() + frozen, autoStartAt: null
      })
    }

    function pause() {
      const cfg = readState().config
      const st = readState().state
      const full = Math.min(MAX_MS, (st.mode === 'resting' ? cfg.rest : cfg.work) * 60000)
      const frozen = Math.min(MAX_MS, Math.max(0, st.remaining))
      update({ running: false, deadline: null, remaining: frozen > 1000 ? frozen : full, total: full })
    }

    function clampRound(value) {
      const cfg = readState().config
      const n = Number(value)
      if (!Number.isFinite(n) || n < 1) return 1
      return Math.min(cfg.total, Math.round(n))
    }

    function finish(workedOut) {
      const cfg = readState().config
      const st = readState().state
      let round = st.round
      let nextMode = null
      if (workedOut) {
        round = st.round + 1
        if (round <= cfg.total) nextMode = 'resting'
      } else if (st.round <= cfg.total) {
        nextMode = 'working'
      }
      if (cfg.sound) beep(workedOut ? 'work' : 'rest')
      update({
        mode: 'celebrate', nextMode: nextMode, running: false,
        remaining: 0, deadline: null, round: clampRound(round),
        autoStartAt: (cfg.autoStart && nextMode !== null) ? Date.now() + 1600 : null
      })
    }

    function advance() {
      const st = readState().state
      if (st.nextMode === 'resting') start('resting')
      else if (st.nextMode === 'working') start('working')
      else if (st.round > readState().config.total) update({ mode: 'finished', nextMode: null, remaining: 0, running: false, autoStartAt: null })
      else reset('working')
    }

    function dismiss() {
      const st = readState().state
      if (st.nextMode === null && st.round > readState().config.total) {
        update({ mode: 'finished', nextMode: null, remaining: 0, autoStartAt: null })
      } else {
        update({ mode: 'idle', nextMode: null, running: false, autoStartAt: null })
      }
    }

    function restartRound() {
      reset('working')
      update({ round: 1 })
    }

    ctx.effect(() => ctx.timer.interval(() => {
      const st = readState().state
      if (st.mode === 'working' || st.mode === 'resting') {
        if (!st.running || st.deadline === null) return
        const left = Math.max(0, st.deadline - Date.now())
        if (left <= 0) finish(st.mode === 'working')
        else update({ remaining: Math.min(MAX_MS, left) })
        return
      }
      if (st.mode === 'celebrate' && st.autoStartAt !== null && Date.now() >= st.autoStartAt) advance()
    }, 200))

    function createStore() {
      let current = snapshot()
      const own = []
      const emit = () => {
        const next = snapshot()
        if (next.mode === current.mode &&
            next.nextMode === current.nextMode &&
            next.round === current.round &&
            next.running === current.running &&
            next.remaining === current.remaining &&
            next.total === current.total &&
            next.autoStartAt === current.autoStartAt &&
            next.config.work === current.config.work &&
            next.config.rest === current.config.rest &&
            next.config.total === current.config.total &&
            next.config.autoStart === current.config.autoStart &&
            next.config.sound === current.config.sound) {
          return
        }
        current = next
        const subs = own.slice()
        for (let i = 0; i < subs.length; i += 1) subs[i]()
      }
      return {
        subscribe(listener) {
          own.push(listener)
          listeners.push(emit)
          return () => {
            const at = own.indexOf(listener)
            if (at >= 0) own.splice(at, 1)
            const at2 = listeners.indexOf(emit)
            if (at2 >= 0) listeners.splice(at2, 1)
          }
        },
        getSnapshot() { return current }
      }
    }

    function usePomodoro() {
      const ref = React.useRef(null)
      if (ref.current === null) ref.current = createStore()
      const store = ref.current
      return React.useSyncExternalStore(store.subscribe, store.getSnapshot)
    }

    function readPos() {
      try {
        const raw = window.localStorage.getItem(POS_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return { x: parsed.x, y: parsed.y }
        }
      } catch (err) { /* no stored position yet */ }
      return null
    }

    let posState = readPos()
    let posSeen = posState
    const posListeners = []

    function setPos(next) {
      const vw = window.innerWidth
      const vh = window.innerHeight
      posState = {
        x: clamp(next.x, 4, Math.max(4, vw - 70)),
        y: clamp(next.y, 4, Math.max(4, vh - 70))
      }
      try {
        window.localStorage.setItem(POS_KEY, JSON.stringify(posState))
      } catch (err) { /* private mode: memory only */ }
      const subs = posListeners.slice()
      for (let i = 0; i < subs.length; i += 1) subs[i]()
    }

    function subscribePos(listener) {
      posListeners.push(listener)
      return () => {
        const at = posListeners.indexOf(listener)
        if (at >= 0) posListeners.splice(at, 1)
      }
    }

    function getPosSnapshot() {
      const next = readPos()
      if (next === null) {
        if (posState !== null) posState = null
      } else if (posState === null || next.x !== posState.x || next.y !== posState.y) {
        posState = next
      }
      if (posSeen !== posState) posSeen = posState
      return posState
    }

    function usePos() {
      return React.useSyncExternalStore(subscribePos, getPosSnapshot)
    }

    function makeHandler(pos, onDrag) {
      return (ev) => {
        if (ev.button !== undefined && ev.button !== 0) return
        const target = ev.currentTarget
        const rect = target.getBoundingClientRect()
        const startX = ev.clientX
        const startY = ev.clientY
        const baseX = pos === null ? rect.left : pos.x
        const baseY = pos === null ? rect.top : pos.y
        let moving = false
        const move = (e2) => {
          const dx = e2.clientX - startX
          const dy = e2.clientY - startY
          if (!moving && Math.abs(dx) + Math.abs(dy) < 4) return
          moving = true
          if (onDrag) onDrag(true)
          setPos({ x: baseX + dx, y: baseY + dy })
        }
        const up = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', up)
          window.removeEventListener('pointercancel', up)
          if (onDrag) onDrag(false)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        window.addEventListener('pointercancel', up)
      }
    }

    function posStyle(pos) {
      if (pos === null) return undefined
      return { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' }
    }

    function PomodoroPanel() {
      const value = usePomodoro()
      const pos = usePos()
      const ui = React.useState({ open: false, showSettings: false, dragging: false })
      const view = ui[0]
      const setView = ui[1]

      const cfg = value.config
      const meta = MODE_META[value.mode] || MODE_META.idle
      const pose = value.mode === 'working' || value.mode === 'resting'
        ? value.mode
        : (value.mode === 'celebrate' ? 'cheer' : 'idle')
      const pct = value.total > 0 ? Math.max(0, Math.min(1, value.remaining / value.total)) : 0
      const dash = RING * pct
      const accent = value.mode === 'resting'
        ? 'var(--dsw-alias-state-warn-primary, #f0a020)'
        : (value.mode === 'working'
            ? 'var(--dsw-alias-brand-primary, #e4572e)'
            : 'var(--dsw-alias-state-success-primary, #2f9e6b)')
      const shownRound = Math.min(value.round, cfg.total)
      const isCounting = value.mode === 'working' || value.mode === 'resting'

      const patchView = (patch) => setView((prev) => Object.assign({}, prev, patch))
      const setDragging = (on) => setView((prev) => (prev.dragging === on ? prev : Object.assign({}, prev, { dragging: on })))
      const openPanel = () => patchView({ open: true })
      const closePanel = () => patchView({ open: false })
      const onPillDown = makeHandler(pos, setDragging)

      const dragStyle = posStyle(pos)
      const panelStyle = pos === null
        ? undefined
        : {
            left: clamp(pos.x + 29 - 161, 8, Math.max(8, window.innerWidth - 330)) + 'px',
            top: clamp(pos.y - 8 - 420, 8, Math.max(8, window.innerHeight - 60)) + 'px'
          }

      const dots = []
      for (let i = 1; i <= cfg.total; i += 1) {
        let cls = 'pomo-dot'
        if (i < value.round) cls += ' pomo-dot--done'
        else if (i === value.round && value.mode !== 'finished') cls += ' pomo-dot--now'
        dots.push(React.createElement('span', { key: i, className: cls }))
      }

      const primaryButton = isCounting
        ? (value.running
            ? React.createElement('button', { key: 'p', type: 'button', className: 'pomo-btn pomo-btn--primary', onClick: () => pause() }, '暂停')
            : React.createElement('button', { key: 'p', type: 'button', className: 'pomo-btn pomo-btn--primary', onClick: () => start(value.mode) }, '继续'))
        : React.createElement('button', { key: 'p', type: 'button', className: 'pomo-btn pomo-btn--primary', onClick: () => start('working') }, '开始专注')

      const actions = [
        primaryButton,
        React.createElement('button', {
          key: 'r', type: 'button', className: 'pomo-btn',
          onClick: () => reset(value.mode === 'resting' ? 'resting' : 'working')
        }, '重置')
      ]

      const presets = [[25, 5], [50, 10], [15, 3]].map((pair) => React.createElement('button', {
        key: pair[0] + '-' + pair[1],
        type: 'button',
        className: 'pomo-btn pomo-preset__btn',
        onClick: () => {
          updateConfig({ work: pair[0], rest: pair[1] })
          if (value.mode === 'idle' || value.mode === 'finished' || value.mode === 'celebrate') reset('working')
        }
      }, pair[0] + ' / ' + pair[1]))

      const stepper = (key, name, min, max, unit) => React.createElement('div', { className: 'pomo-field', key: key }, [
        React.createElement('span', { className: 'pomo-field__head', key: 'h' }, [
          React.createElement('span', { className: 'pomo-field__name', key: 'n' }, name),
          React.createElement('span', { className: 'pomo-field__value', key: 'v' }, String(cfg[key]) + unit)
        ]),
        React.createElement('div', { className: 'pomo-steps', key: 's' }, [
          React.createElement('button', {
            key: 'minus', type: 'button', className: 'pomo-step',
            onClick: () => { const patch = {}; patch[key] = numLike(cfg[key] - 1, min, max, cfg[key]); updateConfig(patch) }
          }, '−'),
          React.createElement('button', {
            key: 'plus', type: 'button', className: 'pomo-step',
            onClick: () => { const patch = {}; patch[key] = numLike(cfg[key] + 1, min, max, cfg[key]); updateConfig(patch) }
          }, '+'),
          React.createElement('span', { key: 'hint', className: 'pomo-note' }, '(' + min + '–' + max + ')')
        ])
      ])

      const settings = view.showSettings
        ? React.createElement('div', { className: 'pomo-settings', key: 'settings' }, [
            stepper('work', '专注时长', 5, 90, ' 分钟'),
            stepper('rest', '休息时长', 1, 30, ' 分钟'),
            stepper('total', '番茄个数', 1, 12, ' 个'),
            React.createElement('label', { className: 'pomo-check', key: 'auto' }, [
              React.createElement('input', {
                key: 'c', type: 'checkbox', checked: cfg.autoStart,
                onChange: (ev) => updateConfig({ autoStart: !!ev.target.checked })
              }),
              React.createElement('span', { key: 's' }, '自动进入下一阶段')
            ]),
            React.createElement('label', { className: 'pomo-check', key: 'snd' }, [
              React.createElement('input', {
                key: 'c', type: 'checkbox', checked: cfg.sound,
                onChange: (ev) => updateConfig({ sound: !!ev.target.checked })
              }),
              React.createElement('span', { key: 's' }, '到点提示音')
            ]),
            React.createElement('div', { className: 'pomo-note', key: 'n' }, '开始计时后修改时长，将在下一次开始计时时生效'),
            pos !== null
              ? React.createElement('button', {
                  key: 'rst', type: 'button', className: 'pomo-step pomo-btn--sm',
                  onClick: () => {
                    try { window.localStorage.removeItem(POS_KEY) } catch (err) { /* ignore */ }
                    posState = null
                    const subs = posListeners.slice()
                    for (let i = 0; i < subs.length; i += 1) subs[i]()
                  }
                }, '恢复默认位置')
              : null
          ])
        : null

      const panel = view.open
        ? React.createElement('div', { className: 'pomo-panel', key: 'panel', style: panelStyle }, [
            React.createElement('div', {
              className: 'pomo-head' + (view.dragging ? ' pomo-head--drag' : ''),
              key: 'head', onPointerDown: onPillDown, title: '拖动可移动面板'
            }, [
              React.createElement('div', { className: 'pomo-head__title', key: 't' }, [
                React.createElement('span', { key: 'd', className: 'pomo-head__dot' + (value.running ? ' pomo-head__dot--live' : '') }),
                React.createElement('span', { key: 'l' }, meta.emoji + ' 番茄钟')
              ]),
              React.createElement('div', { className: 'pomo-head__actions', key: 'a' }, [
                React.createElement('button', {
                  key: 'cfg', type: 'button', className: 'pomo-btn pomo-btn--sm pomo-btn--ghost',
                  onPointerDown: (ev) => ev.stopPropagation(),
                  onClick: () => setView((prev) => Object.assign({}, prev, { showSettings: !prev.showSettings }))
                }, view.showSettings ? '收起设置' : '设置'),
                React.createElement('button', {
                  key: 'close', type: 'button', className: 'pomo-x', title: '收起面板',
                  onPointerDown: (ev) => ev.stopPropagation(),
                  onClick: closePanel
                }, '✕')
              ])
            ]),
            React.createElement('div', { className: 'pomo-body', key: 'body' }, [
              React.createElement('div', { className: 'pomo-stage', key: 'stage' }, [
                React.createElement('svg', { key: 'ring', className: 'pomo-stage__ring', viewBox: '0 0 152 152' }, [
                  React.createElement('circle', { key: 'tr', className: 'pomo-stage__track', cx: 76, cy: 76, r: 64 }),
                  React.createElement('circle', {
                    key: 'val', className: 'pomo-stage__value', cx: 76, cy: 76, r: 64, stroke: accent,
                    strokeDasharray: RING.toFixed(2), strokeDashoffset: (RING - dash).toFixed(2)
                  })
                ]),
                React.createElement('div', { key: 'disc', className: 'pomo-stage__disc' },
                  React.createElement(ChibiMascot, { pose: pose, size: 134 })),
                React.createElement('div', { key: 'tm', className: 'pomo-stage__time' }, fmt(value.remaining))
              ]),
              React.createElement('div', { className: 'pomo-meta', key: 'meta' }, [
                React.createElement('span', { key: 'mode', className: 'pomo-meta__mode' }, meta.label),
                React.createElement('span', { key: 'sep' }, '·'),
                React.createElement('span', { key: 'round' }, '第 ' + shownRound + ' / ' + cfg.total + ' 个番茄')
              ]),
              React.createElement('div', { className: 'pomo-dots', key: 'dots' }, dots),
              React.createElement('div', { className: 'pomo-ctl', key: 'ctl' }, actions),
              React.createElement('div', { className: 'pomo-preset', key: 'presets' }, presets)
            ]),
            settings
          ])
        : null

      const celebrate = value.mode === 'celebrate'
        ? React.createElement('div', { className: 'pomo-celebrate', key: 'celebrate', onClick: () => advance() }, [
            React.createElement('div', { className: 'pomo-confetti', key: 'cf' }, [
              ['#e4572e', '#f0a020', '#2f9e6b', '#4a7dff', '#e5484d', '#f5d90a'].map((color, i) => React.createElement('span', {
                key: i, className: 'pomo-confetti__bit',
                style: { left: (6 + i * 15) + '%', animationDelay: (i * 0.31).toFixed(2) + 's', background: color }
              }))
            ]),
            React.createElement('div', { className: 'pomo-celebrate__card', key: 'card', onClick: (ev) => ev.stopPropagation() }, [
              React.createElement('div', { className: 'pomo-celebrate__glow', key: 'glow' }),
              React.createElement('div', { className: 'pomo-celebrate__face', key: 'f' },
                React.createElement(ChibiMascot, { pose: 'cheer', size: 132 })),
              React.createElement('div', { className: 'pomo-celebrate__title', key: 't' },
                value.nextMode === 'working' ? '休息结束，继续加油！' : '时间到，起来动一动！'),
              React.createElement('div', { className: 'pomo-celebrate__text', key: 'x' },
                value.nextMode === 'working'
                  ? ('第 ' + shownRound + ' 个番茄开始，专注 ' + cfg.work + ' 分钟')
                  : (value.nextMode === 'resting'
                      ? ('第 ' + Math.max(1, value.round - 1) + ' 个番茄完成，休息 ' + cfg.rest + ' 分钟')
                      : ('全部 ' + cfg.total + ' 个番茄完成，今天很棒 🎊'))),
              React.createElement('div', { className: 'pomo-celebrate__actions', key: 'a' }, [
                value.nextMode !== null
                  ? React.createElement('button', {
                      key: 'go', type: 'button', className: 'pomo-btn pomo-btn--primary',
                      onClick: () => advance()
                    }, value.nextMode === 'resting' ? '开始休息' : '开始专注')
                  : React.createElement('button', {
                      key: 'again', type: 'button', className: 'pomo-btn pomo-btn--primary',
                      onClick: () => restartRound()
                    }, '再来一轮'),
                React.createElement('button', {
                  key: 'later', type: 'button', className: 'pomo-btn',
                  onClick: () => dismiss()
                }, value.nextMode !== null ? '稍后再说' : '先这样')
              ]),
              value.autoStartAt !== null
                ? React.createElement('div', { className: 'pomo-note', key: 'auto', style: { marginTop: 10 } }, '已开启自动继续，稍后自动开始')
                : null
            ])
          ])
        : null

      const toggle = () => (value.running ? pause() : start(value.mode === 'resting' ? 'resting' : 'working'))

      const collapsed = React.createElement('div', {
        className: 'pomo-pill' + (view.dragging ? ' pomo-pill--drag' : ''),
        key: 'pill', style: dragStyle
      }, [
        React.createElement('div', {
          key: 'grip', className: 'pomo-pill__grip', onPointerDown: onPillDown, title: '拖动可移动'
        }, [
          React.createElement('div', { key: 'f', className: 'pomo-pill__face' },
            React.createElement(ChibiMascot, { pose: pose, size: 44 })),
          React.createElement('div', { key: 't' }, [
            React.createElement('div', { key: 'a', className: 'pomo-pill__time' }, fmt(value.remaining)),
            React.createElement('div', { key: 'b', className: 'pomo-pill__count' }, meta.label + ' ' + shownRound + '/' + cfg.total)
          ])
        ]),
        React.createElement('button', { key: 'tg', type: 'button', className: 'pomo-btn pomo-btn--sm', onClick: toggle }, value.running ? '暂停' : '开始'),
        React.createElement('button', { key: 'op', type: 'button', className: 'pomo-btn pomo-btn--sm', onClick: openPanel }, '详情')
      ])

      const fab = React.createElement('button', {
        key: 'fab', type: 'button', title: '拖动可移动，单击展开详情',
        className: 'pomo-fab' + (view.dragging ? ' pomo-fab--drag' : ''),
        style: dragStyle, onPointerDown: onPillDown, onClick: openPanel
      }, [
        React.createElement(ChibiMascot, { key: 'm', pose: pose, size: 58 }),
        value.running || value.mode === 'celebrate'
          ? React.createElement('span', { key: 'b', className: 'pomo-fab__badge' }, fmt(value.remaining))
          : null
      ])

      return React.createElement(React.Fragment, null, [
        (!value.running && value.mode !== 'celebrate') ? collapsed : fab,
        panel,
        celebrate
      ])
    }

    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'pomodoro-timer', order: 20, label: '番茄钟' },
      () => React.createElement(PomodoroPanel, null)
    ))
  }
}
