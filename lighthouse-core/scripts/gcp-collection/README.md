# Usage

1. Spin up machines and start the collection.
   1. (Prerequiste) Install GCloud SDK and authenticate locally, Run `brew cask install google-cloud-sdk && gcloud auth login`
    1. (Prerequiste Googlers only) Ensure you're on the corp VPN or you won't be able to SSH into a Google-owned instance. 
   1. (Optional) Run `export TARGET_GIT_REF=<a lighthouse git ref that has been pushed> ` if wanting to run on anything but master.
   1. (Optional) Run `export TARGET_RUNS=<a number> ` if needing more than 1 run per URL.
   1. (Optional) Run `export LIGHTHOUSE_COLLECTION_GCLOUD_PROJECT=<project name> ` to set your GCloud project.
   1. Run `bash lighthouse-core/scripts/gcp-collection/run.sh` from the repo root.
1. Check status of collection, download data, and kill machines on completion.
   1. Run one of the two commands printed by `run.sh` depending on which dataset you'd like to download.
   1. Run the delete command printed by `run.sh` after data has been downloaded.
1. Analyze the results
   1. Bespoke for now :)

## Future Work

- Collect a more comprehensive URL set for `urls.txt`
- Autodetermine the instance collect instance by n+1 the existing instances
- Add a fleet creation script to automatically create and distribute large URL sets (similar to [`fleet-create.sh`](https://github.com/patrickhulce/dzl-lighthouse/blob/60447f652dc15cacfa603fdf7c88b1add4229d1d/cwv/collection/fleet-create.sh))
- Add a polling status script to automatically download and delete (similar to [`fleet-status.sh`](https://github.com/patrickhulce/dzl-lighthouse/blob/60447f652dc15cacfa603fdf7c88b1add4229d1d/cwv/collection/fleet-status.sh))
- Add analysis scripts (similar to [`preprocess.sh`](https://github.com/patrickhulce/dzl-lighthouse/blob/60447f652dc15cacfa603fdf7c88b1add4229d1d/cwv/analyze/preprocess.sh) and [`analyze-ab-test.js`](https://github.com/patrickhulce/dzl-lighthouse/blob/60447f652dc15cacfa603fdf7c88b1add4229d1d/cwv/analyze/analyze-ab-test.js))
