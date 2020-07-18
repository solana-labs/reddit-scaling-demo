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
  .require("num_mint")

async function main() {
  var start = Date.now();
  console.log('Starting reddit test: loading token program..');
  await loadTokenProgram();
  console.log("loaded in " + (Date.now() - start) + " ms");

  console.log('Creating reddit token mint account..');
  start = Date.now();
  var mintOwner = await createMint();
  console.log("  mint created in " + (Date.now() - start) + " ms");

  console.log('Creating subreddit accounts.. ' + argv.num_accounts);
  start = Date.now();
  var accounts = await createAccounts(argv.num_accounts);
  console.log("  accounts created in " + (Date.now() - start) + " ms");

  console.log('Starting transfers ' + argv.num_transfer);
  start = Date.now();
  await transfer(argv.num_transfer, accounts);
  console.log("  transfers took " + (Date.now() - start) + " ms");

  console.log('Minting ' + argv.num_mint + " to " + argv.num_accounts + " accounts.");
  start = Date.now();
  await mintTo(mintOwner, accounts, argv.num_mint);
  console.log("  minting took " + (Date.now() - start) + " ms");

  console.log('Burning subreddit tokens.. ' + argv.num_burn);
  start = Date.now();
  await burn(accounts, argv.num_burn);
  console.log("  burn took " + (Date.now() - start) + " ms");

  console.log('Success\n');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(-1);
  })
  .then(() => process.exit());
