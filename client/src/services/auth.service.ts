import { env } from "../configs/env.config";
import axios from 'axios';
const backendUrl=`${env.backendUrl}/api/v1/auth`;
import axiosInstance from "./axiosInstance";


export const authService={
    registerUser:async(data:{name:string,userName:string,email:string,password:string})=>{
        const res=await axios.post(`${backendUrl}/register`,data,{withCredentials:true});
        return res.data;
    },
    
    loginUser:async(data:{email:string,password:string})=>{
        const res=await axios.post(`${backendUrl}/login`,data,{withCredentials:true});
        return res.data;
    },
    logout:async()=>{
        const res=await axiosInstance.post("/auth/logout");
        return res.data;
    },
    me:async()=>{
        const res=await axiosInstance.get("/auth/me");
        return res.data;
    },
}