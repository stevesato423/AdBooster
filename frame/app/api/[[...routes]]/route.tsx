/** @jsxImportSource frog/jsx */

import { Button, Frog, TextInput } from 'frog'
import { devtools } from 'frog/dev'
import { createPublicClient, http, keccak256, encodeAbiParameters, formatEther, parseEther } from 'viem'
import { optimism } from 'viem/chains'
// import { neynar } from 'frog/hubs'
import { handle } from 'frog/next'
import { serveStatic } from 'frog/serve-static'
import { PinataFDK } from 'pinata-fdk'
import moment from 'moment'

import adBoosterAbi from '../../utils/abi/AdBooster.json'

const getIpfsGatewayUrl = (_ref: string) => `https://cloudflare-ipfs.com/ipfs/${_ref.slice(7)}`
const getFrameId = (_url: string) => keccak256(encodeAbiParameters([{ type: 'string' }], [new URL(_url).host + '/api']))

const fdk = new PinataFDK({
  pinata_jwt: process.env.PINATA_JWT || '',
  pinata_gateway: process.env.PINATA_GATEWAY as string
})

const publicClient = createPublicClient({
  chain: optimism,
  transport: http(process.env.RPC)
})

const app = new Frog({
  assetsPath: '/',
  basePath: '/api'
})

app.use('/slots', fdk.analyticsMiddleware({ frameId: 'adbooster', customId: 'slots' }))
app.use('/buy', fdk.analyticsMiddleware({ frameId: 'adbooster', customId: 'buy' }))
app.use('/finish', fdk.analyticsMiddleware({ frameId: 'adbooster', customId: 'finish' }))

app.frame('/', async (_context) => {
  const NO_AD_IMAGE = '/placeholder.png'
  const NO_AD_URL = 'https://warpcast.com/allemanfredi.eth'
  const frameId = getFrameId(_context.url)

  const ad = (await publicClient.readContract({
    address: process.env.ADBOOSTER_ADDRESS as `0x${string}`,
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

app.frame('/slots', async (_context) => {
  const VISIBILE_SLOTS = 24
  const frameId = getFrameId(_context.url)

  const [currentSlot, startTimestamp, slotDuration] = (await Promise.all([
    publicClient.readContract({
      address: process.env.ADBOOSTER_ADDRESS as `0x${string}`,
      abi: adBoosterAbi,
      functionName: 'getCurrentAdSlot',
      args: []
    }),
    publicClient.readContract({
      address: process.env.ADBOOSTER_ADDRESS as `0x${string}`,
      abi: adBoosterAbi,
      functionName: 'START_TIMESTAMP',
      args: []
    }),
    publicClient.readContract({
      address: process.env.ADBOOSTER_ADDRESS as `0x${string}`,
      abi: adBoosterAbi,
      functionName: 'SLOT_DURATION',
      args: []
    })
  ])) as [bigint, bigint, bigint]

  const startTimestampCurrentSlot = startTimestamp + currentSlot * slotDuration
  const slots = Array.from({ length: VISIBILE_SLOTS }).map((_, _index) => _index + Number(currentSlot) + 1)
  const startsAt = slots.map((_, _index) =>
    moment
      .unix(Number(startTimestampCurrentSlot))
      .add(_index * Number(slotDuration), 'seconds')
      .format('MM/DD HH:mm:ss')
  )

  const ads = (await publicClient.readContract({
    address: process.env.ADBOOSTER_ADDRESS as `0x${string}`,
    abi: adBoosterAbi,
    functionName: 'getAdsBySlots', // getAdsBySlots
    args: [frameId, slots]
  })) as []

  return _context.res({
    action: '/finish',
    image: (
      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {ads.map(({ amount }, _index) => {
          return (
            <div
              style={{
                backgroundColor: 'white',
                width: 300,
                height: 104,
                alignItems: 'center',
                justifyContent: 'center',
                display: 'flex',
                flexDirection: 'column',
                fontSize: 24,
                borderRight: '1px solid black',
                borderBottom: '1px solid black'
              }}
            >
              <span>{slots[_index]}</span>
              <span>{formatEther(amount)} ETH</span> <span style={{ fontSize: 16 }}>{startsAt[_index]}</span>
            </div>
          )
        })}
      </div>
    ),
    intents: [
      <TextInput placeholder="Slot,amount, IPFS multihash" />,
      <Button action="/">Back</Button>,
      <Button.Transaction target="/buy">Buy</Button.Transaction>
    ]
  })
})

app.transaction('/buy', async (_context) => {
  const { inputText = '' } = _context
  const frameId = getFrameId(_context.url)

  const values = inputText?.split(',')
  const slot = values[0]
  const value = parseEther(values[1] as string)
  const ref = values[2]

  return _context.contract({
    abi: adBoosterAbi,
    chainId: `eip155:${optimism.id}`,
    functionName: 'buyAdSlot',
    args: [frameId, slot, ref],
    to: process.env.ADBOOSTER_ADDRESS as `0x${string}`,
    value
  })
})

app.frame('/finish', async (_context) => {
  return _context.res({
    image: (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 96,
          width: '100%',
          height: '100%'
        }}
      >
        <span>Slot bought!</span>
      </div>
    ),
    intents: [<Button action="/">Continue</Button>]
  })
})

devtools(app, { serveStatic })

export const GET = handle(app)
export const POST = handle(app)
