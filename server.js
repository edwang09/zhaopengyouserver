const express = require('express');
const app = express()
const http = require('http');
const WebSocket = require('ws');

const port = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server })
const PLAYERNUMBER = 6
const NUMLIST = ["2","3","4","5","6","7","8","9","t","t1","t2","t3","ta"]
const SUITLIST = ["D","H","S","C"]
//room instances
let ROOMS = {}
let ROOMINTERVALS = {}
//player instances
let PLAYERS = {}
//player instances
let WSS = {}
//room initializer
const roomPlayer = function(playerid, roomNumber){
    return {
        isAlive: true,
        playerid,
        displayName: PLAYERS[playerid].displayName,
        avatar: PLAYERS[playerid].avatar,
        cardCount:0,
        onBoard:false,
        points:[],
        score:roomNumber,
        scoreQueue:[]
    }
}
//room initializer
const defaultRoom = function(roomid, roomName, roomNumber, playerid){
    return {
        roomid,
        hostid: playerid,
        roomName,
        roomNumber,
        status: "pending",
        gamestatus: "pending",
        players: [roomPlayer(playerid, roomNumber)],
        mainCalls:[],
        lastPlay:[],
        currentPlay:[],
        inTurn: playerid
    }
}
//player initializer
const defaultPlayer = function(playerid, displayName,avatar){
    return {
        isAlive: true,
        lostconnection: 0,
        playerid,
        displayName,
        avatar,
        handCard:[]
    }
}

wss.on('connection', function(ws) {
    // console.log("connection created")

    ws.on('message', function(data) {
        if (data.split(":")[0]==="pong") {
            if(PLAYERS[data.split(":")[1]]) PLAYERS[data.split(":")[1]].isAlive = true;
        }else{
            // console.log("get message")
            const {action, playerid,roomid, payload} = JSON.parse(data)
            console.log(action)
            switch (action) {
                case "register player":
                    registerPlayer(payload).then((playerid)=>{
                        WSS[playerid] = ws
                        ws.send(JSON.stringify({action:"register player", playerid, handCard: PLAYERS[playerid].handCard}))
                        ws.send(roomList())
                    }).catch(err=>{
                        ws.send(JSON.stringify({
                            action: "reset session"
                        }))
                    })
                break;
    
                case "create room":
                    createRoom(playerid,payload).then((room)=>{
                        //send created room back
                        ws.send(JSON.stringify({
                            action: "create room", 
                            room
                        }))
                        broadcastRoomList()
                    }).catch(err=>{
                        ws.send(JSON.stringify({
                            action: "reset session"
                        }))
                    })
                break;
    
                case "list rooms":
                    ws.send(roomList())
                break;
    
                case "join room":
                    joinRoom(playerid,payload).then((room,playerid)=>{
                        //use when reconnect
                        if (playerid) WSS[playerid] = ws
                        //send joined room back
                        ws.send(JSON.stringify({
                            action: "join room", 
                            room
                        }))
                        broadcastRoom(room.roomid,"refresh room")
                        broadcastRoomList()
                    }).catch(err=>{
                        ws.send(JSON.stringify({
                            action: "reset room"
                        }))
                    })
                break;
    
                case "leave room":
                    leaveRoom(playerid,roomid).then((room)=>{
                        //send joined room back
                        ws.send(JSON.stringify({
                            action: "leave room"
                        }))
                        broadcastRoom(room.roomid, "refresh room")
                        cleanRoom()
                        broadcastRoomList()
                    }).catch(err=>{
                        console.log(err)
                    })
                break;
    
                case "start game":
                    startGame(playerid, roomid)
                break;
                case "main call":
                    mainCall(playerid, roomid, payload.main)
                break;
                case "bury":
                    bury(playerid, roomid, payload.lefted, payload.card)
                break;
                case "play":
                    play(playerid, roomid, payload.card, payload.lefted, payload.last, payload.dump)
                break;
                case "ticket":
                    ticket(playerid, roomid, payload.ticket)
                break;
                case "reasign":
                    reasign(playerid, roomid, payload.playerid)
                break;
                case "kick":
                    kick(playerid, roomid, payload.playerid)
                break;
                case "assigndealer":
                    assignDealer(playerid, roomid, payload.playerid)
                break;
                case "rescore":
                    rescore(playerid, roomid, payload.playerid, payload.score)
                break;
                case "revert":
                    revert(playerid, roomid)
                break;
                default:
                break;
            }
        }
    })
    ws.on('close', function(data) {
        // console.log("connection close")
    })
})

//roomwise operations
function registerPlayer(payload){
    return new Promise((resolve, reject)=>{
        const {displayName, playerid, avatar}=payload
        if (playerid && PLAYERS[playerid] && WSS[playerid]) resolve(playerid)
        if (playerid) reject(playerid)
        if (!displayName) reject("no name provided")
        let newplayerid
        do {
            newplayerid = "P" + Math.random().toString(36).substr(2, 9);
        }
        while (PLAYERS[newplayerid]);
        PLAYERS[newplayerid]=defaultPlayer(newplayerid, displayName, avatar)
        resolve(newplayerid)
    })
}
function createRoom(playerid,payload){
    return new Promise((resolve, reject)=>{
        const {roomName, roomNumber} = payload
        if (!playerid) return reject("registration required")
        if (!roomName) return reject("roomName required")
        if (!roomNumber) return reject("roomNumber required")
        let roomid
        do {
            roomid =  "R" + Math.random().toString(36).substr(2, 5);
        }
        while (ROOMS[roomid]);
        ROOMS[roomid]=defaultRoom(roomid, roomName, roomNumber, playerid)
        resolve(ROOMS[roomid])
    })
}
function joinRoom(playerid, payload){
    const {roomid} = payload
    return new Promise((resolve, reject)=>{
        if (!roomid) {
            reject("roomid not provided")
        }else if (!ROOMS[roomid]) { 
            reject("roomid not exist")
        }else if (ROOMS[roomid].players.filter(p=>p.playerid===playerid).length>0) { 
            ROOMS[roomid].players[ROOMS[roomid].players.findIndex(p=>p.playerid===playerid)].isAlive = true
            PLAYERS[playerid].isAlive = true
            resolve(ROOMS[roomid],playerid)
        }else if (ROOMS[roomid].status === "halt") { 
            const haltIndex = ROOMS[roomid].players.findIndex(p=>p.playerid==="HALT")
            ROOMS[roomid].players[haltIndex].playerid = playerid
            ROOMS[roomid].players[haltIndex].avatar = PLAYERS[playerid].avatar
            ROOMS[roomid].players[haltIndex].displayName = PLAYERS[playerid].displayName
            PLAYERS[playerid].isAlive = true
            PLAYERS[playerid].handCard = ROOMS[roomid].players[haltIndex].handCard
            if (ROOMS[roomid].inTurn === "HALT") {
                ROOMS[roomid].inTurn = playerid
            }
            if (ROOMS[roomid].winnerid === "HALT") {
                ROOMS[roomid].winnerid = playerid
            }
            if (ROOMS[roomid].dealerid === "HALT") {
                ROOMS[roomid].dealerid = playerid
            }
            if (ROOMS[roomid].hostid === "HALT") {
                ROOMS[roomid].hostid = playerid
            }
            if (ROOMS[roomid].players.findIndex(p=>p.playerid==="HALT")===-1){
                ROOMS[roomid].status = "in game"
            }
            resolve(ROOMS[roomid],playerid)
        }else if (ROOMS[roomid].status === "full") { 
            reject("room is full")
        }else{
            ROOMS[roomid].players.push(roomPlayer(playerid, ROOMS[roomid].roomNumber))
            PLAYERS[playerid].roomid = roomid
            if (ROOMS[roomid].players.length === 6) {
                ROOMS[roomid].status = "full"
            }
            resolve(ROOMS[roomid])
        }
    })
}
function leaveRoom(playerid, roomid){
    return new Promise((resolve, reject)=>{
        if (!roomid) {
            reject("roomid not provided")
        }else if (!ROOMS[roomid]) { 
            reject("roomid not exist")
        }else{
            PLAYERS[playerid].roomid = null
            PLAYERS[playerid].handCard = []
            ROOMS[roomid].players = ROOMS[roomid].players.filter(player => player.playerid !== playerid)
            if (ROOMS[roomid].players.length > 0 && playerid===ROOMS[roomid].hostid){ 
                ROOMS[roomid].inTurn=ROOMS[roomid].players[0].playerid
                ROOMS[roomid].hostid=ROOMS[roomid].players[0].playerid
            }
            ROOMS[roomid].status = "pending"
            ROOMS[roomid].gamestatus = "pending",
            resolve(ROOMS[roomid])
        }
    })
}




//gamewise operations
function startGame(playerid, roomid){
    if (ROOMS[roomid].status==="pending" || checkParameters([roomid])) {
        // console.log("game started with pending status")
        return
    }
    // reset room parameters
    let cardDeck = getsuffledCards()
    ROOMS[roomid].currentPlay = []
    ROOMS[roomid].lastPlay = []
    ROOMS[roomid].history = []
    ROOMS[roomid].ticket = []
    ROOMS[roomid].encryptbury = []
    ROOMS[roomid].bury = []
    ROOMS[roomid].buryPoint = []
    ROOMS[roomid].mainSuit = ""
    ROOMS[roomid].status = "in game"
    ROOMS[roomid].gamestatus = "draw"
    ROOMS[roomid].tempDealerid = null
    if (!ROOMS[roomid].mainNumber) ROOMS[roomid].mainNumber = ROOMS[roomid].roomNumber
    // reset player parameters
    ROOMS[roomid].players.map((player,id)=>{
        PLAYERS[player.playerid].handCard = []
        ROOMS[roomid].players[id].onBoard = false
        ROOMS[roomid].players[id].points = []
    })
    broadcastRoom(roomid, "start game")

    clearInterval(ROOMINTERVALS[roomid])
    ROOMINTERVALS[roomid] = setInterval(()=>{
        //deal to player instance and wssend
        dealCard(cardDeck.pop(), roomid)
        if (cardDeck.length === 6){
            clearInterval(ROOMINTERVALS[roomid])
            ROOMS[roomid].gamestatus = "maincall"
            ROOMS[roomid].countdown = 5
            broadcastRoom(roomid, "start maincall")
            ROOMINTERVALS[roomid] = setInterval(()=>{
                const tempDealerid = ROOMS[roomid].tempDealerid
                if (ROOMS[roomid].countdown > 0) {
                    ROOMS[roomid].countdown = ROOMS[roomid].countdown - 1
                    broadcastRoom(roomid, "countdown main")
                }else if(!tempDealerid) {
                    clearInterval(ROOMINTERVALS[roomid])
                    startGame(playerid, roomid)
                }else{
                    clearInterval(ROOMINTERVALS[roomid])
                    if (!ROOMS[roomid].dealerid) ROOMS[roomid].dealerid=tempDealerid
                    const dealerid = ROOMS[roomid].dealerid
                    //change turn to dealer
                    ROOMS[roomid].inTurn = dealerid
                    ROOMS[roomid].winnerid = dealerid
                    const dealerIndex = ROOMS[roomid].players.findIndex(p=>p.playerid===dealerid)
                    ROOMS[roomid].players[dealerIndex].onBoard = true
                    //start bury
                    ROOMS[roomid].gamestatus = "bury"
                    PLAYERS[dealerid].handCard = [...PLAYERS[dealerid].handCard, ...cardDeck]
                    WSS[ROOMS[roomid].dealerid].send(JSON.stringify({action:"bury", card:cardDeck}))
                    broadcastRoom(roomid, "start bury")
                }
            },1000)
        }
    },200)
}
function dealCard(card, roomid){
    //get current playerid and deal card
    const currentplayerindex = ROOMS[roomid].players.findIndex(player=>player.playerid === ROOMS[roomid].inTurn)
    const nextplayerindex = (currentplayerindex+1) % PLAYERNUMBER
    const currentplayerid = ROOMS[roomid].players[currentplayerindex].playerid
    if (ROOMS[roomid].players.length !== 6){
        clearInterval(ROOMINTERVALS[roomid])
        ROOMS[roomid].status = "pending"
    }else{
        PLAYERS[currentplayerid].handCard.push(card)
        WSS[currentplayerid].send(JSON.stringify({action:"deal", card, playerid:currentplayerid}))
        ROOMS[roomid].inTurn = ROOMS[roomid].players[nextplayerindex].playerid
    }
}
function mainCall(playerid, roomid, main){
    if (checkParameters([playerid, roomid, main])){
        return
    }else if (ROOMS[roomid].tempDealerid !== playerid && (!ROOMS[roomid].mainCalls[0] || ROOMS[roomid].mainCalls[0].card.length < main.length)){
        ROOMS[roomid].mainSuit = main[0].slice(0,1)
        ROOMS[roomid].mainCalls.unshift({card:main, playerid})
    }else if (ROOMS[roomid].tempDealerid === playerid && ROOMS[roomid].mainCalls[0].card[0].slice(0,1) === main[0].slice(0,1)){
        ROOMS[roomid].mainCalls[0].card = [...ROOMS[roomid].mainCalls[0].card, ...main]
    }else{
        WSS[playerid].send(JSON.stringify({
            action: "main call failed", 
            room :ROOMS[roomid]
        }))
        return
    }
    ROOMS[roomid].tempDealerid = playerid
    ROOMS[roomid].countdown = 5
    broadcastRoom(roomid, "main call")
}
function bury(playerid, roomid, lefted, bury){
        ROOMS[roomid].encryptbury = bury
        // ROOMS[roomid].bury = bury
        ROOMS[roomid].gamestatus = "ticketcall"
        ROOMS[roomid].mainCalls = []
        PLAYERS[playerid].handCard = lefted
        broadcastRoom(roomid, "start ticketcall")
}
function ticket(playerid, roomid, ticket){
    ROOMS[roomid].countTicket1 = 0
    ROOMS[roomid].countTicket2 = 0
    ROOMS[roomid].ticket = ticket
    ROOMS[roomid].gamestatus = "in play"
    broadcastRoom(roomid, "start play")
}
function play(playerid, roomid, card, lefted, last, dump){
    if (dump){
        const play = validateDump(playerid, roomid, card)
        const succeed = (card.length === play.length)
        ROOMS[roomid].dumpCard = {
            playerid,
            card,
            play,
            succeed
        }
        broadcastRoom(roomid, "dump")
        play.map(card=>{
            const cardIndex = PLAYERS[playerid].handCard.indexOf(card)
            if (cardIndex > -1){
                PLAYERS[playerid].handCard = [...PLAYERS[playerid].handCard.slice(0,cardIndex), ...PLAYERS[playerid].handCard.slice(cardIndex+1)]
            }
        })
        WSS[playerid].send(JSON.stringify({action:succeed ? "dump succeed" : "dump failed", handCard: PLAYERS[playerid].handCard}))
        broadcastRoom(roomid, succeed ? "succeed dump" : "failed dump")
        card = play
        lefted = PLAYERS[playerid].handCard
    }
    const thisPlay = ROOMS[roomid].currentPlay
    const mainSuit = ROOMS[roomid].mainSuit
    const mainNumber = ROOMS[roomid].mainNumber
    const currentplayerindex = ROOMS[roomid].players.findIndex(player=>player.playerid === ROOMS[roomid].inTurn)
    verifyTickets(roomid, card, currentplayerindex)
    if (ROOMS[roomid].currentPlay.length===6){
        ROOMS[roomid].history = [{play:ROOMS[roomid].lastPlay, winnerid:ROOMS[roomid].lastwinnerid}, ...ROOMS[roomid].history]
        ROOMS[roomid].lastPlay = thisPlay
        ROOMS[roomid].currentPlay =[]
    }
    ROOMS[roomid].currentPlay.push({card,playerid})
    PLAYERS[playerid].handCard = lefted
    //checkout
    if (ROOMS[roomid].currentPlay.length===6){
        const totalPoint = getPoint(thisPlay)
        const winnerid = checkWin(thisPlay, mainSuit, mainNumber)
        const winnerindex = ROOMS[roomid].players.findIndex(p=>p.playerid === winnerid)
        ROOMS[roomid].lastwinnerid = ROOMS[roomid].winnerid
        ROOMS[roomid].winnerid = winnerid
        ROOMS[roomid].inTurn = winnerid
        ROOMS[roomid].lastPoint = totalPoint
        if (!ROOMS[roomid].players[winnerindex].onBoard) ROOMS[roomid].players[winnerindex].points = [...ROOMS[roomid].players[winnerindex].points, totalPoint]
        if (last){ 
            ROOMS[roomid].bury = ROOMS[roomid].encryptbury
            const buryPoint = ROOMS[roomid].encryptbury
            .filter(cd=>(cd.slice(1)==="t" || cd.slice(1)==="t3" || cd.slice(1)==="5"))
            .reduce((t,p)=>{
                if (p.slice(1)==="5") return t+5
                return t+10
            },0)
            if (!ROOMS[roomid].players[winnerindex].onBoard){
                const lastHand = decompose(ROOMS[roomid].currentPlay[0], ROOMS[roomid].mainSuit, ROOMS[roomid].mainNumber).result
                const maxSize = lastHand.reduce((max,cur)=>{
                    if (cur.size>max) return cur.size
                    return max
                },1)
                const maxTLJ = lastHand.reduce((max,cur)=>{
                    if (cur.tlj>max) return cur.tlj
                    return max
                },1)
                ROOMS[roomid].buryMultiplier = 2**(maxSize+maxTLJ-1)
                ROOMS[roomid].buryPoint = buryPoint*(2**(maxSize+maxTLJ-1))
            } 
            ROOMS[roomid].gamestatus = "end"
            const playPoint = ROOMS[roomid].players.filter(p=>!p.onBoard).reduce((total, currp)=>{
                return total + currp.points.reduce((tot,pl)=>{
                    return tot + pl.reduce((t,p)=>{
                        if (p.slice(1)==="5") return t + 5
                        return t+10
                    },0)
                },0)
            },0)
            //checkout score for this round
            ROOMS[roomid].finalPoint = ROOMS[roomid].buryPoint + playPoint
            const currentDealerIndex = ROOMS[roomid].players.findIndex(p=>p.playerid===ROOMS[roomid].dealerid)
            let switched = false
            if (ROOMS[roomid].finalPoint>=160){
                //勾到底
                if (mainNumber==="t1" && playPoint>=160 && !ROOMS[roomid].players[winnerindex].onBoard &&
                    ROOMS[roomid].currentPlay.filter(pl=>pl.playerid === winnerid)[0].card.some(cd=>cd.slice(1)==="t1")){ 
                     ROOMS[roomid].players[currentDealerIndex].score = "2"
                }
                const increment = Math.floor((ROOMS[roomid].finalPoint-160)/80) + 1
                ROOMS[roomid].increment = increment
                ROOMS[roomid].win = true
                for (let i = 0; i < 6; i++) {
                    const j = (i + currentDealerIndex) % 6
                    if (!ROOMS[roomid].players[j].onBoard){ 
                        const currentNum = NUMLIST.indexOf(ROOMS[roomid].players[j].score)
                        ROOMS[roomid].players[j].score = NUMLIST[(currentNum+increment)%13]
                        if (currentNum<9 && (currentNum+increment)>=9) ROOMS[roomid].players[j].scoreQueue = [... ROOMS[roomid].players[j].scoreQueue, "t1"]
                    }
                    if (i!==0 && !switched && !ROOMS[roomid].players[j].onBoard) {
                        switched = true
                        ROOMS[roomid].dealerid = ROOMS[roomid].players[j].playerid
                        ROOMS[roomid].mainNumber = ROOMS[roomid].players[j].score
                        if (ROOMS[roomid].players[j].scoreQueue.length>0){ 
                            ROOMS[roomid].mainNumber = ROOMS[roomid].players[j].scoreQueue[0]
                        }
                    }
                }
            }else{
                let decrement = 1
                if (ROOMS[roomid].finalPoint < 80){
                    decrement = decrement + 1
                }
                if (ROOMS[roomid].finalPoint < 40){
                    decrement = decrement + 1
                }
                if (ROOMS[roomid].finalPoint === 0){
                    decrement = decrement + 1
                }
                ROOMS[roomid].increment = decrement
                ROOMS[roomid].win = false
                for (let i = 0; i < 6; i++) {
                    const j = (i + currentDealerIndex) % 6
                    if (ROOMS[roomid].players[j].onBoard){ 
                        const currentNum = NUMLIST.indexOf(ROOMS[roomid].players[j].score)
                        ROOMS[roomid].players[j].score = NUMLIST[(NUMLIST.indexOf(ROOMS[roomid].players[j].score)+decrement)%13]
                        if (currentNum<9 && (currentNum + decrement)>=9) ROOMS[roomid].players[j].scoreQueue = [... ROOMS[roomid].players[j].scoreQueue, "t1"]
                        if (currentNum === 9 && i === 0) ROOMS[roomid].players[j].scoreQueue = ROOMS[roomid].players[j].scoreQueue.slice(1)
                    }
                    if (i!==0 && !switched && ROOMS[roomid].players[j].onBoard) {
                        switched = true
                        ROOMS[roomid].dealerid = ROOMS[roomid].players[j].playerid
                        ROOMS[roomid].mainNumber = ROOMS[roomid].players[j].score
                        if (ROOMS[roomid].players[j].scoreQueue.length>0){
                            ROOMS[roomid].mainNumber = ROOMS[roomid].players[j].scoreQueue[0]
                        }
                    }
                }
            }
            broadcastRoom(roomid, "end")
            return
        }
    }else{
        const nextplayerindex = (currentplayerindex+1) % PLAYERNUMBER
        ROOMS[roomid].inTurn = ROOMS[roomid].players[nextplayerindex].playerid
    }
    broadcastRoom(roomid, "play")
}

function reasign(playerid, roomid, winnerid){
    if (ROOMS[roomid].inTurn !== ROOMS[roomid].winnerid ) return
    const currentWinnerid = ROOMS[roomid].inTurn 
    const currentWinnerIndex = ROOMS[roomid].players.findIndex(p=>p.playerid === currentWinnerid) 
    const winnerIndex = ROOMS[roomid].players.findIndex(p=>p.playerid === winnerid) 
    ROOMS[roomid].inTurn = winnerid
    ROOMS[roomid].winnerid = winnerid
    const lastPoint = ROOMS[roomid].lastPoint
    if(!ROOMS[roomid].players[currentWinnerIndex].onBoard ){
        const remaining = ROOMS[roomid].players[currentWinnerIndex].points.slice(0,ROOMS[roomid].players[currentWinnerIndex].points.length-1)
        ROOMS[roomid].players[currentWinnerIndex].points = remaining
    }
    if (!ROOMS[roomid].players[winnerIndex].onBoard){
        ROOMS[roomid].players[winnerIndex].points.push(lastPoint)
    }
    broadcastRoom(roomid, "reasign")
}
function kick(playerid, roomid, kickid){
    console.log("kick")
    const kickIndex = ROOMS[roomid].players.findIndex(p=>p.playerid === kickid) 
    let handCard = []
    
    if (PLAYERS[kickid]){
        handCard = PLAYERS[kickid].handCard
        PLAYERS[kickid].roomid = null
        PLAYERS[kickid].handCard = []
        WSS[kickid].send(JSON.stringify({
            action: "leave room"
        }))
    }
    if (ROOMS[roomid].status === "in game"){
        if (ROOMS[roomid].inTurn === kickid) {
            ROOMS[roomid].inTurn = "HALT"
        }
        if (ROOMS[roomid].winnerid === kickid) {
            ROOMS[roomid].winnerid = "HALT"
        }
        if (ROOMS[roomid].dealerid === kickid) {
            ROOMS[roomid].dealerid = "HALT"
        }
        if (ROOMS[roomid].hostid === kickid) {
            ROOMS[roomid].hostid = "HALT"
        }
        ROOMS[roomid].players[kickIndex].playerid = "HALT"
        ROOMS[roomid].players[kickIndex].displayName = "空闲座位"
        ROOMS[roomid].players[kickIndex].avatar = 0
        ROOMS[roomid].status = "halt"
        ROOMS[roomid].players[kickIndex].handCard = handCard
    }else{
        ROOMS[roomid].status = "pending"
        ROOMS[roomid].players = ROOMS[roomid].players.filter(p=>p.playerid !== kickid) 
    }
    broadcastRoom(roomid, "kick")
    cleanRoom()
    broadcastRoomList()
}
function assignDealer(playerid, roomid, dealerid){
    if(dealerid === "race"){
        ROOMS[roomid].dealerid = null
    }else{
        ROOMS[roomid].dealerid = dealerid
    }
    broadcastRoom(roomid, "assigndealer")

}
function rescore(playerid, roomid, playerid, score){
    // console.log(playerid, roomid, playerid, score)
    const playeridIndex = ROOMS[roomid].players.findIndex(p=>p.playerid === playerid) 
    ROOMS[roomid].players[playeridIndex].score = score
    broadcastRoom(roomid, "rescore")
}
function revert(playerid, roomid){
    if (ROOMS[roomid].currentPlay.length===6) {
        ROOMS[roomid].winnerid = ROOMS[roomid].lastwinnerid
        ROOMS[roomid].lastwinnerid = ROOMS[roomid].history[0] ? ROOMS[roomid].history[0].winnerid : ROOMS[roomid].dealerid
    }
    ROOMS[roomid].inTurn = ROOMS[roomid].winnerid
    ROOMS[roomid].currentPlay.map(play=>{
        PLAYERS[play.playerid].handCard = [...PLAYERS[play.playerid].handCard, ...play.card]
        WSS[play.playerid].send(JSON.stringify({action:"revert", handCard : PLAYERS[play.playerid].handCard}))
    })
    ROOMS[roomid].currentPlay = ROOMS[roomid].lastPlay
    ROOMS[roomid].lastPlay = ROOMS[roomid].history[0] ? ROOMS[roomid].history[0].play : []
    ROOMS[roomid].history = ROOMS[roomid].history.slice(1)
    broadcastRoom(roomid, "revert play")
}
//card handling helpers
function getsuffledCards(){
    const set = SUITLIST.reduce((res, cat)=>{
        const num = NUMLIST.map(num=>{
            return cat+num
        })
        return [...res, ...num]
    },["J0","J1"])
    const foursets = [...set,...set,...set,...set].sort(() => Math.random() - 0.5);
    return foursets
}
function getPoint(play){
    return play.reduce((list, p)=>{
        const currentList = p.card.filter(c=>(c.slice(1)==="5" || c.slice(1)==="t" || c.slice(1)==="t3"))
        return [...list, ...currentList]
    },[])
}
function checkWin(play, mainSuit, mainNumber){
    const startCard = play[0].card
    const startCardD = decompose(play[0], mainSuit,  mainNumber)
    let winning 
    if (isMain(startCard[0], mainSuit, mainNumber) || startCardD.result.length > 1){
        // console.log("main or dump")
        winning = play.slice(1)
        .filter(p=>(p.card.every(c=>isMain(c, mainSuit, mainNumber))))
        .map(p=> decompose(p, mainSuit,  mainNumber))
        .reduce((winner, pd)=>{
            if (challengeD(winner.origin, pd, mainSuit,  mainNumber, winner.play)){
                return {...winner, play:pd}
            }
            return winner
        },{play:startCardD, origin: startCardD}).play.playerid
    }else{
        // console.log("normal")
        winning = play.slice(1)
        //All Main or All non-main same suit
        .filter(p=>( p.card.every(c=>isMain(c, mainSuit, mainNumber)) || p.card.every(c=>(!isMain(c, mainSuit, mainNumber) && c.slice(0,1)===startCard[0].slice(0,1)))))
        .map(p=> decompose(p, mainSuit,  mainNumber))
        .reduce((winner, pd)=>{
            if (challengeD(winner, pd, mainSuit,  mainNumber)){
                return pd
            }
            return winner
        },startCardD).playerid
    }
    return winning 
}
function cardDict(card){
    return card.reduce((dict,card)=>{
        if (dict[card]){
          return {...dict, [card]:dict[card]+1}
        }
        return {...dict, [card]:1}
      },{})
}
function decompose(play, mainSuit,  mainNumber){
    let playerid = null
    let card = play
    if (play.card && play.playerid){
        playerid = play.playerid
        card = play.card
    }
    const carddict = cardDict(card)
    // console.log(carddict)
    const summary = Object.keys(carddict).reduce((part,cd)=>{
        if (part[[carddict[cd]]]) return {...part, [carddict[cd]]:[...part[[carddict[cd]]],cd]}
        return {...part, [carddict[cd]]:[cd]}
    },{1:[],2:[],3:[],4:[]})
    // console.log(summary)
    const result = [1,2,3,4].reduce((arry, key)=>{
        return [...arry, ...getTlj(key, summary[key], mainSuit,  mainNumber)]
    },[])
    // console.log({result , playerid})
    return {result , playerid}
}
//Compare two sets of played card, if there is an winningset, it means dumpcard or main has already been challenged by it.
function challengeD(setA, setB, mainSuit, mainNumber, winningset){
    const startCard = setA.result
    const challengeCard = setB.result
    let winning = true
    if (winningset){
        const winningCard = winningset.result.sort((a,b)=>(b.size*5+b.tlj)-(a.size*5+a.tlj))[0].card
        const currentCard = challengeCard.sort((a,b)=>(b.size*5+b.tlj)-(a.size*5+a.tlj))[0].card
        winning = sortHand([winningCard, currentCard], mainSuit, mainNumber)[0] !== winningCard
    }
    if (startCard.length !== challengeCard.length) return false
    if ((startCard.some((item,idx)=>(
        item.size !== challengeCard[idx].size || 
        item.tlj !== challengeCard[idx].tlj || 
        sortHand([item.card, challengeCard[idx].card], mainSuit,  mainNumber)[0] === item.card
    ))) || !winning
    ) return false
    return true
}
function challengeDump(cardA, setB, mainSuit, mainNumber){
    const carddict = cardDict(cardA)
    const cardD = getTlj(setB.size, Object.keys(carddict).filter(key=>carddict[key]>=setB.size), mainSuit, mainNumber)
    return cardD.some(d=>(setB.size <= d.size && setB.tlj <= d.tlj && setB.card < d.card ))
}
function sortHand(handCard, mainSuit,  mainNumber){
    let normalCard = handCard
    let mainCard = []
    mainCard = [
    ...normalCard.filter(a=>a.slice(0,1)==="J").sort(),
    ...normalCard.filter(a=>a.slice(1)===mainNumber && a.slice(0, 1)===mainSuit),
    ...normalCard.filter(a=>a.slice(1)===mainNumber && a.slice(0, 1)!==mainSuit),
    ...normalCard.filter(a=>a.slice(0, 1)===mainSuit && a.slice(1)!==mainNumber ).sort().reverse()
    ]
    normalCard = normalCard.filter(a=>a.slice(0,1)!=="J" && a.slice(1)!==mainNumber && a.slice(0, 1)!==mainSuit).sort().reverse()
    return [ 
        ...mainCard,
        ...normalCard,
    ]
}
function isMain(card, mainSuit, mainNumber){
    return (card.slice(1)===mainNumber || card.slice(0, 1)===mainSuit || card.slice(0, 1)==="J")
}
function isAdjacent(card1, card2, mainSuit,  mainNumber ){
    const ADHELPER = ["x","2","3","4","5","6","7","8","9","t","t1","t2","t3","ta"]
    if (isMain(card1, mainSuit, mainNumber)!== isMain(card2, mainSuit, mainNumber)){
      return false
    }
    const locCard1 = ADHELPER.indexOf(card1.slice(1))
    const locCard2 = ADHELPER.indexOf(card2.slice(1))
    const locMain = ADHELPER.indexOf(mainNumber)
    if ((card1==="J0" && card2==="J1") || 
    (card1==="J1" && card2.slice(0,1)===mainSuit && card2.slice(1)===mainNumber) ||
    (card1.slice(0,1)===mainSuit && card1.slice(1)===mainNumber && card2.slice(0,1)!==mainSuit && card2.slice(1)===mainNumber) ||
    (card1.slice(0,1)!==mainSuit && card1.slice(1)===mainNumber && card1.slice(1)!=="ta" && card2.slice(0,1)===mainSuit && card2.slice(1)==="ta") ||
    (card1.slice(0,1)!==mainSuit && card1.slice(1)===mainNumber && card1.slice(1)==="ta" && card2.slice(0,1)===mainSuit && card2.slice(1)==="t3")
     ){
      return true
    }
    return ((locCard1-locCard2) === 1 && locCard1!==locMain && locCard2!==locMain) || ((locCard1-locCard2) === 2 && (locCard1-locMain) === 1)
}
function getTlj(size, card, mainSuit,  mainNumber){
    if (card.length===0) return []
    if (card.length===1) return [{size, tlj:1, card:card[0]}]
    const sortedHand = sortHand(card, mainSuit,  mainNumber)
    if (size===1) return sortedHand.map(cd=>{return {size:1, tlj:1, card:cd}})
    let result = []
    let currCard = sortedHand[0]
    let currTlj = 1
    for (let i = 0; i < sortedHand.length-1; i++) {
      if (isAdjacent(sortedHand[i],sortedHand[i+1], mainSuit,  mainNumber)) {
        currTlj++
      }else{
        result.push({size, tlj:currTlj, card:currCard})
        currTlj = 1
        currCard = sortedHand[i+1]
      }
    }
    result.push({size, tlj:currTlj, card:currCard})
    return result.sort((a,b)=>{
        if (a.tlj === b.tlj) return (sortedHand.indexOf(b.card) - sortedHand.indexOf(a.card))
        return b.tlj-a.tlj})
}
function verifyTickets(roomid, card, currentplayerindex){
    const countTicket1 = card.filter(cd=>(cd===ROOMS[roomid].ticket[0].card)).length
    const countTicket2 = card.filter(cd=>(cd===ROOMS[roomid].ticket[1].card)).length
    if (countTicket1 && ROOMS[roomid].countTicket1 > -1){
        ROOMS[roomid].countTicket1 += countTicket1
        if (ROOMS[roomid].countTicket1 >= ROOMS[roomid].ticket[0].sequence){
            ROOMS[roomid].countTicket1=-1
            ROOMS[roomid].players[currentplayerindex].onBoard = true
            ROOMS[roomid].players[currentplayerindex].points = []
        }
    } 
    if (countTicket2 && ROOMS[roomid].countTicket2 > -1){
        ROOMS[roomid].countTicket2 += countTicket2
        if (ROOMS[roomid].countTicket2 >= ROOMS[roomid].ticket[1].sequence){
            ROOMS[roomid].countTicket2=-1
            ROOMS[roomid].players[currentplayerindex].onBoard = true
            ROOMS[roomid].players[currentplayerindex].points = []
        }
    } 
}


//broadcasting functions
function roomList(){
    const roomList = Object.values(ROOMS).map(room=>{
        return {
            roomid: room.roomid, 
            host: PLAYERS[room.hostid].displayName, 
            roomName: room.roomName, 
            status: room.status,
            playersNumber: room.players.length,
        }
    })
    return JSON.stringify({roomList: roomList, action: "list rooms"})
}
function broadcastRoomList(){
    Object.values(WSS).map(ws=>{
        ws.send(roomList())
    })
}
function broadcastRoom(roomid,action){
    // console.log( ROOMS[roomid])
    if (ROOMS[roomid]){
        ROOMS[roomid].players.map(player=>{
            if(WSS[player.playerid]){
                WSS[player.playerid].send(JSON.stringify({action,room:{...ROOMS[roomid], encryptbury:null}}))
            }
        })
    }else{
        console.log("Room not exist" + roomid)
        console.log(ROOMS)
    }
}

//ongoing cleaning works
function cleanRoom(){
    Object.keys(ROOMS).map(rmkey=>{
        if(ROOMS[rmkey].players.filter(p=>p.isAlive).length===0){
            delete ROOMS[rmkey]
        }
    })
}
const cleanWS = setInterval(function ping() {
    Object.keys(WSS).map(playerid=>{
        let playerIndex
        if (PLAYERS[playerid].isAlive === false) {
            PLAYERS[playerid].lostconnection += 1
            if (PLAYERS[playerid].lostconnection > 1200 * 24){
                delete PLAYERS[playerid]
                delete WSS[playerid]
            }else{
                if(PLAYERS[playerid].roomid && ROOMS[PLAYERS[playerid].roomid]){
                    playerIndex = ROOMS[PLAYERS[playerid].roomid].players.findIndex(p=>p.playerid === playerid)
                    if (playerIndex!==-1 && ROOMS[PLAYERS[playerid].roomid].players[playerIndex].isAlive === true){
                        ROOMS[PLAYERS[playerid].roomid].players[playerIndex].isAlive = false
                        cleanRoom()
                        broadcastRoom(PLAYERS[playerid].roomid, "refresh room")
                    }
                }
            }
        }else{
            PLAYERS[playerid].lostconnection = 0
            if(PLAYERS[playerid].roomid && ROOMS[PLAYERS[playerid].roomid]){
                playerIndex = ROOMS[PLAYERS[playerid].roomid].players.findIndex(p=>p.playerid === playerid)
                if (playerIndex!==-1 && ROOMS[PLAYERS[playerid].roomid].players[playerIndex].isAlive === false){
                    ROOMS[PLAYERS[playerid].roomid].players[playerIndex].isAlive = true
                    broadcastRoom(PLAYERS[playerid].roomid, "refresh room")
                }
            }
            PLAYERS[playerid].isAlive = false;
            WSS[playerid].send(`ping:${playerid}`);
        }
    })
}, 3000);
wss.on('close', function close() {
    clearInterval(cleanWS);
});

//pure helper
function checkParameters(params){
    return params.some(p => p === null)
}

//return forced play or dumpcard if succeed
function validateDump(playerid, roomid, card){
    const mainSuit = ROOMS[roomid].mainSuit
    const mainNumber = ROOMS[roomid].mainNumber
    const handCard = ROOMS[roomid].players.filter(p=>p.playerid!==playerid)
    .map((player)=>{
        return PLAYERS[player.playerid].handCard.filter(cd=>(!isMain(cd, mainSuit, mainNumber) && card[0].slice(0,1)===cd.slice(0,1)))
    })
    const dumpCardD = decompose(card, mainSuit, mainNumber)
    const resultset = dumpCardD.result.sort((a,b)=>((a.card > b.card)?1:-1)).reduce((result, curr,i,arr)=>{
        const notallow = handCard.some((hand)=>
            challengeDump(hand, curr, mainSuit, mainNumber)
        )
        if(notallow && ((result && result.card > curr.card) || !result)) {
            arr.splice(1);
            return curr
        }
        return result
    },null)
    return resultset?buildCardfromSet(resultset, mainNumber):card
}
//no use for building main
function buildCardfromSet(set, mainNumber){
    const numlist = getNumlist(mainNumber)
    let card=[]
    for (let tlj = 0; tlj < set.tlj; tlj++) {
        for (let size = 0; size < set.size; size++) {
            card.push(set.card.slice(0,1) + numlist[numlist.indexOf(set.card.slice(1))-tlj])
        }
    }
    return card
}
//NUMLIST based on mainNumber
function getNumlist(mainNumber){
    const index = NUMLIST.indexOf(mainNumber)
    return [...NUMLIST.slice(0,index), ...NUMLIST.slice(index+1)]
}




app.get("/",(req, res)=>{
    res.send("socket server is up")
})
// setInterval(function() {
//     http.get("http://zhaopengyouserver.herokuapp.com");
// }, 300000);
server.listen(port, function() {
  console.log(`Server is listening on ${port}!`)
})
setInterval(function() {
    console.log(ROOMS)
    Object.keys(ROOMS).map(roomid=>{
        console.log(ROOMS[roomid].players)
    })
    console.log(PLAYERS)
}, 20 * 60 * 1000);