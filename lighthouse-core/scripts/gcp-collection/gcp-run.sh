#!/bin/bash

set -euxo pipefail

##
# @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
# Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
##

whoami
export HOME="/home/lighthouse"
cd /home/lighthouse

# Import LIGHTHOUSE_GIT_REF vars
source /home/lighthouse/.env

mkdir src/
cd ./src
git clone https://github.com/GoogleChrome/lighthouse.git
cd ./lighthouse
git checkout -f "$LIGHTHOUSE_GIT_REF"

sudo yarn --frozen-lockfile
sudo yarn link

cd /home/lighthouse

OLDIFS=$IFS
IFS=$'\n'
for url in $(cat urls.txt)
do
  if [[ "$url" == "#"* ]]; then
    echo "COMMENT: $url"
    continue
  fi

  echo "---------------------------------"
  echo "----- $url -----"
  echo "---------------------------------"
  bash ./run-on-url.sh "$url" || echo "Run on $url failed :("
done
IFS=$OLDIFS

cp urls.txt data/
tar -czf trace-data.tar.gz data/
find data/ -name "lhr.json" -o -name "*.txt" | tar -czf lhr-data.tar.gz -T -

echo "Run complete!"
