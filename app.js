import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { cfg } from './cfg.js';

// App Android (pasta android/): o objeto AtelieAndroid só existe dentro dele.
const AND = window.AtelieAndroid || null;
const andMsg = (t, d) => { try { AND.postMessage(JSON.stringify({t, ...d})); } catch {} };
window.atelieDoAndroid = m => {
  if (m.t === 'token') signInWithCredential(S.auth, GoogleAuthProvider.credential(m.idToken)).catch(e => toast('Não deu pra entrar: ' + (e.code || e.message), true));
  else if (m.t === 'erro') toast(m.msg, true);
  else if (m.t === 'volume') { const ct = S.view === 'timer' && !$('.tm-rec') && $('.tm-conta'); if (ct) contar(ct.dataset.id, m.k === 'mais' ? 1 : -1); else segPasso(m.k === 'mais' ? 1 : -1); }
};
window.atelieAtualizou = () => { S.novaVersao = true; tentaRecarregar(); };
function tentaRecarregar() {
  if (!S.novaVersao) return;
  const ae = document.activeElement;
  if (!$('#modal').hidden || (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) return;
  try { sessionStorage.setItem('atelie-atualizou', '1'); } catch {}
  location.reload();
}
window.atelieVoltar = () => { if (!$('#modal').hidden) { fecharModal(); return true; } return false; };
let andTm = null, andVol = null;
function andVolume(on) { if (!AND || on === andVol) return; andVol = on; andMsg('volume', {on}); }
function andTimer() {
  if (!AND) return;
  const p = S.user && rodando() ? ped(S.timer.pedidoId) : null;
  const k = p ? [p.id, p.nome, S.timer.inicio, feitas(p)].join('|') : '';
  if (k === andTm) return; andTm = k;
  andMsg('timer', p ? {nome: p.nome, base: Math.round(Date.now() - segTotal(p) * 1000)} : {nome: ''});
}

const TIPOS = ['Receita pronta','Custom simples','Custom médio','Custom complexo','Acessório'];
const TIPO_CLS = {'Receita pronta':'t-pronta','Custom simples':'t-simples','Custom médio':'t-medio','Custom complexo':'t-complexo','Acessório':'t-acessorio'};
const STATUS = ['Na fila','Esperando fio','Fazendo','Pronto','Entregue','Cancelado'];
const ST_CLS = {'Na fila':'st-fila','Esperando fio':'st-fio','Fazendo':'st-fazendo','Pronto':'st-pronto','Entregue':'st-entregue','Cancelado':'st-cancelado'};
const FECHADOS = ['Pronto','Entregue','Cancelado'];
const SAIU = ['Entregue','Cancelado'];
const SIT = ['Cheio','Tem','Pouco','Acabou','Não tenho'];
const TIPOS_COMPRA = ['Novelo','Linha de bordado','Olhinhos','Fibra','Botão','Strass/miçanga','Receita (PDF)','Outro'];
const FONTES = ['Própria','A criar','Comprada','Grátis'];
const COLS = ['pedidos','horas','compras','estoque','receitas'];
const DEF_CFG = {valorHora:13, precoNovelo:20, miudezas:8, descontoFamilia:0.1, metaNatal:null,
  indiretos:10, extraSimples:10, extraMedio:20, extraComplexo:35, embalagem:0, taxaPag:0, urgencia:0, urgDias:7, corrigeHoras:true};
const VIEWS = [['timer','Timer'],['painel','Painel'],['fila','Fila'],['horas','Horas'],['compras','Compras'],['estoque','Estoque'],['calculadora','Calculadora'],['receitas','Receitas'],['config','Config']];

const S = {pedidos:[],horas:[],compras:[],estoque:[],receitas:[],raw:{},config:{...DEF_CFG},rawCfg:null,timer:null,
  ok:{},pend:{},user:null,tp:null,inst:null,fs:null,setup:false,view:'painel',verSaiu:false,verComprados:false,adiado:false,
  calc:{horas:10,novelos:0,outros:0,tipo:'Custom simples',rid:'',prazo:''}};

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const str = v => typeof v === 'string' ? v : (v == null ? '' : String(v));
const num = (v, d = null) => { if (v === '' || v == null) return d; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : d; };
const pad = n => String(n).padStart(2, '0');
const isoDia = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hoje = () => isoDia(new Date());
const dia = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
const diasAte = s => { const d = dia(s); return d ? Math.round((d - dia(hoje())) / 864e5) : null; };
const fData = s => { const d = dia(s); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) : ''; };
const BRL = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
const fR = v => (v == null || !Number.isFinite(v)) ? '–' : BRL.format(v);
const fH = v => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', {maximumFractionDigits:1}) + ' h';
const fN = v => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', {maximumFractionDigits:2});
const fP = v => Math.round((v || 0) * 100) + '%';
const r90 = v => Math.max(9.9, Math.round((Math.ceil(v / 10 - 1e-9) * 10 - 0.1) * 100) / 100);
const plural = (n, a, b) => n === 1 ? a : b;
const opts = (arr, sel) => arr.map(o => `<option${o === sel ? ' selected' : ''}>${esc(o)}</option>`).join('');
const agora = () => new Date().toISOString();
const fT = sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 3600) + ':' + pad(Math.floor(sec % 3600 / 60)) + ':' + pad(sec % 60); };
const semAcento = v => str(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const rodando = () => !!(S.timer && S.timer.inicio && S.timer.pedidoId);
const segAtual = () => rodando() ? (Date.now() - new Date(S.timer.inicio)) / 1000 : 0;
const segTotal = p => feitas(p) * 3600 + (rodando() && S.timer.pedidoId === p.id ? segAtual() : 0);

const NORM = {
  pedidos: (id, d) => ({id, nome: str(d.nome) || '(sem nome)', cliente: str(d.cliente), tipo: TIPOS.includes(d.tipo) ? d.tipo : 'Custom simples',
    status: STATUS.includes(d.status) ? d.status : 'Na fila', prazo: str(d.prazo), horasEst: num(d.horasEst, 0), preco: num(d.preco),
    sinal: num(d.sinal, 0), pago: d.pago === true, contato: str(d.contato), pedidoEm: str(d.pedidoEm), entregueEm: str(d.entregueEm),
    ordem: num(d.ordem, 1e6), receitaId: str(d.receitaId), passo: num(d.passo, 0),
    contador: Math.max(0, Math.round(num(d.contador, 0))), contaPasso: Math.max(1, Math.round(num(d.contaPasso, 1))), lixo: d.lixo === true}),
  horas: (id, d) => ({id, data: str(d.data), pedidoId: str(d.pedidoId), horas: num(d.horas, 0), inicio: str(d.inicio), fim: str(d.fim), lixo: d.lixo === true}),
  compras: (id, d) => ({id, item: str(d.item) || '(sem nome)', tipo: TIPOS_COMPRA.includes(d.tipo) ? d.tipo : 'Outro', cor: str(d.cor),
    qtd: num(d.qtd, 1), precoUn: num(d.precoUn, 0), onde: str(d.onde), pedidoId: str(d.pedidoId), comprado: d.comprado === true,
    compradoEm: str(d.compradoEm), criadoEm: str(d.criadoEm), lixo: d.lixo === true}),
  estoque: (id, d) => ({id, cor: str(d.cor) || '(sem nome)', situacao: SIT.includes(d.situacao) ? d.situacao : 'Tem', ordem: num(d.ordem, 1e6), hex: /^#[0-9a-f]{6}$/i.test(str(d.hex)) ? str(d.hex).toLowerCase() : '', lixo: d.lixo === true}),
  receitas: (id, d) => ({id, personagem: str(d.personagem) || '(sem nome)', fonte: FONTES.includes(d.fonte) ? d.fonte : 'Própria', autor: str(d.autor),
    altura: num(d.altura), arquivo: str(d.arquivo), tipoPadrao: TIPOS.includes(d.tipoPadrao) ? d.tipoPadrao : 'Receita pronta',
    horasPadrao: num(d.horasPadrao), precoPadrao: num(d.precoPadrao), acompanhaId: str(d.acompanhaId), texto: str(d.texto), passo: num(d.passo, 0), lixo: d.lixo === true})
};

const vivos = k => S[k].filter(x => !x.lixo);
const ped = id => S.pedidos.find(p => p.id === id);
const nomePed = id => id ? (ped(id)?.nome || '(pedido apagado)') : 'Estoque';
const C = () => ({valorHora: num(S.config.valorHora, 13), precoNovelo: num(S.config.precoNovelo, 20), miudezas: num(S.config.miudezas, 8),
  descontoFamilia: num(S.config.descontoFamilia, 0.1), metaNatal: num(S.config.metaNatal),
  indiretos: num(S.config.indiretos, 10), extraSimples: num(S.config.extraSimples, 10), extraMedio: num(S.config.extraMedio, 20),
  extraComplexo: num(S.config.extraComplexo, 35), embalagem: num(S.config.embalagem, 0), taxaPag: num(S.config.taxaPag, 0),
  urgencia: num(S.config.urgencia, 0), urgDias: num(S.config.urgDias, 7), corrigeHoras: S.config.corrigeHoras !== false});
const ativosOrd = () => vivos('pedidos').filter(p => !SAIU.includes(p.status)).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
const feitas = p => vivos('horas').filter(h => h.pedidoId === p.id).reduce((a, h) => a + h.horas, 0);
const comprasDe = p => vivos('compras').filter(c => c.pedidoId === p.id).reduce((a, c) => a + c.qtd * c.precoUn, 0);
const custo = p => comprasDe(p) + (p.tipo === 'Acessório' ? 0 : C().miudezas);
function calcP(p) {
  const f = feitas(p), fechado = FECHADOS.includes(p.status), c = custo(p);
  const restam = fechado ? 0 : Math.max(0, p.horasEst - f);
  const sug = sugerePreco({horas: p.horasEst, tipo: p.tipo, material: comprasDe(p), prazo: p.prazo, desde: p.pedidoEm, rid: p.receitaId, pid: p.id, feitasJa: f})?.sug ?? null;
  const preco = p.preco;
  const recebido = preco == null ? p.sinal : (p.pago ? preco : p.sinal);
  const aReceber = preco == null ? null : (p.pago ? 0 : Math.max(0, preco - p.sinal));
  const lucro = preco == null ? null : preco - c;
  const brinde = preco === 0;
  const rph = (lucro != null && f > 0 && !brinde) ? lucro / f : null;
  return {f, fechado, c, restam, sug, recebido, aReceber, lucro, rph, brinde, dias: diasAte(p.prazo), pct: p.horasEst > 0 ? Math.min(1, f / p.horasEst) : 0};
}
// Preço sugerido: trabalho (horas corrigidas pelo histórico) + criação (custom) + material + miudezas
// + custos indiretos + urgência + embalagem + taxa de pagamento. Família: desconto só no trabalho.
const EXTRA_TIPO = {'Custom simples': 'extraSimples', 'Custom médio': 'extraMedio', 'Custom complexo': 'extraComplexo'};
let fhMemo;
function fatorHoras() {
  if (fhMemo !== undefined) return fhMemo;
  const rs = vivos('pedidos').filter(p => ['Pronto', 'Entregue'].includes(p.status) && p.horasEst > 0)
    .map(p => feitas(p) / p.horasEst).filter(r => r > 0.2 && r < 5).sort((a, b) => a - b);
  if (rs.length < 3) return (fhMemo = null);
  const k = rs.length >> 1, m = rs.length % 2 ? rs[k] : (rs[k - 1] + rs[k]) / 2;
  return (fhMemo = {f: Math.min(2, Math.max(0.6, m)), n: rs.length});
}
function matReceita(rid, sem) {
  const r = rec(rid); if (!r) return null;
  const ps = daReceita(r).filter(p => p.id !== sem && comprasDe(p) > 0);
  return ps.length ? {v: ps.reduce((a, p) => a + comprasDe(p), 0) / ps.length, n: ps.length} : null;
}
function sugerePreco({horas, tipo, material = 0, extraMat = 0, prazo = '', desde = '', rid = '', pid = '', feitasJa = 0}) {
  const cf = C();
  if (!(horas > 0) && !(feitasJa > 0)) return null;
  let h = horas > 0 ? horas : 0, hNota = '';
  // Receita com peças prontas: as horas já vêm de dado real (média), então não corrige de novo.
  const rr = rec(rid), comMedia = rr ? statsReceita(rr).prontos > 0 : false;
  const fh = cf.corrigeHoras && h > 0 && !comMedia ? fatorHoras() : null;
  if (fh && Math.abs(fh.f - 1) >= 0.05) {
    h *= fh.f;
    const pc = Math.round(Math.abs(fh.f - 1) * 100);
    hNota = `estimei ${fH(horas)}: suas peças costumam levar ${pc}% ${fh.f > 1 ? 'a mais' : 'a menos'} que o estimado (${fh.n} peças)`;
  }
  if (feitasJa > h) { h = feitasJa; hNota = `já foram ${fH(feitasJa)} de trabalho`; }
  const mao = h * cf.valorHora;
  const pExtra = tipo === 'Acessório' ? 0 : (cf[EXTRA_TIPO[tipo]] || 0), extra = mao * pExtra / 100;
  let mat = 0, matNota = '';
  if (material > 0) { mat = material; matNota = 'compras ligadas à peça'; }
  else if (extraMat > 0) { mat = extraMat; matNota = 'novelos e outros gastos'; }
  else { const mr = rid ? matReceita(rid, pid) : null; if (mr) { mat = mr.v; matNota = `média de ${mr.n} ${plural(mr.n, 'peça', 'peças')} dessa receita`; } }
  const miud = tipo === 'Acessório' ? 0 : cf.miudezas;
  const ind = (mao + extra + mat + miud) * cf.indiretos / 100;
  const ref = desde && prazo ? Math.round((dia(prazo) - dia(desde)) / 864e5) : (prazo ? diasAte(prazo) : null);
  const urg = cf.urgencia > 0 && ref != null && ref >= 0 && ref <= cf.urgDias ? (mao + extra) * cf.urgencia / 100 : 0;
  const emb = cf.embalagem, tx = cf.taxaPag > 0 && cf.taxaPag < 50 ? cf.taxaPag / 100 : 0;
  const liq = mao + extra + mat + miud + ind + urg + emb, total = liq / (1 - tx), taxa = total - liq;
  const custos = mat + miud + ind + emb, sug = r90(total);
  const fam = r90((custos + (mao + extra) * (1 - cf.descontoFamilia) + urg) / (1 - tx));
  const horaEm = v => h > 0 ? (v * (1 - tx) - custos) / h : null;
  const linhas = [['Trabalho', `${fH(h)} × ${fR(cf.valorHora)}/h`, mao, hNota]];
  if (extra) linhas.push(['Criação da receita', `+${fN(pExtra)}% no trabalho (${tipo})`, extra]);
  linhas.push(['Material', matNota || 'sem compras ligadas ainda', mat]);
  if (miud) linhas.push(['Miudezas', 'olhinhos, fibra, botões', miud]);
  if (ind) linhas.push(['Custos indiretos', `${fN(cf.indiretos)}%: luz, agulhas, desgaste`, ind]);
  if (urg) linhas.push(['Urgência', `+${fN(cf.urgencia)}% no trabalho (prazo de ${ref} ${plural(ref, 'dia', 'dias')})`, urg]);
  if (emb) linhas.push(['Embalagem', '', emb]);
  if (taxa) linhas.push(['Taxa de pagamento', `${fN(cf.taxaPag)}%`, taxa]);
  const refs = [];
  const r = rec(rid);
  if (r) {
    const cont = {};
    daReceita(r).filter(p => p.id !== pid && p.preco > 0).forEach(p => { cont[p.preco] = (cont[p.preco] || 0) + 1; });
    const vs = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (vs.length) refs.push(`Já cobrou por ${esc(r.personagem)}: ${vs.map(([v, n]) => fR(+v) + (n > 1 ? ` (${n}×)` : '')).join(', ')}`);
  }
  return {h, mao, extra, mat, miud, ind, urg, emb, taxa, total, sug, fam, linhas, refs, horaSug: horaEm(sug), horaFam: horaEm(fam)};
}
function precoHtml(pr, aberto, semTopo) {
  if (!pr) return '<span class="muted">Põe as horas estimadas pra ver o preço sugerido.</span>';
  const tab = `<table class="pz-t">${pr.linhas.map(([a, b, v, n]) => `<tr><td>${a}${b ? ` <span class="muted">· ${b}</span>` : ''}${n ? `<div class="muted small">${n}</div>` : ''}</td><td class="num">${fR(v)}</td></tr>`).join('')}
    <tr class="pz-soma"><td>Soma <span class="muted">(arredondada pra ,90)</span></td><td class="num">${fR(pr.total)}</td></tr></table>`;
  return `${semTopo ? '' : `<div class="pz-top"><span>Sugestão <b class="pz-v">${fR(pr.sug)}</b></span><span>família <b>${fR(pr.fam)}</b></span>
    <span class="muted small">sua hora fica ${fR(pr.horaSug)}/h</span></div>`}
    <details ${aberto ? 'open' : ''}><summary class="small">Como chegou nesse valor</summary>${tab}</details>
    ${pr.refs.length ? `<p class="small muted pz-ref">${pr.refs.join(' · ')}</p>` : ''}`;
}

function kpis() {
  const todos = vivos('pedidos'), at = ativosOrd(), cf = C();
  const naoCanc = todos.filter(p => p.status !== 'Cancelado');
  const calc = new Map(todos.map(p => [p.id, calcP(p)]));
  const abertos = at.filter(p => !FECHADOS.includes(p.status));
  const prazos = todos.filter(p => !SAIU.includes(p.status) && p.prazo).map(p => p.prazo).sort();
  const atrasadas = todos.filter(p => !SAIU.includes(p.status) && calc.get(p.id).dias != null && calc.get(p.id).dias < 0).length;
  const fat = naoCanc.reduce((a, p) => a + (p.preco || 0), 0);
  const recebido = todos.reduce((a, p) => a + (calc.get(p.id).recebido || 0), 0);
  const gastos = vivos('compras').filter(c => c.comprado).reduce((a, c) => a + c.qtd * c.precoUn, 0);
  const pend = vivos('compras').filter(c => !c.comprado).reduce((a, c) => a + c.qtd * c.precoUn, 0);
  const aReceber = naoCanc.reduce((a, p) => a + (calc.get(p.id).aReceber || 0), 0);
  const lucro = naoCanc.reduce((a, p) => a + (calc.get(p.id).lucro || 0), 0);
  const saldo = recebido - gastos;
  const hs = vivos('horas');
  const seg = new Date(); seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7)); const segIso = isoDia(seg);
  const ent = todos.filter(p => p.status === 'Entregue' && p.preco > 0);
  const hEnt = ent.reduce((a, p) => a + calc.get(p.id).f, 0), lEnt = ent.reduce((a, p) => a + (calc.get(p.id).lucro || 0), 0);
  const brs = naoCanc.filter(p => calc.get(p.id).brinde);
  return {abertos: abertos.length, horasFila: at.reduce((a, p) => a + calc.get(p.id).restam, 0), proxima: abertos[0] ? abertos[0].nome : 'Nada na fila',
    prazo: prazos[0] ? fData(prazos[0]) : 'Nenhum marcado', atrasadas, fat, recebido, gastos, saldo, pend, lucro, aReceber,
    meta: cf.metaNatal, jaTenho: cf.metaNatal ? Math.min(1, Math.max(0, saldo) / cf.metaNatal) : null,
    seFila: cf.metaNatal ? Math.min(1, Math.max(0, saldo + aReceber) / cf.metaNatal) : null,
    hTotal: hs.reduce((a, h) => a + h.horas, 0), hSemana: hs.filter(h => h.data >= segIso).reduce((a, h) => a + h.horas, 0),
    horaReal: hEnt > 0 ? lEnt / hEnt : null, vendidas: ent.length, hVendidas: hEnt,
    brindes: brs.length, custoBrindes: brs.reduce((a, p) => a + calc.get(p.id).c, 0), hBrindes: brs.reduce((a, p) => a + calc.get(p.id).f, 0)};
}

const ref = (c, id) => doc(S.fs, 'users', S.user.uid, c, id);
const colRef = c => collection(S.fs, 'users', S.user.uid, c);
const metaRef = n => doc(S.fs, 'users', S.user.uid, 'meta', n);
function grava(p, ok) {
  p.catch(e => { console.error(e); toast(e && e.code === 'permission-denied' ? 'Sem permissão pra salvar. Sai e entra de novo.' : 'Não salvou: ' + ((e && e.message) || 'erro'), true); });
  if (ok) toast(ok);
}
function criar(c, data, ok) { const r = doc(colRef(c)); grava(setDoc(r, {...data, criadoEm: agora()}), ok); return r.id; }
const mudar = (c, id, patch, ok) => grava(updateDoc(ref(c, id), {...patch, atualizadoEm: agora()}), ok);
const mudarMeta = (n, patch, ok) => grava(setDoc(metaRef(n), patch, {merge: true}), ok);

let toastT;
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = '', bad ? 5000 : 2200); }
let modalOk = null, modalInput = null;
function abrirModal(titulo, corpo, {onOk, onInput, salvarTxt = 'Salvar', extra = ''} = {}) {
  $('#modalBody').innerHTML = `<form id="mf" novalidate><header class="m-h"><h2 id="mtitle">${esc(titulo)}</h2><button type="button" class="x" data-a="fecharModal" aria-label="Fechar">×</button></header>
  <div class="m-c">${corpo}<p class="err" id="merr" role="alert"></p></div>
  <footer class="m-f">${extra}<span class="sp"></span><button type="button" class="btn" data-a="fecharModal">Cancelar</button>${onOk ? `<button type="submit" class="btn pri">${esc(salvarTxt)}</button>` : ''}</footer></form>`;
  modalOk = onOk || null; modalInput = onInput || null;
  $('#modal').hidden = false;
  const f = $('#mf .m-c input, #mf .m-c select'); if (f) f.focus();
  if (modalInput) modalInput($('#mf'));
}
function fecharModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; modalOk = modalInput = null; setTimeout(tentaRecarregar, 300); if (S.adiado) { S.adiado = false; render(); } }
function erroModal(msg) { const e = $('#merr'); if (e) e.textContent = msg; }
const confirmar = (titulo, texto, okTxt, fn) => abrirModal(titulo, `<p>${texto}</p>`, {onOk: () => { fn(); }, salvarTxt: okTxt});
const fd = form => { const o = {}; new FormData(form).forEach((v, k) => o[k] = v); form.querySelectorAll('input[type=checkbox]').forEach(c => o[c.name] = c.checked); return o; };

const campo = (id, label, input, cls = '') => `<div class="field ${cls}"><label for="${id}">${label}</label>${input}</div>`;
const inp = (id, val, attrs = '') => `<input id="${id}" name="${id}" value="${esc(val ?? '')}" ${attrs}>`;
const numInp = (id, val, attrs = '') => inp(id, val == null ? '' : val, `type="number" step="any" inputmode="decimal" ${attrs}`);
const sel = (id, arr, v) => `<select id="${id}" name="${id}">${opts(arr, v)}</select>`;
function selPedido(id, v, comEstoque) {
  const at = ativosOrd(), outros = vivos('pedidos').filter(p => SAIU.includes(p.status));
  let h = `<select id="${id}" name="${id}">` + (comEstoque ? `<option value=""${!v ? ' selected' : ''}>Estoque (geral)</option>` : '');
  h += at.map(p => `<option value="${esc(p.id)}"${p.id === v ? ' selected' : ''}>${esc(p.nome)}</option>`).join('');
  if (outros.length) h += `<optgroup label="Entregues e cancelados">` + outros.map(p => `<option value="${esc(p.id)}"${p.id === v ? ' selected' : ''}>${esc(p.nome)}</option>`).join('') + `</optgroup>`;
  return h + '</select>';
}

function formPedido(id) {
  const p = id ? ped(id) : null, novo = !p, at = ativosOrd();
  const prio = novo ? campo('prio', 'Posição na fila', `<select id="prio" name="prio"><option value="fim">No fim da fila</option><option value="topo">No topo (prioridade máxima)</option>${at.map(a => `<option value="${esc(a.id)}">Depois de: ${esc(a.nome)}</option>`).join('')}</select>`, 'full') : '';
  const corpo = `<div class="fgrid">
    ${campo('nome', 'Peça', inp('nome', p?.nome, 'required autocomplete="off" placeholder="Ex.: Lula #3, Furina, Lola"'), 'full')}
    ${campo('cliente', 'Cliente', inp('cliente', p?.cliente, 'autocomplete="off"'))}
    ${campo('contato', 'Contato', inp('contato', p?.contato, 'autocomplete="off"'))}
    ${campo('tipo', 'Tipo', sel('tipo', TIPOS, p?.tipo || 'Custom simples'))}
    ${campo('status', 'Status', sel('status', STATUS, p?.status || 'Na fila'))}
    ${campo('receitaId', 'Receita', selReceita('receitaId', p?.receitaId, 'Nenhuma'), 'full')}
    ${campo('horasEst', 'Horas estimadas', numInp('horasEst', p?.horasEst || ''))}
    ${campo('prazo', 'Prazo', inp('prazo', p?.prazo, 'type="date"'))}
    <div class="sugbox full" id="sugbox"></div>
    ${campo('preco', 'Preço que você fechou (R$)', numInp('preco', p?.preco))}
    ${campo('sinal', 'Sinal recebido (R$)', numInp('sinal', p?.sinal || ''))}
    <label class="chk full"><input type="checkbox" name="pago" ${p?.pago ? 'checked' : ''}> Já pagou tudo</label>
    ${prio}
    ${campo('pedidoEm', 'Pedido em', inp('pedidoEm', p ? p.pedidoEm : hoje(), 'type="date"'))}
    ${campo('entregueEm', 'Entregue em', inp('entregueEm', p?.entregueEm, 'type="date"'))}
  </div>`;
  const extra = p ? `<button type="button" class="btn bad" data-a="excluir" data-col="pedidos" data-id="${esc(p.id)}">Excluir</button>` : '';
  abrirModal(novo ? 'Novo pedido' : 'Editar pedido', corpo, {extra, salvarTxt: novo ? 'Adicionar na fila' : 'Salvar',
    onInput: f => {
      $('#sugbox').innerHTML = precoHtml(sugerePreco({horas: num(f.horasEst.value, 0), tipo: f.tipo.value, material: p ? comprasDe(p) : 0,
        prazo: f.prazo.value, desde: f.pedidoEm.value, rid: f.receitaId.value, pid: p?.id, feitasJa: p ? feitas(p) : 0}));
    },
    onOk: d => {
      if (!d.nome.trim()) { erroModal('Dá um nome pra peça.'); return false; }
      const patch = {nome: d.nome.trim(), cliente: d.cliente.trim(), contato: d.contato.trim(), tipo: d.tipo, status: d.status,
        horasEst: num(d.horasEst, 0), prazo: d.prazo, preco: num(d.preco), sinal: num(d.sinal, 0), pago: d.pago,
        pedidoEm: d.pedidoEm, entregueEm: d.entregueEm || (d.status === 'Entregue' ? hoje() : ''), receitaId: d.receitaId || ''};
      if (novo) { patch.ordem = ordemPara(d.prio); patch.lixo = false; criar('pedidos', patch, 'Pedido adicionado'); }
      else mudar('pedidos', p.id, patch, 'Pedido salvo');
    }});
}
function ordemPara(v) {
  const at = ativosOrd(); if (!at.length) return 1;
  if (v === 'topo') return at[0].ordem - 1;
  const i = at.findIndex(p => p.id === v);
  if (i < 0) return at[at.length - 1].ordem + 1;
  return at[i + 1] ? (at[i].ordem + at[i + 1].ordem) / 2 : at[i].ordem + 1;
}
function ordensPara(v, k) {
  const at = ativosOrd(); if (!at.length) return Array.from({length: k}, (_, j) => j + 1);
  let a, b; const i = at.findIndex(p => p.id === v);
  if (v === 'topo') { b = at[0].ordem; a = b - 1; }
  else if (i < 0) { a = at[at.length - 1].ordem; b = a + k + 1; }
  else { a = at[i].ordem; b = at[i + 1] ? at[i + 1].ordem : a + k + 1; }
  const st = (b - a) / (k + 1); return Array.from({length: k}, (_, j) => a + st * (j + 1));
}

const escRe = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rec = id => id ? S.receitas.find(r => r.id === id && !r.lixo) : null;
const recsOrd = () => vivos('receitas').sort((a, b) => a.personagem.localeCompare(b.personagem));
const reNome = r => new RegExp('^' + escRe(semAcento(r.personagem)) + '\\s*(#)?\\s*(\\d+)$');
const nomeNum = (r, n, hash) => r.personagem + (hash ? ' #' : ' ') + n;
const daReceita = r => { const re = reNome(r); return vivos('pedidos').filter(p => p.receitaId === r.id || re.test(semAcento(p.nome))); };
function proxNum(r) {
  const re = reNome(r); let mx = 0, hash = false;
  for (const p of vivos('pedidos')) { const m = re.exec(semAcento(p.nome)); if (m) { mx = Math.max(mx, +m[2]); if (m[1]) hash = true; } }
  return {n: mx + 1, hash};
}
function statsReceita(r) {
  const ps = daReceita(r), prontos = ps.filter(p => ['Pronto', 'Entregue'].includes(p.status) && feitas(p) > 0);
  const media = prontos.length ? prontos.reduce((a, p) => a + feitas(p), 0) / prontos.length : null;
  const comPreco = ps.filter(p => p.preco != null).sort((a, b) => (b.pedidoEm || '').localeCompare(a.pedidoEm || '') || b.ordem - a.ordem);
  const ultEst = ps.filter(p => p.horasEst > 0).sort((a, b) => (b.pedidoEm || '').localeCompare(a.pedidoEm || ''))[0];
  return {total: ps.length, prontos: prontos.length, media, ultPreco: comPreco[0] ? comPreco[0].preco : null,
    horas: r.horasPadrao ?? (media != null ? Math.round(media * 10) / 10 : (ultEst ? ultEst.horasEst : null)),
    preco: r.precoPadrao ?? (comPreco[0] ? comPreco[0].preco : null)};
}
function selReceita(id, v, vazio) {
  return `<select id="${id}" name="${id}">${vazio ? `<option value="">${esc(vazio)}</option>` : ''}${recsOrd().map(r => `<option value="${esc(r.id)}"${r.id === v ? ' selected' : ''}>${esc(r.personagem)}</option>`).join('')}</select>`;
}
function planoReceita(r, q, junto) {
  const {n, hash} = proxNum(r), ac = junto && r.acompanhaId ? rec(r.acompanhaId) : null;
  const usados = new Set(vivos('pedidos').map(p => semAcento(p.nome)));
  const acP = ac ? proxNum(ac) : null, out = [];
  for (let j = 0; j < q; j++) {
    out.push({r, nome: nomeNum(r, n + j, hash), principal: true});
    if (ac) {
      let nm = nomeNum(ac, n + j, acP.hash || hash);
      if (usados.has(semAcento(nm))) { nm = nomeNum(ac, acP.n, acP.hash || hash); acP.n++; }
      usados.add(semAcento(nm)); out.push({r: ac, nome: nm, principal: false});
    }
  }
  return out;
}
function formDaReceita(rid) {
  const rs = recsOrd();
  if (!rs.length) { toast('Cria a receita primeiro (aba Receitas, + Receita).', true); location.hash = 'receitas'; return; }
  const r0 = rec(rid) || rs[0], st0 = statsReceita(r0), at = ativosOrd();
  const corpo = `<div class="fgrid">
    ${campo('rec', 'Receita', selReceita('rec', r0.id), 'full')}
    <div class="sugbox full" id="recprev"></div>
    ${campo('qtd', 'Quantas', numInp('qtd', 1, 'min="1" max="50" step="1" inputmode="numeric"'))}
    ${campo('tipo', 'Tipo', sel('tipo', TIPOS, r0.tipoPadrao))}
    <label class="chk full" id="juntoBox"><input type="checkbox" name="junto" checked> <span id="juntoTxt"></span></label>
    ${campo('cliente', 'Cliente', inp('cliente', '', 'autocomplete="off" placeholder="vazio = pronta entrega"'))}
    ${campo('contato', 'Contato', inp('contato', '', 'autocomplete="off"'))}
    ${campo('horasEst', 'Horas estimadas (cada)', numInp('horasEst', st0.horas ?? ''))}
    ${campo('prazo', 'Prazo', inp('prazo', '', 'type="date"'))}
    ${campo('preco', 'Preço (cada, R$)', numInp('preco', st0.preco ?? ''))}
    ${campo('sinal', 'Sinal recebido (cada, R$)', numInp('sinal', ''))}
    ${campo('prio', 'Posição na fila', `<select id="prio" name="prio"><option value="fim">No fim da fila</option><option value="topo">No topo (prioridade máxima)</option>${at.map(a => `<option value="${esc(a.id)}">Depois de: ${esc(a.nome)}</option>`).join('')}</select>`, 'full')}
  </div>`;
  let ultRec = r0.id;
  abrirModal('Novo pedido de receita', corpo, {salvarTxt: 'Adicionar na fila',
    onInput: f => {
      const r = rec(f.rec.value); if (!r) return;
      if (r.id !== ultRec) { ultRec = r.id; const st = statsReceita(r); f.horasEst.value = st.horas ?? ''; f.preco.value = st.preco ?? ''; f.tipo.value = r.tipoPadrao; f.junto.checked = true; }
      const ac = r.acompanhaId ? rec(r.acompanhaId) : null;
      $('#juntoBox').hidden = !ac; $('#juntoTxt').textContent = ac ? `Fazer junto: ${ac.personagem} (mesmo número, ${ac.precoPadrao != null ? fR(ac.precoPadrao) : 'preço a definir'})` : '';
      const q = Math.max(1, Math.min(50, Math.round(num(f.qtd.value, 1)))), plano = planoReceita(r, q, f.junto.checked);
      const st = statsReceita(r);
      const info = st.prontos ? `média de ${fH(st.media)} nas ${st.prontos} ${plural(st.prontos, 'já feita', 'já feitas')}` : (st.total ? `${st.total} ${plural(st.total, 'pedido', 'pedidos')} dessa receita até agora` : 'primeira dessa receita');
      $('#recprev').innerHTML = `Vai criar: <b>${plano.map(x => esc(x.nome)).join(', ')}</b><br><span class="muted small">${info}</span>`;
    },
    onOk: d => {
      const r = rec(d.rec); if (!r) { erroModal('Escolhe a receita.'); return false; }
      const q = Math.round(num(d.qtd, 1)); if (!(q >= 1 && q <= 50)) { erroModal('Quantidade entre 1 e 50.'); return false; }
      const plano = planoReceita(r, q, d.junto && !!r.acompanhaId), ords = ordensPara(d.prio, plano.length), base = {cliente: d.cliente.trim(), contato: d.contato.trim(), prazo: d.prazo, status: 'Na fila', pago: false, pedidoEm: hoje(), entregueEm: '', lixo: false};
      plano.forEach((x, j) => {
        const st = x.principal ? null : statsReceita(x.r);
        const it = x.principal ? {tipo: d.tipo, horasEst: num(d.horasEst, 0), preco: num(d.preco), sinal: num(d.sinal, 0)} : {tipo: x.r.tipoPadrao, horasEst: st.horas || 0, preco: st.preco, sinal: 0};
        criar('pedidos', {...base, ...it, nome: x.nome, receitaId: x.r.id, ordem: ords[j]}, j === plano.length - 1 ? (plano.length === 1 ? `${x.nome} na fila` : `${plano.length} peças na fila`) : '');
      });
    }});
}
// ---- Receita passo a passo ----
// O texto (Markdown ou texto puro) vira uma lista de passos. Linhas tipo "R5: ...", "Rodada 5", "Carreira 3",
// "Volta 2", "Row 4" ou "5ª carreira" são rodadas; "R7-R10" vira quatro passos. Títulos (# ou "Cabeça:") são partes.
// O resto vira anotação, no lugar onde aparece. Sem rodadas reconhecidas, cada linha vira um passo.
const RE_ROD = /^\s*(?:[-*+>]\s+)?(?:\*\*|__)?((?:rodadas?|rod|rd|rnd|rounds?|carreiras?|carr|voltas?|fileiras?|rows?|r|c|v)\.?\s*)(\d+)(?:\s*(?:-|–|—|a|até|ate|ao|to)\s*(?:(?:rodadas?|rod|rd|rnd|r|carr|c|v|rows?)\.?\s*)?(\d+))?\s*(?:\*\*|__)?\s*(?:[:.)\-–—]\s*|\s+|$)(?:\*\*|__)?\s*(.*)$/i;
const RE_ROD2 = /^\s*(?:[-*+>]\s+)?(\d+)\s*[ªº°]\s*(?:(?:-|–|a|ao|até)\s*(\d+)\s*[ªº°]?\s*)?(rodadas?|carreiras?|voltas?|fileiras?)\b\s*[:.\-–—]?\s*(.*)$/i;
const RE_TOT = /\s*[([]\s*(\d+)\s*(?:p|pt|pts|pb|pontos?|sts?|m)?\.?\s*[)\]]\s*\.?\s*$/i;
const tirarMd = t => t.replace(/^\s*(?:[-*+>]\s+|\d+[.)]\s+)/, '').trim();
function linhaRod(l) {
  let m = RE_ROD.exec(l);
  if (m) {
    const pre = m[1].trim().replace(/\.$/, ''), ini = +m[2], fim = m[3] ? +m[3] : ini;
    return {pre: pre.length <= 2 ? pre.toUpperCase() : pre[0].toUpperCase() + pre.slice(1).toLowerCase().replace(/s$/, ''), ini, fim, txt: (m[4] || '').replace(/(\*\*|__)\s*$/, '').trim(), sep: pre.length > 2 ? ' ' : ''};
  }
  m = RE_ROD2.exec(l);
  if (m) { const pal = m[3].toLowerCase().replace(/s$/, ''); return {pre: pal[0].toUpperCase() + pal.slice(1), ini: +m[1], fim: m[2] ? +m[2] : +m[1], txt: (m[4] || '').trim(), sep: ' '}; }
  return null;
}
const memoPassos = new Map();
function passosReceita(texto) {
  texto = str(texto);
  if (memoPassos.has(texto)) return memoPassos.get(texto);
  const linhas = texto.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''));
  const temTitulo = linhas.some(l => /^\s*#{1,6}\s+\S/.test(l));
  const itens = linhas.map(l => {
    if (!l.trim() || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) return {k: 'vazio'};
    const h = /^\s*#{1,6}\s+(.*)$/.exec(l);
    if (h) return {k: 'sec', txt: h[1].replace(/[*_]/g, '').trim()};
    const r = linhaRod(l);
    if (r && r.fim >= r.ini && r.fim - r.ini < 200) return {k: 'rod', ...r};
    const t = tirarMd(l);
    if (!temTitulo && t.length <= 40 && /:$/.test(t) && !/\d/.test(t.slice(0, 2))) return {k: 'sec', txt: t.slice(0, -1).replace(/[*_]/g, '').trim()};
    if (!temTitulo && /^\*\*[^*]{1,40}\*\*:?$/.test(l.trim())) return {k: 'sec', txt: l.trim().replace(/[*:]/g, '').trim()};
    return {k: 'txt', txt: t, num: (/^\s*(\d+)[.)]\s+/.exec(l) || [])[1] || ''};
  });
  const nRod = itens.filter(x => x.k === 'rod').length, out = [];
  let sec = '', nota = [], aberto = null;
  const soltaNota = () => { if (nota.length) { out.push({sec, rot: '', txt: nota.join('\n'), nota: true}); nota = []; } };
  for (const x of itens) {
    if (x.k === 'vazio') { aberto = null; if (nRod < 2) continue; soltaNota(); continue; }
    if (x.k === 'sec') { aberto = null; soltaNota(); sec = x.txt; continue; }
    if (nRod >= 2) {
      if (x.k === 'rod') {
        soltaNota(); aberto = null;
        const tm = RE_TOT.exec(x.txt), tot = tm ? +tm[1] : null, n = x.fim - x.ini + 1, novos = [];
        for (let k = x.ini; k <= x.fim; k++) novos.push({sec, rot: x.pre + x.sep + k, txt: x.txt, tot, rep: n > 1 ? [k - x.ini + 1, n] : null});
        out.push(...novos);
        if (!x.txt) aberto = novos;
      } else if (aberto) {
        // "R1" sozinho na linha: a instrução vem nas linhas de baixo
        for (const y of aberto) { y.txt = y.txt ? y.txt + '\n' + x.txt : x.txt; const tm = RE_TOT.exec(y.txt); if (tm) y.tot = +tm[1]; }
      } else nota.push(x.txt);
    } else if (x.k === 'rod') {
      const tm = RE_TOT.exec(x.txt); out.push({sec, rot: x.pre + x.sep + x.ini, txt: x.txt, tot: tm ? +tm[1] : null});
    } else out.push({sec, rot: x.num, txt: x.txt, tot: null});
  }
  soltaNota();
  for (const x of out) if (!x.txt) x.txt = '(sem texto)';
  if (memoPassos.size > 30) memoPassos.clear();
  memoPassos.set(texto, out);
  return out;
}
const mdIn = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
const cortar = (t, n) => t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
function partesDe(t) {
  const sem = t.replace(RE_TOT, ''), out = []; let nv = 0, cur = '';
  for (const ch of sem) {
    if ('([{'.includes(ch)) nv++; else if (')]}'.includes(ch)) nv = Math.max(0, nv - 1);
    if ((ch === ',' || ch === ';') && !nv) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
function bolas(t) {
  const k = semAcento(t);
  return vivos('estoque').filter(e => e.hex && e.cor.length >= 3 && new RegExp('(^|[^a-z])' + escRe(semAcento(e.cor)) + '($|[^a-z])').test(k))
    .map(e => `<span class="bola" style="background:${e.hex}" title="${esc(e.cor)}"></span>`).join('');
}
const lerLS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const gravaLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
S.seg = lerLS('atelie-seg', null); S.segPartes = lerLS('atelie-seg-partes', false); S.segParte = 0; S.segLista = false; S.segLocal = null;
function segCtx() {
  const s = S.seg; if (!s) return null;
  const r = rec(s.rid); if (!r) return null;
  const p = s.pid ? ped(s.pid) : null;
  if (s.pid && (!p || p.lixo)) return null;
  const passos = passosReceita(r.texto), dono = p || r, chave = (p ? 'p' : 'r') + dono.id;
  let i = Math.round(dono.passo || 0);
  if (S.segLocal && S.segLocal.k === chave && Date.now() - S.segLocal.t < 4000) i = S.segLocal.i;
  return {r, p, passos, i: Math.max(0, Math.min(passos.length - 1, i)), chave};
}
function segAbre(rid, pid) {
  S.seg = {rid, pid: pid || ''}; gravaLS('atelie-seg', S.seg); S.segParte = 0; S.segLista = false;
  if (location.hash === '#seguir') render(); else location.hash = 'seguir';
}
function segIr(i, parte = 0) {
  const c = segCtx(); if (!c || !c.passos.length) return;
  const j = Math.max(0, Math.min(c.passos.length - 1, i));
  S.segParte = parte;
  if (j !== c.i) {
    S.segLocal = {k: c.chave, i: j, t: Date.now()};
    if (c.p) mudar('pedidos', c.p.id, {passo: j}); else mudar('receitas', c.r.id, {passo: j});
  }
  agenda();
}
function segPasso(d) {
  const c = segCtx(); if (!c || !c.passos.length) return;
  const partes = S.segPartes ? partesDe(c.passos[c.i].txt) : [];
  if (partes.length > 1) {
    const np = Math.min(S.segParte, partes.length - 1) + d;
    if (np >= 0 && np < partes.length) { S.segParte = np; agenda(); return; }
  }
  if (d > 0 && c.i >= c.passos.length - 1) { toast('Fim da receita!'); return; }
  if (d < 0 && c.i === 0) return;
  const pp = d < 0 && S.segPartes ? partesDe(c.passos[c.i - 1].txt) : [];
  segIr(c.i + d, pp.length > 1 ? pp.length - 1 : 0);
}
function segReceita(rid) {
  const r = rec(rid); if (!r) return;
  if (!passosReceita(r.texto).length) { formReceita(rid); return; }
  const ps = ativosOrd().filter(p => p.receitaId === rid && !FECHADOS.includes(p.status));
  if (!ps.length) return segAbre(rid, '');
  if (ps.length === 1 && ps[0].status === 'Fazendo') return segAbre(rid, ps[0].id);
  const n = passosReceita(r.texto).length;
  abrirModal('Seguir ' + r.personagem, `<p class="hint">Em qual peça? A rodada em que você parou fica guardada em cada peça.</p>
    <div class="lista">${ps.map(p => `<button type="button" class="tm-item" data-a="segAbrir" data-rid="${esc(rid)}" data-id="${esc(p.id)}"><span class="grow"><b>${esc(p.nome)}</b><span class="small muted">${esc(p.status)} · passo ${Math.min(n, (p.passo || 0) + 1)} de ${n}</span></span></button>`).join('')}
    <button type="button" class="tm-item" data-a="segAbrir" data-rid="${esc(rid)}" data-id=""><span class="grow"><b>Só ler a receita</b><span class="small muted">sem ligar a uma peça</span></span></button></div>`);
}
function listaPassos(passos, i) {
  let sec = null, h = '';
  passos.forEach((x, k) => {
    if (x.sec !== sec) { sec = x.sec; if (sec) h += `<h3 class="seg-sec">${esc(sec)}</h3>`; }
    h += `<div class="seg-li ${k === i ? 'on' : k < i ? 'ok' : ''} ${x.nota ? 'nota' : ''}" data-a="segIr" data-i="${k}" ${k === i ? 'id="segAqui"' : ''}>${x.rot ? `<b>${esc(x.rot)}</b> ` : ''}${mdIn(x.txt).replace(/\n/g, '<br>')}</div>`;
  });
  return `<div class="card seg-lista">${h}</div>`;
}
function vSeguir() {
  const c = segCtx();
  if (!c) return `<div class="empty">Escolhe uma receita na aba <a href="#receitas">Receitas</a> e toca em <b>Seguir</b>.</div>`;
  const {r, p, passos, i} = c;
  if (!passos.length) return `<div class="empty">${esc(r.personagem)} ainda não tem o texto da receita.<br><br><button class="btn pri" data-a="editReceita" data-id="${esc(r.id)}">Colar ou importar a receita</button></div>`;
  const ps = passos[i], prox = passos[i + 1], todas = partesDe(ps.txt), partes = S.segPartes && todas.length > 1 ? todas : [];
  const parte = Math.min(S.segParte, Math.max(0, partes.length - 1)), aqui = p && rodando() && S.timer.pedidoId === p.id;
  const corpo = partes.length ? `<div class="seg-partes">${partes.map((t, k) => `<span class="seg-pt ${k === parte ? 'on' : k < parte ? 'ok' : ''}">${bolas(t)}${mdIn(t)}</span>`).join('')}</div>`
    : `<div class="seg-txt">${bolas(ps.txt)}${mdIn(ps.txt).replace(/\n/g, '<br>')}</div>`;
  return `<div class="segue">
    <div class="seg-top"><button class="btn sm" data-a="nav" data-v="${p ? 'fila' : 'receitas'}">‹ ${p ? 'Fila' : 'Receitas'}</button><span class="sp"></span>
      ${p ? `<button class="btn sm ${aqui ? 'pri' : ''}" data-a="tmToggle" data-id="${esc(p.id)}">${aqui ? 'Pausar' : 'Timer'} <span class="num" ${aqui ? 'data-clk="total"' : ''}>${fT(segTotal(p))}</span></button>` : ''}
      <button class="btn sm" data-a="segLista">${S.segLista ? 'Passo a passo' : 'Ver tudo'}</button></div>
    <div><h2 class="seg-nome">${esc(r.personagem)}${p ? ` <span class="muted">· ${esc(p.nome)}</span>` : ''}</h2>
      <div class="seg-prog"><div class="bar"><i style="width:${Math.round((i + 1) / passos.length * 100)}%"></i></div><span class="small muted num">${i + 1} de ${passos.length}</span></div>
      ${ps.sec ? `<div class="small muted">${esc(ps.sec)}</div>` : ''}</div>
    ${S.segLista ? listaPassos(passos, i) : `
    <div class="seg-atual ${ps.nota ? 'nota' : ''}" data-a="segProx" role="button" tabindex="0" aria-label="Avançar">
      ${ps.rot ? `<div class="seg-rot">${esc(ps.rot)}${ps.rep ? ` <small>${ps.rep[0]} de ${ps.rep[1]}</small>` : ''}${ps.tot ? ` <span class="pill t-pronta">${ps.tot} pontos</span>` : ''}${partes.length ? ` <small>parte ${parte + 1} de ${partes.length}</small>` : ''}</div>` : (ps.nota ? '<div class="seg-rot nota">Anotação</div>' : '')}
      ${corpo}
    </div>
    <p class="seg-dps small muted">${prox ? `Depois: ${prox.rot ? '<b>' + esc(prox.rot) + '</b> ' : ''}${mdIn(cortar(prox.txt.replace(/\n/g, ' '), 90))}` : 'Último passo.'}</p>
    <div class="seg-btns"><button class="btn" data-a="segAnt" ${i === 0 && parte === 0 ? 'disabled' : ''}>‹ Voltar</button><button class="btn pri" data-a="segProx">Próxima ›</button></div>
    <div class="seg-opc">${todas.length > 1 || S.segPartes ? `<label class="chk"><input type="checkbox" data-c="segPartes" ${S.segPartes ? 'checked' : ''}> Passar cada rodada por partes (bom pra tapestry)</label>` : ''}
      <p class="hint">Toque no passo pra avançar.${AND ? ' Volume +: avança. Volume −: volta.' : ' No computador: espaço ou → avança, ← volta.'}</p></div>`}
  </div>`;
}
// ---- Contador do timer: um por peça, guardado no pedido ----
function contar(pid, sinal) {
  const p = ped(pid); if (!p) return;
  const n = p.contaPasso || 1;
  if (sinal < 0 && !(p.contador > 0)) return;
  mudar('pedidos', pid, {contador: increment(sinal < 0 ? -Math.min(n, p.contador) : n)});
}
function contaHtml(p) {
  const n = p.contaPasso || 1, v = p.contador || 0, id = esc(p.id);
  return `<div class="card tm-conta" data-id="${id}">
    <div class="tm-conta-top"><span class="small muted">Contador${n > 1 ? ` · de ${n} em ${n}` : ''}</span><span class="sp"></span><button class="btn sm" data-a="contaZerar" data-id="${id}" ${v ? '' : 'disabled'}>Zerar</button></div>
    <div class="tm-conta-row"><button class="btn tm-conta-menos" data-a="contaMenos" data-id="${id}" ${v ? '' : 'disabled'} aria-label="Menos ${n}">−${n}</button>
      <button class="tm-conta-n num" data-a="contaEditar" data-id="${id}" aria-label="Contador: ${v}. Toque pra mudar">${v}</button>
      <button class="btn pri tm-conta-mais" data-a="contaMais" data-id="${id}" aria-label="Mais ${n}">+${n}</button></div>
    <p class="hint">Fica guardado nesta peça. Toque no número pra escrever um valor ou mudar de quanto em quanto conta.${AND && !passosReceita(rec(p.receitaId)?.texto).length ? ' Volume + e − também contam.' : ''}</p></div>`;
}
function formConta(pid) {
  const p = ped(pid); if (!p) return;
  abrirModal('Contador de ' + p.nome, `<div class="fgrid">${campo('contador', 'Número', numInp('contador', p.contador || 0, 'min="0" step="1" inputmode="numeric"'))}
    ${campo('contaPasso', 'Contar de quanto em quanto', numInp('contaPasso', p.contaPasso || 1, 'min="1" step="1" inputmode="numeric"'))}</div>`, {onOk: d => {
    const v = Math.round(num(d.contador, 0)), n = Math.round(num(d.contaPasso, 1));
    if (!(v >= 0) || !(n >= 1)) { erroModal('Usa números inteiros: o contador a partir de 0 e o passo a partir de 1.'); return false; }
    mudar('pedidos', pid, {contador: v, contaPasso: n});
  }});
}

function recNoTimer(p) {
  const r = p && rec(p.receitaId), passos = r ? passosReceita(r.texto) : [];
  if (!passos.length) return '';
  if (!S.seg || S.seg.pid !== p.id) { S.seg = {rid: r.id, pid: p.id}; gravaLS('atelie-seg', S.seg); S.segParte = 0; }
  const c = segCtx(); if (!c) return '';
  const ps = passos[c.i];
  return `<div class="card tm-rec"><div class="small muted">Receita · passo ${c.i + 1} de ${passos.length}${ps.sec ? ' · ' + esc(ps.sec) : ''}</div>
    <div class="tm-rec-txt">${ps.rot ? `<b>${esc(ps.rot)}</b> ` : ''}${bolas(ps.txt)}${mdIn(cortar(ps.txt.replace(/\n/g, ' '), 160))}</div>
    <div class="tm-rec-btns"><button class="btn sm" data-a="segAnt" aria-label="Passo anterior">‹</button><button class="btn sm pri" data-a="segProx">Próxima ›</button><button class="btn sm" data-a="segPedido" data-id="${esc(p.id)}">Abrir receita</button></div></div>`;
}
async function textoDeArquivo(arq) {
  const nome = arq.name.toLowerCase();
  if (nome.endsWith('.pdf') || arq.type === 'application/pdf') {
    const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/legacy/build/';
    const pdfjs = await import(base + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({data: new Uint8Array(await arq.arrayBuffer())}).promise, out = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const tc = await (await doc.getPage(n)).getTextContent();
      let linha = '', y = null;
      for (const it of tc.items) {
        if (typeof it.str !== 'string') continue;
        const yy = Math.round(it.transform[5]);
        if (y !== null && Math.abs(yy - y) > 2 && linha.trim()) { out.push(linha.trim()); linha = ''; }
        linha += it.str; y = yy;
        if (it.hasEOL) { if (linha.trim()) out.push(linha.trim()); linha = ''; y = null; }
      }
      if (linha.trim()) out.push(linha.trim());
      out.push('');
    }
    const t = out.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!t) throw new Error('Esse PDF não tem texto (parece foto ou scan). Dá pra digitar ou colar a receita.');
    return t;
  }
  if (/\.(md|markdown|txt|text)$/.test(nome) || /^text\//.test(arq.type)) return (await arq.text()).replace(/^﻿/, '');
  throw new Error('Formato não suportado. Usa .md, .txt ou .pdf.');
}
function resumoPassos(t) {
  const ps = passosReceita(t); if (!ps.length) return 'Sem passos ainda.';
  const rods = ps.filter(x => !x.nota).length, secs = new Set(ps.map(x => x.sec).filter(Boolean)).size;
  return `${ps.length} ${plural(ps.length, 'passo', 'passos')}: ${rods} ${plural(rods, 'rodada', 'rodadas')}${ps.length - rods ? ` e ${ps.length - rods} ${plural(ps.length - rods, 'anotação', 'anotações')}` : ''}${secs ? ` em ${secs} ${plural(secs, 'parte', 'partes')}` : ''}.`;
}

function formHoras(pid, hid) {
  const h = hid ? S.horas.find(x => x.id === hid) : null;
  const padrao = h?.pedidoId || pid || (ativosOrd().find(p => p.status === 'Fazendo') || ativosOrd()[0])?.id || '';
  const corpo = `<div class="fgrid">
    ${campo('pedidoId', 'Em qual peça', selPedido('pedidoId', padrao, false), 'full')}
    ${campo('data', 'Dia', inp('data', h?.data || hoje(), 'type="date"'))}
    ${campo('horas', 'Horas', numInp('horas', h?.horas, 'placeholder="Ex.: 1,5"'))}
    <p class="hint full">Ou preenche início e fim que eu calculo:</p>
    ${campo('inicio', 'Início', inp('inicio', h?.inicio, 'type="time"'))}
    ${campo('fim', 'Fim', inp('fim', h?.fim, 'type="time"'))}
  </div>`;
  const extra = h ? `<button type="button" class="btn bad" data-a="excluir" data-col="horas" data-id="${esc(h.id)}">Excluir</button>`
    : '';
  abrirModal(h ? 'Editar sessão' : 'Sessão esquecida', corpo, {extra, salvarTxt: h ? 'Salvar' : 'Lançar',
    onOk: d => {
      if (!d.pedidoId) { erroModal('Escolhe a peça.'); return false; }
      let horas = num(d.horas);
      if (horas == null && d.inicio && d.fim) { const [a, b] = [d.inicio, d.fim].map(t => { const [x, y] = t.split(':').map(Number); return x * 60 + y; }); horas = Math.round(((b - a + 1440) % 1440) / 60 * 100) / 100; }
      if (!horas || horas <= 0) { erroModal('Põe as horas, ou o início e o fim.'); return false; }
      const patch = {pedidoId: d.pedidoId, data: d.data || hoje(), horas, inicio: d.inicio, fim: d.fim};
      if (h) mudar('horas', h.id, patch, 'Horas salvas');
      else { patch.lixo = false; criar('horas', patch, fH(horas) + ' em ' + nomePed(d.pedidoId)); }
    }});
}
function formCompra(cid, pre = {}) {
  const c = cid ? S.compras.find(x => x.id === cid) : null, v = c || pre;
  const corpo = `<div class="fgrid">
    ${campo('item', 'O que comprar', inp('item', v.item, 'required autocomplete="off" placeholder="Ex.: Novelo vermelho"'), 'full')}
    ${campo('tipo', 'Tipo', sel('tipo', TIPOS_COMPRA, v.tipo || 'Novelo'))}
    ${campo('cor', 'Cor / código', inp('cor', v.cor, 'autocomplete="off"'))}
    ${campo('qtd', 'Quantidade', numInp('qtd', v.qtd ?? 1))}
    ${campo('precoUn', 'Preço de cada (R$)', numInp('precoUn', v.precoUn ?? C().precoNovelo))}
    ${campo('pedidoId', 'Pra qual peça', selPedido('pedidoId', v.pedidoId || '', true))}
    ${campo('onde', 'Onde', inp('onde', v.onde ?? 'Casa das Linhas', 'autocomplete="off"'))}
    <label class="chk full"><input type="checkbox" name="comprado" ${v.comprado ? 'checked' : ''}> Já comprei</label>
    <p class="hint full">Compra ligada a uma peça entra no custo dela. Compra de "Estoque" só entra nos gastos.</p>
  </div>`;
  const extra = c ? `<button type="button" class="btn bad" data-a="excluir" data-col="compras" data-id="${esc(c.id)}">Excluir</button>` : '';
  abrirModal(c ? 'Editar compra' : 'Nova compra ou gasto', corpo, {extra,
    onOk: d => {
      if (!d.item.trim()) { erroModal('Diz o que é a compra.'); return false; }
      const patch = {item: d.item.trim(), tipo: d.tipo, cor: d.cor.trim(), qtd: num(d.qtd, 1), precoUn: num(d.precoUn, 0), pedidoId: d.pedidoId,
        onde: d.onde.trim(), comprado: d.comprado, compradoEm: d.comprado ? (c?.compradoEm || hoje()) : ''};
      if (c) mudar('compras', c.id, patch, 'Compra salva'); else { patch.lixo = false; criar('compras', patch, 'Compra adicionada'); }
    }});
}
function formCor(eid) {
  const e = eid ? S.estoque.find(x => x.id === eid) : null;
  const hx = e?.hex || '';
  const corpo = `${campo('cor', 'Cor', inp('cor', e?.cor, 'required autocomplete="off"'))}${campo('situacao', 'Situação', sel('situacao', SIT, e?.situacao || 'Tem'))}
    <div class="field"><label>Cor de verdade</label><div class="corbox"><span class="sw big" id="hexSw" style="${hx ? 'background:' + hx : ''}"></span><code id="hexTxt">${hx || 'sem cor'}</code>
      <input type="hidden" name="hex" id="hex" value="${esc(hx)}"><span class="sp"></span>
      <label class="btn sm" for="fotoCor">Tirar foto</label><input type="file" id="fotoCor" accept="image/*" hidden>
      <label class="btn sm" for="hexPick">Escolher</label><input type="color" id="hexPick" value="${hx || '#888888'}" class="vh">
      ${hx ? '<button type="button" class="btn sm" data-a="corLimpar">Limpar</button>' : ''}</div>
      <p class="hint">Tira uma foto de perto do novelo: o app pega a cor do meio da foto.</p></div>`;
  const extra = e ? `<button type="button" class="btn bad" data-a="excluir" data-col="estoque" data-id="${esc(e.id)}">Excluir</button>` : '';
  abrirModal(e ? 'Editar cor' : 'Nova cor no estoque', corpo, {extra, onOk: d => {
    if (!d.cor.trim()) { erroModal('Diz a cor.'); return false; }
    const patch = {cor: d.cor.trim(), situacao: d.situacao, hex: d.hex || ''};
    if (e) mudar('estoque', e.id, patch, 'Cor salva');
    else { const mx = Math.max(0, ...vivos('estoque').map(x => x.ordem).filter(x => x < 1e6)); criar('estoque', {...patch, ordem: mx + 1, lixo: false}, 'Cor adicionada'); }
  }});
}
function setHex(h) {
  const i = $('#hex'); if (!i) return;
  i.value = h; $('#hexTxt').textContent = h || 'sem cor'; $('#hexSw').style.background = h || '';
}
async function corDaFoto(file) {
  const bmp = await createImageBitmap(file), n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d', {willReadFrequently: true}), k = Math.min(bmp.width, bmp.height) * 0.35;
  g.drawImage(bmp, (bmp.width - k) / 2, (bmp.height - k) / 2, k, k, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n).data, px = [];
  for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2], 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]]);
  px.sort((x, y) => x[3] - y[3]);
  let R = 0, G = 0, B = 0, c = 0;
  for (let i = Math.floor(px.length * 0.15); i < Math.ceil(px.length * 0.85); i++) { R += px[i][0]; G += px[i][1]; B += px[i][2]; c++; }
  return '#' + [R, G, B].map(v => Math.round(v / c).toString(16).padStart(2, '0')).join('');
}
function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
  if (!dd) return [0, 0, l];
  const sat = dd / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / dd + 6) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  return [h * 60, sat, l];
}
function formReceita(rid) {
  const r = rid ? S.receitas.find(x => x.id === rid) : null;
  const corpo = `<div class="fgrid">${campo('personagem', 'Personagem', inp('personagem', r?.personagem, 'required autocomplete="off"'), 'full')}
    ${campo('fonte', 'Fonte', sel('fonte', FONTES, r?.fonte || 'Própria'))}${campo('autor', 'Autor', inp('autor', r?.autor ?? 'Você'))}
    ${campo('altura', 'Altura (cm)', numInp('altura', r?.altura))}${campo('arquivo', 'Arquivo ou link', inp('arquivo', r?.arquivo))}
    <p class="hint full">Pro botão <b>+ Da receita</b>: ele numera sozinho (Lula 1, Lula 2...) e preenche com o que estiver abaixo. Vazio = usa a média das peças já feitas.</p>
    ${campo('tipoPadrao', 'Tipo', sel('tipoPadrao', TIPOS, r?.tipoPadrao || 'Receita pronta'))}
    ${campo('horasPadrao', 'Horas por peça', numInp('horasPadrao', r?.horasPadrao, r ? `placeholder="${(() => { const st = statsReceita(r); return st.media != null ? 'média: ' + fN(st.media) : ''; })()}"` : ''))}
    ${campo('precoPadrao', 'Preço (R$)', numInp('precoPadrao', r?.precoPadrao, 'placeholder="0 = brinde"'))}
    ${campo('acompanhaId', 'Fazer junto (acessório)', `<select id="acompanhaId" name="acompanhaId"><option value="">Nada</option>${recsOrd().filter(x => !r || x.id !== r.id).map(x => `<option value="${esc(x.id)}"${r && x.id === r.acompanhaId ? ' selected' : ''}>${esc(x.personagem)}</option>`).join('')}</select>`)}
    <div class="field full"><label for="texto">Receita (texto)</label>
      <textarea id="texto" name="texto" rows="12" spellcheck="false" placeholder="Cola aqui ou importa um arquivo. Exemplo:&#10;# Cabeça&#10;R1: 6 pb no anel mágico (6)&#10;R2: 6 aum (12)&#10;R3-R5: 1 pb em cada (12)">${esc(r?.texto || '')}</textarea></div>
    <div class="full rec-imp"><label class="btn sm" for="recArq">Importar arquivo</label><input type="file" id="recArq" accept=".md,.markdown,.txt,.pdf,text/plain,text/markdown,application/pdf" hidden>
      <span class="small muted">.md, .txt ou .pdf (do PDF vem só o texto)</span></div>
    <p class="hint full" id="recPassos"></p></div>`;
  const extra = r ? `<button type="button" class="btn bad" data-a="excluir" data-col="receitas" data-id="${esc(r.id)}">Excluir</button>` : '';
  abrirModal(r ? 'Editar receita' : 'Nova receita', corpo, {extra, onInput: fm => { $('#recPassos').textContent = resumoPassos(fm.texto.value); }, onOk: d => {
    if (!d.personagem.trim()) { erroModal('Diz o personagem.'); return false; }
    const patch = {personagem: d.personagem.trim(), fonte: d.fonte, autor: d.autor.trim(), altura: num(d.altura), arquivo: d.arquivo.trim(),
      tipoPadrao: d.tipoPadrao, horasPadrao: num(d.horasPadrao), precoPadrao: num(d.precoPadrao), acompanhaId: d.acompanhaId || '', texto: (d.texto || '').replace(/\s+$/, '')};
    if (patch.texto.length > 600000) { erroModal('Texto grande demais (mais de 600 mil letras).'); return false; }
    if (r) mudar('receitas', r.id, patch, 'Receita salva'); else { patch.lixo = false; criar('receitas', patch, 'Receita adicionada'); }
  }});
}

function salvaSessao() {
  const t = S.timer; if (!rodando()) return;
  const ini = new Date(t.inicio), fim = new Date(), seg = (fim - ini) / 1000;
  if (seg >= 10) {
    const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
    criar('horas', {pedidoId: t.pedidoId, data: isoDia(ini), horas: Math.round(seg / 36) / 100, inicio: hm(ini), fim: hm(fim), lixo: false});
  }
}
function timerStart(pid) {
  if (!pid) return;
  if (rodando()) { if (S.timer.pedidoId === pid) return; salvaSessao(); }
  const p = ped(pid);
  if (p && ['Na fila', 'Esperando fio'].includes(p.status)) mudar('pedidos', pid, {status: 'Fazendo'});
  S.timer = {pedidoId: pid, inicio: agora()};
  mudarMeta('timer', {...S.timer});
  agenda();
}
function timerPausa() {
  if (!rodando()) return;
  salvaSessao();
  S.timer = {pedidoId: null, inicio: null};
  mudarMeta('timer', {...S.timer});
  agenda();
}
function terminei(pid) {
  const p = ped(pid); if (!p) return;
  confirmar('Terminou ' + p.nome + '?', `Vai ficar como <b>Pronto</b> com ${fT(segTotal(p))} de trabalho. Dá pra mudar o status depois na Fila.`, 'Terminei', () => {
    if (rodando() && S.timer.pedidoId === pid) timerPausa();
    mudar('pedidos', pid, {status: 'Pronto'}, p.nome + ' pronto!');
    S.tp = null; agenda();
  });
}
function renderTimer() {
  const b = $('#timerbar');
  if (!S.user || !rodando() || S.view === 'timer') { b.hidden = true; b.innerHTML = ''; return; }
  const p = ped(S.timer.pedidoId);
  b.hidden = false;
  b.innerHTML = `<div class="in"><span>Rodando: <b>${esc(nomePed(S.timer.pedidoId))}</b> <b class="num" data-clk="total">${p ? fT(segTotal(p)) : ''}</b></span><span class="sp"></span>
    <button class="ghost" data-a="nav" data-v="timer">Abrir timer</button><button data-a="tmPausa">Pausar</button></div>`;
}
setInterval(() => {
  if (!rodando()) return;
  const p = ped(S.timer.pedidoId); if (!p) return;
  const tot = segTotal(p);
  document.querySelectorAll('[data-clk="total"]').forEach(e => e.textContent = fT(tot));
  document.querySelectorAll('[data-clk="sess"]').forEach(e => e.textContent = fT(segAtual()));
  const bar = $('#tmBar'); if (bar && p.horasEst > 0) bar.style.width = Math.min(100, tot / 36 / p.horasEst) + '%';
}, 500);
let wl = null, telaAnd = null;
async function tela(on) {
  if (AND) { if (on !== telaAnd) { telaAnd = on; andMsg('tela', {on}); } return; }
  try {
    if (on && !wl && 'wakeLock' in navigator && document.visibilityState === 'visible') { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    else if (!on && wl) { const w = wl; wl = null; await w.release(); }
  } catch {}
}
const querTela = () => (S.view === 'timer' && rodando()) || (S.view === 'seguir' && !!segCtx());
document.addEventListener('visibilitychange', () => { tela(querTela()); if (document.visibilityState === 'visible') tentaRecarregar(); });

function vTimer() {
  const run = rodando();
  const pid = S.tp === 'escolher' ? null : (S.tp || (run ? S.timer.pedidoId : null));
  const p = pid ? ped(pid) : null;
  if (!p) {
    const at = ativosOrd().filter(x => x.status !== 'Pronto');
    return `<div class="tm-pick"><h2>Em qual peça você vai trabalhar?</h2>
      <div class="lista">${at.length ? at.map(x => `<button class="tm-item" data-a="tmEscolher" data-id="${esc(x.id)}"><span class="grow"><b>${esc(x.nome)}</b><span class="small muted">${esc(x.status)}${x.horasEst ? ' · estimado ' + fH(x.horasEst) : ''}${x.contador ? ' · contador ' + x.contador : ''}</span></span>
        <span class="num tm-t" ${run && S.timer.pedidoId === x.id ? 'data-clk="total"' : ''}>${fT(segTotal(x))}</span>${run && S.timer.pedidoId === x.id ? '<span class="pill t-pronta">rodando</span>' : ''}</button>`).join('') : '<div class="empty">Nenhuma peça na fila. Cria um pedido primeiro.</div>'}</div></div>`;
  }
  const aqui = run && S.timer.pedidoId === p.id, outro = run && !aqui;
  const tot = segTotal(p);
  return `<div class="tm">
    <div class="tm-top"><button class="btn sm" data-a="tmTrocar">‹ Trocar peça</button><span class="sp"></span><span class="pill ${TIPO_CLS[p.tipo]}">${esc(p.tipo)}</span></div>
    <h2 class="tm-nome">${esc(p.nome)}</h2>
    <div class="tm-clock num ${aqui ? 'on' : ''}" ${aqui ? 'data-clk="total"' : ''}>${fT(tot)}</div>
    <div class="tm-sub">${aqui ? 'esta sessão <b class="num" data-clk="sess">' + fT(segAtual()) + '</b>' : 'pausado'}</div>
    ${p.horasEst > 0 ? `<div class="tm-prog"><div class="bar"><i id="tmBar" style="width:${Math.min(100, tot / 36 / p.horasEst)}%"></i></div><span>estimado ${fH(p.horasEst)}</span></div>` : ''}
    ${outro ? `<p class="aviso small">O timer está rodando em <b>${esc(nomePed(S.timer.pedidoId))}</b>. Começar aqui pausa lá e salva o tempo.</p>` : ''}
    <button class="tm-go ${aqui ? 'on' : ''}" data-a="tmToggle" data-id="${esc(p.id)}">${aqui ? 'Pausar' : tot > 0 ? 'Continuar' : 'Começar'}</button>
    <button class="btn tm-done" data-a="tmTerminei" data-id="${esc(p.id)}">Terminei</button>
    ${contaHtml(p)}
    ${recNoTimer(p)}
  </div>`;
}

function kv(linhas) { return `<dl class="kv">${linhas.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c || ''}">${v}</dd>`).join('')}</dl>`; }
function barra(frac, rot) { return `<div class="meta-bar"><div class="head small"><span>${rot}</span><span class="sp"></span><b>${frac == null ? '–' : fP(frac)}</b></div><div class="bar"><i style="width:${Math.round((frac || 0) * 100)}%"></i></div></div>`; }
function grafico() {
  const rows = ativosOrd().map(p => ({id: p.id, n: p.nome, v: calcP(p).restam})).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
  if (!rows.length) return '<p class="muted">Nada pra fazer na fila.</p>';
  const max = Math.max(...rows.map(r => r.v)), tot = rows.reduce((a, r) => a + r.v, 0);
  return `<div class="hbars">${rows.map(r => `<div class="hb" data-a="editPedido" data-id="${esc(r.id)}" title="${esc(r.n)}: faltam ${esc(fH(r.v))}"><span class="hb-n">${esc(r.n)}</span><span class="hb-t"><i style="width:${Math.max(3, Math.round(r.v / max * 100))}%"></i></span><b class="hb-v">${esc(fH(r.v))}</b></div>`).join('')}</div>
    <p class="small muted hb-tot">${rows.length} ${plural(rows.length, 'peça', 'peças')} · ${fH(tot)} no total</p>`;
}
function vPainel() {
  const k = kpis();
  return `<section class="acoes" aria-label="Atalhos">
    <button class="acao pri" data-a="nav" data-v="timer">Timer<span>${rodando() ? 'rodando em ' + esc(nomePed(S.timer.pedidoId)) : 'escolhe a peça e aperta'}</span></button>
    <button class="acao" data-a="novoPedido">+ Pedido<span>entra na fila</span></button>
    <button class="acao" data-a="pedidoReceita">+ Da receita<span>numera sozinho</span></button>
    <button class="acao" data-a="novaCompra">+ Compra<span>ou gasto</span></button>
    <button class="acao" data-a="nav" data-v="estoque">Estoque<span>${vivos('estoque').filter(e => ['Pouco', 'Acabou'].includes(e.situacao)).length} cores acabando</span></button>
  </section>
  <div class="grid2">
    <section class="card"><h2>Fila</h2>${kv([['Pedidos em aberto', k.abertos], ['Horas de trabalho na fila', fH(k.horasFila)], ['Próxima peça', esc(k.proxima)], ['Prazo mais perto', k.prazo], ['Peças atrasadas', k.atrasadas, k.atrasadas > 0 ? 'bad' : '']])}</section>
    <section class="card"><h2>Horas que faltam por peça</h2>${grafico()}</section>
    <section class="card"><h2>Dinheiro</h2>${kv([['Faturamento previsto', fR(k.fat)], ['Já recebido', fR(k.recebido)], ['Gastos (compras feitas)', fR(k.gastos)], ['Saldo em caixa', fR(k.saldo), k.saldo < 0 ? 'bad' : 'good'], ['Compras pendentes', fR(k.pend)], ['Lucro previsto', fR(k.lucro)], ...(k.brindes ? [[`Brindes (${k.brindes} ${plural(k.brindes, 'peça', 'peças')}, custo)`, fR(-k.custoBrindes), 'bad']] : [])])}</section>
    <section class="card"><h2>Natal</h2>${kv([['Meta', k.meta ? fR(k.meta) : 'coloca na Config'], ['Já tenho', fR(Math.max(0, k.saldo))], ['Se a fila toda pagar', fR(Math.max(0, k.saldo + k.aReceber)), 'good']])}${k.meta ? `${barra(k.jaTenho, 'Já tenho')}${barra(k.seFila, 'Se a fila toda pagar')}` : ''}</section>
    <section class="card"><h2>Horas</h2>${kv([['Trabalhadas no total', fH(k.hTotal)], ['Nesta semana', fH(k.hSemana)], ['Sua hora real (peças vendidas e entregues)', k.horaReal == null ? 'sem vendas entregues ainda' : fR(k.horaReal) + '/h', k.horaReal != null && k.horaReal < 10 ? 'bad' : ''], ...(k.vendidas ? [['Base do cálculo', `${k.vendidas} ${plural(k.vendidas, 'peça', 'peças')} · ${fH(k.hVendidas)}`]] : []), ...(k.brindes ? [['Horas em brindes (fora da conta)', fH(k.hBrindes)]] : [])])}
      ${k.vendidas && k.hVendidas < 3 ? '<p class="hint">Com poucas horas vendidas, esse número ainda pula bastante.</p>' : ''}</section>
  </div>`;
}
function cardPedido(p, pos, primeiro, ultimo) {
  const c = calcP(p), saiu = SAIU.includes(p.status);
  let prazo = '';
  if (p.prazo) { const d = c.dias, cls = (!saiu && d < 0) ? 'bad' : (!saiu && d != null && d <= 3) ? 'warn' : '';
    const txt = saiu ? fData(p.prazo) : d < 0 ? `${fData(p.prazo)} · ${-d} ${plural(-d, 'dia', 'dias')} atrasado` : d === 0 ? `${fData(p.prazo)} · hoje` : `${fData(p.prazo)} · em ${d} ${plural(d, 'dia', 'dias')}`;
    prazo = `<span class="prazo ${cls}">Prazo ${txt}</span>`; }
  return `<article class="ped" data-s="${esc(p.status)}">
    <div class="ped-top">${pos ? `<span class="pos">${pos}º</span>` : ''}<h3 data-a="editPedido" data-id="${esc(p.id)}" tabindex="0">${esc(p.nome)}</h3>
      <select class="status ${ST_CLS[p.status]}" data-c="status" data-id="${esc(p.id)}" aria-label="Status de ${esc(p.nome)}">${opts(STATUS, p.status)}</select></div>
    <div class="ped-meta"><span class="pill ${TIPO_CLS[p.tipo]}">${esc(p.tipo)}</span>${p.preco === 0 ? '<span class="pill t-acessorio">Brinde</span>' : ''}${p.cliente ? `<span>${esc(p.cliente)}</span>` : ''}${p.contato ? `<span>${esc(p.contato)}</span>` : ''}${prazo}</div>
    <div class="prog"><div class="bar"><i style="width:${Math.round(c.pct * 100)}%"></i></div><span class="num">${fH(c.f)} de ${fH(p.horasEst)}${c.restam > 0 ? ' · faltam ' + fH(c.restam) : ''}</span></div>
    <div class="nums">
      <div><small>Preço</small><b>${p.preco == null ? 'a definir' : fR(p.preco)}</b></div>
      <div class="sug"><small>Sugerido</small><b>${fR(c.sug)}</b></div>
      <div><small>Sinal</small><b>${fR(p.sinal)}</b></div>
      <div><small>A receber</small><b>${fR(c.aReceber)}</b></div>
      <div class="${c.lucro != null && c.lucro < 0 ? 'bad' : ''}"><small>Lucro</small><b>${fR(c.lucro)}</b></div>
      <div class="${c.rph != null && c.rph < 10 ? 'bad' : ''}"><small>Sua hora</small><b>${c.brinde ? 'brinde' : c.rph == null ? '–' : fR(c.rph) + '/h'}</b></div>
    </div>
    <div class="ped-acts">
      <label class="chk"><input type="checkbox" data-c="pago" data-id="${esc(p.id)}" ${p.pago ? 'checked' : ''}> Pago</label>
      ${saiu ? '' : `<button class="btn sm ${rodando() && S.timer.pedidoId === p.id ? 'pri' : ''}" data-a="tmAbrir" data-id="${esc(p.id)}">Timer <span class="num" ${rodando() && S.timer.pedidoId === p.id ? 'data-clk="total"' : ''}>${fT(segTotal(p))}</span></button>`}
      ${(() => { const rr = rec(p.receitaId), n = rr ? passosReceita(rr.texto).length : 0; return n && !saiu ? `<button class="btn sm" data-a="segPedido" data-id="${esc(p.id)}">Receita <span class="num">${Math.min(n, (p.passo || 0) + 1)}/${n}</span></button>` : ''; })()}
      <span class="sp"></span>
      ${pos ? `<button class="icon" data-a="subir" data-id="${esc(p.id)}" aria-label="Subir ${esc(p.nome)} na fila" ${primeiro ? 'disabled' : ''}>↑</button><button class="icon" data-a="descer" data-id="${esc(p.id)}" aria-label="Descer ${esc(p.nome)} na fila" ${ultimo ? 'disabled' : ''}>↓</button>` : ''}
      <button class="btn sm" data-a="editPedido" data-id="${esc(p.id)}">Editar</button>
    </div></article>`;
}
function vFila() {
  const at = ativosOrd(), saiu = vivos('pedidos').filter(p => SAIU.includes(p.status)).sort((a, b) => (b.entregueEm || '').localeCompare(a.entregueEm || ''));
  return `<div class="head"><h2>Fila (${at.length})</h2><span class="sp"></span><button class="btn" data-a="pedidoReceita">+ Da receita</button><button class="btn pri" data-a="novoPedido">+ Pedido</button></div>
  <div class="lista">${at.length ? at.map((p, i) => cardPedido(p, i + 1, i === 0, i === at.length - 1)).join('') : '<div class="empty">Fila vazia. Toque em + Pedido.</div>'}</div>
  ${saiu.length ? `<details ${S.verSaiu ? 'open' : ''} data-t="verSaiu"><summary>Entregues e cancelados (${saiu.length})</summary><div class="lista" style="margin-top:10px">${saiu.map(p => cardPedido(p, 0)).join('')}</div></details>` : ''}`;
}
function vHoras() {
  const hs = vivos('horas').slice().sort((a, b) => (b.data + b.inicio).localeCompare(a.data + a.inicio));
  const k = kpis(); const porDia = {};
  hs.forEach(h => (porDia[h.data] = porDia[h.data] || []).push(h));
  const dias = Object.keys(porDia).sort().reverse();
  return `<div class="head"><h2>Horas</h2><span class="sp"></span><button class="btn sm" data-a="lancarHoras">Sessão esquecida</button><button class="btn pri" data-a="nav" data-v="timer">Abrir timer</button></div>
  <p class="hint">Cada vez que você pausa o timer vira uma sessão aqui. Se esqueceu o timer ligado, edita a sessão.</p>
  <div class="card">${kv([['Nesta semana', fH(k.hSemana)], ['No total', fH(k.hTotal)]])}</div>
  <div class="card">${dias.length ? dias.map(d => `<div><h3 class="small muted" style="margin:6px 0">${fData(d)} · ${fH(porDia[d].reduce((a, h) => a + h.horas, 0))}</h3>
    ${porDia[d].map(h => `<div class="row"><span class="grow"><b>${esc(nomePed(h.pedidoId))}</b>${h.inicio && h.fim ? ` <span class="muted small">${esc(h.inicio)} às ${esc(h.fim)}</span>` : ''}</span><b class="num">${fH(h.horas)}</b><button class="btn sm" data-a="editHoras" data-id="${esc(h.id)}">Editar</button></div>`).join('')}</div>`).join('') : '<div class="empty">Nenhuma hora lançada ainda.</div>'}</div>`;
}
function linhaCompra(c) {
  return `<div class="row ${c.comprado ? 'feito' : ''}"><label class="chk" title="Comprado"><input type="checkbox" data-c="comprado" data-id="${esc(c.id)}" ${c.comprado ? 'checked' : ''} aria-label="Comprei ${esc(c.item)}"></label>
    <span class="grow"><b>${esc(c.item)}</b>${c.cor ? ` <span class="muted">· ${esc(c.cor)}</span>` : ''}<br><span class="small muted">${esc(c.tipo)} · pra ${esc(nomePed(c.pedidoId))}${c.onde ? ' · ' + esc(c.onde) : ''}</span></span>
    <span class="num small muted">${fN(c.qtd)} × ${fR(c.precoUn)}</span><b class="num">${fR(c.qtd * c.precoUn)}</b><button class="btn sm" data-a="editCompra" data-id="${esc(c.id)}">Editar</button></div>`;
}
function vCompras() {
  const cs = vivos('compras'), pend = cs.filter(c => !c.comprado), feitasC = cs.filter(c => c.comprado).sort((a, b) => (b.compradoEm || '').localeCompare(a.compradoEm || ''));
  const tp = pend.reduce((a, c) => a + c.qtd * c.precoUn, 0), tf = feitasC.reduce((a, c) => a + c.qtd * c.precoUn, 0);
  return `<div class="head"><h2>Compras e gastos</h2><span class="sp"></span><button class="btn pri" data-a="novaCompra">+ Compra</button></div>
  <div class="card"><div class="head"><h3>Pra comprar</h3><span class="sp"></span><b class="num">${fR(tp)}</b>${pend.length > 1 ? '<button class="btn sm" data-a="comprarTudo">Comprei tudo</button>' : ''}</div>${pend.length ? pend.map(linhaCompra).join('') : '<p class="muted">Nada pendente.</p>'}</div>
  ${feitasC.length ? `<details class="card" ${S.verComprados ? 'open' : ''} data-t="verComprados"><summary>Já comprado · ${fR(tf)}</summary>${feitasC.map(linhaCompra).join('')}</details>` : ''}`;
}
function ordEstoque() { try { return localStorage.getItem('estoqueOrdem') || 'az'; } catch { return 'az'; } }
function vEstoque() {
  const o = ordEstoque(), es = vivos('estoque');
  if (o === 'cor') es.sort((a, b) => {
    if (!a.hex || !b.hex) return (!a.hex) - (!b.hex) || a.cor.localeCompare(b.cor);
    const [ha, sa, la] = hsl(a.hex), [hb, sb, lb] = hsl(b.hex), ca = sa < 0.15 || la < 0.1 || la > 0.92, cb = sb < 0.15 || lb < 0.1 || lb > 0.92;
    return ca - cb || (ca ? lb - la : (ha - hb) || (lb - la));
  });
  else es.sort((a, b) => a.cor.localeCompare(b.cor, 'pt-BR'));
  return `<div class="head"><h2>Estoque</h2><span class="sp"></span>
    <span class="seg" role="group" aria-label="Ordenar"><button class="${o === 'az' ? 'on' : ''}" data-a="estOrdem" data-v="az">A–Z</button><button class="${o === 'cor' ? 'on' : ''}" data-a="estOrdem" data-v="cor">Por cor</button></span>
    <button class="btn pri" data-a="novaCor">+ Cor</button></div>
  <p class="hint">Toque na situação pra trocar. Toque no nome pra pôr a cor de verdade (dá pra tirar foto do novelo).</p>
  <div class="card">${es.length ? es.map(e => `<div class="row"><span class="sw" style="${e.hex ? 'background:' + e.hex : ''}" title="${esc(e.hex || 'sem cor')}"></span><span class="grow"><b data-a="editCor" data-id="${esc(e.id)}" style="cursor:pointer">${esc(e.cor)}</b></span>
    ${['Pouco', 'Acabou', 'Não tenho'].includes(e.situacao) ? `<button class="btn sm" data-a="corNaLista" data-id="${esc(e.id)}">Pôr na lista</button>` : ''}
    <button class="sit sit-${e.situacao === 'Não tenho' ? 'Nao' : e.situacao}" data-a="ciclarSit" data-id="${esc(e.id)}" aria-label="${esc(e.cor)}: ${esc(e.situacao)}. Toque pra trocar">${esc(e.situacao)}</button></div>`).join('') : '<div class="empty">Nenhuma cor ainda.</div>'}</div>`;
}
function vCalc() {
  const cf = C();
  return `<h2>Calculadora de preço</h2><p class="hint">É só sugestão: quem fecha o preço é você. As porcentagens ficam na Config.</p>
  <div class="calc"><div class="card">
    ${campo('cHoras', 'Horas que você acha que vai levar', numInp('cHoras', S.calc.horas))}
    ${campo('cTipo', 'Tipo', sel('cTipo', TIPOS, S.calc.tipo))}
    ${campo('cRec', 'Receita (opcional)', selReceita('cRec', S.calc.rid, 'Nenhuma'))}
    ${campo('cNov', 'Novelos novos só pra essa peça', numInp('cNov', S.calc.novelos))}
    ${campo('cOut', 'Outros gastos da peça (R$)', numInp('cOut', S.calc.outros))}
    ${cf.urgencia > 0 ? campo('cPrazo', 'Prazo (pra taxa de urgência)', inp('cPrazo', S.calc.prazo, 'type="date"')) : ''}
    <p class="hint">Sem novelos nem outros gastos, o material vem da média das peças já feitas dessa receita.</p>
  </div><div class="card" id="calcRes">${calcRes()}</div></div>`;
}
function calcRes() {
  const cf = C(), c = S.calc;
  const pr = sugerePreco({horas: num(c.horas, 0), tipo: c.tipo, extraMat: num(c.novelos, 0) * cf.precoNovelo + num(c.outros, 0), prazo: c.prazo, rid: c.rid});
  if (!pr) return '<p class="muted">Põe as horas.</p>';
  const k = kpis();
  return `<div><small class="muted">Preço sugerido</small><div class="res-big num">${fR(pr.sug)}</div></div>
    ${kv([['Sua hora no sugerido', fR(pr.horaSug) + '/h'], ['Preço pra família/amigos', fR(pr.fam)], ['Sua hora no de família', fR(pr.horaFam) + '/h'],
      ...(k.horaReal != null ? [['Sua hora real nas vendas até agora', fR(k.horaReal) + '/h']] : [])])}
    <div class="pz">${precoHtml(pr, true, true)}</div>`;
}
function vReceitas() {
  const rs = vivos('receitas').sort((a, b) => a.personagem.localeCompare(b.personagem));
  const cls = {'Própria': 't-pronta', 'A criar': 'st-fio', 'Comprada': 't-medio', 'Grátis': 't-simples'};
  return `<div class="head"><h2>Receitas</h2><span class="sp"></span><button class="btn pri" data-a="novaReceita">+ Receita</button></div>
  <div class="card">${rs.length ? rs.map(r => { const st = statsReceita(r), ac = rec(r.acompanhaId), px = proxNum(r);
    const linha2 = [esc(r.autor), r.altura ? fN(r.altura) + ' cm' : '', r.arquivo ? esc(r.arquivo) : ''].filter(Boolean).join(' · ');
    const np = passosReceita(r.texto).length;
    const linha3 = [np ? `${np} ${plural(np, 'passo', 'passos')}` : '', st.total ? `${st.total} ${plural(st.total, 'pedido', 'pedidos')}` : 'nenhum pedido ainda', st.media != null ? 'média ' + fH(st.media) : '', st.preco != null ? (st.preco === 0 ? 'brinde' : fR(st.preco)) : '', ac ? 'junto: ' + esc(ac.personagem) : '', 'próximo: ' + esc(nomeNum(r, px.n, px.hash))].filter(Boolean).join(' · ');
    return `<div class="row"><span class="grow"><b>${esc(r.personagem)}</b><br><span class="small muted">${linha2}${linha2 ? '<br>' : ''}${linha3}</span></span>
    <span class="pill ${cls[r.fonte]}">${esc(r.fonte)}</span><button class="btn sm" data-a="editReceita" data-id="${esc(r.id)}">Editar</button>${np ? `<button class="btn sm" data-a="segReceita" data-id="${esc(r.id)}">Seguir</button>` : ''}<button class="btn sm pri" data-a="pedidoReceita" data-id="${esc(r.id)}">+ Pedido</button></div>`; }).join('') : '<div class="empty">Nenhuma receita ainda.</div>'}</div>`;
}
function vConfig() {
  const cf = C(), lixo = COLS.flatMap(c => S[c].filter(x => x.lixo).map(x => ({c, x})));
  const nomeLixo = ({c, x}) => c === 'pedidos' ? 'Pedido: ' + x.nome : c === 'horas' ? `Horas: ${fH(x.horas)} em ${nomePed(x.pedidoId)} (${fData(x.data)})` : c === 'compras' ? 'Compra: ' + x.item : c === 'estoque' ? 'Cor: ' + x.cor : 'Receita: ' + x.personagem;
  return `<h2>Config</h2>
  <form class="card" id="cfgForm"><div class="fgrid">
    ${campo('valorHora', 'Valor da sua hora (R$/h)', numInp('valorHora', cf.valorHora))}
    ${campo('precoNovelo', 'Preço do novelo (R$)', numInp('precoNovelo', cf.precoNovelo))}
    ${campo('miudezas', 'Miudezas por boneco (R$)', numInp('miudezas', cf.miudezas))}
    ${campo('descontoFamilia', 'Desconto família/amigos (%)', numInp('descontoFamilia', Math.round(cf.descontoFamilia * 100)))}
    ${campo('metaNatal', 'Meta do Natal (R$)', numInp('metaNatal', cf.metaNatal))}
  </div><p class="hint">Miudezas são olhinhos, fibra e botões: entram no custo de todo boneco (acessório não).</p>
  <h3 class="cfg-sub">Preço sugerido</h3>
  <div class="fgrid">
    ${campo('indiretos', 'Custos indiretos (%)', numInp('indiretos', cf.indiretos))}
    ${campo('embalagem', 'Embalagem por peça (R$)', numInp('embalagem', cf.embalagem))}
    ${campo('extraSimples', 'Criação: custom simples (% no trabalho)', numInp('extraSimples', cf.extraSimples))}
    ${campo('extraMedio', 'Criação: custom médio (%)', numInp('extraMedio', cf.extraMedio))}
    ${campo('extraComplexo', 'Criação: custom complexo (%)', numInp('extraComplexo', cf.extraComplexo))}
    ${campo('taxaPag', 'Taxa de pagamento (%)', numInp('taxaPag', cf.taxaPag, 'placeholder="0 = Pix"'))}
    ${campo('urgencia', 'Taxa de urgência (% no trabalho)', numInp('urgencia', cf.urgencia, 'placeholder="0 = desligada"'))}
    ${campo('urgDias', 'Urgente se o prazo for de até (dias)', numInp('urgDias', cf.urgDias))}
    <label class="chk full"><input type="checkbox" name="corrigeHoras" ${cf.corrigeHoras ? 'checked' : ''}> Corrigir minhas estimativas de horas pelo que as peças prontas levaram de verdade</label>
  </div>
  <p class="hint">Indiretos cobrem luz, agulhas e desgaste. Criação é o tempo de adaptar ou criar a receita de uma peça custom. A taxa de pagamento é somada de um jeito que você recebe o valor cheio. O desconto de família vale só sobre o trabalho: material e custos sempre ficam cobertos.</p>
  <div><button class="btn pri" type="submit">Salvar config</button></div></form>
  <section class="card"><h2>Instalar como app</h2>${AND ? '<p class="hint">Você está usando o app Android.</p>' : `${S.inst ? '<div><button class="btn pri" data-a="instalar">Instalar app</button></div>' : ''}
    <p class="hint">${matchMedia('(display-mode: standalone)').matches ? 'Você já está usando o app instalado.' : 'iPhone (Safari): botão Compartilhar > <b>Adicionar à Tela de Início</b>. PC (Chrome ou Edge): ícone de instalar na barra de endereço.'}</p>
    <p class="hint">Android: baixa o <b>atelie.apk</b> da <a href="https://github.com/inaciow/atelie/releases/latest">última versão</a> e instala (dá pra deixar o Obtainium atualizando sozinho).</p>`}</section>
  <section class="card"><h2>Seus dados</h2>
    <p class="hint">Os dados ficam no seu Firebase e numa cópia neste aparelho, então o app funciona sem internet e sincroniza quando ela volta. Mudar o app não apaga nada daqui. Excluir manda pra Lixeira, e dá pra voltar.</p>
    <div class="ped-acts"><button class="btn" data-a="planilha">Baixar planilha (.xlsx)</button><button class="btn" data-a="backup">Baixar backup (.json)</button><button class="btn" data-a="restaurar">Importar backup</button></div>
    <p class="hint">Conta: ${esc(S.user?.email || '')}</p></section>
  <section class="card"><h2>Lixeira (${lixo.length})</h2>${lixo.length ? lixo.map(o => `<div class="row"><span class="grow">${esc(nomeLixo(o))}</span><button class="btn sm" data-a="desfazer" data-col="${o.c}" data-id="${esc(o.x.id)}">Voltar</button><button class="btn sm bad" data-a="apagar" data-col="${o.c}" data-id="${esc(o.x.id)}">Apagar de vez</button></div>`).join('') : '<p class="muted">Vazia.</p>'}</section>`;
}
const VIEW_FN = {seguir: vSeguir, timer: vTimer, painel: vPainel, fila: vFila, horas: vHoras, compras: vCompras, estoque: vEstoque, calculadora: vCalc, receitas: vReceitas, config: vConfig};

function vLogin() {
  return `<div class="login"><img src="icon-192.png" alt=""><h2>Entra pra ver seus pedidos</h2>
    <p class="muted">Você entra uma vez com a conta Google. Depois o app abre mesmo sem internet.</p>
    <button class="btn pri" data-a="entrar">Entrar com Google</button></div>`;
}
function vSetup() {
  return `<div class="card"><h2>Falta ligar o Firebase</h2><p>Abre o arquivo <code>cfg.js</code> e cola o <code>firebaseConfig</code> do seu projeto. O passo a passo está no <code>README.md</code>.</p></div>`;
}

function renderNav() {
  const cnt = {fila: ativosOrd().filter(p => !FECHADOS.includes(p.status)).length, compras: vivos('compras').filter(c => !c.comprado).length};
  $('#tabs').innerHTML = S.user ? VIEWS.map(([k, n]) => `<a href="#${k}" ${S.view === k ? 'aria-current="page"' : ''}>${n}${cnt[k] ? `<span class="cnt">${cnt[k]}</span>` : ''}</a>`).join('') : '';
  $('#sair').hidden = !S.user;
  const s = $('#sync');
  if (!S.user) { s.textContent = ''; s.className = ''; return; }
  const pend = Object.values(S.pend).some(Boolean);
  if (!navigator.onLine) { s.textContent = 'sem internet · tudo fica salvo no aparelho'; s.className = 'off'; }
  else if (pend) { s.textContent = 'sincronizando…'; s.className = ''; }
  else if (COLS.every(c => S.ok[c])) { s.textContent = 'sincronizado'; s.className = 'ok'; }
  else { s.textContent = 'carregando…'; s.className = ''; }
}
function render() {
  const ae = document.activeElement;
  if (!$('#modal').hidden || (ae && $('#app').contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName) && ['config', 'calculadora'].includes(S.view))) { S.adiado = true; renderNav(); renderTimer(); return; }
  fhMemo = undefined; S.adiado = false; renderNav(); renderTimer(); andTimer();
  const m = $('#app');
  if (S.setup) { m.innerHTML = vSetup(); return; }
  if (S.user === null) { m.innerHTML = '<div class="empty">Carregando…</div>'; return; }
  if (S.user === false) { m.innerHTML = vLogin(); return; }
  m.innerHTML = VIEW_FN[S.view]();
  tela(querTela());
  andVolume((!!(S.view === 'seguir' || (S.view === 'timer' && $('.tm-rec'))) && !!segCtx() && !S.segLista) || (S.view === 'timer' && !$('.tm-rec') && !!$('.tm-conta')));
}
let rq = false;
function agenda() { fhMemo = undefined; andTimer(); if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); }
function rota() { const h = (location.hash || '').slice(1); S.view = VIEW_FN[h] ? h : (rodando() ? 'timer' : 'painel'); if (S.view !== 'timer') S.tp = null; render(); window.scrollTo(0, 0); }
addEventListener('hashchange', rota);
addEventListener('online', agenda);
addEventListener('offline', agenda);

async function mover(id, dir) {
  const at = ativosOrd(), i = at.findIndex(p => p.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= at.length) return;
  let a = at[i].ordem, b = at[j].ordem; if (a === b) b = a + dir;
  mudar('pedidos', at[i].id, {ordem: b}); mudar('pedidos', at[j].id, {ordem: a});
}
async function entrar() {
  if (AND) { andMsg('entrar'); return; }
  const prov = new GoogleAuthProvider();
  try { await signInWithPopup(S.auth, prov); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) await signInWithRedirect(S.auth, prov);
    else if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast(navigator.onLine ? 'Não deu pra entrar: ' + e.code : 'Pra entrar a primeira vez precisa de internet.', true);
  }
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) { if (e.target.id === 'modal') fecharModal(); return; }
  const a = b.dataset.a, id = b.dataset.id;
  if (a === 'fecharModal') return fecharModal();
  if (a === 'entrar') return entrar();
  if (!S.user) return;
  ({
    nav: () => { location.hash = b.dataset.v; },
    novoPedido: () => formPedido(), editPedido: () => formPedido(id), lancarHoras: () => formHoras(id), editHoras: () => formHoras(null, id),
    novaCompra: () => formCompra(), editCompra: () => formCompra(id), novaCor: () => formCor(), editCor: () => formCor(id),
    novaReceita: () => formReceita(), editReceita: () => formReceita(id), pedidoReceita: () => formDaReceita(id),
    contaMais: () => contar(id, 1), contaMenos: () => contar(id, -1), contaEditar: () => formConta(id),
    contaZerar: () => { const p = ped(id); if (p && p.contador) confirmar('Zerar o contador?', `${esc(p.nome)} está em <b>${p.contador}</b>.`, 'Zerar', () => mudar('pedidos', id, {contador: 0})); },
    segReceita: () => segReceita(id), segPedido: () => { const p = ped(id); if (p) segAbre(p.receitaId, p.id); },
    segAbrir: () => { fecharModal(); segAbre(b.dataset.rid, id); }, segProx: () => segPasso(1), segAnt: () => segPasso(-1),
    segIr: () => { S.segLista = false; segIr(+b.dataset.i); window.scrollTo(0, 0); },
    segLista: () => { S.segLista = !S.segLista; render(); if (S.segLista) $('#segAqui')?.scrollIntoView({block: 'center'}); },
    tmPausa: () => timerPausa(), tmEscolher: () => { S.tp = id; render(); }, tmTrocar: () => { S.tp = 'escolher'; render(); },
    tmToggle: () => { if (rodando() && S.timer.pedidoId === id) timerPausa(); else timerStart(id); },
    tmTerminei: () => terminei(id), tmAbrir: () => { S.tp = id; if (location.hash === '#timer') render(); else location.hash = 'timer'; },
    comprarTudo: () => { const pend = vivos('compras').filter(c => !c.comprado); confirmar('Comprou tudo?', `Marca os ${pend.length} itens da lista como comprados.`, 'Comprei tudo', () => comprou(pend)); },
    estOrdem: () => { try { localStorage.setItem('estoqueOrdem', b.dataset.v); } catch {} render(); },
    corLimpar: () => setHex(''), instalar: async () => { const ev = S.inst; S.inst = null; if (ev) { ev.prompt(); await ev.userChoice.catch(() => {}); } render(); },
    subir: () => mover(id, -1), descer: () => mover(id, 1),
    ciclarSit: () => { const x = S.estoque.find(y => y.id === id); if (x) mudar('estoque', id, {situacao: SIT[(SIT.indexOf(x.situacao) + 1) % SIT.length]}); },
    corNaLista: () => { const x = S.estoque.find(y => y.id === id); formCompra(null, {item: 'Novelo ' + (x?.cor || '').toLowerCase(), tipo: 'Novelo', cor: x?.cor, qtd: 1, precoUn: C().precoNovelo, pedidoId: ''}); },
    excluir: () => { const col = b.dataset.col; fecharModal(); mudar(col, id, {lixo: true, lixoEm: agora()}, 'Foi pra Lixeira (dá pra voltar na Config)'); },
    desfazer: () => mudar(b.dataset.col, id, {lixo: false}, 'Voltou'),
    apagar: () => confirmar('Apagar de vez?', 'Isso não tem volta. Se quiser guardar, baixa um backup antes.', 'Apagar de vez', () => grava(deleteDoc(ref(b.dataset.col, id)), 'Apagado')),
    backup, planilha, restaurar: () => $('#arquivoBackup').click()
  }[a] || (() => {}))();
});
$('#sair').addEventListener('click', () => confirmar('Sair da conta?', 'Neste aparelho você vai precisar entrar de novo, com internet.', 'Sair', () => { if (AND) andMsg('sair'); signOut(S.auth); }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').hidden) fecharModal();
  if (e.key === 'Enter' && e.target.matches('h3[data-a]')) e.target.click();
  if (S.view === 'timer' && $('#modal').hidden && $('.tm-conta') && ['+', '=', '-'].includes(e.key) && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
    e.preventDefault(); contar($('.tm-conta').dataset.id, e.key === '-' ? -1 : 1);
  }
  if (S.view === 'seguir' && $('#modal').hidden && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const botao = /BUTTON|A/.test(document.activeElement?.tagName || '') && [' ', 'Enter'].includes(e.key);
    if (botao) return;
    if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); segPasso(1); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); segPasso(-1); }
  }
});
document.addEventListener('change', e => {
  const t = e.target, c = t.dataset.c, id = t.dataset.id;
  if (c === 'status') { const p = ped(id); const patch = {status: t.value}; if (t.value === 'Entregue' && p && !p.entregueEm) patch.entregueEm = hoje(); mudar('pedidos', id, patch, t.value === 'Entregue' ? 'Entregue!' : ''); }
  else if (c === 'pago') mudar('pedidos', id, {pago: t.checked}, t.checked ? 'Marcado como pago' : '');
  else if (c === 'comprado') { const it = S.compras.find(x => x.id === id); if (t.checked && it) comprou([it]); else mudar('compras', id, {comprado: false, compradoEm: ''}); }
  else if (c === 'segPartes') { S.segPartes = t.checked; gravaLS('atelie-seg-partes', t.checked); S.segParte = 0; render(); }
  else if (t.id === 'recArq' && t.files[0]) {
    const arq = t.files[0]; t.value = ''; $('#recPassos').textContent = 'Lendo ' + arq.name + '…';
    textoDeArquivo(arq).then(txt => {
      const ta = $('#texto'); if (!ta) return;
      if (ta.value.trim() && !confirm('Trocar o texto que já está aí pelo do arquivo?')) { $('#recPassos').textContent = resumoPassos(ta.value); return; }
      ta.value = txt; ta.dispatchEvent(new Event('input', {bubbles: true}));
      const fm = $('#mf'); if (fm && !fm.personagem.value.trim()) fm.personagem.value = arq.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    }).catch(e => { $('#recPassos').textContent = ''; erroModal(e.message || 'Não consegui ler o arquivo.'); });
  }
  else if (t.id === 'hexPick') setHex(t.value.toLowerCase());
  else if (t.id === 'fotoCor' && t.files[0]) { const f = t.files[0]; t.value = ''; corDaFoto(f).then(setHex).catch(() => toast('Não consegui ler a foto.', true)); }
});
document.addEventListener('toggle', e => { const t = e.target.dataset && e.target.dataset.t; if (t) S[t] = e.target.open; }, true);
document.addEventListener('input', e => {
  if (e.target.closest('#mf') && modalInput) modalInput($('#mf'));
  const id = e.target.id;
  const ck = {cHoras: 'horas', cNov: 'novelos', cOut: 'outros', cTipo: 'tipo', cRec: 'rid', cPrazo: 'prazo'}[id];
  if (ck) {
    S.calc[ck] = e.target.value;
    if (ck === 'rid') { const r = rec(e.target.value); if (r) { const st = statsReceita(r); if (st.horas) { S.calc.horas = st.horas; $('#cHoras').value = st.horas; } S.calc.tipo = r.tipoPadrao; $('#cTipo').value = r.tipoPadrao; } }
    $('#calcRes').innerHTML = calcRes();
  }
});
document.addEventListener('focusout', () => { setTimeout(() => { if (S.adiado && $('#modal').hidden && !($('#app').contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) render(); tentaRecarregar(); }, 0); });
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'mf') { const d = fd(e.target); const cb = modalOk; if (cb && cb(d) !== false) fecharModal(); }
  else if (e.target.id === 'cfgForm') {
    const d = fd(e.target);
    document.activeElement && document.activeElement.blur();
    const pc = (k, v) => Math.max(0, num(d[k], v));
    mudarMeta('config', {valorHora: num(d.valorHora, 13), precoNovelo: num(d.precoNovelo, 20), miudezas: num(d.miudezas, 0), descontoFamilia: num(d.descontoFamilia, 0) / 100, metaNatal: num(d.metaNatal),
      indiretos: pc('indiretos', 0), embalagem: pc('embalagem', 0), extraSimples: pc('extraSimples', 0), extraMedio: pc('extraMedio', 0), extraComplexo: pc('extraComplexo', 0),
      taxaPag: Math.min(30, pc('taxaPag', 0)), urgencia: pc('urgencia', 0), urgDias: pc('urgDias', 7), corrigeHoras: !!d.corrigeHoras}, 'Config salva');
  }
});

function comprou(lista) {
  const ids = new Set(lista.map(c => c.id)), msgs = [], est = vivos('estoque'), novos = new Set();
  for (const c of lista) {
    mudar('compras', c.id, {comprado: true, compradoEm: hoje()});
    if (['Novelo', 'Linha de bordado'].includes(c.tipo) && c.cor) {
      const k = semAcento(c.cor), e = est.find(x => semAcento(x.cor) === k);
      if (e) { if (e.situacao !== 'Cheio') { mudar('estoque', e.id, {situacao: 'Cheio'}); msgs.push(c.cor + ' cheio no estoque'); } }
      else if (!novos.has(k)) { novos.add(k); const mx = Math.max(0, ...est.map(x => x.ordem).filter(x => x < 1e6)); criar('estoque', {cor: c.cor, situacao: 'Cheio', ordem: mx + 1 + novos.size, hex: '', lixo: false}); msgs.push(c.cor + ' entrou no estoque'); }
    }
  }
  for (const p of vivos('pedidos').filter(x => x.status === 'Esperando fio')) {
    const minhas = vivos('compras').filter(c => c.pedidoId === p.id);
    if (minhas.some(c => ids.has(c.id)) && minhas.every(c => c.comprado || ids.has(c.id))) { mudar('pedidos', p.id, {status: 'Na fila'}); msgs.push(p.nome + ' voltou pra fila'); }
  }
  toast(lista.length > 1 ? `${lista.length} itens comprados` + (msgs.length ? ' · ' + msgs.join(' · ') : '') : 'Comprado' + (msgs.length ? ' · ' + msgs.join(' · ') : ''));
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.inst = e; agenda(); });
addEventListener('appinstalled', () => { S.inst = null; toast('App instalado'); agenda(); });

function baixar(nome, data, tipo) {
  if (AND) { const fr = new FileReader(); fr.onload = () => andMsg('salvar', {nome, tipo, b64: String(fr.result).split(',')[1] || ''}); fr.readAsDataURL(new Blob([data], {type: tipo})); return; }
  const url = URL.createObjectURL(new Blob([data], {type: tipo}));
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function backup() {
  const out = {app: 'atelie-croche', formato: 1, exportadoEm: agora(), colecoes: {}, docs: {}};
  for (const c of COLS) out.colecoes[c] = S.raw[c] || [];
  if (S.rawCfg) out.docs['config/geral'] = S.rawCfg;
  if (S.timer) out.docs['estado/timer'] = S.timer;
  baixar(`atelie-backup-${hoje()}.json`, JSON.stringify(out, null, 1), 'application/json');
}
$('#arquivoBackup').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !S.user) return;
  let d; try { d = JSON.parse(await f.text()); } catch { toast('Esse arquivo não é um backup do app.', true); return; }
  if (!d || d.app !== 'atelie-croche' || !d.colecoes) { toast('Esse arquivo não é um backup do app.', true); return; }
  const n = COLS.reduce((a, c) => a + (d.colecoes[c] || []).length, 0);
  confirmar('Importar backup?', `O backup de ${esc(fData((d.exportadoEm || '').slice(0, 10)))} tem ${n} itens. Itens com o mesmo código vão ser trocados pela versão do backup; o resto fica como está. Nada é apagado.`, 'Importar', async () => {
    const ops = [];
    for (const c of COLS) for (const it of (d.colecoes[c] || [])) { if (!it || !it.id) continue; const {id, ...body} = it; ops.push([ref(c, String(id)), body]); }
    if (d.docs && d.docs['config/geral']) ops.push([metaRef('config'), d.docs['config/geral']]);
    for (let i = 0; i < ops.length; i += 400) { const b = writeBatch(S.fs); ops.slice(i, i + 400).forEach(([r, body]) => b.set(r, body)); grava(b.commit()); }
    toast('Backup importado');
  });
});
function planilha() {
  if (!window.XLSX) { toast('A biblioteca da planilha não carregou. Abre o app uma vez com internet.', true); return; }
  const X = window.XLSX, wb = X.utils.book_new(), add = (n, rows) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), n);
  const at = ativosOrd(), todos = [...at, ...vivos('pedidos').filter(p => SAIU.includes(p.status))];
  add('Fila', [['Ordem', 'Peça', 'Cliente', 'Tipo', 'Status', 'Prazo', 'Horas est.', 'Horas feitas', 'Restam (h)', 'Sugerido', 'Preço', 'Sinal', 'Pago', 'A receber', 'Lucro', 'R$/h real', 'Contato', 'Pedido em', 'Entregue em', 'Receita'],
    ...todos.map(p => { const c = calcP(p), i = at.indexOf(p); return [i >= 0 ? i + 1 : '', p.nome, p.cliente, p.tipo, p.status, p.prazo, p.horasEst, c.f, c.restam, c.sug, p.preco, p.sinal, p.pago ? 'Sim' : 'Não', c.aReceber, c.lucro, c.rph == null ? '' : Math.round(c.rph * 100) / 100, p.contato, p.pedidoEm, p.entregueEm, rec(p.receitaId)?.personagem || '']; })]);
  add('Horas', [['Data', 'Peça', 'Horas', 'Início', 'Fim'], ...vivos('horas').sort((a, b) => a.data.localeCompare(b.data)).map(h => [h.data, nomePed(h.pedidoId), h.horas, h.inicio, h.fim])]);
  add('Compras', [['Item', 'Tipo', 'Cor', 'Qtd', 'Preço un.', 'Total', 'Pra', 'Onde', 'Comprado'], ...vivos('compras').map(c => [c.item, c.tipo, c.cor, c.qtd, c.precoUn, c.qtd * c.precoUn, nomePed(c.pedidoId), c.onde, c.comprado ? 'Sim' : 'Não'])]);
  add('Estoque', [['Cor', 'Situação'], ...vivos('estoque').map(e => [e.cor, e.situacao])]);
  add('Receitas', [['Personagem', 'Fonte', 'Autor', 'Altura (cm)', 'Arquivo', 'Tipo', 'Horas por peça', 'Preço', 'Faz junto', 'Feitos', 'Média de horas'], ...vivos('receitas').map(r => { const st = statsReceita(r); return [r.personagem, r.fonte, r.autor, r.altura, r.arquivo, r.tipoPadrao, r.horasPadrao, r.precoPadrao, rec(r.acompanhaId)?.personagem || '', st.total, st.media == null ? '' : Math.round(st.media * 100) / 100]; })]);
  const cf = C(); add('Config', [['Parâmetro', 'Valor'], ['Valor da hora', cf.valorHora], ['Preço do novelo', cf.precoNovelo], ['Miudezas por boneco', cf.miudezas], ['Desconto família', cf.descontoFamilia], ['Meta do Natal', cf.metaNatal], ['Custos indiretos (%)', cf.indiretos], ['Embalagem', cf.embalagem], ['Criação custom simples (%)', cf.extraSimples], ['Criação custom médio (%)', cf.extraMedio], ['Criação custom complexo (%)', cf.extraComplexo], ['Taxa de pagamento (%)', cf.taxaPag], ['Urgência (%)', cf.urgencia], ['Urgente até (dias)', cf.urgDias], ['Corrigir horas pelo histórico', cf.corrigeHoras ? 'Sim' : 'Não']]);
  baixar(`atelie-${hoje()}.xlsx`, X.write(wb, {type: 'array', bookType: 'xlsx'}), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

let subs = [];
function ligar(u) {
  subs.forEach(f => f()); subs = [];
  S.ok = {}; S.pend = {}; COLS.forEach(c => { S[c] = []; S.raw[c] = []; }); S.config = {...DEF_CFG}; S.rawCfg = null; S.timer = null;
  if (!u) return;
  for (const c of COLS) subs.push(onSnapshot(colRef(c), {includeMetadataChanges: true}, s => {
    S.raw[c] = s.docs.map(d => ({id: d.id, ...d.data()}));
    S[c] = S.raw[c].map(d => NORM[c](d.id, d));
    S.ok[c] = S.ok[c] || !s.metadata.fromCache || !navigator.onLine;
    S.pend[c] = s.metadata.hasPendingWrites;
    agenda();
  }, err => { console.error(err); toast('Erro ao ler ' + c + ': ' + err.code, true); }));
  subs.push(onSnapshot(metaRef('config'), {includeMetadataChanges: true}, s => { S.rawCfg = s.exists() ? s.data() : null; S.config = {...DEF_CFG, ...(S.rawCfg || {})}; S.pend.config = s.metadata.hasPendingWrites; agenda(); }));
  let primeiro = true;
  subs.push(onSnapshot(metaRef('timer'), s => { S.timer = s.exists() ? s.data() : null; if (primeiro && rodando() && !location.hash) { S.view = 'timer'; } primeiro = false; agenda(); }));
}

function init() {
  try { if (sessionStorage.getItem('atelie-atualizou')) { sessionStorage.removeItem('atelie-atualizou'); setTimeout(() => toast('App atualizado'), 600); } } catch {}
  rota();
  if (!cfg || !cfg.apiKey) { S.setup = true; render(); return; }
  const app = initializeApp(cfg);
  S.auth = getAuth(app);
  S.fs = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})});
  getRedirectResult(S.auth).catch(() => {});
  onAuthStateChanged(S.auth, u => { S.user = u || false; ligar(u); render(); });
}
init();
