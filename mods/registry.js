// SPDX-License-Identifier: Apache-2.0
// Register trusted, local source extensions here. Uploaded text packs never execute code.
import machineHooks from './machine-dawn/hooks.js';
export const campaigns = [
  { id: 'frontier', title: 'The Open Frontier', base: new URL('./frontier/', import.meta.url), hooks: {} },
  { id: 'machine-dawn', title: 'Machine Dawn', base: new URL('./machine-dawn/', import.meta.url), hooks: machineHooks }
];
