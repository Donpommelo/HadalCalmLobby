//client.js
const { ECSClient, DescribeContainerInstancesCommand, TerminateInstancesCommand } = require("@aws-sdk/client-ec2");

const activeServers = new Map();

module.exports = function(socket) {
	const clientID = socket.id;
    
    this.getLobbies = function() {
		console.log(`Sending Lobby List to Client ID: ${clientID}`);
        socket.emit('receiveLobbies', Array.from(activeServers.values()));
    }

	this.updateLobby = function(data) {
        const roomInfo = JSON.parse(data);
		const serverID = roomInfo["instanceID"] ?? clientID;
		
		if (activeServers.has(serverID)) {
			const currentData = activeServers.get(serverID);
			currentData["playerNum"] = roomInfo["playerNum"];
			currentData["playerCapacity"] = roomInfo["playerCapacity"];
			currentData["gameMode"] = roomInfo["gameMode"];
			currentData["gameMap"] = roomInfo["gameMap"];
			currentData["lastUpdate"] = Date.now();
			activeServers.set(serverID, currentData);
		}
    }
	
    this.makeLobbyLocal = function(data) {
		const roomInfo = JSON.parse(data);
		setupDefaultLobbyFields(roomInfo);
		roomInfo["online"] = false;

		console.log(`Local Lobby created for client ${clientID}: ${JSON.stringify(roomInfo)}`);
		activeServers.set(clientID, roomInfo);
    }
	
	this.makeLobbyOnline = async function(data) {
		const userDataScript = `#!/bin/bash INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id) echo "export INSTANCE_ID=$INSTANCE_ID" >> /etc/environment`;
		const params = {
			ImageId: 'ami-0c80e2b6ccb9ad6d1',
			InstanceType: 't2.micro',
			KeyName: 'HadalServerKeyPair',
			SecurityGroupIds: ['sg-033cf7faef5b20466'],
			UserData: Buffer.from(userDataScript).toString("base64")
		};
		const client = new ECSClient({
				region: "us-east-1"
		});
		const runInstancesCommand = new RunInstancesCommand(params);
		
		try {
			const result = await ec2Client.send(runInstancesCommand);
			const instanceID = result.Instances[0].InstanceId;
			console.log(`Successfully launched instance with ID: ${instanceID}`);
			
			const describeCommand = new DescribeInstancesCommand({
				InstanceIds: [instanceID]
			});
			const data = await ec2Client.send(describeCommand);
			const instance = data.Reservations[0].Instances[0];
			
			socket.emit('lobbyCreated', instance.PublicIpAddress, instanceID);
			
			const roomInfo = JSON.parse(data);
			setupDefaultLobbyFields(roomInfo);
			roomInfo["instanceID"] = instanceID;
			roomInfo["ip"] = instance.PublicIpAddress;
			roomInfo["online"] = true;
			
			console.log(`Online Lobby created for client ${clientID}: ${JSON.stringify(roomInfo)}`);
			activeServers.set(instanceID, roomInfo);
		} catch (err) {
			console.error(`Error launching instance: ${err}`);
		}
	}

    this.error = function(err) {
        console.log(`Client ${clientID} error: ${err.toString()}`);
        activeServers.delete(clientID);
        delete this;
    }

    this.disconnect = function() {
		console.log(`Client ${clientID} Disconnected`);
        activeServers.delete(clientID);
        delete this;
    }
	
	this.exit = function() {
		console.log(`Client ${clientID} Exited`);
		
		if (activeServers.has(clientID)) {
			const currentData = activeServers.get(clientID);
			if (!currentData["online"]) {
				console.log(`Lobby with ID ${clientID} Deleted`);
				activeServers.delete(clientID);
			}
		}
        delete this;
    }
}

function setupDefaultLobbyFields(roomInfo) {
	roomInfo["playerNum"] = 1;
	roomInfo["gameMode"] = "Hub";
	roomInfo["gameMap"] = "S.S. TUNICATE";
	roomInfo["lastUpdate"] = Date.now();
}

async function terminateInstance(instanceID) {
  try {
    // Create the terminate command
    const terminateCommand = new TerminateInstancesCommand({
      InstanceIds: [instanceID]
    });

    // Send the command
    const response = await ec2Client.send(terminateCommand);

    // Log the response
    console.log(`Instance with ID ${instanceID} terminated successfully: ${response.TerminatingInstances}`);
    return response;
  } catch (err) {
	console.error(`Error terminating instance with ID ${instanceID}: ${err}`);
  }
}

// Periodic cleanup of inactive servers
setInterval(() => {
    const now = Date.now();
    for (const [serverID, server] of activeServers) {
        if (now - server.lastUpdate > 180000) { // 3 minutes
			console.log(`Server ${serverID} Removed for Inactivity`);
			if (server["online"]) {
				terminateInstance(serverID);
			}
			activeServers.delete(serverID);
        }
    }
}, 60000); // Run every minute