// SPDX-License-Identifier: Apache-2.0
// Pure interpretation of browser diagnostics; this module does not launch a browser.
export function classifyGpu(systemInfo = {}, webgl = {}) {
  const gpu = systemInfo?.gpu || {};
  const renderers = [
    ...(gpu.devices || []).map(device => device.deviceString),
    gpu.auxAttributes?.glRenderer,
    webgl?.renderer
  ].filter(value => typeof value === 'string' && value.length);
  // Command-line flags describe available fallbacks, not the active renderer.
  // Software video encoding likewise does not identify the Canvas renderer.
  const softwareRenderers = renderers.filter(value => /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(value));
  return {
    rendererAssessment: softwareRenderers.length ? 'SOFTWARE_RENDERER_REPORTED' : renderers.length ? 'NO_SOFTWARE_RENDERER_REPORTED' : 'UNAVAILABLE',
    renderers,
    softwareRenderers,
    reportedFeatures: {
      canvas2d: gpu.featureStatus?.['2d_canvas'] ?? 'UNAVAILABLE',
      gpuCompositing: gpu.featureStatus?.gpu_compositing ?? 'UNAVAILABLE'
    },
    workloadAcceleration: 'UNVERIFIED; renderer identity and reported feature status do not attribute game work to the GPU; interpret the captured workload trace separately'
  };
}
