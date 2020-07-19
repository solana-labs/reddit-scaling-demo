/**
 * Reddit bench program
 *
 * Reqs:
 * 100,000 point claims
 * 75,000 burns
 * 25,000 subscriptions
 * 100,000 transfers
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
  getConnection,
} from './token-test';
import {Store} from '../client/util/store';
import {Account} from '@solana/web3.js';
import {newAccountWithLamports} from '../client/util/new-account-with-lamports';
const {argv} = require('yargs')
  .require("num_accounts")
  .require("num_transfer")
  .require("num_burn")
  .require("num_mint")
  .require("payer_account")

const fs = require('fs');

async function main() {
  const connection = await getConnection();

  var payer: Account;
  try {
    console.log("Loading payer account from " + argv.payer_account);
    var payer_buffer = fs.readFileSync(argv.payer_account);
    payer = new Account(Uint8Array.from(payer_buffer));
    console.log("loaded " + payer.publicKey);
    const info = await connection.getAccountInfo(payer.publicKey);
    console.log("  using payer with " + info.lamports + " lamports.");
  } catch (err) {
    console.log("Payer account doesn't exist. " + err);
    var payer_account = await newAccountWithLamports(connection, 100000000000);
    fs.writeFileSync(argv.payer_account, payer_account.secretKey);
    payer = payer_account;
    const info = await connection.getAccountInfo(payer.publicKey);
    console.log("  using payer with " + info.lamports + " lamports.");
  }

  var start = Date.now();
  console.log('Starting reddit test: loading token program..');
  await loadTokenProgram(connection, payer);
  console.log("loaded in " + (Date.now() - start) + " ms");

  console.log('Creating reddit token mint account..');
  start = Date.now();
  var mintOwner = await createMint(connection, payer);
  console.log("  mint created in " + (Date.now() - start) + " ms");

  console.log('Creating subreddit accounts.. ' + argv.num_accounts);
  start = Date.now();
  var [accounts, owners] = await createAccounts(argv.num_accounts);
  console.log("  accounts created in " + (Date.now() - start) + " ms");

  console.log('Starting transfers ' + argv.num_transfer);
  start = Date.now();
  await transfer(argv.num_transfer, accounts, owners);
  console.log("  transfers took " + (Date.now() - start) + " ms");

  console.log('Minting ' + argv.num_mint + " to " + argv.num_accounts + " accounts.");
  start = Date.now();
  await mintTo(mintOwner, accounts, argv.num_mint);
  console.log("  minting took " + (Date.now() - start) + " ms");

  console.log('Burning subreddit tokens.. ' + argv.num_burn);
  start = Date.now();
  await burn(accounts, owners, argv.num_burn);
  console.log("  burn took " + (Date.now() - start) + " ms");

  console.log('Success\n');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(-1);
  })
  .then(() => process.exit());
