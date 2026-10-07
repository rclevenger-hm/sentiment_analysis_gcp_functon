"""Requires google-auth and requests, plus an identity-token-capable ADC identity."""
import os
import requests
from google.auth.transport.requests import Request
from google.oauth2.id_token import fetch_id_token

endpoint = os.environ['API_ENDPOINT'].rstrip('/')
if not endpoint.startswith('https://'):
    raise ValueError('API_ENDPOINT must use HTTPS')
token = fetch_id_token(Request(), os.environ.get('TOKEN_AUDIENCE', endpoint))
response = requests.post(
    f'{endpoint}/analyze-sentiment',
    json={'text': 'An excellent screen and a terrible battery.', 'targeted': True},
    headers={'Authorization': f'Bearer {token}', 'X-Serverless-Authorization': f'Bearer {token}'},
    timeout=35,
    allow_redirects=False,
)
response.raise_for_status()
print(response.json())
