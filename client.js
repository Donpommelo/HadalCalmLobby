//client.js

require('dotenv').config();
const { EC2Client, DescribeInstancesCommand, DescribeImagesCommand, RunInstancesCommand, TerminateInstancesCommand } = require("@aws-sdk/client-ec2");

const activeServers = new Map();

// Check if running locally or on AWS
const isLocal = process.env.IS_LOCAL === 'true';

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
		const ec2Client = getClient("us-east-2");
		const imageID = await getMostRecentAMI(ec2Client);
		
		const userDataScript = 
		`#!/bin/bash
		nohup java -jar /home/ec2-user/project/HadalServer.jar > /home/ec2-user/project/debug.log 2>&1 &
		`;
		const params = {
			ImageId: imageID,
			InstanceType: 't2.micro',
			KeyName: process.env.AWS_KEY_NAME,
			SecurityGroupIds: [process.env.AWS_SECURITY_GROUPID],
			MinCount: 1,
			MaxCount: 1,
			UserData: Buffer.from(userDataScript).toString("base64")
		};
		
		const runInstancesCommand = new RunInstancesCommand(params);
		
		try {
			const result = await ec2Client.send(runInstancesCommand);
			const instanceID = result.Instances[0].InstanceId;
			console.log(`Successfully launched instance with ID: ${instanceID}`);
			
			const instance = await getInstanceInfo(ec2Client, instanceID);
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

async function getMostRecentAMI(ec2Client) {
    const params = {
        Filters: [
            { Name: 'name', Values: ['HadalServerAMI*'] }
        ]
    };

	const describeImagesCommand = new DescribeImagesCommand(params);

    try {
        const data = await ec2Client.send(describeImagesCommand);
        const amis = data.Images;

        // Sort the images by creation date in descending order
        amis.sort((a, b) => new Date(b.CreationDate) - new Date(a.CreationDate));

		console.log(`Most Recent Image Acquired: ${amis[0].ImageId}`);

        // Return the most recent AMI ID
        return amis[0].ImageId;
    } catch (err) {
		console.error(`Error fetching AMI: ${err}`);
    }
}

async function getInstanceInfo(ec2Client, instanceID, maxRetries = 30, delay = 5000) {
	let retries = 0;
    while (retries < maxRetries) {
		try {		
			const describeCommand = new DescribeInstancesCommand({
				InstanceIds: [instanceID]
			});
			const data = await ec2Client.send(describeCommand);
			const state = data.Reservations[0].Instances[0].State.Name;
            if (state === "running") {
                console.log("Instance is running.");
				return data.Reservations[0].Instances[0];	
            }
			console.log(`Instance state: ${state}. Retrying...`);
		} catch (err) {
            console.log("Instance not ready yet. Retrying...");
        }
        retries++;
        await new Promise((resolve) => setTimeout(resolve, delay));
	}
}

async function terminateInstance(instanceID) {
  try {
	
	const ec2Client = getClient("us-east-2");
	  
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

function setupDefaultLobbyFields(roomInfo) {
	roomInfo["playerNum"] = 1;
	roomInfo["gameMode"] = "Hub";
	roomInfo["gameMap"] = "S.S. TUNICATE";
	roomInfo["lastUpdate"] = Date.now();
}

function getClient(region) {
	return new EC2Client({
		region: region,
		credentials: isLocal ? {
			accessKeyId: process.env.ACCESS_KEY_ID,
			secretAccessKey: process.env.SECRET_ACCESS_KEY
		} : {}
	});
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