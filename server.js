const app = require('express')();
const server = require('http').Server(app);
const io = require('socket.io')(server);

const port = process.env.PORT || 8080;

const https = require("https");

https.get("https://ec2.amazonaws.com", (res) => {
  console.log(`Status Code: ${res.statusCode}`);
}).on("error", (err) => {
  console.error("Error:", err.message);
});

server.listen(port, function(){
	console.log("Server is now running... " + port);
});

io.on('connection', function(socket){
	console.log("Player Connected!");
    
    const c_inst = new require('./client.js');
    const thisClient = new c_inst(socket);

    socket.on('error', thisClient.error);
    socket.on('disconnect', thisClient.disconnect);
    socket.on('exit', thisClient.exit);
    socket.on('getLobbies', thisClient.getLobbies);
	socket.on('updateLobby', thisClient.updateLobby);
    socket.on('makeLobbyLocal', thisClient.makeLobbyLocal);
    socket.on('makeLobbyOnline', thisClient.makeLobbyOnline);
});