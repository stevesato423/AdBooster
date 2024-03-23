import { time } from "@nomicfoundation/hardhat-network-helpers"
import { Factories, FarcasterNetwork, MessageData, MessageType } from "@farcaster/core"
import { expect } from "chai"
import { ethers } from "hardhat"
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers"
import { keccak256, parseEther } from "ethers"

import { signFarcasterMessage, hashMessage } from "./utils/farcaster-message"

const INFLUENCER_FID = 10
const USER_FID = 1
const FRAME_URL = "http://localhost:3000/api"
const SLOT_DURATION = 60

const ed25519Influencer = Factories.Ed25519Signer.build()

describe("AdBooster", () => {
  let messageDataFrameCreation: MessageData
  let adBooster: any, idRegistry: any, influencer: SignerWithAddress, owner: SignerWithAddress

  beforeEach(async () => {
    const Blake3 = await ethers.getContractFactory("Blake3")
    const Ed25519_pow = await ethers.getContractFactory("Ed25519_pow")
    const blake3 = await Blake3.deploy()
    const ed25519Pow = await Ed25519_pow.deploy()
    const Sha512 = await ethers.getContractFactory("Sha512")
    const sha512 = await Sha512.deploy()
    const Ed25519 = await ethers.getContractFactory("Ed25519", {
      libraries: {
        Ed25519_pow: ed25519Pow.target,
        Sha512: sha512.target,
      },
    })
    const ed25519 = await Ed25519.deploy()

    const AdBooster = await ethers.getContractFactory("AdBooster", {
      libraries: {
        Blake3: blake3.target,
        Ed25519: ed25519.target,
      },
    })
    const MockIdRegistry = await ethers.getContractFactory("MockIdRegistry")

    const signers = await ethers.getSigners()
    owner = signers[0]
    influencer = signers[1]

    idRegistry = await MockIdRegistry.deploy()
    adBooster = await AdBooster.deploy(await idRegistry.getAddress())

    await idRegistry.setAddressForFid(USER_FID, owner.address)
    await idRegistry.setFidForAddress(owner.address, USER_FID)
    await idRegistry.setAddressForFid(INFLUENCER_FID, influencer.address)
    await idRegistry.setFidForAddress(influencer.address, INFLUENCER_FID)

    messageDataFrameCreation = {
      type: MessageType.CAST_ADD,
      fid: INFLUENCER_FID,
      timestamp: await time.latest(),
      network: FarcasterNetwork.MAINNET,
      castAddBody: {
        embedsDeprecated: [],
        mentions: [],
        text: FRAME_URL,
        mentionsPositions: [],
        embeds: [
          {
            url: FRAME_URL,
          },
        ],
      },
    }
  })

  it("should put an ad slot on sale, sell it and claim the corresponding rewards", async () => {
    const coder = new ethers.AbiCoder()
    let signature = await signFarcasterMessage(ed25519Influencer, messageDataFrameCreation)
    let pubKey = (await ed25519Influencer.getSignerKey())._unsafeUnwrap()
    let message = MessageData.encode(messageDataFrameCreation).finish()
    const frameId = keccak256(coder.encode(["string"], [FRAME_URL]))

    await expect(adBooster.connect(influencer).putAdSlotsOnSale(pubKey, signature.r, signature.s, message))
      .to.emit(adBooster, "AdSlotsForSale")
      .withArgs(frameId, INFLUENCER_FID)

    const amount = parseEther("1")
    const ipfsMultiHash = "ipfs://aaaaaa"
    const slot = 1

    await expect(
      adBooster.buyAdSlot(frameId, slot, ipfsMultiHash, {
        value: amount,
      }),
    )
      .to.emit(adBooster, "AdSlotBought")
      .withArgs(frameId, slot, USER_FID, amount, ipfsMultiHash)

    await time.increase(SLOT_DURATION * 2)
    await expect(adBooster.connect(influencer).claimRewardsByAdSlots(message, [slot]))
      .to.emit(adBooster, "RewardClaimed")
      .withArgs(frameId, slot, INFLUENCER_FID, USER_FID, amount)
  })
})
