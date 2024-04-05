/** @jsxImportSource frog/jsx */

import { Button, Frog } from 'frog'
import { devtools } from 'frog/dev'
import { createPublicClient, http, keccak256, encodeAbiParameters } from 'viem'
import { optimism } from 'viem/chains'
import { handle } from 'frog/next'
import { serveStatic } from 'frog/serve-static'

import adBoosterAbi from '../../utils/abi/AdBooster.json'

const getIpfsGatewayUrl = (_ref: string) =>
  _ref.startsWith('ipfs://') ? `https://gateway.pinata.cloud/ipfs/${_ref.slice(7)}` : _ref
const getFrameId = (_url: string) => keccak256(encodeAbiParameters([{ type: 'string' }], [_url]))

const publicClient = createPublicClient({
  chain: optimism,
  transport: http(process.env.RPC)
})

const app = new Frog({
  assetsPath: '/',
  basePath: '/api'
})

app.frame('/', async (_context) => {
  const NO_AD_URL = 'https://warpcast.com/allemanfredi.eth'
  const frameId = getFrameId(_context.url)
  const buySlotUrl = `https://app.boostyblast.xyz/#/farcaster/adbooster/${frameId}/slots`

  const ad = (await publicClient.readContract({
    address: process.env.ADBOOSTER_ADDRESS as `0x${string}`,
    abi: adBoosterAbi,
    functionName: 'getAdForCurrentSlot',
    args: [frameId]
  })) as any

  let url = NO_AD_URL
  if (ad.ref) {
    const response = await fetch(getIpfsGatewayUrl(ad.ref))
    const data = await response.json()
    url = data.url
  }

  return _context.res({
    image: process.env.PLACEHOLDER_IMAGE + `?version=${new Date().getTime()}&frameId=${frameId}`,
    headers: {
      'Cache-Control': 'public, max-age=0'
    },
    imageOptions: {
      headers: {
        'Cache-Control': 'public, max-age=0'
      }
    },
    intents: [
      <Button.Link href={buySlotUrl}>Buy slot</Button.Link>,
      <Button.Redirect location={url}>View</Button.Redirect>
    ]
  })
})

devtools(app, { serveStatic })

export const GET = handle(app)
export const POST = handle(app)
