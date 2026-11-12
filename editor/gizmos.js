// SPDX-License-Identifier: Apache-2.0
// Screen-sized handles shared by overlay rendering, picking and drag conversion.
// Authoritative transforms/snapping still use the pinned native implementation.
import {axisDirection,projectPoint} from '../vendor/vanillajs/demos/editor/gizmos.js';
import {cameraBasis} from '../vendor/vanillajs/demos/editor/viewport.js';
export {applyGizmo} from '../vendor/vanillajs/demos/editor/gizmos.js';

const AXES=['x','y','z'],COLORS=['#f55257','#59f28a','#578cff'];
export const HANDLE_PIXELS=80;

export function gizmoHandles(camera,object,width,height,space='world',tool='move'){
  if(!object)return [];
  if(!['move','rotate','scale'].includes(tool))throw new TypeError('invalid gizmo tool');
  const from=projectPoint(camera,object.position,width,height);
  if(!from)return [];
  // Measure one camera-plane world unit using the actual projection, avoiding
  // duplicated FOV constants and retaining CSS-pixel sizing at every DPR.
  const right=cameraBasis(camera).right;
  const unit=projectPoint(camera,object.position.map((v,i)=>v+right[i]),width,height);
  if(!unit)return [];
  const pixelsPerUnit=Math.hypot(unit.x-from.x,unit.y-from.y);
  if(!Number.isFinite(pixelsPerUnit)||pixelsPerUnit<=0)return [];
  const length=HANDLE_PIXELS/pixelsPerUnit;
  return AXES.flatMap((axis,i)=>{
    if(tool==='rotate'&&axis!=='y')return [];
    const direction=axisDirection(object,axis,space);
    const to=projectPoint(camera,object.position.map((v,k)=>v+direction[k]*length),width,height);
    if(!to||Math.hypot(to.x-from.x,to.y-from.y)<4)return [];
    return [{axis,color:COLORS[i],from,to,length}];
  });
}

export function pickGizmo(handles,px,py){
  let best=null;
  for(const handle of handles){
    const {from,to}=handle,dx=to.x-from.x,dy=to.y-from.y,d=dx*dx+dy*dy;
    const u=((px-from.x)*dx+(py-from.y)*dy)/d;
    if(u<.18||u>1.22)continue;
    const t=Math.max(0,Math.min(1,u)),distance=Math.hypot(px-from.x-dx*t,py-from.y-dy*t);
    if(distance<=11&&(!best||distance<best.distance))best={handle,distance};
  }
  return best?.handle??null;
}

export function axisDragAmount(handle,start,end){
  const dx=handle.to.x-handle.from.x,dy=handle.to.y-handle.from.y;
  return ((end.x-start.x)*dx+(end.y-start.y)*dy)/(dx*dx+dy*dy)*handle.length;
}
