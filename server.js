const express = require('express');
const app = express()
const http = require('http');
const WebSocket = require('ws');

const port = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocket.Server({ server })
const PLAYERNUMBER = 6

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
// const heartbeat = function(playerid){
//     console.log(playerid)
//     PLAYERS[playerid].isAlive = true
// }

wss.on('connection', function(ws) {
    console.log("connection created")

    ws.on('message', function(data) {
        if (data.split(":")[0]==="pong") {
            // console.log("pong")
            PLAYERS[data.split(":")[1]].isAlive = true;
        }else{
            console.log("get message")
            const {action, playerid, payload} = JSON.parse(data)
            console.log(action)
            switch (action) {
                case "register player":
                    registerPlayer(payload).then((playerid)=>{
                        //create ws protocol
                        WSS[playerid] = ws
                        // ws.on('pong', heartbeat(playerid));
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
                        updateRoom(room.roomid)
                    }).catch(err=>{
                        console.log(err)
                        ws.send(JSON.stringify({
                            action: "reset session"
                        }))
                    })
                break;
    
                case "leave room":
                    leaveRoom(playerid, payload).then((room)=>{
                        //send joined room back
                        ws.send(JSON.stringify({
                            action: "leave room"
                        }))
                        ws.send(roomList())
                        broadcastRoomList()
                    }).catch(err=>{
                        console.log(err)
                    })
                break;
    
                case "start game":
                    startGame(playerid, payload.roomid).then((room)=>{
                        broadcastRoom(payload.roomid, "start game")
                    }).catch(err=>{
                        console.log(err)
                    })
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


function registerPlayer(payload){
    return new Promise((resolve, reject)=>{
        const {displayName, playerid, avatar}=payload
        if (playerid && PLAYERS[playerid] && WSS[playerid]) resolve(playerid)
        if (playerid) reject(playerid)
        if (!displayName) reject("no name provided")
        let newplayerid
        do {
            newplayerid = "P" + Math.random().toString(36).substr(2, 9);
            console.log(`randomid is created as ${newplayerid}`)
        }
        while (PLAYERS[newplayerid]);
        console.log(`creating player with id ${newplayerid}`)
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
            console.log(`randomid is created as ${roomid}`)
        }
        while (ROOMS[roomid]);
        console.log(`creating room with id ${roomid}`)
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
            resolve(ROOMS[roomid],playerid)
        }else if (ROOMS[roomid].status === "full") { 
            reject("room is full")
        }else{
            ROOMS[roomid].players.push(roomPlayer(playerid))
            PLAYERS[playerid].roomid = roomid
            if (ROOMS[roomid].players.length === 6) {
                ROOMS[roomid].status = "full"
            }
            broadcastRoom(roomid, "refresh room")
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

            ROOMS[roomid].players = ROOMS[roomid].players.filter(player => player.playerid !== playerid)
            if (playerid===ROOMS[roomid].hostid){ 
                ROOMS[roomid].inTurn=ROOMS[roomid].players[0].playerid
                ROOMS[roomid].hostid=ROOMS[roomid].players[0].playerid
            }
            broadcastRoom(roomid, "refresh room")
            cleanRoom()
            resolve(ROOMS[roomid])
        }
    })
}
function startGame(playerid, roomid){
    return new Promise((resolve, reject)=>{
        if (ROOMS[roomid].status==="pending") reject("player not enough")
        // const {roomid} = payload
        let cardDeck = getsuffledCards()
        ROOMS[roomid].currentPlay = []
        ROOMS[roomid].lastPlay = []
        ROOMS[roomid].ticket = []
        ROOMS[roomid].bury = []
        ROOMS[roomid].mainSuit = "J"
        //set handCard empty, turn start with host
        ROOMS[roomid].players.map((player,id)=>{
            PLAYERS[player.playerid].handCard = []
            ROOMS[roomid].players[id].onBoard = false
            ROOMS[roomid].players[id].points = []
        })
        ROOMS[roomid].status = "in game"
        ROOMS[roomid].buryPoint = []
        ROOMS[roomid].gamestatus = "draw"
        if (!ROOMS[roomid].mainNumber) ROOMS[roomid].mainNumber = "2"
        resolve(ROOMS[roomid])
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
                        // restart room
                        startGame(playerid, roomid)
                    }
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
                },10000)
            }
        },100)
    })
}
function mainCall(playerid, roomid, main){
    
    if (ROOMS[roomid].tempDealerid === playerid){
        ROOMS[roomid].mainCalls[0].card = [...ROOMS[roomid].mainCalls[0].card, ...main]
    }else if (ROOMS[roomid].mainCalls[0] && ROOMS[roomid].mainCalls[0].card.length >= main.length){
        return
    }else{
        ROOMS[roomid].mainSuit = main[0].slice(0,1)
        ROOMS[roomid].mainCalls.unshift({card:main, playerid})
    }
    if (!ROOMS[roomid].dealerid){
        ROOMS[roomid].tempDealerid = playerid
    }
    broadcastRoom(roomid, "main call")
}
function bury(playerid, roomid, lefted, bury){
        ROOMS[roomid].bury = bury
        ROOMS[roomid].gamestatus = "ticketcall"
        ROOMS[roomid].mainCalls = []
        PLAYERS[playerid].handCard = lefted
        broadcastRoom(roomid, "start ticketcall")
}
function play(playerid, roomid, card, lefted, last, dump){
    const thisPlay = ROOMS[roomid].currentPlay
    const mainSuit = ROOMS[roomid].mainSuit
    const mainNumber = ROOMS[roomid].mainNumber
    if (dump){
        ROOMS[roomid].dumpCard = {
            playerid,
            card,
            valid:[]
        }
        broadcastRoom(roomid, "dump")
        return 
    }


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
            const numList = ["2","3","4","5","6","7","8","9","t","t1","t2","t3","ta"]
            const buryPoint = ROOMS[roomid].bury
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
                ROOMS[roomid].buryPoint = buryPoint*(2**(maxSize+maxTLJ))
            } 
            ROOMS[roomid].gamestatus = "end"


            //checkout score for this round
            ROOMS[roomid].finalPoint = ROOMS[roomid].players.filter(p=>!p.onBoard).reduce((total, currp)=>{
                return total + currp.points.reduce((tot,pl)=>{
                    return tot + pl.reduce((t,p)=>{
                        if (p.slice(1)==="5") return t+5
                        return t+10
                    },0)
                },0)
            },0)
            const currentDealerIndex = ROOMS[roomid].players.findIndex(p=>p.playerid===ROOMS[roomid].dealerid)
            let switched = false
            if (ROOMS[roomid].finalPoint>=160){
                
                const increment = Math.floor((ROOMS[roomid].finalPoint-160)/80) + 1
                ROOMS[roomid].increment = increment
                ROOMS[roomid].win = true
                for (let i = 0; i < 6; i++) {
                    const j = (i + currentDealerIndex) % 6
                    if (!ROOMS[roomid].players[j].onBoard) ROOMS[roomid].players[j].score = numList[(numList.indexOf(ROOMS[roomid].players[j].score)+increment)%13]
                    if (i!==0 && !switched && !ROOMS[roomid].players[j].onBoard) {
                        switched = true
                        ROOMS[roomid].dealerid = ROOMS[roomid].players[j].playerid
                        ROOMS[roomid].mainNumber = ROOMS[roomid].players[j].score
                    }
                }
            }else{
                let decrement = 0
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
                    if (ROOMS[roomid].players[j].onBoard) ROOMS[roomid].players[j].score = numList[(numList.indexOf(ROOMS[roomid].players[j].score)+decrement)%13]
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
function ticket(playerid, roomid, ticket){
    ROOMS[roomid].countTicket1 = 0
    ROOMS[roomid].countTicket2 = 0
    ROOMS[roomid].ticket = ticket
    ROOMS[roomid].gamestatus = "in play"
    broadcastRoom(roomid, "start play")
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
function dealCard(card, roomid){
    //get current playerid and deal card
    const currentplayerindex = ROOMS[roomid].players.findIndex(player=>player.playerid === ROOMS[roomid].inTurn)
    const nextplayerindex = (currentplayerindex+1) % PLAYERNUMBER
    const currentplayerid = ROOMS[roomid].players[currentplayerindex].playerid
    PLAYERS[currentplayerid].handCard.push(card)
    WSS[currentplayerid].send(JSON.stringify({action:"deal", card, playerid:currentplayerid}))
    ROOMS[roomid].players[currentplayerindex].inTurn = false
    ROOMS[roomid].inTurn = ROOMS[roomid].players[nextplayerindex].playerid
}

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
    console.log(`current room list`)
    console.log(roomList)
    return JSON.stringify({roomList: roomList, action: "list rooms"})
}
function broadcastRoomList(){
    const payload = roomList()
    Object.values(WSS).map(ws=>{
        ws.send(payload)
    })
}

function broadcastRoom(roomid,action){
    console.log(ROOMS[roomid])
    ROOMS[roomid].players.map(player=>{
        WSS[player.playerid].send(JSON.stringify({action,room:ROOMS[roomid]}))
    })
}
function updateRoom(roomid){
    const room = JSON.stringify({action:"get room", room: ROOMS[roomid]})
    ROOMS[roomid].players.map(player=>{
        WSS[player.playerid].send(room)
    })
    broadcastRoomList()
}
function cleanRoom(){
    Object.keys(ROOMS).map(rmkey=>{
        if(ROOMS[rmkey].players.length===0){
            delete ROOMS[rmkey]
        }
    })
}

function getsuffledCards(){
    const numList = ["2","3","4","5","6","7","8","9","t","t1","t2","t3","ta"]
    const catList = ["D","H","S","C"]
    const set = catList.reduce((res, cat)=>{
        const num = numList.map(num=>{
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

function constructCard(set, mainSuit,  mainNumber){
    const suit = set.card.slice(0,1)
    const index = ADHELPER.indexOf(set.card.slice(1))
    const cards = [set.card]
    let adder = 0
    for (let i = 1; i < set.tlj; i++) {
        if (ADHELPER[index+i+adder]===mainNumber) adder = 1
        cards.push(`${suit}${ADHELPER[index+i+adder]}`)
    }
    return cards.reduce((array, curr)=>{
        const currentcard = repeat(curr,set.size)
        return [...array, ...currentcard]
    },[])
    
}
function repeat(item, times) {
	let rslt = [];
	for(let i = 0; i < times; i++) {
  	rslt.push(item)
  }
  return rslt;
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
        broadcastRoom(roomid, "play")
    }else{
        broadcastRoom(roomid, "valid")
    }
}
function invaliddump(playerid, card,  roomid){
    const dumperid = ROOMS[roomid].dumpCard.playerid
    ROOMS[roomid].dumpCard = null
    console.log(card)
    console.log(PLAYERS[dumperid].handCard)
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
    WSS[dumperid].send(JSON.stringify({action:"dump failed", handCard: PLAYERS[dumperid].handCard}))
    broadcastRoom(roomid, "play")
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
const heartbeatInterval = setInterval(function ping() {
    // console.log(Object.keys(PLAYERS))
    Object.keys(WSS).map(playerid=>{
        if (PLAYERS[playerid].isAlive === false) {
            WSS[playerid].terminate();
            if(PLAYERS[playerid].roomid){
                playerIndex = ROOMS[PLAYERS[playerid].roomid].players.findIndex(p=>p.playerid === playerid)
                if (ROOMS[PLAYERS[playerid].roomid].players[playerIndex].isAlive === true){
                    ROOMS[PLAYERS[playerid].roomid].players[playerIndex].isAlive = false
                    broadcastRoom(PLAYERS[playerid].roomid, "refresh room")
                }
            }
            // clearPlayer(playerid)
        }else{
            PLAYERS[playerid].isAlive = false;
            WSS[playerid].send(`ping:${playerid}`);
        }
    })
  }, 3000);
wss.on('close', function close() {
    clearInterval(heartbeatInterval);
});

app.get("/",(req, res)=>{
    res.send("connection on")
})
server.listen(port, function() {
  console.log(`Server is listening on ${port}!`)
})