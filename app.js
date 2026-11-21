import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { cfg } from './cfg.js';

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
const DEF_CFG = {valorHora:13, precoNovelo:20, miudezas:8, descontoFamilia:0.1, metaNatal:null};
const VIEWS = [['painel','Painel'],['fila','Fila'],['horas','Horas'],['compras','Compras'],['estoque','Estoque'],['calculadora','Calculadora'],['receitas','Receitas'],['config','Config']];

const S = {pedidos:[],horas:[],compras:[],estoque:[],receitas:[],raw:{},config:{...DEF_CFG},rawCfg:null,timer:null,
  ok:{},pend:{},user:null,fs:null,setup:false,view:'painel',verSaiu:false,verComprados:false,adiado:false,
  calc:{horas:10,novelos:0,outros:0}};

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

const NORM = {
  pedidos: (id, d) => ({id, nome: str(d.nome) || '(sem nome)', cliente: str(d.cliente), tipo: TIPOS.includes(d.tipo) ? d.tipo : 'Custom simples',
    status: STATUS.includes(d.status) ? d.status : 'Na fila', prazo: str(d.prazo), horasEst: num(d.horasEst, 0), preco: num(d.preco),
    sinal: num(d.sinal, 0), pago: d.pago === true, contato: str(d.contato), pedidoEm: str(d.pedidoEm), entregueEm: str(d.entregueEm),
    ordem: num(d.ordem, 1e6), lixo: d.lixo === true}),
  horas: (id, d) => ({id, data: str(d.data), pedidoId: str(d.pedidoId), horas: num(d.horas, 0), inicio: str(d.inicio), fim: str(d.fim), lixo: d.lixo === true}),
  compras: (id, d) => ({id, item: str(d.item) || '(sem nome)', tipo: TIPOS_COMPRA.includes(d.tipo) ? d.tipo : 'Outro', cor: str(d.cor),
    qtd: num(d.qtd, 1), precoUn: num(d.precoUn, 0), onde: str(d.onde), pedidoId: str(d.pedidoId), comprado: d.comprado === true,
    compradoEm: str(d.compradoEm), criadoEm: str(d.criadoEm), lixo: d.lixo === true}),
  estoque: (id, d) => ({id, cor: str(d.cor) || '(sem nome)', situacao: SIT.includes(d.situacao) ? d.situacao : 'Tem', ordem: num(d.ordem, 1e6), lixo: d.lixo === true}),
  receitas: (id, d) => ({id, personagem: str(d.personagem) || '(sem nome)', fonte: FONTES.includes(d.fonte) ? d.fonte : 'Própria', autor: str(d.autor),
    altura: num(d.altura), arquivo: str(d.arquivo), lixo: d.lixo === true})
};

const vivos = k => S[k].filter(x => !x.lixo);
const ped = id => S.pedidos.find(p => p.id === id);
const nomePed = id => id ? (ped(id)?.nome || '(pedido apagado)') : 'Estoque';
const C = () => ({valorHora: num(S.config.valorHora, 13), precoNovelo: num(S.config.precoNovelo, 20), miudezas: num(S.config.miudezas, 8),
  descontoFamilia: num(S.config.descontoFamilia, 0.1), metaNatal: num(S.config.metaNatal)});
const ativosOrd = () => vivos('pedidos').filter(p => !SAIU.includes(p.status)).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
const feitas = p => vivos('horas').filter(h => h.pedidoId === p.id).reduce((a, h) => a + h.horas, 0);
const comprasDe = p => vivos('compras').filter(c => c.pedidoId === p.id).reduce((a, c) => a + c.qtd * c.precoUn, 0);
const custo = p => comprasDe(p) + (p.tipo === 'Acessório' ? 0 : C().miudezas);
function calcP(p) {
  const f = feitas(p), fechado = FECHADOS.includes(p.status), c = custo(p);
  const restam = fechado ? 0 : Math.max(0, p.horasEst - f);
  const sug = p.horasEst > 0 ? r90(p.horasEst * C().valorHora + c) : null;
  const preco = p.preco;
  const recebido = preco == null ? p.sinal : (p.pago ? preco : p.sinal);
  const aReceber = preco == null ? null : (p.pago ? 0 : Math.max(0, preco - p.sinal));
  const lucro = preco == null ? null : preco - c;
  const rph = (lucro != null && f > 0) ? lucro / f : null;
  return {f, fechado, c, restam, sug, recebido, aReceber, lucro, rph, dias: diasAte(p.prazo), pct: p.horasEst > 0 ? Math.min(1, f / p.horasEst) : 0};
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
  const ent = todos.filter(p => p.status === 'Entregue');
  const hEnt = ent.reduce((a, p) => a + calc.get(p.id).f, 0), lEnt = ent.reduce((a, p) => a + (calc.get(p.id).lucro || 0), 0);
  return {abertos: abertos.length, horasFila: at.reduce((a, p) => a + calc.get(p.id).restam, 0), proxima: abertos[0] ? abertos[0].nome : 'Nada na fila',
    prazo: prazos[0] ? fData(prazos[0]) : 'Nenhum marcado', atrasadas, fat, recebido, gastos, saldo, pend, lucro, aReceber,
    meta: cf.metaNatal, jaTenho: cf.metaNatal ? Math.min(1, Math.max(0, saldo) / cf.metaNatal) : null,
    seFila: cf.metaNatal ? Math.min(1, Math.max(0, saldo + aReceber) / cf.metaNatal) : null,
    hTotal: hs.reduce((a, h) => a + h.horas, 0), hSemana: hs.filter(h => h.data >= segIso).reduce((a, h) => a + h.horas, 0),
    horaReal: hEnt > 0 ? lEnt / hEnt : null};
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
function fecharModal() { $('#modal').hidden = true; $('#modalBody').innerHTML = ''; modalOk = modalInput = null; if (S.adiado) { S.adiado = false; render(); } }
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
      const h = num(f.horasEst.value, 0), tipo = f.tipo.value, cf = C();
      const c = (p ? comprasDe(p) : 0) + (tipo === 'Acessório' ? 0 : cf.miudezas);
      const box = $('#sugbox');
      if (h > 0) { const justo = h * cf.valorHora + c;
        box.innerHTML = `Sugestão: <b>${fR(r90(justo))}</b> · família: <b>${fR(r90(justo * (1 - cf.descontoFamilia)))}</b> <span class="muted small">(${fH(h)} × ${fR(cf.valorHora)}/h + ${fR(c)} de material)</span>`; }
      else box.innerHTML = '<span class="muted">Põe as horas estimadas pra ver o preço sugerido.</span>';
    },
    onOk: d => {
      if (!d.nome.trim()) { erroModal('Dá um nome pra peça.'); return false; }
      const patch = {nome: d.nome.trim(), cliente: d.cliente.trim(), contato: d.contato.trim(), tipo: d.tipo, status: d.status,
        horasEst: num(d.horasEst, 0), prazo: d.prazo, preco: num(d.preco), sinal: num(d.sinal, 0), pago: d.pago,
        pedidoEm: d.pedidoEm, entregueEm: d.entregueEm || (d.status === 'Entregue' ? hoje() : '')};
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
    : (!S.timer?.inicio ? `<button type="button" class="btn" data-a="timerDoModal">Começar cronômetro</button>` : '');
  abrirModal(h ? 'Editar horas' : 'Lançar horas', corpo, {extra, salvarTxt: h ? 'Salvar' : 'Lançar',
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
  const corpo = `${campo('cor', 'Cor', inp('cor', e?.cor, 'required autocomplete="off"'))}${campo('situacao', 'Situação', sel('situacao', SIT, e?.situacao || 'Tem'))}`;
  const extra = e ? `<button type="button" class="btn bad" data-a="excluir" data-col="estoque" data-id="${esc(e.id)}">Excluir</button>` : '';
  abrirModal(e ? 'Editar cor' : 'Nova cor no estoque', corpo, {extra, onOk: d => {
    if (!d.cor.trim()) { erroModal('Diz a cor.'); return false; }
    if (e) mudar('estoque', e.id, {cor: d.cor.trim(), situacao: d.situacao}, 'Cor salva');
    else { const mx = Math.max(0, ...vivos('estoque').map(x => x.ordem).filter(x => x < 1e6)); criar('estoque', {cor: d.cor.trim(), situacao: d.situacao, ordem: mx + 1, lixo: false}, 'Cor adicionada'); }
  }});
}
function formReceita(rid) {
  const r = rid ? S.receitas.find(x => x.id === rid) : null;
  const corpo = `<div class="fgrid">${campo('personagem', 'Personagem', inp('personagem', r?.personagem, 'required autocomplete="off"'), 'full')}
    ${campo('fonte', 'Fonte', sel('fonte', FONTES, r?.fonte || 'Própria'))}${campo('autor', 'Autor', inp('autor', r?.autor ?? 'Você'))}
    ${campo('altura', 'Altura (cm)', numInp('altura', r?.altura))}${campo('arquivo', 'Arquivo ou link', inp('arquivo', r?.arquivo))}</div>`;
  const extra = r ? `<button type="button" class="btn bad" data-a="excluir" data-col="receitas" data-id="${esc(r.id)}">Excluir</button>` : '';
  abrirModal(r ? 'Editar receita' : 'Nova receita', corpo, {extra, onOk: d => {
    if (!d.personagem.trim()) { erroModal('Diz o personagem.'); return false; }
    const patch = {personagem: d.personagem.trim(), fonte: d.fonte, autor: d.autor.trim(), altura: num(d.altura), arquivo: d.arquivo.trim()};
    if (r) mudar('receitas', r.id, patch, 'Receita salva'); else { patch.lixo = false; criar('receitas', patch, 'Receita adicionada'); }
  }});
}

function timerStart(pid) {
  if (!pid) { toast('Escolhe a peça primeiro.', true); return; }
  mudarMeta('timer', {pedidoId: pid, inicio: agora()}, 'Cronômetro rodando: ' + nomePed(pid));
}
function timerStop(lancar) {
  const t = S.timer; if (!t || !t.inicio) return;
  const ini = new Date(t.inicio), fim = new Date();
  const horas = Math.round((fim - ini) / 36e5 * 100) / 100;
  if (lancar && horas >= 0.01) {
    const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
    criar('horas', {pedidoId: t.pedidoId, data: isoDia(ini), horas, inicio: hm(ini), fim: hm(fim), lixo: false}, fH(horas) + ' em ' + nomePed(t.pedidoId));
  }
  mudarMeta('timer', {pedidoId: null, inicio: null}, lancar ? '' : 'Cronômetro descartado');
}
function decorrido(iso) { const m = Math.max(0, Math.floor((Date.now() - new Date(iso)) / 6e4)); return (m >= 60 ? Math.floor(m / 60) + 'h ' : '') + pad(m % 60) + 'min'; }
function renderTimer() {
  const b = $('#timerbar'), t = S.timer;
  if (!S.user || !t || !t.inicio || !t.pedidoId) { b.hidden = true; b.innerHTML = ''; return; }
  b.hidden = false;
  b.innerHTML = `<div class="in"><span>Cronômetro: <b>${esc(nomePed(t.pedidoId))}</b> há <b id="tdec">${decorrido(t.inicio)}</b></span><span class="sp"></span>
    <button data-a="timerStop">Parar e lançar</button><button class="ghost" data-a="timerCancel">Descartar</button></div>`;
}
setInterval(() => { const e = $('#tdec'); if (e && S.timer?.inicio) e.textContent = decorrido(S.timer.inicio); }, 20000);

function kv(linhas) { return `<dl class="kv">${linhas.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c || ''}">${v}</dd>`).join('')}</dl>`; }
function barra(frac, rot) { return `<div class="meta-bar"><div class="head small"><span>${rot}</span><span class="sp"></span><b>${frac == null ? '–' : fP(frac)}</b></div><div class="bar"><i style="width:${Math.round((frac || 0) * 100)}%"></i></div></div>`; }
function grafico() {
  const rows = ativosOrd().map(p => ({n: p.nome, v: calcP(p).restam})).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
  if (!rows.length) return '<p class="muted">Nada pra fazer na fila.</p>';
  const W = 560, rh = 34, lab = 180, top = 4, H = top + rows.length * rh + 4, max = Math.max(...rows.map(r => r.v)), bw = W - lab - 64;
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Horas que faltam por peça">`;
  rows.forEach((r, i) => { const y = top + i * rh, w = Math.max(4, bw * r.v / max), nm = r.n.length > 24 ? r.n.slice(0, 23) + '…' : r.n;
    s += `<text x="${lab - 10}" y="${y + 22}" text-anchor="end" class="c-lab">${esc(nm)}</text><rect x="${lab}" y="${y + 8}" width="${w}" height="20" rx="4" class="c-bar"/><text x="${lab + w + 8}" y="${y + 22}" class="c-val">${esc(fH(r.v))}</text>`; });
  return s + '</svg>';
}
function vPainel() {
  const k = kpis();
  return `<section class="acoes" aria-label="Atalhos">
    <button class="acao pri" data-a="novoPedido">+ Pedido<span>entra na fila</span></button>
    <button class="acao" data-a="lancarHoras">Lançar horas<span>${S.timer?.inicio ? 'cronômetro rodando' : 'ou cronometrar'}</span></button>
    <button class="acao" data-a="novaCompra">+ Compra<span>ou gasto</span></button>
    <button class="acao" data-a="nav" data-v="estoque">Estoque<span>${vivos('estoque').filter(e => ['Pouco', 'Acabou'].includes(e.situacao)).length} cores acabando</span></button>
  </section>
  <div class="grid2">
    <section class="card"><h2>Fila</h2>${kv([['Pedidos em aberto', k.abertos], ['Horas de trabalho na fila', fH(k.horasFila)], ['Próxima peça', esc(k.proxima)], ['Prazo mais perto', k.prazo], ['Peças atrasadas', k.atrasadas, k.atrasadas > 0 ? 'bad' : '']])}</section>
    <section class="card"><h2>Horas que faltam por peça</h2>${grafico()}</section>
    <section class="card"><h2>Dinheiro</h2>${kv([['Faturamento previsto', fR(k.fat)], ['Já recebido', fR(k.recebido)], ['Gastos (compras feitas)', fR(k.gastos)], ['Saldo em caixa', fR(k.saldo), k.saldo < 0 ? 'bad' : 'good'], ['Compras pendentes', fR(k.pend)], ['Lucro previsto', fR(k.lucro)]])}</section>
    <section class="card"><h2>Natal</h2>${kv([['Meta', k.meta ? fR(k.meta) : 'coloca na Config'], ['Já tenho', fR(Math.max(0, k.saldo))], ['Se a fila toda pagar', fR(Math.max(0, k.saldo + k.aReceber)), 'good']])}${k.meta ? `${barra(k.jaTenho, 'Já tenho')}${barra(k.seFila, 'Se a fila toda pagar')}` : ''}</section>
    <section class="card"><h2>Horas</h2>${kv([['Trabalhadas no total', fH(k.hTotal)], ['Nesta semana', fH(k.hSemana)], ['Sua hora real (peças entregues)', k.horaReal == null ? 'sem entregas ainda' : fR(k.horaReal) + '/h', k.horaReal != null && k.horaReal < 10 ? 'bad' : '']])}</section>
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
    <div class="ped-meta"><span class="pill ${TIPO_CLS[p.tipo]}">${esc(p.tipo)}</span>${p.cliente ? `<span>${esc(p.cliente)}</span>` : ''}${p.contato ? `<span>${esc(p.contato)}</span>` : ''}${prazo}</div>
    <div class="prog"><div class="bar"><i style="width:${Math.round(c.pct * 100)}%"></i></div><span class="num">${fN(c.f)} de ${fH(p.horasEst)}${c.restam > 0 ? ' · faltam ' + fH(c.restam) : ''}</span></div>
    <div class="nums">
      <div><small>Preço</small><b>${p.preco == null ? 'a definir' : fR(p.preco)}</b></div>
      <div class="sug"><small>Sugerido</small><b>${fR(c.sug)}</b></div>
      <div><small>Sinal</small><b>${fR(p.sinal)}</b></div>
      <div><small>A receber</small><b>${fR(c.aReceber)}</b></div>
      <div class="${c.lucro != null && c.lucro < 0 ? 'bad' : ''}"><small>Lucro</small><b>${fR(c.lucro)}</b></div>
      <div class="${c.rph != null && c.rph < 10 ? 'bad' : ''}"><small>Sua hora</small><b>${c.rph == null ? '–' : fR(c.rph) + '/h'}</b></div>
    </div>
    <div class="ped-acts">
      <label class="chk"><input type="checkbox" data-c="pago" data-id="${esc(p.id)}" ${p.pago ? 'checked' : ''}> Pago</label>
      <button class="btn sm" data-a="lancarHoras" data-id="${esc(p.id)}">+ Horas</button>
      ${S.timer?.inicio ? '' : `<button class="btn sm" data-a="timerStart" data-id="${esc(p.id)}">Começar cronômetro</button>`}
      <span class="sp"></span>
      ${pos ? `<button class="icon" data-a="subir" data-id="${esc(p.id)}" aria-label="Subir ${esc(p.nome)} na fila" ${primeiro ? 'disabled' : ''}>↑</button><button class="icon" data-a="descer" data-id="${esc(p.id)}" aria-label="Descer ${esc(p.nome)} na fila" ${ultimo ? 'disabled' : ''}>↓</button>` : ''}
      <button class="btn sm" data-a="editPedido" data-id="${esc(p.id)}">Editar</button>
    </div></article>`;
}
function vFila() {
  const at = ativosOrd(), saiu = vivos('pedidos').filter(p => SAIU.includes(p.status)).sort((a, b) => (b.entregueEm || '').localeCompare(a.entregueEm || ''));
  return `<div class="head"><h2>Fila (${at.length})</h2><span class="sp"></span><button class="btn pri" data-a="novoPedido">+ Pedido</button></div>
  <div class="lista">${at.length ? at.map((p, i) => cardPedido(p, i + 1, i === 0, i === at.length - 1)).join('') : '<div class="empty card">Fila vazia. Toque em + Pedido.</div>'}</div>
  ${saiu.length ? `<details ${S.verSaiu ? 'open' : ''} data-t="verSaiu"><summary>Entregues e cancelados (${saiu.length})</summary><div class="lista" style="margin-top:10px">${saiu.map(p => cardPedido(p, 0)).join('')}</div></details>` : ''}`;
}
function vHoras() {
  const hs = vivos('horas').slice().sort((a, b) => (b.data + b.inicio).localeCompare(a.data + a.inicio));
  const k = kpis(); const porDia = {};
  hs.forEach(h => (porDia[h.data] = porDia[h.data] || []).push(h));
  const dias = Object.keys(porDia).sort().reverse();
  return `<div class="head"><h2>Horas</h2><span class="sp"></span>${S.timer?.inicio ? '' : `<button class="btn" data-a="timerDaTela">Começar cronômetro</button>`}<button class="btn pri" data-a="lancarHoras">Lançar horas</button></div>
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
  <div class="card"><div class="head"><h3>Pra comprar</h3><span class="sp"></span><b class="num">${fR(tp)}</b></div>${pend.length ? pend.map(linhaCompra).join('') : '<p class="muted">Nada pendente.</p>'}</div>
  ${feitasC.length ? `<details class="card" ${S.verComprados ? 'open' : ''} data-t="verComprados"><summary>Já comprado · ${fR(tf)}</summary>${feitasC.map(linhaCompra).join('')}</details>` : ''}`;
}
function vEstoque() {
  const es = vivos('estoque').sort((a, b) => a.ordem - b.ordem || a.cor.localeCompare(b.cor));
  return `<div class="head"><h2>Estoque</h2><span class="sp"></span><button class="btn pri" data-a="novaCor">+ Cor</button></div>
  <p class="hint">Toque na situação pra trocar: Cheio, Tem, Pouco, Acabou, Não tenho.</p>
  <div class="card">${es.length ? es.map(e => `<div class="row"><span class="grow"><b data-a="editCor" data-id="${esc(e.id)}" style="cursor:pointer">${esc(e.cor)}</b></span>
    ${['Pouco', 'Acabou', 'Não tenho'].includes(e.situacao) ? `<button class="btn sm" data-a="corNaLista" data-id="${esc(e.id)}">Pôr na lista de compras</button>` : ''}
    <button class="sit sit-${e.situacao === 'Não tenho' ? 'Nao' : e.situacao}" data-a="ciclarSit" data-id="${esc(e.id)}" aria-label="${esc(e.cor)}: ${esc(e.situacao)}. Toque pra trocar">${esc(e.situacao)}</button></div>`).join('') : '<div class="empty">Nenhuma cor ainda.</div>'}</div>`;
}
function vCalc() {
  return `<h2>Calculadora de preço</h2><p class="hint">É só sugestão: quem fecha o preço é você.</p>
  <div class="calc"><div class="card">
    ${campo('cHoras', 'Horas que você acha que vai levar', numInp('cHoras', S.calc.horas))}
    ${campo('cNov', 'Novelos novos só pra essa peça', numInp('cNov', S.calc.novelos))}
    ${campo('cOut', 'Outros gastos da peça (R$)', numInp('cOut', S.calc.outros))}
  </div><div class="card" id="calcRes">${calcRes()}</div></div>`;
}
function calcRes() {
  const cf = C(), h = num(S.calc.horas, 0), mat = cf.miudezas + num(S.calc.novelos, 0) * cf.precoNovelo + num(S.calc.outros, 0);
  if (!(h > 0)) return '<p class="muted">Põe as horas.</p>';
  const justo = h * cf.valorHora + mat, sug = r90(justo), fam = r90(justo * (1 - cf.descontoFamilia));
  return `<div><small class="muted">Preço sugerido</small><div class="res-big num">${fR(sug)}</div></div>
    ${kv([['Preço justo', fR(justo)], ['Sua hora no sugerido', fR((sug - mat) / h) + '/h'], ['Preço pra família/amigos', fR(fam)], ['Sua hora no de família', fR((fam - mat) / h) + '/h'], ['Material contado', fR(mat)]])}`;
}
function vReceitas() {
  const rs = vivos('receitas').sort((a, b) => a.personagem.localeCompare(b.personagem));
  const cls = {'Própria': 't-pronta', 'A criar': 'st-fio', 'Comprada': 't-medio', 'Grátis': 't-simples'};
  return `<div class="head"><h2>Receitas</h2><span class="sp"></span><button class="btn pri" data-a="novaReceita">+ Receita</button></div>
  <div class="card">${rs.length ? rs.map(r => `<div class="row"><span class="grow"><b>${esc(r.personagem)}</b><br><span class="small muted">${esc(r.autor)}${r.altura ? ' · ' + fN(r.altura) + ' cm' : ''}${r.arquivo ? ' · ' + esc(r.arquivo) : ''}</span></span>
    <span class="pill ${cls[r.fonte]}">${esc(r.fonte)}</span><button class="btn sm" data-a="editReceita" data-id="${esc(r.id)}">Editar</button></div>`).join('') : '<div class="empty">Nenhuma receita ainda.</div>'}</div>`;
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
  <div><button class="btn pri" type="submit">Salvar config</button></div></form>
  <section class="card"><h2>Seus dados</h2>
    <p class="hint">Os dados ficam no seu Firebase e numa cópia neste aparelho, então o app funciona sem internet e sincroniza quando ela volta. Mudar o app não apaga nada daqui. Excluir manda pra Lixeira, e dá pra voltar.</p>
    <div class="ped-acts"><button class="btn" data-a="planilha">Baixar planilha (.xlsx)</button><button class="btn" data-a="backup">Baixar backup (.json)</button><button class="btn" data-a="restaurar">Importar backup</button></div>
    <p class="hint">Conta: ${esc(S.user?.email || '')}</p></section>
  <section class="card"><h2>Lixeira (${lixo.length})</h2>${lixo.length ? lixo.map(o => `<div class="row"><span class="grow">${esc(nomeLixo(o))}</span><button class="btn sm" data-a="desfazer" data-col="${o.c}" data-id="${esc(o.x.id)}">Voltar</button><button class="btn sm bad" data-a="apagar" data-col="${o.c}" data-id="${esc(o.x.id)}">Apagar de vez</button></div>`).join('') : '<p class="muted">Vazia.</p>'}</section>`;
}
const VIEW_FN = {painel: vPainel, fila: vFila, horas: vHoras, compras: vCompras, estoque: vEstoque, calculadora: vCalc, receitas: vReceitas, config: vConfig};

function vLogin() {
  return `<div class="login"><img src="icon-192.png" alt=""><h2>Entra pra ver seus pedidos</h2>
    <p class="muted">Você entra uma vez com a conta Google. Depois o app abre mesmo sem internet.</p>
    <button class="btn pri" data-a="entrar">Entrar com Google</button></div>`;
}
function vSetup() {
  return `<div class="card"><h2>Falta ligar o Firebase</h2><p>Abre o arquivo <code>cfg.js</code> e cola o <code>firebaseConfig</code> do seu projeto. O passo a passo está no <code>README.md</code>.</p></div>`;
}

function renderNav() {
  $('#tabs').innerHTML = S.user ? VIEWS.map(([k, n]) => `<a href="#${k}" ${S.view === k ? 'aria-current="page"' : ''}>${n}</a>`).join('') : '';
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
  S.adiado = false; renderNav(); renderTimer();
  const m = $('#app');
  if (S.setup) { m.innerHTML = vSetup(); return; }
  if (S.user === null) { m.innerHTML = '<div class="empty">Carregando…</div>'; return; }
  if (S.user === false) { m.innerHTML = vLogin(); return; }
  m.innerHTML = VIEW_FN[S.view]();
}
let rq = false;
function agenda() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); }
function rota() { const h = (location.hash || '').slice(1); S.view = VIEW_FN[h] ? h : 'painel'; render(); window.scrollTo(0, 0); }
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
    novaReceita: () => formReceita(), editReceita: () => formReceita(id),
    timerStart: () => timerStart(id), timerStop: () => timerStop(true), timerCancel: () => confirmar('Descartar cronômetro?', 'O tempo contado até agora não vai ser lançado.', 'Descartar', () => timerStop(false)),
    timerDoModal: () => { const f = $('#mf'); const pid = f && f.pedidoId.value; fecharModal(); timerStart(pid); },
    timerDaTela: () => { const p = ativosOrd().find(x => x.status === 'Fazendo') || ativosOrd()[0]; abrirModal('Começar cronômetro', campo('pedidoId', 'Em qual peça', selPedido('pedidoId', p?.id, false)), {salvarTxt: 'Começar', onOk: d => { timerStart(d.pedidoId); }}); },
    subir: () => mover(id, -1), descer: () => mover(id, 1),
    ciclarSit: () => { const x = S.estoque.find(y => y.id === id); if (x) mudar('estoque', id, {situacao: SIT[(SIT.indexOf(x.situacao) + 1) % SIT.length]}); },
    corNaLista: () => { const x = S.estoque.find(y => y.id === id); formCompra(null, {item: 'Novelo ' + (x?.cor || '').toLowerCase(), tipo: 'Novelo', cor: x?.cor, qtd: 1, precoUn: C().precoNovelo, pedidoId: ''}); },
    excluir: () => { const col = b.dataset.col; fecharModal(); mudar(col, id, {lixo: true, lixoEm: agora()}, 'Foi pra Lixeira (dá pra voltar na Config)'); },
    desfazer: () => mudar(b.dataset.col, id, {lixo: false}, 'Voltou'),
    apagar: () => confirmar('Apagar de vez?', 'Isso não tem volta. Se quiser guardar, baixa um backup antes.', 'Apagar de vez', () => grava(deleteDoc(ref(b.dataset.col, id)), 'Apagado')),
    backup, planilha, restaurar: () => $('#arquivoBackup').click()
  }[a] || (() => {}))();
});
$('#sair').addEventListener('click', () => confirmar('Sair da conta?', 'Neste aparelho você vai precisar entrar de novo, com internet.', 'Sair', () => signOut(S.auth)));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').hidden) fecharModal();
  if (e.key === 'Enter' && e.target.matches('h3[data-a]')) e.target.click();
});
document.addEventListener('change', e => {
  const t = e.target, c = t.dataset.c, id = t.dataset.id;
  if (c === 'status') { const p = ped(id); const patch = {status: t.value}; if (t.value === 'Entregue' && p && !p.entregueEm) patch.entregueEm = hoje(); mudar('pedidos', id, patch, t.value === 'Entregue' ? 'Entregue!' : ''); }
  else if (c === 'pago') mudar('pedidos', id, {pago: t.checked}, t.checked ? 'Marcado como pago' : '');
  else if (c === 'comprado') mudar('compras', id, {comprado: t.checked, compradoEm: t.checked ? hoje() : ''});
});
document.addEventListener('toggle', e => { const t = e.target.dataset && e.target.dataset.t; if (t) S[t] = e.target.open; }, true);
document.addEventListener('input', e => {
  if (e.target.closest('#mf') && modalInput) modalInput($('#mf'));
  const id = e.target.id;
  if (id === 'cHoras' || id === 'cNov' || id === 'cOut') { S.calc[{cHoras: 'horas', cNov: 'novelos', cOut: 'outros'}[id]] = e.target.value; $('#calcRes').innerHTML = calcRes(); }
});
document.addEventListener('focusout', () => { setTimeout(() => { if (S.adiado && $('#modal').hidden && !($('#app').contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) render(); }, 0); });
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'mf') { const d = fd(e.target); const cb = modalOk; if (cb && cb(d) !== false) fecharModal(); }
  else if (e.target.id === 'cfgForm') {
    const d = fd(e.target);
    document.activeElement && document.activeElement.blur();
    mudarMeta('config', {valorHora: num(d.valorHora, 13), precoNovelo: num(d.precoNovelo, 20), miudezas: num(d.miudezas, 0), descontoFamilia: num(d.descontoFamilia, 0) / 100, metaNatal: num(d.metaNatal)}, 'Config salva');
  }
});

function baixar(nome, data, tipo) {
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
  add('Fila', [['Ordem', 'Peça', 'Cliente', 'Tipo', 'Status', 'Prazo', 'Horas est.', 'Horas feitas', 'Restam (h)', 'Sugerido', 'Preço', 'Sinal', 'Pago', 'A receber', 'Lucro', 'R$/h real', 'Contato', 'Pedido em', 'Entregue em'],
    ...todos.map(p => { const c = calcP(p), i = at.indexOf(p); return [i >= 0 ? i + 1 : '', p.nome, p.cliente, p.tipo, p.status, p.prazo, p.horasEst, c.f, c.restam, c.sug, p.preco, p.sinal, p.pago ? 'Sim' : 'Não', c.aReceber, c.lucro, c.rph == null ? '' : Math.round(c.rph * 100) / 100, p.contato, p.pedidoEm, p.entregueEm]; })]);
  add('Horas', [['Data', 'Peça', 'Horas', 'Início', 'Fim'], ...vivos('horas').sort((a, b) => a.data.localeCompare(b.data)).map(h => [h.data, nomePed(h.pedidoId), h.horas, h.inicio, h.fim])]);
  add('Compras', [['Item', 'Tipo', 'Cor', 'Qtd', 'Preço un.', 'Total', 'Pra', 'Onde', 'Comprado'], ...vivos('compras').map(c => [c.item, c.tipo, c.cor, c.qtd, c.precoUn, c.qtd * c.precoUn, nomePed(c.pedidoId), c.onde, c.comprado ? 'Sim' : 'Não'])]);
  add('Estoque', [['Cor', 'Situação'], ...vivos('estoque').map(e => [e.cor, e.situacao])]);
  add('Receitas', [['Personagem', 'Fonte', 'Autor', 'Altura (cm)', 'Arquivo'], ...vivos('receitas').map(r => [r.personagem, r.fonte, r.autor, r.altura, r.arquivo])]);
  const cf = C(); add('Config', [['Parâmetro', 'Valor'], ['Valor da hora', cf.valorHora], ['Preço do novelo', cf.precoNovelo], ['Miudezas por boneco', cf.miudezas], ['Desconto família', cf.descontoFamilia], ['Meta do Natal', cf.metaNatal]]);
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
  subs.push(onSnapshot(metaRef('timer'), s => { S.timer = s.exists() ? s.data() : null; agenda(); }));
}

function init() {
  rota();
  if (!cfg || !cfg.apiKey) { S.setup = true; render(); return; }
  const app = initializeApp(cfg);
  S.auth = getAuth(app);
  S.fs = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})});
  getRedirectResult(S.auth).catch(() => {});
  onAuthStateChanged(S.auth, u => { S.user = u || false; ligar(u); render(); });
}
init();
