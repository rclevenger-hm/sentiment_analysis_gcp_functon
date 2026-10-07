import { request } from '../scripts/client.mjs';
const response = await request('/analyze-sentiment', {
  method: 'POST', body: JSON.stringify({ text: 'The screen is excellent, but the battery is disappointing.', targeted: true }),
});
console.log(JSON.parse(response.text));
