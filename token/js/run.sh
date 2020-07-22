pids=()
num=$1
for ((i=0; i<num; i++))
  do
    RPC_URL=http://34.105.81.60:8899 npm run bench -- --num_accounts 200 --num_transfer 5000 --num_burn 1 --num_mint 1 --payer_account payer.json --id $i --num_payers 8 &
    #npm run bench -- --num_accounts 200 --num_transfer 5000 --num_burn 1 --num_mint 1 --payer_account payer.json --id $i &
    pids=("${pids[@]}" $!)
done
echo "${pids[@]}"
for ((i=0; i<num; i++))
  do
    wait ${pid[i]}
done
