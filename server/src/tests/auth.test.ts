import request from 'supertest';
import { User } from '../models/user.model';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../app';
import { loginRateLimiter, registerRateLimiter} from '../middleware/rateLimit.middleware';

//mock resolved value  baar baar chalenga 
//mock resolved value once ek hi baar next time undefined
//mock rejected value baar baar chalenga new Error("");
//mock rejected value once ek hi baar chalenga


jest.mock("../models/user.model");
jest.mock("groq-sdk");
jest.mock("jsonwebtoken");
jest.mock("bcrypt");
jest.mock("../middleware/rateLimit.middleware",()=>({
    registerRateLimiter:(req:any,res:any,next:any)=>{
        next();
    },
    loginRateLimiter:(req:any,res:any,next:any)=>{
        next();
    },
}));


describe("Auth",()=>{
    beforeEach(()=>{
        jest.clearAllMocks();
    });
    describe("POST /api/v1/auth/register",()=>{
        it("it should registered user successfully with a status code of 200",async()=>{
          (User.findOne as jest.Mock).mockResolvedValue(null);
           (bcrypt.hash as jest.Mock).mockResolvedValue("hashedPassword");
            (User.create as jest.Mock).mockResolvedValueOnce({
              _id:"123",  
              name:"test",
              userName:"test1",
              email:"test@gmail.com",
              password:"Test123@",
            });
            (jwt.sign as jest.Mock).mockReturnValue("fake_token");
           const res=await request(app)
            .post("/api/v1/auth/register")
            .send({
                name:"test",
                userName:"test1",
                email:"test@gmail.com",
                password:"Test123@"
            });
            console.log(res.status, res.body, res.text);
            expect(res.status).toBe(201);
            expect(res.body.message).toBe("successfully register");
            expect(res.body.success).toBe(true);
        });

        it("it should return user already exist with a status code of 409",async()=>{
            (User.findOne as jest.Mock).mockResolvedValue(true);
            const res=await request(app)
            .post("/api/v1/auth/register")
            .send({
                name:"test",
                userName:"test1",
                email:"test@gmail.com",
                password:"Test1@"
            });
            expect(res.status).toBe(409);
            expect(res.body).toEqual({
                success:false,
                message:"user already exist"
            });
        });
    });

    describe("Post /api/v1/auth/login",()=>{
        it("it should login user successfully with a status code of 200",async()=>{
           (User.findOne as jest.Mock).mockResolvedValue({
            _id:"123",
            email:"test@gmail.com",
            password:"Test1@",
           });
           (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
           (jwt.sign as jest.Mock).mockReturnValue({
            _id:"123",
            email:"test@gmail.com",
           });
            const res=await request(app)
            .post("/api/v1/auth/login")
            .send({
                email:"test@gmail.com",
                password:"Test1@",
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe("successfully verified");
        });
        it("it should return all fields are required",async()=>{
            (User.findOne as jest.Mock).mockResolvedValueOnce(null);

           
            const res=await request(app)
            .post("/api/v1/auth/login")
            .send({
                email:"test@gmail.com",
                password:"Test1@",
            });
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("please do a signup first");
        });
        it("it should return some field are missing with a status code of 400",async()=>{
            const res=await request(app)
            .post("/api/v1/auth/login")
            .send({
                email:"test@gmail.com",
                password:"",
            });
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.errors).toBe("pssword must be atleast 1 characters");
        });
    });

    describe("GET /api/v1/auth/logout",()=>{
        it("it should logout user successfully with a status code of 200",async()=>{
        (jwt.verify as jest.Mock).mockReturnValue(true);
     (User.findOne as jest.Mock).mockReturnValue({
        select:jest.fn().mockResolvedValue({
            email:"test@gmail.com",
        })
     });
            const res=await request(app)
            .post("/api/v1/auth/logout")
            .set("Cookie","token=fake_token")
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success:true,
                message:"successfully logout",
            });
        });
    });
});