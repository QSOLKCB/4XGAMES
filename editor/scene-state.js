// SPDX-License-Identifier: Apache-2.0
// Local transaction boundary; native scene/project schemas stay unchanged.
import {validateScene,sceneWorld,commitHistory} from '../vendor/vanillajs/demos/editor/model.js';
import {prunePlacements} from '../vendor/vanillajs/demos/editor/asset-foundry.js';

export function validateRenderableScene(candidate){
  const scene=validateScene(candidate);
  sceneWorld(scene); // Validate composed positions/scales before history or recovery.
  return scene;
}

export function prepareSceneEdit(history,library,candidate,{clearPlacements=false,nextLibrary=library}={}){
  const scene=validateRenderableScene(candidate);
  const previousPlacements=prunePlacements(history.present,library).placements;
  const next=prunePlacements(scene,clearPlacements?{...nextLibrary,placements:[]}:nextLibrary);
  let updated=commitHistory(history,scene);
  // Replacing an identical map still needs an undo step if attachments change.
  // Use a distinct scene identity for the placement-history WeakMap, with the
  // same 64-step bound as the native scene history.
  if(updated===history&&JSON.stringify(previousPlacements)!==JSON.stringify(next.placements)){
    updated={past:[...history.past.slice(-63),history.present],present:scene,future:[]};
  }
  return {history:updated,library:next,previousPlacements};
}

