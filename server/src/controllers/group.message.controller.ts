import { 
    clearChatConfig,
createGroupMessageConfig,
messageAction,
messageInfoConfig,
seenByConfig,
deleiveredToConfig,
groupLastMessageConfig,
} from "../types/group.message.types";
import { groupMessage } from "../models/group.message.model";
import { groupDisappearingMessageModel } from "../models/disappearing.message.model";
import { durationtoMs } from "../helper/durationtoMs";
import { muteGroupNotificationModel } from "../models/mute.notification.model";
import { groupChatModel } from "../models/group.create.model";
import { groupFavourites } from "../models/favourites.model";
import { fail } from "../helper/AppError";
import { Socket,Server } from "socket.io";
import mongoose from 'mongoose';
import { groupLastMessage } from "../models/group.conversion.model";
import { getMuteExpiry } from "../helper/durationtoMs";
import { storeGroupLastMessage, update_group_chatlist_delete, updateGroupChatListEdit } from "./group.lastMessage.controller";


//group message is which we send message to person ok
//here _id is the group id 
export const createMessage=async(
    data:createGroupMessageConfig,
)=>{
    try{
        const [group,checkDuration,muteGroupNotification]=await Promise.all([
            groupChatModel.findById(data._id),
            groupDisappearingMessageModel.findById(data._id),
            muteGroupNotificationModel.findOne({groupId:data._id,senderId:data.senderId})
        ]); 
        if(!group){
            throw new Error("group not find");
        }
        if(group.onlyAdminSendMessage){
        //here check if it is admin or not
        //because if admin turn on only admin can send message option we have to decline this
        const isAdmin=group.admin.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(!isAdmin){
            fail("only admin can send message");
        }
        }

        let duration=null;
        if(checkDuration){
           duration=durationtoMs(checkDuration.duration);
        }

       


        const createGroupMessage=await groupMessage.create({
            groupId:group._id,
            senderId:data.senderId,
            message:data.message,
            messageType:data.messageType,
            fileUrl:data?.fileUrl,
            mimetype:data?.mimetype,
            filename:data?.filename,
            orignalname:data?.originalname,
            sizeInKb:Number(data?.sizeInKb ?? 0),
            sizeInMb:Number(data?.sizeInMb ?? 0),
            expiresAt:duration?new Date(Date.now()+duration):null,
        });
        if(!createGroupMessage){
            throw new Error("failed to create message");
        }
         createGroupMessage.isSend=true;
         const id=new mongoose.Types.ObjectId(data.senderId);
         createGroupMessage.seenBy.push(id);
         createGroupMessage.deliveredTo.push(id);
         await createGroupMessage.save();
         await storeGroupLastMessage({
            groupId:createGroupMessage.groupId.toString(),
            senderId:data.senderId,
            msgId:createGroupMessage._id.toString(),
            message:createGroupMessage.message,
            messageType:createGroupMessage.messageType,
            filename:createGroupMessage?.filename,
            orignalname:createGroupMessage?.orignalname,
            mimetype:createGroupMessage?.mimetype,
         },group);
        return createGroupMessage;
    }catch(err){
        console.log(err);
        throw err;
    }
}




 


// this is basically delete for everyone query
export const deleteMessageFromEveryone=async(data:
    {_id:string,msgId:string,senderId:string},
    socket:Socket,io:Server,users:{[key:string]:string},
    activeGroupChats:Record<string,string>
)=>{
    try{

        const [group,msg]=await Promise.all([
            groupChatModel.findById(data._id),
            groupMessage.findById(data.msgId),
        ]);
        if(!group){
            fail("group not found");
            return;
        }
        if(!msg){
            fail("message is already deleted or technical error at our end");
            return;
        }
        if(msg.senderId.toString()!==data.senderId.toString()){
            fail("don't have access to delete the message");
            return;
        }
        await msg.deleteOne();
        for(let i=0;i<group.peoplesId.length;i++){
            const id=group.peoplesId[i].toString();


            if(!activeGroupChats[id])continue;
            
            const isOnSameChat=activeGroupChats[id]===group._id.toString();
            const receiverSocketId=users[id];
            if(isOnSameChat && receiverSocketId){
            const allMsg=await groupMessage.find({groupId:data._id,hideIt:{$nin:[id]}});
                io.to(receiverSocketId).emit("delete_message_db",(allMsg));
            }
        }
        const allMsg=await groupMessage.find(
            {groupId:data._id,hideIt:{$nin:[data.senderId]}
            }).sort({createdAt:1});
        socket.emit("delete_message_db",(allMsg));

        await update_group_chatlist_delete({_id:data._id,senderId:data.senderId},socket,io,users,group)
    }catch(err){
        console.log(err);
        throw err;
    }
}
























export const delete_msg_from_everyone=async(data:
    {groupId:string,senderId:string,msgIds:string[]},
    socket:Socket,io:Server,
    users:{[key:string]:string}
)=>{
    try{
        const group=await groupChatModel.findById(data.groupId);
        if(!group){
            throw new Error("group not found");
        }
        for(let i=0;i<data.msgIds.length;i++){
            const msg=await groupMessage.findById(data.msgIds[i]);
            if(!msg || msg.senderId.toString()!==data.senderId.toString())continue;
            await msg.deleteOne();
        }
        for(let i=0;i<group.peoplesId.length;i++){
            const receiverSocketId=users[group.peoplesId[i].toString()];
            if(group.peoplesId[i].toString()===data.senderId.toString()){
                continue;
            }
           const allMsg=await groupMessage.find({groupId:data.groupId,hideIt:{$nin:[group.peoplesId[i].toString()]}});
            if(receiverSocketId){
                io.to(receiverSocketId).emit("group_messages_deleted_from_db",(allMsg));
            }
        }
        const allMsg=await groupMessage.find({groupId:data.groupId,hideIt:{$nin:[data.senderId.toString()]}});
        socket.emit("group_messages_deleted_from_db",(allMsg));


        //group chat list update
        await update_group_chatlist_delete({_id:data.groupId,senderId:data.senderId},socket,io,users,group);
    }catch(err){
        throw err;
    }
}









//edit message
export const editGroupMessage=async(
    data:messageAction,socket:Socket,io:Server,
    users:{[key:string]:string},
    activeGroupChats:Record<string,string>
)=>{
    try{
        const [group,msg]=await Promise.all([
            groupChatModel.findById(data._id), 
            groupMessage.findById(data.msgId),
        ]);
        if(!group){
            throw new Error("group not found");
        }
        if(!msg){
            throw new Error("msg not found");
        }
        if(msg.messageType!=="text"){
            throw new Error("only text message can be edited");
        }
        if(msg.senderId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to edit this");
        }
         msg.message=data.message;
         msg.isEdited=true;
         await msg.save();
         await msg.populate("senderId","name avatar");
         for(let i=0;i<group.peoplesId.length;i++){
            const id=group.peoplesId[i].toString();
            if(!activeGroupChats[id])continue;
            const activeChats=activeGroupChats[id]===msg.groupId.toString();
            const receiverId=users[id];
            if(activeChats && receiverId){
                io.to(receiverId).emit("group_message_edited",(msg));
            }
         }
         socket.emit("group_message_edited",(msg));
         await updateGroupChatListEdit({_id:group._id.toString(),msgId:msg._id.toString(),senderId:data.senderId},socket,io,users,group);
    }catch(err){
        console.log(err);
        throw err;
    }
}





//this is basically hide from senderId side 
export const deleteFromMe=async(data:messageAction)=>{
    try{
        const [group,msg]=await Promise.all([
            groupChatModel.findById(data._id),
            groupMessage.findById(data.msgId),
        ]);
        if(!group){
            fail("group not found");
            return;
        }
        if(!msg){
            fail("message not found");
            return;
        }
        msg.hideIt.push(data.senderId);
        await msg.save();
    }catch(err){
        console.log(err);
        throw err;
    }
}


//delete for me multiple messages delete for me


export const delete_from_me=async(data:{groupId:string,senderId:string,receiverId:string,msgIds:string[]},socket:Socket)=>{
    try{
        for(let i=0;i<data.msgIds.length;i++){
            const msg=await groupMessage.findById(data.msgIds[i]);
            if(!msg)continue;
            msg.hideIt.push(data.senderId);
            await msg.save();
        }
        const allMessages=await groupMessage.find({groupId:data.groupId,hideIt:{$nin:[data.senderId]}});
        socket.emit("msg_delete_from_user_side_groupChat",(allMessages));
    }catch(err){
        throw err;
    }
}


//clear chat
export const clearChat=async(data:clearChatConfig)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
            return;
        }
        //taking a little bit longer time
        // const findByGroupId=await groupMessage.find({groupId:data._id});
        // for(let i=0;i<findByGroupId.length;i++){
        //     findByGroupId[i].hideIt.push(data.senderId);
        //     await findByGroupId[i].save();
        // }
    



        //after this we have to emit again from frontend chat clear message
        await groupMessage.updateMany(
            {groupId:data._id},
            {$addToSet:{hideIt:data.senderId}},
        );
    }catch(err){
        throw err;
    }
}


// export const afterClearChat=async(data:{_id:string,senderId:string})=>{
// try{
// const group=await groupChatModel.findById(data._id);
// if(!group){
//     throw new Error("group not found");
// }
// const msg=await groupMessage.find({groupId:data._id,hideIt:{$nin:[data.senderId]}});
// return msg;
// }catch(err){
//     throw err;
// }
// }









//here we will write about basic info about message seen deleiveredTo

export const messageInfo=async(data:messageInfoConfig)=>{
    try{
        const [group,msg]=await Promise.all([
            groupChatModel.findById(data._id),
            groupMessage.findById(data.msgId),
        ]);        
        if(!group){
            fail("group not found");
            return;
        }
        if(!msg){
            fail("msg info not found");   
            return;
        }
        await msg.populate("deliveredTo","name avatar");
        await msg.populate("seenBy","name avatar");
        const uniqueDeliveredTo = Array.from(
            new Map(msg.deliveredTo.map((u:any)=>[u._id.toString(), u])).values()
        );
        const uniqueSeenBy = Array.from(
            new Map(msg.seenBy.map((u:any)=>[u._id.toString(), u])).values()
        );

        let seenBy=0,delivered=0;
        for(let i=0;i<group.peoplesId.length;i++){
            const peoplesId=group.peoplesId[i].toString(); 
            if(uniqueDeliveredTo.some((user:any)=>user._id.toString()===peoplesId.toString())) delivered++;
            if(uniqueSeenBy.some((user:any)=>user._id.toString()===peoplesId.toString())) seenBy++;
        }
         return {
            _id: msg._id,
            message: msg.message,
            messageType: msg.messageType,
            deliveredTo: uniqueDeliveredTo,
            seenBy: uniqueSeenBy,
            deliveredRemaining: group.peoplesId.length - delivered,
            seenRemaining: group.peoplesId.length - seenBy,
        };
    }catch(err){
        throw err;
    }
}







export const seenByy=async(data:{_id:string,senderId:string},socket:Socket,io:Server,users:{[key:string]:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        const id=new mongoose.Types.ObjectId(data.senderId);

        // atomic - duplicate kabhi push nahi hoga
        await groupMessage.updateMany(
            {groupId:data._id},
            {$addToSet:{seenBy:id}}
        );

        const groupPersonsLength=group.peoplesId.length;

        await groupMessage.updateMany(
            {groupId:data._id,$expr:{$eq:[{$size:"$seenBy"},groupPersonsLength]}},
            {$set:{isSeen:true}}
        );

        const msg=await groupMessage.find({groupId:data._id});

        for(let i=0;i<group.peoplesId.length;i++){
            const pid=group.peoplesId[i].toString();
            const receiverSocketId=users[pid];
            if(pid===data.senderId.toString())continue;
            if(receiverSocketId){
                io.to(receiverSocketId).emit("group_message_seen",(msg));
            }
        }
        socket.emit("group_message_seen",(msg))
    }catch(err){
        throw err;
    }
}


export const delieveredTo=async(
    data:{senderId:string},
    users:{[key:string]:string},
    socket:Socket,io:Server,
    activeGroupChats:Record<string,string>
)=>{
    try{
        const findAllGroups=await groupChatModel.find({peoplesId:data.senderId});
        const id=new mongoose.Types.ObjectId(data.senderId);

        for(let i=0;i<findAllGroups.length;i++){
            const groupId=findAllGroups[i]._id;
            const totalMembersInGroup=findAllGroups[i].peoplesId.length;

            await groupMessage.updateMany(
                {groupId:groupId},
                {$addToSet:{deliveredTo:id}}
            );

            await groupMessage.updateMany(
                {groupId:groupId,$expr:{$eq:[{$size:"$deliveredTo"},totalMembersInGroup]}},
                {$set:{isDelivered:true}}
            );

            const allMessages=await groupMessage.find({groupId:groupId});

            for(let k=0;k<findAllGroups[i].peoplesId.length;k++){
                const pid=findAllGroups[i].peoplesId[k].toString();
                const receiverId=users[pid];
                if(receiverId){
                    io.to(receiverId).emit("group_message_delivered",(allMessages));
                }
            }
        }
    }catch(err){
        throw err;
    }
}



//total pending message of all group in which user has joined which we have to show on chatlist


export const allNotSeenMessage=async(data:{senderId:string})=>{
    try{
        const group=await groupChatModel.find({peoplesId:data.senderId});
        const record:Record<string,number>={};
        for(let i=0;i<group.length;i++){
            const allMessages=await groupMessage.find({groupId:group[i]._id});
            let count=0;
            for(let i=0;i<allMessages.length;i++){
                const findUserId=allMessages[i].seenBy.some(
                    (id)=>id.toString()===data.senderId.toString()
                );
                if(!findUserId){
                    count++;
                }
            }
            //now here push some how logic groupId and count
            const groupId=group[i]._id.toString();
            record[groupId]=count;
        }
        return record;
    }catch(err){
        throw err;
    }
}






//add group to favourites

export const addToFavourites=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
        }
        const checkFav=await groupFavourites.findOne({groupId:data._id,senderId:data.senderId});
        if(!checkFav){
            const groupId=new mongoose.Types.ObjectId(data._id);
            const id=new mongoose.Types.ObjectId(data.senderId);


            const create=await groupFavourites.create({
                groupId,
                senderId:id,
                isMarkedAsFavourites:true,
            });
            if(!create){
                fail("fail to add into favourites"); 
            }
            return create;
        }else{
            const favourites=await groupFavourites.findOne({groupId:data._id,senderId:data.senderId});
            if(favourites){
                if(favourites.isMarkedAsFavourites){
                  favourites.isMarkedAsFavourites=!favourites.isMarkedAsFavourites;
                  await favourites.save();
                  return "Remove from favourites";
                }else{
                    favourites.isMarkedAsFavourites=!favourites.isMarkedAsFavourites;
                    await favourites.save();
                    return "Add to favourites";
                }
            }
        }
    }catch(err){
        throw err;
    }
}






//only person who create group can see favourites

export const showFavourites=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
        }
        if(group?.groupCreatorId.toString()!==data.senderId){
            fail("you don't have access to view the favourites in the group");
        }
        const findFavourites=await groupFavourites.find({groupId:data._id}).populate("senderId","name avatar");
        if(findFavourites.length==0){
            return;
        }else{
            return findFavourites;
        }
    }catch(err){
        throw err;
    }
}








//mute notification
//groupId and senderId
//whenever user click on mute notification we fetch latest mute notification
//that is set by user
export const muteNotificattion=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
            return "off";
        }
        const findMuteNotification=await muteGroupNotificationModel.
        findOne({groupId:data._id,senderId:data.senderId});

        if(findMuteNotification){
            const now=Date.now();
            if(findMuteNotification.duration!=="off" && findMuteNotification.duration!=="always"
                &&  findMuteNotification.mutedUntil!==null  && now>=findMuteNotification.mutedUntil.getTime()){

                    findMuteNotification.duration="off";
                    findMuteNotification.mutedUntil=null;
            }
            await findMuteNotification.save();
           return findMuteNotification.duration; 
        }
        return "off";
    }catch(err){
        throw err;
    }
}


export const changedMuteNotificationSetting=async(data:{_id:string,senderId:string,duration:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
            return;
        }
         const expiry = getMuteExpiry(data.duration);
        const changeSetting=await muteGroupNotificationModel.findOne({groupId:data._id,senderId:data.senderId});
        if(!changeSetting){
            const create=await muteGroupNotificationModel.create({
                groupId:data._id,
                senderId:data.senderId,
                duration:data.duration,
                mutedUntil:expiry,
            });
            if(!create){
                fail("fail to create mute notification model");
            }
            return create.duration;
        }else{
            changeSetting.duration=data.duration;
            changeSetting.mutedUntil=expiry;
            await changeSetting.save();
            return changeSetting.duration;
        }
    }catch(err){
        throw err;
    }
}






//extra flag for disappearing value

export const canChange=async(data:
    {_id:string,senderId:string},
    socket:Socket,io:Server,
    users:{[key:string]:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        if(group.changeDisappearingMessageSetting){
            socket.emit("can_update_disappearing_message");
        }else{
            const checkAdmin=group.admin.some(
            (id)=>id.toString()===data.senderId.toString()
            );
            if(!checkAdmin){
                socket.emit("cannot_update_disappearing_message");
                return;
            }
            socket.emit("can_update_disappearing_message");
        }
    }catch(err){
        throw err;
    }
}






//disappearing message
//if admin has mark it false then on client side w have ti show disable option


//here we have to store message on chat message type system and then emit it


export const changeGroupDisappearingMessageSetting=async(data:
    {_id:string,senderId:string,duration:string},
    socket:Socket,io:Server,users:{[key:string]:string},
    activeGroupChats:Record<string,string>
)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
            return;
        }
        if(group.changeDisappearingMessageSetting){
            const checkDurationExist=await groupDisappearingMessageModel.findOne({groupId:data._id});
            if(!checkDurationExist){
                const create=await groupDisappearingMessageModel.create({
                    groupId:data._id,
                    senderId:data.senderId,
                    duration:data.duration,
                });
                //return create;
                //create message
                const detailData=create;
               const userDetail=await detailData.populate("senderId","name avatar");
               const nameInfo=userDetail.senderId as any;
                const msg=await groupMessage.create({
                    groupId:data._id,
                    senderId:data.senderId,
                    message:`${nameInfo.name} change the group setting to ${create.duration}`,
                    messageType:"system",
                });
                //here we have to emit to all who are online we will wroye that logic
                for(let i=0;i<group.peoplesId.length;i++){
                    const id=group.peoplesId[i].toString();
                    const receiverId=users[id];
                    if(receiverId){
                        io.to(receiverId).emit("receive_group_message",(msg));
                        io.to(receiverId).emit("put_group_disappearing_value",(data.duration)); 
                    }
                }
                return create.duration;
            }else{
                checkDurationExist.duration=data.duration;
                checkDurationExist.senderId=data.senderId;
                await checkDurationExist.save();
                const durationData=checkDurationExist;
                const updatedData=await durationData.populate("senderId","name avatar");
                const senderInfo=updatedData.senderId as any;
                const msg=await groupMessage.create({
                    groupId:data._id,
                    senderId:data.senderId,
                    message:`${senderInfo.name} change the group setting to ${data.duration}`,
                    messageType:"system",
                });
                for(let i=0;i<group.peoplesId.length;i++){
                    const id=group.peoplesId[i].toString();
                    const receiverId=users[id];
                    if(receiverId){
                        io.to(receiverId).emit("receive_group_message",(msg));
                        io.to(receiverId).emit("put_group_disappearing_value",(data.duration)); 
                    }
                }
                return data.duration;
            }
        }
        else{
            const checkIsAdmin=group.admin.some(
                (id)=>id.toString()===data.senderId.toString()
            );
            if(!checkIsAdmin){
                throw new Error("don't have access t change the group setting");
            }else{
                const findDuration=await groupDisappearingMessageModel.findOne({groupId:data._id});
             if(!findDuration){
                    const create=await groupDisappearingMessageModel.create({
                        groupId:data._id,
                        senderId:data.senderId,
                        duration:data.duration,
                    });
                     const detailData=create;
               const userDetail=await detailData.populate("senderId","name avatar");
               const nameInfo=userDetail.senderId as any;
                const msg=await groupMessage.create({
                    groupId:data._id,
                    senderId:data.senderId,
                    message:`${nameInfo.name} change the group setting to ${create.duration}`,
                    messageType:"system",
                });
                //here we have to emit to all who are online we will wroye that logic
                for(let i=0;i<group.peoplesId.length;i++){
                    const id=group.peoplesId[i].toString();
                    const receiverId=users[id];
                    if(receiverId){
                        io.to(receiverId).emit("receive_group_message",(msg));
                        io.to(receiverId).emit("put_group_disappearing_value",(data.duration)); 
                    }
                }
                return create.duration;
                }
                
                else{
                    findDuration.duration=data.duration;
                    findDuration.senderId=data.senderId; 
                    await findDuration.save();
                    const durationData=findDuration;
                const updatedData=await durationData.populate("senderId","name avatar");
                const senderInfo=updatedData.senderId as any;
                const msg=await groupMessage.create({
                    groupId:data._id,
                    senderId:data.senderId,
                    message:`${senderInfo.name} change the group setting to ${data.duration}`,
                    messageType:"system",
                });
                for(let i=0;i<group.peoplesId.length;i++){
                    const id=group.peoplesId[i].toString();
                    const receiverId=users[id];
                    if(receiverId){
                        io.to(receiverId).emit("receive_group_message",(msg));
                        io.to(receiverId).emit("put_group_disappearing_value",(data.duration)); 
                    }
                }
                return data.duration;
                }   
            }
        }
    }catch(err){
        console.log(err);
        throw err;
    }
}








export const getDuationgMessage=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
            return;
        }
        const duration=await groupDisappearingMessageModel.findOne({groupId:data._id});
        if(duration){
            return duration.duration;
        }else{
            return "off";
        }
    }catch(err){
        throw err;
    }
}








//now here we will show all media files links
export const allMedia=async(_id:string)=>{
    try{
    const media = await groupMessage.find({groupId: _id,mimetype:{$regex:"^(image|video)",$options: "i"}});
    return media; 
   }catch(err){
        throw err;
    }
}


export const allDocs=async(_id:string)=>{
    try{
        const docs=await groupMessage.find({groupId:_id,mimetype:{$regex:"^(application)",$options:"i"}});
        return docs;
    }catch(err){
        throw err;
    }
}



export const allLinks=async(_id:string)=>{
    try{
        const links=await groupMessage.find({groupId:_id,
        message:{ $regex: "((https?:\\/\\/)?(www\\.)?[a-zA-Z0-9-]+\\.[a-zA-Z]{2,}(\\/[^\\s]*)?)", $options: "i"},
        messageType:"text",    
        });
        return links;
    }catch(err){
        throw err;
    }
}








//here the logic is basically we will emit message according to 
//here we basically deieiver message


//_id is groupId basically

//   socket.on("group_chat_list_update", handleGroupChatListUpdate);
//         socket.on("allPendingMessage", handlePendingMessages);
export const emitMessageInGroup=async(
    data:{_id:string,senderId:string},
    msgData:any,
    users:{[key:string]:string},
    activeGroupChats:Record<string,string>,socket:Socket,io:Server)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
            return;
        }
        const msg=await groupMessage.findById(msgData._id);
        if(!msg){
            fail("msg not found ot something went wrong");
            return;
        }

        await msg.populate("senderId","name avatar");

        for(let i=0;i<group.peoplesId.length;i++){
            const receiverId=group.peoplesId[i].toString();
            if (receiverId===data.senderId.toString()){
                continue;
            }
            const toNotify: string = (await muteNotificattion({_id: data._id, senderId: receiverId})) || "off";
            const alreadyDelivered: boolean = msg.deliveredTo.some((id: any)=>id.toString()===receiverId);
            const alreadySeen: boolean = msg.seenBy.some((id: any)=>id.toString()===receiverId);

            if(activeGroupChats[receiverId]===data._id){
                const id=new mongoose.Types.ObjectId(receiverId);
                if(!alreadyDelivered) msg.deliveredTo.push(id);
                if(!alreadySeen) msg.seenBy.push(id);
                const receiverSocketId=users[receiverId];
                if(receiverSocketId){
                    io.to(receiverSocketId).emit("receive_group_message",{...msg.toObject(),notificationSound:toNotify});
                }
            }else if(activeGroupChats[receiverId]!==data._id && users[receiverId]){
                const id=new mongoose.Types.ObjectId(receiverId);
                if(!alreadyDelivered) msg.deliveredTo.push(id);
                const receiverSocketId=users[receiverId];
                if(receiverSocketId){
                    io.to(receiverSocketId).emit("receive_group_message",{...msg.toObject(),notificationSound:toNotify});
                }
            }
        }
        socket.emit("receive_group_message",(msg));
        await msg.save();

        for(let i=0;i<group.peoplesId.length;i++){
            const receiverId=group.peoplesId[i].toString();
            if(receiverId===data.senderId.toString())continue;
            await emitPendingCountToUser(receiverId, io, users);
        }

         if(group.peoplesId.length===msg.deliveredTo.length){
            msg.isDelivered=true;
            await msg.save();
                socket.emit("update_deliveredTo",(msg));
            }
         if(group.peoplesId.length===msg.seenBy.length){
            msg.isSeen=true;
            await msg.save();
                socket.emit("update_seenBy",(msg));
         }
    }catch(err){
        console.log(err);
        throw err;
    }
}






//parent reply reply on reply
export const replyToParent=async(
    data:
    {_id:string,msgId:string,message:string,messageType:string,senderId:string,parentReply:string
    },socket:Socket,io:Server,users:{[key:string]:string},activeGroupChats:Record<string,string>)=>{
    try{
        const [group,msg,checkDuration,muteGroupNotification]=await Promise.all([
            groupChatModel.findById(data._id),
            groupMessage.findById(data.msgId),
            groupDisappearingMessageModel.findById(data._id),
            muteGroupNotificationModel.findOne({groupId:data._id,senderId:data.senderId})
        ]); 
         if(!group){
            fail("group not found");
            return;
        }
        if(!msg){
            fail("message not found");
            return;
        }
        if(group.onlyAdminSendMessage){
        const isAdmin=group.admin.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(!isAdmin){
            fail("only admin can send message");
            return;
        }
        }

        let duration=null;
        if(checkDuration){
           duration=durationtoMs(checkDuration.duration);
        }

        let notification="off";
        if(muteGroupNotification){
           notification=muteGroupNotification.duration;
        }
       

        const createGroupMessage=await groupMessage.create({
            groupId:group._id,
            senderId:data.senderId,
            message:data.message,
            messageType:data.messageType,
            expiresAt:duration?new Date(Date.now()+duration):null,
            notificationSound:notification,
        });
        if(!createGroupMessage){    
            throw new Error("failed to create message");
        }
        const msgId=new mongoose.Types.ObjectId(data.msgId);
        const userId=new mongoose.Types.ObjectId(data.senderId);
        createGroupMessage.parentReply.push({messageId:msgId,userId:userId,message:msg.message,messageType:msg.messageType});
        await createGroupMessage.populate("parentReply.userId","name avatar");
        await createGroupMessage.save();
        

        for(let i=0;i<group.peoplesId.length;i++){
            const id=group.peoplesId[i].toString();
            const activeChats=activeGroupChats[id];
            if(!activeChats || activeChats!==msg.groupId.toString())return;

            const receiverSocketId=users[id];
            if(activeChats && receiverSocketId){
                io.to(receiverSocketId).emit("reply_on_parent_message",(createGroupMessage));
            }
        }
        socket.emit("reply_on_parent_reply",(createGroupMessage));
    }catch(err){
        throw err;
    }
}













//groupId _id msgId messageId
export const emoji=async(data:
    {_id:string,msgId:string,senderId:string,emoji:string},
    socket:Socket,io:Server,users:{[key:string]:string},
    activeGroupChats:Record<string,string>
)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            fail("group not found");
            return;
        }
        const msg=await groupMessage.findById(data.msgId);
        if(!msg){
            throw new Error("message not found");
        }
         const exist=msg.reaction.find(
            (id)=>id.userId.toString()===data.senderId.toString()
         );
         if(exist){
            if(exist.emoji===data.emoji){
                msg.reaction=msg.reaction.filter(
                (id)=>id.userId.toString()!==data.senderId.toString()
                );
            }else{
                exist.emoji=data.emoji;
            }
         }else{
            const id=new mongoose.Types.ObjectId(data.senderId);
            msg.reaction.push({userId:id,emoji:data.emoji});
         }
         await msg.save();
         for(let i=0;i<group.peoplesId.length;i++){
            const id=group.peoplesId[i].toString();
            const activeChats=activeGroupChats[id];
            if(!activeChats)continue;
            const receiverSocketId=users[id];
            if(activeChats===msg.groupId.toString() && receiverSocketId){
                io.to(receiverSocketId).emit("emoji_operation",(msg));
            }
         }
         socket.emit("emoji_operation",(msg));
    }catch(err){
        throw err;
    }
}







//show all message to user

export const showAllMessage=async(data:{_id:string,senderId:string})=>{
    try{
         const message=await groupMessage.find(
        {groupId:data._id,
        hideIt:{$nin:[data.senderId]}
},
    ).sort({createdAt:1}).populate("senderId","name avatar");
    return message;
    }catch(err){
        throw err;
    }
} 









const computePendingForUser=async(userId:string):Promise<{id:string;count:number}[]>=>{
    let response:{id:string;count:number}[]=[];
    const groups=await groupChatModel.find({peoplesId:userId});
    for(let i=0;i<groups.length;i++){
        const id=groups[i]._id.toString();
        const msg=await groupMessage.find({groupId:id, messageType:{$ne:"system"}});
        let count=0;
        for(let j=0;j<msg.length;j++){
            const checkIt=msg[j].seenBy.some(
                (sid:any)=>sid.toString()===userId.toString()
            );
            if(!checkIt) count++;
        }
        response.push({id,count});
    }
    return response;
}

export const allPendingMessage=async(senderId:string,socket:Socket)=>{
    try{
        const response = await computePendingForUser(senderId);
        socket.emit("allPendingMessage",(response));
        return response;
    }catch(err){
        throw err;
    }
}

export const emitPendingCountToUser=async(userId:string, io:Server, users:{[key:string]:string})=>{
    try{
        const receiverSocketId = users[userId];
        if(!receiverSocketId) return;
        const response = await computePendingForUser(userId);
        io.to(receiverSocketId).emit("allPendingMessage",(response));
    }catch(err){
        throw err;
    }
}








export const clearSomePendingMessage=async(data:{_id:string,senderId:string},socket:Socket,io:Server)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        await groupMessage.updateMany(
            { groupId: data._id },
            { $addToSet: { seenBy: data.senderId } }
        );
        await allPendingMessage(data.senderId,socket);
    }catch(err){
        throw err;
    }
}