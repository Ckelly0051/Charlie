import { useLayoutEffect, useRef, useState } from 'preact/hooks';

export function StudyPlanPicker({ screen, model }) {
  const dialogRef = useRef(null);
  const [target, setTarget] = useState(model.target);
  const [cohort, setCohort] = useState(model.items[0]?.id || '');
  const [name, setName] = useState('Game Plan');
  const choice = model.items.find(item => item.id === cohort) || model.items[0];
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  const submit = event => {
    event.preventDefault();
    const form = event.currentTarget;
    screen._confirmPlanPicker({
      target: form.elements.wsStudyPlanTarget?.value || target,
      cohort: form.elements.wsStudyPlanCohort?.value || cohort,
      name: form.querySelector('#wsStudyPlanName')?.value || name,
    });
  };
  return <dialog ref={dialogRef} class="ws-plan-picker" onCancel={event => { event.preventDefault(); screen._closePlanPicker(); }}>
    <form method="dialog" onSubmit={submit}>
      <div class="ws-eyebrow">Save Study finding</div><h2>Choose a game plan</h2>
      <p><strong data-plan-picker-label>{choice?.item.label || 'Study finding'}</strong><span data-plan-picker-count>{choice?.refs.length || 0} linked play{choice?.refs.length === 1 ? '' : 's'} will stay attached.</span></p>
      {model.items.length > 1 ? <label>Film to attach<select id="wsStudyPlanCohort" name="wsStudyPlanCohort" value={cohort} onChange={event => setCohort(event.currentTarget.value)}>{model.items.map(item => <option value={item.id}>{item.label} · {item.refs.length} play{item.refs.length === 1 ? '' : 's'}</option>)}</select></label> : null}
      <label>Destination<select id="wsStudyPlanTarget" name="wsStudyPlanTarget" value={target} onChange={event => setTarget(event.currentTarget.value)}>{model.plans.map(plan => <option value={plan.id}>{plan.name}</option>)}<option value="__new__">Create new plan</option></select></label>
      <label class="ws-plan-picker-name" hidden={target !== '__new__'}>Plan name<input id="wsStudyPlanName" name="wsStudyPlanName" maxLength="80" defaultValue={name} autoComplete="off" onInput={event => setName(event.currentTarget.value)} /></label>
      <div class="ws-plan-picker-actions"><button type="button" class="ws-btn" data-study-action="plan-picker-cancel" onClick={() => screen._closePlanPicker()}>Cancel</button><button class="ws-btn ws-primary" data-study-action="plan-picker-save">Save finding</button></div>
    </form>
  </dialog>;
}
