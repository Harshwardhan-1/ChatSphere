import {Socket,Server} from 'socket.io';
import mongoose from 'mongoose';
import { community } from "../models/community.chat.model";
import { communityMsg } from '../models/community.message.model';
import type { createCommunityType } from "../types/community.types";



//create

export const createCommunity=async(data:createCommunityType,socket:Socket,io:Server)=>{
    try{
        const id=new mongoose.Types.ObjectId(data.creatorId);
        const create=await community.create({
            creatorId:id,
            communityName:data.communityName,
            searchRadius:data.searchRadius,
            communityImage:data.communityImage,
            location:{
                type:"Point",
                coordinates:data.location.coordinates,
            },
        });
        if(!create){
            throw new Error("failed to create Community");
        }
        create.members.push(new mongoose.Types.ObjectId(data.creatorId));
        create.joinTime.push({userId:new mongoose.Types.ObjectId(data.creatorId),date:new Date(Date.now())});
        await create.save();
        

        //here we will emit this to only current person who creates this not to everyone

        socket.emit("communityCreate",(create));


        //now a system message to show start chatting created At

        const createMsg=await communityMsg.create({
            communityId:create._id,
            senderId:data.creatorId,
            message:`Start Chatting  community created At ${new Date(Date.now()).toLocaleDateString()}`,
            messageType:"system",
        });
        if(!createMsg){
            throw new Error("failed to create community Msg");
        }
    }catch(err){
        throw err;
    }
}











export const allUserCommunity=async(data:{senderId:string},socket:Socket)=>{
    try{
        const now=Date.now();
        const allCommunity=await community.find({
            $or:[
                {members:data.senderId},
                {creatorId:data.senderId},
            ],
            expiresAt:{$gt:now},
        });
        socket.emit("all_user_community",(allCommunity));
    }catch(err){
        throw err;
    }
}






//delete


export const deleteCommunity=async(data:
    {communityId:string,creatorId:string},
    socket:Socket,io:Server,
    communityRecord:Record<string,string>,
    users:{[key:string]:string}
)=>{
    try{
        const c=await community.findById(data.communityId);
        if(!c){
            throw new Error("community not found")
        }
        if(c.creatorId.toString()!==data.creatorId.toString()){
            throw new Error("don't have access to delete this community");
        }
        const now=Date.now();
        if(now>=c.expiresAt.getTime()){
            throw new Error("community don't exist");
        }
        await c.deleteOne();
        for (let i = 0; i < c.members.length; i++) {
        const id = c.members[i].toString();
        const receiverSocketId = users[id];
        if (!receiverSocketId || id === data.creatorId.toString()) continue;
        const isOnChatId = communityRecord[id];
        if (isOnChatId === data.communityId) {
            io.to(receiverSocketId).emit("show_community_deleted_alert", {
                communityId: data.communityId,
            });
        }
        io.to(receiverSocketId).emit("community_deleted", {
            communityId: data.communityId,
        });
}
        socket.emit("community_deleted",({communityId:data.communityId}));
    }catch(err){
        throw err;
    }
}







//update


export const editCommunityName=async(data:
    {communityId:string,creatorId:string,communityName:string},
    socket:Socket,io:Server,
    users:{[key:string]:string},
    communityRecord:Record<string,string>
)=>{
    try{
        const c=await community.findById(data.communityId);
        if(!c){
            throw new Error("community don't exist");
        }
        if(c.creatorId.toString()!==data.creatorId.toString()){
            throw new Error("don't have access to delete the id");
        }
        const now=Date.now();
        if(now>=c.expiresAt.getTime()){
            throw new Error("community don't exist");
        }
        c.communityName=data.communityName;
        await c.save();
        for(let i=0;i<c.members.length;i++){
            const id=c.members[i].toString();
            if(id===data.creatorId)continue;
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("community_name_updated",(
                    {communityId:data.communityId,communityName:c.communityName}
                ));
            }
        }
        socket.emit("community_name_updated",({communityId:data.communityId,communityName:data.communityName}));
    }catch(err){
        throw err;
    }
}






export const editCommunityImage=async(data:
    {communityId:string,creatorId:string,communityImage:string},socket:Socket,io:Server,
    users:{[key:string]:string}
)=>{
    try{
        const c=await community.findById(data.communityId);
        if(!c || Date.now()>=c.expiresAt.getTime()){
            throw new Error("community not found");
        }
        if(c.creatorId.toString()!==data.creatorId.toString()){
            throw new Error("don't have access to edit image");
        }
        c.communityImage=data.communityImage;
        await c.save();
        for(let i=0;i<c.members.length;i++){
            const id=c.members[i].toString();
            if(id==data.creatorId)continue;
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("community_image_updated",(
                    {communityId:data.communityId,communityImage:c.communityImage}
                ));
            }
        }
        socket.emit("community_image_updated",(
            {communityId:data.communityId,communityImage:c.communityImage}
        ));
    }catch(err){
        throw err;
    }
}





export const editSearchRadius=async(data:
    {communityId:string,creatorId:string,searchRadius:string},
    socket:Socket,io:Server,
    users:{[key:string]:string}
)=>{
    try{
        const c=await community.findById(data.communityId);
        if(!c){
            throw new Error("community not found");
        }
        if(c.creatorId.toString()!==data.creatorId.toString()){
            throw new Error("don't have access to update search radius")
        }
        const now=Date.now();
        if(now>=c.expiresAt.getTime()){
            throw new Error("community don't exist");
        }
        c.searchRadius=data.searchRadius;
        await c.save();
        for(let i=0;i<c.members.length;i++){
            const id=c.members[i].toString();
            if(id===data.creatorId)continue;
            const receiverSocketId=users[id];
            if(receiverSocketId){
                io.to(receiverSocketId).emit("search_radius_updated",(
                    {communityId:data.communityId,searchRadius:c.searchRadius}
                ));
            }
        }
        socket.emit("search_radius_updated",({communityId:data.communityId,searchRadius:c.searchRadius}));
    }catch(err){
        throw err;
    }
}










//here user Id means the person who want to join the community
export const userJoinCommunity=async(data:{communityId:string,userId:string},
    socket:Socket,io:Server,
    users:{[key:string]:string}
)=>{
    try{
        const c=await community.findById(data.communityId);
        if(!c){
            throw new Error("community not found");
        }
        const now=Date.now();
        if(now>=c.expiresAt.getTime()){
            throw new Error("community don't exist");
        }
        const isAlreadyMember=c.members.some(
            (id)=>id.toString()===data.userId.toString()
        );
        if(isAlreadyMember){
            throw new Error("you are already joined as a member");
        }
        c.members.push(new mongoose.Types.ObjectId(data.userId));


        //join time store 

        //first we remove it from join array if it is there

        c.joinTime=c.joinTime.filter(
            (id)=>id.userId.toString()!==data.userId.toString()
        );       
        const userId=new mongoose.Types.ObjectId(data.userId);
        const date=new Date(Date.now());
        c.joinTime.push({userId,date});
        await c.save();

        //sabhi online users ko naya count bhejna hai - jo already member hain unko bhi,
        //aur jo abhi "nearby" mein dekh rahe hain (member nahi bane) unko bhi taaki unki list bhi update ho
        const totalMembersLength=c.members.length;
        io.emit("community_members",{communityId:data.communityId,totalMembersLength});

        socket.emit("user_joined_community",(data));
    }catch(err){
        throw err;
    }
}











//here we will again call nearby list after user leave the group

export const userLeaveCommunity=async(data:{communityId:string,userId:string},
    socket:Socket,io:Server,
    users:{[key:string]:string},
    communityRecord:Record<string,string>
)=>{
    try{
        const c=await community.findById(data.communityId);
        if(!c){
            return;
        }
        c.members=c.members.filter(
            (id)=>id.toString()!==data.userId.toString()
        );
        c.joinTime=c.joinTime.filter(
            (id)=>id.userId.toString()!==data.userId.toString()
        );
        await c.save();
        

        //here we will emit the no pf peoples in that group
        if(communityRecord[data.userId]){
             delete communityRecord[data.userId];
        }
        const totalMembersLength=c.members.length;
        //sabhi online users ko bhejna hai (join wale jaisa hi), sirf remaining members ko nahi
        io.emit("community_members",{communityId:data.communityId,totalMembersLength});

        socket.emit("community_left",({communityId:data.communityId,userId:data.userId}));
    }catch(err){
        throw err;
    }
}










//here we will send creator Id because to show button like delete and update

export const communityData=async(data:{communityId:string,userId:string},socket:Socket)=>{
    try{
        const c=await community.findById(data.communityId);
        if(!c){
            throw new Error("community not found");
        }
        let showEditOption="hide";
        const now=Date.now();

        if(now>=c.expiresAt.getTime()){
            return;
        }
        if(c.creatorId.toString()!==data.userId.toString()){
            socket.emit("community_data",({communityId:data.communityId,userId:data.userId,showEditOption}));
            return;
        }
        //show edit options
        showEditOption="show";
    
        socket.emit("community_data",({communityId:data.communityId,userId:data.userId,showEditOption}))
    }catch(err){
        throw err;
    }
}











export const showNearBy=async(data:{userId:string,coordinates:[number,number],page:number},socket:Socket)=>{
    try{
        const limit=10;
        const skip=(data.page-1)*limit;
        const result=await community.aggregate([
            {
                $geoNear:{
                    near:{type:"Point",coordinates:data.coordinates},
                    distanceField:"distance",
                    spherical:true,
                },
            },
            {
                $match:{
                    members:{$ne:new mongoose.Types.ObjectId(data.userId)},
                    creatorId:{$ne:new mongoose.Types.ObjectId(data.userId)},
                },
            },
            {
                $skip:skip,
            },
            {
                $limit:limit,
            },
            {
                $addFields:{
                    distanceInKm:{$round:[{$divide:["$distance",1000]},1]},
                },
            },
            {
                $project:{
                    distance:0,
                },
            },
        ]);
        socket.emit("got_nearby_communities",(result));
    }catch(err){
        throw err;
    }
}