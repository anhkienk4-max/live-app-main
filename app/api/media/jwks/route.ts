import {createMediaJwksHandler} from '@/lib/server/mediaJwksHandler'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const GET=createMediaJwksHandler().GET
