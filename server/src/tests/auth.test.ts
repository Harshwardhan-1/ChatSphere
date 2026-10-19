import request from 'supertest';
import { User } from '../models/user.model';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../app';



jest.mock("../models/user.model");
jest.mock("jsonwebtoken");
jest.mock("bcrypt");


describe("Auth",()=>{
    beforeEach(()=>{
        jest.clearAllMocks();
    });
    describe("POST /api/v1/auth/register",()=>{
        it("it should registered user successfully with a status code of 200",async()=>{
          (User.findOne as jest.Mock).mockReturnValue(null);
           (bcrypt.hash as jest.Mock).mockResolvedValue(true);
            const res=await request(app)
            .post("/api/v1/auth/register")
            .send({
                name:"test",
                userName:"test1",
                email:"test@gmail.com",
                password:"123123"
            });
            expect(res.status).toBe(201);
            expect(res.body.message).toBe("successfully verified");
            expect(res.body.success).toBe(true);
        });
    });
});