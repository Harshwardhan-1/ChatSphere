
import axiosInstance from './axiosInstance';

export const chatService={
    prevMsg:async(senderId:string,receiverId:string)=>{
    const send={senderId,receiverId};
    const res=await axiosInstance.post("/chat/prevChat",send);
    return res.data.data;
   }
}