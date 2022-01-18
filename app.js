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
        user.username
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
        user.username
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

////////////////////////////////////////////////////////////////////////

module.exports = app;
