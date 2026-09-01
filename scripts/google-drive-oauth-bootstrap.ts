import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import {
  createGoogleDriveAuthorizationUrl,
  createGoogleDriveOAuthState,
  exchangeGoogleDriveAuthorizationCode,
  resolveGoogleDriveOAuthRedirectUri,
} from '../lib/server/googleDriveAuth.ts'

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim()
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim()

if (!clientId || !clientSecret) {
  throw new Error('Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in your local shell first.')
}

const redirectUri = resolveGoogleDriveOAuthRedirectUri(process.env)
const state = createGoogleDriveOAuthState()
const authorizationUrl = createGoogleDriveAuthorizationUrl({ env: process.env, state, redirectUri })

console.log('Open this URL in the dedicated storage account browser:')
console.log(authorizationUrl)
console.log(`After consent, paste the authorization code here (redirect URI: ${redirectUri}).`)

const readline = createInterface({ input, output })
try {
  const code = (await readline.question('Authorization code: ')).trim()
  if (!code) throw new Error('Authorization code is required.')
  const returnedState = (await readline.question('OAuth state returned by the callback: ')).trim()
  const tokens = await exchangeGoogleDriveAuthorizationCode({ env: process.env, code, expectedState: state, receivedState: returnedState, redirectUri })
  if (!tokens.refresh_token) throw new Error('No refresh token returned. Re-run with consent or revoke the prior grant and retry.')
  console.log('OAuth exchange completed. Store the refresh token only in the approved server-side secret manager.')
} finally {
  readline.close()
}
