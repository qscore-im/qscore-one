/**
 * app-config.js — deployment-specific configuration
 *
 * Set window.APP_CONFIG before backend.js loads.
 * For local / Firebase deployments the defaults below work automatically.
 * For Cloudflare: set backend to 'cloudflare' and supply the worker URL.
 *
 * Example Cloudflare override (replace this file before deploying):
 *   window.APP_CONFIG = {
 *     backend: 'cloudflare',
 *     cloudflareWorkerUrl: 'wss://my-worker.my-account.workers.dev/ws'
 *   };
 */
window.APP_CONFIG = {
  backend: 'cloudflare',
  cloudflareWorkerUrl: (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws'
};
