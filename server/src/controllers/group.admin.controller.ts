import {Request,Response,NextFunction} from 'express';
import { groupChatModel } from '../models/group.create.model';
import { groupChat } from '../Socket/group.message.socket';
import {Socket,Server} from 'socket.io';
import { groupMessage } from '../models/group.message.model';
import { User } from '../models/user.model';



export const groupCreator=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        if(group.groupCreatorId.toString()===data.senderId.toString()){
            return "isGroupCreator";
        }else{
            return "IsNotGroupCreator";
        }
    }catch(err){
        throw err;
    }
}






export const checkChatLocked=async(data:{_id:string,senderId:string},socket:Socket)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        if(group.onlyAdminSendMessage){
            const isAdmin=group.admin.some(
                (id)=>id.toString()===data.senderId.toString()
            );
            if(isAdmin){
                socket.emit("chat_operation",("chat not locked"));
            }else{
                socket.emit("chat_operation",("chat locked"));
            }
        }else{
            socket.emit("chat_operation",("chat not locked"));
        }
    }catch(err){
        throw err;
    }
}




export const getData=async(data:{_id:string,senderId:string},socket:Socket)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
            socket.emit("group_settings_data",({
            canChangeGroupName: group.canChangeGroupName,
            canChangeGroupImage: group.canChangeGroupImage,
            canAddGroupMembers: group.canAddGroupMembers,
            canRemoveGroupMembers: group.canRemoveGroupMembers,
            changeDisappearingMessageSetting: group.changeDisappearingMessageSetting,
            onlyAdminSendMessage: group.onlyAdminSendMessage,
        }));
    }catch(err){
        throw err;
    }
}




interface updateSetting{
    _id:string,
    senderId:string,
    canChangeGroupName:boolean,
    canChangeGroupImage:boolean,
    canAddGroupMembers: boolean,
    canRemoveGroupMembers: boolean,
    changeDisappearingMessageSetting: boolean,
    onlyAdminSendMessage: boolean,
}

export const updateGroupSettings=async(data:updateSetting,socket:Socket,io:Server,users:{[key:string]:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        if(group.groupCreatorId.toString()!==data.senderId.toString()){
            socket.emit("error_msg","don't have access to change group permission");
            return;
        }
        const oldChangeDisappearingMessageSetting = group.changeDisappearingMessageSetting;
        

        group.canChangeGroupName=data.canChangeGroupName;
        group.canChangeGroupImage=data.canChangeGroupImage;
        group.canAddGroupMembers=data.canAddGroupMembers;
        group.canRemoveGroupMembers=data.canRemoveGroupMembers;
        group.changeDisappearingMessageSetting=data.changeDisappearingMessageSetting;
        group.onlyAdminSendMessage=data.onlyAdminSendMessage;
        await group.save();

        socket.emit("group_settings_updated",{
            canChangeGroupName: group.canChangeGroupName,
            canChangeGroupImage: group.canChangeGroupImage,
            canAddGroupMembers: group.canAddGroupMembers,
            canRemoveGroupMembers: group.canRemoveGroupMembers,
            changeDisappearingMessageSetting: group.changeDisappearingMessageSetting,
            onlyAdminSendMessage: group.onlyAdminSendMessage,
        });


        //now we will send real time message to user about settings only of disappearing message and
        //only admin can send message

         for(let i=0;i<group.peoplesId.length;i++){
                const id=group.peoplesId[i].toString();
                const receiverSocketId=users[id];
                if(id===data.senderId)continue;
                if(receiverSocketId){
                    io.to(receiverSocketId).emit("group_settings_changed",{
                        groupId:group._id.toString(),
                        canChangeGroupName:group.canChangeGroupName,
                        canChangeGroupImage:group.canChangeGroupImage,
                        canAddGroupMembers:group.canAddGroupMembers,
                        canRemoveGroupMembers:group.canRemoveGroupMembers,
                        changeDisappearingMessageSetting:group.changeDisappearingMessageSetting,
                        onlyAdminSendMessage:group.onlyAdminSendMessage,
                    });
                }
            }
        if(oldChangeDisappearingMessageSetting !== data.changeDisappearingMessageSetting){
            if(data.changeDisappearingMessageSetting){
                let name="";
                const info=await User.findById(data.senderId);
                if(info){
                    name=info.name;
                }
                let msgData:any=[];
                for(let i=0;i<group.peoplesId.length;i++){
                    const id=group.peoplesId[i].toString();
                    const receiverSocketId=users[id];
                    if(id===data.senderId)continue;
                    const msg=await groupMessage.create({
                        groupId:data._id,
                        senderId:data.senderId,
                        message:`${name} changed the disappearing message permission to Allow all members to change the disappearing message duration`,
                        messageType:"system",
                    });
                    msgData=msg;
                    if(receiverSocketId){
                        io.to(receiverSocketId).emit("receive_group_message",(msg));
                    }
                }
                socket.emit("receive_group_message",(msgData));
            }else{

                let name="";
                const info=await User.findById(data.senderId);
                if(info){
                    name=info.name;
                }
                let msgData:any=[];
                for(let i=0;i<group.peoplesId.length;i++){
                    const id=group.peoplesId[i].toString();
                    const receiverSocketId=users[id];
                    if(id===data.senderId)continue;
                    const msg=await groupMessage.create({
                        groupId:data._id,
                        senderId:data.senderId,
                        message:`${name} restricted disappearing message changes to admins only`,     
                        messageType:"system",
                    });
                    msgData=msg;
                    if(receiverSocketId){
                        io.to(receiverSocketId).emit("receive_group_message",(msg));
                    }
                }
                socket.emit("receive_group_message",(msgData));
               }   
            }
    }catch(err){
        const error=err instanceof Error?err.message:"Unknown Error";
        socket.emit("error_msg",(error));
    }
}