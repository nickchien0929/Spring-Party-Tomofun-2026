import { useState, useEffect, useRef, useCallback } from "react";

const DB_URL = "https://spring-party-scoring-default-rtdb.asia-southeast1.firebasedatabase.app";

const WANG_COLOR = "#E8845A";
const WANG_BG = "#FFF0E8";
const MIAO_COLOR = "#4FAFAF";
const MIAO_BG = "transparent"; // 喵喵隊無網底

const T = {
  wrap: "linear-gradient(135deg, #fdf4f0, #f8e8e0, #f5ddd8)",
  card: "#fefaf8",
  cardBorder: "#e8a898",
  h1: "#a05050",
  tab: "#c87868",
  tabText: "#fff",
  tabInactive: "#f8e0d8",
  tabInactiveText: "#a05050",
  th: "#b86858",
  score: "#a05050",
  inp: "#fdf4f0",
  inpBorder: "#e8a898",
  syncOk: "#4FAFAF",
  syncWarn: "#e8a030",
  syncErr: "#e05050",
  firstRowBg: "#FFF9DC", // 馬卡龍淡黃，第一名
  bonusColor: "#D4A000", // 加成黃色
};

const GROUPS = Array.from({ length: 11 }, (_, i) => ({
  id: i,
  name: `第${i}組`,
  team: i <= 4 ? "喵喵隊" : "汪汪隊",
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
    rankIndex++;
    i = j;
  }
  return result;
}

const TABS = ["遊戲一", "遊戲二", "遊戲三", "總排行榜"];
const initG1 = () => GROUPS.map((g) => ({ id: g.id, r1: "" }));
const initG2 = () => GROUPS.map((g) => ({ id: g.id, a: "", b: "" }));
const initG3 = () => GROUPS.map((g) => ({ id: g.id, rank: "" }));

export default function App() {
  const [tab, setTab] = useState(0);
  const [g1, setG1] = useState(initG1());
  const [g2, setG2] = useState(initG2());
  const [g3, setG3] = useState(initG3());
  const [showChampion, setShowChampion] = useState(false);
  const [syncStatus, setSyncStatus] = useState("connecting");
  const confettiRef = useRef(null);
  const esRef = useRef(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    const es = new EventSource(`${DB_URL}/scores.json?accept=text/event-stream`);
    esRef.current = es;
    es.addEventListener("put", (e) => {
      try {
        const payload = JSON.parse(e.data);
        const data = payload.data;
        if (!data) return;
        if (data.g1) setG1(data.g1);
        if (data.g2) setG2(data.g2);
        if (data.g3) setG3(data.g3);
        setSyncStatus("synced");
      } catch {}
    });
    es.addEventListener("patch", (e) => {
      try {
        const payload = JSON.parse(e.data);
        const data = payload.data;
        if (!data) return;
        if (data.g1) setG1(data.g1);
        if (data.g2) setG2(data.g2);
        if (data.g3) setG3(data.g3);
        setSyncStatus("synced");
      } catch {}
    });
    es.onerror = () => setSyncStatus("error");
    return () => es.close();
  }, []);

  const scheduleSave = useCallback((newG1, newG2, newG3) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        setSyncStatus("connecting");
        await fetch(`${DB_URL}/scores.json`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ g1: newG1, g2: newG2, g3: newG3 }),
        });
        setSyncStatus("synced");
      } catch {
        setSyncStatus("error");
      }
    }, 800);
  }, []);

  const updateG1 = (newG1) => { setG1(newG1); scheduleSave(newG1, g2, g3); };
  const updateG2 = (newG2) => { setG2(newG2); scheduleSave(g1, newG2, g3); };
  const updateG3 = (newG3) => { setG3(newG3); scheduleSave(g1, g2, newG3); };

  const g1Scores = (() => {
    const vals = g1.map((g) => ({ id: g.id, val: g.r1 !== "" ? parseFloat(g.r1) : null }));
    const ranked = getRankScores(vals, true);
    const result = {};
    vals.forEach((v) => {
      if (v.val === null) result[v.id] = null;
      else if (v.val === 0) result[v.id] = 0;
      else result[v.id] = ranked[v.id] ?? 0;
    });
    return result;
  })();

  const g2Scores = (() => {
    const vals = g2.map((g) => {
      const a = parseFloat(g.a), b = parseFloat(g.b);
      if (g.a === "" && g.b === "") return { id: g.id, val: null };
      const aErr = g.a !== "" ? Math.abs(a - 8) : 0;
      const bErr = g.b !== "" ? Math.abs(b - 10) : 0;
      return { id: g.id, val: Math.round((aErr + bErr) * 1000) / 1000 };
    });
    const ranked = getRankScores(vals, false);
    const result = {};
    vals.forEach((v) => { result[v.id] = v.val === null ? null : ranked[v.id] ?? 0; });
    return result;
  })();

  const g3Scores = (() => {
    const result = {};
    g3.forEach((g) => {
      const r = parseInt(g.rank);
      if (isNaN(r) || r < 1 || r > 11) { result[g.id] = null; return; }
      result[g.id] = Math.round((RANK_SCORES[r - 1] ?? 10) * 1.3);
    });
    return result;
  })();

  const totals = GROUPS.map((g) => {
    const s1 = g1Scores[g.id] ?? 0;
    const s2 = g2Scores[g.id] ?? 0;
    const s3 = g3Scores[g.id] ?? 0;
    return { id: g.id, s1, s2, s3, sum: s1 + s2 + s3 };
  });

  const miao = totals.filter((t) => t.id <= 4);
  const wang = totals.filter((t) => t.id >= 5);
  const miaoAvg = miao.reduce((a, b) => a + b.sum, 0) / 5;
  const wangAvg = wang.reduce((a, b) => a + b.sum, 0) / 6;
  const winnerTeam = miaoAvg > wangAvg ? "喵喵隊" : miaoAvg < wangAvg ? "汪汪隊" : null;

  const finalTotals = totals
    .map((t) => {
      const bonus = winnerTeam && GROUPS[t.id].team === winnerTeam ? 50 : 0;
      return { ...t, bonus, final: t.sum + bonus };
    })
    .sort((a, b) => b.final - a.final);

  useEffect(() => {
    if (!showChampion) return;
    let frame;
    const canvas = confettiRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      r: Math.random() * 8 + 4,
      d: Math.random() * 60 + 20,
      color: ["#e8a898","#4FAFAF","#E8845A","#f5c8b8","#a0d8d8","#FFF9DC"][Math.floor(Math.random() * 6)],
      tilt: Math.random() * 10 - 10,
      speed: Math.random() * 3 + 1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r, p.r / 2, p.tilt, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        p.y += p.speed;
        p.x += Math.sin(p.d / 10) * 1.5;
        p.d++;
        if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [showChampion]);

  const syncLabel = { connecting: "⏳ 同步中…", synced: "✅ 已同步", error: "❌ 同步失敗" };
  const syncColor = { connecting: T.syncWarn, synced: T.syncOk, error: T.syncErr };

  const S = {
    wrap: { minHeight: "100vh", background: T.wrap, padding: "12px", fontFamily: "sans-serif" },
    card: { background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: "16px", padding: "16px", boxShadow: "0 2px 8px rgba(160,80,80,0.08)", marginBottom: "12px" },
    th: { padding: "6px", color: T.th, fontSize: "11px", fontWeight: "600" },
    inp: { width: "56px", textAlign: "center", border: `1px solid ${T.inpBorder}`, borderRadius: "6px", padding: "3px 4px", fontSize: "13px", outline: "none", background: T.inp, color: T.h1 },
    score: { padding: "5px", textAlign: "center", fontWeight: "bold", color: T.score },
  };

  // 遊戲頁表格 row 背景：喵喵隊無網底，汪汪隊淡橘底
  const gameRowBg = (team) => team === "喵喵隊" ? "transparent" : WANG_BG;
  // 總排行 row 背景：第一名馬卡龍淡黃，喵喵隊無網底，汪汪隊淡橘底
  const rankRowBg = (rank, team) => {
    if (rank === 0) return T.firstRowBg;
    return team === "喵喵隊" ? "transparent" : WANG_BG;
  };

  const teamColor = (t) => t === "喵喵隊" ? MIAO_COLOR : WANG_COLOR;

  return (
    <div style={S.wrap}>
      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: "bold", color: T.h1, margin: "0 0 6px" }}>🎉 Tomofun春酒計分系統</h1>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", fontSize: "13px" }}>
          <span style={{ color: MIAO_COLOR, fontWeight: "600", background: "#E8F7F7", padding: "2px 10px", borderRadius: "999px" }}>🐱 喵喵隊 (第0~4組)</span>
          <span style={{ color: WANG_COLOR, fontWeight: "600", background: WANG_BG, padding: "2px 10px", borderRadius: "999px" }}>🐶 汪汪隊 (第5~10組)</span>
        </div>
        <div style={{ fontSize: "11px", color: syncColor[syncStatus], marginTop: "6px", fontWeight: "600" }}>
          {syncLabel[syncStatus]}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: "12px", padding: "4px", maxWidth: "540px", margin: "0 auto 16px", boxShadow: "0 1px 4px rgba(160,80,80,0.08)" }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            flex: 1, fontSize: "12px", padding: "7px 2px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "600",
            background: tab === i ? T.tab : "transparent",
            color: tab === i ? T.tabText : T.tabInactiveText,
            transition: "all 0.15s",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ maxWidth: "540px", margin: "0 auto" }}>
        {tab === 0 && (
          <div style={S.card}>
            <h2 style={{ fontSize: "16px", fontWeight: "bold", color: T.h1, margin: "0 0 4px" }}>🎯 遊戲一：尋愛的限時突擊</h2>
            <p style={{ fontSize: "11px", color: T.th, margin: "0 0 2px" }}>喵喵隊（第0~4組）回合一，汪汪隊（第5~10組）回合二</p>
            <p style={{ fontSize: "11px", color: T.th, margin: "0 0 12px" }}>11組統一排名｜並列者同分，下一名次接續不跳過</p>
            <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                  <th style={{ ...S.th, textAlign: "left" }}>組別</th>
                  <th style={S.th}>隊伍</th>
                  <th style={S.th}>回合</th>
                  <th style={S.th}>答對題數</th>
                  <th style={S.th}>積分</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g, i) => (
                  <tr key={g.id} style={{ borderBottom: `1px solid ${T.cardBorder}40`, background: gameRowBg(g.team) }}>
                    <td style={{ padding: "6px", fontWeight: "600", color: T.h1 }}>{g.name}</td>
                    <td style={{ padding: "6px", textAlign: "center", fontSize: "11px", fontWeight: "700", color: teamColor(g.team) }}>{g.team}</td>
                    <td style={{ padding: "6px", textAlign: "center", fontSize: "11px", color: T.th }}>{g.id <= 4 ? "回合一" : "回合二"}</td>
                    <td style={{ padding: "6px", textAlign: "center" }}>
                      <input type="number" min="0" max="10" value={g1[i].r1}
                        onChange={(e) => updateG1(g1.map((x, j) => j === i ? { ...x, r1: e.target.value } : x))}
                        style={S.inp} placeholder="0~10" />
                    </td>
                    <td style={S.score}>{g1Scores[g.id] ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 1 && (
          <div style={S.card}>
            <h2 style={{ fontSize: "16px", fontWeight: "bold", color: T.h1, margin: "0 0 4px" }}>⏱️ 遊戲二：第六感爆走</h2>
            <p style={{ fontSize: "11px", color: T.th, margin: "0 0 2px" }}>A選手目標8秒，B選手目標10秒，誤差越小排名越高</p>
            <p style={{ fontSize: "11px", color: T.th, margin: "0 0 12px" }}>總誤差 = |A秒數−8| + |B秒數−10|</p>
            <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                  <th style={{ ...S.th, textAlign: "left" }}>組別</th>
                  <th style={S.th}>隊伍</th>
                  <th style={S.th}>A秒數</th>
                  <th style={S.th}>B秒數</th>
                  <th style={S.th}>總誤差</th>
                  <th style={S.th}>積分</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g, i) => {
                  const d = g2[i];
                  const a = parseFloat(d.a), b = parseFloat(d.b);
                  const aErr = !isNaN(a) ? Math.abs(a - 8) : null;
                  const bErr = !isNaN(b) ? Math.abs(b - 10) : null;
                  const total = aErr !== null && bErr !== null ? (aErr + bErr).toFixed(3) : "-";
                  return (
                    <tr key={g.id} style={{ borderBottom: `1px solid ${T.cardBorder}40`, background: gameRowBg(g.team) }}>
                      <td style={{ padding: "6px", fontWeight: "600", color: T.h1 }}>{g.name}</td>
                      <td style={{ padding: "6px", textAlign: "center", fontSize: "11px", fontWeight: "700", color: teamColor(g.team) }}>{g.team}</td>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        <input type="number" step="0.01" value={d.a}
                          onChange={(e) => updateG2(g2.map((x, j) => j === i ? { ...x, a: e.target.value } : x))}
                          style={S.inp} placeholder="秒" />
                      </td>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        <input type="number" step="0.01" value={d.b}
                          onChange={(e) => updateG2(g2.map((x, j) => j === i ? { ...x, b: e.target.value } : x))}
                          style={S.inp} placeholder="秒" />
                      </td>
                      <td style={{ padding: "6px", textAlign: "center", color: T.th }}>{total}</td>
                      <td style={S.score}>{g2Scores[g.id] ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 2 && (
          <div style={S.card}>
            <h2 style={{ fontSize: "16px", fontWeight: "bold", color: T.h1, margin: "0 0 4px" }}>📱 遊戲三：不良高校入學考</h2>
            <p style={{ fontSize: "11px", color: T.th, margin: "0 0 12px" }}>請輸入各組的Kahoot排名（1~11），積分自動 ×1.3</p>
            <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                  <th style={{ ...S.th, textAlign: "left" }}>組別</th>
                  <th style={S.th}>隊伍</th>
                  <th style={S.th}>Kahoot排名</th>
                  <th style={S.th}>基礎分</th>
                  <th style={S.th}>×1.3積分</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g, i) => {
                  const r = parseInt(g3[i].rank);
                  const base = !isNaN(r) && r >= 1 && r <= 11 ? RANK_SCORES[r - 1] : null;
                  return (
                    <tr key={g.id} style={{ borderBottom: `1px solid ${T.cardBorder}40`, background: gameRowBg(g.team) }}>
                      <td style={{ padding: "6px", fontWeight: "600", color: T.h1 }}>{g.name}</td>
                      <td style={{ padding: "6px", textAlign: "center", fontSize: "11px", fontWeight: "700", color: teamColor(g.team) }}>{g.team}</td>
                      <td style={{ padding: "6px", textAlign: "center" }}>
                        <input type="number" min="1" max="11" value={g3[i].rank}
                          onChange={(e) => updateG3(g3.map((x, j) => j === i ? { ...x, rank: e.target.value } : x))}
                          style={S.inp} placeholder="1~11" />
                      </td>
                      <td style={{ padding: "6px", textAlign: "center", color: T.th }}>{base ?? "-"}</td>
                      <td style={S.score}>{g3Scores[g.id] ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { name: "喵喵隊", emoji: "🐱", avg: miaoAvg, win: winnerTeam === "喵喵隊", color: MIAO_COLOR, bg: "#E8F7F7" },
                { name: "汪汪隊", emoji: "🐶", avg: wangAvg, win: winnerTeam === "汪汪隊", color: WANG_COLOR, bg: WANG_BG },
              ].map((t) => (
                <div key={t.name} style={{
                  borderRadius: "16px", padding: "14px",
                  boxShadow: "0 2px 8px rgba(160,80,80,0.10)", textAlign: "center",
                  background: t.win ? t.color : t.bg,
                  border: `1px solid ${t.win ? t.color : T.cardBorder}`,
                }}>
                  <div style={{ fontSize: "28px" }}>{t.emoji}</div>
                  <div style={{ fontWeight: "bold", color: t.win ? "white" : T.h1 }}>{t.name}</div>
                  <div style={{ fontSize: "11px", color: t.win ? "rgba(255,255,255,0.8)" : T.th }}>平均分</div>
                  <div style={{ fontSize: "22px", fontWeight: "bold", color: t.win ? "white" : t.color }}>
                    {miaoAvg || wangAvg ? t.avg.toFixed(1) : "-"}
                  </div>
                  {t.win && <div style={{ color: "white", fontSize: "11px", marginTop: "4px" }}>🏆 勝隊 +50分/組</div>}
                </div>
              ))}
            </div>

            <div style={S.card}>
              <h2 style={{ fontSize: "16px", fontWeight: "bold", color: T.h1, margin: "0 0 12px" }}>🏅 組別總排名</h2>
              <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.cardBorder}` }}>
                    {["名次", "組別", "G1", "G2", "G3", "小計", "加成", "總分"].map((h, i) => (
                      <th key={i} style={{ ...S.th, textAlign: i === 1 ? "left" : "center" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {finalTotals.map((t, rank) => {
                    const g = GROUPS[t.id];
                    const medal = ["🥇", "🥈", "🥉"][rank] ?? `${rank + 1}`;
                    return (
                      <tr key={t.id} style={{
                        borderBottom: `1px solid ${T.cardBorder}40`,
                        background: rankRowBg(rank, g.team),
                      }}>
                        <td style={{ padding: "5px", textAlign: "center" }}>{medal}</td>
                        <td style={{ padding: "5px" }}>
                          <span style={{ fontWeight: "600", color: T.h1 }}>{g.name}</span>
                          <span style={{ marginLeft: "3px", fontSize: "10px", fontWeight: "700", color: teamColor(g.team) }}>{g.team}</span>
                        </td>
                        <td style={{ padding: "5px", textAlign: "center", color: T.th }}>{t.s1 || "-"}</td>
                        <td style={{ padding: "5px", textAlign: "center", color: T.th }}>{t.s2 || "-"}</td>
                        <td style={{ padding: "5px", textAlign: "center", color: T.th }}>{t.s3 || "-"}</td>
                        <td style={{ padding: "5px", textAlign: "center", color: T.h1 }}>{t.sum}</td>
                        <td style={{ padding: "5px", textAlign: "center", fontWeight: "600", color: T.bonusColor }}>
                          {t.bonus ? `+${t.bonus}` : "-"}
                        </td>
                        <td style={{ padding: "5px", textAlign: "center", fontWeight: "bold", color: T.score }}>{t.final}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button onClick={() => setShowChampion(true)} style={{
              width: "100%", padding: "14px",
              background: `linear-gradient(to right, ${T.tab}, ${WANG_COLOR})`,
              color: "white", fontWeight: "bold", borderRadius: "16px", border: "none", cursor: "pointer",
              fontSize: "16px", boxShadow: "0 4px 12px rgba(200,120,104,0.35)",
            }}>
              🏆 公佈最終冠軍！
            </button>
          </div>
        )}
      </div>

      {showChampion && (
        <div onClick={() => setShowChampion(false)} style={{
          position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(80,30,30,0.6)"
        }}>
          <canvas ref={confettiRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "relative", background: T.card, borderRadius: "24px", padding: "32px",
            textAlign: "center", boxShadow: "0 20px 60px rgba(160,80,80,0.25)", margin: "16px",
            maxWidth: "320px", width: "100%", border: `1px solid ${T.cardBorder}`,
          }}>
            <div style={{ fontSize: "48px", marginBottom: "8px" }}>🏆</div>
            <div style={{ color: T.th, fontSize: "13px", marginBottom: "4px" }}>總冠軍</div>
            <div style={{ fontSize: "28px", fontWeight: "900", color: T.h1, marginBottom: "4px" }}>
              {finalTotals[0] ? GROUPS[finalTotals[0].id].name : "?"}
            </div>
            <div style={{
              fontSize: "16px", fontWeight: "bold", marginBottom: "8px",
              color: finalTotals[0] ? teamColor(GROUPS[finalTotals[0].id].team) : T.h1
            }}>
              {finalTotals[0] ? GROUPS[finalTotals[0].id].team : ""}
            </div>
            <div style={{ fontSize: "36px", fontWeight: "900", color: T.bonusColor, marginBottom: "16px" }}>
              {finalTotals[0]?.final ?? 0} 分
            </div>
            {winnerTeam && (
              <div style={{
                fontSize: "13px", fontWeight: "600", marginBottom: "16px", padding: "4px 12px",
                borderRadius: "999px", display: "inline-block",
                background: winnerTeam === "喵喵隊" ? "#E8F7F7" : WANG_BG,
                color: winnerTeam === "喵喵隊" ? MIAO_COLOR : WANG_COLOR,
              }}>
                {winnerTeam} 勝利！🎊
              </div>
            )}
            <button onClick={() => setShowChampion(false)} style={{
              display: "block", width: "100%", padding: "10px", background: T.tabInactive,
              color: T.h1, borderRadius: "12px", border: `1px solid ${T.cardBorder}`,
              cursor: "pointer", fontWeight: "500", fontSize: "13px"
            }}>關閉</button>
          </div>
        </div>
      )}
    </div>
  );
}
