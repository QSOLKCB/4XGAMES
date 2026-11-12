// SPDX-License-Identifier: Apache-2.0
// Reproducible Horizons packs. Only the three directories named below are written.
// Existing campaigns are read as schema examples and are never regenerated here.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PACK_FILES, parsePack} from '../js/content.js';
import {createCampaign, exportPack, importPack} from '../js/workshop.js';

const table = (header, records) => '# ' + header + '\n' + records.map(row => row.join(' | ')).join('\n') + '\n';
const setting = (text, key, value) => text.replace(new RegExp('^' + key + ' = .*$', 'm'), key + ' = ' + value);
const objective = (id, kind, target, amount, requires, branch, title, description, victory = 0) => [id, 'player', kind, target, amount, requires, branch, title, description, victory];
const palettes = [
  ['#7de3e0', '#e2ffff'], ['#e8bc77', '#fff0d1'], ['#b7a0ff', '#f0e7ff'],
  ['#ff966b', '#ffe1bf'], ['#9acb91', '#e5f3c5'], ['#f3d77d', '#fff8d8'],
  ['#80b5ff', '#d9ecff'], ['#e898c6', '#ffe2f3'], ['#bfc8d9', '#f1f5ff']
];
// Original ordered silhouette vertices, mirrored deliberately where appropriate.
// Every role gets a different beam/length; every faction has a different keel.
const keels = [
  [[0,-50],[10,-30],[32,-12],[20,8],[38,34],[12,24],[0,46],[-12,24],[-38,34],[-20,8],[-32,-12],[-10,-30]],
  [[0,-48],[18,-28],[42,-20],[32,4],[46,26],[20,20],[14,44],[-14,44],[-20,20],[-46,26],[-32,4],[-42,-20],[-18,-28]],
  [[-8,-50],[8,-50],[8,-18],[28,-30],[38,-16],[24,8],[34,42],[10,30],[0,46],[-10,30],[-34,42],[-24,8],[-38,-16],[-28,-30],[-8,-18]],
  [[0,-50],[14,-16],[40,14],[40,36],[10,22],[0,48],[-10,22],[-40,36],[-40,14],[-14,-16]],
  [[0,-48],[12,-28],[34,-36],[42,-12],[26,4],[38,28],[18,42],[0,28],[-18,42],[-38,28],[-26,4],[-42,-12],[-34,-36],[-12,-28]],
  [[-6,-50],[6,-50],[14,-10],[34,-20],[42,28],[24,38],[8,22],[0,46],[-8,22],[-24,38],[-42,28],[-34,-20],[-14,-10]],
  [[0,-50],[34,-16],[20,4],[44,26],[24,40],[0,24],[-24,40],[-44,26],[-20,4],[-34,-16]],
  [[0,-48],[16,-24],[38,-30],[26,-2],[42,18],[26,38],[12,22],[0,46],[-12,22],[-26,38],[-42,18],[-26,-2],[-38,-30],[-16,-24]],
  [[-12,-48],[12,-48],[12,-10],[38,-10],[38,32],[22,32],[22,46],[-22,46],[-22,32],[-38,32],[-38,-10],[-12,-10]]
];

export const HORIZONS = [
  {
    id:'helix-accord', title:'Helix Accord: The Threefold Charter', columns:6, rows:4, homes:[0,8,16],
    description:'Twenty-four stars on three interwoven arms. Choose one of three new factions and build a trading charter or an industrial federation. Two routes; objective victories from turn 36.',
    factions:[
      ['Lattice Compact','LATTICE','A promise is strongest when every part can be inspected.','LCS',['Facet','Commonhold','Parallax','Tessellator']],
      ['Tidebound Exchange','TIDEBOUND','No frontier is distant when the passage remains open.','TES',['Slipstream','Caravan','Breakwater','Estuary']],
      ['Cinder Directorate','CINDER','Industry is a public trust; prosperity must survive us.','CDS',['Spark','Crucible','Firebrand','Kiln']]
    ],
    roots:['Spindle','Fret','Loom','Oriel','Braid','Filament','Hinge','Charter','Tidal','Shoal','Sluice','Weir','Ebb','Saffron','Current','Estuary','Cinder','Bellows','Tuyere','Anvil','Flue','Ember','Kiln','Accord'],
    rules:{turnLimit:120,colonyTarget:48,maxTech:6,warGrace:85,researchBase:65,researchStep:45,facilityLimit:4,tradeIncome:18,tradeCost:75},
    min:36, ai:[100,2,14,30], starts:[[0,450,380,20,'1'],[1,700,650,0,''],[2,390,300,75,'33']],
    objectives:[
      objective('arm-chart','survey','*',8,'','','Trace the three arms','Survey eight systems to publish the first common chart.'),
      objective('first-charter','colonies','-',4,'arm-chart','','The first charter','Hold four colony worlds before choosing your charter.'),
      objective('open-ledger','trade','*',1,'first-charter','exchange','The open ledger','Sign a trade pact with either neighbour.'),
      objective('reliable-fabrication','research','industry',3,'open-ledger','exchange','Reliable fabrication','Reach Industrial systems III to supply the charter.'),
      objective('exchange-charter','survive','-',36,'reliable-fabrication','exchange','The Threefold Charter','Keep the trading charter alive until turn 36.',1),
      objective('federation-foundries','research','industry',4,'first-charter','federation','A federation of foundries','Choose industrial federation and reach Industrial systems IV.'),
      objective('eight-workshops','colonies','-',8,'federation-foundries','federation','Eight lights of industry','Hold eight colony worlds in the new federation.'),
      objective('federation-charter','survive','-',44,'eight-workshops','federation','A charter made tangible','Complete the federation and endure until turn 44.',1)
    ],
    events:[['arm-buoy',4,'','message','player','Survey ships chart the arms. Your neighbour can become a trading partner long before war is inevitable.',0,0],['charter-grant',10,'arm-chart','resources','player','minerals',150,0],['exchange-dividend',18,'open-ledger','resources','player','energy',90,9],['fabricator-grant',22,'federation-foundries','resources','player','minerals',180,0],['assembly-call',30,'','message','player','An objective is a recorded milestone. Keep a surviving empire until the charter is ratified.',0,0]],
    music:[[48,3],[55,3],[60,2],[67,4],[62,3],[58,3],[65,2],[60,4]],
    buildings:[['relay','Exchange relay',105,65,0,24,6,0,0,'Supply trade networks while supporting research.'],['cooperative','Fabrication cooperative',130,80,9,0,0,14,0,'Turn local resources into sustained construction.']]
  },
  {
    id:'emberwake', title:'Emberwake Exodus: The Last Convoy', columns:8, rows:4, homes:[0,15,31],
    description:'Thirty-two stars along a fractured migration corridor. Three refugee cultures seek a future: build permanent havens or chart a mobile convoy network. Two routes; objectives from turn 48.',
    factions:[
      ['Ashwake Flotilla','ASHWAKE','A home is whoever still answers the convoy.','AFS',['Cinderwing','Hearthship','Outrider','Last Lantern']],
      ['Gloam Gardeners','GLOAM','Life is patient. Carry it beyond the fire.','GGS',['Sporewake','Orchard','Briarhook','Canopy']],
      ['Sunspindle Union','SUNSPINDLE','Every departure deserves a place to arrive.','SUS',['Daybreak','Longhouse','Sunlance','Horizon Loom']]
    ],
    roots:['Ashfall','Wake','Cairn','Ferry','Drift','Hearth','Shore','Solace','Fallow','Moss','Tendril','Mulch','Coppice','Gloam','Sprout','Orchard','Beacon','Dawn','Ray','Spindle','Weft','Sundial','Halo','Solstice','Outrider','Canvas','Haven','Harbour','Anchor','Crossing','Ember','Tomorrow'],
    rules:{turnLimit:140,colonyTarget:64,maxTech:6,warGrace:72,researchBase:70,researchStep:55,facilityLimit:4,repair:10,colonizeMinerals:45,colonizeEnergy:20},
    min:48, ai:[110,3,16,55], starts:[[0,620,320,0,'1'],[1,420,420,40,'28'],[2,500,540,0,'61']],
    objectives:[
      objective('lantern-chain','survey','*',10,'','','A chain of lanterns','Survey ten systems to map safe migration routes.'),
      objective('five-hearths','colonies','-',5,'lantern-chain','','Five hearths','Establish five colony worlds for the displaced fleets.'),
      objective('permanent-havens','colonies','-',9,'five-hearths','havens','Permanent havens','Choose settlement and hold nine colony worlds.'),
      objective('haven-industry','research','industry',4,'permanent-havens','havens','Rebuild what was lost','Reach Industrial systems IV for the settled network.'),
      objective('settled-exodus','survive','-',55,'haven-industry','havens','The long arrival','Complete the havens and survive to turn 55.',1),
      objective('convoy-engines','research','propulsion',4,'five-hearths','convoy','The unbroken convoy','Choose mobility and reach Warp dynamics IV.'),
      objective('convoy-chart','survey','*',24,'convoy-engines','convoy','A route for every vessel','Survey twenty-four systems to establish the convoy network.'),
      objective('convoy-fields','research','shields',3,'convoy-chart','convoy','Shelter between stars','Reach Field harmonics III for the crossing.'),
      objective('last-convoy','survive','-',48,'convoy-fields','convoy','The Last Convoy','Keep the convoy network alive until turn 48.',1)
    ],
    events:[['beacon',4,'','message','player','The old haven has fallen silent. Settle the corridor or prepare the fleet for a longer crossing.',0,0],['supply-train',12,'lantern-chain','resources','player','minerals',120,12],['garden-seed',20,'five-hearths','resources','player','science',160,0],['convoy-reserve',30,'convoy-engines','resources','player','energy',220,0],['haven-crates',34,'permanent-havens','resources','player','minerals',260,0],['last-light',43,'','message','player','Rivals will eventually contest the corridor. Keep your escorts supplied and leave room for replacement arks.',0,0]],
    music:[[45,4],[52,3],[57,3],[60,2],[64,4],[59,3],[55,3],[52,4]],
    buildings:[['sanctuary','Seed sanctuary',105,70,3,6,10,0,0,'Preserve the knowledge needed for a new home.'],['convoy-yard','Convoy depot',120,75,0,12,0,12,4,'Prepare replacement ships and protect migration hubs.']]
  },
  {
    id:'glass-meridian', title:'Glass Meridian: The Unwritten Sky', columns:8, rows:6, homes:[0,16,32],
    description:'Forty-eight stars on two concentric transit rings. Three new research cultures contest buried archives. Preserve the memory lattice or make the old network unnecessary. Two routes; objectives from turn 58.',
    factions:[
      ['Prism Cartographers','PRISM','A map is a promise to the next traveller.','PCS',['Refraction','Atlas','Isoline','Azimuth']],
      ['Mnemonic Choir','MNEMONIC','We remember the stars that forgot their names.','MCS',['Echo','Refrain','Counterpoint','Canticle']],
      ['Null Survey','NULL SURVEY','An unanswered question is a place to begin.','NSS',['Probe','Witness','Boundary','Null Horizon']]
    ],
    roots:['Prism','Angle','Parallax','Isopleth','Vector','Azimuth','Bearing','Datum','Echo','Meter','Chord','Cadence','Interval','Canon','Refrain','Anthem','Null','Measure','Witness','Query','Unknown','Proof','Axiom','Meridian'],
    rules:{turnLimit:170,colonyTarget:96,maxTech:6,warGrace:100,researchBase:80,researchStep:65,facilityLimit:4,relicScience:140,relicMinerals:100},
    min:58, ai:[110,2,18,35], starts:[[0,460,380,30,'1'],[1,500,360,70,'33'],[2,420,480,110,'65']],
    objectives:[
      objective('ring-chart','survey','*',12,'','','Read the rings','Survey twelve systems in the double transit ring.'),
      objective('memory-pair','archives','*',2,'ring-chart','','A pair of memories','Recover two archives with survey-equipped ships.'),
      objective('memory-industry','research','industry',5,'memory-pair','preserve','Preserve the lattice','Choose preservation and reach Industrial systems V.'),
      objective('memory-fields','research','shields',4,'memory-industry','preserve','Hold the memory fields','Reach Field harmonics IV to contain the recovered lattice.'),
      objective('memory-kept','survive','-',65,'memory-fields','preserve','A sky remembered','Complete preservation and survive to turn 65.',1),
      objective('unwritten-engines','research','propulsion',5,'memory-pair','unwritten','The unwritten route','Choose independence and reach Warp dynamics V.'),
      objective('unwritten-chart','survey','*',34,'unwritten-engines','unwritten','Beyond inherited charts','Survey thirty-four systems to chart a new meridian.'),
      objective('unwritten-sky','survive','-',58,'unwritten-chart','unwritten','The Unwritten Sky','Complete the independent chart and survive to turn 58.',1)
    ],
    events:[['paired-signal',5,'','message','player','Two rings carry the same signal. Archive salvage belongs to the first survey-equipped ship to arrive.',0,0],['ring-grant',15,'ring-chart','resources','player','minerals',180,0],['memory-decoded',24,'memory-pair','resources','player','science',240,0],['field-resupply',40,'memory-industry','resources','player','energy',230,0],['chart-resupply',40,'unwritten-engines','resources','player','minerals',200,0],['quiet-observatory',52,'','message','player','The archive is evidence of a lost civilisation. What survives of it is your choice.',0,0]],
    music:[[50,4],[57,3],[61,3],[64,4],[69,2],[62,4],[58,3],[53,4]],
    buildings:[['archive-vault','Archive vault',135,85,0,0,24,0,4,'Protect recovered knowledge and accelerate research.'],['phase-station','Phase station',120,75,0,20,5,4,0,'Supply the double-ring observation network.']]
  }
];

function geography(spec) {
  const count=spec.columns*spec.rows, links=Array.from({length:count},()=>new Set()), layout=[];
  const edge=(a,b)=>{links[a].add(b);links[b].add(a);};
  if(spec.id==='helix-accord') {
    for(let arm=0;arm<3;arm++) for(let step=0;step<8;step++) {
      const id=arm*8+step,angle=(-90+arm*120+step*4)*Math.PI/180,radius=470-step*47;
      layout.push([id,Math.round(560+radius*Math.cos(angle)),Math.round(560+radius*Math.sin(angle))]);
      if(step)edge(id-1,id);
    }
    for(let arm=0;arm<3;arm++){edge(arm*8+7,((arm+1)%3)*8+7);edge(arm*8+4,((arm+1)%3)*8+4);}
  } else if(spec.id==='emberwake') {
    for(let id=0;id<count;id++) {
      const x=id%8,y=Math.floor(id/8);
      if(x<7)edge(id,id+1);
      if(y<3&&(x===1||x===6))edge(id,id+8);
      layout.push([id,80+x*140+(y%2)*24,100+y*185+(x%3)*22]);
    }
  } else {
    for(let id=0;id<count;id++) {
      const ring=Math.floor(id/24),offset=id%24,angle=(offset*15-90+ring*7.5)*Math.PI/180,radius=ring?285:500;
      edge(id,ring*24+(offset+1)%24);
      if(!ring&&offset%6===0)edge(id,id+24);
      layout.push([id,Math.round(600+radius*Math.cos(angle)),Math.round(600+radius*Math.sin(angle))]);
    }
  }
  return {layout, map:links.map((adj,id)=>[id,[...adj].sort((a,b)=>a-b).join(','),!spec.homes.includes(id)&&id%4===2?1:0])};
}

export function makeHorizons(base) {
  return HORIZONS.map((spec,campaignIndex)=>{
    const raw={...base},count=spec.columns*spec.rows,geo=geography(spec);
    raw['campaign.txt']=`id = ${spec.id}\nversion = 1.0.0\ntitle = ${spec.title}\ndescription = ${spec.description}\n`;
    for(const [key,value] of Object.entries({columns:spec.columns,rows:spec.rows,...spec.rules}))raw['rules.txt']=setting(raw['rules.txt'],key,value);
    raw['scenario.txt']=`# Each selected culture has the complete two-route expedition.\nplayable = 0,1,2\nvictory = objectives\nminVictoryTurn = ${spec.min}\ndefeatAtLimit = 1\n`;
    raw['empire_names.txt']=spec.factions.map(f=>f[0]).join('\n')+'\n';
    raw['empires.txt']=table('id | short | primary | accent | home | ethos',spec.factions.map((f,i)=>[i,f[1],...palettes[campaignIndex*3+i],spec.homes[i],f[2]]));
    const systemNames=Array.from({length:count},(_,i)=>spec.roots[i%spec.roots.length]+(spec.id==='glass-meridian'?(i<24?' Expanse':' Enclave'):''));
    raw['system_names.txt']=systemNames.join('\n')+'\n';
    raw['planet_names.txt']=systemNames.flatMap(name=>[name+' Prime',name+' Haven']).join('\n')+'\n';
    raw['map.txt']=table('id | reciprocal starlanes | archive',geo.map);
    raw['layout.txt']=table('id | x | y',geo.layout);
    const roleNames=['scout','ark','frigate','cruiser'];
    const shapes=[[.70,.94],[.95,.80],[1,1],[1.08,1.08]];
    const stats=[[5,26,32,40,1],[8,40,58,65,1],[8,56,68,74,1],[14,116,135,145,3]];
    const hullRows=[],shipRows=[];
    for(let faction=0;faction<3;faction++) {
      const family=campaignIndex*3+faction, f=spec.factions[faction];
      for(let role=0;role<4;role++) {
        const [slots,hp,cost,work,level]=stats[role],beam=shapes[role][0],length=shapes[role][1];
        const shape=keels[family].map(([x,y])=>[Math.round(x*beam),Math.round(y*length)].join(',')).join(';');
        hullRows.push([`${roleNames[role]}-${faction}`,f[4][role],faction,slots,hp+(faction===2?8:faction===1?4:0),cost+(faction===2?8:0),work+(faction===2?5:0),'industry',level,shape]);
      }
      const scout=faction===1?'drive-1,shield-1,shield-1,survey':'drive-1,laser-1,shield-1,survey';
      const ark=faction===2?'drive-1,shield-1,shield-1,colony':'drive-1,shield-1,colony';
      const escort=faction===0?'drive-1,laser-1,laser-1,laser-1,shield-1,marines':faction===1?'drive-1,laser-1,laser-1,shield-1,shield-1,marines':'drive-1,laser-1,laser-1,shield-1,marines';
      [scout,ark,escort].forEach((parts,role)=>shipRows.push([faction,`${f[3]} ${f[4][role]}`,`${roleNames[role]}-${faction}`,parts]));
    }
    raw['hulls.txt']=table('id | name | faction | slots | hp | cost | work | tech | level | polygon',hullRows);
    raw['ships.txt']=table('empire | class | hull | components',shipRows);
    raw['components.txt']+=table('Horizons alternatives retain ordinary slot and research constraints',[
      ['relay-drive','Compact relay drive','engine',1,65,0,0,2,'propulsion',3,'Two lanes in one slot; costs more than the larger conventional drive.'],
      ['compression-lance','Compression lance','weapon',3,95,0,52,0,'weapons',4,'A heavy single mount; compare its size and price with multiple smaller weapons.'],
      ['resonant-shell','Resonant shell','shield',3,65,80,0,0,'shields',3,'A bulky early protection option for spacious hulls.']
    ]);
    raw['buildings.txt']+=table('Horizons facilities | name | cost | work | minerals | energy | science | production | defence | description',spec.buildings);
    raw['dependencies.txt']='# field | level | prerequisite | level\nweapons | 4 | industry | 3\nshields | 4 | propulsion | 2\npropulsion | 5 | industry | 3\n';
    raw['objectives.txt']=table('id | owner | kind | target | amount | requires | branch | title | description | victory',spec.objectives);
    raw['events.txt']=table('id | turn | requires | kind | owner | target | value | repeat',spec.events);
    raw['starts.txt']=table('empire | minerals | energy | science | extra colonies',spec.starts);
    raw['ai.txt']=['reserveMinerals','colonyShips','militaryLimit','aggression'].map((key,i)=>`${key} = ${spec.ai[i]}`).join('\n')+'\n';
    raw['music.txt']=table('MIDI note | duration seconds',spec.music);
    const authored=createCampaign(base,{id:spec.id,title:spec.title,description:spec.description,columns:spec.columns,rows:spec.rows,homes:spec.homes,files:raw});
    const roundtrip=importPack(exportPack(authored));
    if(JSON.stringify(roundtrip)!==JSON.stringify(parsePack(raw).raw))throw new Error('Horizons authoring roundtrip failed: '+spec.id);
    return {id:spec.id,raw:roundtrip};
  });
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const base=Object.fromEntries(await Promise.all(PACK_FILES.map(async name=>[name+'.txt',await fs.readFile(new URL(`../mods/frontier/${name}.txt`,import.meta.url),'utf8')])));
  for(const {id,raw} of makeHorizons(base)) {
    const directory=new URL(`../mods/${id}/`,import.meta.url);await fs.mkdir(directory,{recursive:true});
    for(const [name,text] of Object.entries(raw))await fs.writeFile(new URL(name,directory),text);
    console.log('Validated, roundtripped and wrote '+id);
  }
}
