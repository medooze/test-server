const url = "wss://"+window.location.hostname+":"+window.location.port;
//Get our url
const href = new URL(window.location.href);
const codec = href.searchParams.get("codec") || "vp8";
const reverse = href.searchParams.has("reverse");
const strictW3C = href.searchParams.has("strictW3C");
const forceSDPMunging = href.searchParams.has("forceSDPMunging");


if (href.searchParams.has("video"))
	switch (href.searchParams.get("video").toLowerCase())
	{
		case "1080p":
			videoResolution = {
				width: { min: 1920, max: 1920 },
				height: { min: 1080, max: 1080 },
			};
			break;
		case "720p":
			videoResolution = {
				width: { min: 1280, max: 1280 },
				height: { min: 720, max: 720 },
			};
			break;
		case "576p":
			videoResolution = {
				width: { min: 720, max: 720 },
				height: { min: 576, max: 576 },
			};
			break;
		case "480p":
			videoResolution = {
				width: { min: 640, max: 640 },
				height: { min: 480, max: 480 },
			};
			break;
		case "4k":
			videoResolution = {
				width: { min: 3840, max: 3840 },
				height: { min: 2160, max: 2160 },
			};
			break;
		case "no":
			videoResolution = false;
			break;
	}

var opts = {
	lines: 12, // The number of lines to draw
	angle: 0.15, // The length of each line
	lineWidth: 0.44, // 0.44 The line thickness
	pointer: {
		length: 0.8, // 0.9 The radius of the inner circle
		strokeWidth: 0.035, // The rotation offset
		color: '#A0A0A0'     // Fill color
	},
	limitMax: true,
	colorStart: '#28c1d1', // Colors
	colorStop: '#28c1d1', // just experiment with them
	strokeColor: '#F0F0F0', // to see which ones work best for you
	generateGradient: false,
	gradientType: 0
};
var targets = document.querySelectorAll('.gaugeChart'); // your canvas element
var gauges = [];
for (var i=0;i<targets.length;++i)
{
	gauges[i] = new Gauge(targets[i]).setOptions (opts); // create sexy gauge!
	gauges[i].animationSpeed = 10000; // set animation speed (32 is default value)
	gauges[i].set (0); // set actual value
}
gauges[0].maxValue = 1280; 
gauges[1].maxValue = 720; 
gauges[2].maxValue = 30; 
gauges[3].maxValue = 1024; 
gauges[4].maxValue = 1280; 
gauges[5].maxValue = 720; 
gauges[6].maxValue = 30; 
gauges[7].maxValue = 1024;

var texts =  document.querySelectorAll('.gaugeChartLabel');
var ssrcs;

function addVideoForStream(stream,muted)
{
	//Create new video element
	const video = document.querySelector (muted ? "#local" : "#remote");
	//Set same id
	video.streamid = stream.id;
	//Set src stream
	video.srcObject = stream;
	//Set other properties
	video.autoplay = true;
	video.playsInline = true;
	video.muted = muted;
}

function addRemoteTrack(event) 
{
	var prev = 0,prevFrames = 0,prevBytes = 0;
	console.debug("ontrack",event);
	const stream = event.streams[0];
	//Play it
	addVideoForStream(stream);
	//Get track
	var track = stream.getVideoTracks()[0];
	//Update stats
	setInterval(async function(){
		var results;

		try {
			//For ff
			results = await pc.getStats(track);
		} catch(e) {
			//For chrome
			results = await pc.getStats();
		}
		//Get results
		for (let result of results.values())
		{
			if (result.type==="inbound-rtp")
			{
				//Get timestamp delta
				var delta = result.timestamp-prev;
				//Store this ts
				prev = result.timestamp;

				//Get values
				var width = track.width || remote.videoWidth;//result.stat("googFrameWidthReceived");
				var height = track.height || remote.videoHeight;//result.stat("googFrameHeightReceived");
				var fps =  (result.framesDecoded-prevFrames)*1000/delta;
				var kbps = (result.bytesReceived-prevBytes)*8/delta;
				//Store last values
				prevFrames = result.framesDecoded;
				prevBytes  = result.bytesReceived;
				//If first
				if (delta==result.timestamp || isNaN(fps) || isNaN (kbps))
					return;

				for (var i=4;i<targets.length;++i)
					gauges[i].animationSpeed = 10000000; // set animation speed (32 is default value)
				gauges[4].set(width);
				gauges[5].set(height);
				gauges[6].set(Math.min(Math.floor(fps)   ,30));
				gauges[7].set(Math.min(Math.floor(kbps) ,1024));
				texts[4].innerText = width;
				texts[5].innerText = height;
				texts[6].innerText = Math.floor(fps);
				texts[7].innerText =  Math.floor(kbps);
			}
		}
	},1000);

};

function addLocalStream(stream)
{	
	var prev = 0;
	var prevFrames = 0;
	var prevBytes = 0;
	var track = stream.getVideoTracks()[0];
	console.debug("getUserMedia sucess",stream);
	//Play it
	addVideoForStream(stream,true);
	//Update stats
	setInterval(async function(){
		var results;
		try {
			//For ff
			results = await pc.getStats(track);
		} catch(e) {
			//For chrome
			results = await pc.getStats();
		}
		//Get results
		for (let result of results.values())
		{
			if (result.type==="outbound-rtp")
			{

				//Get timestamp delta
				var delta = result.timestamp-prev;
				//Store this ts
				prev = result.timestamp;

				//Get values
				var width = track.width || local.videoWidth;//result.stat("googFrameWidthReceived");
				var height = track.height || local.videoHeight;//result.stat("googFrameHeightReceived");
				var fps =  (result.framesEncoded-prevFrames)*1000/delta;
				var kbps = (result.bytesSent-prevBytes)*8/delta;
				//Store last values
				prevFrames = result.framesEncoded;
				prevBytes  = result.bytesSent;
				//If first
				if (delta==result.timestamp || isNaN(fps) || isNaN (kbps))
					return;

				for (var i=0;i<4;++i)
					gauges[i].animationSpeed = 10000000; // set animation speed (32 is default value)
				gauges[0].maxValue = 1280; 
				gauges[1].maxValue = 720; 
				gauges[2].maxValue = 30; 
				gauges[3].maxValue = 1024;
				gauges[0].set(width);
				gauges[1].set(height);
				gauges[2].set(Math.min(Math.floor(fps)   ,30));
				gauges[3].set(Math.min(Math.floor(kbps) ,1024));
				texts[0].innerText = width;
				texts[1].innerText = height;
				texts[2].innerText = Math.floor(fps);
				texts[3].innerText = Math.floor(kbps);
			}
		}
	},1000);
};

let pc;
//Start everything
window.onload=()=>{
	//Connect with websocket
	const ws = new WebSocket(url,"simulcast");
	
	//Crete transaction manager 
	const tm = new TransactionManager(ws);
	
	//Create managed peer connection
	const client = new MediaServerClient(tm);
	
	//Start on open
	ws.onopen = async ()=>{
		//Get new stream
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: false,
			video: videoResolution
		})
		
		//Add it
		addLocalStream(stream);
		
		//Create new managed pc 
		pc = await client.createManagedPeerConnection({
			strictW3C	: strictW3C,
			forceSDPMunging : forceSDPMunging
		});
		
		//Send track
		pc.addTrack (stream.getVideoTracks()[0],stream,{
			codecs : [codec],
			encodings: reverse ? [
				{ rid: "a" , active: true, },
				{ rid: "b" , active: true, scaleResolutionDownBy : 2.0 },
				{ rid: "c" , active: true, scaleResolutionDownBy : 4.0 }
			] : [
				{ rid: "c" , active: true, scaleResolutionDownBy : 4.0 },
				{ rid: "b" , active: true, scaleResolutionDownBy : 2.0 },
				{ rid: "a" , active: true, },
			]
		});
		
		//On new remote tracks
		pc.ontrack = (event)=>{
			//Add track
			addRemoteTrack(event);
			//Select layer
			tm.event("SELECT_LAYER",{
				rid		: "c",
				spatialLayerId	: 0,
				temporalLayerId	: 2
			});
		};
		
		
		var old = document.querySelector ('.mdl-button--colored');
		var listener = function(event) 
		{
			//Get data
			var rid = event.target.dataset["rid"];
			var temporalLayerId = event.target.dataset["tid"];
			//Select simulcast layer
			tm.event("SELECT_LAYER",{
				rid		: rid,
				spatialLayerId	: 0,
				temporalLayerId	: temporalLayerId
			});
			//Remove
			event.target.classList.add("mdl-button--colored");
			old.classList.remove("mdl-button--colored");
			old = event.target;

		};
		var buttons = document.querySelectorAll('button');
		for (var i = 0; i < buttons.length; i++) 
			buttons[i].addEventListener("click",listener);
	};
};
