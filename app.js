const express = require("express");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
};

initializeDBandServer();

////////////////////////////////////////////////////////////////////

//create user or register user
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const selectUserQuery = `
    SELECT 
        *
    FROM 
        user
    WHERE
        username = '${username}'
    `;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    const passwordLength = password.length;
    if (passwordLength < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUser = `
            INSERT INTO
                user (name , username , password , gender)
            VALUES (
                '${name}',
                '${username}',
                '${hashedPassword}',
                '${gender}'
            )
            `;
      await db.run(createUser);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

////////////////////////////////////////////////////////////////////
//middleware function verify jwt token
const verifyAuthenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "anand", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

/////////////////////////////////////////////////////////////////////

//login user API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `
    SELECT 
        *
    FROM 
        user
    WHERE
        username = '${username}'
    `;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    //compare password and hashedPassword
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "anand");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

///////////////////////////////////////////////////////////////////////

//get user details
app.get("/profile/", verifyAuthenticateToken, async (request, response) => {
  let { username } = request;
  const getProfileQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userProfile = await db.get(getProfileQuery);
  response.send(userProfile);
});

////////////////////////////////////////////////////////////////////////
//API 3 /user/tweets/feed/
app.get(
  "/user/tweets/feed/",
  verifyAuthenticateToken,
  async (request, response) => {
    let { username } = request;

    const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
    const userProfile = await db.get(getUserProfile);
    const { user_id } = userProfile;

    const getFollowingUsers = `
    SELECT 
        user.username , tweet.tweet , tweet.date_time as dateTime
    FROM 
        (tweet INNER JOIN user ON user.user_id = tweet.user_id)
        as t INNER JOIN follower ON follower.following_user_id = user.user_id
    WHERE
        follower.follower_user_id = '${user_id}'
        order by date_time DESC
        limit 4 offset 0;
    `;
    const followingUsers = await db.all(getFollowingUsers);
    response.send(followingUsers);
  }
);

////////////////////////////////////////////////////////////////////////
// API 4 /user/following/
app.get(
  "/user/following/",
  verifyAuthenticateToken,
  async (request, response) => {
    let { username } = request;
    const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
    const userProfile = await db.get(getUserProfile);
    const { user_id } = userProfile;

    const getFollowingUsers = `
    SELECT 
        user.name
    FROM 
        user INNER JOIN follower ON follower.following_user_id = user.user_id
    WHERE
        follower.follower_user_id = '${user_id}'
    `;
    const followingUsers = await db.all(getFollowingUsers);
    response.send(followingUsers);
  }
);

////////////////////////////////////////////////////////////////////////
//API 5 /user/followers/
app.get(
  "/user/followers/",
  verifyAuthenticateToken,
  async (request, response) => {
    let { username } = request;
    const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
    const userProfile = await db.get(getUserProfile);
    const { user_id } = userProfile;

    const getFollowingUsers = `
    SELECT 
        user.name
    FROM 
        follower INNER JOIN user ON follower.follower_user_id = user.user_id
    WHERE
        follower.following_user_id = '${user_id}'
    `;
    const followingUsers = await db.all(getFollowingUsers);
    response.send(followingUsers);
  }
);

////////////////////////////////////////////////////////////////////////
//get all tweets
app.get("/tweets/", verifyAuthenticateToken, async (request, response) => {
  const getAllTweets = `
    SELECT 
        *
    FROM 
        tweet
    `;
  const tweetTable = await db.all(getAllTweets);
  response.send(tweetTable);
});

////////////////////////////////////////////////////////////////////////
//API 6 /tweets/:tweetId/
app.get(
  "/tweets/:tweetId/",
  verifyAuthenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    let { username } = request;
    const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
    const userProfile = await db.get(getUserProfile);
    const { user_id } = userProfile;

    const getTweet = `
    SELECT
        *
    FROM
        (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id)
    WHERE
        tweet.tweet_id = '${tweetId}'
        AND follower.follower_user_id = '${user_id}'
    `;
    const getTweetTable = await db.all(getTweet);
    const tableLength = getTweetTable.length;

    const getTweetsQuery = `
    SELECT
        tweet.tweet , count(like.tweet_id) as likes , 
        count(reply.reply) as replies , tweet.date_time as dateTime
    FROM
        ((tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id)
        as t INNER JOIN reply ON reply.tweet_id = tweet.tweet_id) as s INNER JOIN
        like ON tweet.tweet_id = like.tweet_id
    WHERE 
        tweet.tweet_id = '${tweetId}'
        AND follower.follower_user_id = '${user_id}'
    `;
    const tweetTable = await db.all(getTweetsQuery);

    if (tableLength !== 0) {
      response.send(tweetTable);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

////////////////////////////////////////////////////////////////////////
// API 7 /tweets/:tweetId/likes/
app.get(
  "/tweets/:tweetId/likes/",
  verifyAuthenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    let { username } = request;
    const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
    const userProfile = await db.get(getUserProfile);
    const { user_id } = userProfile;

    const getTweet = `
    SELECT
        *
    FROM
        (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id)
    WHERE
        tweet.tweet_id = '${tweetId}'
        AND follower.follower_user_id = '${user_id}'
    `;
    const getTweetTable = await db.all(getTweet);
    const tableLength = getTweetTable.length;

    const getLikesQuery = `
    SELECT
        user.username 
    FROM
        ((tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id)
        as t INNER JOIN like ON like.tweet_id = tweet.tweet_id) as s INNER JOIN
        user ON user.user_id = like.user_id
    WHERE 
        tweet.tweet_id = '${tweetId}'
        AND follower.follower_user_id = '${user_id}'
    `;
    const likesTable = await db.all(getLikesQuery);
    let likesArray = [];

    for (let i of likesTable) {
      likesArray.push(i.username);
    }

    if (tableLength !== 0) {
      response.send(`{"likes": [${likesArray}]}`);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
////////////////////////////////////////////////////////////////////////
//API 8 /tweets/:tweetId/replies/
app.get(
  "/tweets/:tweetId/replies/",
  verifyAuthenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    let { username } = request;
    const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
    const userProfile = await db.get(getUserProfile);
    const { user_id } = userProfile;

    const getRepliesQuery = `
    SELECT
        user.name , reply.reply 
    FROM
        ((tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id)
        as t INNER JOIN reply ON tweet.tweet_id = reply.tweet_id ) as t INNER JOIN
        user ON user.user_id = reply.user_id
    WHERE
        tweet.tweet_id = '${tweetId}'
        AND follower.follower_user_id = '${user_id}'
    `;
    const repliesArray = await db.all(getRepliesQuery);
    const tableLength = repliesArray.length;

    if (tableLength !== 0) {
      response.send(repliesArray);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
////////////////////////////////////////////////////////////////////////
//API 9 /user/tweets/
app.get("/user/tweets/", verifyAuthenticateToken, async (request, response) => {
  let { username } = request;
  const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
  const userProfile = await db.get(getUserProfile);
  const { user_id } = userProfile;

  const getUserTweets = `
    SELECT
        tweet.tweet ,
        (SELECT count(tweet_id)
        FROM like GROUP BY tweet_id HAVING user_id = '${user_id}' ) as likes, 
        (SELECT count(tweet_id)
        FROM reply GROUP BY tweet_id HAVING user_id = '${user_id}') as replies,
        tweet.date_time as dateTime
    FROM
        tweet
    WHERE 
        user_id = '${user_id}'
   
    `;
  const userTweets = await db.all(getUserTweets);
  response.send(userTweets);
});
////////////////////////////////////////////////////////////////////////
//API 10 /user/tweets/
app.post(
  "/user/tweets/",
  verifyAuthenticateToken,
  async (request, response) => {
    const { tweet } = request.body;

    const { username } = request;
    const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
    const userProfile = await db.get(getUserProfile);
    const { user_id } = userProfile;

    const postTweetQuery = `
    INSERT INTO
        tweet (tweet , user_id )
    VALUES (
        '${tweet}',
        '${user_id}'
    )
    `;
    await db.run(postTweetQuery);
    response.send("Created a Tweet");
  }
);

////////////////////////////////////////////////////////////////////////
//API 11 /tweets/:tweetId/
app.delete(
  "/tweets/:tweetId/",
  verifyAuthenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const { username } = request;
    const getUserProfile = `SELECT * FROM user WHERE username = '${username}'`;
    const userProfile = await db.get(getUserProfile);
    const { user_id } = userProfile;

    const deleteTweetQuery = `
    DELETE FROM 
        tweet
    WHERE
        tweet_id = '${tweetId}'
        AND user_id = '${user_id}'
    `;
    const deletedTweet = await db.run(deleteTweetQuery);

    const { changes } = deletedTweet;
    if (changes === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send("Tweet Removed");
    }
  }
);

////////////////////////////////////////////////////////////////////////

module.exports = app;
