const express = require('express');
const app = express();

const mongoose = require('mongoose');
const passport = require('passport');
const localStrategy = require('passport-local');
const passportLocalMongoose = require('passport-local-mongoose');
const multer  = require('multer')
const upload = multer({ dest: 'uploads/' })
const { uploadFile, getFileStream } = require('./S3');
const fs = require('fs');
const util = require('util');
const unlinkFile = util.promisify(fs.unlink)

app.set("view engine", "ejs");
app.use(express.static('public'));
app.use(express.json());

//Connection to DB
const connectDB = require('./config/dbConnection');
connectDB();

// Require user.js & add body parser
const User = require('./models/user');

// const { findById } = require('./models/user');
app.use(express.urlencoded({ extended: true }));

// Passport Config
app.use(require('express-session')({
    secret: '1234',
    resave: false, // save the session object even if not changed
    saveUninitialized: false // save the session object even if not initialized
}));
app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// ------------------------------------------
// Root route
app.get('/', (req, res, next) => {
    res.render('index', {error: false});
});

// ------------------------------------------
// login route with error (basically the same as the root but with an error)
app.get('/login', (req, res, next) => {
    res.render('index', {error: true});
});

// ------------------------------------------
// Passport authentication
app.post('/', passport.authenticate('local',
    {
        successRedirect: '/home',
        failureRedirect: '/login',
    }
));

// ------------------------------------------
// upload profile picture
app.get('/changeProfilePic', isLoggedIn, async (req, res)=> {
    let user = req.user.username
    // get current user data and store in ThisUserData
    try {
        var ThisUserData = await User.find({username: `${user}`}).exec();
    } catch (err) {
        console.log(err)
    };
    // pull out profile picture path to display on the sidebar
    let pfpPath = ThisUserData[0].profilePic
    res.render('changePic', { username: req.user.username, profilePic: pfpPath})
});

// upload.single("image") uploads the image to a temporary uploads folder
app.post('/uploadProfilePic', isLoggedIn, upload.single('image'), async (req, res) => {
    const file = req.file;
    // uploadFile(file) uploads the captured file and sends it to S3
    const result = await uploadFile(file);
    // unlinkFile takes the file out of the uploads folder
    await unlinkFile(file.path)
    // capturing the image path to store in the DB
    let imagePath = `/images/${result.Key}`

    // update the image path in the DB with the imagePath value
    User.findByIdAndUpdate(
        { _id: req.user._id },
        { $set: { profilePic: imagePath } },
        function (error, success) {
            if (error) {
                console.log(error);
            } else {
                res.redirect('/profile');
            }
        }
    );
});


// ------------------------------------------
// Posts (first try text and then add images)
app.get('/newPost', isLoggedIn, async (req, res) => {
    let user = req.user.username;
    // get data from DB and extract profile pic path
    try {
        var ThisUserData = await User.find({username: `${user}`}).exec();
    } catch (err) {
        console.log(err)
    };
    let pfpPath = ThisUserData[0].profilePic
    res.render('post', { username: req.user.username, profilePic: pfpPath })
});

// upload.single("image") uploads the image to a temporary uploads folder
app.post('/uploadPost', isLoggedIn, upload.single('image'), async (req, res) => {
    let desc = req.body.desc;
    const file = req.file;
    // uploadFile(file) uploads the captured file and sends it to S3
    const result = await uploadFile(file);
    // unlinkFile takes the file out of the uploads folder
    await unlinkFile(file.path)
    // capturing the image path to store in the DB
    let imagePath = `/images/${result.Key}`
    // Create post using the user.js model
    const post = {
        description: desc,
        img: imagePath,
        sortingStamp: Date.now(),
        username: req.user.username,
        likedby: []
    };
    // push post to DB
    User.findByIdAndUpdate(
        { _id: req.user._id },
        { $push: { postings: post } },
        function (error, success) {
            if (error) {
                console.log(error);
            } else {
                console.log(post)
                res.redirect('/home');
            }
        }
    );
});

// gets images from S3 bucket using the image key
app.get('/images/:key', (req, res)=> {
    const key = req.params.key;
    const readStream = getFileStream(key)
    readStream.pipe(res)
});


// ------------------------------------------
// Posts - like and unlike
app.post("/like/:user/:postId", isLoggedIn, async (req, res)=> {
    let postId = req.params.postId;
    let user = req.params.user;
    // find userId
    try {
        var UserData = await User.find({username:`${user}`});
    } catch (err) {
        console.log(err)
    }

    let userId = UserData[0]._id;
    // create like info object
    let likeInfo = {
        user: req.user.username,
        userId: req.user._id
    }

    //update db with likeInfo
    User.updateOne(
        {_id: userId, postings: {$elemMatch: {_id: postId}}},
        {$push: { "postings.$.likedBy" : likeInfo}},
        function (error, success) {
            if (error) {
                console.log(error);
            } if (success) {
                console.log(`${req.user.username} liked a post`)
                res.redirect("/home")
            }
        }
    )
});

app.post("/unlike/:user/:postId", isLoggedIn, async (req, res)=> {
    let postId = req.params.postId;
    let user = req.params.user;
    let currentUser = req.user.username
    try {
        var UserData = await User.find({username:`${user}`});
    } catch (err) {
        console.log(err)
    };

    // capture userId
    let userId = UserData[0]._id;

    // remove the likeData from the current user on the post specified in the params
    User.updateOne(
        {_id: userId, postings: {$elemMatch: {_id: postId}}},
        {$pull: { "postings.$.likedBy": {user: currentUser}}},
        function (error, success) {
            if (error) {
                console.log(error);
            } if (success) {
                console.log(`${req.user.username} unliked a post`)
                res.redirect("/home")
            }
        }
    )
});

// ------------------------------------------
// Posts - delete post
app.post('/post/delete/:id', isLoggedIn, async (req, res)=> {
    let currentUser = req.user.username;
    let postId = req.params.id
    try {
        var UserData = await User.find({username:`${currentUser}`});
    } catch (err) {
        console.log(err)
    }
    let userId = UserData[0]._id;

    // find and pull out the post corresponding with the postId provided in the params
    User.findByIdAndUpdate(
        {_id: userId, postings: {$elemMatch: {_id: postId}}},
        {$pull: {postings: {_id: postId}}},
        function (error, success) {
            if (error) {
                console.log(error);
            } if (success) {
                console.log("Post deleted.")
                res.redirect("/profile")
            }
        }
    )
})

// ------------------------------------------
// Homefeed
app.get('/home', isLoggedIn, async (req, res) => {
    let user = req.user.username;
    let userId = req.user._id
    // capture all user data
    try {
        var UserData = await User.find({}).exec();
    } catch (err) {
        console.log(err)
    };
    // capture data for only the current user
    try {
        var ThisUserData = await User.find({username: `${user}`}).exec();
    } catch (err) {
        console.log(err)
    };
    //extract profile pic path
    let pfpPath = ThisUserData[0].profilePic;

    // store all posts in an array and sort them in reverse chronological order using the sortingStamp
    let allPosts = []
    UserData.forEach(el => {
        let posts = el.postings
        posts.forEach(eachPost => {
            allPosts.push(eachPost)
        })
    });
    let sortedPosts =  allPosts.sort((a, b) => (a.sortingStamp < b.sortingStamp) ? 1 : -1);

    res.render('homefeed', { username: user, postings: sortedPosts, userId: userId, profilePic: pfpPath })
});

// ------------------------------------------
// Register page
app.get('/register', (req, res) => {
    res.render('register', {error: false});
});

app.post('/register', (req, res) => {
    let newUser = new User({ username: req.body.username });
    User.register(newUser, req.body.password, function (err, user) {
        // if error, display the error in the homefeed.ejs
        if (err) {
            return res.render("register", {error: err})
        // else, redirect to /home
        } else {
            passport.authenticate("local")(req, res, function () {
                console.log(newUser);
                res.redirect("/home");
            })
        }
    })
});

// ------------------------------------------
// profile page
app.get('/profile', isLoggedIn, async (req, res) => {
    let user = req.user.username
    try {
        var UserData = await User.find({username: `${user}`});
    } catch (err) {
        console.log(err)
    }

    let pfpPath = UserData[0].profilePic;

    console.log(UserData)
    res.render('profile', { username: user, info: UserData, profilePic: pfpPath})
});


// ------------------------------------------
// followers
app.get('/followers', isLoggedIn, async (req, res) => {
    let user = req.user.username
    try {
        var UserData = await User.find({username: `${user}`});
    } catch (err) {
        console.log(err)
    }

    let pfpPath = UserData[0].profilePic;

    res.render('followers', { username: req.user.username, data: UserData, profilePic: pfpPath })
});

// ------------------------------------------
// following
app.get('/following', isLoggedIn, async (req, res) => {
    let user = req.user.username
    try {
        var UserData = await User.find({username: `${user}`});
    } catch (err) {
        console.log(err)
    }

    let pfpPath = UserData[0].profilePic;
    
    res.render('following', { username: req.user.username, data: UserData, profilePic: pfpPath })
});

// ------------------------------------------
// notifications -- IN PROGRESS
app.get('/notifications', isLoggedIn, (req, res) => {
    res.render('notifications', { username: req.user.username })
});

// ------------------------------------------
// logout
app.get('/logout', function (req, res) {
    // logout and redirect to login page
    req.logout();
    res.redirect('/')
});

// ------------------------------------------
// other user's profile pages
app.get('/users/:user', isLoggedIn, async (req, res)=> {
    let user = req.params.user
    let currentUser = req.user.username
    // if you click your username it sends you to your profile page
    if (user == req.user.username) {
        res.redirect('/profile')
    } else {
        // grab data of other user
        try {
            var UserData = await User.find({username: `${user}`});
        } catch (err) {
            console.log(err)
        }
        // grab data of current user
        try {
            var ThisUserData = await User.find({username: `${currentUser}`}).exec();
        } catch (err) {
            console.log(err)
        };

        // extract profile picture path
        let pfpPath = ThisUserData[0].profilePic;
    
        // Check if user is following
        let followerData = UserData[0].followers
        let followerArr = []
        function areTheyFollowing (data) {
            data.forEach(el => {
                followerArr.push(el.followerName)
            })
        };
        areTheyFollowing(followerData);
        let doTheyFollow = followerArr.includes(req.user.username);
    
        res.render('otherProfiles', { username: req.user.username, info: UserData, following: doTheyFollow, profilePic: pfpPath})
    }
});

// Follow user
app.post('/users/:user/follow', isLoggedIn, async (req, res)=> {
    let otherUser = req.params.user;
    let currentUser = req.user.username;
    // find user ids
    try {
        var UserData = await User.find({username: `${otherUser}`});
    } catch (err) {
        console.log(err)
    }
    let otherUserId = UserData[0]._id;
    let currentUserId = req.user._id;

    // create follower information
    let followerInfo = {
        followerName: req.user.username,
        followerId: req.user._id
    };
    // create following information
    let followingInfo = {
        followingName: otherUser,
        followingId: otherUserId
    };
    // update followers and following arrays in the DB
    User.findByIdAndUpdate(
        { _id: otherUserId }, 
        { $push: { followers: followerInfo} },
        function (error, success) {
            if (error) {
                console.log(error)
            } else {
                User.findByIdAndUpdate(
                    {_id: currentUserId},
                    { $push: {following: followingInfo} },
                    function (error, success) {
                        if (error) {
                            console.log(error)
                        } else  {
                            console.log(`${currentUser} is now following ${otherUser}`);
                            res.redirect(`/users/${otherUser}`)
                        }
                    }
                )
            }
        }
    );
});

//unfollow
app.post('/users/:user/unfollow', isLoggedIn, async (req, res)=> {
    let otherUser = req.params.user;
    let currentUser = req.user.username;
    // find user ids
    try {
        var UserData = await User.find({username:`${otherUser}`});
    } catch (err) {
        console.log(err)
    }
    let otherUserId = UserData[0]._id;
    let currentUserId = req.user._id;
    console.log(currentUserId);

    // update followers and following arrays in the DB
    User.findByIdAndUpdate(
        { _id: otherUserId }, 
        { $pull: { followers: {followerId: currentUserId} } },
        function (error, success) {
            if (error) {
                console.log(error)
            } else {
                // update following array
                User.findByIdAndUpdate(
                    {_id: `${currentUserId}`},
                    { $pull: {following: {followingId: otherUserId}} },
                    function (error, success) {
                        if (error) {
                            console.log(error)
                        } else  {
                            console.log(`${currentUser} is now unfollowing ${otherUser}`);
                            res.redirect(`/users/${otherUser}`)
                        }
                    }
                )
            }
        }
    );
});

//catchall route
app.get("*", (req, res) => {
    res.json({ message: "That route doesn't exist." })
});

// Checks if user is logged in - if not redirects to login page
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/')
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Running on port ${PORT}`)});