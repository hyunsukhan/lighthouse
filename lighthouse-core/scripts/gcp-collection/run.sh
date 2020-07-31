#!/bin/bash

set -euxo pipefail

##
# @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
# Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
##

DIRNAME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LH_ROOT="$DIRNAME/../../.."
cd $DIRNAME

INSTANCE_SUFFIX=${1:-instance0}
INSTANCE_NAME="lighthouse-collection-$INSTANCE_SUFFIX"
CLOUDSDK_CORE_PROJECT=${LIGHTHOUSE_COLLECTION_GCLOUD_PROJECT:-lighthouse-lantern-collect}
LIGHTHOUSE_GIT_REF=${TARGET_GIT_REF:-master}
NUMBER_OF_RUNS=${TARGET_RUNS:-1}
ZONE=us-central1-a

gcloud --project="$CLOUDSDK_CORE_PROJECT" compute instances create $INSTANCE_NAME \
  --image-family=ubuntu-1804-lts --image-project=ubuntu-os-cloud \
  --zone="$ZONE" \
  --boot-disk-size=200GB \
  --machine-type=n1-standard-2

cat > .tmp_env <<EOF
export NUMBER_OF_RUNS=$NUMBER_OF_RUNS
export LIGHTHOUSE_GIT_REF=$LIGHTHOUSE_GIT_REF
export BASE_LIGHTHOUSE_FLAGS="--max-wait-for-load=90000"
EOF

# Instance needs time to start up.
until gcloud --project="$CLOUDSDK_CORE_PROJECT" compute scp ./.tmp_env $INSTANCE_NAME:/tmp/lhenv --zone="$ZONE"
do
  echo "Waiting for start up ..."
  sleep 10
done
rm .tmp_env

gcloud --project="$CLOUDSDK_CORE_PROJECT" compute scp ./gcp-setup.sh $INSTANCE_NAME:/tmp/setup-machine.sh --zone="$ZONE"
gcloud --project="$CLOUDSDK_CORE_PROJECT" compute scp ./urls.txt $INSTANCE_NAME:/tmp/urls.txt --zone="$ZONE"
gcloud --project="$CLOUDSDK_CORE_PROJECT" compute scp ./gcp-run.sh $INSTANCE_NAME:/tmp/run.sh --zone="$ZONE"
gcloud --project="$CLOUDSDK_CORE_PROJECT" compute scp ./gcp-run-on-url.sh $INSTANCE_NAME:/tmp/run-on-url.sh --zone="$ZONE"
gcloud --project="$CLOUDSDK_CORE_PROJECT" compute ssh $INSTANCE_NAME --command="bash /tmp/setup-machine.sh" --zone="$ZONE"
gcloud --project="$CLOUDSDK_CORE_PROJECT" compute ssh lighthouse@$INSTANCE_NAME --command="sh -c 'nohup /home/lighthouse/run.sh > /home/lighthouse/collect.log 2>&1 < /dev/null &'" --zone="$ZONE"

set +x

echo "Collection has started."
echo "Check-in on progress anytime by running..."
echo "  $ gcloud --project="$CLOUDSDK_CORE_PROJECT" compute ssh lighthouse@$INSTANCE_NAME --command='tail -f collect.log' --zone=$ZONE"

TRACE_COPY_COMMAND="gcloud --project="$CLOUDSDK_CORE_PROJECT" compute scp $INSTANCE_NAME:/home/lighthouse/trace-data.tar.gz ./trace-data.tar.gz --zone=$ZONE"
LHR_COPY_COMMAND="gcloud --project="$CLOUDSDK_CORE_PROJECT" compute scp $INSTANCE_NAME:/home/lighthouse/lhr-data.tar.gz ./lhr-data.tar.gz --zone=$ZONE"
DELETE_INSTANCE_COMMAND="gcloud --project="$CLOUDSDK_CORE_PROJECT" compute instances delete $INSTANCE_NAME --zone=$ZONE"
echo "When complete run..."
echo "  For LHR + trace data for -A replication"
echo "  $ bash .tmp/gcp/copy-traces.sh"
echo "  For LHR data for smaller transfer sizes replication"
echo "  $ bash .tmp/gcp/copy-lhrs.sh"
echo "  To delete the instance"
echo "  $ bash .tmp/gcp/delete-instance.sh"

cd $LH_ROOT
mkdir -p .tmp/gcp/
echo "$TRACE_COPY_COMMAND" > .tmp/gcp/copy-traces.sh
echo "$LHR_COPY_COMMAND" > .tmp/gcp/copy-lhrs.sh
echo "$DELETE_INSTANCE_COMMAND" > .tmp/gcp/delete-instance.sh
