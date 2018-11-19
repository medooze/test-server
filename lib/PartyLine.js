const TransactionManager = require("transaction-manager");
//Get the Medooze Media Server interface
const MediaServer = require("medooze-media-server");

//Get Semantic SDP objects
const SemanticSDP	= require("semantic-sdp");
const SDPInfo		= SemanticSDP.SDPInfo;
const MediaInfo		= SemanticSDP.MediaInfo;
const CandidateInfo	= SemanticSDP.CandidateInfo;
const DTLSInfo		= SemanticSDP.DTLSInfo;
const ICEInfo		= SemanticSDP.ICEInfo;
const StreamInfo	= SemanticSDP.StreamInfo;
const TrackInfo		= SemanticSDP.TrackInfo;
const Direction		= SemanticSDP.Direction;
const CodecInfo		= SemanticSDP.CodecInfo;


const Capabilities = {
	audio : {
		codecs		: ["opus"],
	},
	video : {
		codecs		: ["vp8"],
		rtx		: true,
		rtcpfbs		: [
			{ "id": "goog-remb"},
			{ "id": "transport-cc"},
			{ "id": "ccm", "params": ["fir"]},
			{ "id": "nack"},
			{ "id": "nack", "params": ["pli"]}
			
		],
		extensions	: [
			"urn:3gpp:video-orientation",
			"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
			"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
			"urn:ietf:params:rtp-hdrext:toffse",
			"urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
			"urn:ietf:params:rtp-hdrext:sdes:mid"
		],
		simulcast	: true
	}
};

const transports = new Set();

module.exports = function(request,protocol,endpoint)
{
	const connection = request.accept(protocol);
	
	//Create new transaction manager
	const tm = new TransactionManager(connection);
	
	//Create new managed peerconnection server for this
	const mngr = endpoint.createPeerConnectionServer(tm,Capabilities);
	
	//LIsten for remotelly created peer connections
	mngr.on("transport",(transport)=>{
		
		//Store tm
		transport.tm = tm;
		
		//Listen for incoming tracks
		transport.on("incomingtrack",(track,stream)=>{
			//For all transport
			for (const other of transports)
			{
				//If not me
				if (other!=transport)
				{
					//Get stream id from remote id
					const outgoingStreamId = "remote-" + stream.getId();
					//Get stream
					let outgoingStream = other.getOutgoingStream(outgoingStreamId);
					//If not found
					if (!outgoingStream)
						//Create it
						outgoingStream = other.createOutgoingStream(outgoingStreamId);

					//Create ougoing track
					const outgoing = outgoingStream.createTrack(track.getMedia());
					//Send loopback
					outgoing.attachTo(track);
					//Only for video
					if (outgoing.getMedia()=="video")
					{
						//Send stats periodically
						const timer = setInterval(()=>{
							//send event
							other.tm.event("layers",{
								streamId : outgoingStreamId,
								stats	 : track.getActiveLayers()
							});
						},1000);
						//Listen outgoing events
						outgoing.once("stopped",()=>{
							//Cancel timer
							clearInterval(timer);
						});
					}
					//Listen remove events
					track.once("stopped",()=>{
						//Stop also ougoing
						outgoing.stop();
					});
				}
			}
		});
		
		//For all transport
		for (const other of transports)
		{
			//Get all published streams
			for (const stream of other.getIncomingStreams())
			{
				//Get stream id from remote id
				const outgoingStreamId = "remote-" + stream.getId();
				//Create it
				const outgoingStream = transport.createOutgoingStream(outgoingStreamId);

				//Gor each trck
				for (const track of stream.getTracks())
				{
					//Create ougoing track
					const outgoing = outgoingStream.createTrack(track.getMedia());
					//Send loopback
					outgoing.attachTo(track);
					//Send loopback
					outgoing.attachTo(track);
					//Only for video
					if (outgoing.getMedia()=="video")
					{
						//Send stats periodically
						const timer = setInterval(()=>{
							//send event
							tm.event("layers",{
								streamId : outgoingStreamId,
								stats	 : track.getActiveLayers()
							});
						},5000);
						//Listen outgoing events
						outgoing.once("stopped",()=>{
							//Cancel timer
							clearInterval(timer);
						});
					}
					//Listen remove events
					track.once("stopped",()=>{
						//Stop also ougoing
						outgoing.stop();
					});
				}
			}
		}
		
		//LIsten on stopped
		transport.once("stopped",()=>{
			//Delete from transports
			transports.delete(transport);
		});
		
		//Add to transports
		transports.add(transport);
		
		//Commands
		tm.on("cmd",(cmd)=>{
			console.log(cmd);
			//Check command name
			switch (cmd.name)
			{
				case "switch":
				{
					//Get data
					const streamId		= cmd.data.streamId;
					const encodingId	= cmd.data.encodingId;
					const temporalLayerId	= cmd.data.temporalLayerId;
					//Get transponder
					const transponder = transport.getOutgoingStream(streamId).getTracks()[1].getTransponder();
					//Select layers
					transponder.selectEncoding(encodingId);
					transponder.selectLayer(0,temporalLayerId);
					//Acept command
					cmd.accept();
					break;
				}
			}
		});
		
		//Close on disconnect
		connection.on("close",() => {
			//Stop transport an recorded
			transport.stop();
			
		});
	});
	
	//Close on disconnect
	connection.on("close",() => {
		//Stop peerconnection server
		mngr.stop();
	});
};
