// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyGpu} from './browser-diagnostics.mjs';

test('fallback flags and software video status do not classify a hardware renderer as software', () => {
  const result = classifyGpu({
    commandLine: 'chromium --enable-unsafe-swiftshader',
    gpu: {
      devices: [{deviceString: 'ANGLE (NVIDIA GeForce RTX 5060 Ti)'}],
      auxAttributes: {glRenderer: 'ANGLE (NVIDIA GeForce RTX 5060 Ti)', ignoredDiagnostic: 'SwiftShader available'},
      featureStatus: {'2d_canvas': 'enabled', gpu_compositing: 'enabled', video_encode: 'disabled_software'}
    }
  }, {renderer: 'ANGLE (NVIDIA GeForce RTX 5060 Ti)'});
  assert.equal(result.rendererAssessment, 'NO_SOFTWARE_RENDERER_REPORTED');
  assert.deepEqual(result.reportedFeatures, {canvas2d: 'enabled', gpuCompositing: 'enabled'});
  assert.equal(result.softwareRenderers.length, 0);
  assert.match(result.workloadAcceleration, /^UNVERIFIED/);
});

test('software renderer identity is retained even when another adapter is hardware', () => {
  for (const renderer of ['ANGLE (Google, Vulkan SwiftShader Device)', 'llvmpipe (LLVM 18.1.8)', 'Software Rasterizer']) {
    const result = classifyGpu({gpu: {devices: [{deviceString: 'NVIDIA hardware adapter'}], auxAttributes: {glRenderer: renderer}}}, {renderer});
    assert.equal(result.rendererAssessment, 'SOFTWARE_RENDERER_REPORTED');
    assert.ok(result.softwareRenderers.includes(renderer));
    assert.match(result.workloadAcceleration, /^UNVERIFIED/);
  }
});

test('unavailable renderer or disabled feature status is reported without guessing acceleration', () => {
  const absent = classifyGpu({unavailable: 'CDP unsupported'});
  assert.equal(absent.rendererAssessment, 'UNAVAILABLE');
  assert.deepEqual(absent.reportedFeatures, {canvas2d: 'UNAVAILABLE', gpuCompositing: 'UNAVAILABLE'});
  assert.equal(classifyGpu({gpu: {featureStatus: {'2d_canvas': 'disabled_software', gpu_compositing: 'disabled_off'}}}).reportedFeatures.canvas2d, 'disabled_software');
});
