import { authRequest } from "../types/auth.Requests.types";
import {Response,NextFunction} from 'express';
import { personalChat } from "../models/chat.model";
import { disappearingMessageValidator } from "../validators/disappearing.message.validator";
import { disappearingModel } from "../models/disappearing.message.model";
import { favourites } from "../models/favourites.model";
import { notification } from "../models/mute.notification.model";
import { durationtoMs } from "../helper/durationtoMs";
import { User } from "../models/user.model";
import { Socket,Server } from "socket.io";



export const clear_chat=async(data:{senderId:string,receiverId:string})=>{
    try{
        await personalChat.updateMany({
            $or:[
                {
                    senderId:data.senderId,
                    receiverId:data.receiverId,
                },
                {
                    senderId:data.receiverId,
                    receiverId:data.senderId,
                },
            ]
        },
        //we can also use loop chat[i].push(data.senderId);
        {$addToSet:{isClear:data.senderId}}
    );
    }catch(err){
        throw new Error("failed to clear chat");
    }
}




export const disappearingMessage=async(data:{senderId:string,receiverId:string,duration:string})=>{
    const parse=disappearingMessageValidator.safeParse(data);
    if(!parse.success){
        throw new Error(`${parse.error.issues[0].message}`);
    }
    try{
        const disappearMsg=await disappearingModel.findOne({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ],
        });
        if(disappearMsg){
            disappearMsg.duration=parse.data.duration;
            await disappearMsg.save();
            return disappearMsg;
        }
        const create=await disappearingModel.create({
            senderId:data.senderId,
            receiverId:data.receiverId,
            duration:parse.data.duration,
        });
        if(!create){
            throw new Error("fail to update disappear message timer");
        }
        return create;
    }catch(err){
        throw new Error("something went wrong");
    }
}




export const currentDisapperingVal=async(data:{senderId:string,receiverId:string})=>{
    try{
        const msg=await disappearingModel.findOne({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ],
        });
        if(msg){
            return msg.duration;
        }
    }catch(err){
        throw new Error("failed to get message");
    }
}






export const media=async(data:{senderId:string,receiverId:string})=>{
    try{
        const find=await personalChat.find({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ],
            //regex means it match all the matching files starting with image/video ans options
            //is for case sensitive
            mimetype:{$regex:"^(image|video)",$options:"i"}
        }).sort({createdAt:1});
        return find;
    }catch(err){
        throw new Error("failed to laod media");
    }
}














export const alldocs=async(data:{senderId:string,receiverId:string})=>{
    try{
        const findDocs=await personalChat.find({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ],
            mimetype:{$regex:"^(application)",$options:"i"},
        }).sort({createdAt:1});
        return findDocs;
    }catch(err){
        throw new Error("failed to get docs");
    }
}




export const allLinks=async(data:{senderId:string,receiverId:string})=>{
    try{
        const findLinks=await personalChat.find({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ],
            //it checks all condition using and so no order matters
            message:{ $regex: "((https?:\\/\\/)?(www\\.)?[a-zA-Z0-9-]+\\.[a-zA-Z]{2,}(\\/[^\\s]*)?)", $options: "i" },
            messageType:"text", 
        }).sort({createdAt:1});
        return findLinks;
    }catch(err){
        throw new Error("failed to get links");
    }
}







export const check_favourites=async(data:{senderId:string,receiverId:string}):Promise<string>=>{
    try{
        const check=await favourites.findOne({
            senderId:data.senderId,receiverId:data.receiverId,
        });
        return check?"Remove From Favourites":"Add To Favourites";
    }catch(err){
        throw new Error("failed to check if it is in favourites or not");
    }
}





export const mark_as_favourites=async(data:{senderId:string,receiverId:string})=>{
    try{
        const markAsFavourites=await favourites.findOne({
            senderId:data.senderId,
            receiverId:data.receiverId,
        });
        if(markAsFavourites){
            markAsFavourites.IsMarkedAsFavourites=true;
            await markAsFavourites.save();
            return;
        }
        const create=await favourites.create({
            senderId:data.senderId,
            receiverId:data.receiverId,
            IsMarkedAsFavourites:true,
        });
        if(!create){
            throw new Error("failed to mark as favourites");
        }
    }catch(err){
        throw new Error("failed to mark as favourites");
    }
}





export const unmarked_as_favourites=async(data:{senderId:string,receiverId:string})=>{
    try{
        const unmarkedAsFavourites=await favourites.findOne({
            senderId:data.senderId,
            receiverId:data.receiverId,
        });
        if(unmarkedAsFavourites){
            unmarkedAsFavourites.IsMarkedAsFavourites=false;
            await unmarkedAsFavourites.save();
            return;
        }
    }catch(err){
        throw new Error("failed to unmarked favourites");
    }
}



export const all_favourites=async(data:{senderId:string})=>{
    try{
        const list=await favourites.find({senderId:data.senderId,IsMarkedAsFavourites:true});
        const id:string[]=[];
        for(let i=0;i<list.length;i++){
            id.push(list[i].receiverId.toString());
        }
        return id;
    }catch(err){
        throw new Error("failed to get favourites");
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


export const pin_message=async(data:{_id:string,senderId:string,receiverId:string})=>{
    try{
        const pinnedMessage=await personalChat.findById(data._id);
        if(!pinnedMessage){
            throw new Error("not found");
        }
        if(pinnedMessage){
        pinnedMessage.isPinned=true;
        await pinnedMessage.save();
        }
        const duration=await disappearingMessageDuration(data.senderId,data.receiverId);
        const sound=await notificationSound(data.senderId,data.receiverId);
        const createPinnedMessage=await personalChat.create({
            senderId:data.senderId,
            receiverId:data.receiverId,
            message:"pinned a message",
            messageType:"systemPinned",
            expiresAt:duration?new Date(Date.now()+duration):null,
            notificationSound:sound,
            isPinned:false,
        });
        if(!createPinnedMessage){
            throw new Error("failed to create pinned message");
        }
        return {updateMessage:pinnedMessage,systemMessage:createPinnedMessage};
    }catch(err){
        throw new Error("failed to pinned message");
    }
}




export const unpinned_message=async(data:{_id:string,senderId:string,receiverId:string})=>{
    try{
        const unpinnedMessage=await personalChat.findById(data._id);
        if(!unpinnedMessage){
            throw new Error("not found");
        }
        if(unpinnedMessage){
            unpinnedMessage.isPinned=false;
            await unpinnedMessage.save();
        }
        return unpinnedMessage;
    }catch(err){
        throw new Error("failed to unpinned message");
    }
}









export const allPinnedMessage=async(data:{senderId:string,receiverId:string})=>{
    try{
        const allMessages=await personalChat.find({
            $or:[
                {senderId:data.senderId,receiverId:data.receiverId},
                {senderId:data.receiverId,receiverId:data.senderId},
            ],
            isPinned:true,
        }).sort({updatedAt:1});
        return allMessages;
    }catch(err){
        throw new Error("failed to load pinned message");
    }
}












//the msg is basically the path
export const changeProfileImage=async(data:
    {senderId:string,msg:string},
    socket:Socket,io:Server,users:{[key:string]:string}
)=>{
    try{
        const user=await User.findById(data.senderId);
        if(!user){
            throw new Error("user not found");
        }
        user.avatar=data.msg;
        await user.save();
        const allUser=await User.find();

        for(let i=0;i<allUser.length;i++){
            const id=allUser[i].toString();
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("profile_pic_changed",({senderId:data.senderId,receiverId:id}))
            }
        }
    }catch(err){
        throw err;
    }
}