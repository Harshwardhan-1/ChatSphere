import express from 'express';
import { Request,Response } from 'express';
import cookieParser from "cookie-parser";
import cors from 'cors';
import { FRONTEND_URL } from './configs/env.config';
import { ErrorMiddleware } from './middleware/error.middleware';






const app=express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin:FRONTEND_URL,
     methods:["GET","POST","PUT","DELETE"],
     credentials:true,
}));

import { authRouter } from './routes/auth.routes';
import { chatpageRoutes } from './routes/chat.routes';
import { fileuploadRouter } from './routes/file.upload.routes';
import { storyRoutes } from './routes/stories.routes';
import { groupRoutes } from './routes/group.management.routes';

app.get("/",(req,res)=>{
    res.send("hii harsh here");
})
app.use("/uploads",express.static("uploads"));


app.use("/api/v1/auth",authRouter);
app.use("/api/v1/chat",chatpageRoutes);
app.use("/api/v1",fileuploadRouter);
app.use("/api/v1",storyRoutes);
app.use("/api/v1",groupRoutes);

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(ErrorMiddleware);

export default app;




//OAUTH 2.0



//1 npm install google-auth-library
//2 change in user model
// 2.1 add googleId field
// 2.2 change auth controller check !user.password only that
//3 change auth controller
    // 3.1 google client id
    // 3.2 import Oauth2client,token pay laod
    // 3.3 google client
    // 3.4 function 
    // 3.5 route

//4 on frontend
// 4.1  npm install @react-oauth/google



// meaning of --cached in git command is remove it from github not from my device