# AWS-Transcribe-NodeJS
This sample includes support for AWS Transcribe for NodeJS with ExpressJS. 
It also includes the tracking of a transcribe process and the use of S3 for audio storage.

## Example of sending audio file via multipart form

Multipart form POST request with paramters
<ul>
  <li>fileData: attached audio file.</li>
  <li>numberOfSpeakers: Number of speakers for the audio file.</li>
  </ul>

```shell

curl -X POST \
  http://localhost:8080/start-transcription \
  -H 'content-type: multipart/form-data;' \
  -F fileData=@/Users/mc29.mp3 \
  -F numberOfSpeakers=2

```

## Example of getting transcription job progress
After starting a transcription you are given a job ID which can be used to track progress. Job ID is included in the URL parameters.

```shell

curl -X GET \
  http://localhost:8080/get-transcription/<JOB-ID-GOES-HERE>

```
