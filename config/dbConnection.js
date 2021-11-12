const mongoose = require('mongoose');
const key = require('./keys');
let connection = key.mongo_uri;
let db = key.db;

const connectDB = ()=> {
    mongoose.connect(connection, {useNewUrlParser: true, useUnifiedTopology: true})
    .then(()=> console.log(`Connected to ${db} db.`))
    .catch(err=> {
        console.log("Error connecting to db", err)
        process.exit(1)
    })
}

module.exports = connectDB;