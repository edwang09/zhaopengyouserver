const express = require('express');
const app = express()
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto'); 
const key = crypto.randomBytes(32); 
const iv = crypto.randomBytes(16);
function encrypt(json) { 
    const text = JSON.stringify(json)
    let cipher = crypto.createCipheriv('aes-256-cbc',Buffer.from(key), iv); 
    let encrypted = cipher.update(text); 
    encrypted = Buffer.concat([encrypted, cipher.final()]); 
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') }; 
} 
  
function decrypt(text) { 
    let iv = buffer.from(text.iv, 'hex'); 
    let encryptedText = Buffer.from(text.encryptedData, 'hex'); 
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv); 
    let decrypted = decipher.upate(encryptedText); 
    decypted = Buffer.concat([decrypted, decipher.final()]); 
    return JSON.parse(decrypted.toString()); 
} 
  

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
const roomPlayer = function(playerid){
    return {
        isAlive: true,
        playerid,
        displayName: PLAYERS[playerid].displayName,
        avatar: PLAYERS[playerid].avatar,
        cardCount:0,
        onBoard:false,
        points:[],
        score:"2"
    }
}
//room initializer
const defaultRoom = function(roomid, roomName, playerid){
    return {
        roomid,
        hostid: playerid,
        roomName,
        status: "pending",
        gamestatus: "pending",
        players: [roomPlayer(playerid)],
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
        playerid,
        displayName,
        avatar,
        handCard:[]
    }
}

wss.on('connection', function(ws) {
    console.log("connection created")

    ws.on('message', function(data) {
        if (data.split(":")[0]==="pong") {
            if(PLAYERS[data.split(":")[1]]) PLAYERS[data.split(":")[1]].isAlive = true;
        }else{
            console.log("get message")
            const {action, playerid, payload} = JSON.parse(data)
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
                    joinRoom(playerid, payload).then((room,playerid)=>{
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
                    leaveRoom(playerid, payload).then((room)=>{
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
                    startGame(playerid, payload.roomid)
                break;
                case "main call":
                    mainCall(playerid, payload.roomid, payload.main)
                break;
                case "bury":
                    bury(playerid, payload.roomid, payload.lefted, payload.card)
                break;
                case "play":
                    play(playerid, payload.roomid, payload.card, payload.lefted, payload.last, payload.dump)
                break;
                case "ticket":
                    ticket(playerid, payload.roomid, payload.ticket)
                break;
                case "reasign":
                    reasign(playerid, payload.roomid, payload.playerid)
                break;
                case "validdump":
                    validdump(playerid, payload.roomid)
                break;
                case "invaliddump":
                    invaliddump(playerid, payload.card,  payload.roomid)
                break;
                default:
                break;
            }
        }
    })
    ws.on('close', function(data) {
        console.log(data)
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
        const {roomName} = payload
        if (!playerid) return reject("registration required")
        if (!roomName) return reject("roomName required")
        let roomid
        do {
            roomid =  "R" + Math.random().toString(36).substr(2, 5);
        }
        while (ROOMS[roomid]);
        ROOMS[roomid]=defaultRoom(roomid, roomName, playerid)
        resolve(ROOMS[roomid])
    })
}
function joinRoom(playerid, payload){
    return new Promise((resolve, reject)=>{
        const {roomid}=payload
        if (!roomid) {
            reject("roomid not provided")
        }else if (!ROOMS[roomid]) { 
            reject("roomid not exist")
        }else if (ROOMS[roomid].players.filter(p=>p.playerid===playerid).length>0) { 
            ROOMS[roomid].players[ROOMS[roomid].players.findIndex(p=>p.playerid===playerid)].isAlive = true
            PLAYERS[playerid].isAlive = true
            resolve(ROOMS[roomid],playerid)
        }else if (ROOMS[roomid].status === "full") { 
            reject("room is full")
        }else{
            ROOMS[roomid].players.push(roomPlayer(playerid))
            PLAYERS[playerid].roomid = roomid
            if (ROOMS[roomid].players.length === 6) {
                ROOMS[roomid].status = "full"
            }
            resolve(ROOMS[roomid])
        }
    })
}
function leaveRoom(playerid, payload){
    return new Promise((resolve, reject)=>{
        const {roomid}=payload
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
        console.log("game started with pending status")
        return
    }
    // reset room parameters
    let cardDeck = getsuffledCards()
    ROOMS[roomid].currentPlay = []
    ROOMS[roomid].lastPlay = []
    ROOMS[roomid].ticket = []
    ROOMS[roomid].encryptbury = null
    ROOMS[roomid].bury = []
    ROOMS[roomid].buryPoint = []
    ROOMS[roomid].mainSuit = ""
    ROOMS[roomid].status = "in game"
    ROOMS[roomid].gamestatus = "draw"
    if (!ROOMS[roomid].mainNumber) ROOMS[roomid].mainNumber = "2"
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
            broadcastRoom(roomid, "start maincall")
            setTimeout(()=>{
                const tempDealerid = ROOMS[roomid].tempDealerid
                if (!ROOMS[roomid].tempDealerid) {
                    startGame(playerid, roomid)
                }else{
                    if (!ROOMS[roomid].dealerid) ROOMS[roomid].dealerid=tempDealerid
                    const dealerid = ROOMS[roomid].dealerid
                    //change turn to dealer
                    ROOMS[roomid].inTurn = dealerid
                    const dealerIndex = ROOMS[roomid].players.findIndex(p=>p.playerid===dealerid)
                    ROOMS[roomid].players[dealerIndex].onBoard = true
                    //start bury
                    ROOMS[roomid].gamestatus = "bury"
                    PLAYERS[dealerid].handCard = [...PLAYERS[dealerid].handCard, ...cardDeck]
                    WSS[ROOMS[roomid].dealerid].send(JSON.stringify({action:"bury", card:cardDeck}))
                    broadcastRoom(roomid, "start bury")
                }
                
            },5000)
        }
    },200)
}
function dealCard(card, roomid){
    //get current playerid and deal card
    const currentplayerindex = ROOMS[roomid].players.findIndex(player=>player.playerid === ROOMS[roomid].inTurn)
    const nextplayerindex = (currentplayerindex+1) % PLAYERNUMBER
    const currentplayerid = ROOMS[roomid].players[currentplayerindex].playerid
    PLAYERS[currentplayerid].handCard.push(card)
    WSS[currentplayerid].send(JSON.stringify({action:"deal", card, playerid:currentplayerid}))
    if (ROOMS[roomid].players.length !== 6){
        clearInterval(ROOMINTERVALS[roomid])
        ROOMS[roomid].status = "pending"
    }else{
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
    broadcastRoom(roomid, "main call")
}
function bury(playerid, roomid, lefted, bury){
        ROOMS[roomid].encryptbury = encrypt(bury)
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
        ROOMS[roomid].dumpCard = {
            playerid,
            card,
            valid:[]
        }
        broadcastRoom(roomid, "dump")
        return
    }
    const thisPlay = ROOMS[roomid].currentPlay
    const mainSuit = ROOMS[roomid].mainSuit
    const mainNumber = ROOMS[roomid].mainNumber
    const currentplayerindex = ROOMS[roomid].players.findIndex(player=>player.playerid === ROOMS[roomid].inTurn)
    verifyTickets(roomid, card, currentplayerindex)
    if (ROOMS[roomid].currentPlay.length===6){
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
        ROOMS[roomid].winnerid = winnerid
        ROOMS[roomid].inTurn = winnerid
        ROOMS[roomid].lastPoint = totalPoint
        if (!ROOMS[roomid].players[winnerindex].onBoard) ROOMS[roomid].players[winnerindex].points = [...ROOMS[roomid].players[winnerindex].points, totalPoint]
        if (last){ 
            const buryPoint = decrypt(ROOMS[roomid].encryptbury)
            ROOMS[roomid].bury = buryPoint
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
                    if (!ROOMS[roomid].players[j].onBoard) ROOMS[roomid].players[j].score = NUMLIST[(NUMLIST.indexOf(ROOMS[roomid].players[j].score)+increment)%13]
                    if (i!==0 && !switched && !ROOMS[roomid].players[j].onBoard) {
                        switched = true
                        ROOMS[roomid].dealerid = ROOMS[roomid].players[j].playerid
                        ROOMS[roomid].mainNumber = ROOMS[roomid].players[j].score
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
                    if (ROOMS[roomid].players[j].onBoard) ROOMS[roomid].players[j].score = NUMLIST[(NUMLIST.indexOf(ROOMS[roomid].players[j].score)+decrement)%13]
                    if (i!==0 && !switched && ROOMS[roomid].players[j].onBoard) {
                        switched = true
                        ROOMS[roomid].dealerid = ROOMS[roomid].players[j].playerid
                        ROOMS[roomid].mainNumber = ROOMS[roomid].players[j].score
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
function validdump(playerid, roomid){
    ROOMS[roomid].dumpCard.valid.push(playerid)
    if (ROOMS[roomid].dumpCard.valid.length === 5){
        const dumperid = ROOMS[roomid].dumpCard.playerid
        console.log(PLAYERS[dumperid].handCard)
        const card = ROOMS[roomid].dumpCard.card
        ROOMS[roomid].dumpCard = null
        card.map(card=>{
            const cardIndex = PLAYERS[dumperid].handCard.indexOf(card)
            if (cardIndex > -1){
                PLAYERS[dumperid].handCard = [...PLAYERS[dumperid].handCard.slice(0,cardIndex), ...PLAYERS[dumperid].handCard.slice(cardIndex+1)]
            }
        })
        const currentplayerindex = ROOMS[roomid].players.findIndex(player=>player.playerid === ROOMS[roomid].inTurn)
        verifyTickets(roomid, card, currentplayerindex)
        ROOMS[roomid].lastPlay = ROOMS[roomid].currentPlay
        ROOMS[roomid].currentPlay = [{playerid:dumperid, card}]
        const nextplayerindex = (currentplayerindex+1) % PLAYERNUMBER
        ROOMS[roomid].inTurn = ROOMS[roomid].players[nextplayerindex].playerid

        console.log(PLAYERS[dumperid].handCard)
        WSS[dumperid].send(JSON.stringify({action:"dump succeed", handCard: PLAYERS[dumperid].handCard}))
        broadcastRoom(roomid, "succeed dump")
    }
}
function invaliddump(playerid, card,  roomid){
    const dumperid = ROOMS[roomid].dumpCard.playerid
    ROOMS[roomid].dumpCard = null
    card.map(card=>{
        const cardIndex = PLAYERS[dumperid].handCard.indexOf(card)
        if (cardIndex > -1){
            PLAYERS[dumperid].handCard = [...PLAYERS[dumperid].handCard.slice(0,cardIndex), ...PLAYERS[dumperid].handCard.slice(cardIndex+1)]
        }
    })
    const currentplayerindex = ROOMS[roomid].players.findIndex(player=>player.playerid === ROOMS[roomid].inTurn)
    verifyTickets(roomid, card, currentplayerindex)
    ROOMS[roomid].lastPlay = ROOMS[roomid].currentPlay
    ROOMS[roomid].currentPlay = [{playerid:dumperid, card}]
    const nextplayerindex = (currentplayerindex+1) % PLAYERNUMBER
    ROOMS[roomid].inTurn = ROOMS[roomid].players[nextplayerindex].playerid
    WSS[dumperid].send(JSON.stringify({action:"dump failed", handCard: PLAYERS[dumperid].handCard}))
    broadcastRoom(roomid, "failed dump")
}
function reasign(playerid, roomid, winnerid){
    const currentWinnerid = ROOMS[roomid].inTurn 
    const currentWinnerIndex = ROOMS[roomid].players.findIndex(p=>p.playerid === currentWinnerid) 
    const winnerIndex = ROOMS[roomid].players.findIndex(p=>p.playerid === winnerid) 
    ROOMS[roomid].inTurn = winnerid
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
    if (isMain(startCard[0], mainSuit, mainNumber) || startCardD.length > 0){
        winning = play.slice(1)
        .filter(p=>(!p.card.some(c=>!isMain(c, mainSuit, mainNumber))))
        .map(p=> decompose(p, mainSuit,  mainNumber))
        .reduce((winner, pd)=>{
            if (challengeD(winner.play, pd, mainSuit,  mainNumber, winner.ind)){
                return {play:pd, ind: true}
            }
            return winner
        },{play:startCardD, ind: false}).play.playerid
    }else{
        winning = play.slice(1)
        //All Main or All non-main same suit
        .filter(p=>( !p.card.some(c=>!isMain(c, mainSuit, mainNumber)) || !p.card.some(c=>(isMain(c, mainSuit, mainNumber) || c.slice(0,1)!==startCard[0].slice(0,1)))))
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
    const playerid = play.playerid
    const card = play.card
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
    console.log({result , playerid})
    return {result , playerid}
}
function challengeD(start, challenge, mainSuit,  mainNumber, ind){
    const startCard = start.result
    const challengeCard = challenge.result
    // console.log("compare")
    // console.log(startCard)
    // console.log(challengeCard)
    if (startCard.length !== challengeCard.length) return false
    if (startCard.some((item,idx)=>(
            item.size !== challengeCard[idx].size || 
            item.tlj !== challengeCard[idx].tlj || 
            sortHand([item.card, challengeCard[idx].card], mainSuit,  mainNumber)[0] === item.card
        ))) return false
    return true
}
function sortHand(handCard, mainSuit,  mainNumber){
    let normalCard = handCard
    let mainCard = []
    mainCard = [
    ...normalCard.filter(a=>a.slice(0,1)==="J").sort(),
    ...normalCard.filter(a=>a.slice(1)===mainNumber && a.slice(0, 1)===mainSuit).sort(),
    ...normalCard.filter(a=>a.slice(1)===mainNumber && a.slice(0, 1)!==mainSuit).sort(),
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
      console.log("main and not main")
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
function getTlj(key, card, mainSuit,  mainNumber){
    if (card.length===0) return []
    if (card.length===1) return [{size:key, tlj:1, card:card[0]}]
    const sortedHand = sortHand(card, mainSuit,  mainNumber)
    if (key===1) return sortedHand.map(cd=>{return {size:1, tlj:1, card:cd}})
    let result = []
    let currCard = sortedHand[0]
    let currTlj = 1
    for (let i = 0; i < sortedHand.length-1; i++) {
      if (isAdjacent(sortedHand[i],sortedHand[i+1], mainSuit,  mainNumber)) {
        currTlj++
      }else{
        result.push({size:key, tlj:currTlj, card:currCard})
        currTlj = 1
        currCard = sortedHand[i+1]
      }
    }
    result.push({size:key, tlj:currTlj, card:currCard})
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
    ROOMS[roomid].players.map(player=>{
        if(WSS[player.playerid]){
            WSS[player.playerid].send(JSON.stringify({action,room:ROOMS[roomid]}))
        }
    })
}

//ongoing cleaning works
function cleanRoom(){
    Object.keys(ROOMS).map(rmkey=>{
        if(ROOMS[rmkey].status=== "pending" ){
            ROOMS[rmkey].players = ROOMS[rmkey].players.filter(p=>p.isAlive)
        }
        if(ROOMS[rmkey].players.filter(p=>p.isAlive).length===0){
            ROOMS[rmkey].players.map(p=>{
                delete PLAYERS[p.playerid]
                delete WSS[p.playerid]
            })
            delete ROOMS[rmkey]
        }
        
    })
}
const cleanWS = setInterval(function ping() {
    Object.keys(WSS).map(playerid=>{
        if (PLAYERS[playerid].isAlive === false) {
            if(PLAYERS[playerid].roomid || ROOMS[PLAYERS[playerid].roomid]){
                playerIndex = ROOMS[PLAYERS[playerid].roomid].players.findIndex(p=>p.playerid === playerid)
                if (ROOMS[PLAYERS[playerid].roomid].players[playerIndex].isAlive === true){
                    ROOMS[PLAYERS[playerid].roomid].players[playerIndex].isAlive = false
                    cleanRoom()
                    broadcastRoom(PLAYERS[playerid].roomid, "refresh room")
                }
            }else{
                delete PLAYERS[playerid]
                delete WSS[playerid]
            }
            // clearPlayer(playerid)
        }else{
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



app.get("/",(req, res)=>{
    res.send("socket server is up")
})
setInterval(function() {
    http.get("http://zhaopengyouserver.herokuapp.com");
}, 300000);
server.listen(port, function() {
  console.log(`Server is listening on ${port}!`)
})