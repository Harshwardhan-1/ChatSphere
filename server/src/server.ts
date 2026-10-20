import app from "./app";
import { PORT } from "./configs/env.config";
import { connectDb } from "./configs/db";
import http from "http";
import { userChat } from "./Socket/socket";
import { FRONTEND_URL } from "./configs/env.config";
const server=http.createServer(app);

userChat(server,FRONTEND_URL!)

server.listen(PORT,async()=>{
    console.log(`server is listening to http://localhost:${PORT}`);
    await connectDb();
})     