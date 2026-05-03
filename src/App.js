import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import RentalsModule from "./rentals";
import SettlementModule from "./settlement";
import TodayModule from "./today";
import ShiftModule from "./shift";
import ReservationModule, { CustomerReservationForm } from "./reservation";
import SeatLayoutModule from "./seatLayout";

const DAYS = ["日","月","火","水","木","金","土"];
const MONTH_NAMES = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

// 貸切判定 + お客様名抽出（モジュール間で共有）
export const isRentalEvent = (name) => /貸切|貸し切り/.test(name||"");
export const extractCustomerName = (name) => {
  if (!name) return "";
  let n = name;
  n = n.replace(/[\[（(](昼|夜|深夜|朝|午前|午後)[\]）)]/g, "");
  n = n.replace(/^[\s　]*(昼|夜|深夜|朝|午前|午後)[\s　]+/, "");
  n = n.replace(/貸し切り|貸切/g, "");
  n = n.replace(/様/g, "");
  n = n.replace(/[\s　]+/g, " ").trim();
  return n;
};
export const extractTimeLabel = (name) => {
  const m = (name||"").match(/[\[（(](昼|夜|深夜|朝|午前|午後)[\]）)]|^(昼|夜|深夜|朝|午前|午後)\s/);
  return m ? (m[1] || m[2]) : "";
};
const emptyForm = { name:"",date:"",day:"",open:"",start:"",price:"",cap:"",perf:"",desc:"",url:"",notes:"",genre:"",rehearsal:"",poster:"",timetable:"",reference:"",seatable:true,reserveNotes:"",noBooking:false,photoOk:"unset",smokeOk:"unset",images:[],galleryNote:"",remark:"" };

// 行単位ではなく1文字ずつ読んでパースする（セル内改行に対応）
function parseCSVText(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], nx = text[i+1];
    if (inQ) {
      if (c === '"' && nx === '"') { cur += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cur += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { row.push(cur); cur = ""; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ""; }
      else { cur += c; }
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// 時間帯ラベル（昼/夜/深夜）と開演/開場時間を抽出
function extractTimePeriod(eventName, descText) {
  // ラベル検出
  const labelMatch = eventName.match(/[（(](昼|夜|深夜|朝|午前|午後)[）)]/);
  const label = labelMatch ? labelMatch[1] : "";
  const cleanName = eventName.replace(/[（(](昼|夜|深夜|朝|午前|午後)[）)]\s*/, "").trim();

  // descTextから時間情報を抽出（例：「昼 開場12:30 開演13:00」）
  let open = "", start = "", price = "";
  if (label && descText) {
    // ラベル付近の時間を探す
    const lines = descText.split(/\r?\n/);
    for (const line of lines) {
      if (line.includes(label) || line.includes(`(${label})`) || line.includes(`（${label}）`)) {
        const openMatch = line.match(/開場\s*(\d{1,2}[:：]\d{2})/);
        const startMatch = line.match(/開演\s*(\d{1,2}[:：]\d{2})/);
        const priceMatch = line.match(/[¥￥]\s?(\d[\d,]*)/) || line.match(/(\d[\d,]{3,})\s*円/);
        const timeRangeMatch = line.match(/(\d{1,2}[:：]\d{2})\s*[／\/～\-~]\s*(\d{1,2}[:：]\d{2})/);
        const singleTimeMatch = !openMatch && !startMatch && !timeRangeMatch ? line.match(/(\d{1,2}[:：]\d{2})/) : null;
        if (openMatch) open = openMatch[1].replace("：",":");
        if (startMatch) start = startMatch[1].replace("：",":");
        if (timeRangeMatch && !open) { open = timeRangeMatch[1].replace("：",":"); start = timeRangeMatch[2].replace("：",":"); }
        if (singleTimeMatch && !start) start = singleTimeMatch[1].replace("：",":");
        if (priceMatch) price = "¥" + priceMatch[1];
        break;
      }
    }
  }

  return { label, cleanName, open, start, price };
}

function parseCSV(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const rows = parseCSVText(clean);
  const results = [];
  const now = new Date();
  const cy = now.getFullYear();
  const toHHMM = s => { const m = s.match(/(\d{1,2})[:：](\d{2})/); return m ? `${m[1].padStart(2,"0")}:${m[2]}` : ""; };

  // ヘッダースキップ判定
  const startIdx = rows[0] && /^\d{1,2}\/\d{1,2}/.test((rows[0][0]||"").trim()) ? 0 : 1;

  for (let i = startIdx; i < rows.length; i++) {
    const cols = rows[i];
    if (!cols || !cols.length) continue;
    const rawDate = (cols[0] || "").trim();
    const rawName = (cols[2] || "").trim();
    if (!rawName || rawName === "イベント名" || rawName === "店休日") continue;

    // 日付変換
    let isoDate = "";
    const mS = rawDate.match(/^(\d{1,2})\/(\d{1,2})$/);
    const mF = rawDate.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (mF) isoDate = `${mF[1]}-${mF[2].padStart(2,"0")}-${mF[3].padStart(2,"0")}`;
    else if (mS) {
      const mo = parseInt(mS[1]), dy = parseInt(mS[2]);
      let yr = cy;
      if (mo < now.getMonth() - 2) yr = cy + 1;
      isoDate = `${yr}-${String(mo).padStart(2,"0")}-${String(dy).padStart(2,"0")}`;
    }
    // 曜日
    let day = "";
    if (cols[1]) { const d = cols[1].replace(/曜日?/, "").trim(); if (d.length === 1) day = d + "曜日"; }
    if (!day && isoDate) { const dt = new Date(isoDate + "T00:00:00"); day = DAYS[dt.getDay()] + "曜日"; }

    // 開場/開演（デフォルト・夜のイベント用）
    const timeCol = (cols[4] || "").trim();
    const tp = timeCol.split(/[\/／]/).map(s => s.trim());
    const defaultOpen = toHHMM(tp[0] || "");
    const defaultStart = toHHMM(tp[1] || tp[0] || "");
    const defaultPrice = (cols[5] || "").trim();
    const descText = (cols[3] || "").trim();
    const rehearsal = (cols[6] || "").trim();
    const poster = (cols[7] || "").trim();
    const notes = (cols[8] || "").trim();
    const galleryNote = (cols[9] || "").trim();
    const remark = (cols[10] || "").trim();

    // イベント名がセル内改行で複数あるか判定
    const nameLines = rawName.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    if (nameLines.length <= 1) {
      // 単一イベント
      results.push({
        date: isoDate, day, name: rawName, perf: descText,
        open: defaultOpen, start: defaultStart, price: defaultPrice,
        rehearsal, poster, timetable: "", desc: "", url: "",
        notes, galleryNote, remark, genre: "", cap: "", reference: "",
        savedAt: new Date().toLocaleDateString("ja-JP"),
      });
    } else {
      // 複数イベント（昼/夜/深夜）
      nameLines.forEach((line, idx) => {
        const { label, cleanName, open, start, price } = extractTimePeriod(line, descText);
        // 各イベントの内容欄から該当する行を抽出
        let eventDesc = "";
        if (label && descText) {
          const descLines = descText.split(/\r?\n/);
          const matchedLine = descLines.find(l =>
            l.includes(`(${label})`) || l.includes(`（${label}）`) || l.includes(label + ")")
          );
          if (matchedLine) eventDesc = matchedLine.replace(/[（(](昼|夜|深夜|朝|午前|午後)[）)]\s*/, "").trim();
        }
        results.push({
          date: isoDate, day,
          name: label ? `[${label}] ${cleanName}` : line,
          perf: eventDesc || (idx === nameLines.length - 1 ? descText : ""),
          open: open || (idx === nameLines.length - 1 ? defaultOpen : ""),
          start: start || (idx === nameLines.length - 1 ? defaultStart : ""),
          price: price || (idx === nameLines.length - 1 ? defaultPrice : ""),
          rehearsal, poster, timetable: "", desc: "", url: "",
          notes, galleryNote, remark, genre: "", cap: "", reference: "",
          savedAt: new Date().toLocaleDateString("ja-JP"),
        });
      });
    }
  }
  return results;
}

function fmtDate(d){if(!d)return"";const dt=new Date(d+"T00:00:00");return`${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日`;}
function fmtTime(t){return t?t.substring(0,5):"";}

function generateTexts(d){
  const date=fmtDate(d.date)||"日程未定",open=fmtTime(d.open),start=fmtTime(d.start);
  const timeStr=[open&&"開場 "+open,start&&"開演 "+start].filter(Boolean).join(" / ");
  const name=d.name||"イベント",genre=d.genre||"ライブ";
  const hp=[`■ ${name}`,"",`${date}（${d.day}）`,timeStr,`料金：${d.price||"未定"}`,d.cap?`定員：${d.cap}名`:"","",d.perf?`【出演】\n${d.perf}`:"",d.desc?`\n【内容】\n${d.desc}`:"",d.url?`\n▶ ご予約はこちら\n${d.url}`:"",d.notes?`\n【注意事項】\n${d.notes}`:""].filter(s=>s!=="").join("\n").trim();
  const ig=[`🎵 ${name} 🎵`,"",`📅 ${date}（${d.day}）`,open?`🚪 開場 ${open}`:"",start?`🎤 開演 ${start}`:"",`💴 ${d.price||"未定"}`,d.cap?`👥 定員：${d.cap}名`:"","",d.perf?`✨ 出演：${d.perf}`:"",d.desc?"\n"+d.desc:"",d.url?"\n🔗 ご予約・詳細はプロフのリンクから！":"","\n#honeybee #ライブ #音楽イベント #大船 #"+name.replace(/\s/g,"")].filter(s=>s!=="").join("\n").trim();
  const fb=[`【イベントのお知らせ】${name}`,"","こんにちは、HONEY BEEです。\n素晴らしい夜をお届けするイベントのご案内です。","","━━━━━━━━━━━━━━",`📅 日程：${date}（${d.day}）`,timeStr?`🕐 ${timeStr}`:"",`💴 料金：${d.price||"未定"}`,d.cap?`👥 定員：${d.cap}名（先着順）`:"","━━━━━━━━━━━━━━","",d.perf?`【出演者】\n${d.perf}\n`:"",d.desc?d.desc+"\n":"","ぜひお誘い合わせの上、ご来場ください。\n皆さまのお越しをお待ちしております。",d.url?`\n▶ ご予約はこちら\n${d.url}`:"",d.notes?"\n※ "+d.notes.split("\n").join("\n※ "):""].filter(s=>s!=="").join("\n").trim();
  const gf=[`このフォームは「${name}」のご予約専用フォームです。`,"","【イベント詳細】",`日程：${date}（${d.day}）`,timeStr,`料金：${d.price||"未定"}`,d.cap?`定員：${d.cap}名（先着順・定員になり次第締め切り）`:"",d.perf?`出演：${d.perf}`:"","",d.desc||"","","ご予約の確認メールは自動送信されます。",d.notes?`\n【ご注意】\n${d.notes}`:"","\nフォームの送信をもってご予約完了となります。\nご不明な点はHONEY BEEまでお問い合わせください。"].filter(s=>s!=="").join("\n").trim();
  const cp=[`✦ ${name} ✦`,`${date}（${d.day}）— HONEY BEE`,`${d.price||""}${d.url?" | 予約受付中":""}`, "",d.desc?d.desc.slice(0,60)+(d.desc.length>60?"...":""):"",d.url?"\n"+d.url:""].filter(s=>s!=="").join("\n").trim();
  const wixDetail=[name,"","■ 日程",`${date}（${d.day}）`,"","■ OPEN / START",timeStr||"未定","","■ 料金",d.price||"未定","",d.perf?`■ 出演者\n${d.perf}\n`:"",d.desc?`■ イベント説明\n${d.desc}\n`:"","■ ご予約",d.url?`下記URLよりご予約ください。\n${d.url}`:"お電話またはSNSのDMよりお問い合わせください。","",d.notes?`■ 注意事項\n${d.notes}\n`:"","─────────────────────","INFO：HONEY BEE　0467-46-5576"].filter(s=>s!=="").join("\n").trim();
  const wixSchedule=[`【${date}（${d.day}）】`,name,timeStr,`料金：${d.price||"未定"}`,d.perf?`出演：${d.perf}`:"",d.url?`予約：${d.url}`:""].filter(s=>s!=="").join("\n").trim();
  const shortDesc=d.desc?d.desc.slice(0,80)+(d.desc.length>80?"…":""):"";
  const wixPickup=["▶ NEXT EVENT",`「${name}」`,`${date}（${d.day}）${timeStr?"　"+timeStr:""}`,shortDesc,d.url?`予約受付中 → ${d.url}`:""].filter(s=>s!=="").join("\n").trim();
  const seoTitle=`${name}｜大船HONEY BEE`;
  const seoDesc=[`大船のライブハウスHONEY BEEで開催される${genre}イベント「${name}」。`,`${date}（${d.day}）`,timeStr?timeStr+"。":"",d.perf?`出演：${d.perf}。`:"",d.price?`料金：${d.price}。`:"","大船駅近く、こだわりの音楽空間でライブをお楽しみください。"].filter(s=>s!=="").join("").slice(0,160);
  const altText=`大船HONEY BEEで開催される${d.perf?d.perf+"の":""}${genre}ライブイベント「${name}」${date}`;
  const reserveBtn=d.url?`「${name}」を予約する`:`「${name}」のご予約はお電話で`;
  const flyer=[
    "【フライヤー用テキスト素材】",
    "━━━━━━━━━━━━━━━━━━━━",
    `イベント名：${name}`,
    `日程：${date}（${d.day}）`,
    timeStr?`時間：${timeStr}`:"",
    `料金：${d.price||"未定"}`,
    d.perf?`出演：${d.perf}`:"",
    d.cap?`定員：${d.cap}名`:"",
    "━━━━━━━━━━━━━━━━━━━━",
    "会場：大船 HONEY BEE",
    "住所：神奈川県鎌倉市大船",
    "TEL：0467-46-5576",
    d.url?`予約：${d.url}`:"予約：お電話またはDMにて",
    "━━━━━━━━━━━━━━━━━━━━",
    d.desc?`【概要】\n${d.desc}`:"",
    d.notes?`【注意事項】\n${d.notes}`:"",
  ].filter(s=>s!=="").join("\n").trim();
  return{hp,ig,fb,gf,cp,wixDetail,wixSchedule,wixPickup,seoTitle,seoDesc,altText,reserveBtn,flyer};
}

const OUTPUT_TABS=[{key:"hp",label:"HP用"},{key:"ig",label:"Instagram"},{key:"fb",label:"Facebook"},{key:"gf",label:"フォーム"},{key:"cp",label:"告知コピー"},{key:"wix",label:"🌐 Wix"},{key:"flyer",label:"🎨 フライヤー"},{key:"tt",label:"⏱ TT"}];
const WIX_SECTIONS=[{key:"wixDetail",label:"イベント詳細ページ本文"},{key:"wixSchedule",label:"月間スケジュール用"},{key:"wixPickup",label:"トップページ ピックアップ"},{key:"seoTitle",label:"SEOタイトル",note:v=>`${v.length}文字（推奨：60文字以内）`},{key:"seoDesc",label:"SEOディスクリプション",note:v=>`${v.length}文字（推奨：160文字以内）`},{key:"altText",label:"画像 alt テキスト"},{key:"reserveBtn",label:"予約ボタン文言"}];

const S={
  app:{background:"#0a0a0a",color:"#f0e8d0",minHeight:"100vh",fontFamily:"'DM Sans',sans-serif"},
  hdr:{background:"linear-gradient(180deg,#1a1400 0%,#0a0a0a 100%)",borderBottom:"1px solid rgba(201,168,76,0.27)",padding:"1.25rem 2rem",display:"flex",alignItems:"center",justifyContent:"space-between"},
  logo:{fontFamily:"Georgia,serif",fontSize:"1.5rem",fontWeight:700,color:"#c9a84c",letterSpacing:".15em"},
  logoSm:{color:"#f0e8d0",fontSize:".55em",letterSpacing:".3em",display:"block",fontWeight:300},
  secTitle:{fontFamily:"Georgia,serif",fontSize:".7rem",letterSpacing:".25em",textTransform:"uppercase",color:"#c9a84c",borderBottom:"1px solid rgba(201,168,76,0.2)",paddingBottom:".5rem",marginBottom:".75rem"},
  btn:(v)=>{const b={padding:".55rem 1.1rem",borderRadius:4,fontFamily:"inherit",fontSize:".72rem",fontWeight:500,letterSpacing:".12em",textTransform:"uppercase",cursor:"pointer",transition:"all .15s",border:"none"};if(v==="gold")return{...b,background:"#c9a84c",color:"#0a0a0a"};if(v==="ghost")return{...b,background:"transparent",color:"#c9a84c",border:"1px solid rgba(201,168,76,0.27)"};if(v==="danger")return{...b,background:"transparent",color:"#e24b4a",border:"1px solid rgba(226,75,74,0.27)"};if(v==="sm")return{...b,padding:".35rem .7rem",fontSize:".65rem",background:"transparent",color:"#c9a84c",border:"1px solid rgba(201,168,76,0.27)"};if(v==="ai")return{...b,background:"linear-gradient(135deg,#7c4dff,#c9a84c)",color:"#fff",padding:".4rem .9rem",fontSize:".65rem",letterSpacing:".08em"};return b;},
  navTab:(a)=>({padding:".4rem 1rem",borderRadius:3,border:"1px solid "+(a?"#c9a84c":"rgba(201,168,76,0.2)"),background:a?"#c9a84c":"transparent",color:a?"#0a0a0a":"rgba(201,168,76,0.55)",fontSize:".7rem",letterSpacing:".12em",textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit"}),
  card:(tpl)=>({background:"#111",border:"1px solid rgba(201,168,76,0.1)",borderLeft:tpl?"2px solid #c9a84c":undefined,borderRadius:6,padding:"1rem 1.25rem",marginBottom:".75rem",display:"grid",gridTemplateColumns:"1fr auto",gap:".75rem",alignItems:"center"}),
  badge:{display:"inline-block",padding:".15rem .5rem",borderRadius:2,fontSize:".6rem",letterSpacing:".1em",textTransform:"uppercase",background:"rgba(201,168,76,0.13)",color:"#c9a84c",marginLeft:".5rem"},
  fgrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".75rem"},
  lbl:{fontSize:".67rem",letterSpacing:".12em",textTransform:"uppercase",color:"rgba(201,168,76,0.6)",fontWeight:500,display:"block",marginBottom:".3rem"},
  inp:{background:"#111",border:"1px solid rgba(201,168,76,0.14)",borderRadius:4,color:"#f0e8d0",fontFamily:"inherit",fontSize:".85rem",padding:".55rem .7rem",outline:"none",width:"100%"},
  outTab:(a)=>({padding:".35rem .7rem",borderRadius:3,border:"1px solid "+(a?"#c9a84c":"rgba(201,168,76,0.2)"),background:a?"#c9a84c":"transparent",color:a?"#0a0a0a":"rgba(201,168,76,0.55)",fontSize:".65rem",letterSpacing:".1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit"}),
  outTxt:{background:"#0f0f0f",border:"1px solid rgba(201,168,76,0.1)",borderRadius:6,padding:"1rem",fontSize:".82rem",lineHeight:1.75,color:"rgba(240,232,208,0.8)",whiteSpace:"pre-wrap",minHeight:160,position:"relative"},
  cpyBtn:{position:"absolute",top:".6rem",right:".6rem",padding:".25rem .6rem",background:"rgba(201,168,76,0.13)",border:"1px solid rgba(201,168,76,0.27)",borderRadius:3,color:"#c9a84c",fontSize:".6rem",letterSpacing:".1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit"},
  wixLbl:{fontSize:".65rem",letterSpacing:".15em",textTransform:"uppercase",color:"#7ec8e3",marginBottom:".4rem",display:"flex",alignItems:"center",justifyContent:"space-between"},
  wixCpy:(done)=>({padding:".2rem .55rem",background:done?"rgba(126,200,227,0.25)":"rgba(126,200,227,0.1)",border:"1px solid rgba(126,200,227,0.3)",borderRadius:3,color:"#7ec8e3",fontSize:".6rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".08em"}),
  wixTxt:{background:"#0a0f11",border:"1px solid rgba(126,200,227,0.12)",borderRadius:5,padding:".75rem 1rem",fontSize:".82rem",lineHeight:1.7,color:"rgba(240,232,208,0.75)",whiteSpace:"pre-wrap"},
};

function Field({label,children,full}){return(<div style={{gridColumn:full?"1/-1":undefined,display:"flex",flexDirection:"column"}}><label style={S.lbl}>{label}</label>{children}</div>);}

// 画像URL管理コンポーネント（URL貼り付け式・複数枚対応）
function ImageUploader({images=[],maxCount=5,onChange}){
  const [draftUrl,setDraftUrl]=useState("");
  const addImage=()=>{
    const u=(draftUrl||"").trim();
    if(!u) return;
    if(!/^https?:\/\//i.test(u)){
      alert("画像のURLは http:// または https:// で始まる必要があります");
      return;
    }
    if(images.length>=maxCount){
      alert(`画像は最大${maxCount}枚までです`);
      return;
    }
    onChange([...images,u]);
    setDraftUrl("");
  };
  const removeAt=(idx)=>onChange(images.filter((_,i)=>i!==idx));
  const moveLeft=(idx)=>{
    if(idx<=0) return;
    const next=[...images];
    [next[idx-1],next[idx]]=[next[idx],next[idx-1]];
    onChange(next);
  };
  const moveRight=(idx)=>{
    if(idx>=images.length-1) return;
    const next=[...images];
    [next[idx],next[idx+1]]=[next[idx+1],next[idx]];
    onChange(next);
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
      {/* 既存画像のサムネイル一覧 */}
      {images.length>0 && (
        <div style={{display:"flex",gap:".5rem",overflowX:"auto",padding:".25rem 0"}}>
          {images.map((url,idx)=>(
            <div key={idx} style={{flexShrink:0,position:"relative",width:120,height:120,background:"#0a0a0a",border:"1px solid rgba(201,168,76,0.25)",borderRadius:5,overflow:"hidden"}}>
              <img src={url} alt={`${idx+1}`} style={{width:"100%",height:"100%",objectFit:"cover"}}
                onError={(e)=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
              <div style={{display:"none",width:"100%",height:"100%",alignItems:"center",justifyContent:"center",color:"rgba(226,75,74,0.7)",fontSize:".62rem",textAlign:"center",padding:".25rem"}}>⚠️ 表示できません</div>
              <div style={{position:"absolute",top:0,right:0,display:"flex",gap:"2px"}}>
                <button type="button" onClick={()=>moveLeft(idx)} disabled={idx===0} title="前へ" style={{background:"rgba(0,0,0,0.7)",border:"none",color:idx===0?"rgba(255,255,255,0.3)":"#fff",fontSize:".7rem",padding:"2px 5px",cursor:idx===0?"default":"pointer"}}>←</button>
                <button type="button" onClick={()=>moveRight(idx)} disabled={idx===images.length-1} title="次へ" style={{background:"rgba(0,0,0,0.7)",border:"none",color:idx===images.length-1?"rgba(255,255,255,0.3)":"#fff",fontSize:".7rem",padding:"2px 5px",cursor:idx===images.length-1?"default":"pointer"}}>→</button>
                <button type="button" onClick={()=>removeAt(idx)} title="削除" style={{background:"rgba(226,75,74,0.85)",border:"none",color:"#fff",fontSize:".7rem",padding:"2px 6px",cursor:"pointer"}}>×</button>
              </div>
              <div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.7)",color:"rgba(201,168,76,0.85)",fontSize:".58rem",padding:"2px 4px",letterSpacing:".05em"}}>#{idx+1}</div>
            </div>
          ))}
        </div>
      )}
      {/* URL入力欄 */}
      {images.length<maxCount && (
        <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}}>
          <input
            type="url"
            placeholder="画像のURLを貼り付け（https://...）"
            value={draftUrl}
            onChange={(e)=>setDraftUrl(e.target.value)}
            onKeyDown={(e)=>{if(e.key==="Enter"){e.preventDefault();addImage();}}}
            style={{...S.inp,flex:1,minWidth:200}}
          />
          <button type="button" onClick={addImage} style={{...S.btn("ghost"),padding:".5rem 1rem"}}>＋ 追加</button>
        </div>
      )}
      {images.length>=maxCount && (
        <div style={{fontSize:".62rem",color:"rgba(244,162,97,0.7)"}}>📷 上限{maxCount}枚に達しました（削除すれば追加できます）</div>
      )}
    </div>
  );
}

function CalendarView({events,rentals=[],onEdit,onEditRental}){
  const today=new Date();
  const [calYear,setCalYear]=useState(()=>{
    const saved=localStorage.getItem("hb-cal-year");
    return saved?parseInt(saved):today.getFullYear();
  });
  const [calMonth,setCalMonth]=useState(()=>{
    const saved=localStorage.getItem("hb-cal-month");
    return saved!==null?parseInt(saved):today.getMonth();
  });
  useEffect(()=>{localStorage.setItem("hb-cal-year",calYear);localStorage.setItem("hb-cal-month",calMonth);},[calYear,calMonth]);
  const firstDay=new Date(calYear,calMonth,1).getDay();
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  // イベントと貸切を両方dateMapに入れる
  const dateMap={};
  events.forEach(e=>{
    if(!e.date)return;
    // 貸切キーワード入りイベントはカレンダーから除外（貸切モジュールに任せる）
    if(/貸切|貸し切り/.test(e.name||""))return;
    if(!dateMap[e.date])dateMap[e.date]=[];
    dateMap[e.date].push({_kind:"event",_orig:e,name:e.name});
  });
  // 貸切：成約・仮押さえ・完了のみ表示
  rentals.forEach(r=>{
    if(!r.desiredDate)return;
    if(!["hold","won","done"].includes(r.status))return;
    if(!dateMap[r.desiredDate])dateMap[r.desiredDate]=[];
    dateMap[r.desiredDate].push({_kind:"rental",_orig:r,_id:r._id,customerCompany:r.customerCompany,contactName:r.contactName,purpose:r.purpose});
  });
  const prev=()=>{if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11);}else setCalMonth(m=>m-1);};
  const next=()=>{if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0);}else setCalMonth(m=>m+1);};
  const goToday=()=>{setCalYear(today.getFullYear());setCalMonth(today.getMonth());};
  const handleJump=(e)=>{
    const [y,m]=e.target.value.split("-").map(Number);
    setCalYear(y);setCalMonth(m);
  };
  const jumpOptions=[];
  const baseY=today.getFullYear(),baseM=today.getMonth();
  for(let i=-6;i<=18;i++){
    const m=((baseM+i)%12+12)%12;
    const y=baseY+Math.floor((baseM+i)/12);
    jumpOptions.push({val:`${y}-${m}`,label:`${y}年${MONTH_NAMES[m]}`});
  }
  const currentVal=`${calYear}-${calMonth}`;
  const isCurrentMonth=calYear===today.getFullYear()&&calMonth===today.getMonth();

  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  const todayStr=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:".5rem",marginBottom:".75rem",flexWrap:"wrap"}}>
        <button style={S.btn("sm")} onClick={prev}>◀</button>
        <select value={currentVal} onChange={handleJump} style={{...S.inp,width:"auto",minWidth:140,padding:".4rem .65rem",fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".05em",textAlign:"center",cursor:"pointer"}}>
          {jumpOptions.map(o=>(<option key={o.val} value={o.val}>{o.label}</option>))}
        </select>
        <button style={S.btn("sm")} onClick={next}>▶</button>
        {!isCurrentMonth&&<button style={{...S.btn("ghost"),padding:".3rem .7rem",fontSize:".62rem"}} onClick={goToday}>今月</button>}
      </div>
      {/* 凡例 */}
      <div style={{display:"flex",justifyContent:"center",gap:"1rem",marginBottom:".75rem",fontSize:".62rem",color:"rgba(240,232,208,0.5)"}}>
        <span style={{display:"flex",alignItems:"center",gap:".3rem"}}><span style={{display:"inline-block",width:10,height:10,background:"rgba(201,168,76,0.3)",borderLeft:"2px solid #c9a84c",borderRadius:1}}/>イベント</span>
        <span style={{display:"flex",alignItems:"center",gap:".3rem"}}><span style={{display:"inline-block",width:10,height:10,background:"rgba(126,200,227,0.2)",borderLeft:"2px solid #7ec8e3",borderRadius:1}}/>貸切</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:2,marginBottom:2}}>
        {["日","月","火","水","木","金","土"].map((d,i)=>(
          <div key={d} style={{textAlign:"center",fontSize:".65rem",padding:".3rem 0",color:i===0?"#e24b4a":i===6?"#7ec8e3":"rgba(240,232,208,0.4)"}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:2}}>
        {cells.map((day,idx)=>{
          if(!day)return<div key={"e"+idx}/>;
          const dateKey=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const items=dateMap[dateKey]||[];
          const isToday=dateKey===todayStr;
          const dow=(firstDay+day-1)%7;
          return(
            <div key={idx} className="hb-cal-cell" style={{background:isToday?"rgba(201,168,76,0.12)":"#111",border:isToday?"1px solid rgba(201,168,76,0.5)":"1px solid rgba(255,255,255,0.04)",borderRadius:4,padding:".3rem .25rem",minHeight:58,minWidth:0,overflow:"hidden"}}>
              <div className="hb-cal-day-num" style={{fontSize:".72rem",fontWeight:500,marginBottom:".2rem",color:isToday?"#c9a84c":dow===0?"#e24b4a":dow===6?"#7ec8e3":"rgba(240,232,208,0.55)"}}>{day}</div>
              {items.map((it,ei)=>{
                const isRental=it._kind==="rental";
                const label=isRental
                  ? `🍽 ${it.customerCompany||it.contactName||"貸切"}`
                  : it.name;
                return (
                  <div key={ei}
                    className="hb-cal-event"
                    onClick={()=>{
                      if(isRental){onEditRental&&onEditRental(it._id);}
                      else{onEdit(events.indexOf(it._orig));}
                    }}
                    style={{
                      fontSize:".55rem",lineHeight:1.3,padding:".15rem .28rem",marginBottom:".12rem",
                      background:isRental?"rgba(126,200,227,0.18)":"rgba(201,168,76,0.15)",
                      borderLeft:isRental?"2px solid #7ec8e3":"2px solid #c9a84c",
                      borderRadius:2,cursor:"pointer",color:"#f0e8d0cc",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"
                    }}
                    title={isRental?`貸切: ${it.contactName||""}（${it.purpose||""}）`:it.name}>
                    {label}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// GoogleドライブのviewリンクをサムネイルURLに変換（画像直接表示用）
function gdriveDirectUrl(url) {
  if (!url) return "";
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return url;
  const id = m[1];
  // thumbnail APIを使う（CORSが緩い）
  return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
}

async function callOpenAIAPI(prompt, apiKey, imageUrl) {
  const useVision = !!imageUrl;
  const messages = useVision
    ? [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      }]
    : [{ role: "user", content: prompt }];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: useVision ? "gpt-4o" : "gpt-4o-mini",
      max_tokens: 500,
      messages,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error?.message || "API呼び出しに失敗しました");
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function FlyerTab({ outputs, copied, copyText }) {
  const [photos, setPhotos] = useState([]);
  const fileRef = useRef();
  const handlePhotoUpload = (e) => {
    Array.from(e.target.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => setPhotos(p => [...p, { name: file.name, url: ev.target.result }]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };
  return (
    <div>
      <div style={{marginBottom:"1.5rem"}}>
        <div style={{fontSize:".65rem",letterSpacing:".15em",textTransform:"uppercase",color:"#f4a261",marginBottom:".5rem",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span>📋 Canvaコピペ用テキスト</span>
          <button style={{padding:".2rem .55rem",background:copied==="flyer"?"rgba(244,162,97,0.2)":"rgba(244,162,97,0.08)",border:"1px solid rgba(244,162,97,0.3)",borderRadius:3,color:"#f4a261",fontSize:".6rem",cursor:"pointer",fontFamily:"inherit"}} onClick={()=>copyText(outputs.flyer,"flyer")}>{copied==="flyer"?"✓ 完了":"コピー"}</button>
        </div>
        <div style={{...S.wixTxt,borderColor:"rgba(244,162,97,0.15)",background:"#0f0a07"}}>{outputs.flyer}</div>
      </div>

      <div style={{marginBottom:"1rem"}}>
        <div style={{fontSize:".65rem",letterSpacing:".15em",textTransform:"uppercase",color:"#f4a261",marginBottom:".75rem"}}>🖼 アーティスト写真</div>
        <label style={{display:"inline-flex",alignItems:"center",gap:".5rem",padding:".45rem .9rem",background:"rgba(244,162,97,0.08)",border:"1px solid rgba(244,162,97,0.25)",borderRadius:4,cursor:"pointer",fontSize:".72rem",color:"#f4a261",letterSpacing:".1em"}}>
          📁 写真を追加（複数可）
          <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} style={{display:"none"}} ref={fileRef}/>
        </label>
      </div>

      {photos.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:".65rem",marginBottom:"1.5rem"}}>
          {photos.map((p,i)=>(
            <div key={i} style={{position:"relative",borderRadius:5,overflow:"hidden",border:"1px solid rgba(244,162,97,0.2)"}}>
              <img src={p.url} alt={p.name} style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block"}}/>
              <div style={{padding:".22rem .4rem",background:"#0a0a0a",fontSize:".55rem",color:"rgba(240,232,208,0.45)",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{p.name}</div>
              <button onClick={()=>setPhotos(ps=>ps.filter((_,idx)=>idx!==i))} style={{position:"absolute",top:".25rem",right:".25rem",background:"rgba(0,0,0,0.75)",border:"none",borderRadius:"50%",width:18,height:18,color:"#e24b4a",cursor:"pointer",fontSize:".65rem",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{padding:"1rem",background:"rgba(244,162,97,0.06)",border:"1px solid rgba(244,162,97,0.15)",borderRadius:6}}>
        <div style={{fontSize:".72rem",color:"rgba(240,232,208,0.55)",marginBottom:".75rem",lineHeight:1.7}}>
          ① 上のテキストをコピーしてCanvaに貼り付け<br/>
          ② 写真を右クリック →「名前をつけて保存」でダウンロード<br/>
          ③ CanvaにアップロードしてフライヤーにD&D
        </div>
        <button onClick={()=>window.open("https://www.canva.com/","_blank")} style={{...S.btn("ghost"),color:"#f4a261",borderColor:"rgba(244,162,97,0.35)"}}>
          🎨 Canvaを開く
        </button>
      </div>
    </div>
  );
}

// ============================================================
// タイムテーブル機能
// ============================================================
const TT_TEMPLATES = {
  oneman: {
    label: "ワンマン（2ステージ）",
    bands: 1,
    generate: (perfList) => {
      const a = perfList[0] || "出演者";
      return [
        { time: "16:00", text: "入り" },
        { time: "16:00-17:45", text: `${a} リハーサル` },
        { time: "18:00", text: "開場" },
        { time: "19:00", text: `${a} 1st Stage` },
        { time: "19:50", text: "休憩" },
        { time: "20:10", text: `${a} 2nd Stage` },
        { time: "21:00", text: "終演" },
      ];
    },
  },
  two: {
    label: "2バンド対バン",
    bands: 2,
    generate: (perfList) => {
      const [a="バンドA", b="バンドB"] = perfList;
      return [
        { time: "16:00", text: "入り" },
        { time: "16:00-16:50", text: `${a} リハーサル` },
        { time: "16:55-17:45", text: `${b} リハーサル` },
        { time: "18:00", text: "開場" },
        { time: "19:00-19:45", text: a },
        { time: "19:45-19:55", text: "転換" },
        { time: "19:55-20:40", text: b },
        { time: "20:50", text: "終演" },
      ];
    },
  },
  three: {
    label: "3バンド対バン",
    bands: 3,
    generate: (perfList) => {
      const [a="バンドA", b="バンドB", c="バンドC"] = perfList;
      return [
        { time: "16:00", text: "入り" },
        { time: "16:00-16:35", text: `${a} リハーサル` },
        { time: "16:40-17:15", text: `${b} リハーサル` },
        { time: "17:20-17:45", text: `${c} リハーサル` },
        { time: "18:00", text: "開場" },
        { time: "19:00-19:30", text: a },
        { time: "19:30-19:35", text: "転換" },
        { time: "19:35-20:05", text: b },
        { time: "20:05-20:10", text: "転換" },
        { time: "20:10-20:40", text: c },
        { time: "20:50", text: "終演" },
      ];
    },
  },
  four: {
    label: "4バンド対バン",
    bands: 4,
    generate: (perfList) => {
      const [a="バンドA", b="バンドB", c="バンドC", d="バンドD"] = perfList;
      return [
        { time: "16:00", text: "入り" },
        { time: "16:00-16:25", text: `${a} リハーサル` },
        { time: "16:30-16:55", text: `${b} リハーサル` },
        { time: "17:00-17:25", text: `${c} リハーサル` },
        { time: "17:30-17:55", text: `${d} リハーサル` },
        { time: "18:00", text: "開場" },
        { time: "18:30-19:00", text: a },
        { time: "19:00-19:05", text: "転換" },
        { time: "19:05-19:35", text: b },
        { time: "19:35-19:40", text: "転換" },
        { time: "19:40-20:10", text: c },
        { time: "20:10-20:15", text: "転換" },
        { time: "20:15-20:45", text: d },
        { time: "21:00", text: "終演" },
      ];
    },
  },
};

function TimeTableTab({ form, copyText, copied }) {
  const ttKey = `hb-tt-${form.date || ""}-${form.name || ""}`;
  const [rows, setRows] = useState(() => {
    const saved = localStorage.getItem(ttKey);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    if (rows.length > 0) localStorage.setItem(ttKey, JSON.stringify(rows));
  }, [rows, ttKey]);

  const loadTemplate = (key) => {
    const tpl = TT_TEMPLATES[key];
    if (!tpl) return;
    const perfList = (form.perf || "").split(/[\/／,、]/).map(s => s.trim()).filter(Boolean);
    setRows(tpl.generate(perfList));
  };

  const updateRow = (i, field, value) => {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };
  const addRow = () => setRows(rs => [...rs, { time: "", text: "" }]);
  const removeRow = (i) => setRows(rs => rs.filter((_, idx) => idx !== i));
  const moveRow = (i, dir) => {
    setRows(rs => {
      const next = [...rs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return rs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const clearAll = () => {
    if (!window.confirm("タイムテーブルをすべてクリアしますか？")) return;
    setRows([]);
    localStorage.removeItem(ttKey);
  };

  // テキスト出力
  const ttText = rows.length === 0 ? "" : [
    `▼ ${form.name || "イベント"} タイムテーブル`,
    form.date ? fmtDate(form.date) + (form.day ? `（${form.day}）` : "") : "",
    "─────────────",
    ...rows.map(r => `${r.time}　${r.text}`),
  ].filter(Boolean).join("\n");

  return (
    <div>
      {/* テンプレート選択 */}
      <div style={{marginBottom:"1rem", padding:".75rem 1rem", background:"rgba(201,168,76,0.05)", borderRadius:5, border:"1px solid rgba(201,168,76,0.15)"}}>
        <div style={{fontSize:".68rem",color:"rgba(201,168,76,0.7)",marginBottom:".5rem",letterSpacing:".1em"}}>📋 テンプレートから読み込み（出演者欄をスラッシュ区切りで分割）</div>
        <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}}>
          {Object.entries(TT_TEMPLATES).map(([k,v]) => (
            <button key={k} style={S.btn("sm")} onClick={()=>loadTemplate(k)}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* タイムテーブル編集 */}
      {rows.length === 0 && (
        <div style={{textAlign:"center",padding:"2rem 1rem",color:"rgba(240,232,208,0.3)",fontSize:".8rem",border:"1px dashed rgba(201,168,76,0.2)",borderRadius:5,marginBottom:"1rem"}}>
          上のテンプレートから読み込むか、下の「+ 行を追加」でタイムテーブルを作成できます ⏱
        </div>
      )}

      {rows.length > 0 && (
        <div style={{marginBottom:"1rem"}}>
          {rows.map((r, i) => (
            <div key={i} style={{display:"grid",gridTemplateColumns:"110px 1fr auto",gap:".4rem",marginBottom:".35rem",alignItems:"center"}}>
              <input style={{...S.inp,fontSize:".78rem",padding:".4rem .55rem"}} value={r.time} onChange={e=>updateRow(i,"time",e.target.value)} placeholder="19:00"/>
              <input style={{...S.inp,fontSize:".78rem",padding:".4rem .55rem"}} value={r.text} onChange={e=>updateRow(i,"text",e.target.value)} placeholder="バンドA"/>
              <div style={{display:"flex",gap:".25rem"}}>
                <button onClick={()=>moveRow(i,-1)} style={{padding:".25rem .45rem",background:"transparent",border:"1px solid rgba(201,168,76,0.2)",borderRadius:3,color:"#c9a84c",cursor:"pointer",fontSize:".7rem"}}>↑</button>
                <button onClick={()=>moveRow(i,1)} style={{padding:".25rem .45rem",background:"transparent",border:"1px solid rgba(201,168,76,0.2)",borderRadius:3,color:"#c9a84c",cursor:"pointer",fontSize:".7rem"}}>↓</button>
                <button onClick={()=>removeRow(i)} style={{padding:".25rem .45rem",background:"transparent",border:"1px solid rgba(226,75,74,0.27)",borderRadius:3,color:"#e24b4a",cursor:"pointer",fontSize:".7rem"}}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:".5rem",marginBottom:"1.5rem"}}>
        <button style={S.btn("ghost")} onClick={addRow}>＋ 行を追加</button>
        {rows.length > 0 && <button style={S.btn("danger")} onClick={clearAll}>クリア</button>}
      </div>

      {/* テキスト出力プレビュー */}
      {rows.length > 0 && (
        <div style={{marginBottom:"1rem"}}>
          <div style={{fontSize:".68rem",color:"#c9a84c",marginBottom:".4rem",letterSpacing:".15em",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span>📋 コピー用テキスト</span>
            <button style={{...S.cpyBtn,position:"static"}} onClick={()=>copyText(ttText,"tt")}>{copied==="tt"?"✓ 完了":"コピー"}</button>
          </div>
          <div style={{...S.outTxt,minHeight:"auto"}}>{ttText}</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // ナビゲーション履歴スタック（戻るボタンの動作を制御）
  // home → events_list → events_form と進んだら、戻るボタンで events_list に戻る
  const [viewStack, setViewStack] = useState(["home"]);
  const view = viewStack[viewStack.length - 1];
  const setView = (v) => setViewStack([v]); // 互換性用

  // ブラウザの戻るボタン対応
  useEffect(() => {
    const handlePopState = (e) => {
      // ブラウザの戻るボタン → スタックを1つ戻す
      setViewStack(stack => {
        if (stack.length > 1) return stack.slice(0, -1);
        return ["home"];
      });
    };
    window.addEventListener("popstate", handlePopState);
    if (!window.history.state || !window.history.state.view) {
      window.history.replaceState({ view: "home" }, "");
    }
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateTo = (newView) => {
    if (newView === view) return;
    // 予約モジュール以外に遷移する時は日付指定をクリア
    if (newView !== "reservation") setReservationInitialDate(null);
    window.history.pushState({ view: newView }, "");
    setViewStack(stack => [...stack, newView]);
  };

  const navigateBack = () => {
    setViewStack(stack => {
      const newStack = stack.length > 1 ? stack.slice(0, -1) : ["home"];
      const newView = newStack[newStack.length - 1];
      // 予約モジュール以外に戻る時は日付指定をクリア
      if (newView !== "reservation") setReservationInitialDate(null);
      return newStack;
    });
    if (window.history.length > 1) window.history.back();
  };

  const goHome = () => {
    setViewStack(["home"]);
    window.history.pushState({ view: "home" }, "");
  };
  const [listMode, setListMode] = useState("calendar");
  const [form, setForm] = useState(emptyForm);
  const [editingIdx, setEditingIdx] = useState(null);
  const [events, setEvents] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [cloudReady, setCloudReady] = useState(false);
  const [outputs, setOutputs] = useState(null);
  const [activeOut, setActiveOut] = useState("hp");
  const [tplName, setTplName] = useState("");
  const [showTplModal, setShowTplModal] = useState(false);
  const [copied, setCopied] = useState("");
  const [csvMsg, setCsvMsg] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("hb-openai-key") || "");
  const [showApiModal, setShowApiModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");
  const [rentalsList, setRentalsList] = useState([]);
  const [rentalToOpen, setRentalToOpen] = useState(null);
  const [trashEvents, setTrashEvents] = useState([]);
  const [showEventTrash, setShowEventTrash] = useState(false);
  const [shiftsList, setShiftsList] = useState([]);
  const [reservationsList, setReservationsList] = useState([]);
  const [reservationInitialDate, setReservationInitialDate] = useState(null);

  // Firestore リアルタイム同期
  useEffect(() => {
    const TRASH_TTL = 30 * 24 * 60 * 60 * 1000; // 30日
    const purgeOldTrash = (collName, items) => {
      const now = Date.now();
      items.forEach(it => {
        if (it._deleted && it._deletedAt && (now - it._deletedAt) > TRASH_TTL) {
          deleteDoc(doc(db, collName, it._id)).catch(()=>{});
        }
      });
    };

    const unsubE = onSnapshot(collection(db, "events"), (snap) => {
      const all = [];
      snap.forEach(d => all.push({ ...d.data(), _id: d.id }));
      const active = all.filter(e => !e._deleted);
      const trashed = all.filter(e => e._deleted);
      setEvents(active);
      setTrashEvents(trashed);
      setCloudReady(true);
      purgeOldTrash("events", trashed);
    }, (err) => { console.error("events sync error:", err); setCloudReady(true); });
    const unsubT = onSnapshot(collection(db, "templates"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setTemplates(list);
    }, (err) => { console.error("templates sync error:", err); });
    const unsubR = onSnapshot(collection(db, "rentals"), (snap) => {
      const all = [];
      snap.forEach(d => all.push({ ...d.data(), _id: d.id }));
      setRentalsList(all.filter(r => !r._deleted));
      purgeOldTrash("rentals", all.filter(r => r._deleted));
    }, (err) => { console.error("rentals sync error:", err); });
    const unsubS = onSnapshot(collection(db, "shifts"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setShiftsList(list);
    }, (err) => { console.error("shifts sync error:", err); });
    const unsubRes = onSnapshot(collection(db, "reservations"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setReservationsList(list.filter(r => !r._deleted));
    }, (err) => { console.error("reservations sync error:", err); });
    return () => { unsubE(); unsubT(); unsubR(); unsubS(); unsubRes(); };
  }, []);

  // 既存イベントから貸切を一括取り込み
  const handleBulkImportRentals = async () => {
    const candidates = events.filter(e => isRentalEvent(e.name));
    if (candidates.length === 0) {
      alert("イベント管理に「貸切」キーワードを含むイベントは見つかりませんでした。");
      return;
    }
    if (!window.confirm(`イベント管理から ${candidates.length} 件の貸切候補が見つかりました。\n貸切モジュールに登録しますか？\n（既に登録済みのものはスキップされます）`)) return;
    let added = 0, skipped = 0;
    for (const ev of candidates) {
      const customerName = extractCustomerName(ev.name) || ev.name;
      const dup = rentalsList.find(r =>
        r.desiredDate === ev.date &&
        (r.customerCompany === customerName || r.contactName === customerName)
      );
      if (dup) { skipped++; continue; }
      const label = extractTimeLabel(ev.name);
      const desiredTime = [label, [ev.open, ev.start].filter(Boolean).join("〜")].filter(Boolean).join(" ");
      const rentalId = `rental_bulk_${ev.date}_${customerName.replace(/[\s\/\.\#\$\[\]]/g,"_")}_${Date.now().toString(36).slice(-4)}`;
      try {
        await setDoc(doc(db, "rentals", rentalId), {
          inquiryDate: new Date().toISOString().split("T")[0],
          desiredDate: ev.date || "",
          desiredTime,
          purpose: "", people: ev.cap || "", budget: "",
          food: "", drinks: "",
          stage: false, sound: false, mic: false, projector: false,
          contactName: customerName,
          phone: "", email: "",
          customerCompany: "",
          status: "won",
          replyStatus: "", quoteStatus: "",
          outcome: "",
          memo: `🔄 既存イベントから一括取り込み\n元のイベント名：${ev.name}`,
          quoteItems: [],
          quoteNo: "", invoiceNo: "",
          quoteSubject: "", invoiceSubject: "",
          validityDate: "",
          depositPolicy: "required",
          depositReceived: false,
          depositDate: "",
          depositAmount: "30000",
          depositMemo: "",
          staff: "",
          documentHistory: [],
          savedAt: new Date().toLocaleDateString("ja-JP"),
        });
        added++;
      } catch (err) { console.error(err); }
    }
    alert(`✅ 取り込み完了：新規 ${added}件 / スキップ ${skipped}件`);
  };

  // 貸切 → イベントに変換
  const handleConvertRentalToEvent = async (rental, rentalId) => {
    const choice = window.prompt(
      `「${rental.contactName||rental.customerCompany||"貸切"}」をイベントに変換します。\n\n元の貸切の扱いを選んでください：\n  keep = 貸切モジュールにも残す（両方に登録）\n  delete = 貸切モジュールから削除\n  cancel = キャンセル\n\n入力欄に "keep" / "delete" / "cancel" のいずれかを入力してください`,
      "keep"
    );
    if (!choice || choice === "cancel") return false;
    if (choice !== "keep" && choice !== "delete") { alert("入力が不正です。中止しました。"); return false; }
    try {
      const customer = rental.customerCompany || rental.contactName || "貸切";
      const eventName = customer.includes("貸切") ? customer : `${customer}様貸切`;
      const dup = events.find(e => e.date === rental.desiredDate && e.name === eventName);
      if (dup) {
        alert("同じ日付・名前のイベントがすでに登録されています。\nイベント管理から直接編集してください。");
        return false;
      }
      // desiredTime から開場/開演を取り出す（例：「18:00〜19:00」）
      let evOpen = "", evStart = "";
      const m = (rental.desiredTime||"").match(/(\d{1,2}:\d{2})\s*[〜~\-]\s*(\d{1,2}:\d{2})/);
      if (m) { evOpen = m[1]; evStart = m[2]; }
      else {
        const m2 = (rental.desiredTime||"").match(/(\d{1,2}:\d{2})/);
        if (m2) evStart = m2[1];
      }
      const eventData = {
        date: rental.desiredDate || "",
        day: rental.desiredDate ? DAYS[new Date(rental.desiredDate+"T00:00:00").getDay()]+"曜日" : "",
        name: eventName,
        perf: "",
        open: evOpen,
        start: evStart,
        price: "",
        rehearsal: "",
        poster: "",
        timetable: "",
        desc: "",
        url: "",
        notes: rental.memo || "",
        genre: "貸切",
        cap: rental.people || "",
        reference: "",
        savedAt: new Date().toLocaleDateString("ja-JP"),
      };
      const id = `event_conv_${eventData.date}_${eventName.replace(/[\s\/\.\#\$\[\]]/g,"_")}_${Date.now().toString(36).slice(-4)}`;
      await setDoc(doc(db, "events", id), eventData);
      if (choice === "delete" && rentalId) {
        await deleteDoc(doc(db, "rentals", rentalId));
        alert("✓ イベントに変換しました（貸切モジュールからは削除）");
        return "deleted";
      } else {
        alert("✓ イベントに変換しました（貸切モジュールにも残しました）");
        return true;
      }
    } catch (e) { alert("変換失敗：" + e.message); return false; }
  };

  // 貸切クリックハンドラ：rentalsモジュールへ遷移＋ID指定
  const handleEditRental = (rentalId) => {
    setRentalToOpen(rentalId);
    navigateTo("rentals");
  };

  const setField=(k,v)=>setForm(f=>{
    const next={...f,[k]:v};
    if(k==="date"&&v){const d=new Date(v+"T00:00:00");next.day=DAYS[d.getDay()]+"曜日";}
    return next;
  });

  const clearForm=()=>{setForm(emptyForm);setEditingIdx(null);setOutputs(null);setAiError("");};
  const handleGenerate=()=>{setOutputs(generateTexts(form));setActiveOut("hp");};

  const handleAIDesc=async()=>{
    if(!form.name){setAiError("イベント名を入力してください");return;}
    if(!apiKey){setTempApiKey("");setShowApiModal(true);return;}
    setAiLoading(true);setAiError("");
    try{
      const hasPoster = !!form.poster;
      const posterUrl = hasPoster ? gdriveDirectUrl(form.poster) : "";
      const prompt=`あなたはライブハウス「大船HONEY BEE」のイベント告知文ライターです。
以下のイベント情報をもとに、魅力的なイベント説明文を日本語で150〜200字程度で書いてください。
ライブハウスらしい熱量と高級感を両立した文体で、お客さんが「行きたい！」と思えるような内容にしてください。

イベント名：${form.name}
ジャンル：${form.genre||"ライブ"}
出演者：${form.perf||"未定"}
料金：${form.price||"未定"}
開場/開演：${form.open||""}/${form.start||""}
${form.reference ? `\n【参考情報（出演者の経歴・特徴など）】\n${form.reference}\n上記の参考情報を活かして、出演者の魅力が伝わるよう具体的に書いてください。` : ""}
${hasPoster ? `\n【ポスター画像も添付しています】\n画像から読み取れる情報（出演者名、ジャンル、雰囲気、デザインの世界観など）を必ず説明文に活かしてください。画像内の文字情報も参考にしてください。` : ""}

説明文のみを出力し、前置きや後書きは不要です。`;
      const result=await callOpenAIAPI(prompt, apiKey, posterUrl);
      setField("desc",result.trim());
    }catch(e){
      setAiError("AI生成に失敗しました："+e.message);
    }
    setAiLoading(false);
  };

  const saveApiKey=()=>{
    if(!tempApiKey.trim()){alert("APIキーを入力してください");return;}
    localStorage.setItem("hb-openai-key", tempApiKey.trim());
    setApiKey(tempApiKey.trim());
    setShowApiModal(false);
    setTempApiKey("");
  };

  // Firestore用のID生成（日付＋イベント名）
  const makeEventId = (e) => `${e.date || "nodate"}_${(e.name || "").replace(/[\/\.\#\$\[\]]/g, "_")}_${Date.now().toString(36).slice(-4)}`;

  const handleSaveEvent = async () => {
    if (!form.name) { alert("イベント名を入力してください"); return; }
    const d = { ...form, savedAt: new Date().toLocaleDateString("ja-JP") };
    try {
      let docId = form._id;
      if (editingIdx !== null && events[editingIdx] && events[editingIdx]._id) {
        docId = events[editingIdx]._id;
      }
      if (!docId) docId = makeEventId(d);
      const { _id, ...dataToSave } = d;
      await setDoc(doc(db, "events", docId), dataToSave);
      alert("✓ イベントを保存しました（クラウド同期済）");
    } catch (e) {
      console.error(e);
      alert("⚠️ 保存に失敗しました：" + e.message);
    }
  };

  const handleSaveTpl = async () => {
    if (!tplName.trim()) { alert("テンプレート名を入力してください"); return; }
    try {
      const tplId = `tpl_${tplName.replace(/[\/\.\#\$\[\]]/g, "_")}_${Date.now().toString(36).slice(-4)}`;
      const data = { ...form, name: tplName, savedAt: new Date().toLocaleDateString("ja-JP") };
      delete data._id;
      await setDoc(doc(db, "templates", tplId), data);
      setShowTplModal(false); setTplName("");
      alert("⭐ テンプレートを保存しました");
    } catch (e) {
      alert("⚠️ 保存失敗：" + e.message);
    }
  };

  const editEvent = (i) => { if (i < 0 || i >= events.length) return; setForm(events[i]); setEditingIdx(i); setOutputs(null); setAiError(""); navigateTo("events_form"); };

  // イベント → 貸切に変換
  const handleConvertToRental = async (idx) => {
    const ev = events[idx];
    if (!ev) return;
    const choice = window.prompt(
      `「${ev.name}」を貸切に変換します。\n\n元のイベントの扱いを選んでください：\n  keep = イベント管理にも残す（両方に登録）\n  delete = イベント管理から削除\n  cancel = キャンセル\n\n入力欄に "keep" / "delete" / "cancel" のいずれかを入力してください`,
      "keep"
    );
    if (!choice || choice === "cancel") return;
    if (choice !== "keep" && choice !== "delete") { alert("入力が不正です。中止しました。"); return; }
    try {
      const customerName = extractCustomerName(ev.name) || ev.name;
      const dup = rentalsList.find(r =>
        r.desiredDate === ev.date &&
        (r.customerCompany === customerName || r.contactName === customerName)
      );
      if (dup) {
        alert("同じ日付・お客様名の貸切がすでに登録されています。\n貸切モジュールから直接編集してください。");
        return;
      }
      const label = extractTimeLabel(ev.name);
      const desiredTime = [label, [ev.open, ev.start].filter(Boolean).join("〜")].filter(Boolean).join(" ");
      const rentalId = `rental_conv_${ev.date}_${customerName.replace(/[\s\/\.\#\$\[\]]/g,"_")}_${Date.now().toString(36).slice(-4)}`;
      await setDoc(doc(db, "rentals", rentalId), {
        inquiryDate: new Date().toISOString().split("T")[0],
        desiredDate: ev.date || "",
        desiredTime,
        purpose: "", people: ev.cap || "", budget: "",
        food: "", drinks: "",
        stage: false, sound: false, mic: false, projector: false,
        contactName: customerName,
        phone: "", email: "",
        customerCompany: "",
        status: "won",
        replyStatus: "", quoteStatus: "",
        outcome: "",
        memo: `🔄 イベント管理から変換\n元のイベント名：${ev.name}${ev.desc?`\n${ev.desc}`:""}`,
        quoteItems: [],
        quoteNo: "", invoiceNo: "",
        quoteSubject: "", invoiceSubject: "",
        validityDate: "",
        depositPolicy: "required",
        depositReceived: false,
        depositDate: "",
        depositAmount: "30000",
        depositMemo: "",
        staff: "",
        documentHistory: [],
        savedAt: new Date().toLocaleDateString("ja-JP"),
      });
      if (choice === "delete" && ev._id) {
        await deleteDoc(doc(db, "events", ev._id));
        alert("✓ 貸切に変換しました（イベント管理からは削除）");
        navigateBack();
      } else {
        alert("✓ 貸切に変換しました（イベント管理にも残しました）");
      }
    } catch (e) { alert("変換失敗：" + e.message); }
  };

  const deleteEvent = async (i) => {
    if (!window.confirm("このイベントをゴミ箱に移動しますか？\n（30日以内なら復元できます）")) return;
    try {
      const ev = events[i];
      if (ev && ev._id) {
        const { _id, ...data } = ev;
        await setDoc(doc(db, "events", ev._id), {
          ...data,
          _deleted: true,
          _deletedAt: Date.now(),
        });
      }
    } catch (e) { alert("削除失敗：" + e.message); }
  };

  // ゴミ箱から復元
  const restoreEvent = async (id) => {
    try {
      const ev = events.find(e => e._id === id) || trashEvents.find(e => e._id === id);
      if (!ev) return;
      const { _id, _deleted, _deletedAt, ...data } = ev;
      await setDoc(doc(db, "events", id), data);
    } catch (e) { alert("復元失敗：" + e.message); }
  };

  // ゴミ箱から完全削除
  const purgeEvent = async (id) => {
    if (!window.confirm("このイベントを完全に削除しますか？\nこの操作は取り消せません。")) return;
    try {
      await deleteDoc(doc(db, "events", id));
    } catch (e) { alert("削除失敗：" + e.message); }
  };

  const deleteTpl = async (i) => {
    if (!window.confirm("このテンプレートを削除しますか？")) return;
    try {
      const t = templates[i];
      if (t && t._id) await deleteDoc(doc(db, "templates", t._id));
    } catch (e) { alert("削除失敗：" + e.message); }
  };

  const loadTpl = t => { const { _id, ...rest } = t; setForm({ ...emptyForm, ...rest }); setOutputs(null); setAiError(""); };
  const copyText = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1600); };

  // 重複イベントの一括削除（date+name が同じものを統合）
  const handleDeduplicateEvents = async () => {
    console.log("[dedup] 開始 events.length=", events.length);

    // ── STEP1: グループ化（name/date を trim して正規化）
    const groups = {};
    events.forEach(ev => {
      const key = `${(ev.date || "").trim()}::${(ev.name || "").trim()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(ev);
    });

    const dupGroups = Object.entries(groups).filter(([, g]) => g.length > 1);
    console.log("[dedup] 全グループ数=", Object.keys(groups).length, " 重複グループ数=", dupGroups.length);

    // ── STEP2: 削除リスト作成
    const toDelete = [];
    dupGroups.forEach(([, group]) => {
      const sorted = [...group].sort((a, b) => {
        const da = new Date(a.savedAt || 0), db2 = new Date(b.savedAt || 0);
        if (db2 - da !== 0) return db2 - da;
        return (b._id || "").localeCompare(a._id || "");
      });
      sorted.slice(1).forEach(ev => toDelete.push(ev._id));
    });
    console.log("[dedup] 削除対象IDs=", toDelete);

    // ── STEP3: 診断アラート（削除前に内容を確認）
    const lines = [
      `📊 取得イベント数: ${events.length} 件`,
      `🔍 重複グループ数: ${dupGroups.length} グループ`,
      `🗑 削除対象: ${toDelete.length} 件`,
      "",
    ];
    if (dupGroups.length > 0) {
      lines.push("【重複の内訳（最大5グループ）】");
      dupGroups.slice(0, 5).forEach(([key, group]) => {
        const [date, ...nameParts] = key.split("::");
        lines.push(`  ${date} 「${nameParts.join("::")}」 → ${group.length}件`);
        group.forEach(ev => lines.push(`    ID: ${ev._id}  savedAt: ${ev.savedAt || "(なし)"}`));
      });
      if (dupGroups.length > 5) lines.push(`  ……他 ${dupGroups.length - 5} グループ`);
    } else {
      lines.push("（重複なし）");
      lines.push("");
      lines.push("画面に同じイベントが見えている場合、");
      lines.push("date か name の値が微妙に異なる可能性があります。");
      lines.push("ブラウザの Console ログも確認してください。");
    }

    alert(lines.join("\n"));

    if (toDelete.length === 0) return;

    // ── STEP4: 削除実行
    if (!window.confirm(`上記 ${toDelete.length} 件の重複を削除します。よろしいですか？`)) return;
    try {
      await Promise.all(toDelete.map(id => {
        console.log("[dedup] deleteDoc id=", id);
        return deleteDoc(doc(db, "events", id));
      }));
      alert(`✅ ${toDelete.length} 件の重複イベントを整理しました。`);
    } catch (e) {
      console.error("[dedup] 削除エラー:", e);
      alert("削除中にエラーが発生しました：" + e.message);
    }
  };

  // 指定月のイベントを全件完全削除
  const handleDeleteByMonth = async () => {
    const input = window.prompt("削除する月を「YYYY-MM」形式で入力してください（例: 2026-05）");
    if (!input) return;
    if (!/^\d{4}-\d{2}$/.test(input.trim())) {
      alert("形式が正しくありません。「2026-05」のように入力してください。");
      return;
    }
    const ym = input.trim();
    const [y, m] = ym.split("-");
    const label = `${parseInt(y)}年${parseInt(m)}月`;
    const targets = events.filter(ev => (ev.date || "").startsWith(ym));
    if (targets.length === 0) {
      alert(`${label}のイベントは見つかりませんでした。`);
      return;
    }
    if (!window.confirm(`${label}のイベント全 ${targets.length} 件を削除します。\nこの操作は取り消せません。本当によろしいですか？`)) return;
    try {
      await Promise.all(targets.map(ev => deleteDoc(doc(db, "events", ev._id))));
      alert(`✅ ${targets.length} 件削除しました。CSVから再取り込みしてください。`);
    } catch (e) { alert("削除中にエラーが発生しました：" + e.message); }
  };

  const handleCSV = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = parseCSV(ev.target.result);
        if (!imported.length) { setCsvMsg("⚠️ 読み込めるイベントがありませんでした。"); return; }
        const csvFields = ["date","day","name","perf","open","start","price","rehearsal","poster","notes","galleryNote","remark"];
        let added = 0, updated = 0, rentalAdded = 0;
        setCsvMsg("📤 クラウドに同期中...");
        for (const imp of imported) {
          // ===== イベント管理に登録 =====
          const existing = events.find(e => e.date === imp.date && e.name === imp.name);
          if (existing && existing._id) {
            const merged = { ...existing };
            csvFields.forEach(f => { merged[f] = imp[f] || ""; });
            merged.savedAt = new Date().toLocaleDateString("ja-JP");
            const { _id, ...data } = merged;
            await setDoc(doc(db, "events", existing._id), data);
            updated++;
          } else {
            const id = makeEventId(imp);
            await setDoc(doc(db, "events", id), imp);
            added++;
          }

          // ===== 貸切モジュールにも登録 =====
          if (isRentalEvent(imp.name)) {
            const customerName = extractCustomerName(imp.name);
            const dupRental = rentalsList.find(r =>
              r.desiredDate === imp.date &&
              (r.customerCompany === customerName || r.contactName === customerName)
            );
            if (!dupRental && customerName) {
              const rentalId = `rental_csv_${imp.date}_${customerName.replace(/[\s\/\.\#\$\[\]]/g,"_")}_${Date.now().toString(36).slice(-4)}`;
              const label = extractTimeLabel(imp.name);
              const desiredTime = [label, [imp.open, imp.start].filter(Boolean).join("〜")].filter(Boolean).join(" ");
              await setDoc(doc(db, "rentals", rentalId), {
                inquiryDate: new Date().toISOString().split("T")[0],
                desiredDate: imp.date,
                desiredTime,
                purpose: "", people: "", budget: "",
                food: "", drinks: "",
                stage: false, sound: false, mic: false, projector: false,
                contactName: customerName,
                phone: "", email: "",
                customerCompany: "",
                status: "won",
                replyStatus: "", quoteStatus: "",
                outcome: "",
                memo: `📂 CSVから自動登録\n元のイベント名：${imp.name}`,
                quoteItems: [],
                quoteNo: "", invoiceNo: "",
                quoteSubject: "", invoiceSubject: "",
                validityDate: "",
                depositPolicy: "required",
                depositReceived: false,
                depositDate: "",
                depositAmount: "30000",
                depositMemo: "",
                staff: "",
                documentHistory: [],
                savedAt: new Date().toLocaleDateString("ja-JP"),
              });
              rentalAdded++;
            }
          }
        }
        let msg = `✅ 読み込み完了：新規 ${added}件 / 更新 ${updated}件`;
        if (rentalAdded > 0) msg += ` / 貸切自動登録 ${rentalAdded}件`;
        setCsvMsg(msg);
        setTimeout(() => setCsvMsg(""), 6000);
      } catch (err) { setCsvMsg("⚠️ 読み込みに失敗しました：" + err.message); }
    };
    reader.readAsText(file, "UTF-8"); e.target.value = "";
  };

  const sortedEvents=[...events].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  const currentOut=outputs&&activeOut!=="wix"&&activeOut!=="flyer"?outputs[activeOut]:"";

  // お客様用予約フォーム：URLに ?reserve=1 が含まれていたら表示
  const isCustomerReservationMode = typeof window !== "undefined" && window.location.search.includes("reserve=1");
  if (isCustomerReservationMode) {
    return <CustomerReservationForm events={events}/>;
  }

  return(
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
      <style>{`
        html, body, #root { overflow-x: hidden; max-width: 100%; }
        /* Date input カレンダーアイコンを明るく見やすく */
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.7) sepia(1) saturate(3) hue-rotate(15deg) brightness(1.1);
          cursor: pointer;
          opacity: 1;
          padding: 4px;
        }
        input[type="date"]::-webkit-calendar-picker-indicator:hover {
          filter: invert(0.85) sepia(1) saturate(4) hue-rotate(15deg) brightness(1.2);
        }
        input[type="date"] {
          color-scheme: dark;
        }
        @media (max-width: 768px) {
          .hb-hdr { padding: 0.75rem 0.85rem !important; flex-wrap: wrap !important; gap: 0.4rem !important; }
          .hb-logo { font-size: 1rem !important; }
          .hb-view { padding: 0.85rem 0.6rem !important; }
          .hb-form-layout { grid-template-columns: 1fr !important; gap: 1rem !important; }
          .hb-form-grid { grid-template-columns: 1fr !important; }
          .hb-output-panel { border-left: none !important; padding-left: 0 !important; border-top: 1px solid rgba(201,168,76,0.1); padding-top: 1rem !important; }
          .hb-cal-cell { min-height: 44px !important; padding: 0.15rem 0.1rem !important; }
          .hb-cal-day-num { font-size: 0.6rem !important; }
          .hb-cal-event { font-size: 0.45rem !important; padding: 0.08rem 0.15rem !important; line-height: 1.2 !important; }
          .hb-toolbar { flex-direction: column !important; align-items: stretch !important; }
          .hb-card { grid-template-columns: 1fr !important; }
          .hb-tabs { gap: 0.25rem !important; }
          .hb-tab { font-size: 0.6rem !important; padding: 0.3rem 0.5rem !important; letter-spacing: 0.05em !important; }
          input, textarea, select { font-size: 16px !important; }
          .hb-module-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={S.hdr} className="hb-hdr">
        <div style={{display:"flex",alignItems:"center",gap:".75rem"}}>
          {view!=="home"&&(
            <button onClick={navigateBack} style={{background:"transparent",border:"1px solid rgba(201,168,76,0.27)",borderRadius:4,color:"#c9a84c",padding:".35rem .7rem",fontSize:".75rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}} title="戻る">← 戻る</button>
          )}
          <div style={S.logo} className="hb-logo" onClick={goHome} role="button" title="トップへ">
            HONEY BEE <small style={S.logoSm}>{view==="home"?"Operation":view.startsWith("events")?"Event Manager":view==="rentals"?"Rentals":view==="settlement"?"Settlement":view==="today"?"Today":view==="shift"?"Shifts":view==="reservation"?"Reservations":view==="seat_layout"?"Seats":""}</small>
          </div>
        </div>
        <div style={{display:"flex",gap:".4rem",alignItems:"center"}}>
          {view!=="home"&&<button onClick={goHome} style={{...S.btn("sm"),padding:".35rem .65rem"}} title="トップへ">🏠</button>}
          {(view==="events_list"||view==="events_form")&&(
            <>
              <button style={S.navTab(view==="events_list")} onClick={()=>navigateTo("events_list")}>📋 一覧</button>
              <button style={S.navTab(view==="events_form")} onClick={()=>navigateTo("events_form")}>✦ 新規作成</button>
            </>
          )}
          <button style={{...S.btn("sm"),padding:".35rem .65rem",marginLeft:".5rem"}} onClick={()=>{setTempApiKey(apiKey);setShowApiModal(true);}} title="OpenAI APIキー設定">{apiKey?"🔑":"🔓"}</button>
        </div>
      </div>

      {/* グローバルナビゲーション（ホーム以外で常時表示・どのページにも飛べる） */}
      {view!=="home" && (
        <div style={{
          background:"#0a0a0a",
          borderBottom:"1px solid rgba(201,168,76,0.15)",
          padding:".5rem 1rem",
          overflowX:"auto",
          whiteSpace:"nowrap",
          position:"sticky",
          top:0,
          zIndex:50,
        }}>
          <div style={{display:"inline-flex",gap:".4rem",alignItems:"center"}}>
            {[
              {key:"today", label:"📅 本日の営業", views:["today"]},
              {key:"reservation", label:"📞 予約管理", views:["reservation","seat_layout"]},
              {key:"events_list", label:"🎵 イベント管理", views:["events_list","events_form"]},
              {key:"rentals", label:"🍽 貸切", views:["rentals"]},
              {key:"settlement", label:"💴 アーティスト精算", views:["settlement"]},
              {key:"shift", label:"👥 シフト", views:["shift"]},
            ].map(item => {
              const active = item.views.includes(view);
              return (
                <button
                  key={item.key}
                  onClick={()=>navigateTo(item.key)}
                  style={{
                    padding:".4rem .85rem",
                    borderRadius:4,
                    border:`1px solid ${active?"#c9a84c":"rgba(201,168,76,0.2)"}`,
                    background: active ? "rgba(201,168,76,0.18)" : "transparent",
                    color: active ? "#f4d97a" : "rgba(201,168,76,0.75)",
                    fontSize:".72rem",
                    cursor:"pointer",
                    fontFamily:"inherit",
                    letterSpacing:".05em",
                    fontWeight: active ? 600 : 500,
                    flexShrink: 0,
                    whiteSpace:"nowrap",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== TOP: HONEY BEE OPERATION ===== */}
      {view==="home"&&(
        <div style={{padding:"2.5rem 2rem",maxWidth:1100,margin:"0 auto"}} className="hb-view">
          <div style={{textAlign:"center",marginBottom:"2.5rem"}}>
            <img src={process.env.PUBLIC_URL + "/honeybee_logo.png"} alt="HONEY BEE" style={{maxWidth:"min(420px,80%)",width:"auto",height:"auto",display:"block",margin:"0 auto 1.25rem"}}/>
            <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".25em",marginBottom:".4rem"}}>OPERATION CENTER</div>
            <div style={{fontSize:".75rem",color:"rgba(240,232,208,0.4)",letterSpacing:".15em"}}>業務ポータル — 各モジュールへアクセス</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:"1.25rem"}} className="hb-module-grid">
            {[
              {key:"today", icon:"📅", title:"本日の営業", desc:"イベント情報 / チェックリスト / 申し送り", ready:true},
              {key:"reservation", icon:"📞", title:"予約管理", desc:"フォーム予約 / 電話予約 / 受付チェック / 席レイアウト", ready:true},
              {key:"events_list", icon:"🎵", title:"イベント管理", desc:"カレンダー / CSV同期 / 投稿文・SEO自動生成", ready:true},
              {key:"rentals", icon:"🍽", title:"貸切管理", desc:"問い合わせから成約までの一元管理 / 返信文AI", ready:true},
              {key:"settlement", icon:"💰", title:"アーティスト精算", desc:"歩合・固定額計算 / 精算メモ自動生成", ready:true},
              {key:"shift", icon:"👥", title:"シフト管理", desc:"勤務表CSVから取り込み / 月別表示", ready:true},
              {key:"staff_day", icon:"🎤", title:"STAFF DAY", desc:"スタッフ企画イベントの管理", ready:false},
            ].map(m => (
              <div key={m.key} onClick={()=>m.ready?navigateTo(m.key):alert("このモジュールは準備中です。今後実装予定！")} style={{
                background: m.ready ? "linear-gradient(135deg,#1a1400 0%,#111 100%)" : "#0d0d0d",
                border: m.ready ? "1px solid rgba(201,168,76,0.35)" : "1px dashed rgba(201,168,76,0.15)",
                borderRadius:8, padding:"1.5rem 1.4rem", cursor:"pointer",
                transition:"all .2s", position:"relative",
                opacity: m.ready ? 1 : 0.55,
              }}
              onMouseEnter={e=>{if(m.ready){e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.borderColor="rgba(201,168,76,0.6)";}}}
              onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.borderColor=m.ready?"rgba(201,168,76,0.35)":"rgba(201,168,76,0.15)";}}
              >
                {!m.ready&&<div style={{position:"absolute",top:".75rem",right:".75rem",fontSize:".55rem",letterSpacing:".15em",padding:".15rem .5rem",background:"rgba(201,168,76,0.12)",color:"#c9a84c",borderRadius:2}}>SOON</div>}
                <div style={{fontSize:"2rem",marginBottom:".75rem",lineHeight:1}}>{m.icon}</div>
                <div style={{fontFamily:"Georgia,serif",fontSize:"1.05rem",color:"#c9a84c",letterSpacing:".08em",marginBottom:".4rem"}}>{m.title}</div>
                <div style={{fontSize:".72rem",color:"rgba(240,232,208,0.55)",lineHeight:1.6}}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view==="rentals"&&(
        <RentalsModule
          apiKey={apiKey}
          onRequireApiKey={()=>{setTempApiKey("");setShowApiModal(true);}}
          navigateBack={navigateBack}
          initialOpenId={rentalToOpen}
          onConsumeOpenId={()=>setRentalToOpen(null)}
          events={events}
          onBulkImport={handleBulkImportRentals}
          onConvertToEvent={handleConvertRentalToEvent}
        />
      )}

      {view==="settlement"&&(
        <SettlementModule
          events={events}
          navigateBack={navigateBack}
        />
      )}

      {view==="today"&&(
        <TodayModule
          events={events}
          rentals={rentalsList}
          shifts={shiftsList}
          reservations={reservationsList}
          navigateBack={navigateBack}
          onEditEvent={(eventId)=>{
            const idx = events.findIndex(e => e._id === eventId);
            if (idx >= 0) editEvent(idx);
          }}
          onGoReservations={(date)=>{
            setReservationInitialDate(date || null);
            navigateTo("reservation");
          }}
        />
      )}

      {view==="shift"&&(
        <ShiftModule navigateBack={navigateBack}/>
      )}

      {view==="reservation"&&(
        <ReservationModule
          events={events}
          shifts={shiftsList}
          navigateBack={navigateBack}
          onGoSeatLayout={()=>navigateTo("seat_layout")}
          initialDate={reservationInitialDate}
        />
      )}

      {view==="seat_layout"&&(
        <SeatLayoutModule
          reservations={reservationsList}
          navigateBack={navigateBack}
          onBackToReservation={()=>navigateTo("reservation")}
        />
      )}

      {view==="events_list"&&(
        <div style={{padding:"1.5rem 2rem"}} className="hb-view">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:".5rem"}} className="hb-toolbar">
            <div style={{display:"flex",gap:".4rem"}}>
              <button style={S.navTab(listMode==="calendar")} onClick={()=>setListMode("calendar")}>📅 カレンダー</button>
              <button style={S.navTab(listMode==="list")} onClick={()=>setListMode("list")}>☰ リスト</button>
            </div>
            <div style={{display:"flex",gap:".5rem",alignItems:"center",flexWrap:"wrap"}}>
              <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={()=>setShowEventTrash(true)}>🗑 ゴミ箱{trashEvents.length>0?` (${trashEvents.length})`:""}</button>
              <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={handleDeduplicateEvents}>🧹 重複整理</button>
              <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={handleDeleteByMonth}>🗑 月で一括削除</button>
              <label style={{...S.btn("ghost"),cursor:"pointer",padding:".45rem .9rem"}}>
                📂 CSVを読み込む
                <input type="file" accept=".csv" onChange={handleCSV} style={{display:"none"}}/>
              </label>
              <button style={S.btn("gold")} onClick={()=>{clearForm();navigateTo("events_form");}}>＋ 新規</button>
            </div>
          </div>

          {csvMsg&&<div style={{marginBottom:"1rem",padding:".6rem 1rem",borderRadius:5,background:csvMsg.startsWith("✅")?"rgba(100,200,100,0.1)":"rgba(226,75,74,0.1)",border:`1px solid ${csvMsg.startsWith("✅")?"rgba(100,200,100,0.3)":"rgba(226,75,74,0.3)"}`,fontSize:".8rem",color:csvMsg.startsWith("✅")?"#7ec87e":"#e24b4a"}}>{csvMsg}</div>}

          {listMode==="calendar"&&<CalendarView events={sortedEvents} rentals={rentalsList} onEdit={i=>{const ev=sortedEvents[i];editEvent(events.indexOf(ev));}} onEditRental={handleEditRental}/>}

          {listMode==="list"&&(
            <>
              <div style={S.secTitle}>テンプレート</div>
              {templates.length===0&&<div style={{color:"rgba(240,232,208,0.2)",fontSize:".75rem",marginBottom:"1rem"}}>テンプレートはまだありません</div>}
              {templates.map((t,i)=>(
                <div key={i} style={S.card(true)}>
                  <div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:".95rem",marginBottom:".28rem"}}>⭐ {t.name}<span style={S.badge}>Template</span></div>
                    <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.4)"}}>保存日：{t.savedAt||"–"}</div>
                  </div>
                  <div style={{display:"flex",gap:".4rem"}}>
                    <button style={S.btn("sm")} onClick={()=>{loadTpl(t);navigateTo("events_form");}}>読み込み</button>
                    <button style={S.btn("danger")} onClick={()=>deleteTpl(i)}>削除</button>
                  </div>
                </div>
              ))}
              <div style={{...S.secTitle,marginTop:"1.25rem"}}>イベント（{sortedEvents.length}件）</div>
              {sortedEvents.length===0&&<div style={{textAlign:"center",padding:"2rem",color:"rgba(240,232,208,0.2)",fontSize:".8rem"}}>🍯 イベントはまだありません</div>}
              {sortedEvents.map((e,si)=>{
                const realIdx=events.indexOf(e);
                return(
                  <div key={si} style={S.card(false)}>
                    <div>
                      <div style={{fontFamily:"Georgia,serif",fontSize:".95rem",marginBottom:".28rem"}}>{e.name||"（無題）"}</div>
                      <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.4)",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                        {e.date&&<span>📅 {fmtDate(e.date)}（{e.day}）</span>}
                        {e.open&&<span>🚪 {e.open}</span>}
                        {e.price&&<span>💴 {e.price}</span>}
                        {e.poster&&<a href={e.poster} target="_blank" rel="noreferrer" style={{color:"#c9a84c88",textDecoration:"none"}}>🖼 ポスター</a>}
                        {e.timetable&&<a href={e.timetable} target="_blank" rel="noreferrer" style={{color:"#c9a84c88",textDecoration:"none"}}>📋 TT</a>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:".4rem"}}>
                      <button style={S.btn("sm")} onClick={()=>editEvent(realIdx)}>編集</button>
                      <button style={S.btn("danger")} onClick={()=>deleteEvent(realIdx)}>削除</button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {view==="events_form"&&(
        <div style={{padding:"1.5rem 2rem 7rem"}} className="hb-view">
          {/* テンプレート読み込み */}
          {templates.length>0&&(
            <div style={{display:"flex",alignItems:"center",gap:".75rem",padding:".7rem 1rem",background:"#111",border:"1px solid rgba(201,168,76,0.1)",borderRadius:5,marginBottom:"1.25rem"}}>
              <label style={{...S.lbl,margin:0,whiteSpace:"nowrap"}}>テンプレートから読み込み：</label>
              <select style={{...S.inp,flex:1}} defaultValue="" onChange={e=>{if(e.target.value!=="")loadTpl(templates[parseInt(e.target.value)]);}}>
                <option value="">── テンプレートを選択 ──</option>
                {templates.map((t,i)=><option key={i} value={i}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* ===== ブロック1: 基本情報（ゴールド系） ===== */}
          <div style={{border:"1px solid rgba(201,168,76,0.45)",borderRadius:8,marginBottom:"1.25rem",overflow:"hidden"}}>
            <div style={{background:"rgba(201,168,76,0.12)",borderBottom:"1px solid rgba(201,168,76,0.3)",padding:".55rem 1rem",display:"flex",alignItems:"center",gap:".5rem"}}>
              <span style={{color:"#c9a84c",fontFamily:"Georgia,serif",fontSize:".82rem",letterSpacing:".15em",fontWeight:600}}>📋 基本情報</span>
            </div>
            <div style={{padding:"1rem 1.1rem",background:"rgba(201,168,76,0.03)"}}>
              <div style={S.fgrid} className="hb-form-grid">
                <Field label="日程"><input type="date" style={S.inp} value={form.date} onChange={e=>setField("date",e.target.value)}/></Field>
                <Field label="曜日"><input style={{...S.inp,color:"rgba(201,168,76,0.6)"}} value={form.day} readOnly placeholder="自動入力"/></Field>
                <Field label="イベント名" full><input style={S.inp} value={form.name} onChange={e=>setField("name",e.target.value)} placeholder="例：Jazz Night Premium"/></Field>
                <Field label="開場時間"><input type="time" style={S.inp} value={form.open} onChange={e=>setField("open",e.target.value)}/></Field>
                <Field label="開演時間"><input type="time" style={S.inp} value={form.start} onChange={e=>setField("start",e.target.value)}/></Field>
                <Field label="料金" full><input style={S.inp} value={form.price} onChange={e=>setField("price",e.target.value)} placeholder="例：¥3,000（1ドリンク付）"/></Field>
                <Field label="出演者" full><input style={S.inp} value={form.perf} onChange={e=>setField("perf",e.target.value)} placeholder="例：山田太郎（Gt）/ 田中花子（Vo）"/></Field>
                <Field label="定員（予約フォーム用）">
                  <select style={S.inp} value={form.cap} onChange={e=>setField("cap",e.target.value)}>
                    <option value="">指定なし</option>
                    {[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80].map(n=><option key={n} value={n}>{n}名</option>)}
                  </select>
                </Field>
                <Field label="ジャンル（SEO用）"><input style={S.inp} value={form.genre} onChange={e=>setField("genre",e.target.value)} placeholder="例：ジャズ / ロック"/></Field>
              </div>
            </div>
          </div>

          {/* ===== ブロック2: 予約・運営（オレンジ系） ===== */}
          <div style={{border:"1px solid rgba(244,162,97,0.45)",borderRadius:8,marginBottom:"1.25rem",overflow:"hidden"}}>
            <div style={{background:"rgba(244,162,97,0.1)",borderBottom:"1px solid rgba(244,162,97,0.3)",padding:".55rem 1rem"}}>
              <span style={{color:"#f4a261",fontFamily:"Georgia,serif",fontSize:".82rem",letterSpacing:".15em",fontWeight:600}}>🛡 予約・運営（スタッフ向け）</span>
            </div>
            <div style={{padding:"1rem 1.1rem",background:"rgba(244,162,97,0.02)"}}>
              <div style={S.fgrid} className="hb-form-grid">
                {/* 予約フラグ */}
                <Field label="🎟 予約設定" full>
                  <label style={{display:"flex",alignItems:"center",gap:".5rem",cursor:"pointer",fontSize:".85rem",padding:".4rem 0",color:form.noBooking?"#e24b4a":"rgba(240,232,208,0.7)"}}>
                    <input type="checkbox" checked={!!form.noBooking} onChange={e=>setField("noBooking",e.target.checked)} style={{accentColor:"#e24b4a",width:18,height:18}}/>
                    🚫 予約不可（ソールドアウト・外部販売・貸切等。お客様の予約フォームでこのイベントは選べなくなります）
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:".5rem",cursor:"pointer",fontSize:".85rem",padding:".4rem 0",color:form.seatable!==false?"#7ec87e":"rgba(240,232,208,0.55)"}}>
                    <input type="checkbox" checked={form.seatable!==false} onChange={e=>setField("seatable",e.target.checked)} style={{accentColor:"#7ec87e",width:18,height:18}}/>
                    席指定可能（外すと「席指定不可」と予約フォームに表示）
                  </label>
                </Field>
                {/* 撮影・喫煙 */}
                <Field label="📸 撮影 / 🚬 喫煙の可否（未設定なら表示しません）" full>
                  <div style={{display:"flex",gap:"1.5rem",flexWrap:"wrap",padding:".3rem 0"}}>
                    <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                      <span style={{fontSize:".82rem",color:"rgba(240,232,208,0.85)",minWidth:80}}>📸 撮影</span>
                      {[{v:"unset",l:"未設定",c:"rgba(240,232,208,0.4)"},{v:"ok",l:"○ 可",c:"#7ec87e"},{v:"ng",l:"× 不可",c:"#e24b4a"}].map(o=>(
                        <button key={o.v} type="button" onClick={()=>setField("photoOk",o.v)} style={{padding:".3rem .65rem",borderRadius:3,border:`1px solid ${form.photoOk===o.v?o.c:"rgba(201,168,76,0.2)"}`,background:form.photoOk===o.v?`${o.c}25`:"transparent",color:form.photoOk===o.v?o.c:"rgba(240,232,208,0.55)",fontSize:".7rem",cursor:"pointer",fontFamily:"inherit"}}>{o.l}</button>
                      ))}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                      <span style={{fontSize:".82rem",color:"rgba(240,232,208,0.85)",minWidth:80}}>🚬 喫煙</span>
                      {[{v:"unset",l:"未設定",c:"rgba(240,232,208,0.4)"},{v:"ok",l:"○ 可",c:"#7ec87e"},{v:"ng",l:"× 不可",c:"#e24b4a"}].map(o=>(
                        <button key={o.v} type="button" onClick={()=>setField("smokeOk",o.v)} style={{padding:".3rem .65rem",borderRadius:3,border:`1px solid ${form.smokeOk===o.v?o.c:"rgba(201,168,76,0.2)"}`,background:form.smokeOk===o.v?`${o.c}25`:"transparent",color:form.smokeOk===o.v?o.c:"rgba(240,232,208,0.55)",fontSize:".7rem",cursor:"pointer",fontFamily:"inherit"}}>{o.l}</button>
                      ))}
                    </div>
                  </div>
                </Field>
                <Field label="注意事項（スタッフ向け）" full><textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={2} value={form.notes} onChange={e=>setField("notes",e.target.value)} placeholder="未成年者入場不可 / etc."/></Field>
                <Field label="💰 ギャラ条件等（スタッフ内部用）" full>
                  <textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={2} value={form.galleryNote||""} onChange={e=>setField("galleryNote",e.target.value)} placeholder="例：歩合50%・最低保証3万 / 固定2万 など"/>
                </Field>
                <Field label="📌 備考（スタッフ内部用）" full>
                  <textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={2} value={form.remark||""} onChange={e=>setField("remark",e.target.value)} placeholder="例：前日仕込みあり / 機材持ち込み など"/>
                </Field>
                <Field label="バンド入り時間（リハ）"><input style={S.inp} value={form.rehearsal} onChange={e=>setField("rehearsal",e.target.value)} placeholder="例：17:00"/></Field>
              </div>
            </div>
          </div>

          {/* ===== ブロック3: お客様向け公開情報（ブルー系） ===== */}
          <div style={{border:"1px solid rgba(126,200,227,0.4)",borderRadius:8,marginBottom:"1.25rem",overflow:"hidden"}}>
            <div style={{background:"rgba(126,200,227,0.08)",borderBottom:"1px solid rgba(126,200,227,0.25)",padding:".55rem 1rem"}}>
              <span style={{color:"#7ec8e3",fontFamily:"Georgia,serif",fontSize:".82rem",letterSpacing:".15em",fontWeight:600}}>🌐 お客様向け公開情報</span>
            </div>
            <div style={{padding:"1rem 1.1rem",background:"rgba(126,200,227,0.01)"}}>
              <div style={S.fgrid} className="hb-form-grid">
                <Field label="🖼 ポスター URL（Google Drive等）" full>
                  <input style={S.inp} value={form.poster} onChange={e=>setField("poster",e.target.value)} placeholder="https://drive.google.com/..."/>
                  {form.poster&&(
                    <a href={form.poster} target="_blank" rel="noreferrer" style={{display:"block",textAlign:"center",background:"#0f0f0f",border:"1px solid rgba(126,200,227,0.15)",borderRadius:6,padding:".75rem",textDecoration:"none",marginTop:".5rem"}}>
                      <img src={gdriveDirectUrl(form.poster)} alt="ポスター" style={{maxWidth:"100%",maxHeight:280,borderRadius:4,display:"block",margin:"0 auto"}} onError={(e)=>{e.target.style.display="none";e.target.nextSibling.style.display="block";}}/>
                      <div style={{display:"none",color:"#7ec8e3",fontSize:".8rem",padding:"1rem"}}>🖼 ポスターを開く（プレビュー読み込み失敗 - クリックで開く）</div>
                      <div style={{color:"rgba(126,200,227,0.5)",fontSize:".68rem",marginTop:".5rem",letterSpacing:".1em"}}>クリックで原寸表示</div>
                    </a>
                  )}
                </Field>
                <Field label="予約URL" full><input type="url" style={S.inp} value={form.url} onChange={e=>setField("url",e.target.value)} placeholder="https://..."/></Field>
                <Field label="📋 予約フォーム用 注意事項（お客様向け）" full>
                  <textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={2} value={form.reserveNotes||""} onChange={e=>setField("reserveNotes",e.target.value)} placeholder="例：お席は先着順とさせていただきます / 飲食代は別途お願いします など"/>
                </Field>
                <Field label="📷 イベント関連画像（最大5枚）" full>
                  <ImageUploader images={Array.isArray(form.images)?form.images:[]} maxCount={5} onChange={(imgs)=>setField("images",imgs)}/>
                  <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.4)",marginTop:".4rem",lineHeight:1.5}}>
                    アップロードした画像は「本日の営業」画面でも表示されます。対応：JPG / PNG / GIF / WebP（1枚あたり最大5MB目安）
                  </div>
                </Field>
                <Field label="イベント説明" full>
                  <textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={4} value={form.desc} onChange={e=>setField("desc",e.target.value)} placeholder="イベントの雰囲気・内容"/>
                </Field>
                {form.timetable&&<Field label="タイムテーブル" full><a href={form.timetable} target="_blank" rel="noreferrer" style={{color:"#7ec8e3",fontSize:".8rem"}}>📋 タイムテーブルを開く</a></Field>}
                <Field label="📝 参考情報（AI用・任意）" full>
                  <textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={3} value={form.reference} onChange={e=>setField("reference",e.target.value)} placeholder="出演者のプロフィール・SNSの紹介文・経歴など、ネットで調べた情報をここに貼り付けるとAIが説明文に活かしてくれます"/>
                </Field>
              </div>
            </div>
          </div>

          {/* ===== ブロック4: AI文章生成（グリーン系） ===== */}
          <div style={{border:"1px solid rgba(126,200,126,0.4)",borderRadius:8,marginBottom:"1.25rem",overflow:"hidden"}}>
            <div style={{background:"rgba(126,200,126,0.08)",borderBottom:"1px solid rgba(126,200,126,0.25)",padding:".55rem 1rem",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:".5rem"}}>
              <span style={{color:"#7ec87e",fontFamily:"Georgia,serif",fontSize:".82rem",letterSpacing:".15em",fontWeight:600}}>✨ AI文章生成</span>
              <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
                <button style={{...S.btn("ghost"),padding:".35rem .8rem",fontSize:".72rem",borderColor:"rgba(126,200,126,0.35)",color:"#7ec87e"}} onClick={handleGenerate}>✦ AIで文章を生成</button>
                <button style={{...S.btn("ghost"),padding:".35rem .8rem",fontSize:".72rem",borderColor:"rgba(126,200,126,0.25)",color:"rgba(126,200,126,0.7)"}} onClick={()=>{setTplName(form.name);setShowTplModal(true);}}>⭐ テンプレ保存</button>
                <button style={{...S.btn("ghost"),padding:".35rem .8rem",fontSize:".72rem",borderColor:"rgba(201,168,76,0.25)",color:"rgba(201,168,76,0.7)"}} onClick={handleAIDesc} disabled={aiLoading}>
                  {aiLoading?"⏳ 生成中...":(form.poster?"📄 説明文AI生成（ポスター読込）":"📄 説明文だけAI生成")}
                </button>
              </div>
            </div>
            <div style={{padding:"1rem 1.1rem",background:"rgba(126,200,126,0.01)"}}>
              {aiError&&<div style={{fontSize:".68rem",color:"#e24b4a",marginBottom:".75rem"}}>{aiError}</div>}
              <div style={{display:"flex",gap:".35rem",marginBottom:"1rem",flexWrap:"wrap"}}>
                {OUTPUT_TABS.map(t=>(<button key={t.key} style={S.outTab(activeOut===t.key)} onClick={()=>setActiveOut(t.key)}>{t.label}</button>))}
              </div>
              {!outputs&&activeOut!=="tt"&&<div style={{textAlign:"center",padding:"2rem 1rem",color:"rgba(240,232,208,0.2)",fontSize:".8rem"}}>「AIで文章を生成」を押してください 🍯</div>}
              {outputs&&activeOut!=="wix"&&activeOut!=="flyer"&&(
                <div style={{position:"relative"}}>
                  <div style={S.outTxt}>{currentOut}</div>
                  <button style={S.cpyBtn} onClick={()=>copyText(currentOut,activeOut)}>{copied===activeOut?"✓ 完了":"コピー"}</button>
                  {activeOut==="ig"&&<div style={{fontSize:".62rem",color:"rgba(201,168,76,0.4)",textAlign:"right",marginTop:".25rem"}}>文字数：{currentOut.length}（目安：2,200字以内）</div>}
                </div>
              )}
              {outputs&&activeOut==="wix"&&(
                <div>
                  <div style={{fontSize:".7rem",color:"#7ec8e3",marginBottom:"1rem",padding:".5rem .75rem",background:"rgba(126,200,227,0.06)",borderRadius:4,borderLeft:"2px solid rgba(126,200,227,0.4)"}}>🌐 Wixサイト更新用テキスト</div>
                  {WIX_SECTIONS.map(sec=>(
                    <div key={sec.key} style={{marginBottom:"1.25rem"}}>
                      <div style={S.wixLbl}><span>{sec.label}</span><button style={S.wixCpy(copied===sec.key)} onClick={()=>copyText(outputs[sec.key],sec.key)}>{copied===sec.key?"✓ 完了":"コピー"}</button></div>
                      <div style={S.wixTxt}>{outputs[sec.key]}</div>
                      {sec.note&&<div style={{fontSize:".62rem",color:"rgba(126,200,227,0.4)",textAlign:"right",marginTop:".2rem"}}>{sec.note(outputs[sec.key])}</div>}
                    </div>
                  ))}
                </div>
              )}
              {outputs&&activeOut==="flyer"&&(<FlyerTab outputs={outputs} copied={copied} copyText={copyText}/>)}
              {activeOut==="tt"&&(<TimeTableTab form={form} copyText={copyText} copied={copied}/>)}
            </div>
          </div>

          {/* ===== Sticky保存バー ===== */}
          <div style={{position:"fixed",bottom:0,left:0,width:"100%",zIndex:60,background:"rgba(10,10,10,0.97)",borderTop:"1px solid rgba(201,168,76,0.25)",padding:".75rem 2rem",display:"flex",gap:".75rem",alignItems:"center",flexWrap:"wrap",backdropFilter:"blur(8px)"}}>
            <button style={{...S.btn("gold"),fontSize:".9rem",padding:".65rem 2rem",fontWeight:700,boxShadow:"0 2px 16px rgba(201,168,76,0.4)",letterSpacing:".08em"}} onClick={handleSaveEvent}>💾 保存する</button>
            <button style={{...S.btn("ghost"),padding:".55rem 1rem"}} onClick={navigateBack}>← キャンセル</button>
            <button style={{...S.btn("sm"),padding:".45rem .9rem"}} onClick={clearForm}>クリア</button>
            {editingIdx!==null&&(
              <button style={{...S.btn("sm"),borderColor:"rgba(126,200,227,0.3)",color:"#7ec8e3",padding:".45rem .9rem"}} onClick={()=>handleConvertToRental(editingIdx)}>🍽 貸切に変換</button>
            )}
            {editingIdx!==null&&(
              <button style={{...S.btn("danger"),padding:".45rem .9rem",marginLeft:"auto"}} onClick={()=>{
                if(!window.confirm(`「${form.name}」を削除しますか？`))return;
                deleteEvent(editingIdx);
                navigateBack();
              }}>🗑 このイベントを削除</button>
            )}
          </div>
        </div>
      )}

      {showEventTrash&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>setShowEventTrash(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",maxWidth:600,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".15em"}}>🗑 イベントのゴミ箱</div>
              <button style={S.btn("sm")} onClick={()=>setShowEventTrash(false)}>閉じる</button>
            </div>
            <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.5)",marginBottom:"1rem",lineHeight:1.6}}>
              削除されたイベントは30日間保持され、その後自動で完全削除されます。
            </div>
            {trashEvents.length===0?(
              <div style={{textAlign:"center",padding:"2rem",color:"rgba(240,232,208,0.3)",fontSize:".85rem"}}>
                ゴミ箱は空です
              </div>
            ):trashEvents.sort((a,b)=>(b._deletedAt||0)-(a._deletedAt||0)).map(ev=>{
              const daysLeft = ev._deletedAt ? Math.max(0,Math.ceil(30 - (Date.now()-ev._deletedAt)/(24*60*60*1000))) : 30;
              return (
                <div key={ev._id} style={{padding:".75rem 1rem",background:"#111",borderRadius:5,marginBottom:".5rem",display:"grid",gridTemplateColumns:"1fr auto",gap:".5rem",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:".88rem",marginBottom:".2rem"}}>{ev.name||"（無題）"}</div>
                    <div style={{fontSize:".65rem",color:"rgba(240,232,208,0.4)",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                      {ev.date&&<span>📅 {ev.date}</span>}
                      <span>削除：{ev._deletedAt?new Date(ev._deletedAt).toLocaleDateString("ja-JP"):""}</span>
                      <span style={{color:daysLeft<7?"#f4a261":"rgba(240,232,208,0.5)"}}>あと{daysLeft}日</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:".4rem"}}>
                    <button style={{...S.btn("sm"),borderColor:"rgba(126,200,127,0.4)",color:"#7ec87e"}} onClick={()=>restoreEvent(ev._id)}>↩ 復元</button>
                    <button style={S.btn("danger")} onClick={()=>purgeEvent(ev._id)}>完全削除</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showApiModal&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#111",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",width:420,maxWidth:"90%"}}>
            <div style={{fontFamily:"Georgia,serif",fontSize:".95rem",color:"#c9a84c",marginBottom:".75rem"}}>🔑 OpenAI APIキー設定</div>
            <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.55)",marginBottom:".75rem",lineHeight:1.6}}>
              AI説明文生成にOpenAI APIキーが必要です。<br/>
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" style={{color:"#c9a84c"}}>https://platform.openai.com/api-keys</a> から取得してください。
            </div>
            <label style={S.lbl}>APIキー（sk-... で始まる）</label>
            <input type="password" style={{...S.inp,marginTop:".3rem",marginBottom:".4rem",fontFamily:"monospace",fontSize:".75rem"}} value={tempApiKey} onChange={e=>setTempApiKey(e.target.value)} placeholder="sk-proj-..."/>
            <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.4)",marginBottom:".75rem"}}>
              ※ キーはこのブラウザのみに保存され、外部には送信されません
            </div>
            <div style={{display:"flex",gap:".5rem"}}>
              <button style={S.btn("gold")} onClick={saveApiKey}>保存</button>
              <button style={S.btn("ghost")} onClick={()=>{setShowApiModal(false);setTempApiKey("");}}>キャンセル</button>
              {apiKey&&<button style={S.btn("danger")} onClick={()=>{if(window.confirm("APIキーを削除しますか？")){localStorage.removeItem("hb-openai-key");setApiKey("");setShowApiModal(false);}}}>削除</button>}
            </div>
          </div>
        </div>
      )}

      {showTplModal&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.8)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#111",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",width:340}}>
            <div style={{fontFamily:"Georgia,serif",fontSize:".9rem",color:"#c9a84c",marginBottom:"1rem"}}>⭐ テンプレートとして保存</div>
            <label style={S.lbl}>テンプレート名</label>
            <input style={{...S.inp,marginTop:".35rem",marginBottom:".75rem"}} value={tplName} onChange={e=>setTplName(e.target.value)} placeholder="例：定期ジャズナイト"/>
            <div style={{display:"flex",gap:".5rem"}}>
              <button style={S.btn("gold")} onClick={handleSaveTpl}>保存</button>
              <button style={S.btn("ghost")} onClick={()=>setShowTplModal(false)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
