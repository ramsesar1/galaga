// webrtc-host.js - Para integrar en multijugador.js

let localStream = null;
let peerConnection = null;
let dataChannel = null;
let remoteInputs = {
    left: false,
    right: false,
    shoot: false
};

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Inicializar WebRTC como host
async function initWebRTCHost() {
    try {
        // Capturar pantalla
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: 800, height: 900 },
            audio: false
        });

        // Crear conexión peer
        peerConnection = new RTCPeerConnection(rtcConfig);

        // Agregar stream local
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Crear canal de datos para inputs
        dataChannel = peerConnection.createDataChannel('inputs', {
            ordered: true
        });

        dataChannel.onopen = () => {
            console.log('Canal de datos abierto');
        };

        dataChannel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'input') {
                remoteInputs = data.inputs;
            }
        };

        // Manejar candidatos ICE
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // Aquí normalmente enviarías el candidato al cliente
                // Por simplicidad, lo mostraremos en consola
                console.log('ICE Candidate:', JSON.stringify(event.candidate));
            }
        };

        // Crear oferta
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        console.log('Oferta creada:', JSON.stringify(offer));
        
        return {
            offer: offer,
            success: true
        };

    } catch (error) {
        console.error('Error inicializando WebRTC host:', error);
        return { success: false, error: error.message };
    }
}

// Procesar respuesta del cliente
async function processClientAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        return { success: true };
    } catch (error) {
        console.error('Error procesando respuesta:', error);
        return { success: false, error: error.message };
    }
}

// Agregar candidato ICE del cliente
async function addClientIceCandidate(candidate) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error agregando candidato ICE:', error);
    }
}

// Obtener inputs del cliente para player2
function getRemoteInputs() {
    return remoteInputs;
}

// Limpiar conexión
function closeWebRTCHost() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
    if (dataChannel) {
        dataChannel.close();
    }
}