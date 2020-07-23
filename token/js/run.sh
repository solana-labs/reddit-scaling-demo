pids=()
num=$1
for ((i=0; i<num; i++))
  do
    npm run bench -- --num_accounts 20 --num_transfer 3000 --num_burn 1100 --num_mint 1 --payer_account payer.json --id $i --num_payers 4 &
    pids=("${pids[@]}" $!)
done
echo "${pids[@]}"
for ((i=0; i<num; i++))
  do
    wait ${pid[i]}
done
