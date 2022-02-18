var cluster = require("cluster");
var express = require("express");
var http = require("http");
var io = require("socket.io");
// var ioEmitter = require("socket.io-emitter")({ host: "127.0.0.1", port: 6379 });
var ioRedis = require("ioredis");
var redisAdapter = require("socket.io-redis");
var request = require("request-promise");
const { generateKeyPair } = require("crypto");

var port = process.env.PORT || 3000;
var workers = process.env.WORKERS || require("os").cpus().length;

const sentinels = {
  sentinels: [
    { host: "10.244.0.12", port: 5000 },
    { host: "10.244.0.16", port: 5000 },
    { host: "10.244.0.14", port: 5000 },
  ],
  name: "mymaster",
  password: "a-very-complex-password-here",
  sentinelPassword: "a-very-complex-password-here",
};
const localClient = {
  host: "127.0.0.1",
  port: 6379,
};
const redisClient = new ioRedis(localClient);

var app = express();
app.use(express.json());

app.get("/", function (req, res) {
  res.sendfile("index.html");
});
app.get("/crypto", function (req, res) {
  console.log("Process inside /crypto -> ", process.pid);
  // res.send(JSON.stringify(process.pid));
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    // something
  }
  generateKeyPair(
    "rsa",
    {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
        cipher: "aes-256-cbc",
        passphrase: "top secret",
      },
    },
    (err, publicKey, privateKey) => {
      // Handle errors and use the
      // generated key pair.
      res.send(publicKey);
    }
  );
});

app.post("/sendDetails", function (req, res) {
  // ioEmitter.to(req.body.id).emit("chat message", req.body.msg);
  io.to(req.body.id).emit("chat message", req.body.msg);
  console.log(
    "Process running on inside the API call: ",
    process.pid,
    req.body.id,
    req.body.msg
  );
  res.send("sent to the socket from API route of server1");
});

if (cluster.isMaster) {
  console.log("start cluster with %s workers", workers - 1);
  workers--;
  for (var i = 0; i < workers; ++i) {
    var worker = cluster.fork();
    console.log("worker %s started.", worker.process.pid);
  }

  cluster.on("death", function (worker) {
    console.log("worker %s died. restart...", worker.process.pid);
  });
} else {
  start();
}

function start() {
  var httpServer = http.createServer(app);
  var server = httpServer.listen(port);
  io = io.listen(server);

  io.adapter(redisAdapter(redisClient));

  io.on("connection", function (socket) {
    const socketId = socket.id;
    console.log(
      "Socket details with connected process: ",
      socket.id,
      process.pid
    );
    // set client details in redis
    setClientDataInRedis(socketId);

    socket.on("chat message", async function (msg) {
      console.log("Process running on : ", process.pid, socketId, msg);

      const clientRedisData = await getClientDataInRedis(socketId);
      console.log(`Got redis data for ${socketId} -> `, clientRedisData);

      if (msg.includes("agent")) {
        liveAgentConnection(socketId, msg, true);
      } else if (msg.includes("disconnect")) {
        liveAgentConnection(socketId, msg, false);
      } else if (clientRedisData.liveAgent) {
        liveAgentConnection(socketId, msg, true);
      } else {
        io.to(socketId).emit("chat message", msg);
      }
    });
  });

  // console.log("Redis adapter started with url: " + redisUrl);
}
const getClientDataInRedis = async (socketId) => {
  const redisDataString = await redisClient.get(socketId);
  const redisData = JSON.parse(redisDataString);
  return redisData;
};

function liveAgentConnection(socketId, msg, connection) {
  const req = {
    id: socketId,
    msg,
  };
  const options = {
    method: "POST",
    url: connection
      ? "http://localhost:4000/connect"
      : "http://localhost:4000/disconnect",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  };
  request(options, function (error, response) {
    if (error) {
      console.log("Error when getting details", error);
    }
    console.log(response.body);
  });
}

function setClientDataInRedis(socketId) {
  const clientDetails = {
    id: socketId,
    liveAgent: false,
  };
  redisClient
    .set(socketId, JSON.stringify(clientDetails))
    .then(() =>
      console.log(
        `Setting initial client details for ${socketId} in redis`,
        clientDetails
      )
    );
}
