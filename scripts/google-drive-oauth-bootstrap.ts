import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { google } from 'googleapis'

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim()
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim()
const redirectUri = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI?.trim() ?? 'http://127.0.0.1:53682/oauth2callback'
const scope = 'https://www.googleapis.com/auth/drive'

if (!clientId || !clientSecret) {
  throw new Error('Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in your local shell first.')
}

const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
const authorizationUrl = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [scope],
})

console.log('Open this URL in the dedicated storage account browser:')
console.log(authorizationUrl)
console.log(`After consent, paste the authorization code here (redirect URI: ${redirectUri}).`)

const readline = createInterface({ input, output })
try {
  const code = (await readline.question('Authorization code: ')).trim()
  if (!code) throw new Error('Authorization code is required.')
  const { tokens } = await oauth.getToken(code)
  if (!tokens.refresh_token) throw new Error('No refresh token returned. Re-run with consent or revoke the prior grant and retry.')
  console.log('Refresh token obtained. Store it only as GOOGLE_DRIVE_REFRESH_TOKEN in server/Vercel environment settings:')
  console.log(tokens.refresh_token)
  console.log('Do not commit, paste into browser code, or expose this token in logs.')
} finally {
  readline.close()
}
