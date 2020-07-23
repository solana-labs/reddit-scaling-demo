# Solana Reddit Demo

Source for Solana Reddit demo, which uses the solana token program to run the Reddit benchmark challenge.
This is a fork of the solana-program-library repo.

## Building

These programs cannot be built directly via cargo and instead require the build scripts located in Solana's BPF-SDK.

Download or update the BPF-SDK by running:
```bash
$ ./do.sh update
```

To build all programs, run:
```bash
$ ./do.sh build
```

Or choose a specific program:
```bash
$ ./do.sh build <program>
```

## Running the token demo

You'll need npm installed, then perform the following:

```bash
$ cd token/js
$ npm run bench -- --num_accounts 1 --num_transfer 1 --num_burn 1 --num_mint 1 --payer_account payer.json --id $i --num_payers
```

That should print a message like:
> Loading payer account from payer.json
> loaded 9Rd5aWW84WtnM2QznNHqN1FmtEyb6hUf4eewp9BFBvE1

If the network you are running on doesn't have a faucet, then fund that key with some sol, then run the program again,
adjusting the arguments to the desired accounts/tranfers to generate:
```bash
$ npm run bench -- --num_accounts 10 --num_transfer 1000 --num_burn 1000 --num_mint 10 --payer_account payer.json --id $i --num_payers
```
