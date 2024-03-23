/** @jsxImportSource frog/jsx */

import { Button, Frog, TextInput } from 'frog'
import { devtools } from 'frog/dev'
import { createPublicClient, http, keccak256, encodeAbiParameters } from 'viem'
import { optimism } from 'viem/chains'
// import { neynar } from 'frog/hubs'
import { handle } from 'frog/next'
import { serveStatic } from 'frog/serve-static'
import { PinataFDK } from 'pinata-fdk'

import adBoosterAbi from '../../utils/abi/AdBooster.json'

const getIpfsGatewayUrl = (_ref: string) => `https://cloudflare-ipfs.com/ipfs/${_ref.slice(7)}`
const getFrameId = (_url: string) => keccak256(encodeAbiParameters([{ type: 'string' }], [new URL(_url).host + '/api']))

/*const fdk = new PinataFDK({
  pinata_jwt: process.env.PINATA_JWT || '',
  pinata_gateway: process.env.PINATA_GATEWAY as string
})*/

const publicClient = createPublicClient({
  chain: optimism,
  transport: http(process.env.RPC)
})

const app = new Frog({
  assetsPath: '/',
  basePath: '/api',
})

//app.use('/slots', fdk.analyticsMiddleware({ frameId: 'adbooster', customId: 'slots' }))

app.frame('/', async (_context) => {
  const NO_AD_IMAGE = 'https://' + process.env.PINATA_GATEWAY + '/ipfs/QmXn91ayayHEHkFqcvC4tqbu8HahuMvQiwiBvwHy8dAN87'
  const NO_AD_URL = 'https://warpcast.com/allemanfredi.eth'
  const frameId = getFrameId(_context.url)

  const ad = (await publicClient.readContract({
    address: process.env.ADS_MANAGER_ADDRESS as `0x${string}`,
    abi: adBoosterAbi,
    functionName: 'getAdForCurrentSlot',
    args: [frameId]
  })) as any

  let image = NO_AD_IMAGE
  let url = NO_AD_URL
  if (ad.ref) {
    const response = await fetch(getIpfsGatewayUrl(ad.ref))
    const data = await response.json()
    image = getIpfsGatewayUrl(data.image)
    url = data.url
  }

  return _context.res({
    image,
    imageAspectRatio: '1:1',
    intents: [<Button action="/slots">Buy slot</Button>, <Button.Redirect location={url}>View</Button.Redirect>]
  })
})

devtools(app, { serveStatic })

export const GET = handle(app)
export const POST = handle(app)
