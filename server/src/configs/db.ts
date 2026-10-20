import mongoose from 'mongoose';
import { NODE_ENV } from './env.config';
    export const connectDb=async()=>{
        try{
            await mongoose.connect(process.env.MONGO_URI as string);
            console.log(`mongodb connected in ${NODE_ENV} environment`);
        }catch(err){
            console.log("error in connecting",err);
            process.exit(1);
        }
    }