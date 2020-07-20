// @flow

import fs from 'mz/fs';
import {Account, Connection, BpfLoader, PublicKey} from '@solana/web3.js';
import semver from 'semver';

import {Token, TokenAmount} from '../client/token';
import {url} from '../url';
import {newAccountWithLamports} from '../client/util/new-account-with-lamports';
import {sleep} from '../client/util/sleep';
import {Store} from '../client/util/store';

// Loaded token program's program id
let programId: PublicKey;

// A token created by the next test and used by all subsequent tests
let mintOwner: Account;
let testToken: Token;

// Initial token account
let testAccountOwner: Account;
let testAccount: PublicKey;

function assert(condition, message) {
  if (!condition) {
    console.log(Error().stack + ':token-test.js');
    throw message || 'Assertion failed';
  }
}

async function didThrow(func, args): Promise<boolean> {
  try {
    await func.apply(args);
  } catch (e) {
    return true;
  }
  return false;
}

let connection;
export async function getConnection(): Promise<Connection> {
  if (connection) return connection;

  let newConnection = new Connection(url, 'recent', );
  const version = await newConnection.getVersion();

  // commitment params are only supported >= 0.21.0
  const solanaCoreVersion = version['solana-core'].split(' ')[0];
  if (semver.gte(solanaCoreVersion, '0.21.0')) {
    newConnection = new Connection(url, 'recent');
  }

  // eslint-disable-next-line require-atomic-updates
  connection = newConnection;
  console.log('Connection to cluster established:', url, version);
  return connection;
}

async function loadProgram(connection: Connection, payer, path: string): Promise<PublicKey> {
  const NUM_RETRIES = 500; /* allow some number of retries */
  const data = await fs.readFile(path
  );
  const { feeCalculator } = await connection.getRecentBlockhash();
  const balanceNeeded =
    feeCalculator.lamportsPerSignature *
    (BpfLoader.getMinNumSignatures(data.length) + NUM_RETRIES) +
    (await connection.getMinimumBalanceForRentExemption(data.length));

  const program_account = new Account();
  console.log('Loading program:', path);
  await BpfLoader.load(connection, payer, program_account, data);
  return program_account.publicKey;
}

async function GetPrograms(connection: Connection, payer: Account): Promise<PublicKey> {
  const store = new Store();
  let tokenProgramId = null;
  try {
    const config = await store.load('config.json');
    console.log('Using pre-loaded Token program');
    console.log('  Note: To reload program remove client/util/store/config.json');
    tokenProgramId = new PublicKey(config.tokenProgramId);
    console.log("Checking that account exists..");
    const info = await connection.getAccountInfo(tokenProgramId);
    console.log(".. got account info: " + info);
    if (info === null) {
      console.log("account doesn't exist..creating new");
      throw new Error('failed to find account');
    }
  } catch (err) {
    tokenProgramId = await loadProgram(connection, payer, '../target/bpfel-unknown-unknown/release/spl_token.so');
    await store.save('config.json', {
      tokenProgramId: tokenProgramId.toString(),
    });
  }
  return tokenProgramId;
}

export async function loadTokenProgram(connection, payer): Promise<void> {
  programId = await GetPrograms(connection, payer);

  console.log('Token Program ID', programId.toString());
}

export async function createMint(connection, payer): Promise<Account> {
  mintOwner = new Account();
  testAccountOwner = new Account();
  const amount = 100000;
  [testToken, testAccount] = await Token.createMint(
    connection,
    payer,
    mintOwner.publicKey,
    testAccountOwner.publicKey,
    new TokenAmount(amount),
    2,
    programId,
    true,
  );

  const mintInfo = await testToken.getMintInfo();
  assert(mintInfo.decimals == 2);
  //assert(mintInfo.owner == null);

  const accountInfo = await testToken.getAccountInfo(testAccount);
  assert(accountInfo.mint.equals(testToken.publicKey));
  assert(accountInfo.owner.equals(testAccountOwner.publicKey));
  assert(accountInfo.amount.toNumber() == amount);
  assert(accountInfo.delegate == null);
  assert(accountInfo.delegatedAmount.toNumber() == 0);
}

export async function createAccounts(numAccounts): Promise<void> {
  var destOwners = [];
  var create_promises = [];
  for (var i = 0; i < numAccounts; i++) {
    const destOwner = new Account();
    create_promises.push(testToken.createAccount(destOwner.publicKey));
    destOwners.push(destOwner);

    if (i % 10 == 0) {
      console.log("created " + i + " accounts");
    }
  }

  var num_success = 0;
  var accounts = await Promise.all(create_promises);
  for (const account_promise of create_promises) {
    account_promise
      .then((account) => {
        num_success += 1;
      })
      .catch(e => {
        console.log("error: ", e);
      });
  }
  console.log("created: " + num_success);

  assert(accounts.length > 0);
  for (var i = 0; i < accounts.length; i++) {
    let account = accounts[i];
    let destOwner = destOwners[i];
    const accountInfo = await testToken.getAccountInfo(account);
    assert(accountInfo.mint.equals(testToken.publicKey));
    assert(accountInfo.owner.equals(destOwner.publicKey));
    assert(accountInfo.amount.toNumber() == 0);
    assert(accountInfo.delegate == null);
  }
  return [accounts, destOwners];
}

// 100,000 transfers
export async function transfer(numTransfer, accounts, owners): Promise<void> {
  console.log("accounts: " + accounts.length);
  var dests = new Map();
  var num_success = 0;
  var num_error = 0;
  const accountInfo = await testToken.getAccountInfo(testAccount);
  console.log("account info: " + accountInfo);
  var chunkSize = 10;
  var numChunks = numTransfer / chunkSize;
  var total = 0;
  var amount = 10;
  // Fund accounts from mint
  for (var i = 0; i < numChunks; i++) {
    var transfer_promises = [];
    for (var j = 0; j < chunkSize; j++) {
      if (total > numTransfer) {
        break;
      }
      total += 1;
      const dest = accounts[total % accounts.length];
      //console.log("transfer to " + dest);
      transfer_promises.push(testToken.transfer(testAccount, dest, testAccountOwner, [], amount)
        .then(() => {
          num_success += 1;
        })
        .catch(e => {
            console.log(dest + " error: " + e + " " + dests.get(dest));
            dests.set(dest, dests.get(dest) - amount);
            num_error += 1;
        })
      );
      if (dests.has(dest)) {
        dests.set(dest, dests.get(dest) + amount);
      } else {
        dests.set(dest, amount);
      }
    }

    await Promise.all(transfer_promises);
    console.log("done waiting..");
    console.log("num_success: " + num_success + " error: " + num_error);
  }

  const NUM_POLL = 10;
  for (var i = 0; i < NUM_POLL; i++) {
    for (let [dest, amount] of dests) {
      let destAccountInfo = await testToken.getAccountInfo(dest);
      //console.log(dest + " has " + destAccountInfo.amount + " expected: " + amount);
      if (destAccountInfo.amount.toNumber() === amount) {
        dests.delete(dest);
      }
    }

    console.log("accounts left: " + dests.size);
    if (dests.size == 0) {
      break;
    }
    //assert(destAccountInfo.amount.toNumber() == 1);
    await sleep(200);
  }
  assert(dests.size == 0);

  console.log("starting inter-account transfers");
  // Do some transfers between accounts.
  if (accounts.length > 2) {
    var transfer_promises = [];
    for (var i = 0; i < accounts.length; i += 2) {
      const src = accounts[i];
      const srcOwner = owners[i];
      const dest = accounts[i + 1];
      transfer_promises.push(testToken.transfer(src, dest, srcOwner, [], 1));
    }
    await Promise.all(transfer_promises);
  }
  console.log("done..");
}

export async function setOwner(): Promise<void> {
  const owner = new Account();
  const newOwner = new Account();
  const owned = await testToken.createAccount(owner.publicKey);

  await testToken.setOwner(owned, newOwner.publicKey, owner, []);
  assert(didThrow(testToken.setOwner, [owned, newOwner.publicKey, owner, []]));
  await testToken.setOwner(owned, owner.publicKey,newOwner, []);
}

// 100,000 mint
export async function mintTo(accounts, num_mint): Promise<void> {
  const connection = await getConnection();

  var num_success = 0;
  var num_error = 0;
  const chunkSize = 10;
  const numChunks = num_mint / chunkSize;
  var total = 0;
  for (var i = 0; i < numChunks; i++) {
    var start = Date.now();
    var mint_promises = [];
    for (var j = 0; j < chunkSize; j++) {
      if (total > num_mint) {
        break;
      }
      total += 1;
      var dest = accounts[total % accounts.length];
      mint_promises.push(testToken.mintTo(dest, mintOwner, [], 42)
        .then(() => { num_success += 1; })
        .catch(e => {
          console.log("  " + dest + " mint error: " + e);
          num_error += 1;
        })
      );
    }

    await Promise.all(mint_promises);
    console.log("  mint success: " + num_success + " error: " + num_error + " " + (Date.now() - start) + " ms");
  }
}

// 75,000 burns
export async function burn(accounts, owners, numBurn): Promise<void> {
  var burnPromises = [];
  var chunkSize = 10;
  var numChunks = numBurn / chunkSize;
  var numBurned = 0;
  var num_success = 0;
  var num_fail = 0;
  var total = 0;
  for (var i = 0; i < numChunks; i++) {
    var start = Date.now();
    for (var j = 0; j < chunkSize; j++) {
      if (total > numBurn) {
        break;
      }
      total += 1;
      var dest = accounts[total % accounts.length];
      var destOwner = owners[total % accounts.length];

      numBurned += 1;
      burnPromises.push(
        testToken.burn(dest, destOwner, [], 1)
          .then((account) => {
            num_success += 1;
          })
        .catch(e => {
          console.log("burn error: " + e);
          num_fail += 1;
        }));
    }
    await Promise.all(burnPromises);
    console.log("burned " + numBurned + " success: " + num_success + " num_fail: " + num_fail + " " + (Date.now() - start) + " ms");
  }

  console.log("Done burning.");
  /*for (var j = 0; j < 100; j++) {
    accountInfo = await testToken.getAccountInfo(testAccount);
    if (accountInfo.amount.toNumber() == amount - 1) {
      break;
    }
    await sleep(100);
  }*/
}

export async function closeAccount(): Promise<void> {
  const connection = await getConnection();
  const owner = new Account();
  const close = await testToken.createAccount(owner.publicKey);

  let close_balance;
  let info = await connection.getAccountInfo(close);
  if (info != null) {
    close_balance = info.lamports;
  } else {
    throw new Error('Account not found');
  }

  const balanceNeeded =
    await connection.getMinimumBalanceForRentExemption(0);
  const dest = await newAccountWithLamports(connection, balanceNeeded);

  info = await connection.getAccountInfo(dest.publicKey);
  if (info != null) {
    assert(info.lamports == balanceNeeded);
  } else {
    throw new Error('Account not found');
  }

  await testToken.closeAccount(close, dest.publicKey, owner, []);
  info = await connection.getAccountInfo(close);
  if (info != null) {
    throw new Error('Account not closed');
  }
  info = await connection.getAccountInfo(dest.publicKey);
  if (info != null) {
    assert(info.lamports == balanceNeeded + close_balance);
  } else {
    throw new Error('Account not found');
  }
}

