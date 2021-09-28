const Express			= require("express");
const CORS 			= require("cors");
const FS			= require("fs");
const HTTPS			= require("https");
const Path			= require("path");
const WebSocketServer		= require ("websocket").server;

//Get the Medooze Media Server interface
const MediaServer = require("medooze-media-server");

const PORT = 8084;
const letsencrypt = false;

//Check 
if (process.argv.length!=3)
	 throw new Error("Missing IP address\nUsage: node index.js <ip>");
//Get ip
const ip = process.argv[2];

//Restrict port range
MediaServer.setPortRange(10000,10100);

//Create UDP server endpoint
const endpoint = MediaServer.createEndpoint(ip);

//Enable debug
MediaServer.enableDebug(false);
MediaServer.enableUltraDebug(false);

//Create rest api
const rest = Express();
rest.use(CORS());
rest.use(Express.static("www"));

// Load the demo handlers
const handlers = {
	"simulcast"	: require("./lib/simulcast.js"),
	"transceivers"	: require("./lib/PeerConnectionServerDemo.js"),
	"partyline"	: require("./lib/PartyLine.js"),
	"twcc"		: require("./lib/twcc.js"),
};


function wss(server)
{
	//Create websocket server
	const wssServer = new WebSocketServer ({
		httpServer: server,
		autoAcceptConnections: false
	});

	wssServer.on ("request", (request) => {
		//Get protocol for demo
		var protocol = request.requestedProtocols[0];

		console.log ("-Got request for: " + protocol);
		//If nor found
		if (!handlers.hasOwnProperty (protocol))
			//Reject connection
			return request.reject ();

		//Process it
		handlers[protocol] (request, protocol, endpoint);
	});
}

//Create HTTP server
if (letsencrypt)
{
	//Use greenlock to get ssl certificate
	const gle = require("greenlock-express").init({
			packageRoot: __dirname,
			configDir: "./greenlock.d",
			maintainerEmail : "sergio.garcia.murillo@gmail.com",
			cluster: false
		});
	gle.ready((gle)=>wss(gle.httpsServer()));
	gle.serve(rest);
} else {
	//Load certs
	const options = {
		key	: FS.readFileSync ("server.key"),
		cert	: FS.readFileSync ("server.cert")
	};
	
	//Manualy starty server
	const server = HTTPS.createServer (options, rest).listen(PORT);
	
	//Launch wss server
	wss(server);
}


//Try to clean up on exit
const onExit = (e) => {
	if (e) console.error(e);
	MediaServer.terminate();
	process.exit();
};

process.on("uncaughtException"	, onExit);
process.on("SIGINT"		, onExit);
process.on("SIGTERM"		, onExit);
process.on("SIGQUIT"		, onExit);
