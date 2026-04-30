import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

const S = {
  card: { background:"#111", border:"1px solid rgba(201,168,76,0.1)", borderRadius:6, padding:"1rem 1.25rem", marginBottom:".75rem" },
  inp: { background:"#111", border:"1px solid rgba(201,168,76,0.14)", borderRadius:4, color:"#f0e8d0", fontFamily:"inherit", fontSize:".85rem", padding:".5rem .65rem", outline:"none", width:"100%" },
  btn: (v) => {
    const b = { padding:".5rem 1rem", borderRadius:4, fontFamily:"inherit", fontSize:".72rem", fontWeight:500, letterSpacing:".12em", textTransform:"uppercase", cursor:"pointer", border:"none" };
    if (v==="gold") return { ...b, background:"#c9a84c", color:"#0a0a0a" };
    if (v==="ghost") return { ...b, background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)" };
    if (v==="danger") return { ...b, background:"transparent", color:"#e24b4a", border:"1px solid rgba(226,75,74,0.27)" };
    if (v==="sm") return { ...b, padding:".3rem .65rem", fontSize:".62rem", background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)" };
    return b;
  },
  lbl: { fontSize:".65rem", letterSpacing:".12em", textTransform:"uppercase", color:"rgba(201,168,76,0.6)", fontWeight:500, display:"block", marginBottom:".28rem" },
};

// レイアウトのデータ構造:
// {
//   _id: "layout_xxx",
//   name: "通常配置",
//   bgImage: "data:image/...",  // base64エンコード（小さい画像のみ）
//   seats: [
//     { id: "s_001", number: "A1", x: 100, y: 50, width: 60, height: 60, capacity: 4, label: "" },
//   ],
//   createdAt: ...,
// }

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// 席のデフォルトサイズ
const DEFAULT_SEAT_SIZE = 50;

// 座席カラー（割当状態）
function getSeatColor(state) {
  switch(state) {
    case "arrived": return { bg: "rgba(126,200,227,0.4)", border: "#7ec8e3", text: "#0a0a0a" };  // 青
    case "reserved": return { bg: "rgba(244,162,97,0.4)", border: "#f4a261", text: "#0a0a0a" };  // 黄
    case "blocked": return { bg: "rgba(102,102,102,0.3)", border: "#666", text: "#888" };  // グレー
    default: return { bg: "rgba(126,200,127,0.15)", border: "#7ec87e", text: "#7ec87e" };  // 緑（空席）
  }
}

// 当該席の状態を計算（その日の予約から、複数席対応）
function getSeatStateForDate(seatNumber, reservations, dateKey) {
  const r = reservations.find(r => {
    if (r.date !== dateKey || r._deleted) return false;
    const seats = (r.seatNumber || "").split(",").map(s => s.trim()).filter(Boolean);
    return seats.includes(seatNumber);
  });
  if (!r) return { state: "empty", reservation: null };
  return { state: r.arrived ? "arrived" : "reserved", reservation: r };
}

// 「通常」を含むレイアウトを基本レイアウトとして判定
export function isDefaultLayout(layout) {
  if (!layout || !layout.name) return false;
  return layout.name.includes("通常");
}

// 「通常」を含む最初のレイアウトを取得
export function getDefaultLayout(layouts) {
  return layouts.find(l => isDefaultLayout(l)) || layouts[0] || null;
}

// レイアウトの新規作成
function newLayout(name = "新規レイアウト") {
  return {
    name,
    bgImage: "",
    seats: [],
    createdAt: Date.now(),
  };
}

export default function SeatLayoutModule({ navigateBack, reservations = [], onBackToReservation }) {
  const [layouts, setLayouts] = useState([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [draftLayout, setDraftLayout] = useState(null); // 編集中のレイアウト
  const [draggingSeatId, setDraggingSeatId] = useState(null);
  const [dragOffset, setDragOffset] = useState({x:0, y:0});
  const [viewDate, setViewDate] = useState(new Date().toISOString().split("T")[0]);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "seatLayouts"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      setLayouts(list);
      if (list.length > 0 && !selectedLayoutId) {
        setSelectedLayoutId(list[0]._id);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentLayout = editMode ? draftLayout : layouts.find(l => l._id === selectedLayoutId);

  // ===== 編集系 =====
  const startNewLayout = () => {
    setDraftLayout(newLayout());
    setEditMode(true);
  };

  const startEditLayout = () => {
    if (!currentLayout) return;
    setDraftLayout({...currentLayout, seats:[...(currentLayout.seats||[])]});
    setEditMode(true);
  };

  const saveDraftLayout = async () => {
    if (!draftLayout) return;
    if (!draftLayout.name.trim()) { alert("レイアウト名を入力してください"); return; }
    try {
      const id = draftLayout._id || `layout_${Date.now().toString(36)}`;
      const { _id, ...data } = draftLayout;
      await setDoc(doc(db, "seatLayouts", id), data);
      setSelectedLayoutId(id);
      setEditMode(false);
      setDraftLayout(null);
      alert("✓ レイアウトを保存しました");
    } catch (e) {
      alert("保存失敗：" + e.message);
    }
  };

  const cancelEdit = () => {
    if (window.confirm("編集中の変更を破棄しますか？")) {
      setEditMode(false);
      setDraftLayout(null);
    }
  };

  const deleteLayout = async () => {
    if (!currentLayout) return;
    if (!window.confirm(`レイアウト「${currentLayout.name}」を削除しますか？`)) return;
    await deleteDoc(doc(db, "seatLayouts", currentLayout._id));
    setSelectedLayoutId("");
  };

  // 席追加（前回の席のサイズ・定員を引き継ぐ）
  const addSeat = () => {
    const seats = draftLayout.seats || [];
    const lastSeat = seats.length > 0 ? seats[seats.length - 1] : null;
    const inheritedSize = lastSeat?.width || DEFAULT_SEAT_SIZE;
    const inheritedHeight = lastSeat?.height || DEFAULT_SEAT_SIZE;
    const inheritedCapacity = lastSeat?.capacity || 4;
    const newSeat = {
      id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,5)}`,
      number: `${seats.length + 1}`,
      x: lastSeat ? Math.min(CANVAS_WIDTH - inheritedSize, lastSeat.x + inheritedSize + 10) : 50,
      y: lastSeat ? lastSeat.y : 50,
      width: inheritedSize,
      height: inheritedHeight,
      capacity: inheritedCapacity,
    };
    setDraftLayout({...draftLayout, seats: [...seats, newSeat]});
  };

  // 席を複製（既存の席をコピー）
  const duplicateSeat = (id) => {
    const seats = draftLayout.seats || [];
    const original = seats.find(s => s.id === id);
    if (!original) return;
    const newSeat = {
      ...original,
      id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,5)}`,
      number: `${original.number}'`,
      x: Math.min(CANVAS_WIDTH - (original.width||DEFAULT_SEAT_SIZE), original.x + (original.width||DEFAULT_SEAT_SIZE) + 10),
      y: original.y,
    };
    setDraftLayout({...draftLayout, seats: [...seats, newSeat]});
    setEditingSeatId(newSeat.id); // 複製後、新しい席を編集モードに（席番号変えるため）
  };

  const updateSeat = (id, updates) => {
    setDraftLayout(d => ({
      ...d,
      seats: (d.seats||[]).map(s => s.id === id ? {...s, ...updates} : s),
    }));
  };

  const removeSeat = (id) => {
    setDraftLayout(d => ({
      ...d,
      seats: (d.seats||[]).filter(s => s.id !== id),
    }));
  };

  // 背景画像アップロード
  const handleBgUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("画像が大きすぎます（2MB以下にしてください）");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setDraftLayout(d => ({...d, bgImage: ev.target.result}));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ===== ドラッグ操作 =====
  const onSeatMouseDown = (e, seat) => {
    if (!editMode) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / zoom;
    const cy = (e.clientY - rect.top) / zoom;
    setDraggingSeatId(seat.id);
    setDragOffset({x: cx - seat.x, y: cy - seat.y});
  };

  const onCanvasMouseMove = (e) => {
    if (!draggingSeatId) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / zoom;
    const cy = (e.clientY - rect.top) / zoom;
    const newX = Math.max(0, Math.min(CANVAS_WIDTH - DEFAULT_SEAT_SIZE, cx - dragOffset.x));
    const newY = Math.max(0, Math.min(CANVAS_HEIGHT - DEFAULT_SEAT_SIZE, cy - dragOffset.y));
    updateSeat(draggingSeatId, { x: newX, y: newY });
  };

  const onCanvasMouseUp = () => {
    setDraggingSeatId(null);
  };

  // タッチ対応
  const onSeatTouchStart = (e, seat) => {
    if (!editMode) return;
    const t = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = (t.clientX - rect.left) / zoom;
    const cy = (t.clientY - rect.top) / zoom;
    setDraggingSeatId(seat.id);
    setDragOffset({x: cx - seat.x, y: cy - seat.y});
  };

  const onCanvasTouchMove = (e) => {
    if (!draggingSeatId) return;
    e.preventDefault();
    const t = e.touches[0];
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = (t.clientX - rect.left) / zoom;
    const cy = (t.clientY - rect.top) / zoom;
    const newX = Math.max(0, Math.min(CANVAS_WIDTH - DEFAULT_SEAT_SIZE, cx - dragOffset.x));
    const newY = Math.max(0, Math.min(CANVAS_HEIGHT - DEFAULT_SEAT_SIZE, cy - dragOffset.y));
    updateSeat(draggingSeatId, { x: newX, y: newY });
  };

  const onCanvasTouchEnd = () => setDraggingSeatId(null);

  // 席編集ポップアップ
  const [editingSeatId, setEditingSeatId] = useState(null);
  const editingSeat = editingSeatId && currentLayout ? (currentLayout.seats||[]).find(s => s.id === editingSeatId) : null;

  // ===== 表示用：その日の予約から各席の状態を取得 =====
  const seatStates = (() => {
    if (!currentLayout) return {};
    const states = {};
    (currentLayout.seats||[]).forEach(s => {
      states[s.number] = getSeatStateForDate(s.number, reservations, viewDate);
    });
    return states;
  })();

  // 統計
  const stats = (() => {
    if (!currentLayout) return null;
    const seats = currentLayout.seats || [];
    const total = seats.length;
    let reserved = 0, arrived = 0;
    seats.forEach(s => {
      const st = seatStates[s.number];
      if (st && st.state === "reserved") reserved++;
      else if (st && st.state === "arrived") arrived++;
    });
    return { total, reserved, arrived, empty: total - reserved - arrived };
  })();

  return (
    <div style={{padding:"1.5rem 2rem",maxWidth:1200,margin:"0 auto"}} className="hb-view">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:".5rem"}}>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem",color:"#c9a84c",letterSpacing:".15em",margin:0}}>🪑 席レイアウト</h2>
        <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
          {onBackToReservation && (
            <button style={S.btn("ghost")} onClick={onBackToReservation}>← 予約管理に戻る</button>
          )}
        </div>
      </div>

      {/* レイアウト選択 */}
      {!editMode && (
        <div style={{padding:"1rem 1.1rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.1)",borderRadius:6,marginBottom:"1rem"}}>
          <div style={{display:"flex",gap:".5rem",alignItems:"center",flexWrap:"wrap",marginBottom:".5rem"}}>
            <span style={{fontSize:".68rem",color:"rgba(201,168,76,0.6)",letterSpacing:".15em"}}>レイアウト：</span>
            {layouts.length === 0 ? (
              <span style={{fontSize:".75rem",color:"rgba(240,232,208,0.4)"}}>まだレイアウトがありません</span>
            ) : (
              <select style={{...S.inp,maxWidth:240,padding:".4rem .6rem"}} value={selectedLayoutId} onChange={e=>setSelectedLayoutId(e.target.value)}>
                {layouts.map(l => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
            )}
            <button style={S.btn("gold")} onClick={startNewLayout}>＋ 新規作成</button>
            {currentLayout && (
              <>
                <button style={S.btn("ghost")} onClick={startEditLayout}>✏️ 編集</button>
                <button style={S.btn("danger")} onClick={deleteLayout}>🗑 削除</button>
              </>
            )}
          </div>
          {currentLayout && (
            <div style={{display:"flex",gap:".5rem",alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:".68rem",color:"rgba(201,168,76,0.6)",letterSpacing:".15em"}}>表示日：</span>
              <input type="date" style={{...S.inp,maxWidth:170,padding:".4rem .6rem"}} value={viewDate} onChange={e=>setViewDate(e.target.value)}/>
            </div>
          )}
        </div>
      )}

      {/* 編集モード ヘッダー */}
      {editMode && draftLayout && (
        <div style={{padding:"1rem 1.1rem",background:"rgba(201,168,76,0.05)",border:"1px solid #c9a84c",borderRadius:6,marginBottom:"1rem"}}>
          <div style={{display:"flex",gap:".5rem",alignItems:"center",flexWrap:"wrap",marginBottom:".5rem"}}>
            <span style={{fontSize:".68rem",color:"#c9a84c",letterSpacing:".15em",fontWeight:600}}>📝 編集モード</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem",marginBottom:".5rem"}}>
            <div>
              <label style={S.lbl}>レイアウト名</label>
              <input style={S.inp} value={draftLayout.name} onChange={e=>setDraftLayout({...draftLayout, name: e.target.value})} placeholder="例：通常配置 / ライブ配置 / 貸切配置"/>
            </div>
            <div>
              <label style={S.lbl}>背景画像（任意・2MB以下）</label>
              <div style={{display:"flex",gap:".4rem",alignItems:"center"}}>
                <button style={{...S.btn("ghost"),padding:".4rem .7rem"}} onClick={()=>fileInputRef.current?.click()}>📷 画像アップロード</button>
                {draftLayout.bgImage && <button style={S.btn("danger")} onClick={()=>setDraftLayout({...draftLayout, bgImage:""})}>背景クリア</button>}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleBgUpload} style={{display:"none"}}/>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
            <button style={S.btn("gold")} onClick={addSeat}>＋ 席を追加</button>
            <button style={{...S.btn("gold"),background:"#7ec87e"}} onClick={saveDraftLayout}>💾 保存</button>
            <button style={S.btn("ghost")} onClick={cancelEdit}>キャンセル</button>
            <span style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginLeft:"auto",alignSelf:"center"}}>
              席をドラッグで移動 / タップで詳細編集
            </span>
          </div>
        </div>
      )}

      {/* キャンバス */}
      {currentLayout && (
        <div style={{position:"relative",overflowX:"auto",background:"#0a0a0a",border:"1px solid rgba(201,168,76,0.15)",borderRadius:6,padding:"1rem"}}>
          <div
            ref={canvasRef}
            style={{
              position:"relative",
              width: CANVAS_WIDTH,
              height: CANVAS_HEIGHT,
              background: currentLayout.bgImage ? `url(${currentLayout.bgImage}) center/contain no-repeat #1a1a1a` : "#1a1a1a",
              border: "1px dashed rgba(201,168,76,0.2)",
              margin: "0 auto",
              cursor: editMode && draggingSeatId ? "grabbing" : "default",
              userSelect: "none",
            }}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onMouseLeave={onCanvasMouseUp}
            onTouchMove={onCanvasTouchMove}
            onTouchEnd={onCanvasTouchEnd}
          >
            {/* 各席 */}
            {(currentLayout.seats||[]).map(seat => {
              const stateInfo = seatStates[seat.number] || { state: "empty", reservation: null };
              const colors = getSeatColor(stateInfo.state);
              return (
                <div
                  key={seat.id}
                  onMouseDown={(e)=>onSeatMouseDown(e, seat)}
                  onTouchStart={(e)=>onSeatTouchStart(e, seat)}
                  onClick={(e)=>{
                    e.stopPropagation();
                    if (editMode) {
                      setEditingSeatId(seat.id);
                    } else if (stateInfo.reservation) {
                      // 表示モード：予約者の詳細
                      alert(`席 ${seat.number}\n${stateInfo.reservation.customerName} 様\n${stateInfo.reservation.people}名\n${stateInfo.state==="arrived"?"✓ 来店済":"未来店"}${stateInfo.reservation.note?"\n備考: "+stateInfo.reservation.note:""}`);
                    }
                  }}
                  style={{
                    position:"absolute",
                    left: seat.x,
                    top: seat.y,
                    width: seat.width || DEFAULT_SEAT_SIZE,
                    height: seat.height || DEFAULT_SEAT_SIZE,
                    background: colors.bg,
                    border: `2px solid ${colors.border}`,
                    borderRadius: 6,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: editMode ? (draggingSeatId === seat.id ? "grabbing" : "grab") : (stateInfo.reservation ? "pointer" : "default"),
                    fontSize: ".75rem",
                    fontWeight: 600,
                    color: colors.text,
                    boxShadow: editMode && draggingSeatId === seat.id ? "0 0 12px rgba(201,168,76,0.6)" : "none",
                    transition: editMode ? "none" : "all 0.15s",
                  }}
                >
                  {/* 編集モード or 予約なし: 席番号を表示 */}
                  {(editMode || !stateInfo.reservation) && (
                    <div style={{fontSize:".82rem",lineHeight:1}}>{seat.number}</div>
                  )}
                  {/* 予約あり: 名前を大きく表示、席番号は小さく */}
                  {!editMode && stateInfo.reservation && (
                    <>
                      <div style={{fontSize:".5rem",lineHeight:1,opacity:0.55,marginBottom:"1px"}}>{seat.number}</div>
                      <div style={{
                        fontSize:".78rem",
                        fontWeight:700,
                        lineHeight:1.1,
                        overflow:"hidden",
                        textOverflow:"ellipsis",
                        whiteSpace:"nowrap",
                        maxWidth:"95%",
                        textAlign:"center",
                      }}>
                        {stateInfo.reservation.customerName}
                      </div>
                      <div style={{fontSize:".55rem",lineHeight:1.1,marginTop:"1px",opacity:0.85}}>{stateInfo.reservation.people}名</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 凡例 */}
      {currentLayout && !editMode && (
        <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",marginTop:".75rem",fontSize:".68rem",color:"rgba(240,232,208,0.6)"}}>
          <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:14,height:14,background:getSeatColor("empty").bg,border:`1px solid ${getSeatColor("empty").border}`,borderRadius:2}}/>空席</span>
          <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:14,height:14,background:getSeatColor("reserved").bg,border:`1px solid ${getSeatColor("reserved").border}`,borderRadius:2}}/>予約あり（未来店）</span>
          <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:14,height:14,background:getSeatColor("arrived").bg,border:`1px solid ${getSeatColor("arrived").border}`,borderRadius:2}}/>来店済</span>
        </div>
      )}

      {/* 席編集ポップアップ */}
      {editingSeat && editMode && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>setEditingSeatId(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",maxWidth:400,width:"100%"}}>
            <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".15em",marginBottom:"1rem"}}>🪑 席の編集</div>
            <div style={{marginBottom:".75rem"}}>
              <label style={S.lbl}>席番号</label>
              <input style={S.inp} value={editingSeat.number} onChange={e=>updateSeat(editingSeat.id, {number: e.target.value})} placeholder="A1, B2, T1, カウンター1 など"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".5rem",marginBottom:".75rem"}}>
              <div>
                <label style={S.lbl}>幅</label>
                <input type="number" style={S.inp} value={editingSeat.width||DEFAULT_SEAT_SIZE} onChange={e=>updateSeat(editingSeat.id, {width: Number(e.target.value)})}/>
              </div>
              <div>
                <label style={S.lbl}>高さ</label>
                <input type="number" style={S.inp} value={editingSeat.height||DEFAULT_SEAT_SIZE} onChange={e=>updateSeat(editingSeat.id, {height: Number(e.target.value)})}/>
              </div>
            </div>
            <div style={{marginBottom:"1rem"}}>
              <label style={S.lbl}>定員（任意）</label>
              <input type="number" style={S.inp} value={editingSeat.capacity||""} onChange={e=>updateSeat(editingSeat.id, {capacity: Number(e.target.value)})}/>
            </div>
            <div style={{display:"flex",gap:".5rem",justifyContent:"space-between",flexWrap:"wrap"}}>
              <button style={S.btn("danger")} onClick={()=>{
                if(window.confirm(`席 ${editingSeat.number} を削除しますか？`)){
                  removeSeat(editingSeat.id);
                  setEditingSeatId(null);
                }
              }}>🗑 削除</button>
              <button style={{...S.btn("ghost"),borderColor:"rgba(126,200,127,0.4)",color:"#7ec87e"}} onClick={()=>{
                duplicateSeat(editingSeat.id);
              }}>📋 複製</button>
              <button style={S.btn("gold")} onClick={()=>setEditingSeatId(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {layouts.length === 0 && !editMode && (
        <div style={{textAlign:"center",padding:"3rem",color:"rgba(240,232,208,0.3)",fontSize:".88rem"}}>
          まだレイアウトがありません<br/>
          上の「＋ 新規作成」からレイアウトを作成してください
        </div>
      )}
    </div>
  );
}

// ===== 日別レイアウト表示（予約管理画面に埋め込み用、読み取り専用） =====
export function DayLayoutView({ reservations, dateKey, layouts, selectedLayoutId, onLayoutChange }) {
  const [internalSelectedId, setInternalSelectedId] = useState("");
  const layoutId = selectedLayoutId || internalSelectedId;
  const layout = layouts.find(l => l._id === layoutId) || getDefaultLayout(layouts);

  useEffect(() => {
    if (!selectedLayoutId && !internalSelectedId && layouts.length > 0) {
      const def = getDefaultLayout(layouts);
      if (def) setInternalSelectedId(def._id);
    }
  }, [layouts, selectedLayoutId, internalSelectedId]);

  if (!layout) {
    return (
      <div style={{padding:"1.5rem",textAlign:"center",color:"rgba(240,232,208,0.4)",fontSize:".8rem"}}>
        レイアウトが登録されていません
      </div>
    );
  }

  const seatStates = {};
  (layout.seats||[]).forEach(s => {
    seatStates[s.number] = getSeatStateForDate(s.number, reservations, dateKey);
  });
  const total = (layout.seats||[]).length;
  let reserved = 0, arrived = 0;
  Object.values(seatStates).forEach(st => {
    if (st.state === "reserved") reserved++;
    else if (st.state === "arrived") arrived++;
  });

  return (
    <div>
      {/* レイアウト切替 */}
      <div style={{display:"flex",gap:".5rem",alignItems:"center",flexWrap:"wrap",marginBottom:".5rem"}}>
        <span style={{fontSize:".68rem",color:"rgba(201,168,76,0.6)",letterSpacing:".15em"}}>レイアウト：</span>
        <select
          style={{...S.inp,maxWidth:240,padding:".4rem .6rem"}}
          value={layoutId}
          onChange={e=>{
            if (onLayoutChange) onLayoutChange(e.target.value);
            else setInternalSelectedId(e.target.value);
          }}
        >
          {layouts.map(l => (
            <option key={l._id} value={l._id}>{l.name}{isDefaultLayout(l)?" ⭐":""}</option>
          ))}
        </select>
        <span style={{fontSize:".62rem",color:"rgba(240,232,208,0.55)"}}>
          全{total}席 / 🟢空 {total-reserved-arrived} / 🟡予約 {reserved} / 🔵来店 {arrived}
        </span>
      </div>

      {/* キャンバス（読み取り専用） */}
      <div style={{position:"relative",overflowX:"auto",background:"#0a0a0a",border:"1px solid rgba(201,168,76,0.15)",borderRadius:6,padding:"1rem"}} className="seat-layout-canvas">
        <div style={{
          position:"relative",
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          background: layout.bgImage ? `url(${layout.bgImage}) center/contain no-repeat #1a1a1a` : "#1a1a1a",
          border: "1px dashed rgba(201,168,76,0.2)",
          margin: "0 auto",
        }}>
          {(layout.seats||[]).map(seat => {
            const stateInfo = seatStates[seat.number] || { state: "empty", reservation: null };
            const colors = getSeatColor(stateInfo.state);
            return (
              <div
                key={seat.id}
                onClick={()=>{
                  if (stateInfo.reservation) {
                    alert(`席 ${seat.number}\n${stateInfo.reservation.customerName} 様\n${stateInfo.reservation.people}名\n${stateInfo.state==="arrived"?"✓ 来店済":"未来店"}${stateInfo.reservation.note?"\n備考: "+stateInfo.reservation.note:""}`);
                  }
                }}
                style={{
                  position:"absolute",
                  left: seat.x,
                  top: seat.y,
                  width: seat.width || DEFAULT_SEAT_SIZE,
                  height: seat.height || DEFAULT_SEAT_SIZE,
                  background: colors.bg,
                  border: `2px solid ${colors.border}`,
                  borderRadius: 6,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: stateInfo.reservation ? "pointer" : "default",
                  fontSize: ".75rem",
                  fontWeight: 600,
                  color: colors.text,
                }}
              >
                {!stateInfo.reservation && (
                  <div style={{fontSize:".82rem",lineHeight:1}}>{seat.number}</div>
                )}
                {stateInfo.reservation && (
                  <>
                    <div style={{fontSize:".5rem",lineHeight:1,opacity:0.55,marginBottom:"1px"}}>{seat.number}</div>
                    <div style={{
                      fontSize:".78rem",
                      fontWeight:700,
                      lineHeight:1.1,
                      overflow:"hidden",
                      textOverflow:"ellipsis",
                      whiteSpace:"nowrap",
                      maxWidth:"95%",
                      textAlign:"center",
                    }}>
                      {stateInfo.reservation.customerName}
                    </div>
                    <div style={{fontSize:".55rem",lineHeight:1.1,marginTop:"1px",opacity:0.85}}>{stateInfo.reservation.people}名</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",marginTop:".5rem",fontSize:".62rem",color:"rgba(240,232,208,0.55)"}}>
        <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:12,height:12,background:getSeatColor("empty").bg,border:`1px solid ${getSeatColor("empty").border}`,borderRadius:2}}/>空席</span>
        <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:12,height:12,background:getSeatColor("reserved").bg,border:`1px solid ${getSeatColor("reserved").border}`,borderRadius:2}}/>予約</span>
        <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:12,height:12,background:getSeatColor("arrived").bg,border:`1px solid ${getSeatColor("arrived").border}`,borderRadius:2}}/>来店</span>
      </div>
    </div>
  );
}

// ===== 席選択ポップアップ（予約画面から使う） =====
export function SeatPicker({ layoutId, reservations, currentDate, currentReservationId, currentSeats, onSelect, onClose }) {
  const [layouts, setLayouts] = useState([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState(layoutId || "");
  // 選択中の席（複数選択可）
  const initialSelected = (currentSeats || "").split(",").map(s => s.trim()).filter(Boolean);
  const [selected, setSelected] = useState(initialSelected);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "seatLayouts"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      setLayouts(list);
      if (list.length > 0 && !selectedLayoutId) {
        setSelectedLayoutId(list[0]._id);
      }
    });
    return () => unsub();
    // eslint-disable-next-line
  }, []);

  const currentLayout = layouts.find(l => l._id === selectedLayoutId);

  // 席をタップした時：選択 / 解除（既に選択中なら外す）
  const toggleSeat = (seatNumber, occupiedByOther) => {
    if (selected.includes(seatNumber)) {
      // 選択解除
      setSelected(selected.filter(s => s !== seatNumber));
    } else {
      if (occupiedByOther) {
        if (!window.confirm(`席 ${seatNumber} は ${occupiedByOther.customerName} 様 が予約中です。\n選択しますか？`)) return;
      }
      setSelected([...selected, seatNumber]);
    }
  };

  const confirmSelection = () => {
    onSelect(selected.join(", "));
    onClose();
  };

  const clearSelection = () => setSelected([]);

  return (
    <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.9)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",maxWidth:900,width:"100%",maxHeight:"95vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:".5rem"}}>
          <div style={{fontFamily:"Georgia,serif",fontSize:"1.1rem",color:"#c9a84c",letterSpacing:".15em"}}>🪑 席を選択</div>
          <button style={S.btn("sm")} onClick={onClose}>✕ キャンセル</button>
        </div>
        {layouts.length === 0 ? (
          <div style={{textAlign:"center",padding:"2rem",color:"rgba(240,232,208,0.4)"}}>
            まだレイアウトがありません。先に席レイアウトを作成してください。
          </div>
        ) : (
          <>
            <div style={{display:"flex",gap:".5rem",alignItems:"center",flexWrap:"wrap",marginBottom:".75rem"}}>
              <span style={{fontSize:".68rem",color:"rgba(201,168,76,0.6)",letterSpacing:".15em"}}>レイアウト：</span>
              <select style={{...S.inp,maxWidth:240,padding:".4rem .6rem"}} value={selectedLayoutId} onChange={e=>setSelectedLayoutId(e.target.value)}>
                {layouts.map(l => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
              <span style={{fontSize:".68rem",color:"rgba(240,232,208,0.5)"}}>
                {currentDate ? `表示日: ${currentDate}` : ""}
              </span>
            </div>

            {/* 選択中の席表示 */}
            <div style={{padding:".75rem 1rem",background:selected.length>0?"rgba(201,168,76,0.08)":"#0a0a0a",border:`1px solid ${selected.length>0?"#c9a84c":"rgba(201,168,76,0.15)"}`,borderRadius:5,marginBottom:".75rem"}}>
              <div style={{fontSize:".68rem",color:"#c9a84c",letterSpacing:".1em",marginBottom:".4rem"}}>
                選択中の席（{selected.length}席）
                {selected.length > 0 && (
                  <button style={{...S.btn("sm"),padding:".15rem .5rem",fontSize:".55rem",marginLeft:".5rem"}} onClick={clearSelection}>クリア</button>
                )}
              </div>
              {selected.length === 0 ? (
                <div style={{fontSize:".75rem",color:"rgba(240,232,208,0.4)"}}>席をタップで選択（複数選択可・もう一度タップで解除）</div>
              ) : (
                <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}}>
                  {selected.map((s,i) => (
                    <span key={i} style={{padding:".25rem .55rem",background:"#c9a84c",color:"#0a0a0a",borderRadius:3,fontSize:".75rem",fontWeight:600,display:"inline-flex",alignItems:"center",gap:".3rem"}}>
                      🪑 {s}
                      <button onClick={()=>toggleSeat(s)} style={{background:"transparent",border:"none",color:"#0a0a0a",cursor:"pointer",padding:0,fontSize:".75rem",fontWeight:700}}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {currentLayout && (
              <div style={{position:"relative",overflowX:"auto",background:"#0a0a0a",border:"1px solid rgba(201,168,76,0.15)",borderRadius:6,padding:"1rem"}}>
                <div style={{
                  position:"relative",
                  width: CANVAS_WIDTH,
                  height: CANVAS_HEIGHT,
                  background: currentLayout.bgImage ? `url(${currentLayout.bgImage}) center/contain no-repeat #1a1a1a` : "#1a1a1a",
                  border: "1px dashed rgba(201,168,76,0.2)",
                  margin: "0 auto",
                }}>
                  {(currentLayout.seats||[]).map(seat => {
                    const occupiedByOther = reservations.find(r =>
                      r.date === currentDate &&
                      (r.seatNumber || "").split(",").map(s=>s.trim()).includes(seat.number) &&
                      !r._deleted &&
                      r._id !== currentReservationId
                    );
                    const isSelected = selected.includes(seat.number);
                    let stateInfo;
                    if (isSelected) {
                      stateInfo = { state: "selected", reservation: null };
                    } else if (occupiedByOther) {
                      stateInfo = { state: occupiedByOther.arrived ? "arrived" : "reserved", reservation: occupiedByOther };
                    } else {
                      stateInfo = { state: "empty", reservation: null };
                    }
                    let bg, border, text;
                    if (isSelected) { bg = "#c9a84c"; border = "#fff"; text = "#0a0a0a"; }
                    else { const c = getSeatColor(stateInfo.state); bg = c.bg; border = c.border; text = c.text; }
                    return (
                      <div
                        key={seat.id}
                        onClick={() => toggleSeat(seat.number, occupiedByOther)}
                        style={{
                          position:"absolute",
                          left: seat.x,
                          top: seat.y,
                          width: seat.width || DEFAULT_SEAT_SIZE,
                          height: seat.height || DEFAULT_SEAT_SIZE,
                          background: bg,
                          border: `2px solid ${border}`,
                          borderRadius: 6,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: ".75rem",
                          fontWeight: 600,
                          color: text,
                          boxShadow: isSelected ? "0 0 12px rgba(201,168,76,0.7)" : "none",
                          transition: "all 0.15s",
                          userSelect:"none",
                        }}
                      >
                        <div style={{fontSize:".82rem",lineHeight:1}}>{seat.number}</div>
                        {stateInfo.reservation && !isSelected && (
                          <div style={{fontSize:".5rem",lineHeight:1.1,maxWidth:"90%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {stateInfo.reservation.customerName}
                          </div>
                        )}
                        {isSelected && (
                          <div style={{fontSize:".55rem",lineHeight:1.1,fontWeight:700}}>✓ 選択中</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",marginTop:".75rem",fontSize:".65rem",color:"rgba(240,232,208,0.6)",justifyContent:"center"}}>
                  <span>🟢 空席（タップで選択）</span>
                  <span>🟨 選択中</span>
                  <span>🟡 予約あり</span>
                  <span>🔵 来店済</span>
                </div>
              </div>
            )}

            {/* 確定ボタン */}
            <div style={{display:"flex",gap:".5rem",justifyContent:"center",marginTop:"1rem",flexWrap:"wrap"}}>
              <button style={S.btn("ghost")} onClick={onClose}>キャンセル</button>
              <button
                style={{...S.btn("gold"),minWidth:200,opacity:selected.length===0?0.5:1}}
                disabled={selected.length===0}
                onClick={confirmSelection}
              >
                ✓ {selected.length}席を確定
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
