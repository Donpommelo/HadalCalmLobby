//client.js
var total = 0; //total amount of clients that session
var current = 0; //total amount of concurrent clients
var hostnum = 0; //total amount of hosts (total was getting too high to use as client.id in arrays)
var games = [];
var gameid = 0; //array index and total gamecount
var breaknum; //for deleting client servers
var idindex; //same^
var cleartimer = []; //game phase out timer

var tcpPortUsed = require('tcp-port-used');

const port = 8080;

module.exports = function() {
    var client = this;
    
    this.initiate = function() {
        current++;
        total++;     
        
        client.id = total.toString();
        client.host = false;
        
        client.socket.emit('handshake', 'fug');
        
        console.log("client player connected; " + current + " concurrent players connected, " + total + " clients players so far");
    }
    
    
    this.getLobbies = function() {
        console.log("sending gameslist to client " + client.id + "...");
        client.socket.emit('receiveLobbies', games);
    }

    this.makeLobby = function(data) {
        let roomInfo = JSON.parse(data);
        client.ip = roomInfo["ip"];
        tcpPortUsed.check(port, client.ip)
            .then(function(inUse) {
                if (inUse === true) {
                    games[gameid] = roomInfo;
                    console.log("game[" + gameid + "] from client " + client.id + ": " + JSON.stringify(games[gameid]));
                    client.host = true;
                    
                    //#region find host num
                    let nohostnum = true;
                    for (let i = 0; i < hostnum; i++) {
                        if (cleartimer[i] == 0) { //if it's blank
                            client.hostnum = i;
                            nohostnum = false;
                            break;
                        }
                    }
                    if (nohostnum === true) {
                        client.hostnum = hostnum; //host number
                        hostnum++;
                    }
                    //#endregion
                    clearTimeout(cleartimer[client.hostnum]);
                    cleartimer[client.hostnum] = setTimeout(phaseOut, 62000, client.ip, client.hostnum);
                    
                    gameid++;
                    
                } else {
                     console.log(client.id + ' not port forwarded');
                }
            }, function(err) {
                 console.log('Timeoout on check for ' + client.id + ': , ' + err.message);
            });
    }
    
    this.updateLobby = function(data) {
        let roomInfo = JSON.parse(data);
        
        for (let i = 0; i < gameid; i++) { //check to see if they were hosting a server
            idindex = games[i]["ip"];
            if (idindex === client.ip) {
                games[i] = roomInfo;
                clearTimeout(cleartimer[client.hostnum]);
                cleartimer[client.hostnum] = setTimeout(phaseOut, 62000, client.ip, client.hostnum);
                break;
            }
        }
    }

    this.error = function(err) {
        current--;
        if (client.host === true) {
            phaseOut(client.ip,client.hostnum);
        }
        console.log("client " + client.id + " error " + err.toString());
        delete client;
    }

    this.disconnect = function() {
        current--;
        //delete game
        if (client.host === true) {
            phaseOut(client.ip, client.hostnum);
        }
        console.log("client " + client.id + " disconnected");
        delete client;
    }
    
    this.end = function() {
        if (client.host === true) {
            phaseOut(client.ip, client.hostnum);
            console.log("client " + client.id + " hosted server closed");
        }
        console.log("client " + client.id + " ended");
    }
}

function phaseOut(cip, hostnum) {
    //find & delete
    for (let i = 0; i < gameid; i++) { //check to see if they were hosting a server
        idindex = games[i]["ip"];
        if (idindex === cip) { //if the acquired string "a number" is equal to the client.id
            games[i] = 0; //blank it

            breaknum = (i + 1); //one above the break value
            console.log("game[" + i + "] deleted");
            
            clearTimeout(cleartimer[hostnum]);
            cleartimer[hostnum] = 0; //blanked!
            
            games.splice(i, 1); //condense
            gameid -= 1; //reduce game array index (total number of games)
            break;
        }
    }
}