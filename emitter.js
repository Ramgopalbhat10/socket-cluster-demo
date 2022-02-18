const express = require("express");
const requestPromise = require("request-promise");
var ioRedis = require("ioredis");

const sentinels = {
  sentinels: [
    { host: "172.24.0.5", port: 5000 },
    { host: "172.24.0.6", port: 5000 },
    { host: "172.24.0.7", port: 5000 },
  ],
  name: "mymaster",
  password: "jarvis",
};
const localClient = {
  host: "127.0.0.1",
  port: 6379,
};

const redisClient = new ioRedis(localClient);
var ioEmitter = require("socket.io-emitter")(redisClient);

const app = express();
let counter = 0;
let replies = [
  "Agent: Hi, I'm Ram. How may I help you?",
  "Agent: Ask me anything",
  "Agent: You are boring",
  "Agent: I want to disconnect",
];

app.use(express.json());

app.post("/getDetails", function (req, res) {
  const request = {
    id: req.body.id,
    msg: req.body.msg,
  };
  const options = {
    method: "POST",
    url: "http://localhost:3000/sendDetails",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  };
  res.send("Sending the resposne form server2");
  requestPromise(options, function (error, response) {
    if (error) {
      console.log("Error when getting details from server2", error);
    }
    console.log(response.body);
  });
});

app.get("/getData", async function (req, res) {
  console.log("Getting data from redis...");
  const data = await redisClient.get("ram");
  res.send(data);
});

app.post("/connect", function (req, res) {
  console.log("Process running in -> ", process.pid);
  const socketId = req.body.id;
  setClientDataInRedisWithLiveAgentFlag(socketId, true);

  if (counter === 4) {
    counter = 0;
  }

  ioEmitter.to(socketId).emit("chat message", req.body.msg);
  ioEmitter.to(socketId).emit("chat message", replies[counter]);

  counter++;
  res.send(`${socketId} connected to an agent`);
});

app.post("/disconnect", function (req, res) {
  console.log("Process running in -> ", process.pid);
  const socketId = req.body.id;
  setClientDataInRedisWithLiveAgentFlag(socketId, false);

  ioEmitter.to(socketId).emit("chat message", "Disconnected from agent");
  res.send(`${socketId} disconnected to an agent`);
});

app.listen(4000, function () {
  console.log("Server2 is listening on port 4000");
});

function setClientDataInRedisWithLiveAgentFlag(socketId, liveAgent) {
  const clientDetails = {
    id: socketId,
    liveAgent,
  };

  redisClient
    .set(socketId, JSON.stringify(clientDetails))
    .then(() =>
      console.log(
        `Setting liveAgent to true for ${socketId} in redis`,
        clientDetails
      )
    );
}
