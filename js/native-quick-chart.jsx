import '../css/native-quick-chart.css';

const Field = ({ label, id, value }) => <div class="gi-qc-field"><span>{label}</span><strong id={id} class={`gi-qc-value${value ? ' is-set' : ''}`}>{value || '—'}</strong></div>;

export function NativeQuickChart() {
  return <section class="gi-quick-chart" data-native-quick-chart tabIndex="-1" aria-label="Quick Chart keyboard workspace">
    <div class="gi-qc-readout" aria-live="polite">
      <Field label="Play type" id="qcPlayType" />
      <Field label="Result" id="qcResult" />
      <Field label="Yards" id="qcYardage" />
      <Field label="Down" id="qcDown" />
      <Field label="Flags" id="qcExtra" />
    </div>
    <fieldset class="gi-qc-players">
      <legend>Players <small>optional</small></legend>
      <label><span>Carrier #</span><input type="text" id="qcBallCarrier" inputMode="numeric" placeholder="#" maxLength="3" /></label>
      <label><span>Passer #</span><input type="text" id="qcPasser" inputMode="numeric" placeholder="#" maxLength="3" /></label>
      <label><span>Receiver #</span><input type="text" id="qcReceiver" inputMode="numeric" placeholder="#" maxLength="3" /></label>
      <label><span>Tackler #</span><input type="text" id="qcTackler" inputMode="numeric" placeholder="# #" maxLength="12" title="Multiple allowed for shared tackles, for example 55 22" /></label>
    </fieldset>
    <p class="gi-qc-status" id="qcStatus" role="status">Quick Chart active. Use the keyboard to tag plays.</p>
    <div class="gi-qc-keys" id="qcKeyHints" aria-label="Quick Chart keyboard commands">
      <p><b>Type</b><span><kbd>R</kbd> Run</span><span><kbd>O</kbd> Outside</span><span><kbd>P</kbd> Pass</span><span><kbd>M</kbd> Medium</span><span><kbd>D</kbd> Deep</span><span><kbd>S</kbd> Screen</span><span><kbd>A</kbd> Play action</span><span><kbd>Q</kbd> RPO</span><span><kbd>X</kbd> Trick</span></p>
      <p><b>Result</b><span><kbd>G</kbd> Gain</span><span><kbd>L</kbd> Loss</span><span><kbd>N</kbd> No gain</span><span><kbd>I</kbd> Incomplete</span><span><kbd>T</kbd> TD</span><span><kbd>U</kbd> INT</span><span><kbd>F</kbd> Fumble</span><span><kbd>W</kbd> Sack</span><span><kbd>E</kbd> Penalty</span></p>
      <p><b>Navigate</b><span><kbd>0–9</kbd> Yards</span><span><kbd>−</kbd> Negative</span><span><kbd>Shift 1–4</kbd> Down</span><span><kbd>Enter</kbd> Save + next</span><span><kbd>Tab</kbd> Skip</span><span><kbd>Backspace</kbd> Replay</span><span><kbd>C</kbd> Clear</span></p>
    </div>
  </section>;
}