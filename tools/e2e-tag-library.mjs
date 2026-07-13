import { TagLibrary } from '../js/tag-library.js';

let pass=0,fail=0;
const ok=(value,label,extra='')=>{console.log(`${value?'  PASS':'  FAIL'}  ${label}${!value&&extra?` -- ${extra}`:''}`);value?pass++:fail++;};
class MemoryStorage { constructor(seed={}){this.data=new Map(Object.entries(seed));} getItem(k){return this.data.get(k)||null;} setItem(k,v){this.data.set(k,String(v));} removeItem(k){this.data.delete(k);} }

const storage=new MemoryStorage({ffa_custom_chips_teamA:JSON.stringify({formation:['Trey','Power-I'],backfield:['Ace']})});
const library=new TagLibrary({storage,teamId:'teamA'});
let state=library.load();
ok(library.key()==='ffa_tag_libraries_teamA','library is scoped to the active team');
ok(state.groups.formation.custom.join(',')==='Trey,Power-I'&&state.groups.backfield.custom[0]==='Ace','legacy custom chips migrate losslessly');
ok(storage.getItem('ffa_custom_chips_teamA')===null,'successful migration retires the legacy key');
ok(state.groups.front.enabled.includes('4-2-5'),'Front library is first-class and defaults enabled');
ok(library.add('front','Bear')&&library.group('front').enabled.includes('Bear'),'custom Front is added and enabled');
ok(library.setEnabled('formation','Shotgun',false)&&!library.group('formation').enabled.includes('Shotgun'),'built-in values can be hidden without removal');
ok(library.group('formation').values.includes('Shotgun'),'hidden built-in remains in the vocabulary');
ok(library.remove('formation','Power-I')&&!library.group('formation').values.includes('Power-I'),'custom values can be removed from future controls');
library.restore(); state=library.load();
ok(state.groups.formation.custom.length===0&&state.groups.formation.enabled.length===TagLibrary.DEFINITIONS.formation.length,'restore returns every group to defaults');
const other=new TagLibrary({storage,teamId:'teamB'});
ok(other.group('front').custom.length===0,'team libraries remain isolated');
ok(library.group('unknown').values.length===0&&!library.add('unknown','Value'),'unknown groups fail closed');
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);process.exit(fail?1:0);
