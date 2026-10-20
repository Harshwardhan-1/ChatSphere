import { useEffect,useState } from "react";
import { showApiError } from "../utils/showApiError";
import axiosInstance from "../services/axiosInstance";

interface data{
    _id:string,
    name:string,
    email:string,
}

interface currentUser{
 loginUserId:string,
 email:string,
}

export function ShowAllUser(){
    const [data,setData]=useState<data[]>([]);
    const [userData,setUserData]=useState<currentUser>();
    try{
    useEffect(()=>{
        const fetch=async()=>{
            const res=await axiosInstance.get("/chat/alluser");
            if(res.data.success && res.data.message=== "all users"){
                setData(res.data.data.allUser);
                setUserData(res.data.userData);
            }
        }
  fetch();
    },[]);
}catch(err){
showApiError(err);
}
return {data,userData};
}
