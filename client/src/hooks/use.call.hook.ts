import { useState, useRef, useEffect } from "react";
import { socket } from "../utils/socket";

export function useCallHook(senderId: string) {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [callStatus, setCallStatus] = useState<"idle" | "calling" | "ringing" | "ongoing">("idle");

    const [incomingCall, setIncomingCall] = useState<{
        senderId: string;
        offer: RTCSessionDescriptionInit;
        callType: "video" | "audio";
    } | null>(null);

    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const otherUserIdRef = useRef<string>("");
    const localStreamRef = useRef<MediaStream | null>(null);

    const startLocalMedia = async (callType: "video" | "audio") => {
        try {
            const constraints = callType === "video"
                ? { video: true, audio: true }
                : { video: false, audio: true };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            localStreamRef.current = stream;

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            return stream;
        } catch (err) {
            console.log("media access error:", err);
        }
    };

    const createPeerConnection = (stream: MediaStream) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
        });

        pc.ontrack = (event) => {
            const incomingStream = event.streams[0];
            setRemoteStream(incomingStream);
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = incomingStream;
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate && otherUserIdRef.current) {
                socket.emit("ice_candidate", {
                    senderId,
                    receiverId: otherUserIdRef.current,
                    candidate: event.candidate,
                });
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    const cleanupCall = () => {
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;

        localStreamRef.current?.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;

        setLocalStream(null);
        setRemoteStream(null);
        setIncomingCall(null);
        setCallStatus("idle");
        otherUserIdRef.current = "";
    };

    const startCall = async (receiverId: string, callType: "video" | "audio") => {
        otherUserIdRef.current = receiverId;

        const stream = await startLocalMedia(callType);
        if (!stream) return;           

        const pc = createPeerConnection(stream);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        setCallStatus("calling");

        socket.emit("call_user", {
            senderId,
            receiverId,
            offer,
            callType,
        });
    };

    const acceptCall = async () => {
        if (!incomingCall) return;

        otherUserIdRef.current = incomingCall.senderId;

        const stream = await startLocalMedia(incomingCall.callType);
        if (!stream) return;

        const pc = createPeerConnection(stream);

        await pc.setRemoteDescription(incomingCall.offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        setCallStatus("ongoing");

        socket.emit("call_accepted", {
            senderId: incomingCall.senderId,
            receiverId: senderId,
            answer,
            callType: incomingCall.callType,
        });

        setIncomingCall(null);
    };

    const rejectCall = () => {
        if (!incomingCall) return;

        socket.emit("call_rejected", {
            senderId: incomingCall.senderId,
            receiverId: senderId,
        });

        setIncomingCall(null);
        setCallStatus("idle");
    };

    const endCall = () => {
        const otherId = otherUserIdRef.current;

        if (otherId) {
            socket.emit("end_call", {
                senderId,
                receiverId: otherId,
            });
        }

        cleanupCall();
    };

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, callStatus]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, callStatus]);

    useEffect(() => {
        const handleIncomingCall = (data: {
            senderId: string;
            offer: RTCSessionDescriptionInit;
            callType: "video" | "audio";
        }) => {
            setIncomingCall(data);
            setCallStatus("ringing");
        };

        const handleCallAcceptedByUser = async (data: {
            senderId: string;
            receiverId: string;
            answer: RTCSessionDescriptionInit;
        }) => {
            const pc = peerConnectionRef.current;
            if (!pc) return;

            await pc.setRemoteDescription(data.answer);
            setCallStatus("ongoing");
        };

        const handleCallRejectedByReceiver = () => {
            cleanupCall();
        };

        const handleCallFailed = (reason: string) => {
            console.log("call failed:", reason);
            cleanupCall();
        };

        const handleIceCandidateReceived = async (data: {
            senderId: string;
            receiverId: string;
            candidate: RTCIceCandidateInit;
        }) => {
            const pc = peerConnectionRef.current;
            if (!pc) return;
            try {
                await pc.addIceCandidate(data.candidate);
            } catch (err) {
                console.log("error adding ice candidate:", err);
            }
        };

        const handleCallEnded = () => {
            cleanupCall();
        };

        socket.on("incoming_call", handleIncomingCall);
        socket.on("call_accepted_by_user", handleCallAcceptedByUser);
        socket.on("call_rejected_by_receiver", handleCallRejectedByReceiver);
        socket.on("call_failed", handleCallFailed);
        socket.on("ice_candidate_received", handleIceCandidateReceived);
        socket.on("call_ended", handleCallEnded);

        return () => {
            socket.off("incoming_call", handleIncomingCall);
            socket.off("call_accepted_by_user", handleCallAcceptedByUser);
            socket.off("call_rejected_by_receiver", handleCallRejectedByReceiver);
            socket.off("call_failed", handleCallFailed);
            socket.off("ice_candidate_received", handleIceCandidateReceived);
            socket.off("call_ended", handleCallEnded);
        };
    }, []);

    return {
        localStream,
        remoteStream,
        localVideoRef,
        remoteVideoRef,
        callStatus,
        incomingCall,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
    };
}