import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyCLcJ1IFuTHZ5faaGNKrzl3jWgtZFAfTtE',
  authDomain: 'spring-party-scoring.firebaseapp.com',
  databaseURL:
    'https://spring-party-scoring-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'spring-party-scoring',
  storageBucket: 'spring-party-scoring.firebasestorage.app',
  messagingSenderId: '260254732056',
  appId: '1:260254732056:web:a485ef18301dad6aa9986d',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const GROUPS = Array.from({ length: 11 }, (_, i) => ({
  id: i,
  name: `第${i}組`,
  team: i <= 4 ? '喵喵隊' : '旺旺隊',
}));

const RANK_SCORES = [110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

function getRankScores(values, higher = true) {
  const withVal = values.filter((v) => v.val !== null && v.val !== undefined);
  const sorted = [...withVal].sort((a, b) =>
    higher ? b.val - a.val : a.val - b.val
  );
  const result = {};
  let rankIndex = 0,
    i = 0;
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

const TABS = ['遊戲一', '遊戲二', '遊戲三', '總排行榜'];
const initG1 = () => GROUPS.map((g) => ({ id: g.id, r1: '' }));
const initG2 = () => GROUPS.map((g) => ({ id: g.id, a: '', b: '' }));
const initG3 = () => GROUPS.map((g) => ({ id: g.id, rank: '' }));

export default function App() {
  const [tab, setTab] = useState(0);
  const [g1, setG1] = useState(initG1());
  const [g2, setG2] = useState(initG2());
  const [g3, setG3] = useState(initG3());
  const [showChampion, setShowChampion] = useState(false);
  const [synced, setSynced] = useState(false);
  const confettiRef = useRef(null);

  useEffect(() => {
    const unsub1 = onValue(ref(db, 'g1'), (snap) => {
      if (snap.exists()) setG1(snap.val());
    });
    const unsub2 = onValue(ref(db, 'g2'), (snap) => {
      if (snap.exists()) setG2(snap.val());
    });
    const unsub3 = onValue(ref(db, 'g3'), (snap) => {
      if (snap.exists()) setG3(snap.val());
    });
    setSynced(true);
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  const updateG1 = (newG1) => {
    setG1(newG1);
    set(ref(db, 'g1'), newG1);
  };
  const updateG2 = (newG2) => {
    setG2(newG2);
    set(ref(db, 'g2'), newG2);
  };
  const updateG3 = (newG3) => {
    setG3(newG3);
    set(ref(db, 'g3'), newG3);
  };

  const g1Scores = (() => {
    const vals = g1.map((g) => ({
      id: g.id,
      val: g.r1 !== '' ? parseFloat(g.r1) : null,
    }));
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
      const a = parseFloat(g.a),
        b = parseFloat(g.b);
      if (g.a === '' && g.b === '') return { id: g.id, val: null };
      const aErr = g.a !== '' ? Math.abs(a - 8) : 0;
      const bErr = g.b !== '' ? Math.abs(b - 10) : 0;
      return { id: g.id, val: Math.round((aErr + bErr) * 1000) / 1000 };
    });
    const ranked = getRankScores(vals, false);
    const result = {};
    vals.forEach((v) => {
      result[v.id] = v.val === null ? null : ranked[v.id] ?? 0;
    });
    return result;
  })();

  const g3Scores = (() => {
    const result = {};
    g3.forEach((g) => {
      const r = parseInt(g.rank);
      if (isNaN(r) || r < 1 || r > 11) {
        result[g.id] = null;
        return;
      }
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
  const winnerTeam =
    miaoAvg > wangAvg ? '喵喵隊' : miaoAvg < wangAvg ? '旺旺隊' : null;

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
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      r: Math.random() * 8 + 4,
      d: Math.random() * 60 + 20,
      color: ['#f72585', '#7209b7', '#3a86ff', '#fb5607', '#ffbe0b', '#06d6a0'][
        Math.floor(Math.random() * 6)
      ],
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
        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [showChampion]);

  const inputCls =
    'w-20 text-center border border-gray-300 rounded px-1 py-0.5 text-sm focus:outline-none focus:border-purple-400';
  const teamColor = (t) => (t === '喵喵隊' ? 'text-pink-500' : 'text-blue-500');
  const teamBg = (t) => (t === '喵喵隊' ? 'bg-pink-50' : 'bg-blue-50');

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-3">
      <div className="text-center mb-4">
        <h1 className="text-2xl font-bold text-purple-700">
          🎉 Tomofun春酒計分系統
        </h1>
        <div className="flex justify-center gap-6 mt-1 text-sm">
          <span className="text-pink-500 font-semibold">
            🐱 喵喵隊 (第0~4組)
          </span>
          <span className="text-blue-500 font-semibold">
            🐶 旺旺隊 (第5~10組)
          </span>
        </div>
        <div
          className={`text-xs mt-1 ${
            synced ? 'text-green-500' : 'text-gray-400'
          }`}
        >
          {synced ? '🟢 已連線，即時同步中' : '⏳ 連線中...'}
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-white rounded-xl p-1 shadow-sm max-w-xl mx-auto">
        {TABS.map((t, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${
              tab === i
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-500 hover:bg-purple-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-lg font-bold text-purple-700 mb-1">
              🎯 遊戲一：尋愛的限時突擊
            </h2>
            <p className="text-xs text-gray-400 mb-1">
              喵喵隊（第0~4組）回合一，旺旺隊（第5~10組）回合二
            </p>
            <p className="text-xs text-gray-400 mb-3">
              11組統一排名｜並列者同分，下一名次接續不跳過
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b">
                  <th className="py-2 text-left">組別</th>
                  <th className="py-2">隊伍</th>
                  <th className="py-2">回合</th>
                  <th className="py-2">答對題數</th>
                  <th className="py-2">積分</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g, i) => {
                  const d = g1[i];
                  const score = g1Scores[g.id];
                  return (
                    <tr
                      key={g.id}
                      className={`border-b last:border-0 ${teamBg(g.team)}`}
                    >
                      <td className="py-1.5 font-medium">{g.name}</td>
                      <td
                        className={`py-1.5 text-center text-xs font-semibold ${teamColor(
                          g.team
                        )}`}
                      >
                        {g.team}
                      </td>
                      <td className="py-1.5 text-center text-xs text-gray-400">
                        {g.id <= 4 ? '回合一' : '回合二'}
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="number"
                          min="0"
                          max="10"
                          value={d.r1}
                          onChange={(e) =>
                            updateG1(
                              g1.map((x, j) =>
                                j === i ? { ...x, r1: e.target.value } : x
                              )
                            )
                          }
                          className={inputCls}
                          placeholder="0~10"
                        />
                      </td>
                      <td className="py-1.5 text-center font-bold text-purple-600">
                        {score !== null && score !== undefined ? score : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 1 && (
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-lg font-bold text-purple-700 mb-1">
              ⏱️ 遊戲二：第六感爆走
            </h2>
            <p className="text-xs text-gray-400 mb-1">
              A選手目標8秒，B選手目標10秒，誤差越小排名越高
            </p>
            <p className="text-xs text-gray-400 mb-3">
              總誤差 = |A秒數−8| + |B秒數−10|
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b">
                  <th className="py-2 text-left">組別</th>
                  <th className="py-2">隊伍</th>
                  <th className="py-2">A秒數</th>
                  <th className="py-2">B秒數</th>
                  <th className="py-2">總誤差</th>
                  <th className="py-2">積分</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g, i) => {
                  const d = g2[i];
                  const a = parseFloat(d.a),
                    b = parseFloat(d.b);
                  const aErr = !isNaN(a) ? Math.abs(a - 8) : null;
                  const bErr = !isNaN(b) ? Math.abs(b - 10) : null;
                  const total =
                    aErr !== null && bErr !== null
                      ? (aErr + bErr).toFixed(3)
                      : '-';
                  const score = g2Scores[g.id];
                  return (
                    <tr
                      key={g.id}
                      className={`border-b last:border-0 ${teamBg(g.team)}`}
                    >
                      <td className="py-1.5 font-medium">{g.name}</td>
                      <td
                        className={`py-1.5 text-center text-xs font-semibold ${teamColor(
                          g.team
                        )}`}
                      >
                        {g.team}
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="number"
                          step="0.01"
                          value={d.a}
                          onChange={(e) =>
                            updateG2(
                              g2.map((x, j) =>
                                j === i ? { ...x, a: e.target.value } : x
                              )
                            )
                          }
                          className={inputCls}
                          placeholder="秒"
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="number"
                          step="0.01"
                          value={d.b}
                          onChange={(e) =>
                            updateG2(
                              g2.map((x, j) =>
                                j === i ? { ...x, b: e.target.value } : x
                              )
                            )
                          }
                          className={inputCls}
                          placeholder="秒"
                        />
                      </td>
                      <td className="py-1.5 text-center text-gray-600">
                        {total}
                      </td>
                      <td className="py-1.5 text-center font-bold text-purple-600">
                        {score !== null && score !== undefined ? score : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 2 && (
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-lg font-bold text-purple-700 mb-1">
              📱 遊戲三：不良高校入學考
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              請輸入各組的Kahoot排名（1~11），積分自動 ×1.3
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b">
                  <th className="py-2 text-left">組別</th>
                  <th className="py-2">隊伍</th>
                  <th className="py-2">Kahoot排名</th>
                  <th className="py-2">基礎分</th>
                  <th className="py-2">×1.3積分</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g, i) => {
                  const d = g3[i];
                  const r = parseInt(d.rank);
                  const base =
                    !isNaN(r) && r >= 1 && r <= 11 ? RANK_SCORES[r - 1] : null;
                  const score = g3Scores[g.id];
                  return (
                    <tr
                      key={g.id}
                      className={`border-b last:border-0 ${teamBg(g.team)}`}
                    >
                      <td className="py-1.5 font-medium">{g.name}</td>
                      <td
                        className={`py-1.5 text-center text-xs font-semibold ${teamColor(
                          g.team
                        )}`}
                      >
                        {g.team}
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="number"
                          min="1"
                          max="11"
                          value={d.rank}
                          onChange={(e) =>
                            updateG3(
                              g3.map((x, j) =>
                                j === i ? { ...x, rank: e.target.value } : x
                              )
                            )
                          }
                          className={inputCls}
                          placeholder="1~11"
                        />
                      </td>
                      <td className="py-1.5 text-center text-gray-500">
                        {base ?? '-'}
                      </td>
                      <td className="py-1.5 text-center font-bold text-purple-600">
                        {score !== null && score !== undefined ? score : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 3 && (
        <div className="max-w-xl mx-auto space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                name: '喵喵隊',
                emoji: '🐱',
                avg: miaoAvg,
                win: winnerTeam === '喵喵隊',
              },
              {
                name: '旺旺隊',
                emoji: '🐶',
                avg: wangAvg,
                win: winnerTeam === '旺旺隊',
              },
            ].map((t) => (
              <div
                key={t.name}
                className={`rounded-2xl p-3 shadow text-center ${
                  t.win ? 'bg-yellow-400' : 'bg-white'
                }`}
              >
                <div className="text-2xl">{t.emoji}</div>
                <div
                  className={`font-bold ${
                    t.win ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {t.name}
                </div>
                <div
                  className={`text-xs ${
                    t.win ? 'text-yellow-100' : 'text-gray-400'
                  }`}
                >
                  平均分
                </div>
                <div
                  className={`text-xl font-bold ${
                    t.win ? 'text-white' : 'text-purple-600'
                  }`}
                >
                  {miaoAvg || wangAvg ? t.avg.toFixed(1) : '-'}
                </div>
                {t.win && (
                  <div className="text-white text-xs mt-1">
                    🏆 勝隊 +50分/組
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-lg font-bold text-purple-700 mb-3">
              🏅 組別總排名
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b">
                  <th className="py-1">名次</th>
                  <th className="py-1 text-left">組別</th>
                  <th className="py-1">遊戲一</th>
                  <th className="py-1">遊戲二</th>
                  <th className="py-1">遊戲三</th>
                  <th className="py-1">小計</th>
                  <th className="py-1">加成</th>
                  <th className="py-1">總分</th>
                </tr>
              </thead>
              <tbody>
                {finalTotals.map((t, rank) => {
                  const g = GROUPS[t.id];
                  const medal = ['🥇', '🥈', '🥉'][rank] ?? `${rank + 1}`;
                  return (
                    <tr
                      key={t.id}
                      className={`border-b last:border-0 ${
                        rank === 0 ? 'bg-yellow-50' : teamBg(g.team)
                      }`}
                    >
                      <td className="py-1.5 text-center">{medal}</td>
                      <td className="py-1.5">
                        <span className="font-semibold">{g.name}</span>
                        <span className={`ml-1 text-xs ${teamColor(g.team)}`}>
                          {g.team}
                        </span>
                      </td>
                      <td className="py-1.5 text-center">{t.s1 || '-'}</td>
                      <td className="py-1.5 text-center">{t.s2 || '-'}</td>
                      <td className="py-1.5 text-center">{t.s3 || '-'}</td>
                      <td className="py-1.5 text-center text-gray-600">
                        {t.sum}
                      </td>
                      <td className="py-1.5 text-center text-green-600 font-medium">
                        {t.bonus ? `+${t.bonus}` : '-'}
                      </td>
                      <td className="py-1.5 text-center font-bold text-purple-700">
                        {t.final}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => setShowChampion(true)}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-2xl shadow-lg text-lg hover:opacity-90 transition"
          >
            🏆 公佈最終冠軍！
          </button>
        </div>
      )}

      {showChampion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
          onClick={() => setShowChampion(false)}
        >
          <canvas
            ref={confettiRef}
            className="absolute inset-0 pointer-events-none"
          />
          <div
            className="relative bg-white rounded-3xl p-8 text-center shadow-2xl mx-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl mb-2">🏆</div>
            <div className="text-gray-400 text-sm mb-1">總冠軍</div>
            <div className="text-3xl font-black text-purple-700 mb-1">
              {finalTotals[0] ? GROUPS[finalTotals[0].id].name : '?'}
            </div>
            <div
              className={`text-lg font-bold mb-2 ${
                finalTotals[0] ? teamColor(GROUPS[finalTotals[0].id].team) : ''
              }`}
            >
              {finalTotals[0] ? GROUPS[finalTotals[0].id].team : ''}
            </div>
            <div className="text-4xl font-black text-yellow-500 mb-4">
              {finalTotals[0]?.final ?? 0} 分
            </div>
            {winnerTeam && (
              <div
                className={`text-sm font-semibold mb-4 px-3 py-1 rounded-full inline-block ${
                  winnerTeam === '喵喵隊'
                    ? 'bg-pink-100 text-pink-600'
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                {winnerTeam} 勝利！🎊
              </div>
            )}
            <button
              onClick={() => setShowChampion(false)}
              className="block w-full py-2 bg-purple-100 text-purple-600 rounded-xl font-medium text-sm hover:bg-purple-200"
            >
              關閉
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
