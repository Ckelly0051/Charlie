import '../css/native-shortcuts.css';

const groups = [
  ['Playback', [
    [['Space'], 'Play / Pause'],
    [['←', '→'], 'Step one frame (also , and .)'],
    [['Shift + ← / →'], 'Previous / Next clip'],
    [['[', ']'], 'Mark play start / end'],
  ]],
  ['Tagging · play selected', [
    [['R O S P M D A Q X'], 'Play type shortcuts'],
    [['G L N I T W U F E K'], 'Result shortcuts'],
    [['Shift + 1–4'], 'Down number'],
    [['Y'], 'Jump to yardage'],
    [['C'], 'Cycle Offense / Defense / Special Teams'],
    [['1–9'], 'Special Teams play type'],
    [['Enter'], 'Save & next play'],
    [['Shift + Enter'], 'Previous play'],
  ]],
  ['Drawing · tools open', [
    [['1–6'], 'Line, Arrow, Circle, Rect, Draw, Text'],
    [['Esc'], 'Deselect drawing tool'],
  ]],
  ['General', [
    [['Ctrl / ⌘ + Z'], 'Undo'],
    [['Ctrl / ⌘ + Shift + Z'], 'Redo'],
    [['Ctrl / ⌘ + S'], 'Save season'],
    [['V'], 'Swap camera angle'],
    [['?'], 'Show / hide shortcuts'],
  ]],
];

export function NativeShortcuts() {
  return <div class="gi-shortcuts" data-native-shortcuts>
    {groups.map(([title, rows]) => <section key={title}>
      <h3>{title}</h3>
      <dl>{rows.map(([keys, description]) => <div key={`${keys.join('-')}-${description}`}><dt>{keys.map(key => <kbd key={key}>{key}</kbd>)}</dt><dd>{description}</dd></div>)}</dl>
    </section>)}
  </div>;
}