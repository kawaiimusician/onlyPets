const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose');
const Schema = mongoose.Schema;
const {format} = require('date-fns');

let userSchema = Schema({
    username: {
        type: String,
        unique: true
    },
    password: String,
    profilePic: {
        type: String,
        default: "/images/6260c79d17ff04c4d0fde6cfa86a6489"
    },
    postings: [ {
        description: String,
        timestamp: {
            type: String,
            default: format(new Date(), 'MM/dd/yyyy')
        },
        sortingStamp: {
            type: String,
            default: Date.now()
        },
        username: String,
        likedBy: [{
            user: String,
            userId: String
        }],
        img: {
            type: String
        }
    } ],
    followers: [ {
        followerName: String,
        followerId: String
    } ],
    following: [ {
        followingName: String,
        followingId: String
    } ]
});

userSchema.plugin(passportLocalMongoose);
module.exports = mongoose.model('User', userSchema);
