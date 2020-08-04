#!/bin/bash

set -euxo pipefail

##
# @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
# Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
##

URL=$1
JS_REPLACE=".replace(/[^a-z0-9]+/g, '_').replace(/^https?_/, '')"
SAFE_URL=$(node -e "console.log('$URL'$JS_REPLACE)")

whoami
export HOME="/home/lighthouse"

cd /home/lighthouse
mkdir -p ./data
cd ./data

# Import NUMBER_OF_RUNS vars
source /home/lighthouse/.env

EXTRA_LIGHTHOUSE_FLAGS=${BASE_LIGHTHOUSE_FLAGS:-}

for (( i = 0; i < $NUMBER_OF_RUNS; i++ ))
do
  FOLDER_NAME="$SAFE_URL/$i"
  echo "Run $i on $URL..."
  if [[ -f "$FOLDER_NAME" ]]; then
    echo "$FOLDER_NAME already exists, skipping"
    continue
  fi

  LIGHTHOUSE_FLAGS="$EXTRA_LIGHTHOUSE_FLAGS --output=json --output-path=lhr.json -GA"

  xvfb-run lighthouse "$URL" $LIGHTHOUSE_FLAGS ||
    xvfb-run lighthouse "$URL" $LIGHTHOUSE_FLAGS ||
    xvfb-run lighthouse "$URL" $LIGHTHOUSE_FLAGS

  mv lhr.json ./latest-run
  mkdir -p "$SAFE_URL"
  mv ./latest-run "$FOLDER_NAME"
done

ls "$SAFE_URL"/*
