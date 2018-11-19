const url = "wss://"+window.location.hostname+":"+window.location.port;

function addRemoteTrack(event)
{
	console.log(event);
	
	const track	= event.track;
	const stream	= event.streams[0];
	
	if (!stream)
		return console.log("addRemoteTrack() no stream")
	stream.oninactive = (event)=>console.log(event);
	
	//Check if video is already present
	let video = remoteVideos.querySelector("div[id='"+stream.id+"']>video");
	
	//Check if already present
	if (video)
		//Ignore
		return console.log("addRemoteTrack() video already present for "+stream.id);
	
	//Create html stuff
	const div	= document.createElement("div");
	video		= document.createElement("video");
	const stats	= document.createElement("div");
	
	//Set id
	div.id = stream.id;
	stats.classList = ["stats"];
	
	//Set video source
	video.srcObject = stream;
	
	//Play it
	video.autoplay = true;
	video.playsInline = true;
	video.play();
	
	//Add them
	div.appendChild(video);
	div.appendChild (stats)
	remoteVideos.append(div);
	
	return div;
}

function removeRemoteTrack(event)
{
	console.log(event);
	
	const track	= event.track;
	const stream	= event.streams[0];
	
	//Check if video is already present
	let div = remoteVideos.querySelector("div[id='"+stream.id+"']");
	
	//Check if already present
	if (!div)
		//Ignore
		return console.log("removeRemoteTrack() video not present for "+stream.id);
	
	remoteVideos.removeChild(div);
	
	return div;
}


function addLocalStream(stream)
{
	//Create html stuff
	const div	= document.createElement("div");
	const video	= document.createElement("video");
	const button	= document.createElement("button");
	button.innerHTML= "&#x1F5D1"; 
	
	//Set video source (no  audio tracks in demo)
	video.srcObject = stream;
	
	//Add them
	div.appendChild(video);
	div.appendChild(button);
	localVideos.append(div);
	
	//Start playing
	video.muted = true;
	video.autoplay = true;
	video.play();
	
	return button;
}


let pc;
let streams = 0;
const AudioContext = window.AudioContext || window.webkitAudioContext;

async function sendTrack(simulcast,codecs)
{
		//Get stream
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: true,
			video: {width: 1280, height: 720}
		});
		
		//Add local video
		const button = addLocalStream(stream);
		
		//The params object
		const params = {};
		
		//If using simulcast
		if (simulcast)
			//Add simulcast params
			params.encodings = [
				{ rid: "a"},
				{ rid: "b" , scaleDownResolutionBy: 2.0 },
				{ rid: "c" , scaleDownResolutionBy: 4.0 }
			];
		
		//If overriding codecs
		if (codecs)
			//Set them to params
			params.codecs = [codecs];
			
		//Add to pc
		const [audioSender,videoSender] = await Promise.all([
			pc.addTrack(stream.getAudioTracks()[0],stream),
			pc.addTrack(stream.getVideoTracks()[0],stream,params)
		]);

		//Remove 
		button.onclick = () => {
			//Remove without  wait
			pc.removeTrack(audioSender);
			pc.removeTrack(videoSender);
			localVideos.removeChild(button.parentNode);
		};
};
//Start everything
window.onload=()=>{
	//Connect with websocket
	const ws = new WebSocket(url,"partyline");
	
	//Crete transaction manager 
	const tm = new TransactionManager(ws);
	
	//Create managed peer connection
	const client = new MediaServerClient(tm);
	
	//Listen for stats events
	tm.on("event",(event)=>{
		//Check event name
		switch(event.name)
		{
			case "layers":
			{	
				//Get data
				const streamId = event.data.streamId;
				const layers = event.data.stats;
				//get stream container
				const container = document.querySelector("div[id='"+streamId+"']>.stats");
				if (!container)
					return;
				//Cleat it
				container.innerHTML="";
				//For each layer
				for (const layer of layers.layers)
				{
					const button = document.createElement("button");
					button.innerText = "SL:"+layer.simulcastIdx+" TL:"+layer.temporalLayerId + " " + layer.bitrate +"bps";
					container.appendChild (button);
					button.onclick = ()=> tm.cmd("switch",{
						streamId	: streamId,
						encodingId	: layer.encodingId,
						temporalLayerId : layer.temporalLayerId
					});
				}
			}
		}
	})
	
	//Start on open
	ws.onopen = async ()=>{
		
		//Create new managed pc 
		pc = await client.createManagedPeerConnection();
		
		//On new remote tracks
		pc.ontrack	= addRemoteTrack;
		pc.ontrackended = removeRemoteTrack;
		
		//Add listeneres
		addTrack.onclick		= ()=> sendTrack();
		addSimulcastTrack.onclick	= ()=> sendTrack(true);
		addTrackVP8.onclick		= ()=> sendTrack(false	, "vp8");
		addSimulcastTrackVP8.onclick	= ()=> sendTrack(true	,"vp8");
		addTrackH264.onclick		= ()=> sendTrack(false	,"h264");
		addSimulcastTrackH264.onclick	= ()=> sendTrack(true	,"h264");
	};
};
