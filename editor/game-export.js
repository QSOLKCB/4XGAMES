// SPDX-License-Identifier: Apache-2.0
// Export the native scene preview with its dependency root inside this package.
import {exportGame as nativeExport} from '../vendor/vanillajs/demos/editor/game-export.js';
export function exportGame(scene,library,options){
  return nativeExport(scene,library,options)
    .replace("from './demos/editor/game-player.js'","from './vendor/vanillajs/demos/editor/game-player.js'")
    .replace('Place this HTML beside the packaged modules/ and demos/ folders.','Place this HTML in the 4XGAMES root beside vendor/ and serve over HTTP. This is a scene preview; export the campaign separately.');
}
