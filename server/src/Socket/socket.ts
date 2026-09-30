import { Server } from "socket.io";
import {Server as httpServer} from "http";
import { isSend,isDelivered, PersonalChat, allGroupsOfSender } from "../controllers/chat.controller";
import { userlastVisit } from "../controllers/chat.controller";
import { userlastpresence } from "../models/user.lastpresence.model";
import {edit,delete_from_me,delete_from_everyone } from "../controllers/chat.controller";
import { user_online,user_open_chat,markIsSeen } from "../controllers/chat.controller";
import { get_last_message, update_chat_list, update_chat_list_edit } from "../controllers/last.message.controller";
import { store_last_message } from "../controllers/last.message.controller";
import { totalPendingMessage } from "../controllers/chat.controller";
import { profileSocket } from "./profile.socket";
import { emojiOnMessages } from "./emoji.socket";
import { allPinnedMessage } from "../controllers/profile.controller";
import { stories } from "./stories.socket";
import { groupChat } from "./group.message.socket";
import { emitPendingCountToUser } from "../controllers/chat.controller";
import { registerPollSocketHandlers } from "./poll.socket";
import { callHandlers } from "./call.socket";
import { channelsSocket } from "./channels.socket";
import { communitySocket } from "./community.socket";
import { groupCallSocket } from "./group.call.socket";
import { InCallSocket } from "./InCallChat.socket";
import { docsSocket } from "./docs.socket";
import { docsMessageSocket } from "./docs.message.socket";
import { promptSocket } from "./prompts.socket";


export let io:Server;
export const users:{[key:string]:string}={};

export const userChat=(server:httpServer,FRONTEND_URL:string)=>{
    try{
 io=new Server(server,{
  cors:{
    origin:FRONTEND_URL,
    methods:["POST","GET","DELETE","PUT"],
    credentials:true,
  }
});
let activeChats:Record<string,string>={};
let activeGroupChats:Record<string,string>={};
const activeChannels:Record<string,string>={};
let activeDocs:Record<string,string>={};

//community record
//community record,senderId
let communityRecord:Record<string,string>={};

//end of community record
//we will initialize it when we place call because if someone else place the call to
//same person we will emit sound like on another call busy
let activeCalls:Record<string,{with:string,status:string}>={};
io.on('connection',(socket)=>{
    console.log("connected:",socket.id);

    socket.on("join",(userId:string)=>{
        users[userId]=socket.id;
        io.emit("trigger_status",{userId,status:"online"});
        console.log("joined",userId)
    });
    profileSocket(socket,users,io);
    emojiOnMessages(socket,users,io);
    stories(socket,users,io);
    groupChat(socket,users,io,activeChats,activeGroupChats);
    registerPollSocketHandlers(socket,io,users,activeGroupChats);
    callHandlers(socket,io,users,activeCalls);
    channelsSocket(socket,io,users,activeChats,activeChannels);
    communitySocket(socket,io,communityRecord,users);
    groupCallSocket(socket,io,users,activeGroupChats);
    InCallSocket(socket,io,users,activeGroupChats);
    docsSocket(socket,io,users,activeChats,activeDocs);
    docsMessageSocket(socket,io,users,activeDocs);
    promptSocket(socket,io,users);
    socket.on("active_user",(data:{senderId:string,receiverId:string})=>{
        activeChats[data.senderId]=data.receiverId;
    });


    socket.on("active_group_user",(data:{senderId:string,groupId:string})=>{
        activeGroupChats[data.senderId]=data.groupId;
    });


    socket.on("not_active_user",(data:{senderId:string,receiverId:string})=>{
        delete activeChats[data.senderId];
    });

    socket.on("not_activeGroupChatUser",(data:{senderId:string,groupId:string})=>{
        delete activeGroupChats[data.senderId];
    });



    socket.on("active_channel_user",(data:{channelId:string,senderId:string})=>{
        activeChannels[data.senderId]=data.channelId;
    });


    socket.on("not_active_channel_user",(data:{channelId:string,senderId:string})=>{
        delete activeChannels[data.senderId];
    });


    socket.on("send_message",async(data)=>{
        try{
        const savedMessage=await PersonalChat(data);
        const update_last_message=await store_last_message({senderId:data.senderId,receiverId:data.receiverId,msg:data.msg,messageType:data.messageType,originalname:savedMessage?.originalname});
        const receiverSocketId=users[data.receiverId];
        const isSelfChat=data.senderId===data.receiverId;

        const buildChatListPayload=(status:{IsSend:boolean,isDelivered:boolean,isSeen:boolean})=>{
            if(!update_last_message)return null;
            return {
                ...update_last_message.toObject(),
                senderId:data.senderId,
                receiverId:data.receiverId,
                ...status,
            };
        };

        if(isSelfChat){
            socket.emit("receive_message",savedMessage);
            const markSeen=await markIsSeen({_id:savedMessage._id,senderId:savedMessage.senderId,receiverId:savedMessage.receiverId});
            socket.emit("real_time_isSeen",{messageId:markSeen?._id,senderId:markSeen?.senderId,receiverId:markSeen?.receiverId,isSeen:markSeen?.isSeen});
            const selfPayload=buildChatListPayload({IsSend:true,isDelivered:true,isSeen:true});
            if(selfPayload){
                socket.emit("chat_list_update",selfPayload);
            }
            return;
        }

        if(receiverSocketId){
            io.to(receiverSocketId).emit("receive_message",savedMessage);
            let status={IsSend:true,isDelivered:true,isSeen:false};
            if(activeChats[data.receiverId]===data.senderId){
                socket.emit("receive_message",savedMessage);
               const markSeen=await markIsSeen({_id:savedMessage._id,senderId:savedMessage.senderId,receiverId:savedMessage.receiverId});
               socket.emit("real_time_isSeen",{messageId:markSeen?._id,senderId:markSeen?.senderId,receiverId:markSeen?.receiverId,isSeen:markSeen?.isSeen});
               status={IsSend:true,isDelivered:true,isSeen:true};
            }else{
            socket.emit("receive_message",savedMessage);
            const msgDeliveredTick=await isDelivered({_id:savedMessage._id,senderId:savedMessage.senderId,receiverId:savedMessage.receiverId});
            socket.emit("isDelivered",{messageId:msgDeliveredTick._id,senderId:msgDeliveredTick.senderId,receiverId:msgDeliveredTick.receiverId,isDelivered:msgDeliveredTick.isDelivered})
            // to increase unseen count number
            io.to(receiverSocketId).emit("increase_unseen_count",{senderId:data.senderId});
        }
            //chat list update
            const payload=buildChatListPayload(status);
            if(payload){
                io.to(receiverSocketId).emit("chat_list_update",payload);
                socket.emit("chat_list_update",payload);
            }
            //chat list update end
        }else{
          // receiver offline: sirf single tick (sent), delivered nahi
          socket.emit("receive_message",savedMessage);
          const assignIsSend=await isSend({_id:savedMessage._id,senderId:savedMessage.senderId,receiverId:savedMessage.receiverId});
          socket.emit("isSend",{messageId:assignIsSend._id,senderId:assignIsSend.senderId,receiverId:assignIsSend.receiverId,isSend:assignIsSend.IsSend});
          const offlinePayload=buildChatListPayload({IsSend:true,isDelivered:false,isSeen:false});
          if(offlinePayload){
            socket.emit("chat_list_update",offlinePayload);
          }
        }
         await emitPendingCountToUser(data.receiverId, io, users);
        }catch(err){
            const error=err instanceof Error ?err.message:"Unknown Error"
            socket.emit("error_msg",error);
        }
    });




   //in data it contains userId
  socket.on("user_online",async(data:{userId:string})=>{
    try{
        const messages=await user_online({userId:data.userId});
        const grouped:Record<string,string[]>={};
        for(const message of messages){
            //make a box of it if it not exists
            if(!grouped[message.senderId]){
                grouped[message.senderId]=[];
            }
            grouped[message.senderId].push(message._id.toString());
        }
        for(const senderId in grouped){
            const senderSocketId=users[senderId];
            if(senderSocketId){
                //all message of particular user will be send to it
                io.to(senderSocketId).emit("isDelivered_mark",{messageIds:grouped[senderId],isDeliverd:true});
                // chat list ke ticks bhi delivered ho jaye
                io.to(senderSocketId).emit("chat_list_delivered",{senderId,receiverId:data.userId});
            }
        }
    }catch(err){
        const error=err instanceof Error ?err.message:"Unknown Error"
        socket.emit("error_msg",error);
    }
  });



  socket.on("user_open_chat",async(data:{senderId:string,receiverId:string})=>{
    try{
    const message=await user_open_chat({senderId:data.senderId,receiverId:data.receiverId});
    const receiverSocketId=users[data.receiverId];
    if(receiverSocketId){
        io.to(receiverSocketId).emit("isSeenStatus",{messageId:message,isSeen:true})
        // chat list ke ticks blue ho jaye (message data.receiverId ne bheje the, data.senderId ne dekh liye)
        io.to(receiverSocketId).emit("chat_list_seen",{senderId:data.receiverId,receiverId:data.senderId});
    }
    const senderSocketId=users[data.senderId];
    if(senderSocketId){
        socket.emit("unseen_count_zero",{senderId:data.receiverId,count:0});
    }
}catch(err){
      socket.emit("error_message",{message: "Something went wrong",});
}
  });







    socket.on("check_status",(receiverId)=>{
     if(users[receiverId]){
        socket.emit("trigger_status",{userId:receiverId,status:"online"});
     }else{
        socket.emit("trigger_status",{userId:receiverId,status:"offline"});
     }
    });

    //we receive receiver id here
    socket.on('user_last_visit',async(userId)=>{
    const lastvisit=await userlastpresence.findOne({userId});
    if (lastvisit){
        socket.emit("user_presence",{userId:lastvisit.userId,updatedAt:lastvisit.date});
    }
});

    //operations

    //delete for everyone logic
    socket.on("delete_from_everyone",async(data:{_id:string,senderId:string,receiverId:string})=>{
        try{
        await delete_from_everyone(data._id);
        const updateChatList=await update_chat_list({senderId:data.senderId,receiverId:data.receiverId});
        const receiverSocketId=users[data.receiverId];
        const isSelfChat=data.senderId===data.receiverId;
        // self chat me dobara emit nahi karna
        if(receiverSocketId && !isSelfChat){
            io.to(receiverSocketId).emit("deleted_everyone",{messageId:data._id,senderId:data.senderId,receiverId:data.receiverId})
            if(updateChatList){
                io.to(receiverSocketId).emit("chat_list_update",updateChatList);
            }
        }
        socket.emit("deleted_everyone",{messageId:data._id,senderId:data.senderId,receiverId:data.receiverId});
        if(updateChatList){
           socket.emit("chat_list_update",updateChatList);
        }


        //pin part
               const message=await allPinnedMessage({senderId:data.senderId,receiverId:data.receiverId});
                socket.emit("all_pinned",(message));
                if(receiverSocketId && !isSelfChat){
                    io.to(receiverSocketId).emit("all_pinned",(message));
                }
    }catch(err){
        console.log(err);
            socket.emit("error_msg",err);
        }
    });

    //update/edit
    socket.on("edit_message",async(data:{_id:string,senderId:string,receiverId:string,msg:string})=>{
        try{
        const editData=await edit({_id:data._id,msg:data.msg});
        const edittedData=await update_chat_list_edit({_id:data._id,senderId:data.senderId,receiverId:data.receiverId,msg:data.msg});
        const receiverSocketId=users[data.receiverId];
        const isSelfChat=data.senderId===data.receiverId;
        if(receiverSocketId && !isSelfChat){
            io.to(receiverSocketId).emit("message_edited",{messageId:data._id,senderId:data.senderId,receiverId:data.receiverId,msg:editData.message,isEdited:editData.isEdited});
        if(edittedData){
            io.to(receiverSocketId).emit("chat_list_update",edittedData);
        }
        }
        socket.emit("message_edited",{messageId:data._id,senderId:data.senderId,receiverId:data.receiverId,msg:editData.message,isEdited:editData.isEdited});
        if(edittedData){
            socket.emit("chat_list_update",edittedData);
        }
    }catch(err){
            socket.emit("error_msg",{msg:"fail it edit message"});
        }
    });

    //delete for me
    socket.on("delete_from_me",async(data:{_id:string,senderId:string,receiverId:string})=>{
        try{
          await delete_from_me({_id:data._id,senderId:data.senderId,receiverId:data.receiverId});
            // same socket pe do baar emit hota tha, ab sirf ek baar
            socket.emit('delete',{messageId:data._id,senderId:data.senderId,receiverId:data.receiverId});
        }catch(err){
            socket.emit("error_msg",{msg:"error in deleting message"});
        }
    });
    //operations end









    //last_message_start
    socket.on("last_message",async(data:{userId:string})=>{
        try{
            const allLastMessage=await get_last_message({userId:data.userId});
            socket.emit("all_last_message",allLastMessage);
        }catch(err){
        const error=err instanceof Error ?err.message:"Unknown Error"
        socket.emit("error_msg",error);
        }
    });
//last_message_end


     socket.on("unseen_message",async(data:{senderId:string})=>{
        const unseenMessage=await totalPendingMessage({userId:data.senderId});
        const senderId=users[data.senderId];
        if(senderId){
            socket.emit("unseen_message_count",unseenMessage);
        }
     });




//typing
     socket.on("user_typing",(data:{senderId:string,receiverId:string})=>{
        const receiverSocketId=users[data.receiverId];
        if(receiverSocketId){
            io.to(receiverSocketId).emit("user_start_typing",{senderId:data.senderId,receiverId:data.receiverId});
        }
     });
     socket.on("stop_typing",(data:{senderId:string,receiverId:string})=>{
        const receiverId=users[data.receiverId];
        if(receiverId){
            io.to(receiverId).emit("user_stop_typing",{senderId:data.senderId,receiverId:data.receiverId});
        }
     });







     socket.on("all_groups_of_sender",async(senderId:string)=>{
        try{
           const allGroups=await allGroupsOfSender(senderId);
           socket.emit("got_all_groups_of_sender",(allGroups));
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("err_msg",(error));
        }
     });

    socket.on('disconnect',async()=>{
        console.log("disconnected",socket.id);
        let disconnectUserId="";
        for(const id in users){
            if(users[id]===socket.id){
               const saveLastPresence=await userlastVisit({userId:id});
                io.emit("trigger_status",{userId:id,status:"offline"});
                io.emit("user_presence",saveLastPresence);
                disconnectUserId=id;
                delete users[disconnectUserId];
                //this 2 line are extra
                delete activeChats[disconnectUserId];
                delete activeGroupChats[disconnectUserId];
                delete communityRecord[disconnectUserId];


                const activeCall=activeCalls[disconnectUserId];
                if(activeCall){
                 const otherUserId=activeCall.with;
                 const otherUserSocketId=users[otherUserId];
                 delete activeCalls[disconnectUserId];
                 delete activeCalls[otherUserId];
                 if(otherUserSocketId){
                    io.to(otherUserSocketId).emit("call_ended",({senderId:disconnectUserId,receiverId:otherUserId}))
                 }
                }
                break;
            }
        }
    });
});
    }catch(err){
        throw err;
    }
}