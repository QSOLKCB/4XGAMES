// SPDX-License-Identifier: Apache-2.0
// Rebuild the three original campaign packs from the preserved Frontier tables.
import fs from 'node:fs/promises';
import { PACK_FILES, parsePack } from '../js/content.js';
import { createCampaign, exportPack, importPack } from '../js/workshop.js';
const base = Object.fromEntries(await Promise.all(PACK_FILES.map(async n => [n + '.txt', await fs.readFile(new URL(`../mods/frontier/${n}.txt`, import.meta.url), 'utf8')])));
const rows = text => text.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|').map(s => s.trim()));
const table = (header, data) => '# ' + header + '\n' + data.map(r => r.join(' | ')).join('\n') + '\n';
const setting = (raw, key, value) => raw.replace(new RegExp('^' + key + ' = .*$', 'm'), key + ' = ' + value);
const roots = ['Aster', 'Morrow', 'Iskra', 'Nacre', 'Serein', 'Vesper', 'Orison', 'Cinder', 'Tamar', 'Hallow', 'Rill', 'Sable', 'Aven', 'Tern', 'Eidra', 'Nim'];
const realms = ['Reach', 'Crown', 'Veil', 'March'];
const specs = [
 {id:'grand-frontier', title:'Grand Frontier: The Long Concord', description:'Sixty-four stars and three rival visions. Build a lasting commonwealth through trade and science, or bind a wide dominion. Staged goals keep the frontier open for 100–220 turns.', columns:8, rows:8, homes:[0,31,63], turns:220, min:100, playable:'0,1,2', names:['Meridian Commonwealth','The Viridian Accord','Basalt Hegemony'], short:['MERIDIAN','VIRIDIAN','BASALT'], prefixes:['MCS','VAS','BHS'], rule:{colonyTarget:100,maxTech:8,warGrace:48,researchBase:120,researchStep:220,facilityLimit:5,startMinerals:450,startEnergy:300},
 objectives:[
 ['first-chart','player','survey','*',12,'','', 'A shared chart','Survey twelve stars to establish the frontier survey service.',0],
 ['settled-reach','player','colonies','-',6,'first-chart','', 'Six lights in the dark','Develop six colony worlds before choosing your political future.',0],
 ['concord','player','trade','*',1,'settled-reach','concord','The concord charter','Choose a diplomatic future and maintain at least one trade pact.',0],
 ['concord-labs','player','research','industry',6,'concord','concord','A durable prosperity','Reach Industrial Systems VI to support the new commonwealth.',0],
 ['long-concord','player','survive','-',100,'concord-labs','concord','The Long Concord','Hold your commonwealth together until turn 100.',1],
 ['dominion','player','colonies','-',18,'settled-reach','dominion','The dominion charter','Choose territorial ascendancy and hold eighteen colony worlds.',0],
 ['dominion-arms','player','research','weapons',6,'dominion','dominion','An enduring deterrent','Reach Directed Energy VI to protect the dominion.',0],
 ['long-dominion','player','survive','-',100,'dominion-arms','dominion','A hundred-year mandate','Keep the dominion intact until turn 100.',1]],
 events:[['survey-grant',12,'','resources','player','minerals',120,0],['outer-charter',35,'settled-reach','resources','player','science',150,0],['council-call',65,'','message','player','The century council approaches. Complete your chosen charter before the final reckoning.',0,0],['renewal',90,'','resources','player','energy',200,0]], starts:[[0,450,300,0,''],[1,450,300,0,''],[2,450,300,0,'']]},
 {id:'fallen-gates',title:'Fallen Gates: The Quiet Meridian',description:'Thirty-six stars linked by broken transit corridors. Recover gate archives, then choose restoration or a new path through the silent network. Progress survives saves; plan for 70–180 turns.',columns:6,rows:6,homes:[0,17,35],turns:180,min:70,playable:'0,1,2',names:['Lantern Cartographers','Choir of Glass','The Hinterland Union'],short:['LANTERNS','GLASS','HINTERLAND'],prefixes:['LCS','CGS','HUS'],rule:{colonyTarget:60,maxTech:8,warGrace:65,researchBase:100,researchStep:150,facilityLimit:4,startMinerals:400,startEnergy:300,relicScience:100,relicMinerals:80},
 objectives:[
 ['first-signal','player','survey','*',8,'','','Read the silence','Survey eight stars to locate the broken transit paths.',0],
 ['archive-key','player','archives','*',2,'first-signal','','The two keys','Recover two unclaimed archives with survey-equipped ships.',0],
 ['restoration','player','research','industry',5,'archive-key','restore','Restore the old gates','Choose restoration and develop Industrial Systems V.',0],
 ['restoration-field','player','research','shields',5,'restoration','restore','Bind the gate fields','Reach Field Harmonics V to stabilise the old network.',0],
 ['restored-meridian','player','survive','-',70,'restoration-field','restore','The Quiet Meridian','Complete restoration and endure until turn 70.',1],
 ['new-path','player','survey','*',30,'archive-key','path','Cut a new path','Choose independent routes and chart thirty stars.',0],
 ['path-engines','player','research','propulsion',6,'new-path','path','Beyond the gates','Reach Warp Dynamics VI to make the network unnecessary.',0],
 ['open-meridian','player','survive','-',70,'path-engines','path','An open meridian','Keep the new path open until turn 70.',1]],
 events:[['signal',6,'','message','player','The gate signal repeats in pairs. Survey arrays can recover the keys; another empire can claim them first.',0,0],['key-supply',12,'first-signal','resources','player','minerals',180,0],['archive-decoded',20,'archive-key','resources','player','science',250,0],['gate-echo',45,'','message','player','Restoration needs industry and field harmonics. The independent route needs charts and fast drives.',0,0]],starts:[[0,400,300,0,''],[1,400,300,0,''],[2,400,300,0,'']]},
 {id:'outer-rim',title:'Siege of the Outer Rim',description:'Forty stars across a narrow rim. Two occupying powers hold the interior. Survive escalating incursions and rebuild, or liberate the two command worlds. One playable defender; 90–160 turns.',columns:8,rows:5,homes:[0,31,39],turns:160,min:60,playable:'0',names:['Rimward Freeholds','The Pale Directorate','Obsidian Mandate'],short:['FREEHOLDS','PALE','OBSIDIAN'],prefixes:['RFS','PDS','OMS'],rule:{colonyTarget:70,maxTech:8,warGrace:12,researchBase:70,researchStep:45,facilityLimit:5,startMinerals:600,startEnergy:400,repair:12},
 objectives:[
 ['foothold','player','colonies','-',4,'','','Keep the freeholds','Maintain four colony worlds to supply the defence.',0],
 ['defence-doctrine','player','research','weapons',4,'foothold','endure','The shield of the rim','Choose endurance and develop Directed Energy IV.',0],
 ['endure','player','survive','-',90,'defence-doctrine','endure','Unbroken freeholds','Survive until turn 90 with your defence programme complete.',1],
 ['liberate-pale','player','control',31,1,'foothold','reclaim','Break the pale throne','Choose reconquest and take a world in the Directorate command system.',0],
 ['liberate-obsidian','player','control',39,1,'liberate-pale','reclaim','Break the obsidian throne','Take a world in the Mandate command system.',0],
 ['reconquest','player','survive','-',60,'liberate-obsidian','reclaim','The rim reclaimed','Complete both liberations and reach turn 60.',1]],
 events:[['ultimatum',3,'','message','player','The interior powers demand surrender. Build defence grids and keep your energy reserves above zero.',0,0],['pale-war',10,'','war',1,0,0,0],['mandate-war',18,'','war',2,0,0,0],['relief',14,'','resources','player','minerals',160,14],['first-incursion',25,'','spawn',1,2,9,10],['second-incursion',45,'','spawn',2,2,18,8],['last-reserve',65,'','resources','player','energy',250,0]],starts:[[0,650,500,0,'2,4'],[1,900,650,0,'46,48,50,60'],[2,900,650,0,'64,66,68,76']]}
];
for(const s of specs){
 const raw={...base},n=s.columns*s.rows;
 raw['campaign.txt']=`id = ${s.id}\nversion = 1.0.0\ntitle = ${s.title}\ndescription = ${s.description}\n`;
 for(const [k,v] of Object.entries({columns:s.columns,rows:s.rows,turnLimit:s.turns,...s.rule})) raw['rules.txt']=setting(raw['rules.txt'],k,v);
 raw['scenario.txt']=`# Optional expansion rules; original packs keep legacy defaults.\nplayable = ${s.playable}\nvictory = objectives\nminVictoryTurn = ${s.min}\ndefeatAtLimit = 1\n`;
 raw['empire_names.txt']=s.names.join('\n')+'\n';
 raw['empires.txt']=table('id | short | primary | accent | home | ethos',rows(base['empires.txt']).map((r,i)=>[i,s.short[i],r[2],r[3],s.homes[i],["A future worth sharing.","Every promise leaves a trace.","What we build will outlast us."][i]]));
 raw['system_names.txt']=Array.from({length:n},(_,i)=>`${roots[i%16]} ${realms[Math.floor(i/16)]}`).join('\n')+'\n';
 raw['planet_names.txt']=Array.from({length:n*2},(_,i)=>`${roots[Math.floor(i/2)%16]} ${realms[Math.floor(i/32)]} ${i%2?'Secundus':'Prime'}`).join('\n')+'\n';
 const links=Array.from({length:n},()=>new Set());const edge=(a,b)=>{links[a].add(b);links[b].add(a)};
 // Connected rings for Gates; a barred grid for Siege; full grid for Frontier.
 for(let i=0;i<n;i++){
  const x=i%s.columns,y=Math.floor(i/s.columns);
  if(x+1<s.columns)edge(i,i+1);
  if(y+1<s.rows && (s.id==='grand-frontier'||(s.id==='fallen-gates'?(x===0||x===s.columns-1||y%2===0&&x===2):(x===1||x===6))))edge(i,i+s.columns);
 }
 raw['map.txt']=table('id | reciprocal starlanes | archive',links.map((adj,i)=>[i,[...adj].sort((a,b)=>a-b).join(','),s.id==='fallen-gates'?(i%3===1?1:0):(i%9===4?1:0)]));
 raw['layout.txt']=table('id | x | y',Array.from({length:n},(_,i)=>[i,90+(i%s.columns)*166,90+Math.floor(i/s.columns)*156+(s.id==='fallen-gates'?(i%s.columns%2)*35:0)]));
 raw['ships.txt']=table('empire | class | hull | components',rows(base['ships.txt']).map(r=>[r[0],`${s.prefixes[+r[0]]} ${r[1].split(' ').slice(1).join(' ')}`,r[2],r[3]]));
 raw['hulls.txt']=table('id | name | faction | slots | hp | cost | work | tech | level | polygon',rows(base['hulls.txt']).map(r=>[r[0],`${s.short[+r[2]]} ${r[1]}`,...r.slice(2)]));
 raw['components.txt']+=`drive-6 | Fold drive | engine | 2 | 100 | 0 | 0 | 4 | propulsion | 6 | Four lanes per turn; groups travel at the slowest member.\nlaser-6 | Horizon lance | weapon | 2 | 120 | 0 | 65 | 0 | weapons | 6 | Advanced siege weapon.\nshield-6 | Aegis field | shield | 2 | 95 | 80 | 0 | 0 | shields | 6 | Strong protection for long deployments.\n`;
 raw['buildings.txt']+='habitat | Civic habitat | 110 | 70 | 4 | 5 | 4 | 2 | 0 | Balanced development for established colonies.\nobservatory | Gate observatory | 140 | 80 | 0 | 0 | 22 | 0 | 0 | A costly research focus for mature worlds.\n';
 raw['dependencies.txt']='# field | target level | prerequisite field | prerequisite level\nweapons | 4 | industry | 3\nshields | 4 | propulsion | 2\npropulsion | 6 | industry | 4\n';
 raw['objectives.txt']=table('id | owner | kind | target | amount | requires | branch | title | description | victory',s.objectives.map(row=>s.id==='outer-rim'?row:[row[0],'*',...row.slice(2)]));
 raw['events.txt']=table('id | earliest turn | requires | kind | owner | target | value | repeat interval',s.events);
 raw['starts.txt']=table('empire | minerals | energy | science | extra colonies',s.starts);
 raw['ai.txt']=`reserveMinerals = 100\ncolonyShips = ${s.id==='grand-frontier'?3:2}\nmilitaryLimit = ${s.id==='outer-rim'?20:24}\naggression = ${s.id==='outer-rim'?75:40}\n`;
 const authored=createCampaign(base,{id:s.id,title:s.title,description:s.description,columns:s.columns,rows:s.rows,homes:s.homes,files:raw});
 const roundtrip=importPack(exportPack(authored));
 if(JSON.stringify(roundtrip)!==JSON.stringify(parsePack(raw).raw))throw Error('Authoring roundtrip mismatch');
 const target=new URL(`../mods/${s.id}/`,import.meta.url);await fs.mkdir(target,{recursive:true});
 for(const [name,text] of Object.entries(roundtrip))await fs.writeFile(new URL(name,target),text);
 console.log('Validated and wrote '+s.id);
}
