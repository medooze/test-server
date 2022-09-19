const TransactionManager = require("transaction-manager");
//Get the Medooze Media Server interface
const MediaServer = require("medooze-media-server");
const VideoCodecs = require("h264-encoder-mockup");

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


VideoCodecs.enableDebug(false);
VideoCodecs.enableUltraDebug(false);

const Capabilities = {
	audio: {
		codecs: ["opus"],
		extensions: [
			//"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
			"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
			"urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
			"urn:ietf:params:rtp-hdrext:sdes:mid"
		],
	},
	video : {
		codecs		: ["h264;packetization-mode=1"],
		rtx		: true,
		rtcpfbs		: [
			{ "id": "transport-cc"},
			{ "id": "ccm", "params": ["fir"]},
			{ "id": "nack"},
			{ "id": "nack", "params": ["pli"]}
		],
		extensions	: [
			"urn:3gpp:video-orientation",
			"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
			"urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
			"urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
			"urn:ietf:params:rtp-hdrext:sdes:mid",
		]
	}
};

let counter = 0;
module.exports = function(request,protocol,endpoint)
{
	const connection = request.accept(protocol);

	//Get query string
	const query = request.resourceURL.query;
	
	//Create new transaction manager
	const tm = new TransactionManager(connection);
	
	//Clone the capabilities
	const capabilities = {...Capabilities};

	//Override rtx
	if ("rtx" in query && !parseInt(query.rtx))
	{
		capabilities.video.rtx = false;
		capabilities.rtcpfbs = [{ "id": "transport-cc" }, { "id": "ccm", "params": ["fir"] }];
	};
			
	//Bitrate properties
	const probing = "probing" in query ? parseInt(query.probing) : 2000;
	const bitrate = "bitrate" in query ? parseInt(query.bitrate) : 2000;
	const initial = "initial" in query ? parseInt(query.bitrate) : 300;
	//Create new managed peerconnection server for this
	const mngr = endpoint.createPeerConnectionServer(tm, capabilities);
	
	//LIsten for remotelly created peer connections
	mngr.on("transport",(transport)=>{

		//Create fake h264 encoder
		const fake = VideoCodecs.createFakeH264VideoEncoder({ fps: 30, bitrate: initial });

		//Create fake incomming video track
		const incomintTrack = fake.createIncomingStreamTrack("fake");

		//Create id
		const id = "twcc-" + String(Date.now()) + "-" + (counter++);

		transport.dump("www/twcc/dumps/" + id + ".pcap", { incoming: false, outgoing: false, rtcp: false, bwe: true });

		tm.event("url", "/twcc/dumps/" + id + ".csv");

		transport.setBandwidthProbing(!!probing);
		
		if (probing)
		{
			transport.setProbingBitrateLimit(probing*1000);
			transport.on("targetbitrate", (targetbitrate) =>	{
				console.log("targetbitrate", targetbitrate/1000)
				const encodingBitrate = Math.min(targetbitrate/1000, bitrate) ;
				fake.setBitrate(30, encodingBitrate)
				transport.setBandwidthProbing(encodingBitrate<probing);
			});
		}
		//Set initi

		//Get stream id from remote id
		const outgoingStreamId = "remote-fake-h264";
		//Get stream
		let outgoingStream = transport.getOutgoingStream(outgoingStreamId);
		//If not found
		if (!outgoingStream)
			//Create it
			outgoingStream = transport.createOutgoingStream(outgoingStreamId);
		//Create ougoing track
		const outgoing = outgoingStream.createTrack(incomintTrack.getMedia());
		//Send fake stream
		connection.transporder = outgoing.attachTo(incomintTrack);

		
		//Close on disconnect
		connection.on("close",() => {
			//Stop transport, tracks and encoder
			transport.stop();
			outgoing.stop();
			incomintTrack.stop();
			fake.stop();
		});
	});
	
};
