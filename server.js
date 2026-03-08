const express = require("express")
const fs = require("fs")
const multer = require("multer")
const { v4: uuidv4 } = require("uuid")

const app = express()
const http = require("http").createServer(app)
const io = require("socket.io")(http)

app.use(express.json())
app.use(express.static("public"))
app.use("/uploads", express.static("uploads"))

if(!fs.existsSync("uploads")){
fs.mkdirSync("uploads")
}

const storage = multer.diskStorage({
destination:"uploads/",
filename:(req,file,cb)=>{
cb(null,Date.now()+"_"+file.originalname)
}
})

const upload = multer({storage})

let users = []
let chats = []
let onlineUsers = {}

if(fs.existsSync("data.json")){
const data = JSON.parse(fs.readFileSync("data.json"))
users = data.users || []
chats = data.chats || []
}

function save(){
fs.writeFileSync("data.json",JSON.stringify({users,chats},null,2))
}

/* REGISTER */

app.post("/register",(req,res)=>{

const {username,password} = req.body

if(users.find(u=>u.username===username)){
return res.json({error:"Пользователь существует"})
}

const user={
id:uuidv4(),
username,
password
}

users.push(user)

save()

res.json({success:true})

})

/* LOGIN */

app.post("/login",(req,res)=>{

const {username,password} = req.body

const user = users.find(u=>u.username===username && u.password===password)

if(!user) return res.json({error:"Ошибка входа"})

res.json({success:true,...user})

})

/* USERS */

app.get("/users",(req,res)=>{

res.json(
users.map(u=>({
...u,
online: !!onlineUsers[u.id]
}))
)

})

/* CREATE CHAT */

app.post("/createChat",(req,res)=>{

const {members} = req.body

let chat = chats.find(c=>
c.members.includes(members[0]) &&
c.members.includes(members[1])
)

if(!chat){

chat={
id:uuidv4(),
members,
messages:[]
}

chats.push(chat)

save()

}

res.json({chat})

})

/* SEND MESSAGE */

app.post("/sendMessage",upload.single("file"),(req,res)=>{

const {chatId,userId,text} = req.body

const chat = chats.find(c=>c.id===chatId)

if(!chat) return res.json({error:"чат не найден"})

const message={

id:uuidv4(),

userId,

text,

file:req.file?"/uploads/"+req.file.filename:null,

time:new Date().toLocaleTimeString(),

read:false

}

chat.messages.push(message)

save()

io.emit("newMessage",chatId)

res.json({success:true})

})

/* GET DATA */

app.get("/data/:userId",(req,res)=>{

const userId=req.params.userId

const userChats=chats.filter(c=>c.members.includes(userId))

res.json({chats:userChats})

})

/* SOCKET */

io.on("connection",socket=>{

socket.on("login",userId=>{

onlineUsers[userId]=true

io.emit("onlineUpdate")

})

socket.on("disconnect",()=>{

for(const id in onlineUsers){
delete onlineUsers[id]
}

io.emit("onlineUpdate")

})

})

http.listen(3000,()=>{

console.log("Server started http://localhost:3000")

})