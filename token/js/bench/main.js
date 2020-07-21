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
  token_transfer,
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
import {SystemProgram, TransferParams} from '@solana/web3.js';
import {newAccountWithLamports} from '../client/util/new-account-with-lamports';
import {sendAndConfirmTransaction} from '../client/util/send-and-confirm-transaction';
const {argv} = require('yargs')
  .require("num_accounts")
  .require("num_transfer")
  .require("num_burn")
  .require("num_mint")
  .require("payer_account")
  .require("id")
  .require("num_payers")

const fs = require('fs');

async function main() {
  const connection = await getConnection();

  var payer: Account;
  var payer_balance;
  try {
    console.log("Loading payer account from " + argv.payer_account);
    var payer_buffer = fs.readFileSync(argv.payer_account);
    payer = new Account(Uint8Array.from(payer_buffer));
    console.log("loaded " + payer.publicKey);
    const info = await connection.getAccountInfo(payer.publicKey);
    console.log("  using payer with " + info.lamports + " lamports.");
    payer_balance = info.lamports;
  } catch (err) {
    console.log("Payer account doesn't exist. " + err);
    var payer_account = await newAccountWithLamports(connection, 100000000000);
    fs.writeFileSync(argv.payer_account, payer_account.secretKey);
    payer = payer_account;
    const info = await connection.getAccountInfo(payer.publicKey);
    console.log("  using payer with " + info.lamports + " lamports.");
    payer_balance = info.lamports;
  }

  var payers = [];
  for (var i = 0; i < argv.num_payers; i++) {
    var new_payer = new Account();
    var params: TransferParams = {
      fromPubkey: payer.publicKey,
      toPubkey: new_payer.publicKey,
      lamports: 100,
    };
    var tx = SystemProgram.transfer(params);
    await sendAndConfirmTransaction('fund payers', connection, tx, payer);
    payers.push(new_payer);
  }

  var start = Date.now();
  console.log('Starting reddit test: loading token program..');
  await loadTokenProgram(connection, payer);
  const load_token_time = (Date.now() - start);
  console.log("loaded in " + load_token_time + " ms");

  console.log('Creating reddit token mint account..');
  start = Date.now();
  var mintOwner = await createMint(connection, payer, argv.id);
  const mint_create_time = (Date.now() - start);
  console.log("  mint created in " + mint_create_time + " ms");

  console.log('Creating subreddit accounts.. ' + argv.num_accounts);
  start = Date.now();
  var [accounts, owners] = await createAccounts(argv.num_accounts, argv.id);
  const create_time = (Date.now() - start);
  console.log("  accounts created in " + create_time + " ms");

  console.log('Starting transfers ' + argv.num_transfer);
  start = Date.now();
  await token_transfer(argv.num_transfer, accounts, owners, payers);
  const transfer_time = (Date.now() - start);
  console.log("  transfers took " + transfer_time + " ms");

  console.log('Minting ' + argv.num_mint + " to " + argv.num_accounts + " accounts.");
  start = Date.now();
  await mintTo(accounts, argv.num_mint);
  const mint_time = (Date.now() - start);
  console.log("  minting took " + mint_time + " ms");

  console.log('Burning subreddit tokens.. ' + argv.num_burn);
  start = Date.now();
  await burn(accounts, owners, argv.num_burn);
  const burn_time = (Date.now() - start);
  console.log("  burn took " + burn_time + " ms");

  const info = await connection.getAccountInfo(payer.publicKey);
  console.log("  payer now has " + info.lamports + " lamports. Took " + (payer_balance - info.lamports));

  console.log("Summary:");
  console.log(" loaded token program in " + load_token_time + " ms");
  console.log(" minting account created in " + mint_create_time + " ms");
  console.log(" created " + argv.num_accounts + " accounts in " + create_time + " ms");
  console.log(" " + argv.num_transfer + " transfers in " + transfer_time + " ms");
  console.log(" " + argv.num_mint + " token mints in " + mint_time + " ms");
  console.log(" " + argv.num_burn + " token burns in " + burn_time + " ms");
  const total = load_token_time + mint_create_time + create_time + transfer_time + mint_time + burn_time;
  console.log(" total: " + total + " ms");
  console.log('Success\n');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(-1);
  })
  .then(() => process.exit());
