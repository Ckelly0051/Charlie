import { TagLibrary } from '../js/tag-library.js';

let pass=0,fail=0;
const ok=(value,label,extra='')=>{console.log(`${value?'  PASS':'  FAIL'}  ${label}${!value&&extra?` -- ${extra}`:''}`);value?pass++:fail++;};
class MemoryStorage { constructor(seed={}){this.data=new Map(Object.entries(seed));} getItem(k){return this.data.get(k)||null;} setItem(k,v){this.data.set(k,String(v));} removeItem(k){this.data.delete(k);} get length(){return this.data.size;} key(i){return [...this.data.keys()][i]??null;} }
// Old chips and pre-version-4 libraries were converted once on the coach's
// profile (legacy excision Pass 2b); the converter and its checks are deleted.
const storage=new MemoryStorage();
const library=new TagLibrary({storage,teamId:'teamA'});
let state=library.load();
ok(library.key()==='ffa_tag_libraries_teamA','library is scoped to the active team');
ok(library.add('formation','Trey')&&library.group('formation').custom.join(',')==='Trey','a custom formation is added once');
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
ok(library.setEnabled('formation','I-Form',false)&&!new TagLibrary({storage,teamId:'teamA'}).group('formation').enabled.includes('I-Form'),'a hidden standard formation stays hidden across a reload');
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
// Reserved wrong-field values: refused on add, filtered on read, storage untouched.
const reservedStorage=new MemoryStorage({ffa_tag_libraries_teamR:JSON.stringify({version:4,groups:{formation:{custom:['Shotgun','Trey'],enabled:['Shotgun','Trey'],order:['Shotgun','Trey']}}})});
const reserved=new TagLibrary({storage:reservedStorage,teamId:'teamR'});
ok(!reserved.add('formation','Pistol')&&reserved.lastError?.name==='ReservedValue'&&reserved.lastError.owner==='QB Alignment','a QB alignment cannot be added as a formation',JSON.stringify(reserved.lastError));
ok(!reserved.add('formation','EMPTY')&&reserved.lastError?.owner==='Backfield','Empty cannot be added as a formation, in any case',JSON.stringify(reserved.lastError));
ok(!reserved.add('backfield','Shotgun')&&!reserved.add('coverage','Zone')&&reserved.lastError?.owner==='Coverage Family','an alignment is not a backfield and a family is not a coverage call');
ok(reserved.add('coverage','Cover 3 Match')&&reserved.add('front','Man Free')&&reserved.add('formation','Shotgun Special'),'a value that merely contains a reserved word is allowed');
// A compound label charts the same combined shape as the lone reserved word.
const compound=[['formation','Shotgun + Trips','QB Alignment'],['formation','Trips + Empty','Backfield'],['formation','Trips+under center','QB Alignment'],['backfield','Pistol + Diamond','QB Alignment'],['coverage','Cover 3 + Man','Coverage Family']]
  .map(([g,v,owner])=>({v,refused:!reserved.add(g,v),owner:reserved.lastError?.owner,expected:owner}));
ok(compound.every(c=>c.refused&&c.owner===c.expected),'a compound label carrying a reserved token is refused, whatever the spacing or case',JSON.stringify(compound));
ok(reserved.add('formation','Trips + Bunch'),'a compound of allowed formations is still a valid choice');
const compoundStorage=new MemoryStorage({ffa_tag_libraries_teamS:JSON.stringify({version:4,groups:{
  formation:{custom:['Shotgun + Trips','Trips + Empty','Wing Special'],enabled:['Shotgun + Trips','Trips + Empty','Wing Special'],order:['Shotgun + Trips','Trips + Empty','Wing Special']},
  backfield:{custom:['Pistol + Diamond'],enabled:['Pistol + Diamond'],order:['Pistol + Diamond']}}})});
const compoundLib=new TagLibrary({storage:compoundStorage,teamId:'teamS'});
ok(['Shotgun + Trips','Trips + Empty'].every(v=>!compoundLib.group('formation').values.includes(v)&&!compoundLib.group('formation').enabled.includes(v))
   &&!compoundLib.group('backfield').values.includes('Pistol + Diamond')&&compoundLib.group('formation').values.includes('Wing Special'),
  'a saved compound choice carrying a reserved token is never offered; a legitimate custom choice is',JSON.stringify(compoundLib.group('formation').custom));
const savedCompound=JSON.parse(compoundStorage.getItem('ffa_tag_libraries_teamS')).groups;
ok(savedCompound.formation.custom.includes('Shotgun + Trips')&&savedCompound.backfield.custom.includes('Pistol + Diamond'),'saved compound entries are not rewritten');
{
  const { SeasonFormat } = await import('../js/season-format.js');
  const leaks=[];
  for (const key of ['formation','backfield','coverage']) for (const v of new TagLibrary({storage:compoundStorage,teamId:'teamS'}).group(key).enabled) {
    const field=key;
    if (SeasonFormat.seasonProblems({version:5,type:'season',games:[{id:'g',plays:[{id:1,tags:{unit:'offense',[field]:v}}]}]}).length) leaks.push(`${key}:${v}`);
  }
  ok(leaks.length===0,'no choice the library offers makes SeasonFormat report an old-format play',JSON.stringify(leaks));
}
ok(!reserved.group('formation').values.includes('Shotgun')&&!reserved.group('formation').enabled.includes('Shotgun')&&reserved.group('formation').custom.includes('Trey'),'a saved reserved value is never offered; its neighbors are');
ok(JSON.parse(reservedStorage.getItem('ffa_tag_libraries_teamR')).groups.formation.custom.includes('Shotgun'),'the saved library entry is not rewritten');
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);process.exit(fail?1:0);
