/**
 * Exercises the token program
 *
 * @flow
 */

import {
  loadTokenProgram,
  createMint,
  createAccounts,
  transfer,
  approveRevoke,
  invalidApprove,
  failOnApproveOverspend,
  setOwner,
  mintTo,
  multisig,
  burn,
  closeAccount,
  nativeToken,
} from './token-test';
const {argv} = require('yargs')
  .require("num_accounts")
  .require("num_transfer")
  .require("num_burn")

async function main() {
  var start = Date.now();
  console.log('Run test: loadTokenProgram');
  await loadTokenProgram();
  console.log("loaded in " + (Date.now() - start) + " ms");

  console.log('Run test: createMint');
  start = Date.now();
  var mintOwner = await createMint();
  console.log("mint in " + (Date.now() - start) + " ms");

  console.log('Run test: createAccounts ' + argv.num_accounts);
  start = Date.now();
  var accounts = await createAccounts(argv.num_accounts);
  console.log("accounts in " + (Date.now() - start) + " ms");

  console.log('Run test: transfer ' + argv.num_transfer);
  start = Date.now();
  await transfer(argv.num_transfer, accounts);
  console.log("transfers in " + (Date.now() - start) + " ms");

  console.log('Run test: mintTo');
  start = Date.now();
  await mintTo(argv.num_mint);
  console.log("mint_to in " + (Date.now() - start) + " ms");

  console.log('Run test: burn ' + argv.num_burn);
  start = Date.now();
  await burn(argv.num_burn);
  console.log("burn in " + (Date.now() - start) + " ms");

  console.log('Success\n');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(-1);
  })
  .then(() => process.exit());
