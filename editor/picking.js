// SPDX-License-Identifier: Apache-2.0
// Pick the geometry actually drawn by the native viewport. Imported triangles
// use their own bounds, not the fallback primitive's unit cube.
import {hitWorldBox} from '../vendor/vanillajs/demos/editor/viewport.js';
import {validateAssetLibrary} from '../vendor/vanillajs/demos/editor/asset-foundry.js';

const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function localRay(object,ray){
  const a=object.rotationY*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const inverse=v=>[(c*v[0]-s*v[2])/object.scale[0],v[1]/object.scale[1],(s*v[0]+c*v[2])/object.scale[2]];
  // Do not renormalize: the ray parameter remains comparable across objects.
  return {origin:inverse(sub(ray.origin,object.position)),dir:inverse(ray.dir)};
}
function bounds(mesh){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<mesh.vertices.length;i+=5)for(let k=0;k<3;k++){
    lo[k]=Math.min(lo[k],mesh.vertices[i+k]);hi[k]=Math.max(hi[k],mesh.vertices[i+k]);
  }
  return {lo,hi};
}
function intersectsBounds({lo,hi},ray){
  let near=0,far=Infinity;
  for(let i=0;i<3;i++){
    if(ray.dir[i]===0){if(ray.origin[i]<lo[i]||ray.origin[i]>hi[i])return false;continue;}
    let a=(lo[i]-ray.origin[i])/ray.dir[i],b=(hi[i]-ray.origin[i])/ray.dir[i];
    if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);
    if(near>far)return false;
  }
  return true;
}
function hitTriangle(ray,a,b,c){
  const e1=sub(b,a),e2=sub(c,a),p=cross(ray.dir,e2),det=dot(e1,p);
  const tolerance=1e-10*Math.hypot(...e1)*Math.hypot(...e2)*Math.hypot(...ray.dir);
  if(Math.abs(det)<=tolerance)return null;
  const tvec=sub(ray.origin,a),u=dot(tvec,p)/det;
  if(u<0||u>1)return null;
  const q=cross(tvec,e1),v=dot(ray.dir,q)/det;
  if(v<0||u+v>1)return null;
  const t=dot(e2,q)/det;return t>=0?t:null;
}
export function pickObject(world,ray,library=null){
  const assets=library?validateAssetLibrary(library):null;
  const meshes=new Map(assets?.assets.filter(a=>a.kind==='mesh').map(a=>[a.id,a])??[]);
  const placements=new Map(assets?.placements.map(p=>[p.entityId,p])??[]),meshBounds=new Map();
  let best=null;
  for(const object of world){
    if(!object.visible||object.components?.mesh.enabled===false)continue;
    const mesh=meshes.get(placements.get(object.id)?.meshId);let t=null;
    if(mesh){
      const local=localRay(object,ray);
      if(!meshBounds.has(mesh.id))meshBounds.set(mesh.id,bounds(mesh));
      if(!intersectsBounds(meshBounds.get(mesh.id),local))continue;
      for(let i=0;i<mesh.vertices.length;i+=15){
        const hit=hitTriangle(local,mesh.vertices.slice(i,i+3),mesh.vertices.slice(i+5,i+8),mesh.vertices.slice(i+10,i+13));
        if(hit!==null&&(t===null||hit<t))t=hit;
      }
    }else t=hitWorldBox(object,ray);
    if(t!==null&&(!best||t<best.t||(t===best.t&&object.id<best.id)))best={id:object.id,t};
  }
  return best?.id??null;
}
