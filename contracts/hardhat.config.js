require("@nomicfoundation/hardhat-toolbox");

const accounts = process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { evmVersion: "paris", optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // BOT Chain testnet
    bohr: { url: "https://rpc.bohr.life", chainId: 968, accounts },
    // BOT Chain mainnet
    botchain: { url: "https://rpc.botchain.ai", chainId: 677, accounts },
  },
};

// Offline fallback: if binaries.soliditylang.org is unreachable, use the solc-js
// package from node_modules (set USE_SOLCJS=1).
if (process.env.USE_SOLCJS) {
  const { subtask } = require("hardhat/config");
  const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
    if (args.solcVersion !== "0.8.24") return runSuper();
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: require("solc/package.json").version,
    };
  });
}
