const awsSdk = require('aws-sdk');
const express = require('express');
const path = require('path');
const fs = require('fs');
const uuid = require('uuid/v1');
const multer = require('multer');
const upload = multer();

awsSdk.config.update({region: 'us-east-1'});

const BUCKET_NAME = "BUCKET_NAME_HERE";
const transcribeService = new awsSdk.TranscribeService();
const s3Service = new awsSdk.S3({params: {Bucket: BUCKET_NAME}});
const app = express();
const PORT = 8080;

app.use(express.static(path.join(__dirname, 'public')));

function transcribeResultParser(transcribeResult) {

    const overAllResult = [];

    speakerData = transcribeResult.items;

    for (let counter = 0; counter < speakerData.length; counter++) {
        const item = speakerData[counter];
        const alternatives = item.alternatives;
        const highestAlt = getHighestItemFromAlternativesArray(alternatives).content;
        const startTime = parseFloat(item.start_time);
        const endTime = parseFloat(item.end_time);
        const speakerName = getSpeakerByTimeStamps(startTime, endTime, transcribeResult.speaker_labels.segments);

        let transcribeRecord = {
            startTime: startTime,
            endTime: endTime,
            speakerName: speakerName,
            content: highestAlt
        };

        overAllResult.push(transcribeRecord);

    }

    return {
        speechBreakdown: overAllResult,
        transcripts: transcribeResult.transcripts
    };
}

function getSpeakerByTimeStamps(startTime, endTime, speakerLabels) {
    for (let counter = 0; counter < speakerLabels.length; counter++) {
        const item = speakerLabels[counter];
        if (startTime >= parseFloat(item.start_time) && endTime <= parseFloat(item.end_time)) {
            return item.speaker_label;
        }
    }
}

function getHighestItemFromAlternativesArray(altArray) {
    let result = null;
    let highestScore = -1;
    for (let counter = 0; counter < altArray.length; counter++) {
        const currentItem = altArray[counter];
        if (parseFloat(currentItem.confidence) > highestScore) {
            highestScore = parseFloat(currentItem.confidence);
            result = currentItem;
        }
    }
    return result;
}

app.route('/get-transcription/:id')
    .get((req, res) => {
        const transcriptionJobID = req.params.id;
        transcribeService.getTranscriptionJob({
            TranscriptionJobName: transcriptionJobID
        }).promise().then((data) => {
            if (data.TranscriptionJob.TranscriptionJobStatus === 'COMPLETED') {
                s3Service.getObject({
                    Bucket: BUCKET_NAME,
                    Key: transcriptionJobID + '.json'
                }).promise().then((data) => {
                    const results = JSON.parse(data.Body.toString()).results;
                    parsedData = transcribeResultParser(results);
                    res.send({result: parsedData});
                }).catch((err) => {
                    res.send(err);
                })
            } else {
                res.send({status: data.TranscriptionJob.TranscriptionJobStatus})
            }

        }).catch((err) => {
            res.send(err);
        });
    });

app.post('/start-transcription', upload.any(), (req, res) => {
    const numberOfSpeakers = parseInt(req.body.numberOfSpeakers);
    const jobID = uuid();

    const file = req.files[0].buffer;
    const filename = req.files[0].originalname;

    const fileExtension = filename.split('.').slice(-1)[0];
    const newFileName = jobID + '.' + fileExtension;
    const filePath = __dirname + '/temp-audio-files/' + newFileName;
    const fstream = fs.createWriteStream(filePath);
    fstream.write(file);
    fstream.close();

    fstream.on('close', () => {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                throw err;
            }

            const base64data = Buffer.from(data, 'binary');
            s3Service.upload({
                Bucket: BUCKET_NAME,
                Key: newFileName,
                Body: base64data,
            }, (err, s3UploadResult) => {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error(err);
                        return;
                    }

                    transcribeService.startTranscriptionJob({
                        LanguageCode: 'en-US',
                        Media: {MediaFileUri: s3UploadResult.Location},
                        MediaFormat: fileExtension,
                        TranscriptionJobName: jobID,
                        OutputBucketName: s3UploadResult.Bucket,
                        Settings: {
                            MaxSpeakerLabels: numberOfSpeakers,
                            ShowSpeakerLabels: true
                        }
                    }).promise().then((data) => {
                        const jobName = data.TranscriptionJob.TranscriptionJobName;
                        const status = data.TranscriptionJob.TranscriptionJobStatus;
                    }).catch(err => {
                        console.log(err);
                    });
                });
            });
        });
    });

    res.send({jobID: jobID, status: 'IN_PROGRESS'});
});


app.listen(PORT, () => console.log(`Listening on ${PORT}`));
