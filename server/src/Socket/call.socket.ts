import {Socket,Server} from 'socket.io';
import { accepteCall, callingUser, camState, endCall, Icecandidate, rejectCall } from '../controllers/call.controller';

type ActiveCalls = Record<string,{with:string,status:string}>;

export const callHandlers=async(socket:Socket,io:Server,users:{[key:string]:string},activeCalls:ActiveCalls)=>{
    let myCallUserId:string|null=null;
    const safe=<T>(fn:(data:T)=>Promise<void>|void)=>async(data:T)=>{
        try{
            await fn(data);
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("call_error",(error));
        }
    };

    socket.on("call_user",safe(async(data:{senderId:string,receiverId:string,offer:RTCSessionDescriptionInit,callType:string})=>{
        myCallUserId=data.senderId;
        await callingUser(data,socket,io,users,activeCalls);
    }));

    socket.on("call_accepted",safe(async(data:{senderId:string,receiverId:string,answer:RTCSessionDescriptionInit,callType:string})=>{
        myCallUserId=data.receiverId;
        await accepteCall(data,socket,io,users,activeCalls);
    }));

    socket.on("call_rejected",safe(async(data:{senderId:string,receiverId:string})=>{
        await rejectCall(data,socket,io,users,activeCalls);
    }));

    socket.on("end_call",safe(async(data:{senderId:string,receiverId:string})=>{
        await endCall(data,socket,io,users,activeCalls);
    }));

    socket.on("ice_candidate",safe(async(data:{senderId:string,receiverId:string,candidate:RTCIceCandidateInit})=>{
        await Icecandidate(data,socket,io,users);
    }));

    socket.on("call_cam_state",safe(async(data:{senderId:string,receiverId:string,camOff:boolean})=>{
        camState(data,socket,io,users,activeCalls);
    }));

    socket.on("disconnect",safe(async()=>{
        const uid=Object.keys(users).find((k)=>users[k]===socket.id)??myCallUserId;
        if(!uid) return;
        const call=activeCalls[uid];
        if(!call) return;
        await endCall({senderId:uid,receiverId:call.with},socket,io,users,activeCalls);
    }));
}