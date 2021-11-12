const S3 = require('aws-sdk/clients/s3');
const fs = require('fs')

const keys = require('./config/keys');
const bucketName = keys.AWS_BUCKET_NAME;
const region = keys.AWS_BUCKET_REGION;
const accessKeyId = keys.AWS_ACCESS_KEY;
const secretAccessKey = keys.AWS_SECRET_KEY

const s3 = new S3({
    region,
    accessKeyId,
    secretAccessKey
})

// uploads file to s3
function uploadFile(file) {
    const fileStream = fs.createReadStream(file.path)

    const uploadParams = {
        Bucket: bucketName,
        Body: fileStream,
        Key: file.filename
    }

    return s3.upload(uploadParams).promise()
}
exports.uploadFile = uploadFile

// downloads a file from s3
function getFileStream(fileKey) {
    const downloadParams = {
        Key: fileKey,
        Bucket: bucketName
    }

    return s3.getObject(downloadParams).createReadStream()
}
exports.getFileStream = getFileStream


