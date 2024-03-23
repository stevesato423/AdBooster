import { task } from "hardhat/config"

task("AdBooster:deploy")
  .addParam("idRegistry")
  .setAction(async (_args, _hre) => {
    console.log("Deploying AdBooster...")
    const AdBooster = await _hre.ethers.getContractFactory("AdBooster", {
      libraries: {
        Blake3: "0xc0d192b2a6a5d6de221c9d7d6ec4c698054d6b59",
        Ed25519: "0x1c6ce6b570cf27e77a3d5ce96d800451feb6b06d",
      },
    })
    const adBooster = await AdBooster.deploy(_args.idRegistry, {
      gasLimit: 6000000,
    })
    console.log("AdBooster deployed to:", await adBooster.getAddress())
  })
