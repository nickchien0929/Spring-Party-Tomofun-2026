import React, { useState, useEffect, useRef, useCallback } from "react";

const DB_URL = "https://spring-party-scoring-default-rtdb.asia-southeast1.firebasedatabase.app";

const MIAO_COLOR = "#4FAFAF";
const MIAO_GLOW = "#00ffff";
const WANG_COLOR = "#E8845A";
const WANG_GLOW = "#ff8844";

const GROUPS = Array.from({ length: 11 }, (_, i) => ({
  id: i, name: `第${i}組`, team: i <= 4 ? "喵喵隊" : "汪汪隊",
}));
const RANK_SCORES = [110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

function getRankScores(values, higher = true) {
  const withVal = values.filter((v) => v.val !== null && v.val !== undefined);
  const sorted = [...withVal].sort((a, b) => higher ? b.val - a.val : a.val - b.val);
  const result = {};
  let rankIndex = 0, i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].val === sorted[i].val) j++;
    const score = RANK_SCORES[rankIndex] ?? 10;
    for (let k = i; k < j; k++) result[sorted[k].id] = score;
    rankIndex++; i = j;
  }
  return result;
}

const TABS = ["遊戲一", "遊戲二", "遊戲三", "總排行榜"];
const initG1 = () => GROUPS.map((g) => ({ id: g.id, r1: "" }));
const initG2 = () => GROUPS.map((g) => ({ id: g.id, a: "", b: "" }));
const initG3 = () => GROUPS.map((g) => ({ id: g.id, rank: "" }));

// ── Canvas helpers ──
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}
function drawBg(ctx, W=1920, H=1080) {
  ctx.fillStyle="#0e0e0e"; ctx.fillRect(0,0,W,H);
  const BW=124, BH=48, GAP=5;
  const rows=Math.ceil(H/(BH+GAP))+2, cols=Math.ceil(W/(BW+GAP))+2;
  for(let r=0;r<rows;r++){
    const ox=(r%2)*(BW/2+GAP/2);
    for(let c=0;c<cols;c++){
      const bx=c*(BW+GAP)+ox-BW, by=r*(BH+GAP);
      const shade=(c*3+r*7)%6;
      ctx.fillStyle=shade<2?"#1b1b1b":shade<4?"#181818":"#1e1e1e";
      ctx.beginPath();ctx.rect(bx,by,BW,BH);ctx.fill();
      ctx.save();ctx.globalAlpha=0.03;ctx.strokeStyle="#fff";ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(bx+BW*.12,by);ctx.lineTo(bx,by+BH*.65);ctx.stroke();
      ctx.restore();
    }
  }
  ctx.strokeStyle="#262626"; ctx.lineWidth=GAP;
  for(let r=0;r<rows;r++){
    const y=r*(BH+GAP)+BH, ox=(r%2)*(BW/2+GAP/2);
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
    for(let c=0;c<cols+1;c++){
      const x=c*(BW+GAP)+ox-BW+BW;
      ctx.beginPath();ctx.moveTo(x,r*(BH+GAP));ctx.lineTo(x,r*(BH+GAP)+BH);ctx.stroke();
    }
  }
}
function glowBox(ctx,x,y,w,h,r,color){
  ctx.save(); ctx.shadowColor=color; ctx.shadowBlur=30;
  ctx.strokeStyle=color; ctx.lineWidth=2.5;
  roundRect(ctx,x,y,w,h,r); ctx.stroke(); ctx.restore();
}

// ── FIX 1: Canvas input box values — centered vertically & horizontally ──
function drawInputBox(ctx, x, y, w, h, r, value, fontSize, color) {
  ctx.fillStyle="#1a1a1a";
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle="#333"; ctx.lineWidth=1.5;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.fillStyle="#eee";
  ctx.font=`bold ${fontSize}px "Microsoft JhengHei"`;
  ctx.textAlign="center";
  ctx.textBaseline="middle";
  ctx.fillText(value||"-", x + w/2, y + h/2);
}

// ── FIX 2: iOS detection for download ──
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// ── FIX 2: Download helper — iOS shows share sheet, others direct download ──
function downloadDataUrl(dataUrl, filename) {
  if (isIOS()) {
    // On iOS, open in new tab so user can long-press → Save to Photos
    const win = window.open();
    if (win) {
      win.document.write(`
        <html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>${filename}</title>
            <style>
              body { margin:0; background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; }
              img { max-width:100%; max-height:80vh; object-fit:contain; }
              p { color:#fff; font-size:16px; margin-top:16px; text-align:center; padding:0 20px; }
            </style>
          </head>
          <body>
            <img src="${dataUrl}" />
            <p>📥 長按圖片 → 選擇「加入照片」即可儲存到相簿</p>
          </body>
        </html>
      `);
      win.document.close();
    }
  } else {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }
}

function exportCanvas(g1,g1s,g2,g2s,g3,g3s,mode,finalTotals,winnerTeam,miaoAvg,wangAvg){
  const W=1920,H=1080;
  const canvas=document.createElement("canvas"); canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext("2d");
  drawBg(ctx);
  ctx.save(); ctx.font='bold 54px "Microsoft JhengHei",sans-serif'; ctx.textAlign="center";
  ctx.shadowColor="#ff44aa"; ctx.shadowBlur=22;
  ctx.strokeStyle="#ffffff"; ctx.lineWidth=2.5; ctx.lineJoin="round";
  ctx.strokeText("🎉 Tomofun春酒計分系統",960,66);
  ctx.fillStyle="#ffffff";
  ctx.fillText("🎉 Tomofun春酒計分系統",960,66); ctx.restore();
  const subtitles={g1:"🎯 遊戲一：尋愛的限時突擊",g2:"⏱️ 遊戲二：第六感爆走",g3:"📱 遊戲三：不良高校入學考",rank:"🏅 總排行榜"};
  const subText=subtitles[mode];
  ctx.save();
  ctx.font='bold 35px "Microsoft JhengHei"';
  ctx.textAlign="center"; ctx.textBaseline="middle";
  const subBoxH=58; const subBoxY=100;
  const subW=ctx.measureText(subText).width+90; const subX=960-subW/2;
  ctx.fillStyle="rgba(10,10,10,0.88)"; roundRect(ctx,subX,subBoxY,subW,subBoxH,subBoxH/2); ctx.fill();
  ctx.strokeStyle="#cc3333"; ctx.lineWidth=2.5; roundRect(ctx,subX,subBoxY,subW,subBoxH,subBoxH/2); ctx.stroke();
  ctx.shadowColor="#ff4444"; ctx.shadowBlur=20; ctx.fillStyle="#ff4444";
  ctx.fillText(subText,960,subBoxY+subBoxH/2);
  ctx.restore();

  if(mode==="rank"){
    [[MIAO_COLOR,MIAO_GLOW,"喵喵隊","🐱",miaoAvg,60],[WANG_COLOR,WANG_GLOW,"汪汪隊","🐶",wangAvg,990]].forEach(([c,g,name,em,avg,x])=>{
      const isW=winnerTeam===name;
      const cardBg=isW?(name==="喵喵隊"?"rgba(30,120,120,0.75)":"rgba(160,80,20,0.70)"):"rgba(10,10,10,0.88)";
      ctx.fillStyle=cardBg; roundRect(ctx,x,178,870,112,14); ctx.fill();
      ctx.save();
      ctx.shadowColor=g; ctx.shadowBlur=isW?40:22;
      ctx.strokeStyle=c; ctx.lineWidth=isW?2.5:1.8;
      roundRect(ctx,x,178,870,112,14); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.shadowColor=g; ctx.shadowBlur=isW?20:10;
      ctx.fillStyle=isW?"#ffffff":c;
      ctx.font='bold 32px "Microsoft JhengHei"'; ctx.textAlign="left";
      ctx.fillText(`${em} ${name}`,x+24,228); ctx.restore();
      ctx.fillStyle="#ffffff";
      ctx.font='16px "Microsoft JhengHei"'; ctx.textAlign="left";
      ctx.fillText("平均分",x+24,262);
      ctx.save(); ctx.shadowColor=g; ctx.shadowBlur=16;
      ctx.fillStyle=isW?"#ffffff":c;
      ctx.font='bold 58px "Microsoft JhengHei"'; ctx.textAlign="center";
      ctx.fillText(avg.toFixed(1),x+435,258); ctx.restore();
      if(isW){
        ctx.fillStyle="rgba(255,215,0,0.30)"; roundRect(ctx,x+614,203,240,62,31); ctx.fill();
        ctx.strokeStyle="#FFD700"; ctx.lineWidth=2; roundRect(ctx,x+614,203,240,62,31); ctx.stroke();
        ctx.save(); ctx.shadowColor="#FFD700"; ctx.shadowBlur=16;
        ctx.fillStyle="#ffffff"; ctx.font='bold 21px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText("🏆 勝隊 +50分/組",x+734,234); ctx.restore();
      }
    });
    const tableTop=306; const tableH=1080-tableTop-12;
    ctx.fillStyle="rgba(10,10,10,0.90)"; roundRect(ctx,40,tableTop,1840,tableH,14); ctx.fill();
    ctx.strokeStyle="#222"; ctx.lineWidth=1; roundRect(ctx,40,tableTop,1840,tableH,14); ctx.stroke();
    const colPad=40; const colAreaW=1840-colPad*2;
    const colRatios=[1,1.1,1.1,0.9,0.9,0.9,0.9,0.9,1.1];
    const colTotal=colRatios.reduce((a,b)=>a+b,0);
    const cols=colRatios.reduce((acc,r,i)=>{
      const w=(r/colTotal)*colAreaW;
      return [...acc, 40+colRatios.slice(0,i).reduce((s,x)=>s+x,0)/colTotal*colAreaW + w/2];
    },[]);
    const hdrY=tableTop+36;
    ctx.fillStyle="#ffffff"; ctx.font='bold 24px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="alphabetic";
    ["名次","組別","隊伍","G1","G2","G3","小計","加成","總分"].forEach((h,i)=>ctx.fillText(h,cols[i],hdrY));
    ctx.strokeStyle="rgba(255,255,255,0.25)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(60,hdrY+14); ctx.lineTo(1860,hdrY+14); ctx.stroke();
    const colBorders=(()=>{let cx=40;return colRatios.slice(0,-1).map(r=>{cx+=r/colTotal*1840;return cx;});})();
    const maxS1=Math.max(...finalTotals.map(t=>t.s1||0));
    const maxS2=Math.max(...finalTotals.map(t=>t.s2||0));
    const maxS3=Math.max(...finalTotals.map(t=>t.s3||0));
    const maxSum=Math.max(...finalTotals.map(t=>t.sum||0));
    const bodyTop=hdrY+20; const bodyH=tableTop+tableH-bodyTop-10;
    const rowH=Math.floor(bodyH/finalTotals.length);
    ctx.strokeStyle="rgba(255,255,255,0.08)"; ctx.lineWidth=1;
    colBorders.forEach(bx=>{
      ctx.beginPath(); ctx.moveTo(bx,hdrY+14); ctx.lineTo(bx,tableTop+tableH-2); ctx.stroke();
    });
    finalTotals.forEach((t,rank)=>{
      const g=GROUPS[t.id]; const isMiao=g.id<=4;
      const color=isMiao?MIAO_COLOR:WANG_COLOR; const glow=isMiao?MIAO_GLOW:WANG_GLOW;
      const groupColor=isMiao?"#88dddd":"#f0aa88";
      const isFirst=rank===0; const isTop3=rank<3;
      const fSize=isFirst?55:45;
      const y=bodyTop+rank*rowH;
      if(isFirst){ctx.fillStyle="rgba(255,215,0,0.10)"; roundRect(ctx,52,y,1776,rowH,10); ctx.fill();}
      else if(isTop3){ctx.fillStyle="rgba(255,255,255,0.03)"; roundRect(ctx,52,y,1776,rowH,10); ctx.fill();}
      const mid=y+rowH/2;
      const medal=["🥇","🥈","🥉"][rank]??(rank+1)+"";
      ctx.save();
      if(isFirst){ctx.shadowColor="#FFD700";ctx.shadowBlur=14;}
      ctx.font=rank<3?`${fSize}px sans-serif`:`bold ${fSize}px "Microsoft JhengHei"`;
      ctx.fillStyle=isFirst?"#FFD700":rank===1||rank===2?"#cccccc":"#777777";
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(medal,cols[0],mid); ctx.restore();
      ctx.save();
      if(isFirst){ctx.shadowColor="#FFD700";ctx.shadowBlur=10;}
      ctx.font=`bold ${fSize}px "Microsoft JhengHei"`;
      ctx.fillStyle=isFirst?"#FFD700":groupColor;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(g.name,cols[1],mid); ctx.restore();
      ctx.save(); ctx.shadowColor=glow; ctx.shadowBlur=isFirst?10:6;
      ctx.fillStyle=isFirst?"#FFD700":color;
      ctx.font=`bold ${Math.round(fSize*0.72)}px "Microsoft JhengHei"`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(g.team,cols[2],mid); ctx.restore();
      const s1c=(t.s1&&t.s1>0&&t.s1===maxS1)?"#FFD700":"#ffffff";
      ctx.save(); if(s1c==="#FFD700"){ctx.shadowColor="#FFD700";ctx.shadowBlur=10;}
      ctx.fillStyle=t.s1?s1c:"#444"; ctx.font=`bold ${fSize}px "Microsoft JhengHei"`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t.s1||"-",cols[3],mid); ctx.restore();
      const s2c=(t.s2&&t.s2>0&&t.s2===maxS2)?"#FFD700":"#ffffff";
      ctx.save(); if(s2c==="#FFD700"){ctx.shadowColor="#FFD700";ctx.shadowBlur=10;}
      ctx.fillStyle=t.s2?s2c:"#444"; ctx.font=`bold ${fSize}px "Microsoft JhengHei"`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t.s2||"-",cols[4],mid); ctx.restore();
      const s3c=(t.s3&&t.s3>0&&t.s3===maxS3)?"#FFD700":"#ffffff";
      ctx.save(); if(s3c==="#FFD700"){ctx.shadowColor="#FFD700";ctx.shadowBlur=10;}
      ctx.fillStyle=t.s3?s3c:"#444"; ctx.font=`bold ${fSize}px "Microsoft JhengHei"`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t.s3||"-",cols[5],mid); ctx.restore();
      const sc2=(t.sum&&t.sum>0&&t.sum===maxSum)?"#FFD700":"#ffffff";
      ctx.save(); if(sc2==="#FFD700"){ctx.shadowColor="#FFD700";ctx.shadowBlur=10;}
      ctx.fillStyle=t.sum?sc2:"#444"; ctx.font=`bold ${fSize}px "Microsoft JhengHei"`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t.sum,cols[6],mid); ctx.restore();
      ctx.save(); ctx.shadowColor="#FFD700"; ctx.shadowBlur=t.bonus?16:0;
      ctx.fillStyle=t.bonus?"#FFD700":"#555";
      ctx.font=`bold ${fSize}px "Microsoft JhengHei"`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t.bonus?`+${t.bonus}`:"-",cols[7],mid); ctx.restore();
      ctx.save(); ctx.shadowColor=isFirst?"#FFD700":glow; ctx.shadowBlur=isFirst?28:12;
      ctx.fillStyle=isFirst?"#FFD700":color;
      ctx.font=`bold ${fSize}px "Microsoft JhengHei"`;
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(t.final,cols[8],mid); ctx.restore();
      ctx.strokeStyle="rgba(255,255,255,0.10)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(60,y+rowH); ctx.lineTo(1860,y+rowH); ctx.stroke();
    });
    return canvas.toDataURL("image/png");
  }

  // game panels
  const panels=[
    {team:"喵喵隊",ids:[0,1,2,3,4],sx:40,c:MIAO_COLOR,g:MIAO_GLOW},
    {team:"汪汪隊",ids:[5,6,7,8,9,10],sx:990,c:WANG_COLOR,g:WANG_GLOW},
  ];
  panels.forEach(({team,ids,sx,c,g})=>{
    const W2=870;
    ctx.fillStyle="rgba(10,10,10,0.88)"; roundRect(ctx,sx,178,W2,868,16); ctx.fill();
    glowBox(ctx,sx,178,W2,868,16,g);
    ctx.save(); ctx.shadowColor=g; ctx.shadowBlur=22; ctx.fillStyle=c;
    ctx.font='bold 55px "Microsoft JhengHei"'; ctx.textAlign="center";
    ctx.fillText(`${team==="喵喵隊"?"🐱":"🐶"} ${team}`,sx+W2/2,246); ctx.restore();

    let hdrs,colX;
    const pad=30; const usableW=W2-pad*2;
    if(mode==="g1"){
      hdrs=["排名","組別","答對題數","積分"];
      colX=hdrs.map((_,i)=>sx+pad+usableW*(i+0.5)/hdrs.length);
    } else if(mode==="g2"){
      hdrs=["排名","組別","A秒","B秒","總誤差","積分"];
      colX=hdrs.map((_,i)=>sx+pad+usableW*(i+0.5)/hdrs.length);
    } else {
      hdrs=["排名","組別","Kahoot排名","原始分","×1.3"];
      colX=hdrs.map((_,i)=>sx+pad+usableW*(i+0.5)/hdrs.length);
    }

    ctx.fillStyle=c+"cc"; ctx.font='bold 26px "Microsoft JhengHei"'; ctx.textAlign="center";
    // FIX 1: use textBaseline middle for header too
    ctx.textBaseline="alphabetic";
    hdrs.forEach((h,i)=>ctx.fillText(h,colX[i],316));
    ctx.strokeStyle=c+"44"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(sx+20,330); ctx.lineTo(sx+W2-20,330); ctx.stroke();

    ids.forEach((id,ri)=>{
      const y=348+ri*94;
      const nameColor=team==="喵喵隊"?"#88dddd":"#f0aa88";
      // FIX 1: row mid Y for vertical centering
      const rowMid = y + 37; // center of 74px row height

      if(mode==="g1"){
        const sc=g1s[id]; const v=g1[id]?.r1;
        const rankLabel=sc>0?`#${RANK_SCORES.indexOf(sc)+1}`:"-";
        const rankNum2=parseInt(rankLabel.replace("#",""));
        const isTop3=!isNaN(rankNum2)&&rankNum2<=3;
        ctx.save(); if(sc>0){ctx.shadowColor=isTop3?"#FFD700":g; ctx.shadowBlur=isTop3?14:8;}
        ctx.fillStyle=rankLabel==="-"?"#444":isTop3?"#FFD700":"#aaaaaa";
        ctx.font='bold 26px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(rankLabel,colX[0],rowMid); ctx.restore();
        ctx.fillStyle=nameColor; ctx.font='bold 26px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(`第${id}組`,colX[1],rowMid);
        // FIX 1: Input box centered in row (h=52, so y offset = (74-52)/2 = 11)
        drawInputBox(ctx, colX[2]-52, y+11, 104, 52, 10, v, 28, "#eee");
        ctx.save(); if(sc>0){ctx.shadowColor=g; ctx.shadowBlur=14;}
        ctx.fillStyle=sc>0?c:"#555"; ctx.font='bold 36px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(sc!=null?String(sc):"-",colX[3],rowMid); ctx.restore();

      } else if(mode==="g2"){
        const sc=g2s[id]; const d=g2[id];
        const rankLabel=sc>0?`#${RANK_SCORES.indexOf(sc)+1}`:"-";
        const rankNum2=parseInt(rankLabel.replace("#",""));
        const isTop3=!isNaN(rankNum2)&&rankNum2<=3;
        const av=parseFloat(d?.a), bv=parseFloat(d?.b);
        const aErr=!isNaN(av)?Math.abs(av-8):null;
        const bErr=!isNaN(bv)?Math.abs(bv-10):null;
        const totalErr=(aErr!==null&&bErr!==null)?(aErr+bErr).toFixed(3):aErr!==null?aErr.toFixed(3):bErr!==null?bErr.toFixed(3):"-";
        ctx.save(); if(sc>0){ctx.shadowColor=isTop3?"#FFD700":g; ctx.shadowBlur=isTop3?14:8;}
        ctx.fillStyle=rankLabel==="-"?"#444":isTop3?"#FFD700":"#aaaaaa";
        ctx.font='bold 26px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(rankLabel,colX[0],rowMid); ctx.restore();
        ctx.fillStyle=nameColor; ctx.font='bold 26px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(`第${id}組`,colX[1],rowMid);
        // FIX 1: Input boxes vertically centered
        drawInputBox(ctx, colX[2]-48, y+11, 96, 52, 10, d?.a, 24, "#eee");
        drawInputBox(ctx, colX[3]-48, y+11, 96, 52, 10, d?.b, 24, "#eee");
        ctx.save(); if(totalErr!=="-"){ctx.shadowColor=g; ctx.shadowBlur=8;}
        ctx.fillStyle=totalErr!=="-"?c+"dd":"#444";
        ctx.font='bold 24px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(totalErr,colX[4],rowMid-8); ctx.restore();
        if(totalErr!=="-"){
          ctx.fillStyle=c+"88"; ctx.font='16px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
          ctx.fillText("秒",colX[4],rowMid+14);
        }
        ctx.save(); if(sc>0){ctx.shadowColor=g; ctx.shadowBlur=14;}
        ctx.fillStyle=sc>0?c:"#555"; ctx.font='bold 36px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(sc!=null?String(sc):"-",colX[5],rowMid); ctx.restore();

      } else {
        const sc=g3s[id]; const r=parseInt(g3[id]?.rank);
        const rankLabel=!isNaN(r)&&r>=1?`#${r}`:"-";
        const rankNum2=parseInt(rankLabel.replace("#",""));
        const isTop3=!isNaN(rankNum2)&&rankNum2<=3;
        const base=!isNaN(r)&&r>=1&&r<=11?RANK_SCORES[r-1]:null;
        ctx.save(); if(!isNaN(r)&&r>=1){ctx.shadowColor=isTop3?"#FFD700":g; ctx.shadowBlur=isTop3?14:8;}
        ctx.fillStyle=rankLabel==="-"?"#444":isTop3?"#FFD700":"#aaaaaa";
        ctx.font='bold 26px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(rankLabel,colX[0],rowMid); ctx.restore();
        ctx.fillStyle=nameColor; ctx.font='bold 26px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(`第${id}組`,colX[1],rowMid);
        // FIX 1: Input box vertically centered
        drawInputBox(ctx, colX[2]-52, y+11, 104, 52, 10, g3[id]?.rank, 28, "#eee");
        ctx.fillStyle=base!==null?c+"99":"#444";
        ctx.font='bold 26px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(base!=null?String(base):"-",colX[3],rowMid);
        ctx.save(); if(sc>0){ctx.shadowColor=g; ctx.shadowBlur=14;}
        ctx.fillStyle=sc>0?c:"#555"; ctx.font='bold 36px "Microsoft JhengHei"'; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillText(sc!=null?String(sc):"-",colX[4],rowMid); ctx.restore();
      }

      ctx.strokeStyle="#ffffff08"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(sx+20,y+74); ctx.lineTo(sx+W2-20,y+74); ctx.stroke();
    });
    const total=ids.reduce((s,id)=>{
      const sc=mode==="g1"?g1s[id]:mode==="g2"?g2s[id]:g3s[id];
      return s+(sc??0);
    },0);
    const cardX=sx+20, cardW=W2-40, cardH=52, cardY=974;
    ctx.fillStyle=c+"1c"; roundRect(ctx,cardX,cardY,cardW,cardH,8); ctx.fill();
    ctx.strokeStyle=c+"55"; ctx.lineWidth=1.5; roundRect(ctx,cardX,cardY,cardW,cardH,8); ctx.stroke();
    ctx.fillStyle=c+"88"; ctx.font='bold 22px "Microsoft JhengHei"';
    ctx.textAlign="left"; ctx.textBaseline="middle";
    ctx.fillText("隊伍總分：",cardX+16,cardY+cardH/2);
    ctx.save();
    ctx.shadowColor=g; ctx.shadowBlur=24;
    ctx.font='bold 50px "Microsoft JhengHei"';
    ctx.textBaseline="middle";
    const totalStr=String(total);
    const spacing=10;
    const totalTxtW=totalStr.split("").reduce((s,ch)=>s+ctx.measureText(ch).width,0)+spacing*(totalStr.length-1);
    let cx2=cardX+cardW/2-totalTxtW/2;
    for(const ch of totalStr){
      const cw=ctx.measureText(ch).width;
      ctx.fillStyle=c; ctx.fillText(ch,cx2,cardY+cardH/2);
      cx2+=cw+spacing;
    }
    ctx.restore();
  });
  return canvas.toDataURL("image/png");
}

// ── FIX 3 (long press): PlusMinusInput with improved touch support ──
function PlusMinusInput({ value, onChange, min=0, max=10, step=1, placeholder, color, glow }) {
  const g=glow||color;
  const num=value!==""?parseFloat(value):null;
  const dec=step<1?2:0;
  const pressTimer=useRef(null);
  const pressInterval=useRef(null);
  // Use ref to always read latest value in interval callback
  const valueRef=useRef(value);
  useEffect(()=>{ valueRef.current=value; },[value]);

  const adj=useCallback((delta)=>{
    const cur=parseFloat(valueRef.current);
    const v=!isNaN(cur)?cur:(delta>0?min-delta:max-delta);
    const next=Math.max(min,Math.min(max,parseFloat((v+delta).toFixed(dec))));
    onChange(String(next));
  },[min,max,dec,onChange]);

  const startPress=useCallback((delta)=>{
    adj(delta);
    pressTimer.current=setTimeout(()=>{
      pressInterval.current=setInterval(()=>adj(delta),80);
    },400);
  },[adj]);

  const stopPress=useCallback(()=>{
    clearTimeout(pressTimer.current);
    clearInterval(pressInterval.current);
  },[]);

  // Cleanup on unmount
  useEffect(()=>()=>stopPress(),[stopPress]);

  const btnStyle={
    width:"28px",height:"28px",borderRadius:"50%",
    background:color+"22",border:`1.5px solid ${color}`,
    color,fontWeight:"900",fontSize:"16px",cursor:"pointer",
    boxShadow:`0 0 7px ${g}55`,lineHeight:1,
    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
    userSelect:"none",WebkitUserSelect:"none",
    // Prevent iOS callout on long press
    WebkitTouchCallout:"none",
    touchAction:"none",
  };
  return (
    <div style={{display:"flex",alignItems:"center",gap:"4px",justifyContent:"center"}}>
      <button
        onMouseDown={()=>startPress(-step)}
        onMouseUp={stopPress}
        onMouseLeave={stopPress}
        onTouchStart={(e)=>{e.preventDefault();startPress(-step);}}
        onTouchEnd={(e)=>{e.preventDefault();stopPress();}}
        onTouchCancel={stopPress}
        style={btnStyle}>−</button>
      <input type="number" value={value} step={step}
        onChange={(e)=>onChange(e.target.value)}
        onKeyDown={(e)=>{
          if(e.key==="ArrowUp"||e.key==="ArrowDown"){
            e.preventDefault();
            adj(e.key==="ArrowUp"?step:-step);
          }
        }}
        onBlur={(e)=>{const v=parseFloat(e.target.value);if(!isNaN(v))onChange(String(Math.max(min,Math.min(max,parseFloat(v.toFixed(dec))))));}}
        placeholder={placeholder}
        style={{width:"52px",textAlign:"center",background:"#111",border:"1px solid #2a2a2a",
          borderRadius:"7px",padding:"3px 2px",color:"#eee",fontSize:"14px",fontWeight:"700",outline:"none"}}/>
      <button
        onMouseDown={()=>startPress(step)}
        onMouseUp={stopPress}
        onMouseLeave={stopPress}
        onTouchStart={(e)=>{e.preventDefault();startPress(step);}}
        onTouchEnd={(e)=>{e.preventDefault();stopPress();}}
        onTouchCancel={stopPress}
        style={btnStyle}>+</button>
    </div>
  );
}

function TeamPanel({title,emoji,subtitle,color,glow,children,totalScore}){
  return(
    <div style={{flex:1,background:"rgba(10,10,10,0.90)",borderRadius:"14px",padding:"12px",
      border:`1.5px solid ${color}55`,
      boxShadow:`0 0 30px ${glow}44, 0 0 8px ${glow}22, inset 0 0 20px rgba(0,0,0,0.4)`,
      display:"flex",flexDirection:"column",minWidth:0}}>
      <div style={{textAlign:"center",marginBottom:"10px"}}>
        <div style={{fontSize:"18px",fontWeight:"900",color,textShadow:`0 0 12px ${glow}`,letterSpacing:"1px"}}>{emoji} {title}</div>
        <div style={{fontSize:"10px",color:color+"77",marginTop:"1px"}}>{subtitle}</div>
      </div>
      <div style={{flex:1}}>{children}</div>
      {totalScore!==undefined&&(
        <div style={{marginTop:"10px",padding:"7px 10px",background:color+"11",borderRadius:"8px",
          border:`1px solid ${color}33`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:"11px",color:color+"88"}}>隊伍總分：</span>
          <span style={{fontSize:"24px",fontWeight:"900",color,textShadow:`0 0 12px ${glow}`}}>{totalScore}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab,setTab]=useState(0);
  const [g1,setG1]=useState(initG1());
  const [g2,setG2]=useState(initG2());
  const [g3,setG3]=useState(initG3());
  const [showChampion,setShowChampion]=useState(false);
  const [syncStatus,setSyncStatus]=useState("connecting");
  // FIX 4: detect mobile for stacked layout
  const [isMobile,setIsMobile]=useState(()=>window.innerWidth<640);
  const confettiRef=useRef(null);
  const saveTimerRef=useRef(null);

  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<640);
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[]);

  useEffect(()=>{
    const es=new EventSource(`${DB_URL}/scores.json?accept=text/event-stream`);
    const apply=(e)=>{try{const d=JSON.parse(e.data).data;if(!d)return;if(d.g1)setG1(d.g1);if(d.g2)setG2(d.g2);if(d.g3)setG3(d.g3);setSyncStatus("synced");}catch{}};
    es.addEventListener("put",apply); es.addEventListener("patch",apply);
    es.onerror=()=>setSyncStatus("error");
    return()=>es.close();
  },[]);

  const scheduleSave=useCallback((ng1,ng2,ng3)=>{
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current=setTimeout(async()=>{
      try{setSyncStatus("connecting");
        await fetch(`${DB_URL}/scores.json`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({g1:ng1,g2:ng2,g3:ng3})});
        setSyncStatus("synced");}catch{setSyncStatus("error");}
    },800);
  },[]);

  const upG1=(v)=>{setG1(v);scheduleSave(v,g2,g3);};
  const upG2=(v)=>{setG2(v);scheduleSave(g1,v,g3);};
  const upG3=(v)=>{setG3(v);scheduleSave(g1,g2,v);};

  const g1Scores=(()=>{
    const vals=g1.map(g=>({id:g.id,val:g.r1!==""?parseFloat(g.r1):null}));
    const ranked=getRankScores(vals,true); const result={};
    vals.forEach(v=>{result[v.id]=v.val===null?null:v.val===0?0:(ranked[v.id]??0);}); return result;
  })();
  const g2Scores=(()=>{
    const vals=g2.map(g=>{const a=parseFloat(g.a),b=parseFloat(g.b);
      if(g.a===""&&g.b==="")return{id:g.id,val:null};
      return{id:g.id,val:Math.round(((!isNaN(a)?Math.abs(a-8):0)+(!isNaN(b)?Math.abs(b-10):0))*1000)/1000};});
    const ranked=getRankScores(vals,false); const result={};
    vals.forEach(v=>{result[v.id]=v.val===null?null:(ranked[v.id]??0);}); return result;
  })();
  const g3Scores=(()=>{
    const result={};
    g3.forEach(g=>{const r=parseInt(g.rank);result[g.id]=(isNaN(r)||r<1||r>11)?null:Math.round((RANK_SCORES[r-1]??10)*1.3);});
    return result;
  })();

  const totals=GROUPS.map(g=>{
    const s1=g1Scores[g.id]??0,s2=g2Scores[g.id]??0,s3=g3Scores[g.id]??0;
    return{id:g.id,s1,s2,s3,sum:s1+s2+s3};
  });
  const miaoAvg=totals.filter(t=>t.id<=4).reduce((a,b)=>a+b.sum,0)/5;
  const wangAvg=totals.filter(t=>t.id>=5).reduce((a,b)=>a+b.sum,0)/6;
  const winnerTeam=miaoAvg>wangAvg?"喵喵隊":miaoAvg<wangAvg?"汪汪隊":null;
  const finalTotals=totals.map(t=>{const bonus=winnerTeam&&GROUPS[t.id].team===winnerTeam?50:0;return{...t,bonus,final:t.sum+bonus};}).sort((a,b)=>b.final-a.final);

  useEffect(()=>{
    if(!showChampion)return; let frame;
    const canvas=confettiRef.current; if(!canvas)return;
    const ctx=canvas.getContext("2d"); canvas.width=window.innerWidth; canvas.height=window.innerHeight;
    const pieces=Array.from({length:150},()=>({x:Math.random()*canvas.width,y:Math.random()*-canvas.height,
      r:Math.random()*8+3,d:Math.random()*60+20,
      color:["#cc3333","#ff4444","#4FAFAF","#00ffff","#E8845A","#ff8844","#ffdd44","#ff66aa"][Math.floor(Math.random()*8)],
      tilt:Math.random()*10-10,speed:Math.random()*3+1}));
    const draw=()=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);
      pieces.forEach(p=>{ctx.beginPath();ctx.ellipse(p.x,p.y,p.r,p.r/2,p.tilt,0,Math.PI*2);
        ctx.fillStyle=p.color;ctx.fill();p.y+=p.speed;p.x+=Math.sin(p.d/10)*1.5;p.d++;
        if(p.y>canvas.height){p.y=-10;p.x=Math.random()*canvas.width;}});
      frame=requestAnimationFrame(draw);};
    draw(); return()=>cancelAnimationFrame(frame);
  },[showChampion]);

  const syncColor={connecting:"#e8a030",synced:MIAO_COLOR,error:"#ff4444"};
  const syncLabel={connecting:"⏳ 同步中…",synced:"✅ 已同步",error:"❌ 同步失敗"};

  const tdC={padding:"6px 2px",textAlign:"center"};
  const rowDiv=(c)=>({borderBottom:`1px solid ${c}18`});
  const miao=GROUPS.filter(g=>g.id<=4);
  const wang=GROUPS.filter(g=>g.id>=5);

  const miaoT1=miao.reduce((s,g)=>s+(g1Scores[g.id]??0),0);
  const wangT1=wang.reduce((s,g)=>s+(g1Scores[g.id]??0),0);
  const miaoT2=miao.reduce((s,g)=>s+(g2Scores[g.id]??0),0);
  const wangT2=wang.reduce((s,g)=>s+(g2Scores[g.id]??0),0);
  const miaoT3=miao.reduce((s,g)=>s+(g3Scores[g.id]??0),0);
  const wangT3=wang.reduce((s,g)=>s+(g3Scores[g.id]??0),0);

  const tabStyle=(i)=>({
    flex:1,padding:"8px 2px",borderRadius:"9px",cursor:"pointer",
    fontWeight:"800",fontSize:"12px",letterSpacing:"0.3px",
    background:tab===i?"linear-gradient(135deg,#1a0505,#2a0a0a)":"transparent",
    color:tab===i?"#ff4444":"#555",
    boxShadow:tab===i?"0 0 10px rgba(200,50,50,0.35),inset 0 0 6px rgba(200,50,50,0.10)":"none",
    border:tab===i?"1px solid #cc333355":"1px solid transparent",
    textShadow:tab===i?"0 0 8px #ff4444":"none",
    transition:"all 0.15s",
  });

  const gameHeader=(icon,title,sub)=>(
    <div style={{textAlign:"center",marginBottom:"12px"}}>
      <div style={{display:"inline-block",padding:"6px 22px",background:"rgba(10,10,10,0.85)",
        border:"1.5px solid #cc3333",borderRadius:"999px",color:"#ff4444",fontWeight:"800",fontSize:"14px",
        boxShadow:"0 0 12px rgba(200,50,50,0.4)",textShadow:"0 0 8px #ff4444"}}>
        {icon} {title}
      </div>
      <div style={{fontSize:"11px",color:"#555",marginTop:"5px"}}>{sub}</div>
    </div>
  );

  const ScoreVal=({sc,color,glow})=>(
    <td style={{...tdC,color:sc>0?color:"#444",fontWeight:"900",fontSize:"17px",
      textShadow:sc>0?`0 0 10px ${glow}`:"none"}}>{sc??"-"}</td>
  );
  const RankVal=({sc,r,color,glow,isKahoot})=>{
    const label=isKahoot?(!isNaN(r)&&r>=1?`#${r}`:"-"):(sc>0?`#${RANK_SCORES.indexOf(sc)+1}`:"-");
    const num=label!=="-"?parseInt(label.replace("#","")):null;
    const isTop3=num!==null&&num<=3;
    const rankColor=label==="-"?"#444":isTop3?"#FFD700":"#aaaaaa";
    const rankShadow=label==="-"?"none":isTop3?"0 0 10px #FFD70099":"0 0 6px #aaaaaa55";
    return <td style={{...tdC,color:rankColor,fontWeight:"800",fontSize:"11px",
      textShadow:rankShadow}}>{label}</td>;
  };

  // FIX 2: Download button with iOS hint
  const DlBtn=({label,onClick})=>{
    const ios=isIOS();
    return(
      <div>
        <button onClick={onClick} style={{width:"100%",marginTop:"10px",padding:"11px",
          background:"linear-gradient(135deg,#1a0505,#2a0808)",color:"#ff6666",fontWeight:"800",
          borderRadius:"12px",border:"1.5px solid #cc3333",cursor:"pointer",fontSize:"13px",
          boxShadow:"0 0 16px rgba(200,50,50,0.40)",letterSpacing:"0.5px",textShadow:"0 0 8px #ff4444",
          display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
          📥 {label}
        </button>
        {ios&&<div style={{textAlign:"center",fontSize:"11px",color:"#888",marginTop:"4px"}}>
          📱 iPhone：點擊後長按圖片 → 「加入照片」即可存入相簿
        </div>}
      </div>
    );
  };

  // FIX 4: team panels direction — column on mobile, row on desktop
  const teamPanelWrap={
    display:"flex",
    flexDirection: isMobile ? "column" : "row",
    gap:"10px",
  };

  return (
    <div style={{minHeight:"100vh",
      background:"#1c2030",
      backgroundImage:`
        repeating-linear-gradient(0deg,transparent,transparent 36px,rgba(0,0,0,0.45) 36px,rgba(0,0,0,0.45) 40px),
        repeating-linear-gradient(90deg,transparent,transparent 72px,rgba(0,0,0,0.25) 72px,rgba(0,0,0,0.25) 74px)
      `,
      position:"relative",
      padding:"12px",fontFamily:"'Microsoft JhengHei','Noto Sans TC',sans-serif"}}>

      <svg style={{position:"fixed",inset:0,width:"100%",height:"100%",
        pointerEvents:"none",zIndex:0,opacity:0.18}}
        viewBox="0 0 1000 900" preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="ck" x="-6%" y="-6%" width="112%" height="112%">
            <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" seed="9"/>
            <feDisplacementMap in="SourceGraphic" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        </defs>
        <g filter="url(#ck)" stroke="#e8f0ff" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g transform="translate(4,10) scale(1.1)" strokeWidth="2.2">
            <ellipse cx="52" cy="88" rx="44" ry="38"/>
            <circle cx="76" cy="44" r="28"/>
            <path d="M68,18 C66,6 72,0 80,4 C86,8 84,18 76,18"/>
            <path d="M90,16 C94,4 102,-2 106,4 C110,10 104,18 96,16"/>
            <ellipse cx="90" cy="40" rx="5" ry="6" fill="#e8f0ff"/>
            <ellipse cx="92" cy="42" rx="2.5" ry="3"/>
            <path d="M102,46 C106,44 108,48"/>
            <ellipse cx="104" cy="44" rx="3" ry="2" fill="#e8f0ff"/>
            <path d="M106,44 C116,42 126,44" strokeWidth="1.6"/>
            <path d="M106,48 C116,48 126,50" strokeWidth="1.6"/>
            <path d="M10,88 C-4,80 -8,64 0,52 C6,42 14,46 12,58"/>
            <path d="M38,118 C34,126 34,132 38,132 C42,132 44,126 42,120"/>
            <path d="M62,120 C60,128 60,134 64,134 C68,134 70,128 68,122"/>
          </g>
          <g transform="translate(-4,240) scale(1.05)" strokeWidth="2.1">
            <ellipse cx="62" cy="60" rx="54" ry="28"/>
            <circle cx="96" cy="38" r="22"/>
            <path d="M88,18 C86,8 92,4 98,8 C102,12 100,20 92,18"/>
            <path d="M100,16 C104,6 110,2 114,8 C116,14 110,20 104,18"/>
            <ellipse cx="108" cy="36" rx="4" ry="5" fill="#e8f0ff"/>
            <ellipse cx="110" cy="38" rx="2" ry="2.5"/>
            <ellipse cx="118" cy="40" rx="2.5" ry="1.8" fill="#e8f0ff"/>
            <path d="M118,42 C120,46"/>
            <path d="M120,40 C130,38 140,40" strokeWidth="1.5"/>
            <path d="M120,44 C130,44 140,46" strokeWidth="1.5"/>
            <path d="M30,82 C24,94 22,104 24,108"/>
            <path d="M50,86 C50,98 52,108 54,112"/>
            <path d="M80,84 C82,96 86,106 84,110"/>
            <path d="M100,80 C104,92 106,102 104,106"/>
            <path d="M10,60 C-2,50 -4,36 4,28 C10,20 18,24 16,36"/>
          </g>
          <g transform="translate(2,456) scale(1.0)" strokeWidth="2.0">
            <ellipse cx="64" cy="64" rx="58" ry="26"/>
            <circle cx="102" cy="44" r="24"/>
            <path d="M92,22 C90,12 96,8 102,12 C106,16 104,24 96,22"/>
            <path d="M106,20 C110,10 116,6 120,12 C122,18 116,24 110,22"/>
            <path d="M112,40 C116,36 120,38 118,44" fill="#e8f0ff"/>
            <ellipse cx="122" cy="46" rx="2.5" ry="1.8" fill="#e8f0ff"/>
            <path d="M120,50 C122,54"/>
            <path d="M124,46 C134,44 144,46" strokeWidth="1.5"/>
            <path d="M124,50 C134,50 144,52" strokeWidth="1.5"/>
            <ellipse cx="100" cy="84" rx="22" ry="10"/>
            <path d="M8,64 C-4,58 -6,46 2,38 C8,30 16,36 12,46"/>
          </g>
          <g transform="translate(856,10) scale(1.1)" strokeWidth="2.2">
            <ellipse cx="56" cy="88" rx="46" ry="40"/>
            <circle cx="30" cy="44" r="28"/>
            <path d="M10,30 C2,38 2,56 8,62 C14,68 22,58 18,48"/>
            <path d="M36,18 C34,6 42,2 48,8 C52,14 46,22 38,20"/>
            <ellipse cx="16" cy="40" rx="5" ry="6" fill="#e8f0ff"/>
            <ellipse cx="18" cy="42" rx="2.5" ry="3"/>
            <ellipse cx="4" cy="46" rx="4" ry="3" fill="#e8f0ff"/>
            <path d="M2,50 C4,56 8,54"/>
            <path d="M100,88 C112,80 116,66 108,56 C100,46 90,50 92,62"/>
            <path d="M68,120 C64,128 64,134 68,134 C72,134 74,128 72,122"/>
            <path d="M44,118 C40,126 40,132 44,132 C48,132 50,126 48,120"/>
          </g>
          <g transform="translate(840,256) scale(1.05)" strokeWidth="2.1">
            <ellipse cx="60" cy="52" rx="52" ry="26"/>
            <circle cx="18" cy="32" r="20"/>
            <path d="M4,22 C-2,30 -2,44 4,50 C10,54 16,46 14,38"/>
            <path d="M22,14 C20,4 28,0 34,6 C36,12 30,18 24,16"/>
            <ellipse cx="8" cy="28" rx="4" ry="5" fill="#e8f0ff"/>
            <ellipse cx="10" cy="30" rx="2" ry="2.5"/>
            <ellipse cx="-2" cy="34" rx="3.5" ry="2.5" fill="#e8f0ff"/>
            <path d="M-2,38 C0,44 4,50 2,56 C0,60 -4,58 -2,52" strokeWidth="1.8"/>
            <path d="M34,72 C28,84 24,94 26,100"/>
            <path d="M52,76 C50,88 50,98 52,104"/>
            <path d="M80,72 C84,84 86,94 84,100"/>
            <path d="M100,66 C106,78 108,88 106,94"/>
            <path d="M112,40 C124,28 130,34 124,46 C118,56 108,52 112,42"/>
          </g>
          <g transform="translate(844,490) scale(1.0)" strokeWidth="2.0">
            <ellipse cx="64" cy="62" rx="58" ry="28" transform="rotate(-5,64,62)"/>
            <circle cx="16" cy="46" r="22"/>
            <path d="M2,36 C-6,42 -4,58 4,62 C10,64 16,58 12,50"/>
            <path d="M6,42 C10,38 16,38 20,42" strokeWidth="2.4"/>
            <ellipse cx="0" cy="50" rx="3.5" ry="2.5" fill="#e8f0ff"/>
            <path d="M-2,54 C2,58 8,58 12,54"/>
            <path d="M30,16 L42,16 L30,6 L42,6" strokeWidth="1.8"/>
            <path d="M46,10 L60,10 L46,-2 L60,-2" strokeWidth="2.0"/>
            <path d="M64,4 L82,4 L64,-10 L82,-10" strokeWidth="2.2"/>
            <ellipse cx="44" cy="86" rx="20" ry="9"/>
            <ellipse cx="82" cy="88" rx="20" ry="9"/>
            <ellipse cx="114" cy="84" rx="18" ry="8"/>
          </g>
          <g transform="translate(452,6) scale(0.8)" strokeWidth="1.9">
            <ellipse cx="58" cy="62" rx="46" ry="30"/>
            <circle cx="86" cy="36" r="22"/>
            <path d="M76,16 C74,6 80,2 86,6 C90,10 88,18 80,16"/>
            <path d="M90,14 C94,4 100,0 104,6 C106,12 100,18 94,16"/>
            <ellipse cx="96" cy="33" rx="4" ry="5" fill="#e8f0ff"/>
            <ellipse cx="98" cy="35" rx="2" ry="2.5"/>
            <ellipse cx="106" cy="38" rx="2.5" ry="1.8" fill="#e8f0ff"/>
            <path d="M108,40 C116,38 124,40" strokeWidth="1.4"/>
            <path d="M108,44 C116,44 124,46" strokeWidth="1.4"/>
            <path d="M12,62 C2,54 0,42 6,34 C10,26 18,30 16,40"/>
            <path d="M40,88 C36,96 36,102 40,102 C44,102 46,96 44,90"/>
            <path d="M68,90 C66,98 66,104 70,104 C74,104 76,98 74,92"/>
          </g>
          <g transform="translate(155,816) scale(0.75)" strokeWidth="1.8">
            <ellipse cx="62" cy="52" rx="50" ry="24"/>
            <circle cx="94" cy="30" r="20"/>
            <path d="M80,18 C78,8 84,4 90,8 C94,12 90,20 84,18"/>
            <path d="M98,16 C102,6 108,4 110,10 C112,16 106,20 100,18"/>
            <ellipse cx="104" cy="28" rx="3.5" ry="4" fill="#e8f0ff"/>
            <ellipse cx="110" cy="32" rx="3" ry="2" fill="#e8f0ff"/>
            <path d="M110,36 C116,34 124,36" strokeWidth="1.4"/>
            <path d="M110,40 C116,40 124,42" strokeWidth="1.4"/>
            <path d="M14,52 C4,44 2,32 8,24 C12,18 20,22 18,32"/>
            <path d="M42,72 C38,82 36,90 38,94"/>
            <path d="M62,74 C60,84 60,92 62,96"/>
            <path d="M86,72 C88,82 90,90 88,94"/>
          </g>
          <g transform="translate(668,816) scale(0.75)" strokeWidth="1.8">
            <ellipse cx="52" cy="52" rx="46" ry="24"/>
            <circle cx="18" cy="30" r="20"/>
            <path d="M8,16 C4,6 10,2 16,6 C20,10 18,18 12,16"/>
            <path d="M20,14 C22,4 28,2 32,8 C34,14 28,18 22,16"/>
            <ellipse cx="8" cy="28" rx="3.5" ry="4" fill="#e8f0ff"/>
            <ellipse cx="4" cy="32" rx="3" ry="2" fill="#e8f0ff"/>
            <path d="M2,34 C-8,32 -16,34" strokeWidth="1.4"/>
            <path d="M2,38 C-8,38 -16,40" strokeWidth="1.4"/>
            <path d="M96,52 C106,44 110,32 104,24 C98,18 90,22 92,32"/>
          </g>
        </g>
      </svg>

      <div style={{position:"relative",zIndex:1}}>
      <div style={{textAlign:"center",marginBottom:"12px"}}>
        <h1 style={{fontSize:"clamp(18px,5vw,26px)",fontWeight:"900",color:"#fff",margin:"0 0 4px",letterSpacing:"1px",
          textShadow:"0 0 22px #ff44aa,0 0 44px #ff44aa66"}}>🎉 Tomofun春酒計分系統</h1>
        <div style={{fontSize:"11px",color:syncColor[syncStatus],fontWeight:"700"}}>{syncLabel[syncStatus]}</div>
      </div>

      <div style={{display:"flex",gap:"5px",maxWidth:"600px",margin:"0 auto 12px",
        background:"rgba(8,8,8,0.9)",borderRadius:"12px",padding:"4px",border:"1px solid #222"}}>
        {TABS.map((t,i)=><button key={i} onClick={()=>setTab(i)} style={tabStyle(i)}>{t}</button>)}
      </div>

      <div style={{maxWidth:"900px",margin:"0 auto"}}>

        {/* Game 1 */}
        {tab===0&&(
          <div>
            {gameHeader("🎯","遊戲一：尋愛的限時突擊","喵喵隊（第0~4組）回合一 ｜ 汪汪隊（第5~10組）回合二")}
            {/* FIX 4: use teamPanelWrap for responsive layout */}
            <div style={teamPanelWrap}>
              <TeamPanel title="喵喵隊" emoji="🐱" subtitle="第0~4組" color={MIAO_COLOR} glow={MIAO_GLOW} totalScore={miaoT1}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead><tr style={{borderBottom:`1px solid ${MIAO_COLOR}33`}}>
                    {["排名","組別","答對題數","積分"].map((h,i)=><th key={i} style={{padding:"4px 2px",color:MIAO_COLOR+"aa",fontWeight:"700",textAlign:"center",fontSize:"10px"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{miao.map((g,i)=>{const sc=g1Scores[g.id];return(
                    <tr key={g.id} style={rowDiv(MIAO_COLOR)}>
                      <RankVal sc={sc} color={MIAO_COLOR} glow={MIAO_GLOW}/>
                      <td style={{...tdC,color:"#88dddd",fontWeight:"700"}}>{g.name}</td>
                      <td style={tdC}><PlusMinusInput value={g1[i].r1} min={0} max={10} step={1} color={MIAO_COLOR} glow={MIAO_GLOW} placeholder="0~10" onChange={(v)=>upG1(g1.map((x,j)=>j===i?{...x,r1:v}:x))}/></td>
                      <ScoreVal sc={sc} color={MIAO_COLOR} glow={MIAO_GLOW}/>
                    </tr>);})}</tbody>
                </table>
              </TeamPanel>
              <TeamPanel title="汪汪隊" emoji="🐶" subtitle="第5~10組" color={WANG_COLOR} glow={WANG_GLOW} totalScore={wangT1}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead><tr style={{borderBottom:`1px solid ${WANG_COLOR}33`}}>
                    {["排名","組別","答對題數","積分"].map((h,i)=><th key={i} style={{padding:"4px 2px",color:WANG_COLOR+"aa",fontWeight:"700",textAlign:"center",fontSize:"10px"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{wang.map((g)=>{const sc=g1Scores[g.id];return(
                    <tr key={g.id} style={rowDiv(WANG_COLOR)}>
                      <RankVal sc={sc} color={WANG_COLOR} glow={WANG_GLOW}/>
                      <td style={{...tdC,color:"#f0aa88",fontWeight:"700"}}>{g.name}</td>
                      <td style={tdC}><PlusMinusInput value={g1[g.id].r1} min={0} max={10} step={1} color={WANG_COLOR} glow={WANG_GLOW} placeholder="0~10" onChange={(v)=>upG1(g1.map((x,j)=>j===g.id?{...x,r1:v}:x))}/></td>
                      <ScoreVal sc={sc} color={WANG_COLOR} glow={WANG_GLOW}/>
                    </tr>);})}</tbody>
                </table>
              </TeamPanel>
            </div>
            <DlBtn label="下載遊戲一結果圖片 (1920×1080)" onClick={()=>downloadDataUrl(exportCanvas(g1,g1Scores,g2,g2Scores,g3,g3Scores,"g1",finalTotals,winnerTeam,miaoAvg,wangAvg),"Tomofun春酒_遊戲一結果.png")}/>
          </div>
        )}

        {/* Game 2 */}
        {tab===1&&(
          <div>
            {gameHeader("⏱️","遊戲二：第六感爆走","A目標8秒 ｜ B目標10秒 ｜ 誤差越小積分越高")}
            <div style={teamPanelWrap}>
              <TeamPanel title="喵喵隊" emoji="🐱" subtitle="第0~4組" color={MIAO_COLOR} glow={MIAO_GLOW} totalScore={miaoT2}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead><tr style={{borderBottom:`1px solid ${MIAO_COLOR}33`}}>
                    {["排名","組別","A秒","B秒","總誤差","積分"].map((h,i)=><th key={i} style={{padding:"4px 2px",color:MIAO_COLOR+"aa",fontWeight:"700",textAlign:"center",fontSize:"10px"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{miao.map((g)=>{
                    const sc=g2Scores[g.id];const d=g2[g.id];
                    const a=parseFloat(d?.a),b=parseFloat(d?.b);
                    const aErr=!isNaN(a)?Math.abs(a-8):null;
                    const bErr=!isNaN(b)?Math.abs(b-10):null;
                    const totalErr=(aErr!==null&&bErr!==null)?(aErr+bErr).toFixed(3):aErr!==null?aErr.toFixed(3):bErr!==null?bErr.toFixed(3):"-";
                    return(
                    <tr key={g.id} style={rowDiv(MIAO_COLOR)}>
                      <RankVal sc={sc} color={MIAO_COLOR} glow={MIAO_GLOW}/>
                      <td style={{...tdC,color:"#88dddd",fontWeight:"700"}}>{g.name}</td>
                      <td style={tdC}><PlusMinusInput value={d?.a??""} min={0} max={30} step={0.01} color={MIAO_COLOR} glow={MIAO_GLOW} placeholder="秒" onChange={(v)=>upG2(g2.map((x,j)=>j===g.id?{...x,a:v}:x))}/></td>
                      <td style={tdC}><PlusMinusInput value={d?.b??""} min={0} max={30} step={0.01} color={MIAO_COLOR} glow={MIAO_GLOW} placeholder="秒" onChange={(v)=>upG2(g2.map((x,j)=>j===g.id?{...x,b:v}:x))}/></td>
                      <td style={{...tdC,color:totalErr!=="-"?MIAO_COLOR+"dd":"#444",fontWeight:"700",fontSize:"12px",textShadow:totalErr!=="-"?`0 0 6px ${MIAO_GLOW}44`:"none"}}>{totalErr}{totalErr!=="-"&&<span style={{fontSize:"9px",color:MIAO_COLOR+"88",marginLeft:"1px"}}>秒</span>}</td>
                      <ScoreVal sc={sc} color={MIAO_COLOR} glow={MIAO_GLOW}/>
                    </tr>);})}</tbody>
                </table>
              </TeamPanel>
              <TeamPanel title="汪汪隊" emoji="🐶" subtitle="第5~10組" color={WANG_COLOR} glow={WANG_GLOW} totalScore={wangT2}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead><tr style={{borderBottom:`1px solid ${WANG_COLOR}33`}}>
                    {["排名","組別","A秒","B秒","總誤差","積分"].map((h,i)=><th key={i} style={{padding:"4px 2px",color:WANG_COLOR+"aa",fontWeight:"700",textAlign:"center",fontSize:"10px"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{wang.map((g)=>{
                    const sc=g2Scores[g.id];const d=g2[g.id];
                    const a=parseFloat(d?.a),b=parseFloat(d?.b);
                    const aErr=!isNaN(a)?Math.abs(a-8):null;
                    const bErr=!isNaN(b)?Math.abs(b-10):null;
                    const totalErr=(aErr!==null&&bErr!==null)?(aErr+bErr).toFixed(3):aErr!==null?aErr.toFixed(3):bErr!==null?bErr.toFixed(3):"-";
                    return(
                    <tr key={g.id} style={rowDiv(WANG_COLOR)}>
                      <RankVal sc={sc} color={WANG_COLOR} glow={WANG_GLOW}/>
                      <td style={{...tdC,color:"#f0aa88",fontWeight:"700"}}>{g.name}</td>
                      <td style={tdC}><PlusMinusInput value={d?.a??""} min={0} max={30} step={0.01} color={WANG_COLOR} glow={WANG_GLOW} placeholder="秒" onChange={(v)=>upG2(g2.map((x,j)=>j===g.id?{...x,a:v}:x))}/></td>
                      <td style={tdC}><PlusMinusInput value={d?.b??""} min={0} max={30} step={0.01} color={WANG_COLOR} glow={WANG_GLOW} placeholder="秒" onChange={(v)=>upG2(g2.map((x,j)=>j===g.id?{...x,b:v}:x))}/></td>
                      <td style={{...tdC,color:totalErr!=="-"?WANG_COLOR+"dd":"#444",fontWeight:"700",fontSize:"12px",textShadow:totalErr!=="-"?`0 0 6px ${WANG_GLOW}44`:"none"}}>{totalErr}{totalErr!=="-"&&<span style={{fontSize:"9px",color:WANG_COLOR+"88",marginLeft:"1px"}}>秒</span>}</td>
                      <ScoreVal sc={sc} color={WANG_COLOR} glow={WANG_GLOW}/>
                    </tr>);})}</tbody>
                </table>
              </TeamPanel>
            </div>
            <DlBtn label="下載遊戲二結果圖片 (1920×1080)" onClick={()=>downloadDataUrl(exportCanvas(g1,g1Scores,g2,g2Scores,g3,g3Scores,"g2",finalTotals,winnerTeam,miaoAvg,wangAvg),"Tomofun春酒_遊戲二結果.png")}/>
          </div>
        )}

        {/* Game 3 */}
        {tab===2&&(
          <div>
            {gameHeader("📱","遊戲三：不良高校入學考","輸入 Kahoot 排名（1~11），積分自動 ×1.3")}
            <div style={teamPanelWrap}>
              <TeamPanel title="喵喵隊" emoji="🐱" subtitle="第0~4組" color={MIAO_COLOR} glow={MIAO_GLOW} totalScore={miaoT3}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead><tr style={{borderBottom:`1px solid ${MIAO_COLOR}33`}}>
                    {["排名","組別","Kahoot排名","原始分","×1.3"].map((h,i)=><th key={i} style={{padding:"4px 2px",color:MIAO_COLOR+"aa",fontWeight:"700",textAlign:"center",fontSize:"10px"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{miao.map((g)=>{
                    const sc=g3Scores[g.id];const r=parseInt(g3[g.id]?.rank);
                    const base=!isNaN(r)&&r>=1&&r<=11?RANK_SCORES[r-1]:null;
                    return(
                    <tr key={g.id} style={rowDiv(MIAO_COLOR)}>
                      <RankVal sc={sc} r={r} color={MIAO_COLOR} glow={MIAO_GLOW} isKahoot/>
                      <td style={{...tdC,color:"#88dddd",fontWeight:"700"}}>{g.name}</td>
                      <td style={tdC}><PlusMinusInput value={g3[g.id]?.rank??""} min={1} max={11} step={1} color={MIAO_COLOR} glow={MIAO_GLOW} placeholder="1~11" onChange={(v)=>upG3(g3.map((x,j)=>j===g.id?{...x,rank:v}:x))}/></td>
                      <td style={{...tdC,color:base!==null?MIAO_COLOR+"99":"#444",fontWeight:"600",fontSize:"13px"}}>{base??"-"}</td>
                      <ScoreVal sc={sc} color={MIAO_COLOR} glow={MIAO_GLOW}/>
                    </tr>);})}</tbody>
                </table>
              </TeamPanel>
              <TeamPanel title="汪汪隊" emoji="🐶" subtitle="第5~10組" color={WANG_COLOR} glow={WANG_GLOW} totalScore={wangT3}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
                  <thead><tr style={{borderBottom:`1px solid ${WANG_COLOR}33`}}>
                    {["排名","組別","Kahoot排名","原始分","×1.3"].map((h,i)=><th key={i} style={{padding:"4px 2px",color:WANG_COLOR+"aa",fontWeight:"700",textAlign:"center",fontSize:"10px"}}>{h}</th>)}
                  </tr></thead>
                  <tbody>{wang.map((g)=>{
                    const sc=g3Scores[g.id];const r=parseInt(g3[g.id]?.rank);
                    const base=!isNaN(r)&&r>=1&&r<=11?RANK_SCORES[r-1]:null;
                    return(
                    <tr key={g.id} style={rowDiv(WANG_COLOR)}>
                      <RankVal sc={sc} r={r} color={WANG_COLOR} glow={WANG_GLOW} isKahoot/>
                      <td style={{...tdC,color:"#f0aa88",fontWeight:"700"}}>{g.name}</td>
                      <td style={tdC}><PlusMinusInput value={g3[g.id]?.rank??""} min={1} max={11} step={1} color={WANG_COLOR} glow={WANG_GLOW} placeholder="1~11" onChange={(v)=>upG3(g3.map((x,j)=>j===g.id?{...x,rank:v}:x))}/></td>
                      <td style={{...tdC,color:base!==null?WANG_COLOR+"99":"#444",fontWeight:"600",fontSize:"13px"}}>{base??"-"}</td>
                      <ScoreVal sc={sc} color={WANG_COLOR} glow={WANG_GLOW}/>
                    </tr>);})}</tbody>
                </table>
              </TeamPanel>
            </div>
            <DlBtn label="下載遊戲三結果圖片 (1920×1080)" onClick={()=>downloadDataUrl(exportCanvas(g1,g1Scores,g2,g2Scores,g3,g3Scores,"g3",finalTotals,winnerTeam,miaoAvg,wangAvg),"Tomofun春酒_遊戲三結果.png")}/>
          </div>
        )}

        {/* Leaderboard */}
        {tab===3&&(
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              {[{name:"喵喵隊",emoji:"🐱",avg:miaoAvg,win:winnerTeam==="喵喵隊",color:MIAO_COLOR,glow:MIAO_GLOW},
                {name:"汪汪隊",emoji:"🐶",avg:wangAvg,win:winnerTeam==="汪汪隊",color:WANG_COLOR,glow:WANG_GLOW}].map(t=>(
                <div key={t.name} style={{borderRadius:"14px",padding:"16px",textAlign:"center",
                  background:t.win?(t.name==="喵喵隊"?"rgba(30,120,120,0.75)":"rgba(160,80,20,0.70)"):"rgba(10,10,10,0.88)",
                  border:`1.5px solid ${t.win?t.color:t.color+"44"}`,
                  boxShadow:t.win?`0 0 30px ${t.glow}55`:`0 0 10px ${t.glow}22`}}>
                  <div style={{fontSize:"38px"}}>{t.emoji}</div>
                  <div style={{fontWeight:"900",color:t.win?"#ffffff":t.color,fontSize:"24px",textShadow:`0 0 10px ${t.glow}`,marginTop:"4px"}}>{t.name}</div>
                  <div style={{fontSize:"13px",color:t.win?"#ffffffaa":"#555",marginTop:"4px"}}>平均分</div>
                  <div style={{fontSize:"42px",fontWeight:"900",color:t.win?"#ffffff":t.color,textShadow:`0 0 14px ${t.glow}`,marginTop:"2px"}}>
                    {(miaoAvg||wangAvg)?t.avg.toFixed(1):"-"}</div>
                  {t.win&&<div style={{color:"#ffffff",fontSize:"15px",fontWeight:"700",marginTop:"6px"}}>🏆 勝隊 +50分/組</div>}
                </div>
              ))}
            </div>
            <div style={{background:"rgba(10,10,10,0.90)",borderRadius:"14px",padding:"16px",border:"1px solid #222"}}>
              <h2 style={{fontSize:"18px",fontWeight:"900",color:"#ff4444",margin:"0 0 14px",textShadow:"0 0 10px #ff4444"}}>🏅 組別總排名</h2>
              {(()=>{
                const maxS1=Math.max(...finalTotals.map(t=>t.s1||0));
                const maxS2=Math.max(...finalTotals.map(t=>t.s2||0));
                const maxS3=Math.max(...finalTotals.map(t=>t.s3||0));
                const maxSum=Math.max(...finalTotals.map(t=>t.sum||0));
                return(
                <table style={{width:"100%",fontSize:"15px",borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid #3a3a3a"}}>
                    {["名次","組別","隊伍","G1","G2","G3","小計","加成","總分"].map((h,i)=>(
                      <th key={i} style={{padding:"8px 4px",color:"#ffffff",fontWeight:"700",textAlign:"center",fontSize:"14px"}}>{h}</th>
                    ))}</tr></thead>
                  <tbody>{finalTotals.map((t,rank)=>{
                    const g=GROUPS[t.id];
                    const color=g.team==="喵喵隊"?MIAO_COLOR:WANG_COLOR;
                    const glow=g.team==="喵喵隊"?MIAO_GLOW:WANG_GLOW;
                    const groupColor=g.team==="喵喵隊"?"#88dddd":"#f0aa88";
                    const isFirst=rank===0;
                    const medal=["🥇","🥈","🥉"][rank]??(rank+1)+"";
                    const s1c=(t.s1&&t.s1>0&&t.s1===maxS1)?"#FFD700":"#ffffff";
                    const s2c=(t.s2&&t.s2>0&&t.s2===maxS2)?"#FFD700":"#ffffff";
                    const s3c=(t.s3&&t.s3>0&&t.s3===maxS3)?"#FFD700":"#ffffff";
                    const sc=(t.sum&&t.sum>0&&t.sum===maxSum)?"#FFD700":"#ffffff";
                    return(<tr key={t.id} style={{borderBottom:"1px solid #1a1a1a",background:isFirst?"rgba(255,215,0,0.08)":"transparent"}}>
                      <td style={{...tdC,color:isFirst?"#FFD700":rank<3?"#ccc":"#777",fontWeight:"900",fontSize:isFirst?"22px":"15px",textShadow:isFirst?"0 0 10px #FFD70099":"none"}}>{medal}</td>
                      <td style={{...tdC,color:isFirst?"#FFD700":groupColor,fontWeight:"700",fontSize:isFirst?"18px":"15px"}}>{g.name}</td>
                      <td style={{...tdC,color:isFirst?"#FFD700":color,fontWeight:"700",fontSize:isFirst?"16px":"14px",textShadow:`0 0 6px ${glow}`}}>{g.team}</td>
                      <td style={{...tdC,color:t.s1?s1c:"#444",fontWeight:s1c==="#FFD700"?"800":"600",fontSize:"15px",textShadow:s1c==="#FFD700"?"0 0 8px #FFD70066":"none"}}>{t.s1||"-"}</td>
                      <td style={{...tdC,color:t.s2?s2c:"#444",fontWeight:s2c==="#FFD700"?"800":"600",fontSize:"15px",textShadow:s2c==="#FFD700"?"0 0 8px #FFD70066":"none"}}>{t.s2||"-"}</td>
                      <td style={{...tdC,color:t.s3?s3c:"#444",fontWeight:s3c==="#FFD700"?"800":"600",fontSize:"15px",textShadow:s3c==="#FFD700"?"0 0 8px #FFD70066":"none"}}>{t.s3||"-"}</td>
                      <td style={{...tdC,color:t.sum?sc:"#444",fontWeight:sc==="#FFD700"?"800":"700",fontSize:"15px",textShadow:sc==="#FFD700"?"0 0 8px #FFD70066":"none"}}>{t.sum}</td>
                      <td style={{...tdC,color:"#ffaa00",fontWeight:"700",fontSize:"15px"}}>{t.bonus?`+${t.bonus}`:"-"}</td>
                      <td style={{...tdC,color:isFirst?"#FFD700":color,fontWeight:"900",fontSize:isFirst?"22px":"18px",textShadow:`0 0 10px ${isFirst?"#FFD700":glow}`}}>{t.final}</td>
                    </tr>);})}</tbody>
                </table>);
              })()}
            </div>
            <DlBtn label="下載總排名結果圖片 (1920×1080)" onClick={()=>downloadDataUrl(exportCanvas(g1,g1Scores,g2,g2Scores,g3,g3Scores,"rank",finalTotals,winnerTeam,miaoAvg,wangAvg),"Tomofun春酒_總排名.png")}/>
            <button onClick={()=>setShowChampion(true)} style={{width:"100%",padding:"14px",
              background:"linear-gradient(135deg,#1a0505,#2a0808,#1a0505)",color:"#ff4444",fontWeight:"900",
              borderRadius:"14px",border:"1.5px solid #cc3333",cursor:"pointer",fontSize:"16px",letterSpacing:"1.5px",
              textShadow:"0 0 12px #ff4444",boxShadow:"0 0 24px rgba(200,50,50,0.50),inset 0 0 12px rgba(200,50,50,0.08)"}}>
              🏆 公佈最終冠軍！
            </button>
          </div>
        )}
      </div>

      {/* Champion Modal */}
      {showChampion&&(
        <div onClick={()=>setShowChampion(false)} style={{position:"fixed",inset:0,zIndex:50,
          display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(4,0,0,0.90)"}}>
          <canvas ref={confettiRef} style={{position:"absolute",inset:0,pointerEvents:"none"}}/>
          <div onClick={e=>e.stopPropagation()} style={{position:"relative",
            background:"linear-gradient(135deg,#0d0505,#160808)",borderRadius:"22px",padding:"32px",
            textAlign:"center",border:"1.5px solid #cc3333",
            boxShadow:"0 0 60px rgba(200,50,50,0.50),0 0 120px rgba(200,50,50,0.20)",
            margin:"16px",maxWidth:"320px",width:"100%"}}>
            <div style={{fontSize:"52px",marginBottom:"8px"}}>🏆</div>
            <div style={{color:"#cc3333",fontSize:"12px",marginBottom:"4px",fontWeight:"700",letterSpacing:"2px"}}>總冠軍</div>
            <div style={{fontSize:"32px",fontWeight:"900",color:"#ff4444",marginBottom:"4px",textShadow:"0 0 20px #ff4444"}}>
              {finalTotals[0]?GROUPS[finalTotals[0].id].name:"?"}</div>
            {finalTotals[0]&&(()=>{const g=GROUPS[finalTotals[0].id];const c=g.team==="喵喵隊"?MIAO_COLOR:WANG_COLOR;const gw=g.team==="喵喵隊"?MIAO_GLOW:WANG_GLOW;
              return<div style={{fontSize:"16px",fontWeight:"900",color:c,textShadow:`0 0 12px ${gw}`,marginBottom:"8px"}}>{g.team}</div>;})()}
            <div style={{fontSize:"44px",fontWeight:"900",color:"#ffdd44",marginBottom:"16px",textShadow:"0 0 20px #ffaa00"}}>
              {finalTotals[0]?.final??0} 分</div>
            {winnerTeam&&(
              <div style={{fontSize:"13px",fontWeight:"700",marginBottom:"16px",padding:"5px 16px",borderRadius:"999px",display:"inline-block",
                color:winnerTeam==="喵喵隊"?MIAO_COLOR:WANG_COLOR,
                border:`1px solid ${winnerTeam==="喵喵隊"?MIAO_COLOR:WANG_COLOR}55`,
                background:winnerTeam==="喵喵隊"?MIAO_COLOR+"18":WANG_COLOR+"18",
                textShadow:`0 0 8px ${winnerTeam==="喵喵隊"?MIAO_GLOW:WANG_GLOW}`}}>
                {winnerTeam} 勝利！🎊</div>
            )}
            <button onClick={()=>setShowChampion(false)} style={{display:"block",width:"100%",padding:"10px",
              background:"rgba(200,50,50,0.10)",color:"#cc3333",borderRadius:"10px",
              border:"1px solid #cc333444",cursor:"pointer",fontWeight:"700",fontSize:"13px"}}>關閉</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}