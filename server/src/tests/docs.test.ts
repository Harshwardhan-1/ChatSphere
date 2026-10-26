import { docs } from "../models/docs.model";
import { create, deleteDocs } from '../controllers/docs.controller';


jest.mock("../models/docs.model");



describe("docs_controller",()=>{
    beforeEach(()=>{
        jest.clearAllMocks();
    });

    describe("create",()=>{
        const input={
                creatorId:"507f1f77bcf86cd799439011",
                docsName:"test",
                editPermission:["123","456"],
                viewPermission:["987","654"],
        }
        it("it should create docs successfully",async()=>{
            const socket={emit:jest.fn()} as any;
            const io={to:jest.fn().mockReturnValue({emit:jest.fn()})} as any;
            const save=jest.fn();
            (docs.create as jest.Mock).mockResolvedValue({
                _id:"123",
                creatorId:"123docs",
                docsName:"test",
                editPermission:["122","456"],
                viewPermission:["122","456"],
                save,
            });
            (docs.find as jest.Mock).mockReturnValue({
                select:jest.fn().mockReturnValue({
                    sort:jest.fn().mockResolvedValue([])
                })
            });
            await create({
                creatorId:"507f1f77bcf86cd799439011",
                docsName:"test",
                editPermission:["123","456"],
                viewPermission:["987","654"],
            },socket,io,{},{});
            expect(docs.create).toHaveBeenCalled();
            expect(save).toHaveBeenCalled();
            expect(socket.emit).toHaveBeenCalledWith("docs_created",{docsId:"123"});
        });

        it("it should give parsed error",async()=>{
            const socket={emit:jest.fn()} as any;
            const io={to:jest.fn().mockReturnValue({emit:jest.fn()})} as any;
            await expect(create({
                creatorId:"507f1f77bcf86cd799439011",
                docsName:"te",
                editPermission:["123","456"],
                viewPermission:["987","654"],
            },socket,io,{},{})).rejects.toThrow("docs name must be atleast 3 characters");
            expect(docs.create).not.toHaveBeenCalled();
        });

        it("it should return failed to create docs",async()=>{
           const socket={emit:jest.fn()} as any;
           const io={to:jest.fn().mockReturnValue({emit:jest.fn()})} as any;
           (docs.create as jest.Mock).mockResolvedValue(null);

           await expect(create(input,socket,io,{},{})).rejects.toThrow("failed to create docs");

           expect(docs.create).toHaveBeenCalled();
        });
    });
    //delete
    describe("delete",()=>{
        const socket={emit:jest.fn()} as any;
        const io={to:jest.fn().mockReturnValue({emit:jest.fn()})} as any;
        it("it should delete docs successfully",async()=>{
            const input={
            docsId:"123",
            senderId:"456",
        };
            (docs.findById as jest.Mock).mockResolvedValue({
                _id:"123",
                creatorId:"456",
                editPermission:["123","456"],
                viewPermission:["789","987"],
                deleteOne:jest.fn().mockResolvedValue({}),
            });
            
            await deleteDocs(input,socket,io,{"789":"receiverSocketId"});
            expect(socket.emit).toHaveBeenCalledWith("docs_deleted",{docsId:"123",senderId:"456",msg:"This Doc has been deleted by the owner"});
            expect(io.to).toHaveBeenCalledWith("receiverSocketId")
        });
        it("it should give permission denied",async()=>{
            const input={
                docsId:"1",
                senderId:"12",
            };
            (docs.findById as jest.Mock).mockResolvedValue({
                docsId:"123",
                creatorId:"456",
                editPermission:["123","456"],
                viewPermission:["789","654"],
                deleteOne:jest.fn().mockResolvedValue({}),
            });
            await expect(deleteDocs(input,socket,io,{})).rejects.toThrow("don't have access to delete this docs");
           });
           it("it should give 404 not found",async()=>{
            const input={
                docsId:"1",
                senderId:"12",
            };
            (docs.findById as jest.Mock).mockResolvedValue(null);
            await expect(deleteDocs(input,socket,io,{})).rejects.toThrow("docs not found");
        });
        });

});                 