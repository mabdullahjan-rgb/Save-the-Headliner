#!/bin/zsh
set -eu
cd -- "${0:A:h}"

if [[ -z ${NACE_API_KEY:-} && -n ${DREX_API_KEY:-} ]]; then
  NACE_API_KEY=$DREX_API_KEY
fi
while [[ ! ${NACE_API_KEY:-} =~ '^nace_sk_[A-Za-z0-9_-]+$' ]]; do
  if [[ -n ${NACE_API_KEY:-} ]]; then
    print -u2 'That paste does not look like a Nace key. Copy the full value starting with nace_sk_ from the Nace dashboard.'
  fi
  read -rs 'NACE_API_KEY?Nace API key: '
  print
done
if [[ -z ${DEEPINFRA_API_KEY:-} ]]; then
  read -rs 'DEEPINFRA_API_KEY?DeepInfra API key: '
  print
fi
if [[ -z $NACE_API_KEY || -z $DEEPINFRA_API_KEY ]]; then
  print -u2 'Both API keys are required for a live run.'
  exit 1
fi

export NACE_API_KEY DEEPINFRA_API_KEY
export INTERN_SYSTEM2=${INTERN_SYSTEM2:-deepinfra/Qwen/Qwen3.8-27B}
export PORT=${PORT:-8766}
exec .venv/bin/python server.py
