import {Socket,Server} from 'socket.io';
import { store_last_message } from './last.message.controller';
import { PersonalChat } from './chat.controller';



const logCall=async(
    ids:{senderId:string,receiverId:string},
    text:string,
    socket:Socket,io:Server,
    users:{[key:string]:string},
)=>{
    try{
        const receiverSocket=users[ids.receiverId];

        const lastMessage=await store_last_message(
            {senderId:ids.senderId,receiverId:ids.receiverId,msg:`${text}`,messageType:"call"});

        if(receiverSocket){
            io.to(receiverSocket).emit("chat_list_update",lastMessage);
        }
        socket.emit("chat_list_update",(lastMessage));

        const personalMsgStoreData={
            senderId:ids.senderId,
            receiverId:ids.receiverId,
            msg:`${text}`,
            messageType:"call",
            filename:"",
            orignalname:"",
            sizeInKb:0,
            sizeInMb:0,
        }

        const msg=await PersonalChat(personalMsgStoreData);
        if(receiverSocket){
            io.to(receiverSocket).emit("receive_message",(msg));
        }
        socket.emit("receive_message",(msg));
    }catch(logErr){
        console.error("call log save failed:",logErr);
    }
};

const callText=(callType:string)=>callType==="video"?" 📹 Video call":"📞 Voice call";
const missedCallText=(callType:string)=>callType==="video"?"📹 Missed video call":"📞 Missed voice call";


export const callingUser=async(data:
    {senderId:string,receiverId:string,offer:RTCSessionDescriptionInit,callType:string},
    socket:Socket,io:Server,
    users:{[key:string]:string},
    activeCalls:Record<string,{with:string,status:string}>,
)=>{
    try{
        if(data.senderId===data.receiverId){
            socket.emit("call_failed",("you cannot call yourself"));
            return;
        }
        const receiverSocketId=data.receiverId;
        const isUserOnline=users[receiverSocketId];
        if(!isUserOnline){
            socket.emit("call_failed",("user is offline"));
            await logCall(data,missedCallText(data.callType),socket,io,users);
            return;
        }
        const isReceiverOnAnotherCall=activeCalls[receiverSocketId];
        if(isReceiverOnAnotherCall){
            socket.emit("call_failed",("user is busy on another call"));
            await logCall(data,missedCallText(data.callType),socket,io,users);
            return;
        }
        const isSenderOnAnotherCall=activeCalls[data.senderId];
        if(isSenderOnAnotherCall){
            socket.emit("call_failed",("you are already on another call"));
            return;
        }
        activeCalls[data.senderId]={with:data.receiverId,status:"ringing"};
        activeCalls[data.receiverId]={with:data.senderId,status:"ringing"};

        io.to(isUserOnline).emit("incoming_call",(
            {senderId:data.senderId,receiverId:data.receiverId,offer:data.offer,callType:data.callType}));

        // call ka log (chat me "Voice call / Video call" message). DB fail ho toh bhi call chalti rahe
        await logCall(data,callText(data.callType),socket,io,users);
    }catch(err){
        throw err;
    }
}









export const accepteCall=async(data:
    {senderId:string,receiverId:string,answer:RTCSessionDescriptionInit,callType:string},
    socket:Socket,io:Server,
    users:{[key:string]:string},
    activeCalls:Record<string,{with:string,status:string}>,
)=>{
    try{
        const callerCall=activeCalls[data.senderId];
        const calleeCall=activeCalls[data.receiverId];
        if(!callerCall || !calleeCall){
            socket.emit("call_failed",("call no longer exist"));
            return;
        }
        callerCall.status="ongoing";
        calleeCall.status="ongoing";

        const senderAvailable=users[data.senderId];
        if(senderAvailable){
            io.to(senderAvailable).emit("call_accepted_by_user",({senderId:data.senderId,receiverId:data.receiverId,answer:data.answer}));
        }
    }catch(err){
        throw err;
    }
}












export const rejectCall=async(data:
    {senderId:string,receiverId:string},
    socket:Socket,io:Server,
    users:{[key:string]:string},
    activeCalls:Record<string,{with:string,status:string}>,
)=>{
    try{
         delete activeCalls[data.receiverId];
         delete activeCalls[data.senderId];
         const senderId=users[data.senderId];
        if(senderId){
            io.to(senderId).emit("call_rejected_by_receiver",
            ({senderId:data.senderId,receiverId:data.receiverId}));
        }
    }catch(err){
        throw err;
    }
}








export const Icecandidate=(data:
    {senderId:string,receiverId:string,candidate:RTCIceCandidateInit},
    socket:Socket,io:Server,users:{[key:string]:string},
)=>{
    try{
        const receiverSocketId=users[data.receiverId];
        if(receiverSocketId){
            io.to(receiverSocketId).emit("ice_candidate_received",({senderId:data.senderId,receiverId:data.receiverId,candidate:data.candidate}))    
        }
    }catch(err){
        throw err;
    }
}










export const endCall=async(data:
    {senderId:string,receiverId:string},
    socket:Socket,io:Server,
    users:{[key:string]:string},
    activeCalls:Record<string,{with:string,status:string}>,
)=>{
    try{
        const receiverSocketId=users[data.receiverId];
        const senderSocketId=users[data.senderId];

        // sach me ek hi call ke do log hain?
        const paired=
            activeCalls[data.senderId]?.with===data.receiverId &&
            activeCalls[data.receiverId]?.with===data.senderId;

        if(!paired){
            // failed / purani call (jaise user offline ya busy tha):
            // sirf maangne wale ka screen reset karo, samne wale ki chalti call ko mat chhedo
            if(senderSocketId){
                io.to(senderSocketId).emit("call_ended",({senderId:data.senderId,receiverId:data.receiverId}));
            }
            return;
        }

        delete activeCalls[data.senderId];
        delete activeCalls[data.receiverId];
          
        if(receiverSocketId){
            io.to(receiverSocketId).emit("call_ended",({senderId:data.senderId,receiverId:data.receiverId}));
        }
        if(senderSocketId){
            io.to(senderSocketId).emit("call_ended",({senderId:data.senderId,receiverId:data.receiverId}));
        }
    }catch(err){
        throw err;
    }
}










export const camState=(data:
    {senderId:string,receiverId:string,camOff:boolean},
    socket:Socket,io:Server,
    users:{[key:string]:string},
    activeCalls:Record<string,{with:string,status:string}>,
)=>{
    try{
        if(activeCalls[data.senderId]?.with!==data.receiverId) return;
        const receiverSocketId=users[data.receiverId];
        if(receiverSocketId){
            io.to(receiverSocketId).emit("call_cam_state_received",({senderId:data.senderId,receiverId:data.receiverId,camOff:!!data.camOff}));
        }
    }catch(err){
        throw err;
    }
}