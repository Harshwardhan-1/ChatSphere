import {Request,Response,NextFunction} from 'express';

export const ErrorMiddleware=async(err:any,req:Request,res:Response,next:NextFunction)=>{
try{
    let error={...err};
    let message=error.message;
    //mongoose bad object
    if(err.name=== 'CastError'){
        message="Resource not found",
        error=new Error(message);
        error.statusCode=404;
        //{message:"",statusCode:"404"} it will make new error like this
    }
    if(err.code===11000){
        message="Duplicate value entered",
        error=new Error(message);
        error.statusCode(400);
    }
    if(err.name=== 'ValidationError'){
     const message = Object.values(err.errors).map((val : any)=>val.message).join(",");
     error=new Error(message);
     error.statusCode=400;
    }
     if(err.name==='TokenExpiredError'||err.name==='JsonWebTokenError'){
            error=new Error("Access token expired or invalid");
            error.statusCode=401;
        }
    return res.status(error.statusCode || 500).json({
        success:false,
        message:error.message,
    })
}catch(err:any){
    console.log(err);
    return res.status(500).json({
        success:false,
        message:"Server Error",
    })
}
}