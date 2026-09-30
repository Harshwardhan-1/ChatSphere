import {Request,Response,NextFunction} from 'express';
import { personalChat } from '../models/chat.model';
import { userlastpresence } from '../models/user.lastpresence.model';
import { Types } from 'mongoose';
import { disappearingModel } from '../models/disappearing.message.model';
import { durationtoMs } from '../helper/durationtoMs';
import { notification } from '../models/mute.notification.model';
import { groupChatModel } from '../models/group.create.model';
import {Socket,Server} from 'socket.io';
import { update_chat_list } from './last.message.controller';
import type{ IChat } from '../models/chat.model';


interface personalMsg{
    senderId:string,
    receiverId:string,
    msg:string,
    messageType:string,
    docsId?:string,
    mimetype?:string,
    filename?:string,
    sizeInKb?:number,
    sizeInMb?:number,
    originalname?:string,
}


interface lastpresence{
    userId:string,
}



const disappearingMessageDuration=async(senderId:string,receiverId:string)=>{
    const disappearDuration=await disappearingModel.findOne({
        $or:[
            {senderId:senderId,receiverId:receiverId},
            {senderId:receiverId,receiverId:senderId},
        ]
    });
    if(disappearDuration){
      const duration=durationtoMs(disappearDuration?.duration);
        return duration;
    }
}









const notificationSound=async(senderId:string,receiverId:string):Promise<string>=>{
    const sound=await notification.findOne({
        senderId:receiverId,
        receiverId:senderId, 
    });
    if(sound){
        return sound.duration;
    }else{
        return "off";
    }
}

export const PersonalChat=async(data:personalMsg):Promise<IChat>=>  {
try{
    //this is for testing whether it is working correctly or not
    // throw new Error("Test Error");
    const duration=await disappearingMessageDuration(data.senderId,data.receiverId);
    
    //check notification sound
    const sound=await notificationSound(data.senderId,data.receiverId);
   


    const createIt=await personalChat.create({
        senderId:data.senderId,     
        receiverId:data.receiverId,
        message:data.msg,
        messageType:data.messageType,
        docsId:data?.docsId,
        mimetype:data?.mimetype,
        filename:data?.filename,
        sizeInKb:data?.sizeInKb,    
        sizeInMb:data?.sizeInMb,
        originalname:data?.originalname,
        expiresAt:duration?new Date(Date.now()+duration):null,
        notificationSound:sound,
        isPinned:false,
    });
    if(!createIt){
        throw new Error("failed to send message");
    }
    return createIt;
}catch(err){
console.log(err);
throw new Error("error saving chat in db");
}
}







export const prevChat=async(req:Request,res:Response,next:NextFunction)=>{
    try{
        const {senderId,receiverId}=req.body;
        if(!senderId || !receiverId){
               res.status(400).json({
                success:false,
                message:"senderId or receiverId is missing",
            });
            return;
        }
        const getPrevChat=await personalChat.find({
            $or:[{
                senderId:senderId,
                receiverId:receiverId,
            },{
                senderId:receiverId,
                receiverId:senderId,
            }],
            hideIt:{
                $nin:[senderId],
            },
            isClear:{
                $nin:[senderId],
            },
        }).sort({createdAt:1});
         res.status(200).json({
            success:true,
            message:"got all chat",
            data:getPrevChat,
        });
        return;
    }catch(err){
        next(err);
    }    
}  










export const userlastVisit=async(data:lastpresence)=>{
    try{
        const findIt=await userlastpresence.findOne({userId:data.userId});
        if(findIt){
           findIt.date=new Date(Date.now()),
           await findIt.save();
           return { userId: findIt.userId, updatedAt: findIt.date };
        }else{
            const createPresence=await userlastpresence.create({
                userId:data.userId,
                date:new Date(Date.now()),
            });
            return { userId: createPresence.userId, updatedAt: createPresence.date }
        }
    }catch(err){
        console.log(err);
        throw new Error("error saving last presence");
    }
}




//sender ones
export const delete_from_everyone=async(_id:string):Promise<void>=>{
try{
    const check=await personalChat.findByIdAndDelete({_id});
    if(!check){
        throw new Error("cannot find message");
    }else{
        return;
    }
}catch(err){
    throw new Error("error in deleting");
}
}



export const deleteFromEveryone=async(data:{senderId:string,receiverId:string,msgIds:string[]},
    socket:Socket,io:Server,users:{[key:string]:string},
)=>{
    try{
        for(let i=0;i<data.msgIds.length;i++){
            const msg=await personalChat.findById(data.msgIds[i]);
            if(!msg || msg.senderId!==data.senderId)continue;
            await msg.deleteOne();
        }
        //chatlist update and emit
        const msg=await personalChat.find({
            $or:[
            {senderId:data.senderId,receiverId:data.receiverId},
            {senderId:data.receiverId,receiverId:data.senderId},
            ],
            hideIt:{$nin:[data.senderId]}
        });
        
        const chatList=await update_chat_list({senderId:data.senderId,receiverId:data.receiverId});
      
        const receiverSocketId=users[data.receiverId];
        if(receiverSocketId){
            io.to(receiverSocketId).emit("multiple_msg_delete_personal_chat",(msg));
        }
        socket.emit("multiple_msg_delete_personal_chat",(msg));

        if(chatList){
        io.to(receiverSocketId).emit("chat_list_update",(chatList))
        socket.emit("chat_list_update",(chatList));
        }
    }catch(err){
        throw err;
    }
}




export const edit=async(data:{_id:string,msg:string})=>{
    try{
        const editIt=await personalChat.findByIdAndUpdate(data._id,{message:data.msg,isEdited:true},{returnDocument:"after"});
        if(!editIt){
            throw new Error("fail to edit message");
        }
        return editIt;
    }catch(err){
        throw new Error("fail to edit message");
    }
}






export const delete_from_me=async(data:{_id:string,senderId:string,receiverId:string}):Promise<void>=>{
    try{
       const markDeleted=await personalChat.findById(data._id);
       if(!markDeleted){
        throw new Error("message not found");
    }else{
        markDeleted.hideIt.push(data.senderId);
        await markDeleted.save();
        return;
    }
    }catch(err){
        throw new Error("error in deleting");
    }
}


























//this delete for me we will do it like user can delete multiple message like it hide multile 
//from user screen



//this is for one to one only 
export const deleteForMe=async(data:{senderId:string,receiverId:string,msgIds:string[]},socket:Socket)=>{
    try{
        for(let i=0;i<data.msgIds.length;i++){
            const msg=await personalChat.findById(data.msgIds[i]);
            if(!msg)continue;
            msg.hideIt.push(data.senderId);
            await msg.save();
        }
        const messages=await personalChat.find({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ],
            hideIt:{$nin:[data.senderId]}
        });
        socket.emit("msg_delete_from_user_side_personalChat",(messages));
    }catch(err){
        throw err;
    }
}
























//isSent isDelievered isSeen

export const isSend=async(data:{_id:Types.ObjectId,senderId:string,receiverId:string})=>{
    try{
        const assignIsSend=await personalChat.findById({_id:data._id});
        if(!assignIsSend){
            throw new Error("something went wrong");
        }
        assignIsSend.IsSend=true;
        await assignIsSend.save();
        return assignIsSend;
    }catch(err){
        throw err;
    }
}



export const isDelivered=async(data:{_id:Types.ObjectId,senderId:string,receiverId:string})=>{
try{
    const assignItDelievered=await personalChat.findById({_id:data._id});
    if(!assignItDelievered){
        throw new Error("message not found");
    }
    assignItDelievered.IsSend=true;
    assignItDelievered.isDelivered=true;
    await assignItDelievered.save();
    return assignItDelievered;
}catch(err){
    throw new Error("failed to delievered message");
}
}










export const user_online=async(data:{userId:string})=>{
    try{
       const messages=await personalChat.find({receiverId:data.userId,isDelivered:false});
       for(const msg of messages){
        msg.IsSend=true;
        msg.isDelivered=true;
        await msg.save();
       }
       return messages;
    }catch(err){
        throw new Error("something went wrong");
    }
}





export const user_open_chat=async(data:{senderId:string,receiverId:string})=>{
    try{
        const messages=await personalChat.find({senderId:data.receiverId,receiverId:data.senderId,isSeen:false}).select("_id");
        const markSeen=messages.map(msg=>msg._id.toString());
       await personalChat.updateMany(
        {
            senderId:data.receiverId,receiverId:data.senderId,isSeen:false
        },
            {
              $set:{
                IsSend:true,
                isDelivered:true,
                isSeen:true,
              }  
            },
        );
        return markSeen;
    }catch(err){
        throw err;
    }
}









export const markIsSeen=async(data:{_id:Types.ObjectId,senderId:string,receiverId:string})=>{
   try{
    const findIt=await personalChat.findOne({_id:data._id});
    if(findIt){
        findIt.IsSend=true;
        findIt.isDelivered=true;
        findIt.isSeen=true;
        await findIt.save();
    }
    return findIt;
   }catch(err){
    throw new Error("something went wrong");
   } 
}









//total pending message
//basically it is sender Id mongo db pipeline
export const totalPendingMessage=async(data:{userId:string})=>{
    try{
        const messages=await personalChat.aggregate([
            {
                $match:{
                    receiverId:data.userId,
                    isSeen:false,
                },
            },
            {
                $group:{
                    _id:"$senderId",
                    count:{$sum:1},
                },
            },
            {
                $project:{
                    _id:0,
                    senderId:"$_id",
                    count:1,
                }
            },
        ]);
        return messages;
    }catch(err){
        throw new Error("fail to show pending message");
    }
}









export const allGroupsOfSender=async(senderId:string)=>{
    try{
        const group=await groupChatModel.find({peoplesId:senderId});
        return group;
    }catch(err){
        throw err;
    }
}













export const emitPendingCountToUser=async(userId:string,io:Server,users:{[key:string]:string})=>{
    try{
        const receiverId=users[userId];
        if(!receiverId)return;
        const response=await totalPendingMessage({userId});
        io.to(receiverId).emit("unseen_message_count",(response));
    }catch(err){
        throw err;
    }
}