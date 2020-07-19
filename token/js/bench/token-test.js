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

async function loadProgram(payer, connection: Connection, path: string): Promise<PublicKey> {
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
  [testToken, testAccount] = await Token.createMint(
    connection,
    payer,
    mintOwner.publicKey,
    testAccountOwner.publicKey,
    new TokenAmount(10000),
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
  assert(accountInfo.amount.toNumber() == 10000);
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
  return accounts;
}

export async function transfer(numTransfer, accounts): Promise<void> {
  console.log("accounts: " + accounts.length);
  var dests = new Map();
  var transfer_promises = [];
  var dests_list = [];
  var num_success = 0;
  var num_error = 0;
  const accountInfo = await testToken.getAccountInfo(testAccount);
  console.log("account info: " + accountInfo);
  var chunkSize = 10;
  var numChunks = numTransfer / chunkSize;
  for (var i = 0; i < numChunks; i++) {
    for (var j = 0; j < chunkSize; j++) {
      const dest = accounts[j % accounts.length];
      //console.log("transfer to " + dest);
      transfer_promises.push(testToken.transfer(testAccount, dest, testAccountOwner, [], 1)
        .then(() => {
          num_success += 1;
        })
        .catch(e => {
            console.log(dest + " error: " + e + " " + dests.get(dest));
            dests.set(dest, dests.get(dest) - 1);
            num_error += 1;
        })
      );
      dests_list.push(dest);
      if (dests.has(dest)) {
        dests.set(dest, dests.get(dest) + 1);
      } else {
        dests.set(dest, 1);
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
}

export async function setOwner(): Promise<void> {
  const owner = new Account();
  const newOwner = new Account();
  const owned = await testToken.createAccount(owner.publicKey);

  await testToken.setOwner(owned, newOwner.publicKey, owner, []);
  assert(didThrow(testToken.setOwner, [owned, newOwner.publicKey, owner, []]));
  await testToken.setOwner(owned, owner.publicKey,newOwner, []);
}

export async function mintTo(theMintOwner, accounts, num_mint): Promise<void> {
  const connection = await getConnection();

  var mint_promises = [];
  var num_success = 0;
  var num_error = 0;
  for (var i = 0; i < num_mint; i++) {
    var dest = accounts[i % accounts.length];
    mint_promises.push(testToken.mintTo(dest, mintOwner, [], 42)
      .then(() => { num_success += 1; })
      .catch(e => {
        console.log("  " + dest + " mint error: " + e);
        num_error += 1;
      })
    );
  }

  await Promise.all(mint_promises);
  console.log("  mint success: " + num_success + " error: " + num_error);
}

export async function burn(accounts, numBurn): Promise<void> {
  var burn_promises = [];
  for (var i = 0; i < numBurn; i++) {
    var dest = accounts[i % accounts.length];
    //let accountInfo = await testToken.getAccountInfo(dest);
    //const amount = accountInfo.amount.toNumber();

    console.log("here? 1");
    burn_promises.push(testToken.burn(testAccount, testAccountOwner, [], 1));
  }
  await Promise.all(burn_promises);

  console.log("here? 2");
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

