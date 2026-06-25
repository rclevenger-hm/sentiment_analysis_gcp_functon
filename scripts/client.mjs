import { GoogleAuth, Impersonated } from 'google-auth-library';
const auth = new GoogleAuth();
export async function identityToken(audience) {
  if (process.env.GCP_ID_TOKEN) return process.env.GCP_ID_TOKEN;
  if (process.env.GCP_IMPERSONATE_SERVICE_ACCOUNT) {
    const client = new Impersonated({ sourceClient: await auth.getClient(), targetPrincipal: process.env.GCP_IMPERSONATE_SERVICE_ACCOUNT, targetScopes: ['https://www.googleapis.com/auth/cloud-platform'], lifetime: 600 });
    return client.fetchIdToken(audience, { includeEmail: true });
  }
  const client = await auth.getIdTokenClient(audience);
  return client.idTokenProvider.fetchIdToken(audience);
}
export async function request(path, { method = 'GET', body, contentType = 'application/json', idempotencyKey } = {}) {
  if (!process.env.API_ENDPOINT) throw new Error('Set API_ENDPOINT to the Terraform endpoint output');
  const endpoint = process.env.API_ENDPOINT.replace(/\/$/, ''), base = new URL(endpoint);
  if (base.protocol !== 'https:') throw new Error('API_ENDPOINT must use HTTPS');
  const token = await identityToken(process.env.TOKEN_AUDIENCE || endpoint);
  // The platform checks X-Serverless; Authorization retains its signature for app validation.
  const response = await fetch(`${endpoint}${path}`, { method, body, headers: { authorization: `Bearer ${token}`, 'x-serverless-authorization': `Bearer ${token}`, 'content-type': contentType, ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) }, redirect: 'error', signal: AbortSignal.timeout(35000) });
  const text = await response.text();
  if (!response.ok) { let code; try { code = JSON.parse(text).code; } catch { code = 'REQUEST_FAILED'; } throw new Error(`${response.status} ${code}; request ${response.headers.get('x-request-id') || 'unknown'}`); }
  return { text, contentType: response.headers.get('content-type') };
}
