var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var players = [];

const port = process.env.PORT || 8080;

server.listen(port, function(){
	console.log("Server is now running...");
});

io.on('connection', function(socket){
	console.log("Player Connected!");
    
    var c_inst = new require('./client.js');
    var thisClient = new c_inst();

    thisClient.socket = socket;
    thisClient.initiate();

    socket.on('error', thisClient.error);
    socket.on('disconnect', thisClient.disconnect);
    socket.on('end', thisClient.end);
    socket.on('getLobbies', thisClient.getLobbies);
    socket.on('makeLobby', thisClient.makeLobby);
    socket.on('updateLobby', thisClient.updateLobby);
});