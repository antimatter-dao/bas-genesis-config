const Web3 = require('web3');
const fs = require('fs');

const ABI_STAKING = require('./build/contracts/Staking.json').abi;
const ABI_GOVERNANCE = require('./build/contracts/Governance.json').abi;
const ABI_VAULT = require('./build/contracts/Vault.json').abi;

const askFor = async (question) => {
  return new Promise(resolve => {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(question, (value) => {
      resolve(value);
      rl.close();
    });
  });
};

const STAKING_ADDRESS = '0x0000000000000000000000000000000000001000';
const GOVERNANCE_ADDRESS = '0x0000000000000000000000000000000000007002';
const VAULT_ADDRESS = '0x0000000000000000000000000000000000007006';

const sleepFor = async ms => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const proposalStates = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];

(async () => {
  const rpcUrl = process.argv[2];
  if (!rpcUrl) {
    console.error(`Specify RPC url`);
    process.exit(1);
  }
  // instance
  const web3 = new Web3(rpcUrl);
  const signTx = async (account, {to, data, value}) => {
    const nonce = await web3.eth.getTransactionCount(account.address),
      chainId = await web3.eth.getChainId();
    const txOpts = {
      from: account.address,
      gas: 2_000_000,
      gasPrice: 5e9,
      nonce: nonce,
      to: to,
      data: data,
      chainId: chainId,
      value,
    }
    await web3.eth.call(txOpts)
    return account.signTransaction(txOpts)
  }
  const staking = new web3.eth.Contract(ABI_STAKING, STAKING_ADDRESS);
  const governance = new web3.eth.Contract(ABI_GOVERNANCE, GOVERNANCE_ADDRESS);
  const vault = new web3.eth.Contract(ABI_VAULT, VAULT_ADDRESS);
  // make sure we have enough private keys
  const keystoreKeys = {}
  const keystorePassword = fs.readFileSync('./password.txt', 'utf8')
  console.log(`Decrypting keystore`);
  for (const filePath of fs.readdirSync('./keystore', 'utf8')) {
    if (!filePath) { continue; }
    const [address] = filePath.match(/([\da-f]{40})/ig) || [];
    if (!address) { continue; }
    console.log(` ~ decrypting account 0x${address}`);
    keystoreKeys[`0x${address}`.toLowerCase()] = web3.eth.accounts.decrypt(JSON.parse(fs.readFileSync(`./keystore/${filePath}`, 'utf8')), keystorePassword);
  }
  // find out active validator set, fund it with faucet
  const activeValidatorSet = await staking.methods.getValidators().call();
  let feedAll = false,
    faucetAddress = null;
  const feedValidator = async (validatorAddress) => {
    if (!faucetAddress) faucetAddress = await askFor(`What's faucet address? `)
    const faucetKeystore = keystoreKeys[faucetAddress.toLowerCase()]
    if (!faucetKeystore) throw new Error(`There is no faucet address in the keystore folder`)
    const {rawTransaction, transactionHash} = await signTx(faucetKeystore, {
      to: validatorAddress,
      value: '1000000000000000000' // 1 ether
    });
    console.log(` ~ feeding validator (${validatorAddress}): ${transactionHash}`);
    await web3.eth.sendSignedTransaction(rawTransaction);
  }
  // fund validator set for voting
  for (const validatorAddress of activeValidatorSet) {
    if (!keystoreKeys[validatorAddress.toLowerCase()]) {
      throw new Error(`Unable to find private key in keystore for address: ${validatorAddress}`)
    }
    const balance = await web3.eth.getBalance(validatorAddress)
    if (balance === '0') {
      if (feedAll) {
        await feedValidator(validatorAddress);
        continue;
      }
      const answer = await askFor(`Validator (${validatorAddress}) has lack of funds, would you like to feed it from faucet? (yes/no/all) `)
      if (answer === 'yes' || answer === 'all') {
        await feedValidator(validatorAddress);
        feedAll = answer === 'all';
      }
    }
  }
  // got the first one who could make proposal
  const someValidator = keystoreKeys[activeValidatorSet[0].toLowerCase()]
  if (!someValidator) {
    throw new Error(`No validator in the network, impossible to upgrade`)
  }
  // add bridge addr
  const upgradeVaultAddBridge = async (bridgeAddr) => {
    // encode add bridge tx
    const addBridgeTx = vault.methods.addBridge(bridgeAddr).encodeABI();
    console.log("addBridgeTx:", addBridgeTx);
    // encode tx to govenance proposal
    let addresses = [VAULT_ADDRESS];
    let values = ['0'];
    let calls = [addBridgeTx];
    let desc = `add bridge ${bridgeAddr}`;
    let governanceCall = governance.methods.proposeWithCustomVotingPeriod(
      addresses, 
      values, 
      calls, 
      desc, 
      '20').encodeABI();
    // sign proposal tx
    const {rawTransaction, transactionHash} = await signTx(someValidator, {
      to: GOVERNANCE_ADDRESS,
      data: governanceCall,
    });
    console.log(`Creating proposal: ${transactionHash}`);
    // get proposal id
    const proposeReceipt = await web3.eth.sendSignedTransaction(rawTransaction);
    const proposalId = proposeReceipt.logs[0].data.substring(0, 66)
    // let's vote for this proposal using all our validators
    console.log(`Waiting for the proposal become active`);
    while (true) {
      const state = await governance.methods.state(proposalId).call(),
        status = proposalStates[Number(state)];
      if (status === 'Active') {
        console.log(`Proposal is active, we can start voting process`);
        break;
      } else if (status !== 'Pending') {
        console.error(`Incorrect proposal status: ${status}`)
        return;
      }
      await sleepFor(1_000)
    }
    console.log(`Voting for the proposal (${proposalId}):`);
    for (const validatorAddress of activeValidatorSet) {
      const account = keystoreKeys[validatorAddress.toLowerCase()],
        castCall = governance.methods.castVote(proposalId, '1').encodeABI()
      const {rawTransaction, transactionHash} = await signTx(account, {
        to: GOVERNANCE_ADDRESS,
        data: castCall,
      })
      console.log(` ~ validator ${validatorAddress} is voting: ${transactionHash}`)
      await web3.eth.sendSignedTransaction(rawTransaction)
    }
    // now we can execute the proposal
    while (true) {
      const currentBlock = await web3.eth.getBlockNumber()
      const state = await governance.methods.state(proposalId).call(),
        status = proposalStates[Number(state)];
      const deadline = await governance.methods.proposalDeadline(proposalId).call();
      console.log(`Current proposal status is: ${status}, current block is: ${currentBlock} deadline is: ${deadline}, elapsed: ${deadline - currentBlock}`)
      switch (status) {
        case 'Pending':
        case 'Active': {
          break;
        }
        case 'Succeeded': {
          const executeCall = governance.methods.execute(addresses, values, calls, web3.utils.keccak256(desc)).encodeABI()
          try {
            const result = await web3.eth.call({
              from: someValidator.address,
              to: GOVERNANCE_ADDRESS,
              data: executeCall
            })
            console.log(`Execute result: ${result}`)
          } catch (e) {
            console.error(`Failed to calc result: ${e}`)
          }
          const {rawTransaction, transactionHash} = await signTx(someValidator, {
            to: GOVERNANCE_ADDRESS,
            data: executeCall,
          });
          console.log(`Executing proposal: ${transactionHash}`);
          await web3.eth.sendSignedTransaction(rawTransaction);
          break;
        }
        case 'Executed': {
          console.log(`Proposal was successfully executed`);
          return;
        }
        default: {
          console.error(`Incorrect proposal status, upgrade failed: ${status}, exiting`)
          return;
        }
      }
      await sleepFor(12_000)
    }
  }

  let bridgeAddr = await askFor('Adding bridge address: ');
  if (!bridgeAddr) {
    throw new Error(`Empty bridge address`);
  }
  
  // create new runtime upgrade proposal
  await upgradeVaultAddBridge(bridgeAddr);
})();