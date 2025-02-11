const express = require("express");
const { createServer, ClientRequest } = require("node:http");
const { Server } = require("socket.io");
const fs = require("fs");
const axios = require("axios");
const iconv = require("iconv-lite");
const { uptime } = require("node:process");

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static("public"));

app.get("/", (request, response) => {
  response.sendFile(__dirname + "/public/index.html");
});

server.listen(666, () => {
  console.log("server running at http://localhost:666");
  io.emit("event",{type:"info",msg:"サーバーが起動しました。再読み込みしたらなんか変わってるかもね。"});
});

var chatStatus = {21547364:{
  recentmsgs:[], newmsgs:[], oldmsgs:[], oldtopmsg:[], addmsgs:[], log:[], message_main:"", message_time:0, dup:1, modify_time:0
}};

const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/; //URL検出用

var updateInterval;
var clientIPs = {};
var Pairs = [[],[]]; //使用されているチャットIDとそれに対するunique_strリスト
var IPs = [];
var names = [];
var clientConfigs = {
  //DEFAULT:[21547364,21547364]
};

upDate();

async function upDate(){ //ログ取得

  for(let i=0; i < Pairs[0].length; i++){

    if(!Pairs[0][i]){
      i-=1;
      break;
    }

    var id = Pairs[0][i]; //使用されているチャットのIDリストのi個めのID
    var c = chatStatus[id]; //IDに対応するchatStatus

    await axios.get(
      `https://chat2.fc2.com/ch/ajax_read_normal.php?id=${Pairs[0][i]}&delete_time=0&unique_str=${Pairs[1][i]}`,{responseType: "arraybuffer"})
    .then((response) => {

      c.message_time = iconv.decode(response.data,"EUC-JP").split("%%TIME%%");

    			// 更新された場合
    			if (c.message_time[0] > c.modify_time){

            c.message_main = c.message_time.slice(1).join("%%TIME%%");

            c.log = c.message_main.split("\n\n").join("");

            c.newmsgs = c.log.split("<br />").slice(0,c.log.split("<br />").length-1).map(aaa => aaa = aaa.replace(/<\/?b>/g, ""));

            if (c.recentmsgs.length < 1) { // 初期ログ取得
              c.addmsgs = c.newmsgs;
            } else {
              guruguru: for (var i = 0; i < c.newmsgs.length; i++) {
                if (c.newmsgs[i] === c.oldmsgs[0]) {
                  if (c.newmsgs.length < 3) {
                    c.addmsgs = c.newmsgs.slice(0, c.newmsgs.length - c.oldmsgs.length);
                  }
                  for (var j = 1; j < c.oldmsgs.length; j++) {

                    if (c.newmsgs[i + j] !== c.oldmsgs[j]) {
                      break;
                    }

                    if (i + j >= Math.floor(c.newmsgs.length * 0.7)) {
                      c.addmsgs = c.newmsgs.slice(0, i);
                      break guruguru;
                    }
                  }
                }
              }
            }
    			}

    })
    .catch (error => {
      console.log(error);
    })

    //表示
    try { 

      for(let i = c.addmsgs.length - 1; i >= 0; i--){

        var msg = c.addmsgs[i]

        msg = msg.replace(urlRegex, "<a href='$1' target='_blank' rel='noopener noreferrer'>$1</a>");
       
        c.recentmsgs.push(msg);

        if(c.recentmsgs.length > 100){
          c.recentmsgs.shift();
        }

        console.log(msg,id);

        //連投検出
        if (c.addmsgs.every(msg => msg === c.oldmsgs[0])){

          c.oldtopmsg = c.oldmsgs[0];

          c.dup += c.newmsgs.slice(0,c.newmsgs.indexOf(c.oldtopmsg)+1).filter(v => v == c.oldtopmsg).length;

          console.log(c.newmsgs.slice(0,c.newmsgs.indexOf(c.oldtopmsg)+1));

          io.to(id).emit("dup",c.dup);

          continue;

        } else {

          io.to(id).emit("dupreset");

          c.dup = 1;

        }

        io.to(id).emit("fc2chatlog",msg);

      }

      c.oldmsgs = c.newmsgs;

      c.addmsgs = [];

      c.modify_time = c.message_time[0];
    } catch (error) {
      console.log(error);
    }

  }

  updateInterval = setTimeout(upDate,2000);
}

io.on("connection", (socket) => {

  clientConfigs[socket.id] = [21547364,21547364,""]; //clientConfigs(クライアント→サーバーに渡す情報)の構成 {[socket.id]:[chatid,unique_str,name]}

  clientIPs[socket.id] = socket.handshake.address;
  
  IPs = Array.from(new Set(Object.values(clientIPs))).filter(item => item !== undefined);

  io.emit("dousetu", IPs.length,names);

  //ip表示
  console.log(`${socket.handshake.address} connected\nUser-Agent: ${socket.handshake.headers["user-agent"]}\ndousetu=${IPs}`);


  socket.on("disconnect", () => {
      delete clientIPs[socket.id];
      delete clientConfigs[socket.id];

      Pairs = [0, 1].map(i =>
          [...new Set(Object.values(clientConfigs)
            .map(value => value[i])
            .filter(item => item !== undefined)
          )]
      );

      IPs = [...new Set(Object.values(clientIPs))];
      names = [...new Set (Object.values(clientConfigs)
        .map(value => value[2])
        .filter(Boolean))]; // undefined チェックを簡略化

      io.emit("dousetu", IPs.length, names);
      console.log(`${socket.handshake.address} disconnected\nConnected IPs: ${IPs}`);
  });


  //チャット設定読み込み+ログをクライアントに送信
  socket.on("readconfig", (chatid) => {

    socket.emit("event",{type:"info",msg:`${chatid}を読み込み中…`});

    socket.leaveAll();

    readconfig();

    async function readconfig(){

      clientConfigs[socket.id] = [0,0,""];

      clientConfigs[socket.id][0] = chatid;

      console.log(socket.id);

      socket.join(chatid);
  
      if (chatid != null && !Object.keys(chatStatus).includes(chatid.toString())) { //クライアントから要求されたIDに対応するChatStatusがない場合 = 読み込まれていない場合
        console.log(`${chatid}が新たに読み込まれます`);
        chatStatus[chatid] = {recentmsgs:[], newmsgs:[], oldmsgs:[], oldtopmsg:[], addmsgs:[], log:[], message_main:"", message_time:0, dup:1, modify_time:0};
      }

      const chatConfig = {
        21547364: "21547364",
        7793: "a52b2446033315f443055afe27cfc01a",
        123: "8b2a65107f53868984852e6d9ab3ca60",
        5554406: "fc0bb9e2d35195d4f77ef336957b9723",
        36568320: "36568320"
      };

      if (chatConfig[chatid]) {
        socket.emit("event", { type: "info", msg: `ID:${chatid}の読み込みに成功しました`, id: chatid });
        clientConfigs[socket.id][1] = chatConfig[chatid];

      } else {  //その他の場合unique_strをread_config.phpから入手
        socket.emit("confLoadWaiting");
        await axios.get(`https://chat2.fc2.com/ch/ajax_read_config.php?uid=${chatid}`)
        .then((response) => {

          if(/\d/.test(response.data)){//数字が含まれる場合
            console.log(response.data);
            clientConfigs[socket.id][1] = response.data.split("=")[5]; //clientConfigsの二番目にunique_strを挿入
            socket.join(chatid);
            socket.emit("event",{ type: "info", msg: `ID:${chatid}の読み込みに成功しました`, id: chatid });

          } else {
            console.log(response.data);
            delete clientConfigs[socket.id];
            socket.emit("event",{type:"error",msg:"このIDは使用できません"});
            console.log(`${clientIPs[socket.id]} sended invalid id ${chatid}`);

            return

          }
        })
        .catch ((error) => {
          console.log(error);
          console.log("再読み込み中...");
          setTimeout(readconfig,3000);
        })
      }

      Pairs = [0, 1].map(i => [...new Set(Object.values(clientConfigs).map(value => value[i]))].filter(item => item !== undefined));  //使用されているidとunique_strのセット
    
      console.log(Pairs)
  
      if(chatStatus[chatid]){ //サーバーでそのチャットが読み込まれている時にサーバーに保管されているそのチャットのログをクライアントに渡す
        chatStatus[chatid].recentmsgs.forEach(msg => {
          socket.emit("fc2chatlog",msg);
        });
      }
  
      console.log(`${socket.handshake.address} sended ${chatid}\nusedRooms:${Pairs[0]}`);
    }
  })

  socket.on("sendname", (name)=> {
    clientConfigs[socket.id][2] = name;
    names = [...new Set (Object.values(clientConfigs)
      .map(value => value[2])
      .filter(Boolean))];
    io.emit("dousetu", IPs.length, names);
  })

  // 発言
  socket.on("shout", (name, message) => {
    const chatid = clientConfigs[socket.id][0];
    var alltext = [name, message];

    clientConfigs[socket.id][2] = name;

    names = [...new Set (Object.values(clientConfigs)
      .map(value => value[2])
      .filter(Boolean))];
      
    socket.emit("sending");

    io.emit("dousetu", IPs.length, names);

    // データ量のカウント
    let nameSize = 0;
    let textSize = 0;

    for (let i = 0; i < 2; i++) {
        let newText = "";
        for (const char of alltext[i]) {
            const codePoint = char.codePointAt(0);

            // 絵文字の処理（データ量9）
            if (char.match(/\p{Emoji_Presentation}/u)) {
              if(i==0){
                nameSize += 9;
              }
              if(i==1){
                textSize += 9;
              }
              newText += `%26%23${codePoint}%3B`;
            }
            // 全角文字の処理（データ量2）
            else if (codePoint > 0x7F) {
              if(i==0){
                nameSize += 2;
              }
              if(i==1){
                textSize += 2;
              }
              newText += iconv.encode(char, "EUC-JP")  // 文字を EUC-JP にエンコード
              .toString("hex")           // 16進数の文字列に変換
              .toUpperCase()             // 大文字に変換（例: "e3" → "E3"）
              .replace(/(..)/g, "%$1");  // 2文字ごとに区切り、%を追加（例: "E3" → "%E3"）
            }
            // 半角文字の処理（データ量1）
            else {
              if(i==0){
                nameSize += 1;
              }
              if(i==1){
                textSize += 1;
              }
              newText += char;
            }
        }
        alltext[i] = newText;
    }

    // データ量が100を超えたら送信不可
    if (nameSize > 20) {
      socket.emit("event",{type:"error",msg:`名前のデータ量が多いので送信できません。あと${100-nameSize}(半角1,全角2,絵文字9)減らしてください。`})
      return; // 処理を中断
    }

    if (textSize > 100) {
      socket.emit("event",{type:"error",msg:`メッセージのデータ量が多いので送信できません。あと${100-textSize}(半角1,全角2,絵文字9)減らしてください。`})
      return; // 処理を中断
    }

    sendmsg();
    
    function sendmsg(){
      try {
        axios.get(`https://chat2.fc2.com/ch/ajax_write.php?id=${clientConfigs[socket.id][0]}&count=100&unique_str=${clientConfigs[socket.id][1]}&name=${alltext[0]}&comment=${alltext[1]}`) // + "%26%238237%3B"}`)
        .then((response) => {
          socket.emit("send success");
          io.to(chatid).emit("shoutbylogger",(name + "： " + message));
        })
        .catch ((error) => {
          console.log(`「${name + "： " + message}」を再送信中...`);
          socket.emit("event",{type:"info",msg:`「${name + "： " + message}」を再送信中...`})
          setTimeout(sendmsg,3000);
        })
      } catch (error) {
        console.log(error.name);
      }
    }

    process.on("exit", (code) => {
      socket.emit("event",{type:"info",msg:`サーバーが停止しました。終了コード：${code}`});
    })

  });

});

