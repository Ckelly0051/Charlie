import { TagLibrary } from '../js/tag-library.js';

let pass=0,fail=0;
const ok=(value,label,extra='')=>{console.log(`${value?'  PASS':'  FAIL'}  ${label}${!value&&extra?` -- ${extra}`:''}`);value?pass++:fail++;};
class MemoryStorage { constructor(seed={}){this.data=new Map(Object.entries(seed));} getItem(k){return this.data.get(k)||null;} setItem(k,v){this.data.set(k,String(v));} removeItem(k){this.data.delete(k);} }

const storage=new MemoryStorage({ffa_custom_chips_teamA:JSON.stringify({formation:['Trey','Power-I'],backfield:['Ace']})});
const library=new TagLibrary({storage,teamId:'teamA'});
let state=library.load();
ok(library.key()==='ffa_tag_libraries_teamA','library is scoped to the active team');
ok(state.groups.formation.custom.join(',')==='Trey'&&state.groups.formation.enabled.includes('Power-I')&&state.groups.backfield.custom[0]==='Ace','legacy custom chips promote a new default without duplication or data loss');
ok(storage.getItem('ffa_custom_chips_teamA')===null,'successful migration retires the legacy key');
ok(state.groups.front.enabled.includes('4-2-5'),'Front library is first-class and defaults enabled');
ok(library.add('front','Bear')&&library.group('front').enabled.includes('Bear'),'custom Front is added and enabled');
// E4: 'Shotgun' was removed from TagLibrary.DEFINITIONS.formation — it moved to
// QB Alignment (a fixed, non-customizable group), so it's no longer a valid
// example of a hideable BUILT-IN FORMATION value. 'Wing-T' remains one.
ok(library.setEnabled('formation','Wing-T',false)&&!library.group('formation').enabled.includes('Wing-T'),'built-in values can be hidden without removal');
ok(library.group('formation').values.includes('Wing-T'),'hidden built-in remains in the vocabulary');
ok(['I-Form','Split Back','Power-I','Ace','Victory'].every(value=>library.group('formation').values.includes(value))&&!library.group('formation').custom.some(value=>['I-Form','Split Back','Power-I','Ace','Victory'].includes(value)),'I-Form, Split Back, and coach-approved formations are standard library values');
ok(!library.remove('formation','Power-I')&&library.group('formation').values.includes('Power-I'),'standard formations can be hidden but not removed as custom values');
library.restore(); state=library.load();
ok(state.groups.formation.custom.length===0&&state.groups.formation.enabled.length===TagLibrary.DEFINITIONS.formation.length,'restore returns every group to defaults');
const v1Storage=new MemoryStorage({ffa_tag_libraries_teamC:JSON.stringify({version:1,groups:{formation:{custom:[],enabled:['Wing-T']},backfield:{custom:[],enabled:['I','Split']},front:{custom:[],enabled:['4-2-5']}}})});
const upgraded=new TagLibrary({storage:v1Storage,teamId:'teamC'});
ok(['I-Form','Split Back'].every(value=>upgraded.group('formation').enabled.includes(value)),'v1 team libraries enable newly added standard formations exactly once');
ok(upgraded.setEnabled('formation','I-Form',false)&&!new TagLibrary({storage:v1Storage,teamId:'teamC'}).group('formation').enabled.includes('I-Form'),'coach can hide an upgraded standard formation without it resurrecting');
const other=new TagLibrary({storage,teamId:'teamB'});
ok(other.group('front').custom.length===0,'team libraries remain isolated');
ok(library.group('unknown').values.length===0&&!library.add('unknown','Value'),'unknown groups fail closed');
const first=library.group('formation').values[0];
ok(library.move('formation',first,1)&&library.group('formation').values[1]===first,'staff can reorder charting choices without changing their values');
library.setEnabled('coverage','Cover 6',false);
const preset=library.savePreset({name:'Friday defense',unit:'defense',mode:'program',role:'Defensive staff'});
library.setEnabled('coverage','Cover 6',true);
const applied=library.applyPreset(preset.id);
ok(applied?.unit==='defense'&&applied.role==='Defensive staff'&&!library.group('coverage').enabled.includes('Cover 6'),'a contextual preset restores its saved library visibility and metadata');
ok(library.deletePreset(preset.id)&&library.presets().length===0,'charting presets can be removed without touching a vocabulary');
ok(['coverage','playType','blitz'].every(key=>library.group(key).values.length>0),'coverage, play type, and blitz are first-class managed libraries');
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);process.exit(fail?1:0);
