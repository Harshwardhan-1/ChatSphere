import { channels } from "../models/channels.model";
import { channelMessage } from "../models/channels.message.model";
import type { createChannelMsgConfig } from "../types/channels.types";
import {Socket,Server} from 'socket.io';
import { storeLastMessage } from "./channels.lastmessage.controller";
import { update_last_message_delete } from "./channels.lastmessage.controller";
import { channel_last_message_edit } from "./channels.lastmessage.controller";
import { pollModel } from "../models/poll.model";
import { channelLastMessage } from "../models/channel.lastmessage.model";
import mongoose,{Types} from 'mongoose';
import { allUserChannel, showRandomChannels, toggleFollow } from "./channels.management.controller";
import { create } from "qrcode";








export const allPrevMessage=async(data:{channelId:string,senderId:string},socket:Socket)=>{
    try{
        const messages=await channelMessage.find({channelId:data.channelId,hideIt:{$nin:[data.senderId]}});
        socket.emit("got_all_prev_message",(messages));
    }catch(err){
        throw err;
    }
}



export const createMsg=async(data:createChannelMsgConfig,
    socket:Socket,io:Server,
    users:{[key:string]:string},
    activeChannels:Record<string,string>,
)=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("the channel don't exist or something went wrong");
        }
        const canSendMsg=channel.admin.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(!canSendMsg){
            throw new Error("Access Denied don't have persmission to send msg");
        }
        const create=await channelMessage.create({
            channelId:data.channelId,
            senderId:data.senderId,
            message:data.message,
            messageType:data.messageType,
            orignalname:data?.orignalname,
            mimetype:data?.mimetype,
            sizeInKb:data?.sizeInKb,
            sizeInMb:data?.sizeInMb,
            expiresAt:new Date(Date.now()+30*24*60*60*1000)
        });
        if(!create){
            throw new Error("failed to create Msg");
        }
        create.seenBy.push(new mongoose.Types.ObjectId(data.senderId));
        await create.save();

        const lastMsg=await storeLastMessage({
            channelId:data.channelId,
            senderId:data.senderId,
            msgId:create._id.toString(),
            message:data.message,
            messageType:data.messageType,
            orignalname:data?.orignalname,
            mimetype:data?.mimetype,
            sizeInKb:create?.sizeInKb || 0,
            sizeInMb:create?.sizeInMb || 0,
        });

        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            if(id===data.senderId.toString())continue;
            const checkNotification=channel.muteNotification.some(
                (mutedId)=>mutedId.toString()===id.toString()
            );
            let sound="off";
            if(!checkNotification){
                sound="on";
            }
            const receiverSocketId=users[id];

            if(activeChannels[id]===data.channelId){
                create.seenBy.push(new mongoose.Types.ObjectId(id));
            }
            await create.save();

            if(receiverSocketId){
                io.to(receiverSocketId).emit("channel_receive_message",({...create.toObject(),notificationSound:sound}));
                io.to(receiverSocketId).emit("update_channel_chatlist",(lastMsg));
                const receiverSocketInstance=io.sockets.sockets.get(receiverSocketId);
                if(receiverSocketInstance){
                    await allPendingChannelMessage({senderId:id},receiverSocketInstance);
                }
            }
        }
        socket.emit("channel_receive_message",(create));
        socket.emit("update_channel_chatlist",(lastMsg));
    }catch(err){
        throw err;
    }
}








//here delete msg from everyone it is
export const deleteMsg=async(data:
    {channelId:string,senderId:string,msgId:string}
    ,socket:Socket,io:Server,users:{[key:string]:string},
)=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("channel not exist");
        }
        const msg=await channelMessage.findById(data.msgId);
        if(!msg){
            throw new Error("msg not found");
        }
        if(msg.senderId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to delete this message");
        }
        await msg.deleteOne();
        const update_last_message=await update_last_message_delete({channelId:data.channelId,senderId:data.senderId});
        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            const receiverSocketId=users[id];
            if(id===data.senderId.toString())continue;
            if(receiverSocketId){
                io.to(receiverSocketId).emit("deleted_channel_msg",({channelId:data.channelId,msgId:data.msgId})); 
                io.to(receiverSocketId).emit("update_channel_chatlist",(update_last_message));
            }
        }
        socket.emit("deleted_channel_msg",({channelId:data.channelId,msgId:data.msgId}));
        socket.emit("update_channel_chatlist",(update_last_message));
    }catch(err){
        throw err;
    }
}







//we have to show delete for me message only to admin not to anyone
export const delete_msg_from_me=async(data:{channelId:string,senderId:string,msgId:string},socket:Socket)=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("channel not found");
        }
        const msg=await channelMessage.findById(data.msgId);
        if(!msg){
            throw new Error("msg not found");
        }
        msg.hideIt.push(data.senderId);
        await msg.save();
        socket.emit("delete_channel_msg",({channelId:data.channelId,msgId:data.msgId}));
    }catch(err){
        throw err;
    } 
}




export const msgEditted=async(data:
    {channelId:string,senderId:string,msgId:string,message:string},
    socket:Socket,io:Server,users:{[key:string]:string},
)=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("channel not found");
        }
        const msg=await channelMessage.findById(data.msgId);
        if(!msg){
            throw new Error("msg not found");
        }
        if(msg.senderId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to edit this message");
        }
        msg.message=data.message;
        await msg.save();
        const updated=await channel_last_message_edit({channelId:data.channelId,msgId:data.msgId,senderId:data.senderId,message:data.message});
        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            if(id===data.senderId.toString())continue;
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("channel_msg_updated",({channelId:data.channelId,msg}));
                //chat list update
                if(updated){
                io.to(receiverSocketId).emit("update_channel_chatlist",(updated));
            }
            }
        }
        socket.emit("channel_msg_updated",({channelId:data.channelId,msg}));
        if(updated){
        socket.emit("update_channel_chatlist",(updated));
        }
    }catch(err){
        throw err;
    }
}









//all pending channel list message


export const allPendingChannelMessage=async(data:{senderId:string},socket:Socket)=>{
    try{
        let response=[];
        const channel=await channels.find({followers:data.senderId});

        for(let i=0;i<channel.length;i++){
            const id=channel[i]._id.toString();
            const msg=await channelMessage.find({channelId:id});
            let count=0;
            for(let j=0;j<msg.length;j++){
                const isNotSeen=msg[j].seenBy.some(
                    (id=>id.toString()===data.senderId.toString())
                );
                if(!isNotSeen){
                    count++;
                }
            }
            response.push({id,count});
        }
        socket.emit("all_pending_channel_message",(response));
    }catch(err){
        throw err;
    }
}












//user open chanel push in all the message that user has seen that and then 
//emit all pending message then





export const userOpenChannelPage=async(data:{channelId:string,senderId:string},socket:Socket)=>{
    try{
        await channelMessage.updateMany(
            {
                channelId:data.channelId,
                seenBy:{$ne:new mongoose.Types.ObjectId(data.senderId)}
            },
            {
                $addToSet:{seenBy:new mongoose.Types.ObjectId(data.senderId)},
            }
        );
        
        await allPendingChannelMessage({senderId:data.senderId},socket);
    }catch(err){
        throw err;
    }
}









export const reaction=async(data:
    {channelId:string,msgId:string,senderId:string,emoji:string},
    socket:Socket,io:Server,users:{[key:string]:string},activeChannels:Record<string,string>
)=>{
    try{
        const [channel,msg]=await Promise.all([
            channels.findById(data.channelId),
            channelMessage.findById(data.msgId),
        ]);
        if(!channel){
            throw new Error("channel not found");
        }
        if(!msg){
            throw new Error("msg not found");
        }
        const check=msg.reaction.find(
            (id)=>id.userId.toString()===data.senderId.toString()
        );
        if(check){
            if(check.emoji===data.emoji){
            msg.reaction=msg.reaction.filter(
               (id)=>id.userId.toString()!==data.senderId.toString()
            );
          }else{
            check.emoji=data.emoji;
          }
        }else{
            msg.reaction.push({userId:new mongoose.Types.ObjectId(data.senderId),emoji:data.emoji});
        }
        await msg.save();
        const notifyIds=new Set<string>();
        channel.followers.forEach((id)=>notifyIds.add(id.toString()));
        channel.admin.forEach((id)=>notifyIds.add(id.toString()));
        notifyIds.delete(data.senderId.toString());
        for(const id of notifyIds){ 
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("update_channel_emoji_reaction",(msg));
            }
        }
        socket.emit("update_channel_emoji_reaction",(msg));
    }catch(err){
        throw err;
    }
}







//all emoji group 



export const groupEmoji=async(data:{channelId:string,msgId:string,senderId:string},socket:Socket)=>{
    try{
        const [channel,msg]=await Promise.all([
            channels.findById(data.channelId),
            channelMessage.findById(data.msgId),
        ]);
        if(!channel){
            throw new Error("channel not found");
        }
        if(!msg){
            throw new Error("msg not found");
        }
        interface info{
            emoji:string,
            count:number,
        };
        const map:Record<string,info>={};
        for(let i=0;i<msg.reaction.length;i++){
            const {userId,emoji}=msg.reaction[i];

            if(!map[emoji]){
                map[emoji]={emoji,count:1};
            }else{
                map[emoji].count++;
            }
        }
        const react=Object.values(map);
        socket.emit("all_channels_groupEmoji",({...msg.toObject(),Object,react}));
    }catch(err){
        throw err;
    }
}














//channels pole create
export const createChannelPole=async(data:
    {channelId:string,senderId:string,title:string,canSelectMultiple:boolean,
        pollData:{msg:string,peoplesId:Types.ObjectId[]}[],},
        socket:Socket,io:Server,users:{[key:string]:string},
        activeChannels:Record<string,string>
    )=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("channel not found");
        }
        const id=new mongoose.Types.ObjectId(data.channelId);
        const create=await pollModel.create({
            channelId:id,
            title:data.title,
            senderId:data.senderId,
            canSelectMultiple:data.canSelectMultiple,
            options:data.pollData,
        });
        if(!create){
            throw new Error("fail to create pole");
        }
              const msg=await channelMessage.create({
                    channelId:data.channelId,
                    senderId:data.senderId,
                    message:create._id.toString(),
                    messageType:"poll",
                    expiresAt:new Date(Date.now()+30*24*60*60*1000)
                });
                if(!msg){
                    throw new Error("failed to create message");
                }
                
        const lastMessage=await storeLastMessage({
            channelId:data.channelId,
            senderId:data.senderId,
            msgId:msg._id.toString(),
            message:"poll",
            messageType:"poll",
            sizeInKb:msg?.sizeInKb || 0,
            sizeInMb:msg?.sizeInMb || 0,
        });
        
        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            if(id===data.senderId.toString())continue;
            const receiverSocketId=users[id];
            const active=activeChannels[id]===data.channelId.toString();
            if(receiverSocketId && active){
                io.to(receiverSocketId).emit("channel_pole_created",(create));
                msg.seenBy.push(new mongoose.Types.ObjectId(id));
                await msg.save();
                await allPendingChannelMessage({senderId:id},socket)
            }
            if(receiverSocketId){
                io.to(receiverSocketId).emit("update_channel_chatlist",(lastMessage));
            }
        }
        socket.emit("channel_pole_created",(create));
        socket.emit("update_channel_chatlist",(lastMessage));
        await allPendingChannelMessage({senderId:data.senderId},socket);
    }catch(err){
        throw err;
    }
}







//delete channel pole
export const deleteChannelPole=async(data:
    {channelId:string,senderId:string,msgId:string},
    socket:Socket,io:Server,users:{[key:string]:string},
    activeChannels:Record<string,string>
)=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("channel not found");
        }
        const msg=await channelMessage.findById(data.msgId);
        if(!msg){
            throw new Error("msg not found");
        }
        if(msg.senderId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to delete this pole");   
        }
        await msg.deleteOne();

        const lastMsg=await update_last_message_delete({channelId:data.channelId,senderId:data.senderId});

        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            if(id===data.senderId.toString())continue;
            const receiverSocketId=users[id];
            if(receiverSocketId && activeChannels[id]===data.channelId.toString()){
                io.to(receiverSocketId).emit("deleted_channel_msg",({channelId:data.channelId,msgId:data.msgId}));
                io.to(receiverSocketId).emit("update_channel_chatlist",(lastMsg))
            }
        }
        socket.emit("deleted_channel_msg",({channelId:data.channelId,msgId:data.msgId}));
        socket.emit("update_channel_chatlist",(lastMsg));
    }catch(err){
        throw err;
    }
}











export const editTitle=async(data:
    {channelId:string,senderId:string,msgId:string,title:string},
    socket:Socket,io:Server,users:{[key:string]:string},
    activeChannels:Record<string,string>
)=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("channel not found");
        }
        const msg=await channelMessage.findById(data.msgId);
        if(!msg){
            throw new Error("msg not found");
        }
        if(msg.senderId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to edit message");
        }
        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            const receiverSocketId=users[id];
            if(id===data.senderId.toString())continue;
            if(receiverSocketId && activeChannels[id]===data.channelId.toString()){
                io.to(receiverSocketId).emit("channel_pole_updated",({channelId:data.channelId,msgId:data.msgId,title:data.title}))
            }
        }
        socket.emit("channel_pole_updated",({channelId:data.channelId,msgId:data.msgId,title:data.title}));
    }catch(err){
        throw err;
    }
}

export const getChannelPoll=async(data:{ 
    channelId:string; 
    pollId: string
 }, socket: Socket)=>{
  const poll=await pollModel.findById(data.pollId);
  if (!poll)throw new Error("poll not found");
  socket.emit("channel_poll_details", poll);
};







//this is what where user can select only single option in pole
//cannot select multiple //poll id is basically the options that user select
export const toggleLike=async(data:
    {channelId:string,senderId:string,msgId:string,pollId:string},
    socket:Socket,io:Server,users:{[key:string]:string},
    activeChannels:Record<string,string>
)=>{
    try{
        const [channel,msg]=await Promise.all([
            channels.findById(data.channelId),
            channelMessage.findById(data.msgId),
        ]);
        if(!channel){
            throw new Error("channel not found");
        }
        if(!msg){
            throw new Error("msg not found");
        }
        const poll=await pollModel.findById(msg.message);
        if(!poll){
            throw new Error("poll not found");
        }
        for(const opt of poll.options){
            if(opt._id.toString()!==data.pollId.toString()){
                opt.peoplesId=opt.peoplesId.filter(
                    (id)=>id.toString()!==data.senderId.toString()
                );
            }
        }
        await poll.save();
        const isSameId=poll.options.find(
            (o)=>o._id.toString()===data.pollId.toString()
        );
        if(isSameId){
            const checkAlreadyToggle=isSameId.peoplesId.some(
                (id)=>id.toString()===data.senderId.toString()
            );
            if(checkAlreadyToggle){
                isSameId.peoplesId=isSameId.peoplesId.filter(
                    (id)=>id.toString()!==data.senderId.toString()
                );
            }else{
                isSameId.peoplesId.push(new mongoose.Types.ObjectId(data.senderId));
            }
        }
        await poll.save();
        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            const receiverSocketId=users[id];
            const active=activeChannels[id]===data.channelId;
            if(id===data.senderId.toString())continue;
            if(receiverSocketId && active){
                io.to(receiverSocketId).emit("channel_poll_updated",(poll));
            }
        }
        socket.emit("channel_poll_updated",(poll));
    }catch(err){
        throw err;
    }
}










//users can click on multiple option
export const toggleLikeMultiple=async(data:
    {channelId:string,senderId:string,msgId:string,pollId:string},
    socket:Socket,io:Server,users:{[key:string]:string},
    activeChannels:Record<string,string>
)=>{
    try{
        const [channel,msg]=await Promise.all([
            channels.findById(data.channelId),
            channelMessage.findById(data.msgId),
        ]);
        if(!channel){
            throw new Error("channel not found");
        }
        if(!msg){
            throw new Error("msg not found");
        }
        const poll=await pollModel.findById(msg.message);
        if(!poll){
            throw new Error("poll not found");
        }
        const getPoll=poll.options.find(
            (o)=>o._id.toString()===data.pollId.toString()
        );
        if(getPoll){
            const check=getPoll.peoplesId.some(
                (id)=>id.toString()===data.senderId.toString()
            );
            if(check){
                getPoll.peoplesId=getPoll.peoplesId.filter(
                    (id)=>id.toString()!==data.senderId.toString()
                );
            }else{
                getPoll.peoplesId.push(new mongoose.Types.ObjectId(data.senderId));
            }
        }
        await poll.save();
        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            const receiverSocketId=users[id];
            const active=activeChannels[id]===data.channelId.toString();
            if(id===data.senderId.toString())continue;
            if(receiverSocketId && active){
                io.to(receiverSocketId).emit("channel_poll_updated",(poll));
            }
        }
        socket.emit("channel_poll_updated",(poll));
    }catch(err){
        throw err;
    }
}


export const getAllChannelLastMessageStored=async(data:{senderId:string},socket:Socket)=>{
    try{
        const followedChannels=await channels.find({
            $or:[
                {followers:data.senderId},
                {admin:data.senderId},
            ],
        });
        const response=[];
        for (let i=0;i<followedChannels.length;i++){
            const channelId = followedChannels[i]._id.toString();
            const lastMessageOfChannel=await channelLastMessage.findOne({channelId}).sort({updatedAt:-1});
            if (lastMessageOfChannel){
                response.push({channelId,lastMessageOfChannel});
            }
        }
        socket.emit("all_last_message_of_channels",response);
    }catch(err){
        throw err;
    }
};












export const checkFollowing=async(data:{channelId:string,senderId:string},socket:Socket)=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("channel not found");
        }
        const isInFollowers=channel.followers.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        let channelCreator="";
        if(channel.channelCreator.toString()===data.senderId.toString()){
            channelCreator="yes";
        }else{
            channelCreator="no";
        }
        if(isInFollowers){
            socket.emit("channel_following",(
                {channelId:data.channelId,senderId:data.senderId,msg:"Following",channelCreator:channelCreator}
            ));
        }else{
            socket.emit("channel_following",(
                {channelId:data.channelId,senderId:data.senderId,msg:"Not Following",channelCreator:channelCreator}
            ));
        }
    }catch(err){
        throw err;
    }
}











export const updateFollowersCount=async(data:
    {channelId:string,senderId:string},
    socket:Socket,io:Server,users:{[key:string]:string}
)=>{
    try{
        const channel=await channels.findById(data.channelId);
        if(!channel){
            throw new Error("channel not found");
        }
        await toggleFollow({_id:data.channelId,senderId:data.senderId},socket,io,users);
        const updateChannel=await channels.findById(data.channelId);
        if(!updateChannel){
            throw new Error("channel not found");
        }
        await allUserChannel({senderId:data.senderId},socket);
        await getAllChannelLastMessageStored({senderId:data.senderId},socket);
        await checkFollowing({channelId:data.channelId,senderId:data.senderId},socket);
        await showRandomChannels({senderId:data.senderId},socket,io,users);


        const followersCount=updateChannel.followers.length;
        for(let i=0;i<channel.followers.length;i++){
            const id=channel.followers[i].toString();
            const receiverSocketId=users[id];
            if(id===data.senderId.toString())continue;
            if(receiverSocketId){
                io.to(receiverSocketId).emit("channel_followers_update_toggle",({channelId:data.channelId,count:followersCount}));
            }   
        }
        socket.emit("channel_followers_update_toggle",({channelId:data.channelId,count:followersCount}));

        for(let i=0;i<channel.admin.length;i++){
            const id=channel.admin[i].toString();
            const receiverSocketId=users[id];
            if(id===data.senderId.toString())continue;
            if(receiverSocketId){
              io.to(receiverSocketId).emit("channel_followers_update_toggle",({channelId:data.channelId,count:followersCount}));
            }
        }
        socket.emit("channel_followers_update_toggle",({channelId:data.channelId,count:followersCount}));
    }catch(err){
        throw err;
    }
}