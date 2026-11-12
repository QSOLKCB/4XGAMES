// SPDX-License-Identifier: Apache-2.0
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost','127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register(new URL('../sw.js',import.meta.url)).catch(error => {
    const status=document.getElementById('status');
    if(status)status.textContent='Offline cache unavailable: '+error.message;
  });
}
