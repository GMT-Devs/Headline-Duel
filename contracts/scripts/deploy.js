const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying from", deployer.address, "on chain", Number((await hre.ethers.provider.getNetwork()).chainId));
  const Duel = await hre.ethers.getContractFactory("HeadlineDuel");
  const duel = await Duel.deploy();
  await duel.waitForDeployment();
  const address = await duel.getAddress();
  const receipt = await duel.deploymentTransaction().wait();
  console.log("HeadlineDuel deployed to", address, "at block", receipt.blockNumber);
  console.log("Set CONTRACT_ADDRESS and DEPLOY_BLOCK in site/assets/js/config.js");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
