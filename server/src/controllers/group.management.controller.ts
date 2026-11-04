import {Request,Response,NextFunction} from 'express';
import { groupChatModel } from '../models/group.create.model';
import mongoose from 'mongoose';
import { authRequest } from '../types/auth.Requests.types';
import  QRCode from "qrcode";
import { groupMessage } from '../models/group.message.model';
import { Socket,Server } from 'socket.io';
import { allAdmin, AllMembers } from './group.info.controller';
import { User } from '../models/user.model';
import { io,users } from '../Socket/socket';



export const createGroup=async(data:
    {groupName:string,senderId:string,peoplesId:[]},
    socket:Socket,io:Server,users:{[key:string]:string}
)=>{
    try{
        if(!data.groupName || !data.senderId){ 
            throw new Error("group name is required");
        }
        if(data.peoplesId.length===0){
          throw new Error("there should be atleast one person in the group");
        }

        const adminId=new mongoose.Types.ObjectId(data.senderId);
        const inviteToken=`${Date.now()}-${Math.round(Math.random()*1e9)}`;
        const create=await groupChatModel.create({
            inviteToken, 
            groupName:data.groupName,
            groupCreatorId:data.senderId,
        });
        if(!create){
            throw new Error("internal server error")
        }
        create.admin.push(adminId);
        for(let i=0;i<data.peoplesId.length;i++){
            const id=new mongoose.Types.ObjectId(data.peoplesId[i]);
            create.peoplesId.push(id);
        }
        create.peoplesId.push(adminId);
        await create.save();
        const creator:any=create.groupCreatorId;
        let name="";
        const find=await User.findById(data.senderId);
        if(find){
            name=find.name;
        }
        const msg=await groupMessage.create({
            groupId:create._id,
            senderId:data.senderId,
            message:`${name} created this group`,
            messageType:"system",
        });

        for(let i=0;i<create.peoplesId.length;i++){
            const id=create.peoplesId[i].toString();
            const receiverSocketId=users[id];
            const allGroup=await groups({senderId:id});
            if(id===data.senderId.toString())continue;
            if(receiverSocketId){
                io.to(receiverSocketId).emit("all_groups",(allGroup));
                io.to(receiverSocketId).emit("receive_group_message",(msg));
            }
        }
        const grp=await groups({senderId:data.senderId});
        socket.emit("all_groups",(grp));
        socket.emit("receive_group_message",(msg));
    }catch(err){
        throw err;
    }
} 













//delete group

export const deleteGroup=async(
    data:{_id:string,senderId:string},socket:Socket,io:Server,
    users:{[key:string]:string},
    activeGroupChats:Record<string,string>
)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        const isCreator=group.groupCreatorId.toString()===data.senderId.toString();
        if(!isCreator){
            throw new Error("don't have access to delete this group");
        }
        group.isGroupDeleted=true;
        await group.save();
        const msg=await groupMessage.create({
            groupId:data._id,
            senderId:data.senderId,
            message:"The group no longer exist deleted by the owner",
            messageType:"system",
        });
        for(let i=0;i<group.peoplesId.length;i++){
            const id=group.peoplesId[i].toString();
            if(id===data.senderId)continue;
            const receiverId=users[id];
            if(receiverId){
                io.to(receiverId).emit("receive_group_message",(msg));
                io.to(receiverId).emit("group_deleted_successfully",({groupId:data._id}));
            }
        }
        socket.emit("receive_group_message",(msg));
        socket.emit("group_deleted_successfully",({groupId:data._id}));
    }catch(err){
        throw err;
    }
}



export const exitAndDeleteGroup=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        const isRemovedOrLeft=group.removedMembers.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(!group.isGroupDeleted && !isRemovedOrLeft){
            throw new Error("cannot exit and delete group");
        }
        const alreadyExited=group.exitAndDelete.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(!alreadyExited){
            group.exitAndDelete.push(new mongoose.Types.ObjectId(data.senderId));
        }
        await group.save();
    }catch(err){
        throw err;
    }
}





export const checkGroupExist=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        if(group.isGroupDeleted){
            return "group not exist";
        }else{
            return "group still exist";
        }
    }catch(err){
        throw err;
    }
}





//update group name

export const updateGroupName=async(data:{_id:string,name:string,senderId:string})=>{
    try{
        const findGroup=await groupChatModel.findById(data._id);
        if(!findGroup){
            throw new Error("group not found");
        }
        if(findGroup.canChangeGroupName){
             findGroup.groupName=data.name;
             await findGroup.save();
            return findGroup;
        }else{
            const checkUser=findGroup.admin.some(
                (id)=>id.toString()===data.senderId.toString()
            );
            if(checkUser){
                //this means the person is admin and change change group name
                findGroup.groupName=data.name;
                await findGroup.save();
                await Promise.all([
                   findGroup.populate("peoplesId","name avatar"),
                   findGroup.populate("admin","name avatar")
                ]);
                return findGroup;
            }else{
                throw new Error("dont have permission to change the group named");
            }
        }
    }catch(err){
        throw err;
    }
}





export const updateGroupImage=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        const {id,senderId}=req.body;
        const file=req?.file;
        if(!file || !id || !senderId){
            return res.status(400).json({
                success:false,
                message:""
            });
        }
        const findGroup=await groupChatModel.findById(id);
        if(!findGroup){
            return res.status(404).json({
                success:false,
                message:"group not found",
            });
        }
            if (findGroup.canChangeGroupImage) {
                findGroup.groupImage = `/uploads/${file.filename}`;
                await findGroup.save();
                return res.status(200).json({
                    success: true,
                    message: "successfull",
                    file: {
                        orignalname: file.originalname,
                        filename: file.filename,
                        mimetype: file.mimetype,
                        path: `/uploads/${file.filename}`,
                    },
                });
            }else{
            //here we will find if it is admin or not if admin allow
            const check=findGroup.admin.some(
                (id)=>id.toString()===senderId.toString()
            );
            if(check){
            findGroup.groupImage=`/uploads/${file.filename}`;
            await findGroup.save();
            return res.status(200).json({
                success:true,
                message:"successfull",
                file:{
                    orignalname:file.originalname,
                    filename:file.filename,
                    mimetype:file.mimetype,
                    path:`/uploads/${file.filename}`,
                },
            });
            }else{
                return res.status(400).json({
                    success:false,
                    message:"dont have permission to change the image",
                });
            }
        }
    }catch(err){
        throw err;
    }
}






//group id and sender id is it in this
//edit group Setting   can change group name,image in client side we will show
//two options or many check options 
export const groupPermission=async(data:
    {_id:string,
    senderId:string,
    changeNameSettings:boolean,
    changeImageSettings:boolean,
    changeAddGroupMembers:boolean,
    changeDisapperingMessageSetting:boolean,
    onlyAdminSendMessage:boolean,
})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        const checkAdmin=group.admin.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(checkAdmin){
            group.canChangeGroupName=data.changeNameSettings;
            group.canChangeGroupImage=data.changeImageSettings;
            group.canAddGroupMembers=data.changeAddGroupMembers;
            group.changeDisappearingMessageSetting=data.changeDisapperingMessageSetting;
            group.onlyAdminSendMessage=data.onlyAdminSendMessage;
            await group.save();
            return group;
        }else{
            throw new Error("dont have permission to change group setting");
        }
    }catch(err){
        throw err;
    }
}





//this will basically give us all the peoples in group
export const allMembersInGroup=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("something went wrong or group deleted");
        }
       await Promise.all([
        group.populate("peoplesId","name avatar"),
        group.populate("admin","name avatar")
       ]);
        return group;
    }catch(err){
        throw err;
    }
}











export const personLeaveGroup=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not exist");
        }
        const findPerson=group.peoplesId.some(
        (id)=>id.toString()===data.senderId.toString()
        );
      if(!findPerson){
       throw new Error("you have already leave the group or there is some technical issue at our end");
      }
      const id=new mongoose.Types.ObjectId(data.senderId);
      group.removedMembers.push(id);
      group.peoplesId=group.peoplesId.filter(
        (id)=>id.toString()!==data.senderId.toString()
      );
      await group.save();
      await Promise.all([
          group.populate("peoplesId","name avatar"),
          group.populate("admin","name avatar") 
                ]);
      return group;
    }catch(err){
        throw err;
    }
}



//senderId is person who will join the receiverPerson

//here we add normally direct



//here now be emit and store message like added by someone aesa implement karna ha ab
export const addGroupMembersPermission=async(data:{_id:string,senderId:string},socket:Socket)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        if(group.canAddGroupMembers){
            socket.emit("group_add_permission",("permission granted"));
        }else{
            //checking it is admin we grant permission
            const isAdmin=group.admin.some(
                (id)=>id.toString()===data.senderId.toString()
            );
            if(isAdmin){
                socket.emit("group_add_permission","permission granted");
            }else{
                socket.emit("group_add_permission","permission declined");
            }
        }
    }catch(err){
        throw err;
    }
}














//add members
export const addGroupMembers=async(data:
    {_id:string,senderId:string,newMembers:string[]},
    socket:Socket,io:Server,users:{[key:string]:string},
)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        const personAdding=await User.findById(data.senderId);
        let personAddingName=""
        if(personAdding){
            personAddingName=personAdding.name;
        }
        for(let i=0;i<data.newMembers.length;i++){
            group.peoplesId.push(new mongoose.Types.ObjectId(data.newMembers[i]));
            //here we check if the person if in removed group we remove it from there
            group.removedMembers=group.removedMembers.filter(
                (id)=>id.toString()!==data.newMembers[i].toString()
            );
            await group.save();

            //update chat list to show user the group
            const newMembersSocketId=users[data.newMembers[i]];
            if(newMembersSocketId){
                const newChatList=await groups({senderId:data.newMembers[i]});
                io.to(newMembersSocketId).emit("all_groups",(newChatList));
            }
             
             let name="";
             const find=await User.findById(data.newMembers[i]);
             if(find){
                name=find.name;
             }
             const msg=await groupMessage.create({
                groupId:data._id,
                senderId:data.senderId,
                message:`${personAddingName} added ${name}`,
                messageType:"system",
             });
             for(let j=0;j<group.peoplesId.length;j++){
                const id=group.peoplesId[j].toString();
                const receiverSocketId=users[id];
                if(id==data.senderId)continue;
                if(receiverSocketId){
                    io.to(receiverSocketId).emit("receive_group_message",(msg));
                    io.to(receiverSocketId).emit("is_present_in_group","false");
                }
             }
             socket.emit("receive_group_message",(msg));
             const members=await AllMembers({_id:data._id});

             for(let i=0;i<group.peoplesId.length;i++){
                const id=group.peoplesId[i].toString();
                const receiverSocketId=users[id];
                if(id===data.senderId.toString())continue;
                if(receiverSocketId){
                    io.to(receiverSocketId).emit("all_group_members",(members));
                }
             }
        }
    }catch(err){
        throw err;
    }
}



//remove members
//permission check

export const removeMembersPermission=async(data:{_id:string,senderId:string},socket:Socket)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        if(!group.canRemoveGroupMembers){
            if(group.groupCreatorId.toString()===data.senderId.toString()){
            socket.emit("remove_members_permission",({message:"permission granted",groupCreatorId:group.groupCreatorId}));
            }else{
                socket.emit("remove_members_permission",({message:"permission denied",groupCreatorId:group.groupCreatorId}));
            }
        }else{
        const checkAdmin=group.admin.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(checkAdmin){
            socket.emit("remove_members_permission",({message:"permission granted",groupCreatorId:group.groupCreatorId}));
        }else{
            socket.emit("remove_members_permission",({message:"permission denied",groupCreatorId:group.groupCreatorId}));
        }
    }
    }catch(err){
        throw err;
    }
}







export const removeMembers=async(data:
    {_id:string,senderId:string,removeMembers:string[]},
    socket:Socket,io:Server,
    users:{[key:string]:string}
)=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        const removingPerson=await User.findById(data.senderId);
        let name="";
        if(removingPerson){
            name=removingPerson.name;
        }
        for(let i=0;i<data.removeMembers.length;i++){
            //current member who we want to remove 
            const currentMember=await User.findById(data.removeMembers[i]);
            let currentRemoveMemberName="";
            if(currentMember){
                currentRemoveMemberName=currentMember.name;
            }
            const msg=await groupMessage.create({
                groupId:data._id,
                senderId:data.senderId,
                message:`${name} removed ${currentRemoveMemberName}`,
                messageType:"system",
            });

            group.peoplesId=group.peoplesId.filter(
                (id)=>id.toString()!==data.removeMembers[i].toString()
            );
            group.admin=group.admin.filter(
                (id)=>id.toString()!==data.removeMembers[i].toString()
            );
            group.removedMembers.push(new mongoose.Types.ObjectId(data.removeMembers[i]));
            await group.save();

            const members=await AllMembers({_id:data._id});
            const mbrs=members;

            for(let j=0;j<group.peoplesId.length;j++){
                const id=group.peoplesId[j].toString();
                const receiverSocketId=users[id];
                if(id==data.senderId)continue;
                if(receiverSocketId){
                    io.to(receiverSocketId).emit("receive_group_message",(msg));
                    io.to(receiverSocketId).emit("all_group_members",(members));
                }
            }
            const removedMemberSocketId=users[data.removeMembers[i]];
            if(removedMemberSocketId){
                io.to(removedMemberSocketId).emit("receive_group_message",(msg));
                io.to(removedMemberSocketId).emit("is_present_in_group","true");
            }
            
            socket.emit("receive_group_message",(msg));
            socket.emit("all_group_members",(mbrs));
        }
    }catch(err){
        throw err;
    }
}










//leave group it is
export const LeaveGroup=async(data:{_id:string,senderId:string},socket:Socket,io:Server,users:{[key:string]:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        //in peoples
        const removeGroup=group.peoplesId.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(removeGroup){
            group.peoplesId=group.peoplesId.filter(
                (id)=>id.toString()!==data.senderId.toString()
            );
        }
        //if it is admin remove it from admin also
        group.admin=group.admin.filter(
            (id)=>id.toString()!==data.senderId.toString()
        );
        await group.save();
        let name="";
        const find=await User.findById(data.senderId);
        if(find){
            console.log(find);
            name=find.name;
        }
        const msg=await groupMessage.create({
            groupId:data._id,
            senderId:data.senderId,
            message:`${name} leaves the group`,
            messageType:"system",
        });
        for(let i=0;i<group.peoplesId.length;i++){
            const id=group.peoplesId[i].toString();
            const receiverSocketId=users[id];
            if(id===data.senderId)continue;
            if(receiverSocketId){
                io.to(receiverSocketId).emit("receive_group_message",(msg));
            }
        }
        socket.emit("receive_group_message",(msg));
        group.removedMembers.push(new mongoose.Types.ObjectId(data.senderId));
        socket.emit("is_present_in_group","true");
        await group.save();
    }catch(err){

    }
}


export const isGroupMember=async(data:{_id:string,senderId:string})=>{
    try{
        const group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        const checkIsMember=group.removedMembers.some(
            (id)=>id.toString()===data.senderId.toString()
        );
        if(checkIsMember){
            return "true";
        }else{
            return "false";
        }
    }catch(err){
        throw err;
    }
}










//manage admins
export const manageAdmin=async(data:
    {_id:string,senderId:string,makeAdmins:string[],removeAdmins:string[]},
    socket:Socket,io:Server,users:{[key:string]:string}
)=>{
    try{
        const  group=await groupChatModel.findById(data._id);
        if(!group){
            throw new Error("group not found");
        }
        for(let i=0;i<data.makeAdmins.length;i++){
            group.admin.push(new mongoose.Types.ObjectId(data.makeAdmins[i]));
        }

        for(let i=0;i<data.removeAdmins.length;i++){
            group.admin=group.admin.filter(
                (id)=>id.toString()!==data.removeAdmins[i].toString()
            );
        }
        await group.save();
        const members=await allAdmin({_id:data._id});
        for(let i=0;i<group.peoplesId.length;i++){
            const id=group.peoplesId[i].toString();
            const receiverSocketId=users[id];
            if(id===data.senderId)continue;
            if(receiverSocketId){
                io.to(receiverSocketId).emit("all_group_admins",(members));
            }
        }
        socket.emit("all_group_admins",(members));
    }catch(err){
        throw err;
    }
}










//
// 1 generate a random qr link
// 2 make a link and npm install qrcode
// 3 create qr code basically link we have to create user scan that and in there in inviteLink
// 4 joingroup



export const createGroupQr=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        const {id}=req.params;
        const group=await groupChatModel.findById({_id:id});
        if(!group){
            return res.status(400).json({
                success:false,
                message:"group not found",
            });
        }
        const inviteLink=group.inviteToken;
        const url=`http://localhost:5000/api/v1/group/join/${inviteLink}`;
       const qrCode=await QRCode.toDataURL(url);
       return res.status(200).json({
        success:true,
        message:"qr code generated successfully",
        qrCode,
       })
    }catch(err){
        console.log(err);
        throw err;
    }
}




//after this we will emit once more all particular member in group
//group/join/:inviteLink
export const joinGroup=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        const {inviteLink}=req.params;
        const user=req.user;
        if(!inviteLink){
            return res.status(400).json({
                success:false,
                message:"qr scan failed",
            });
        }
        if(!user){
            return res.status(401).json({
                success:false,
                message:"Unauthorized",
            });
        }
        const group=await groupChatModel.findOne({inviteToken:inviteLink});
        if(!group){
            return res.status(404).json({
                success:false,
                message:"group not found",
            });
        }
        const member=group.peoplesId.some(
            (id)=>id.toString()===user._id.toString()
        );
        if(member){
            return res.status(400).json({
                success:false,
                message:"already a member",
            }); 
        }

        group.removedMembers=group.removedMembers.filter(
            (id)=>id.toString()!==user._id.toString()
        );
        const id=new mongoose.Types.ObjectId(user._id);
        group.peoplesId.push(id);
        await group.save();
        

        //here socket part for real time update
        const find=await User.findById(user._id);
        let name="";
        if(find){
            name=find.name;
        }

        const members=await AllMembers({_id:group._id.toString()});
        const msg=await groupMessage.create({
                groupId:group._id,
                senderId:user._id.toString(),
                message:`${name} joined using the group link`,
                messageType:"system",
            });
        for(let i=0;i<group.peoplesId.length;i++){
            const id=group.peoplesId[i].toString();
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("receive_group_message",(msg));
                io.to(receiverSocketId).emit("all_group_members",(members));
            }
        }
        //here we will give the join trhe person the list of his all groups
        const chatList=await groups({senderId:user._id.toString()});
        const receiverSocketId=users[user._id.toString()];
        if(receiverSocketId){
            io.to(receiverSocketId).emit("all_groups",(chatList));
        }
        return res.status(200).json({
            success:true,
            group,
        })
    }catch(err){
        next(err);
    }
}












//in this we have to show user the groups in which user is actually involved
export const groups=async(data:{senderId:string})=>{
    try{
        const findAllGroups=await groupChatModel.find({
            exitAndDelete:{$ne:data.senderId},
            $or:[
                {peoplesId:data.senderId},
                {removedMembers:data.senderId},
            ],
        }).populate("peoplesId","name avatar")
        if(findAllGroups.length===0){
            return;
        }
        return findAllGroups;
    }catch(err){
        throw err;
    }
}


export const currentGroups=async(data:{senderId:string})=>{
    try{
        const find=await groupChatModel.find({peoplesId:data.senderId});
        return find;
    }catch(err){
        throw err;
    }
}